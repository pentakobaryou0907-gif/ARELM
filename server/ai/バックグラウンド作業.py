"""
マルチエージェント化 第2段 — 背後で進める作業（並行実行）

JARVISと話している間も、時間のかかる指示（長い文章づくり等）を
裏で進められるようにする。ひとつの会話が止まっている間に、
別の作業を進めておける、という意味での「並行」。

実装は、キュー（順番待ちの列）＋ 常駐スレッドひとつ。
外部のジョブキューは使わない（この端末の中だけで完結させるため）。
一覧はファイルに保存し、サーバーが再起動しても直近の記録が残るようにする。
"""

import json
import os
import queue
import threading
import time
import uuid

import ローカルLLM
import エージェント定義

_キュー = queue.Queue()
_ロック = threading.Lock()
_一覧 = {}

_ここ = os.path.dirname(os.path.abspath(__file__))
_保存先 = os.path.join(_ここ, '..', 'data', 'agent_tasks.json')

# 溜まりすぎないよう、記録として残すのは直近だけにする。
_保持件数 = 200


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
        if not task:
            continue
        task['状態'] = '実行中'
        task['開始'] = time.time()
        with _ロック:
            _書く()
        try:
            結果 = _処理する(task)
            task['結果'] = 結果
            task['状態'] = '完了'
        except Exception as e:  # noqa: BLE001 — 何が起きても、記録して次へ進む
            task['エラー'] = str(e)
            task['状態'] = '失敗'
        task['終了'] = time.time()
        with _ロック:
            _書く()


_起動済み = False


def 起動する():
    """サーバー起動時に一度だけ呼ぶ。常駐スレッドを立てる。"""
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
    t = threading.Thread(target=_ワーカー, daemon=True)
    t.start()
