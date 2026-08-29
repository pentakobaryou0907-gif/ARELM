"""
誤字・表記ゆれを吸収する照合（ゼロから実装）

目的:
  「でにむじゃけっと」「デニムジャッケト」「Tシャッツ」のように
  打ち間違いや表記ゆれがあっても、正しい語として理解できるようにする。

実装:
  1. レーベンシュタイン距離（編集距離）
     何文字入れ替えれば一致するかを数える。動的計画法で計算する。
     全長ぶんの表を持たず2行だけで回すことでメモリを節約している。

  2. 表記の正規化
     ひらがな⇔カタカナ、長音・促音・濁点の揺れを吸収する。
     「じゃけっと」と「ジャケット」を同じものとして扱えるようにする。

  3. 語彙からの最近傍探索
     長さが大きく違う候補は先に捨てて、無駄な計算をしない。

外部ライブラリは使わない。
"""

import unicodedata


def levenshtein(a: str, b: str, max_distance=None) -> int:
    """
    編集距離。a を b にするのに必要な「挿入・削除・置換」の最小回数。

    max_distance を渡すと、それを超えた時点で打ち切って
    max_distance + 1 を返す（全部計算せずに済ませるため）。
    """
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    # 短い方を内側に回すと必要な列数が減る
    if len(a) > len(b):
        a, b = b, a

    if max_distance is not None and len(b) - len(a) > max_distance:
        return max_distance + 1

    previous = list(range(len(a) + 1))

    for i, cb in enumerate(b, start=1):
        current = [i]
        row_min = i
        for j, ca in enumerate(a, start=1):
            cost = 0 if ca == cb else 1
            v = min(
                previous[j] + 1,        # 削除
                current[j - 1] + 1,     # 挿入
                previous[j - 1] + cost  # 置換
            )
            current.append(v)
            if v < row_min:
                row_min = v
        previous = current

        # この行の最小値がすでに上限を超えているなら、これ以上良くならない
        if max_distance is not None and row_min > max_distance:
            return max_distance + 1

    return previous[-1]


# --- 表記ゆれの正規化 ---

_KATA_START, _KATA_END = ord('ァ'), ord('ヶ')
_HIRA_KATA_OFFSET = ord('ァ') - ord('ぁ')


def to_katakana(text: str) -> str:
    """ひらがなをカタカナに寄せる"""
    out = []
    for ch in text:
        code = ord(ch)
        if ord('ぁ') <= code <= ord('ゖ'):
            out.append(chr(code + _HIRA_KATA_OFFSET))
        else:
            out.append(ch)
    return ''.join(out)


def normalize_loose(text: str) -> str:
    """
    表記ゆれを吸収するための、ゆるい正規化。

    - 全角半角をそろえ、小文字化する
    - ひらがなはカタカナに寄せる
    - 長音「ー」、促音「ッ」、小書き文字を落とす
      （「ジャケット」「ジャケト」「ジャッケット」を同じ形にするため）
    - 濁点・半濁点を落とす（「バ」と「ハ」の打ち間違いを吸収）
    """
    if not text:
        return ''
    text = unicodedata.normalize('NFKC', text).lower()
    text = to_katakana(text)

    # 濁点・半濁点を分離して取り除く
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if c not in ('゙', '゚'))
    text = unicodedata.normalize('NFC', text)

    # 揺れやすい記号・小書き文字を落とす
    drop = 'ーッャュョァィゥェォヮ・･ 　-_'
    return ''.join(c for c in text if c not in drop)


def similarity_ratio(a: str, b: str) -> float:
    """0.0〜1.0 の一致度。1.0 が完全一致。"""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    dist = levenshtein(a, b)
    return 1.0 - dist / max(len(a), len(b))


def match_score(query: str, candidate: str) -> float:
    """
    誤字を考慮した一致度。
    そのままの比較と、ゆるく正規化した比較の高い方を採用する。
    """
    direct = similarity_ratio(query, candidate)
    loose = similarity_ratio(normalize_loose(query), normalize_loose(candidate))
    return max(direct, loose)


def best_match(query: str, candidates, threshold=0.6):
    """
    候補の中から最も近いものを返す。
    threshold 未満しか無ければ None を返す（無理に当てはめない）。
    """
    if not query or not candidates:
        return None

    nq = normalize_loose(query)
    best = None
    best_score = 0.0

    for cand in candidates:
        # 長さが違いすぎるものは計算する前に捨てる
        nc = normalize_loose(cand)
        if nc and nq and abs(len(nc) - len(nq)) > max(len(nq), len(nc)) * 0.5:
            continue

        score = match_score(query, cand)
        if score > best_score:
            best_score = score
            best = cand

    if best is None or best_score < threshold:
        return None
    return {'match': best, 'score': round(best_score, 4)}


def rank_matches(query: str, candidates, top_n=5, threshold=0.5):
    """近い順に候補を返す（もしかして候補の提示に使う）"""
    scored = []
    for cand in candidates:
        score = match_score(query, cand)
        if score >= threshold:
            scored.append({'match': cand, 'score': round(score, 4)})
    scored.sort(key=lambda x: -x['score'])
    return scored[:top_n]


if __name__ == '__main__':
    vocab = ['デニムジャケット', 'Tシャツ', 'スウェット', 'スキニーパンツ',
             'スニーカー', 'コーチジャケット', 'トートバッグ', 'キャップ']

    tests = [
        'デニムジャッケト',   # 促音の入れ間違い
        'でにむじゃけっと',   # ひらがな
        'ﾃﾞﾆﾑｼﾞｬｹｯﾄ',        # 半角カナ
        'Tシャッツ',          # 打ち間違い
        'すにーかー',         # ひらがな
        'スエット',           # 表記ゆれ
        'コーチジャケト',      # 脱字
        '全然ちがう語',        # 該当なしのはず
    ]

    print(f'{"入力":<20} {"認識":<18} {"一致度"}')
    print('-' * 50)
    for t in tests:
        r = best_match(t, vocab)
        if r:
            print(f'{t:<20} {r["match"]:<18} {r["score"]}')
        else:
            print(f'{t:<20} {"（該当なし）":<18} -')
