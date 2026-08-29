"""
潜在意味解析（ゼロから実装）

目的: 「デニムジャケット」と「Gジャン」のように、
文字が違っても同じ意味で使われている語を、
あなた自身のデータだけから学習して結びつける。

仕組み:
  1. 語 × 文脈（共起）の行列を作る
  2. PPMI（正の相互情報量）で重み付けする
     単純な共起回数だと「する」「ある」のような頻出語が強くなりすぎるため、
     「偶然の同時出現より、どれだけ多く一緒に出るか」に変換する
  3. 特異値分解（SVD）で低次元に圧縮する
     圧縮の過程で、同じ文脈に出る語が近い位置に集まる
     → これが「意味が近い」の正体

外部の学習済みモデルは使わない。行列計算に numpy を使うのみ。
（numpy は数値計算の道具であって、AIモデルではない）
"""

import json
import math
import os
from collections import defaultdict

import numpy as np

from tokenizer import tokenize


# 助詞や活用の切れ端。意味のある語ではない。
#
# 切り出しに失敗すると、こういう断片が語として貯まる。
# 貯まること自体は避けにくいので、見せるときに省く。
_助詞や語尾 = {
    'って', 'てい', 'った', 'れば', 'られ', 'させ', 'した', 'する', 'され',
    'ない', 'なり', 'なる', 'ある', 'いる', 'いた', 'こと', 'もの', 'ため',
    'よう', 'そう', 'から', 'まで', 'など', 'では', 'には', 'とし', 'によ',
    'ので', 'のに', 'たい', 'ます', 'です', 'まし', 'でき', 'つい', 'おけ',
}


def _意味を成さない断片か(語):
    """
    見せる値打ちのない断片かどうか。

    厳しくしすぎると、短い語（服・柄・色）まで消える。
    だから、はっきり切れ端と分かるものだけを省く。
    """
    if not 語:
        return True

    # ひらがなだけの語は、たいてい活用の切れ端。
    #
    # はじめ4文字までにしていたが、
    # 「すくなります」「つなげたい」「めんどくさい」が残った。
    # 長さで切るのではなく、<b>ひらがなだけかどうか</b>で見る。
    #
    # 漢字・カタカナ・英数が一文字でも入っていれば、
    # 意味のある語である見込みが高い。
    if all('ぁ' <= c <= 'ん' or c == 'ー' for c in 語):
        # ふだん使うひらがな語だけは残す
        if 語 in {'ふく', 'いろ', 'かたち', 'ねだん', 'ざいこ', 'みせ', 'きじ',
                  'ぬの', 'いと', 'そで', 'えり', 'すそ'}:
            return False
        return True

    # 送りがなで始まる語は、前の語から切れたもの
    if 語[:2] in _助詞や語尾:
        return True

    return False


