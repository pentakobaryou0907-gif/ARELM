# -*- coding: utf-8 -*-
"""
永久の記憶 — 捨てる前に、必ずここへ移す

なぜこれが要るのか:
    このツールの中のAIは、記録や記憶を、いくつもの場所に持っている
    （会話・ブランドの記録・自分を良くした記録・失敗の記録・学習の点数…）。
    どれも、増えすぎると画面やファイルが重くなるため、
    「直近の200件だけ」のように、古いものから捨てる作りになっていた。
    会話は、間が空くと「続きではない」として始めからになり、
    忘れる操作は、跡形なく消していた。
    これでは、「永遠に覚える」とは言えない。

ここでやること:
    ・捨てる直前の記録を、追記専用のファイル（JSON Lines）に必ず移す。
      本体の記録は、これまでどおり軽く保つ。古いものは、ここで残る。
    ・会話は、すべて残す。
    ・忘れる操作の前に、忘れる対象を残す（「消さない」決まりと同じ考え方）。
    ・このファイルは、書き足すだけ。書き換えも、消しもしない。
    ・バックアップ（server/バックアップ.js）にも入る。

守っていること:
    ・クレジットカード番号・マイナンバーらしき数列・APIキーなどは、
      残す前に伏せる（rules.py が学習させないと決めているものと同じ）。
    ・外へは一切送らない。この端末の中のファイルに書くだけ。
    ・書けなくても、元の処理は止めない（記憶の記録のせいで、AIが動かなくなっては困る）。
"""

import json
import os
import re
import shutil
import time

_既定の置き場 = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', '永久の記憶')

# 1件の大きさの上限。写真のデータなどで、1行が巨大にならないようにする。
_1件の上限 = 200_000

_伏せる = [
    (re.compile(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'), '【カード番号らしき数列を伏せました】'),
    (re.compile(r'\b\d{12}\b'), '【番号らしき数列を伏せました】'),
    (re.compile(r'\b(sk|pk|ghp|gsk)_[A-Za-z0-9]{16,}\b'), '【APIキーらしき文字列を伏せました】'),
    (re.compile(r'\bAIza[0-9A-Za-z_-]{30,}\b'), '【APIキーらしき文字列を伏せました】'),
]


def 置き場():
    return os.environ.get('ARELM_MEMORY_DIR') or _既定の置き場


def _ファイル名(分類):
    名 = re.sub(r'[^\w぀-ヿ一-鿿-]', '_', str(分類 or '無題'))[:60]
    return 名 or '無題'


def 伏せる(文):
    for パターン, 代わり in _伏せる:
        文 = パターン.sub(代わり, 文)
    return 文


def 残す(分類, 中身, 理由=''):
    """1件、追記する。失敗しても例外は出さない。成功したかを返す。"""
    try:
        行 = json.dumps(
            {'とき': time.strftime('%Y-%m-%dT%H:%M:%S%z'), '分類': 分類, '理由': 理由, '中身': 中身},
            ensure_ascii=False)
        行 = 伏せる(行)
        if len(行) > _1件の上限:
            行 = json.dumps(
                {'とき': time.strftime('%Y-%m-%dT%H:%M:%S%z'), '分類': 分類, '理由': 理由,
                 '切れた': True, '中身': 行[:_1件の上限]}, ensure_ascii=False)
        os.makedirs(置き場(), exist_ok=True)
        with open(os.path.join(置き場(), _ファイル名(分類) + '.jsonl'), 'a', encoding='utf-8') as f:
            f.write(行 + '\n')
        return True
    except Exception as e:  # noqa: BLE001
        print(f'[永久の記憶] 残せませんでした（{分類}）: {e}')
        return False


def 切り詰める(分類, 一覧, 残す件数):
    """
    一覧を新しい側の N 件に切り詰め、外れた古い側は、永久の記憶へ移す。
    （以前は `一覧[-N:]` で、外れた分がそのまま消えていた。）
    """
    if 残す件数 <= 0 or len(一覧) <= 残す件数:
        return 一覧
    外れた = 一覧[:-残す件数]
    for x in 外れた:
        残す(分類, x, '件数の上限を超えたため、本体の記録から外れた')
    return 一覧[-残す件数:]


def 会話を残す(session_id, 発言, 結果):
    """会話のやり取りを、すべて残す。"""
    答え = ''
    技能 = None
    確かさ = None
    if isinstance(結果, dict):
        答え = str(結果.get('answer') or '')[:3000]
        技能 = 結果.get('skill')
        確かさ = 結果.get('certainty')
    return 残す('会話', {'会話': session_id or 'default', 'あなた': 発言, '私': 答え, '技能': 技能, '確かさ': 確かさ})


def ファイルを写して残す(名前, 元のファイル):
    """忘れる前の状態を、ファイルごと残す（大きな操作の前に使う）。"""
    try:
        if not os.path.exists(元のファイル):
            return False
        os.makedirs(os.path.join(置き場(), '忘れる前の写し'), exist_ok=True)
        先 = os.path.join(置き場(), '忘れる前の写し', f'{time.strftime("%Y%m%d_%H%M%S")}_{_ファイル名(名前)}{os.path.splitext(元のファイル)[1]}')
        shutil.copy2(元のファイル, 先)
        return True
    except Exception as e:  # noqa: BLE001
        print(f'[永久の記憶] 写せませんでした（{名前}）: {e}')
        return False
