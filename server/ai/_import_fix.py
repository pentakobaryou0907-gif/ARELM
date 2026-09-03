"""
日本語ファイル名のモジュールが読み込めなくなる問題への対処。

このディレクトリには「自分で覚える.py」のように濁点・半濁点を含む
日本語名のモジュールが並んでいる。ソースコード中の `import 自分で覚える`
という文字列は正規化形式NFC（見た目通りの1文字）で書かれているが、
このリポジトリが置かれている環境（macOS）では、ファイルを新規作成した
時点でファイル名がNFD（濁点などを組み合わせ文字に分解した形）として
ディスクに保存されることがある。

NFCとNFDは目で見ても、`ls` で表示しても、git上でも同じ文字列に見えるが、
バイト列としては別物のため、Pythonの標準のインポート機構（ディレクトリの
中身を読み取って名前をバイト単位で突き合わせる）はこれを別名だと判断し、
実在するのに `ModuleNotFoundError` になる。

ここでは、通常のインポートが失敗したときだけ働く「保険」のインポータを
sys.meta_path の末尾に追加する。同じディレクトリ内のファイル名をNFCに
正規化して比較し直し、一致するものが見つかればそれを読み込む。
通常の解決で見つかる場合はここまで来ないので、既存の動きには影響しない。

使い方: 日本語名のモジュールを import する前に、一度
    import _import_fix
とするだけでよい（何度importしても安全）。
"""

import importlib.abc
import importlib.util
import os
import sys
import unicodedata

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))


class _NormalizedNameFinder(importlib.abc.MetaPathFinder):
    """標準のFileFinderで見つからなかった時だけ、Unicode正規化して探し直す。"""

    def __init__(self, search_dir):
        self.search_dir = search_dir

    def find_spec(self, fullname, path=None, target=None):
        if '.' in fullname:
            return None  # パッケージ内のサブモジュールは対象外
        try:
            entries = os.listdir(self.search_dir)
        except OSError:
            return None

        target_nfc = unicodedata.normalize('NFC', fullname)
        for entry in entries:
            base, ext = os.path.splitext(entry)
            if ext != '.py':
                continue
            if unicodedata.normalize('NFC', base) == target_nfc:
                full_path = os.path.join(self.search_dir, entry)
                return importlib.util.spec_from_file_location(fullname, full_path)
        return None


def install(search_dir=None):
    search_dir = search_dir or _THIS_DIR
    for finder in sys.meta_path:
        if isinstance(finder, _NormalizedNameFinder) and finder.search_dir == search_dir:
            return  # 既に入れてある
    sys.meta_path.append(_NormalizedNameFinder(search_dir))


install()
