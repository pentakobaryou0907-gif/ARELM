"""
マルチエージェント化 第2段 — 背後で進める作業（並行実行）

JARVISと話している間も、時間のかかる指示（長い文章づくり等）を
裏で進められるようにする。ひとつの会話が止まっている間に、
別の作業を進めておける、という意味での「並行」。

実装は、キュー（順番待ちの列）＋ 常駐スレッド複数（既定2本）。
外部のジョブキューは使わない（この端末の中だけで完結させるため）。
一覧はファイルに保存し、サーバーが再起動しても直近の記録が残るようにする。

正直に書いておくこと：
  この端末のローカルLLM（Ollama）自体は、1台のモデルを使い回すため、
  実際の生成そのものが完全に同時進行するとは限らない（Ollama側の
  混み具合次第）。それでもワーカーを複数にしておく意味はある——
  1本のときは「前の作業が終わるまで、次の作業はキューに積まれた
  ままLLMへすら渡らない」状態だったが、複数にすることで、
  空いているワーカーがすぐ次の作業に取り掛かれる。
"""

import json
import os
import queue
import threading
import time
import uuid

import _import_fix  # noqa: F401  日本語ファイル名のimportがNFC/NFDの食い違いで失敗しないようにする
import ローカルLLM
import エージェント定義

_キュー = queue.Queue()
_ロック = threading.Lock()
_一覧 = {}

_ここ = os.path.dirname(os.path.abspath(__file__))
_保存先 = os.path.join(_ここ, '..', 'data', 'agent_tasks.json')

# 溜まりすぎないよう、記録として残すのは直近だけにする。
_保持件数 = 200

# 同時に処理するワーカーの本数。増やしすぎても、結局は
# ローカルLLM側で詰まるだけなので、控えめにしておく。
_ワーカー本数 = 2


def _読む():
    global _一覧
    try:
        with open(_保存先, 'r', encoding='utf-8') as f:
            データ = json.load(f)
        if isinstance(データ, list):
            _一覧 = {t['id']: t for t in データ if isinstance(t, dict) and t.get('id')}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        _一覧 = {}


def _書く():
    try:
        os.makedirs(os.path.dirname(_保存先), exist_ok=True)
        並び = sorted(_一覧.values(), key=lambda t: -t.get('作成', 0))[:_保持件数]
        with open(_保存先, 'w', encoding='utf-8') as f:
            json.dump(並び, f, ensure_ascii=False, indent=1)
    except OSError:
        pass


def 追加する(内容, agent=None):
    """作業をキューへ積む。すぐには実行せず、順番が来たら裏で処理する。"""
    id = uuid.uuid4().hex[:12]
    担当情報 = エージェント定義.エージェント情報(agent) if agent else None
    task = {
        'id': id,
        '内容': (内容 or '').strip(),
        'agent': 担当情報,
        '状態': '待機中',
        '作成': time.time(),
        '開始': None,
        '終了': None,
        '結果': None,
        'エラー': None,
    }
    with _ロック:
        _一覧[id] = task
        _書く()
    _キュー.put(id)
    return dict(task)


def 一覧を得る():
    with _ロック:
        return sorted((dict(t) for t in _一覧.values()), key=lambda t: -t.get('作成', 0))


def 取り消す(id):
    """待機中の作業だけ取り消せる。実行中・完了済みは取り消せない。"""
    with _ロック:
        task = _一覧.get(id)
        if not task:
            return {'ok': False, '訳': '見つかりません'}
        if task['状態'] != '待機中':
            return {'ok': False, '訳': f'すでに{task["状態"]}のため取り消せません'}
        task['状態'] = '取り消し済み'
        task['終了'] = time.time()
        _書く()
    return {'ok': True}


def やり直す(id):
    """失敗した作業を、もう一度キューへ積み直す。"""
    with _ロック:
        task = _一覧.get(id)
        if not task:
            return {'ok': False, '訳': '見つかりません'}
        if task['状態'] not in ('失敗', '取り消し済み'):
            return {'ok': False, '訳': f'{task["状態"]}のため、やり直しの対象ではありません'}
        task['状態'] = '待機中'
        task['開始'] = None
        task['終了'] = None
        task['結果'] = None
        task['エラー'] = None
        _書く()
    _キュー.put(id)
    return {'ok': True}


def 消す(id):
    """終わった（完了・失敗・取り消し済み）作業を、一覧から消す。"""
    with _ロック:
        task = _一覧.get(id)
        if not task:
            return {'ok': False, '訳': '見つかりません'}
        if task['状態'] in ('待機中', '実行中'):
            return {'ok': False, '訳': f'{task["状態"]}のため消せません（先に取り消してください）'}
        del _一覧[id]
        _書く()
    return {'ok': True}


def _処理する(task):
    指示 = task['内容']
    担当id = task.get('agent', {}).get('id') if task.get('agent') else None
    if 担当id:
        担当指示 = エージェント定義.エージェントの指示文(担当id)
        指示 = f'【担当】\n{担当指示}\n\n{指示}'
    if not ローカルLLM.使えるか():
        raise RuntimeError('ローカルLLM（Ollama）が動いていません')
    答え = ローカルLLM.聞く(指示, タイムアウト=180)
    if not 答え:
        raise RuntimeError('答えが得られませんでした')
    return 答え


def _ワーカー():
    while True:
        id = _キュー.get()
        with _ロック:
            task = _一覧.get(id)
            # キューに積まれたあと取り消された分は、ここで静かに飛ばす。
            if not task or task['状態'] != '待機中':
                continue
            task['状態'] = '実行中'
            task['開始'] = time.time()
            _書く()
        try:
            結果 = _処理する(task)
            with _ロック:
                task['結果'] = 結果
                task['状態'] = '完了'
        except Exception as e:  # noqa: BLE001 — 何が起きても、記録して次へ進む
            with _ロック:
                task['エラー'] = str(e)
                task['状態'] = '失敗'
        with _ロック:
            task['終了'] = time.time()
            _書く()


_起動済み = False


def 起動する():
    """サーバー起動時に一度だけ呼ぶ。常駐スレッドを複数立てる。"""
    global _起動済み
    if _起動済み:
        return
    _起動済み = True
    _読む()
    # 前回の「実行中」のまま終わっている記録は、
    # サーバーが再起動した時点で止まったとみなし、失敗として片付ける。
    with _ロック:
        for t in _一覧.values():
            if t.get('状態') in ('待機中', '実行中'):
                t['状態'] = '失敗'
                t['エラー'] = 'サーバーの再起動で中断されました'
                t['終了'] = time.time()
        _書く()
    for _ in range(_ワーカー本数):
        threading.Thread(target=_ワーカー, daemon=True).start()
