"""
日本語ファイル名を、合成済み(NFC)の並びに揃える。

なぜ要るのか:

  server/ai の中には `import 自分で覚える` のように、日本語名の
  モジュールをそのまま import しているファイルがある（server.py・
  test_ai.py など）。Pythonの import は、そのファイル名のバイト列が
  完全に一致しないと見つけられない。

  ところがこのフォルダは Syncthing で Mac⇄Windows と同期されており
  （.stignore で server/data/ 等は除いているが、server/ai/ 自体は
  同期対象）、同期のたびに日本語ファイル名が分解済み(NFD)の並びに
  戻ってしまうことが実際にあった。見た目は同じでも、Pythonからは
  「無い」ことになり、`ModuleNotFoundError` で自作AIエンジンが
  起動できない・自動テストが失敗する、という形で表面化する。

  gitはこの違いを気にしない（core.precomposeunicode=true でNFC扱いに
  しているため）。だから git のほうを見ても気づけない。
  Python側の入口（server.py・test_ai.py）で、使う直前に直しておくのが
  確実。このファイル自身はSyncthingで壊れようがない英字名にしてある
  （直す側が壊れていては直せないため）。
"""

import os
import unicodedata


def 日本語ファイル名をNFCに直す(対象フォルダ=None):
    ここ = 対象フォルダ or os.path.dirname(os.path.abspath(__file__))
    try:
        実際にある = os.listdir(ここ)
    except OSError:
        return

    # os.path.exists() はこのファイルシステム上、正規化の違いを
    # 無視して「同じものがある」と答えてしまう（今まさにこの関数が
    # 直そうとしている食い違いそのものを、確認に使えない）。
    # 必ず os.listdir() で得た、実際のバイト列の集合と比べる。
    実際にあるバイト列の集合 = set(実際にある)

    for 名前 in 実際にある:
        if not any(ord(c) > 127 for c in 名前):
            continue
        合成形 = unicodedata.normalize('NFC', 名前)
        if 名前 == 合成形:
            continue
        if 合成形 in 実際にあるバイト列の集合:
            continue  # 合成形のファイルが別に実在する場合は、勝手に上書きしない
        元 = os.path.join(ここ, 名前)
        先 = os.path.join(ここ, 合成形)
        一時 = os.path.join(ここ, f'__nfc_fix_tmp_{os.getpid()}__')
        try:
            os.rename(元, 一時)
            os.rename(一時, 先)
            print(f'[nfc_fix] ファイル名をNFCに直しました: {名前!r} -> {合成形!r}')
        except OSError as e:
            print(f'[nfc_fix] ファイル名を直せませんでした（{名前!r}）: {e}')
