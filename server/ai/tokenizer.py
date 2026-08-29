"""
日本語テキストのトークナイザ（ゼロから実装）

MeCab等の外部形態素解析器を使わずに日本語を扱う。
日本語は単語の境界に空白が無いため、以下の方針を取る:

  1. 文字種（漢字・ひらがな・カタカナ・英数）が変わる位置で区切る
     → 「新作のデニムジャケット」→「新作」「の」「デニムジャケット」
  2. 漢字・カタカナの連続は N-gram にも分解する
     → 「デニムジャケット」→「デニ」「ニム」「ムジ」…
     これにより「デニム」で検索しても「デニムジャケット」が引ける
  3. ひらがなのみの短い語（助詞など）は検索の役に立たないので落とす

外部ライブラリは一切使用しない。
"""

import re
import unicodedata

# 検索の役に立たない語（助詞・助動詞・形式名詞など）
STOP_WORDS = {
    'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'ここ', 'そこ', 'あそこ',
    'こと', 'もの', 'ため', 'よう', 'そう', 'どう', 'ます', 'です', 'した',
    'して', 'する', 'ある', 'いる', 'なる', 'れる', 'られ', 'てい', 'から',
    'まで', 'など', 'ので', 'のに', 'たり', 'ながら', 'および', 'または',
    # 話題を示さない機能語。残すと本当の手がかりを数で上回ってしまう
    'について', 'における', 'によって', 'に対して', 'に関する', 'としての',
    'という', 'といった', 'ということ', 'のない', 'のある', 'できる',
    'された', 'される', 'により', 'による', 'ように', 'ことが', 'ものの',
    'しかし', 'そして', 'また', 'さらに', 'ただし', 'なお', 'つまり',
    'ています', 'ました', 'ません', 'であり', 'である', 'であっ',
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
    'was', 'one', 'our', 'out', 'has', 'him', 'his', 'how', 'its', 'may',
}

# 文字種の判定
_KANJI = re.compile(r'[一-鿿㐀-䶿]')
_HIRAGANA = re.compile(r'[ぁ-ゟ]')
_KATAKANA = re.compile(r'[ァ-ヿｦ-ﾟ]')
_ALNUM = re.compile(r'[0-9A-Za-z]')


def char_type(ch: str) -> str:
    """1文字の種類を返す。区切り位置の判定に使う。"""
    if _KANJI.match(ch):
        return 'kanji'
    if _KATAKANA.match(ch):
        return 'katakana'
    if _HIRAGANA.match(ch):
        return 'hiragana'
    if _ALNUM.match(ch):
        return 'alnum'
    return 'other'


def normalize(text: str) -> str:
    """全角英数を半角に、カタカナは全角に統一し、小文字化する。"""
    if not text:
        return ''
    text = unicodedata.normalize('NFKC', text)
    return text.lower()


def split_by_char_type(text: str):
    """文字種の変わり目で区切る。記号・空白は捨てる。"""
    chunks = []
    current = []
    current_type = None

    for ch in text:
        t = char_type(ch)
        if t == 'other':
            if current:
                chunks.append((''.join(current), current_type))
                current = []
                current_type = None
            continue
        if t != current_type and current:
            chunks.append((''.join(current), current_type))
            current = []
        current.append(ch)
        current_type = t

    if current:
        chunks.append((''.join(current), current_type))
    return chunks


# ひらがなの塊を切る手がかりになる語。
# 助詞・助動詞・接続表現は語と語の境目に現れるため、
# ここで切ると「せれることによりこの」のような切れ端から
# 実在する語を取り出せる。長いものから順に試す。
HIRAGANA_DELIMITERS = [
    'によって', 'について', 'における', 'ということ', 'として', 'による',
    'ことにより', 'により', 'ことが', 'ことで', 'ことは', 'ものが', 'ものを',
    'ですが', 'ますが', 'したが', 'だが', 'ので', 'のに', 'から', 'まで',
    'ため', 'など', 'また', 'そして', 'しかし', 'ながら', 'たり',
    'する', 'した', 'して', 'され', 'いる', 'ある', 'なる', 'れる',
    'この', 'その', 'あの', 'どの', 'こと', 'もの', 'よう',
    'は', 'が', 'を', 'に', 'へ', 'と', 'で', 'の', 'も', 'や', 'か',
]


