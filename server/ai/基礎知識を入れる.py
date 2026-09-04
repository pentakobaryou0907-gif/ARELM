# -*- coding: utf-8 -*-
"""
基礎知識を、この道具に入れる

なぜ分けて書いたのか:

    一度に入れて終わりにすると、
    あとで「何を入れたのか」が分からなくなる。

    書いたものをファイルとして残しておけば、
    間違いが見つかったときに、そこだけ直せる。
    <b>入れっぱなしにしない</b>ための作りにしてある。

何度実行しても、同じものが二重に入らないようにしてある。
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from knowledge import KnowledgeBase      # noqa: E402
from semantics import SemanticModel      # noqa: E402
import rules                              # noqa: E402

import _import_fix                        # noqa: E402,F401  日本語ファイル名のimportがNFC/NFDの食い違いで失敗しないようにする
import 基礎知識_会話                       # noqa: E402
import 基礎知識_アパレル                    # noqa: E402
import 基礎知識_経営                       # noqa: E402


def 入れる():
    D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')

    意味 = SemanticModel()
    意味.load(os.path.join(D, 'ai_semantics.json'))

    知識 = KnowledgeBase(os.path.join(D, 'ai_knowledge.json'), semantic=意味)

    すでに = {x['text'] for x in 知識.entries}

    足した = 0
    飛ばした = 0
    止められた = 0

    for もと in [基礎知識_会話, 基礎知識_アパレル, 基礎知識_経営]:
        名 = もと.__name__.replace('基礎知識_', '')
        件数 = 0
        for x in もと.知識にする():
            # 二重に入れない
            if x['text'] in すでに:
                飛ばした += 1
                continue

            # 決まりに反するものは入れない。
            # 自分で書いたものでも、必ず通す。
            # 「自分が書いたから大丈夫」は、いちばん危ない。
            見立て = rules.check(x['text'])
            if not 見立て['ok']:
                print(f"  止められました: {x['text'][:40]}… （{見立て.get('reason','')[:30]}）")
                止められた += 1
                continue

            知識.add(x['text'], source='manual', topic=x['topic'], note=x['note'])
            すでに.add(x['text'])
            足した += 1
            件数 += 1

        print(f"  {名}: {件数}件")

    知識.save()
    return {'足した': 足した, '飛ばした': 飛ばした, '止められた': 止められた,
            '全部': len(知識.entries)}


if __name__ == '__main__':
    print('=' * 48)
    print(' 基礎知識を入れる')
    print('=' * 48)
    r = 入れる()
    print()
    print(f"  足した: {r['足した']}件")
    if r['飛ばした']:
        print(f"  すでに入っていた: {r['飛ばした']}件")
    if r['止められた']:
        print(f"  決まりで止まった: {r['止められた']}件")
    print(f"  知識は全部で {r['全部']}件になりました")
    print()
