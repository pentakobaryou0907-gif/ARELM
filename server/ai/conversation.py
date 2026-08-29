# -*- coding: utf-8 -*-
"""
会話を続ける

なぜこれが要るのか:
    一度きりの受け答えしかできず、
    「商品を登録したい」と言われても、そこで話が終わっていた。
    人と話すときのように、足りないことを聞き返し、
    答えを受け取って先へ進める必要がある。

ここでやっていること:
    1. 直前までのやり取りを覚えておく
    2. 作業に足りない情報を、一つずつ聞き返す
    3. 返ってきた答えを埋めて、揃ったら実行する
    4. 「それ」「さっきの」のような言い方を、直前の話に結びつける

覚えている範囲:
    ひとつの会話につき直近20往復まで。
    それ以上さかのぼると、古い話に引きずられて
    かえって的外れになるため、あえて切っている。

    会話の中身はこの端末のメモリ上にだけ置き、
    ファイルにも外部にも出さない。
    覚えておいてほしいことは、メモとして明示的に残してもらう。
"""

import time

# ひとつの会話で覚えておく往復の数
記憶する往復数 = 20

# 誰も話しかけてこないまま、この秒数が過ぎたら会話を閉じる
# （前の話の続きだと勘違いされないようにするため）
会話が切れるまでの秒数 = 30 * 60

# 指示語。直前の話に結びつける手がかりになる。
指示語 = ['それ', 'これ', 'あれ', 'その', 'この', 'あの', 'さっき', '前の', '同じ']

# 「はい」に当たる言い方
肯定 = ['はい', 'うん', 'そう', 'お願い', 'やって', 'ok', 'オーケー', 'いいよ', 'よろしく']

# 「いいえ」に当たる言い方
否定 = ['いいえ', 'いや', 'ちがう', '違う', 'やめ', 'いらない', 'キャンセル', 'なし']


class 会話:
    """ひとつの会話ぶんの記憶"""

    def __init__(self, session_id):
        self.session_id = session_id
        self.履歴 = []          # [{'誰': 'あなた'|'私', '内容': str, 'とき': float}]
        self.待っていること = None  # {'skill': str, 'slots': {}, '次に聞くこと': (鍵, 聞き方)}
        self.最後の話題 = None    # 直前に扱ったもの（指示語の解決に使う）

        # 見せたまま、実行を待っている段取り。
        # 見せてすぐ動かさないのは、まとめて動くものほど
        # 間違えたときに戻すのが大変なため。
        self.待っている段取り = None
        self.出せる段取り = None

        # 途中で別の話に移ったときに、元の作業を置いておく場所。
        #
        # 聞き返している最中に別のことを聞かれると、
        # それまで集めた中身が消えて、最初からやり直しになっていた。
        # 脇に置いておけば、答えたあとで戻れる。
        self.脇に置いた = None

        # 置いたばかりかどうかの印。
        # 置いた瞬間に手放してしまうのを防ぐ。
        self.脇は今置いた = False
        self.最終時刻 = time.time()

    def 生きているか(self):
        return (time.time() - self.最終時刻) < 会話が切れるまでの秒数

    def 加える(self, 誰, 内容):
        self.履歴.append({'誰': 誰, '内容': 内容, 'とき': time.time()})
        if len(self.履歴) > 記憶する往復数 * 2:
            self.履歴 = self.履歴[-記憶する往復数 * 2:]
        self.最終時刻 = time.time()

    def 直前の発言(self, 誰='あなた'):
        for h in reversed(self.履歴[:-1] if self.履歴 else []):
            if h['誰'] == 誰:
                return h['内容']
        return None


class ConversationStore:
    """
    会話をまとめて持つ場所。

    会話ごとに分けているのは、
    別の端末や別のタブでの話が混ざらないようにするため。
    """

    def __init__(self):
        self._会話たち = {}

    def get(self, session_id):
        session_id = session_id or 'default'
        c = self._会話たち.get(session_id)
        if c and not c.生きているか():
            # 間が空きすぎた会話は、続きとみなさず始めからにする
            c = None
        if not c:
            c = 会話(session_id)
            self._会話たち[session_id] = c
        return c

    def clear(self, session_id=None):
        if session_id:
            self._会話たち.pop(session_id, None)
        else:
            self._会話たち.clear()

    def summary(self):
        return {
            '会話の数': len(self._会話たち),
            '生きている会話': sum(1 for c in self._会話たち.values() if c.生きているか()),
        }


def 肯定か(text):
    low = (text or '').strip().lower()
    if not low:
        return False
    return any(w in low for w in 肯定) and not any(w in low for w in 否定)


def 否定か(text):
    low = (text or '').strip().lower()
    return bool(low) and any(w in low for w in 否定)


def 指示語を含むか(text):
    low = (text or '')
    return any(w in low for w in 指示語)


def 前の話に結びつける(text, 会話体):
    """
    「それ」「さっきの」を、直前に扱ったものに置き換える。

    置き換えられないときは、そのまま返す。
    無理に推測して別のものに結びつけると、
    間違った作業をしてしまうため。
    """
    if not 指示語を含むか(text):
        return text, None
    if not 会話体.最後の話題:
        return text, None

    置換後 = text
    for w in 指示語:
        if w in 置換後:
            置換後 = 置換後.replace(w, 会話体.最後の話題, 1)
            break
    return 置換後, 会話体.最後の話題
