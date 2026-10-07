# -*- coding: utf-8 -*-
"""
JSONを、壊れないように書く（一時ファイルに書いてから、差し替える）

なぜこれが要るのか:
    学習モデル・知識・意味モデルの保存は、どれも「固定の名前の一時ファイルに書いてから差し替える」
    作りだった。ところが、意味モデルは、「忘れて」の処理の中と、30秒ごとの裏の保存の、
    別々の鍵の下で、同じ一時ファイルに書いていた。片方が一時ファイルを差し替えた直後に、
    もう片方が同じファイルを差し替えようとして「ファイルが無い」で失敗し、
    「忘れて」が500エラーで終わっていた（忘れた言葉は一部だけ消え、保存は失敗する）。

ここでの決まり:
    ・保存先ごとに鍵を一つ持ち、同じ保存先への書き込みは、一つずつ行う
    ・一時ファイルは、毎回違う名前にする（鍵を迂回されても、ぶつからない）
    ・書き込みに失敗したら、一時ファイルを残さず、元のファイルはそのまま
    ・元のファイルの権限を引き継ぐ

外部へは一切問い合わせない。
"""

import json
import os
import tempfile
import threading

_鍵たち = {}
_鍵の鍵 = threading.Lock()


def _鍵(保存先):
    with _鍵の鍵:
        return _鍵たち.setdefault(os.path.abspath(保存先), threading.Lock())


def 書く(保存先, データ, **json_引数):
    """
    データをJSONとして、保存先へ書く。途中で失敗しても、保存先の元の中身は壊れない。
    @return True
    """
    保存先 = os.path.abspath(保存先)
    場所 = os.path.dirname(保存先)
    os.makedirs(場所, exist_ok=True)

    with _鍵(保存先):
        fd, 一時 = tempfile.mkstemp(prefix=os.path.basename(保存先) + '.', suffix='.tmp', dir=場所)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(データ, f, ensure_ascii=False, **json_引数)
            try:
                os.chmod(一時, os.stat(保存先).st_mode & 0o777)
            except FileNotFoundError:
                os.chmod(一時, 0o644)
            os.replace(一時, 保存先)
        except BaseException:
            try:
                os.unlink(一時)
            except OSError:
                pass
            raise
    return True