def split_hiragana_run(chunk: str):
    """
    ひらがなの塊を、助詞などを手がかりに小さく切る。

    この実装は本格的な形態素解析をしないため、PDF等から取り出した文では
    「せれることによりこの」のような切れ端が1語になってしまう。
    助詞で切ることで、その中に埋もれた実在の語を取り出せるようにする。
    """
    if len(chunk) <= 2:
        return []

    pieces = [chunk]
    for d in HIRAGANA_DELIMITERS:
        nxt = []
        for p in pieces:
            if d in p and len(p) > len(d):
                nxt.extend(p.split(d))
            else:
                nxt.append(p)
        pieces = nxt

    # 切った結果、意味のありそうな長さのものだけ残す
    return [p for p in pieces if 2 <= len(p) <= 6]


def ngrams(s: str, n: int):
    """文字N-gramを返す。文字列がNより短い場合はそのまま返す。"""
    if len(s) <= n:
        return [s]
    return [s[i:i + n] for i in range(len(s) - n + 1)]


def tokenize(text: str, use_ngram: bool = True, content_only: bool = False):
    """
    テキストをトークンのリストに変換する。

    use_ngram=True のとき、漢字・カタカナの塊は2-gramにも分解して
    部分一致で引けるようにする（「デニム」→「デニムジャケット」がヒット）。

    content_only=True のとき、ひらがなだけの塊を落とす。
    この実装は本格的な形態素解析をしないため、PDFなどから取り出した
    文章では「せれることによりこの」のような文の切れ端が
    ひとつの語として残ってしまう。意味を測るときは邪魔になるので除く。
    日本語の内容語はほぼ漢字・カタカナ・英数字なので、実害は小さい。
    """
    text = normalize(text)
    if not text:
        return []

    chunks = split_by_char_type(text)

    # --- 短い英数字＋カナ／漢字 を1語にまとめる ---
    # アパレルでは「Tシャツ」「Gジャン」「Aライン」「5パネル」のように
    # 英数字1〜2文字が次の語と結びついて1つの意味を持つことが多い。
    # 分けたままだと「g」と「ジャン」になり検索も意味解析も効かなくなる。
    merged = []
    i = 0
    while i < len(chunks):
        chunk, ctype = chunks[i]
        if (
            ctype == 'alnum'
            and len(chunk) <= 2
            and i + 1 < len(chunks)
            and chunks[i + 1][1] in ('katakana', 'kanji')
        ):
            nxt, ntype = chunks[i + 1]
            merged.append((chunk + nxt, ntype))
            i += 2
            continue
        merged.append((chunk, ctype))
        i += 1

    tokens = []
    for chunk, ctype in merged:
        if ctype == 'hiragana':
            # 2文字以下は助詞なので落とす
            if len(chunk) <= 2:
                continue
            # 3文字以上は助詞で切って、中に埋もれた語を取り出す。
            # 切れなければ元のまま残る（「ものづくり」「こだわり」など）。
            tokens.extend(split_hiragana_run(chunk))
            continue
        if chunk in STOP_WORDS:
            continue

        tokens.append(chunk)

        # 漢字・カタカナの長い塊は N-gram にも分解する
        if use_ngram and ctype in ('kanji', 'katakana') and len(chunk) >= 3:
            tokens.extend(ngrams(chunk, 2))

    return [t for t in tokens if t and t not in STOP_WORDS]


def term_frequencies(text: str):
    """トークンの出現回数を数えて返す。"""
    freqs = {}
    for t in tokenize(text):
        freqs[t] = freqs.get(t, 0) + 1
    return freqs


if __name__ == '__main__':
    samples = [
        '新作のデニムジャケットを制作する',
        'AReGLMブランドのオーバーサイズTシャツ',
        'Instagram投稿で購買意欲を高める',
    ]
    for s in samples:
        print(f'{s}\n  → {tokenize(s)}\n')
