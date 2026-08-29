"""
類似度エンジン（ゼロから実装）

目的: 「絶対に似たような商品は作らない」を機械的に担保する。

新しい商品案を登録する前に、既存の全商品と比較して
似すぎているものがあれば警告する。

実装している指標:
  1. コサイン類似度（TF-IDF重み付き） — 語の使われ方が似ているか
  2. Jaccard係数                      — 語の集合がどれだけ重なるか
  3. 属性一致率                        — 色・素材・アイテム種別の一致

3つを重み付けして総合スコアを出す。単一指標だと
「Tシャツ」同士が全部似ていると判定されてしまうため。

scikit-learn等の既製の類似度実装は使わず、式から実装している。
"""

import math
from collections import defaultdict

from tokenizer import tokenize


class SimilarityEngine:
    """商品同士の似すぎを検出する"""

    # 総合スコアの重み（合計1.0）
    W_COSINE = 0.5
    W_JACCARD = 0.2
    W_ATTRS = 0.3

    # 意味モデルが使えるときの重み配分。
    # 語が一致していなくても意味が近ければ検出できるようにする
    # （例:「デニムジャケット」と「Gジャン」）。
    W_SEM_COSINE = 0.30
    W_SEM_JACCARD = 0.10
    W_SEM_ATTRS = 0.25
    W_SEM_SEMANTIC = 0.35

    # この値を超えたら「似すぎ」として警告する
    THRESHOLD_WARN = 0.60
    THRESHOLD_BLOCK = 0.80

    def __init__(self, semantic_model=None):
        self.documents = []          # [{id, text, tokens, attrs}]
        self.doc_freq = defaultdict(int)
        # 意味モデル（任意）。あれば言い換えも検出できる
        self.semantic = semantic_model

    # ---------- 登録 ----------

    def add(self, doc_id, text, attrs=None):
        """既存商品を1件登録する"""
        tokens = tokenize(text)
        unique = set(tokens)
        for t in unique:
            self.doc_freq[t] += 1
        self.documents.append({
            'id': doc_id,
            'text': text,
            'tokens': tokens,
            'token_set': unique,
            'attrs': attrs or {},
        })

    def add_many(self, items):
        for it in items:
            self.add(it.get('id'), it.get('text', ''), it.get('attrs'))

    # ---------- 内部計算 ----------

    def _idf(self, term):
        n = len(self.documents)
        if n == 0:
            return 1.0
        return math.log((n + 1) / (self.doc_freq.get(term, 0) + 1)) + 1.0

    def _tfidf_vector(self, tokens):
        """トークン列を TF-IDF ベクトル（辞書）にする"""
        if not tokens:
            return {}
        tf = defaultdict(int)
        for t in tokens:
            tf[t] += 1
        max_tf = max(tf.values())
        return {t: (0.5 + 0.5 * c / max_tf) * self._idf(t) for t, c in tf.items()}

    @staticmethod
    def _cosine(v1, v2):
        """コサイン類似度。共通する語だけ内積を取ればよい。"""
        if not v1 or not v2:
            return 0.0
        # 走査回数を減らすため小さい方を基準にする
        if len(v1) > len(v2):
            v1, v2 = v2, v1
        dot = sum(w * v2[t] for t, w in v1.items() if t in v2)
        if dot == 0:
            return 0.0
        n1 = math.sqrt(sum(w * w for w in v1.values()))
        n2 = math.sqrt(sum(w * w for w in v2.values()))
        return dot / (n1 * n2) if n1 and n2 else 0.0

    @staticmethod
    def _jaccard(s1, s2):
        """集合の重なり具合"""
        if not s1 or not s2:
            return 0.0
        inter = len(s1 & s2)
        union = len(s1 | s2)
        return inter / union if union else 0.0

    @staticmethod
    def _attr_match(a1, a2):
        """
        属性の一致率。
        比較できるキーが1つも無い場合は 0 ではなく None を返し、
        重み配分から除外する（未入力を「似ていない」と誤判定しないため）。
        """
        keys = set(a1) & set(a2)
        keys = {k for k in keys if a1.get(k) and a2.get(k)}
        if not keys:
            return None
        match = sum(1 for k in keys if str(a1[k]).strip().lower() == str(a2[k]).strip().lower())
        return match / len(keys)

    def _score(self, cos, jac, att, sem):
        """
        各指標を重み付けして総合スコアにする。
        使えない指標（属性なし・意味モデルなし）は重みから外し、
        残りで按分することで不当に低く出ないようにする。
        """
        parts = [(self.W_SEM_COSINE if sem is not None else self.W_COSINE, cos),
                 (self.W_SEM_JACCARD if sem is not None else self.W_JACCARD, jac)]
        if att is not None:
            parts.append((self.W_SEM_ATTRS if sem is not None else self.W_ATTRS, att))
        if sem is not None:
            # 負の類似度は「無関係」なので0として扱う
            parts.append((self.W_SEM_SEMANTIC, max(0.0, sem)))

        total_w = sum(w for w, _ in parts)
        if total_w == 0:
            return 0.0
        return sum(w * v for w, v in parts) / total_w

    def _semantic_sim(self, text_a, text_b):
        """意味モデルがあれば意味的な近さを返す。無ければ None。"""
        if not self.semantic:
            return None
        try:
            return self.semantic.text_similarity(text_a, text_b)
        except Exception:
            return None

    # ---------- 判定 ----------

    def compare(self, text, attrs=None, top_n=5):
        """
        新しい商品案を既存全件と比較して、似ている順に返す。
        """
        attrs = attrs or {}
        tokens = tokenize(text)
        if not tokens:
            return {'ok': True, 'verdict': 'empty', 'matches': []}

        vec = self._tfidf_vector(tokens)
        token_set = set(tokens)

        results = []
        for doc in self.documents:
            cos = self._cosine(vec, self._tfidf_vector(doc['tokens']))
            jac = self._jaccard(token_set, doc['token_set'])
            att = self._attr_match(attrs, doc['attrs'])
            sem = self._semantic_sim(text, doc['text'])
            score = self._score(cos, jac, att, sem)

            results.append({
                'id': doc['id'],
                'text': doc['text'],
                'score': round(score, 4),
                'cosine': round(cos, 4),
                'jaccard': round(jac, 4),
                'attrMatch': None if att is None else round(att, 4),
                'semantic': None if sem is None else round(sem, 4),
            })

        results.sort(key=lambda r: -r['score'])
        top = results[:top_n]
        best = top[0]['score'] if top else 0.0

        if best >= self.THRESHOLD_BLOCK:
            verdict = 'block'
            message = '既存商品と非常に似ています。別の案にすることを強くおすすめします。'
        elif best >= self.THRESHOLD_WARN:
            verdict = 'warn'
            message = '既存商品と似ている点があります。差別化できているか確認してください。'
        else:
            verdict = 'ok'
            message = '既存商品と十分に差別化されています。'

        return {
            'ok': verdict == 'ok',
            'verdict': verdict,
            'message': message,
            'topScore': round(best, 4),
            'matches': top,
        }

    def find_duplicates_within(self, threshold=None):
        """登録済み商品の中で似すぎているペアを洗い出す"""
        threshold = threshold if threshold is not None else self.THRESHOLD_WARN
        vectors = [self._tfidf_vector(d['tokens']) for d in self.documents]
        pairs = []
        for i in range(len(self.documents)):
            for j in range(i + 1, len(self.documents)):
                cos = self._cosine(vectors[i], vectors[j])
                jac = self._jaccard(self.documents[i]['token_set'], self.documents[j]['token_set'])
                att = self._attr_match(self.documents[i]['attrs'], self.documents[j]['attrs'])
                sem = self._semantic_sim(self.documents[i]['text'], self.documents[j]['text'])
                score = self._score(cos, jac, att, sem)
                if score >= threshold:
                    pairs.append({
                        'a': self.documents[i]['id'],
                        'aText': self.documents[i]['text'],
                        'b': self.documents[j]['id'],
                        'bText': self.documents[j]['text'],
                        'score': round(score, 4),
                    })
        pairs.sort(key=lambda p: -p['score'])
        return pairs


