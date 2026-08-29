# -*- coding: utf-8 -*-
"""
戻り防止（一度できたことが、できなくなるのを防ぐ）

なぜこれが要るのか:
    直したはずのことが、別の直しをきっかけに壊れる、
    ということが繰り返し起きた。

    実際に起きたもの:
      ・会話が続くようにした → 画面側が会話の目印を送っておらず途切れた
      ・技能を足した       → 「在庫は？」に答えず実行しようとした
      ・資料を学ばせた     → 学習に5秒かかり、返事が来なくなった
      ・断る力を付けた     → 「教えて」を含む質問が技能に横取りされた

    どれも、その場では気づけなかった。
    人が毎回すべてを試すのは無理なので、機械に見張らせる。

ここでやること:
    「一度できるようになったこと」を一つずつ書き出し、
    毎回それが今も動くかを確かめる。
    一つでも動かなくなったら、はっきり知らせる。

ここに並べるのは、実際に直したものだけにしてある。
作っていないものを並べると、できないことを
できるかのように見せてしまうため。

外部へは一切問い合わせない。すべてこの端末の中で完結する。
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from chat_engine import ChatEngine       # noqa: E402
from learner import OnlineLearner        # noqa: E402
from semantics import SemanticModel      # noqa: E402
import tone                              # noqa: E402
import skills                            # noqa: E402

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')


def _会話を作る():
    learner = OnlineLearner(os.path.join(DATA_DIR, 'ai_model.json'))
    learner.load()
    semantic = SemanticModel()
    semantic.load(os.path.join(DATA_DIR, 'ai_semantics.json'))
    semantic.build()
    return ChatEngine(learner=learner, knowledge=None, semantic=semantic)


def 確かめる():
    """
    一度できたことが、今も動くかを確かめる。

    @return (できたもの, 壊れたもの) の組。
            壊れたものには、いつ直したかと過去の壊れ方を添える。
    """
    ce = _会話を作る()
    番号 = [0]

    def 聞く(text, 会話=None):
        番号[0] += 1
        sid = 会話 or f'戻り防止-{番号[0]}'
        r = ce.respond(text, {'session_id': sid})
        return (r or {}), ((r or {}).get('answer') or '')

    項目 = []

    # ---------- 1. 必ず何かを返す ----------
    def 空を返さない():
        for q in ['フランスの首都はどこ', 'あああ', '在庫', 'テスト']:
            r, a = 聞く(q)
            if not a:
                return False, f'「{q}」に何も返しませんでした'
        return True, ''

    項目.append(('必ず何かを返す', '2026-08-20',
                 '使い方に無い質問で、答えが空のまま画面に届いていた',
                 空を返さない))

    # ---------- 2. 知らないことは知らないと言う ----------
    def 嘘をつかない():
        for q in ['明日の天気を教えて', '今日のニュースは', '来週の株価を教えて']:
            r, a = 聞く(q)
            if '分かりません' not in a and 'わかりません' not in a:
                return False, f'「{q}」に、知らないはずのことを答えました: {a[:40]}'
        return True, ''

    項目.append(('知らないことは知らないと言う', '2026-08-19',
                 '「教えて」を含む質問が技能に横取りされ、断れなくなった',
                 嘘をつかない))

    # ---------- 3. 質問には答え、依頼は実行する ----------
    def 質問と依頼を取り違えない():
        r, a = 聞く('在庫は？')
        if '実行します' in a:
            return False, f'質問なのに実行しようとしました: {a[:40]}'
        r, a = 聞く('タスク サンプル発注')
        if not r.get('action'):
            return False, f'依頼なのに実行になりませんでした: {a[:40]}'
        return True, ''

    項目.append(('質問と依頼を取り違えない', '2026-08-19',
                 '技能を足したとき、「在庫は？」に答えず実行しようとした',
                 質問と依頼を取り違えない))

    # ---------- 4. 会話が続く ----------
    def 会話が続く():
        会話 = '戻り防止-会話'
        r, a = 聞く('商品を登録したい', 会話)
        if not r.get('waiting'):
            return False, f'聞き返しませんでした: {a[:40]}'
        r, a = 聞く('黒パーカー', 会話)
        if not r.get('waiting'):
            return False, f'2つ目を聞き返しませんでした: {a[:40]}'
        r, a = 聞く('パーカー', 会話)
        r, a = 聞く('7800円', 会話)
        params = r.get('params') or {}
        if params.get('name') != '黒パーカー':
            return False, f'答えた内容が正しく残りませんでした: {params}'
        return True, ''

    項目.append(('会話が続く', '2026-08-19',
                 '画面側が会話の目印を送っておらず、毎回「初対面」になっていた',
                 会話が続く))

    # ---------- 5. 挨拶に応える ----------
    def 雑談ができる():
        r, a = 聞く('こんにちは')
        if 'こんにちは' not in a:
            return False, f'挨拶に応えませんでした: {a[:40]}'
        r, a = 聞く('元気？')
        if '元気です' in a:
            return False, '持っていない体調について、あるかのように答えました'
        return True, ''

    項目.append(('挨拶に応える／嘘の元気を言わない', '2026-08-20',
                 '「こんにちは」に「分かりません」と返していた',
                 雑談ができる))

    # ---------- 6. 記号から調子を読む ----------
    def 調子を読む():
        t = tone.read('まだ動かない！！')
        if t['種類'] != 'point' or t['強さ'] < 0.4:
            return False, f'強い指摘として読めませんでした: {t}'
        if '困っている' not in t['気持ち']:
            return False, f'困っていることを読めませんでした: {t["気持ち"]}'
        t2 = tone.read('在庫は？')
        if t2['種類'] != 'question':
            return False, f'質問として読めませんでした: {t2}'
        return True, ''

    項目.append(('「？」「！」から調子を読む', '2026-08-20',
                 '記号を捨てていたため、指摘と質問の区別がつかなかった',
                 調子を読む))

    # ---------- 7. できることを説明できる ----------
    def 能力を説明できる():
        r, a = 聞く('何ができるの')
        if len(a) < 100 or '・' not in a:
            return False, f'できることを並べられませんでした: {a[:40]}'
        return True, ''

    項目.append(('自分にできることを説明できる', '2026-08-19',
                 '「何ができるの」に何も返さなかった',
                 能力を説明できる))

    # ---------- 段取り ----------

    def 段取りは頼まれたときだけ():
        """
        まとめての作業は、頼まれたときだけ組む。

        過去の壊れ方:
            段取りを入れた当初、「新商品ってどう出すの」という
            ただの質問にも段取りを返していた。
            聞いただけなのに六つの作業が始まるのは、押しつけになる。
        """
        import 段取り as D

        型, c = D.find_plan('新商品を出す準備をして')
        if not 型 or c < 0.55:
            return False, '頼まれても段取りだと分からなくなっています'
        if not D.頼まれているか('新商品を出す準備をして'):
            return False, '依頼を依頼だと見なくなっています'
        if D.頼まれているか('新商品ってどう出すの'):
            return False, '質問を依頼として受け取っています'
        if D.頼まれているか('在庫を整えますか'):
            return False, '問いかけを依頼として受け取っています'
        if not D.頼まれているか('在庫を整えて'):
            return False, '「〜て」で終わる依頼を受け取れなくなっています'
        return True, ''

    def 段取りは見せてから動く():
        """
        段取りは、見せてから動く。

        過去の壊れ方:
            見せた段階で run を付けていたら、
            言い間違いがそのまま複数の作業になっていた。
            まとめて動くものほど、戻すのが大変なので、
            必ず一度見せて、返事をもらってから動かす。
        """
        E = ChatEngine()
        ctx = {'session_id': '戻り防止_段取り'}

        見せた = E.respond('新商品を出す準備をして', dict(ctx))
        if not 見せた.get('plan'):
            return False, '段取りを返さなくなっています'
        if 見せた.get('run'):
            return False, '見せた段階で動き出すようになっています'

        動く = E.respond('実行して', dict(ctx))
        if not 動く.get('run'):
            return False, '「実行して」と言っても動かなくなっています'

        # やめると言われたら、やめる
        E.respond('在庫を整えて', dict(ctx))
        やめ = E.respond('やっぱりやめて', dict(ctx))
        if やめ.get('run'):
            return False, 'やめてと言われても動こうとしています'
        return True, ''

    def 段取りの手はすべて実在する():
        """
        段取りに並べる作業は、すべて実際に動くものにする。

        過去の壊れ方:
            並べるだけなら何でも書けてしまう。
            動かない作業を並べたら、
            「やります」と言って何も起きないことになる。
            それが、このツールで一番避けたい状態。
        """
        import 段取り as D
        ある = {s.action for s in skills.SKILLS} | {s.name for s in skills.SKILLS}

        for 型 in D.段取りたち:
            for 手 in 型.作る('「試し」の準備をして'):
                if 手.作業 not in ある:
                    return False, f'{型.label} に、実在しない作業「{手.作業}」が入っています'
        return True, ''

    項目.append(('段取りは頼まれたときだけ組む', '2026-08-20',
                 'ただの質問にも段取りを返していた',
                 段取りは頼まれたときだけ))
    項目.append(('段取りは見せてから動く', '2026-08-20',
                 '見せた段階で動き出すと、言い間違いがそのまま作業になる',
                 段取りは見せてから動く))
    項目.append(('段取りの手はすべて実在する', '2026-08-20',
                 '動かない作業を並べると「やります」と言って何も起きない',
                 段取りの手はすべて実在する))

    # ---------- キャッチボール ----------

    def 答えの形を確かめる():
        """
        項目の形に合わない答えは、受け取らない。

        過去の壊れ方:
            聞き返している間、何を言っても答えとして受け取っていた。
            そのため「さっきの商品を教えて」が値段の欄に入り、
            そのまま商品として登録されようとしていた。
            後から直すより、受け取る前に断るほうが軽い。
        """
        E = ChatEngine()
        ctx = {'session_id': '戻り防止_形'}

        E.respond('商品を登録したい', dict(ctx))
        E.respond('オーバーサイズT', dict(ctx))
        E.respond('Tシャツ', dict(ctx))
        r = E.respond('ぜんぶよろしく', dict(ctx))      # 値段の欄に文章

        if r.get('action') == 'add_product':
            return False, '数でない答えを値段として受け取り、実行しています'

        r2 = E.respond('3500円', dict(ctx))
        if r2.get('action') != 'add_product':
            return False, '正しい値段を入れても実行になりません'
        if '3500' not in str(r2.get('params', {}).get('price', '')):
            return False, f'値段が入っていません: {r2.get("params")}'
        return True, ''

    def 中断しても続きから戻れる():
        """
        途中で別の話に移っても、元の作業に戻れる。

        過去の壊れ方:
            聞き返しの最中に別のことを聞くと、
            そこまで集めた中身が消えて最初からになっていた。
            答えたことが消えるのは、いちばん腹が立つ壊れ方。

            脇に置く仕組みを入れたあとも、
            置いた直後の同じ発言で「別の作業だ」と判断して
            すぐ手放していた。置いた瞬間に捨てては意味がない。
        """
        E = ChatEngine()
        ctx = {'session_id': '戻り防止_中断'}

        E.respond('商品を登録したい', dict(ctx))
        E.respond('オーバーサイズT', dict(ctx))
        E.respond('Tシャツ', dict(ctx))

        # 別の話に移る
        E.respond('いま何かある？', dict(ctx))

        会話 = E.会話たち.get('戻り防止_中断')
        if not 会話.脇に置いた:
            return False, '別の話に移ったとき、元の作業を捨てています'

        戻り = E.respond('さっきの続き', dict(ctx))
        答え = 戻り.get('answer', '')
        if 'オーバーサイズT' not in 答え:
            return False, f'戻れましたが、集めた中身が消えています: {答え[:60]}'

        r = E.respond('3500円', dict(ctx))
        if r.get('action') != 'add_product':
            return False, '戻ったあと、実行まで進めません'
        if r.get('params', {}).get('name') != 'オーバーサイズT':
            return False, f'中身が入れ替わっています: {r.get("params")}'
        return True, ''

    項目.append(('答えの形を確かめる', '2026-08-21',
                 '「さっきの商品を教えて」が値段として登録されかけた',
                 答えの形を確かめる))
    項目.append(('中断しても続きから戻れる', '2026-08-21',
                 '別の話に移ると、集めた中身が消えて最初からになっていた',
                 中断しても続きから戻れる))

    # ---------- 実行 ----------
    できた, 壊れた = [], []
    for 名前, いつ, 壊れ方, 試す in 項目:
        try:
            ok, 訳 = 試す()
        except Exception as e:
            ok, 訳 = False, f'途中で失敗しました: {e}'
        if ok:
            できた.append(名前)
        else:
            壊れた.append({'名前': 名前, 'いつ直したか': いつ,
                          '過去の壊れ方': 壊れ方, '今の症状': 訳})

    return できた, 壊れた


def 表示():
    できた, 壊れた = 確かめる()
    全 = len(できた) + len(壊れた)

    print('=' * 56)
    print(f' 戻り防止  {len(できた)}/{全} 件が今も動いています')
    print('=' * 56)
    for n in できた:
        print(f'  ○ {n}')
    for b in 壊れた:
        print(f'  × {b["名前"]}')
        print(f'      いま     : {b["今の症状"]}')
        print(f'      直した日 : {b["いつ直したか"]}')
        print(f'      前の壊れ方: {b["過去の壊れ方"]}')
    print()
    return len(壊れた) == 0


if __name__ == '__main__':
    sys.exit(0 if 表示() else 1)
