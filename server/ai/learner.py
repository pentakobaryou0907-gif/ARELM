"""
オンライン学習エンジン（ゼロから実装）

使いながら1件ずつ学習していく方式。バッチ学習と違い、
新しいデータが来るたびにその場でモデルを更新する。

実装している仕組み:
  1. インクリメンタルTF-IDF — 文書が追加されるたびIDFを更新
  2. オンライン・ナイーブベイズ分類 — カテゴリ判定を逐次学習
  3. 共起カウント — よく一緒に出る語を覚える（表現の癖を学ぶ）

外部の学習済みモデルは一切使わない。すべてこの端末のデータのみで育つ。
"""

import json
import math
import os
import time
from collections import defaultdict

from tokenizer import tokenize


class OnlineLearner:
    """使うたびに1件ずつ学習していくモデル"""

    def __init__(self, model_path=None):
        self.model_path = model_path

        # 文書頻度: 語 -> その語を含む文書数（IDF計算に使う）
        self.doc_freq = defaultdict(int)
        self.total_docs = 0

        # ナイーブベイズ用: カテゴリ -> 語 -> 出現回数
        self.class_word_counts = defaultdict(lambda: defaultdict(int))
        self.class_totals = defaultdict(int)
        self.class_doc_counts = defaultdict(int)
        self.vocabulary = set()

        # 共起カウント: 語 -> 一緒に出た語 -> 回数
        self.cooccurrence = defaultdict(lambda: defaultdict(int))

        # related_terms() は上位8件しか見ないので、1語につきこの数だけ持てば十分。
        # 無制限に持たせると、語彙が増えるほど保存・読み込みが重くなり続ける。
        self._共起の上限 = 30

        # 学習履歴
        self.updates = 0
        self.created_at = time.time()
        self.updated_at = None

        if model_path and os.path.exists(model_path):
            self.load()

    # ---------- 学習 ----------

    def learn(self, text, category=None, weight=1):
        """
        1件のテキストから学習する。
        category を渡すと分類器も同時に育つ（例: 'sns', 'product', 'memo'）。
        """
        tokens = tokenize(text)
        if not tokens:
            return {'learned': False, 'reason': '有効な語が抽出できませんでした'}

        unique = set(tokens)

        # --- IDF用の文書頻度を更新 ---
        self.total_docs += weight
        for t in unique:
            self.doc_freq[t] += weight
            self.vocabulary.add(t)

        # --- ナイーブベイズを更新 ---
        # 分類には N-gram 断片を使わない。
        # 「ニューラルネットワーク」の断片（ニュ・ューなど）が
        # 「ニュース」由来の断片と一致してしまい、
        # 無関係なカテゴリに引き寄せられるため。
        if category:
            self.class_doc_counts[category] += weight
            for t in tokenize(text, use_ngram=False):
                self.class_word_counts[category][t] += weight
                self.class_totals[category] += weight

        # --- 共起を更新（同じ文書に出た語同士）---
        # 語数が多いと計算量が増えるので、頻度上位のみに絞る
        top = list(unique)[:40]
        触れた語 = set()
        for i, a in enumerate(top):
            for b in top[i + 1:]:
                self.cooccurrence[a][b] += weight
                self.cooccurrence[b][a] += weight
                触れた語.add(a)
                触れた語.add(b)

        # 使い道（related_terms）は語ごとに上位8件しか見ない。
        # それなのに全部の相手を無制限に持ち続けていたため、
        # 42,000語×平均127件＝428万ペアまで膨らみ、
        # 保存のたびに数秒かかる詰まりの原因になっていた。
        # 触った語の行だけ、多く持ちすぎていたら間引く。
        for t in 触れた語:
            row = self.cooccurrence.get(t)
            if row and len(row) > self._共起の上限:
                上位 = dict(sorted(row.items(), key=lambda x: -x[1])[:self._共起の上限])
                self.cooccurrence[t] = defaultdict(int, 上位)

        self.updates += 1
        self.updated_at = time.time()

        return {
            'learned': True,
            'tokens': len(tokens),
            'unique': len(unique),
            'totalDocs': self.total_docs,
            'vocabulary': len(self.vocabulary),
            'updates': self.updates,
        }

    # ---------- 忘却 ----------

    def unlearn(self, text, category=None, weight=1):
        """
        学習した内容を取り消す。

        このモデルは出現回数を足し合わせているだけなので、
        同じぶんだけ引けば学習前の状態に戻せる。
        （勾配で重みを更新する方式では、こうした取り消しはできない）

        カウントが0以下になった語は完全に消す。
        """
        tokens = tokenize(text)
        if not tokens:
            return {'forgotten': False, 'reason': '有効な語が抽出できませんでした'}

        unique = set(tokens)
        removed_terms = 0

        # --- 文書頻度を戻す ---
        self.total_docs = max(0, self.total_docs - weight)
        for t in unique:
            if t not in self.doc_freq:
                continue
            self.doc_freq[t] -= weight
            if self.doc_freq[t] <= 0:
                del self.doc_freq[t]
                self.vocabulary.discard(t)
                removed_terms += 1

        # --- 分類器を戻す ---
        if category and category in self.class_doc_counts:
            self.class_doc_counts[category] = max(0, self.class_doc_counts[category] - weight)
            counts = self.class_word_counts.get(category)
            if counts:
                # 学習時と同じ単位（単語のみ）で引く
                for t in tokenize(text, use_ngram=False):
                    if t in counts:
                        counts[t] -= weight
                        self.class_totals[category] = max(0, self.class_totals[category] - weight)
                        if counts[t] <= 0:
                            del counts[t]
            # そのカテゴリの文書が無くなったらカテゴリ自体を消す
            if self.class_doc_counts[category] <= 0:
                self.class_doc_counts.pop(category, None)
                self.class_word_counts.pop(category, None)
                self.class_totals.pop(category, None)

        # --- 共起を戻す ---
        top = list(unique)[:40]
        for i, a in enumerate(top):
            for b in top[i + 1:]:
                for x, y in ((a, b), (b, a)):
                    row = self.cooccurrence.get(x)
                    if row and y in row:
                        row[y] -= weight
                        if row[y] <= 0:
                            del row[y]
                if x in self.cooccurrence and not self.cooccurrence[x]:
                    del self.cooccurrence[x]

        self.updates += 1
        self.updated_at = time.time()

        return {
            'forgotten': True,
            'removedTerms': removed_terms,
            'totalDocs': self.total_docs,
            'vocabulary': len(self.vocabulary),
        }

    def forget_term(self, term):
        """
        特定の語を、学習内容から完全に消す。

        語そのものだけでなく、学習時に作られた N-gram の断片も消す。
        「ヒミツブランド」を忘れたのに「ヒミ」「ミツ」が残っていては
        忘れたことにならないため。
        """
        term = term.strip()
        if not term:
            return {'forgotten': False}

        # その語を学習したときに生成されうるトークンをすべて洗い出す
        derived = set(tokenize(term))
        derived.add(term)

        targets = {
            t for t in self.vocabulary
            if t == term or term in t or t in derived
        }
        if not targets:
            return {'forgotten': False, 'reason': f'「{term}」は学習していません'}

        for t in targets:
            self.doc_freq.pop(t, None)
            self.vocabulary.discard(t)
            self.cooccurrence.pop(t, None)
            for row in self.cooccurrence.values():
                row.pop(t, None)
            for counts in self.class_word_counts.values():
                counts.pop(t, None)

        self.updated_at = time.time()
        return {'forgotten': True, 'removed': sorted(targets)}

    def forget_category(self, category):
        """カテゴリごと学習内容を消す（例: chat の会話を全部忘れる）"""
        if category not in self.class_doc_counts:
            return {'forgotten': False, 'reason': f'カテゴリ「{category}」はありません'}
        docs = self.class_doc_counts.pop(category, 0)
        self.class_word_counts.pop(category, None)
        self.class_totals.pop(category, None)
        self.total_docs = max(0, self.total_docs - docs)
        self.updated_at = time.time()
        return {'forgotten': True, 'category': category, 'removedDocs': docs}

    def forget_all(self):
        """学習内容をすべて消して、まっさらな状態に戻す。"""
        self.doc_freq.clear()
        self.vocabulary.clear()
        self.cooccurrence.clear()
        self.class_word_counts.clear()
        self.class_totals.clear()
        self.class_doc_counts.clear()
        self.total_docs = 0
        self.updates = 0
        self.updated_at = time.time()
        return {'forgotten': True, 'scope': 'all'}

    # ---------- 推論 ----------

    def idf(self, term):
        """逆文書頻度。珍しい語ほど大きくなる。"""
        if self.total_docs == 0:
            return 0.0
        df = self.doc_freq.get(term, 0)
        # +1 は未知語で 0 割りを防ぐため（平滑化）
        return math.log((self.total_docs + 1) / (df + 1)) + 1.0

    def keywords(self, text, top_n=10):
        """テキストの特徴語を TF-IDF で抽出する。"""
        freqs = {}
        for t in tokenize(text):
            freqs[t] = freqs.get(t, 0) + 1
        if not freqs:
            return []

        max_f = max(freqs.values())
        scored = []
        for term, f in freqs.items():
            # 1文字のノイズや純粋な数字は特徴語にしない
            if len(term) < 2 or term.isdigit():
                continue
            tf = 0.5 + 0.5 * (f / max_f)
            scored.append((term, round(tf * self.idf(term), 4)))

        scored.sort(key=lambda x: -x[1])
        return scored[:top_n]

    def classify(self, text):
        """
        ナイーブベイズでカテゴリを推定する。
        log で計算するのは、確率を掛け続けると0に潰れるため。
        """
        if not self.class_doc_counts:
            return {'category': None, 'confidence': 0.0, 'scores': {}}

        # 学習時と同じく、分類には単語のみを使う（N-gram断片は使わない）
        tokens = tokenize(text, use_ngram=False)
        if not tokens:
            return {'category': None, 'confidence': 0.0, 'scores': {}}

        # どのカテゴリにも出たことがない語は判断材料にならないうえ、
        # 残すと「学習量の少ないカテゴリほど有利」という偏りを生む
        # （分母が小さいほど平滑化後の確率が高くなるため）。よって除外する。
        known = [
            t for t in tokens
            if any(t in counts for counts in self.class_word_counts.values())
        ]
        if not known:
            return {'category': None, 'confidence': 0.0, 'scores': {},
                    'reason': '学習済みの語が含まれていません'}

        vocab_size = max(len(self.vocabulary), 1)
        total_docs = sum(self.class_doc_counts.values())
        n_classes = max(len(self.class_doc_counts), 1)

        # 語ごとの重み。
        # 多くのカテゴリに出る語（「について」など）は話題を示さないので軽く、
        # 特定のカテゴリにしか出ない語（「伝統的」など）は重くする。
        # これをしないと、意味を持たない機能語が本当の手がかりを数で上回る。
        weights = {}
        for t in known:
            appears_in = sum(
                1 for counts in self.class_word_counts.values() if t in counts
            )
            # 全カテゴリに出る語は重み0に近づき、1カテゴリだけの語は1に近づく
            weights[t] = math.log(1 + n_classes / max(appears_in, 1)) / math.log(1 + n_classes)

        # 手がかりが弱すぎるときは無理に判定しない
        if sum(weights.values()) < 0.5:
            return {'category': None, 'confidence': 0.0, 'scores': {},
                    'reason': '判断できるだけの手がかりがありません'}

        scores = {}
        for category, doc_count in self.class_doc_counts.items():
            # 事前確率
            score = math.log(doc_count / total_docs)
            denom = self.class_totals[category] + vocab_size
            word_counts = self.class_word_counts[category]
            for t in known:
                # ラプラス平滑化: そのカテゴリで未出現でも 0 にしない
                score += weights[t] * math.log((word_counts.get(t, 0) + 1) / denom)
            scores[category] = score

        best = max(scores, key=scores.get)

        # log スコアを確率に戻して信頼度を出す
        max_score = scores[best]
        exp_sum = sum(math.exp(s - max_score) for s in scores.values())
        confidence = 1.0 / exp_sum if exp_sum else 0.0

        return {
            'category': best,
            'confidence': round(confidence, 4),
            'scores': {k: round(v, 3) for k, v in scores.items()},
        }

    def answer(self, text):
        """
        判定結果に「どれくらい確かか」を明示して返す。

        方針: 嘘をつかない。断定できないものを断定しない。
        根拠の強さに応じて3段階で答える。

          confirmed … 学習した内容から確かに言える
          guess     … 手がかりはあるが確実ではない（推測）
          unknown   … わからない（推測すらできない）

        推測を禁じるのではなく、推測だと分かる形で返すのが目的。
        """
        result = self.classify(text)
        category = result.get('category')
        confidence = result.get('confidence', 0.0)

        if not category:
            return {
                'certainty': 'unknown',
                'label': 'わからない',
                'category': None,
                'confidence': 0.0,
                'message': result.get('reason') or 'まだ学習していない内容です。',
                'basis': [],
            }

        # 判断の根拠になった語を示す（なぜそう答えたかを隠さない）
        known = [
            t for t in tokenize(text, use_ngram=False)
            if any(t in c for c in self.class_word_counts.values())
        ]
        basis = []
        for t in known:
            count = self.class_word_counts.get(category, {}).get(t, 0)
            if count:
                basis.append({'term': t, 'count': count})
        basis.sort(key=lambda x: -x['count'])

        if confidence >= 0.8 and len(basis) >= 2:
            certainty, label = 'confirmed', '確かに言えます'
            message = f'学習した内容から「{category}」です。'
        elif confidence >= 0.5:
            certainty, label = 'guess', '推測です'
            message = f'おそらく「{category}」だと思いますが、確実ではありません。'
        else:
            certainty, label = 'guess', '推測です（根拠は弱いです）'
            message = f'「{category}」かもしれませんが、判断材料が足りません。'

        return {
            'certainty': certainty,
            'label': label,
            'category': category,
            'confidence': confidence,
            'message': message,
            'basis': basis[:5],
        }

    def related_terms(self, term, top_n=8):
        """その語と一緒に使われることが多い語を返す。"""
        term = tokenize(term)
        if not term:
            return []
        co = self.cooccurrence.get(term[0], {})
        ranked = sorted(co.items(), key=lambda x: -x[1])
        return [{'term': t, 'count': c} for t, c in ranked[:top_n]]

    def summary(self):
        """今どれだけ学習が進んでいるか。"""
        top_terms = sorted(self.doc_freq.items(), key=lambda x: -x[1])[:15]
        return {
            'totalDocs': self.total_docs,
            'vocabulary': len(self.vocabulary),
            'updates': self.updates,
            'categories': {k: v for k, v in self.class_doc_counts.items()},
            'topTerms': [{'term': t, 'docs': c} for t, c in top_terms if len(t) >= 2],
            'createdAt': self.created_at,
            'updatedAt': self.updated_at,
        }

    # ---------- 保存・読み込み ----------

    def to_dict(self):
        return {
            'docFreq': dict(self.doc_freq),
            'totalDocs': self.total_docs,
            'classWordCounts': {k: dict(v) for k, v in self.class_word_counts.items()},
            'classTotals': dict(self.class_totals),
            'classDocCounts': dict(self.class_doc_counts),
            'cooccurrence': {k: dict(v) for k, v in self.cooccurrence.items()},
            'updates': self.updates,
            'createdAt': self.created_at,
            'updatedAt': self.updated_at,
        }

    def save(self):
        if not self.model_path:
            return False
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        # 書き込み途中で壊れないよう、一時ファイルに書いてから差し替える
        tmp = self.model_path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False)
        os.replace(tmp, self.model_path)
        return True

    def load(self):
        try:
            with open(self.model_path, encoding='utf-8') as f:
                d = json.load(f)
        except (json.JSONDecodeError, OSError):
            return False

        self.doc_freq = defaultdict(int, d.get('docFreq', {}))
        self.total_docs = d.get('totalDocs', 0)
        self.class_totals = defaultdict(int, d.get('classTotals', {}))
        self.class_doc_counts = defaultdict(int, d.get('classDocCounts', {}))
        self.updates = d.get('updates', 0)
        self.created_at = d.get('createdAt', time.time())
        self.updated_at = d.get('updatedAt')

        self.class_word_counts = defaultdict(lambda: defaultdict(int))
        for k, v in d.get('classWordCounts', {}).items():
            self.class_word_counts[k] = defaultdict(int, v)

        self.cooccurrence = defaultdict(lambda: defaultdict(int))
        for k, v in d.get('cooccurrence', {}).items():
            self.cooccurrence[k] = defaultdict(int, v)

        self.vocabulary = set(self.doc_freq.keys())
        return True


if __name__ == '__main__':
    m = OnlineLearner()
    samples = [
        ('新作のデニムジャケットを制作する。素材はウォッシュデニム', 'product'),
        ('オーバーサイズのTシャツを厚手コットンで作る', 'product'),
        ('Instagramに商品レビュー投稿をする', 'sns'),
        ('TikTokでストリートスナップのリールを出す', 'sns'),
        ('サンプルの発注を今週中に済ませる', 'task'),
    ]
    for text, cat in samples:
        m.learn(text, cat)

    print('学習サマリー:', json.dumps(m.summary(), ensure_ascii=False, indent=2)[:400])
    print()
    for q in ['デニムのパンツを作りたい', 'インスタに投稿する', '発注を進める']:
        r = m.classify(q)
        print(f'"{q}" → {r["category"]} (確信度 {r["confidence"]})')
    print()
    print('特徴語:', m.keywords('新作のデニムジャケットの素材を検討する'))