if __name__ == '__main__':
    eng = SimilarityEngine()
    eng.add_many([
        {'id': 'TSH001', 'text': 'ベーシックTシャツ 白 厚手コットン オーバーサイズ',
         'attrs': {'item': 'tshirt', 'color': 'white', 'material': 'cotton'}},
        {'id': 'JKT002', 'text': 'デニムジャケット インディゴ ウォッシュデニム',
         'attrs': {'item': 'jacket', 'color': 'indigo', 'material': 'denim'}},
        {'id': 'PTS003', 'text': 'スキニーパンツ 黒 ストレッチデニム',
         'attrs': {'item': 'pants', 'color': 'black', 'material': 'denim'}},
        {'id': 'SWT004', 'text': 'カジュアルスウェット グレー 裏起毛',
         'attrs': {'item': 'sweat', 'color': 'gray', 'material': 'cotton'}},
    ])

    tests = [
        ('ベーシックTシャツ オフホワイト 厚手コットン ゆったりめ',
         {'item': 'tshirt', 'color': 'white', 'material': 'cotton'}),
        ('コーチジャケット カーキ ナイロン',
         {'item': 'coach', 'color': 'khaki', 'material': 'nylon'}),
        ('デニムジャケット インディゴ ウォッシュ加工',
         {'item': 'jacket', 'color': 'indigo', 'material': 'denim'}),
    ]

    for text, attrs in tests:
        r = eng.compare(text, attrs)
        print(f'【{text}】')
        print(f'  判定: {r["verdict"]} (最高スコア {r["topScore"]}) — {r["message"]}')
        for m in r['matches'][:2]:
            print(f'    ・{m["id"]} {m["text"]}  スコア{m["score"]}')
        print()