class SemanticModel:
    """自分のデータだけから語の意味的な近さを学ぶ"""

    def __init__(self, dim=64, window=5, min_count=2):
        self.dim = dim              # 圧縮後の次元数
        self.window = window        # 共起とみなす前後の語数
        self.min_count = min_count  # これ未満しか出ない語は学習対象外

        self.word_counts = defaultdict(int)
        self.cooc = defaultdict(lambda: defaultdict(int))
        self.total_pairs = 0

        self.vocab = []
        self.word_index = {}
        self.vectors = None   # 学習後にできる語ベクトル
        self.trained_at = None

    # ---------- 収集 ----------

    def observe(self, text):
        """
        1文書ぶんの共起を数える（学習はまだしない）。

        意味解析では N-gram を使わない。
        N-gram は検索の部分一致には有効だが、ここで使うと
        「デニムジャケット」の類似語に自分の断片（ャケ・ケッ）が並んでしまい、
        意味の近さを測る邪魔になるため。
        """
        tokens = [t for t in tokenize(text, use_ngram=False, content_only=True) if len(t) >= 2]
        if len(tokens) < 2:
            return 0

        for t in tokens:
            self.word_counts[t] += 1

        # 前後 window 語を文脈とみなす
        for i, center in enumerate(tokens):
            start = max(0, i - self.window)
            end = min(len(tokens), i + self.window + 1)
            for j in range(start, end):
                if i == j:
                    continue
                self.cooc[center][tokens[j]] += 1
                self.total_pairs += 1

        return len(tokens)

    # ---------- 忘却 ----------

    def unobserve(self, text):
        """
        observe() で数えた共起を取り消す。
        数え上げているだけなので、同じ手順で引けば元に戻る。
        """
        tokens = [t for t in tokenize(text, use_ngram=False, content_only=True) if len(t) >= 2]
        if len(tokens) < 2:
            return 0

        for t in tokens:
            if t in self.word_counts:
                self.word_counts[t] -= 1
                if self.word_counts[t] <= 0:
                    del self.word_counts[t]

        for i, center in enumerate(tokens):
            start = max(0, i - self.window)
            end = min(len(tokens), i + self.window + 1)
            for j in range(start, end):
                if i == j:
                    continue
                row = self.cooc.get(center)
                if row and tokens[j] in row:
                    row[tokens[j]] -= 1
                    self.total_pairs = max(0, self.total_pairs - 1)
                    if row[tokens[j]] <= 0:
                        del row[tokens[j]]
            if center in self.cooc and not self.cooc[center]:
                del self.cooc[center]

        return len(tokens)

    def forget_term(self, term):
        """
        特定の語を意味モデルから消す。
        学習時に分割されて入った語も一緒に消す
        （意味モデルは N-gram を使わないが、分かち書きの単位は残るため）。
        """
        derived = set(tokenize(term, use_ngram=False))
        derived.add(term)
        targets = {
            w for w in self.word_counts
            if w == term or term in w or w in derived
        }
        for t in targets:
            self.word_counts.pop(t, None)
            self.cooc.pop(t, None)
            for row in self.cooc.values():
                row.pop(t, None)
        return sorted(targets)

    def forget_all(self):
        """意味モデルをまっさらに戻す"""
        self.word_counts.clear()
        self.cooc.clear()
        self.total_pairs = 0
        self.vocab = []
        self.word_index = {}
        self.vectors = None

    # ---------- 学習 ----------

    def build(self):
        """
        集めた共起から PPMI 行列を作り、SVD で圧縮して語ベクトルを得る。
        データが少ないうちは学習できないので、その場合は False を返す。
        """
        self.vocab = sorted(
            [w for w, c in self.word_counts.items() if c >= self.min_count]
        )
        n = len(self.vocab)
        if n < 10:
            return {'ok': False, 'reason': f'語彙が足りません（{n}語 / 最低10語）'}

        self.word_index = {w: i for i, w in enumerate(self.vocab)}

        # --- PPMI を疎行列（座標リスト）で組み立てる ---
        # PPMI(a,b) = max(0, log( P(a,b) / (P(a)P(b)) ))
        # 共起は語数に対してごく一部しか埋まらないため、
        # n×n の密行列を確保すると語彙1万で400MB超になる。
        # 実際に値がある位置だけを保持する。
        total = max(self.total_pairs, 1)
        counts = np.array([self.word_counts[w] for w in self.vocab], dtype=np.float64)
        total_words = max(counts.sum(), 1)

        rows, cols, vals = [], [], []
        for a, ai in self.word_index.items():
            row = self.cooc.get(a, {})
            p_a = self.word_counts[a] / total_words
            if p_a <= 0:
                continue
            for b, c in row.items():
                bi = self.word_index.get(b)
                if bi is None or c <= 0:
                    continue
                p_b = self.word_counts[b] / total_words
                if p_b <= 0:
                    continue
                pmi = math.log((c / total) / (p_a * p_b))
                if pmi > 0:
                    rows.append(ai)
                    cols.append(bi)
                    vals.append(pmi)

        if not vals:
            return {'ok': False, 'reason': '共起が足りません'}

        dim = min(self.dim, n - 1)

        try:
            self.vectors = self._randomized_svd(rows, cols, vals, n, dim)
        except (np.linalg.LinAlgError, ValueError) as e:
            return {'ok': False, 'reason': f'SVDに失敗しました: {e}'}

        # 長さを1に揃えておくと、内積がそのままコサイン類似度になる
        norms = np.linalg.norm(self.vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.vectors = self.vectors / norms

        import time
        self.trained_at = time.time()

        return {'ok': True, 'vocab': n, 'dim': dim}

    @staticmethod
    def _sparse_matmul(rows, cols, vals, n, dense):
        """
        疎行列 × 密行列。
        np.add.at で該当行にまとめて足し込む（Pythonのループを避ける）。
        """
        out = np.zeros((n, dense.shape[1]), dtype=np.float64)
        np.add.at(out, rows, dense[cols] * vals[:, None])
        return out

    def _randomized_svd(self, rows, cols, vals, n, dim, oversample=10, power_iter=2):
        """
        乱択SVD（ゼロから実装）

        全ての特異値を求める通常のSVDは O(n³) かかり、語彙が増えると
        実用にならない。ここでは上位 dim 個だけを近似で取り出す。

        手順:
          1. ランダムな行列を掛けて、行列の「主要な方向」を捉える
          2. べき乗反復で精度を上げる（ノイズ成分を減衰させる）
          3. QR分解で正規直交基底にする
          4. 小さくなった行列だけを厳密にSVDする

        これで計算量は O(n · nnz · k) 程度になり、語彙が増えても耐える。
        """
        rows = np.asarray(rows, dtype=np.int64)
        cols = np.asarray(cols, dtype=np.int64)
        vals = np.asarray(vals, dtype=np.float64)

        k = min(dim + oversample, n)
        rng = np.random.default_rng(0)  # 毎回同じ結果になるよう種を固定
        q = rng.standard_normal((n, k))

        # PPMI行列は対称なので、転置を掛ける代わりに同じ演算を繰り返せばよい
        q = self._sparse_matmul(rows, cols, vals, n, q)
        q, _ = np.linalg.qr(q)

        for _ in range(power_iter):
            q = self._sparse_matmul(rows, cols, vals, n, q)
            q, _ = np.linalg.qr(q)

        # 元の行列を低次元空間へ射影してからSVDする
        b = self._sparse_matmul(rows, cols, vals, n, q)   # n × k
        b = q.T @ b                                        # k × k
        u_small, s, _ = np.linalg.svd(b)

        u = q @ u_small[:, :dim]
        # 特異値の平方根を掛けるのが慣例（各次元の寄与を反映させるため）
        return u * np.sqrt(np.maximum(s[:dim], 0))

    # ---------- 利用 ----------

    def vector(self, word):
        idx = self.word_index.get(word)
        if idx is None or self.vectors is None:
            return None
        return self.vectors[idx]

    def _resolve(self, word):
        """
        入力語を語彙の中の語に対応づける。
        「Tシャツ」のように分割される語でも引けるよう、
        そのままで見つからなければトークン化して探す。
        """
        if word in self.word_index:
            return word
        for t in tokenize(word, use_ngram=False, content_only=True):
            if t in self.word_index:
                return t
        return None

    def similar_words(self, word, top_n=10):
        """その語と意味的に近い語を返す"""
        key = self._resolve(word)
        if key is None:
            return []
        v = self.vector(key)
        if v is None:
            return []

        sims = self.vectors @ v          # 正規化済みなので内積=コサイン類似度
        order = np.argsort(-sims)
        out = []
        for i in order:
            cand = self.vocab[i]
            if cand == key:
                continue
            # 部分文字列（自分の断片・自分を含む語）は意味の近さではないので除く
            if cand in key or key in cand:
                continue

            # 切り出しに失敗した断片を出さない。
            #
            # 「在庫 → 数量、棚卸資産、っていた」のように、
            # 意味のある語に混ざって「っていた」「れば」が出ていた。
            # 一つ混ざるだけで、答え全体が当てにならなく見える。
            #
            # 語そのものは消さない。消すと数え方が変わる。
            # 見せるときにだけ、出さないようにする。
            if _意味を成さない断片か(cand):
                continue

            out.append({'term': cand, 'similarity': round(float(sims[i]), 4)})
            if len(out) >= top_n:
                break
        return out

    def text_vector(self, text):
        """文章のベクトル＝含まれる語ベクトルの平均"""
        if self.vectors is None:
            return None
        vecs = [self.vector(t) for t in tokenize(text, use_ngram=False, content_only=True)]
        vecs = [v for v in vecs if v is not None]
        if not vecs:
            return None
        v = np.mean(vecs, axis=0)
        n = np.linalg.norm(v)
        return v / n if n else v

    def text_similarity(self, text_a, text_b):
        """文章同士の意味的な近さ。語が一致していなくても近ければ高くなる。"""
        va = self.text_vector(text_a)
        vb = self.text_vector(text_b)
        if va is None or vb is None:
            return None
        return round(float(np.dot(va, vb)), 4)

    # ---------- 保存 ----------

    def save(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = {
            'dim': self.dim,
            'window': self.window,
            'minCount': self.min_count,
            'wordCounts': dict(self.word_counts),
            'cooc': {k: dict(v) for k, v in self.cooc.items()},
            'totalPairs': self.total_pairs,
            'trainedAt': self.trained_at,
        }
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)

    def load(self, path):
        if not os.path.exists(path):
            return False
        try:
            with open(path, encoding='utf-8') as f:
                d = json.load(f)
        except (json.JSONDecodeError, OSError):
            return False

        self.dim = d.get('dim', self.dim)
        self.window = d.get('window', self.window)
        self.min_count = d.get('minCount', self.min_count)
        self.word_counts = defaultdict(int, d.get('wordCounts', {}))
        self.total_pairs = d.get('totalPairs', 0)
        self.cooc = defaultdict(lambda: defaultdict(int))
        for k, v in d.get('cooc', {}).items():
            self.cooc[k] = defaultdict(int, v)

        # 読み込んだら、ベクトルを作る。
        #
        # ここが抜けていた。
        #
        # 共起は28,780語ぶん貯まっているのに、
        # ベクトルは作られないままだった。
        # そのせいで「在庫は？」と聞かれても
        # 近い言葉が一つも出てこず、
        # 覚えたことを引き出せずにいた。
        #
        # 保存する側もベクトルを持たないので、
        # 作っても次に読むときには消えていた。
        # <b>作った端から捨てていた</b>ことになる。
        #
        # 作り直すのに3秒ほどかかるが、
        # 立ち上げのときに一度だけなので、
        # 使っている間は待たされない。
        # 保存すると13MBが何倍にもなるので、
        # ファイルに持たず、その都度作るほうがよい。
        try:
            if self.word_counts:
                self.build()
        except Exception as e:
            # 作れなくても、覚えたことは残っている。
            # ここで止めると、AIそのものが立ち上がらない。
            print(f'言葉のつながりを作れませんでした: {e}')

        return True


if __name__ == '__main__':
    m = SemanticModel(dim=16, min_count=1, window=4)

    # 同じ文脈で使われる語が近づくかを確認する
    corpus = [
        'デニムジャケットを制作する 素材はデニム 色はインディゴ',
        'Gジャンを制作する 素材はデニム 色はインディゴ',
        'デニムジャケットの生地を発注する',
        'Gジャンの生地を発注する',
        'Tシャツを制作する 素材はコットン 色はホワイト',
        'カットソーを制作する 素材はコットン 色はホワイト',
        'Tシャツの生地を発注する',
        'カットソーの生地を発注する',
        'スニーカーを制作する 素材はレザー',
        'パンツを制作する 素材はデニム',
    ]
    for c in corpus:
        m.observe(c)

    print('学習結果:', m.build())
    print()
    for w in ['デニムジャケット', 'Tシャツ']:
        sims = m.similar_words(w, 4)
        print(f'「{w}」に意味が近い語:')
        for s in sims:
            print(f'   {s["term"]:<16} {s["similarity"]}')
        print()

    print('文章の意味的な近さ:')
    pairs = [
        ('デニムジャケットを作る', 'Gジャンを作る'),
        ('デニムジャケットを作る', 'スニーカーを作る'),
    ]
    for a, b in pairs:
        print(f'  「{a}」 vs 「{b}」 → {m.text_similarity(a, b)}')
