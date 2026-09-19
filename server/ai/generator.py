"""
文章生成（ゼロから実装）

方針:
  GPT のような汎用生成はこの規模では作れない。
  そこで「型が決まっている文章」に絞り、確実に実用になるものを作る。

  作れるもの:
    - 商品説明文
    - SNS投稿文
    - 技術パックの説明
    - 発注メールの下書き

  仕組み:
    1. 型（テンプレート）を用意する
    2. 型の中の言い回しを、本人が過去に書いた文章から学んで差し替える
    3. マルコフ連鎖で、学習した語のつながりから自然な語順を作る

  嘘をつかない工夫:
    数値や固有名詞は入力された値をそのまま使い、生成では作らない。
    知らない情報を埋めることは絶対にしない。
"""

import random
import re
from collections import defaultdict

from tokenizer import tokenize


class PhraseLearner:
    """本人が書いた文章から言い回しを学ぶ"""

    def __init__(self):
        # 用途ごとの言い回し集（例: 'product' -> ['着心地がいい', ...]）
        self.phrases = defaultdict(list)
        # マルコフ連鎖用: 語 -> 次に来た語のカウント
        self.chain = defaultdict(lambda: defaultdict(int))
        self.starts = defaultdict(int)

    def learn(self, text, purpose='general'):
        """1文ずつ学ぶ。短すぎるもの・長すぎるものは型にならないので除く。"""
        if not text:
            return 0

        sentences = [s.strip() for s in re.split(r'(?<=[。！？\n])', text) if s.strip()]
        learned = 0

        for s in sentences:
            if not (6 <= len(s) <= 80):
                continue
            self.phrases[purpose].append(s)
            learned += 1

            # 語のつながりを覚える
            words = tokenize(s, use_ngram=False, content_only=False)
            if len(words) < 2:
                continue
            self.starts[words[0]] += 1
            for a, b in zip(words, words[1:]):
                self.chain[a][b] += 1

        return learned

    def pick_phrase(self, purpose, avoid=None):
        """学んだ言い回しから1つ選ぶ。同じものが続かないようにする。"""
        pool = self.phrases.get(purpose) or self.phrases.get('general') or []
        pool = [p for p in pool if p != avoid]
        return random.choice(pool) if pool else None

    def continue_from(self, word, max_words=12):
        """
        ある語から、学んだつながりをたどって続きを作る。
        学習していない語からは何も作らない（勝手に作文しない）。
        """
        if word not in self.chain:
            return None
        out = [word]
        current = word
        for _ in range(max_words):
            nexts = self.chain.get(current)
            if not nexts:
                break
            # よく続いた語ほど選ばれやすくする
            total = sum(nexts.values())
            r = random.uniform(0, total)
            acc = 0
            for w, c in nexts.items():
                acc += c
                if acc >= r:
                    current = w
                    break
            out.append(current)
        return ''.join(out)

    def stats(self):
        return {
            'phrases': {k: len(v) for k, v in self.phrases.items()},
            'chainWords': len(self.chain),
        }


# ------------------------------------------------------------------
# 型（テンプレート）
# ------------------------------------------------------------------

TEMPLATES = {
    'product_description': {
        'label': '商品説明文',
        'required': ['name'],
        'optional': ['material', 'color', 'size', 'feature', 'price'],
        'build': lambda f, tone: _build_product(f, tone),
    },
    'sns_post': {
        'label': 'SNS投稿文',
        'required': ['name'],
        'optional': ['feature', 'price', 'release', 'shop'],
        'build': lambda f, tone: _build_sns(f, tone),
    },
    'order_mail': {
        'label': '発注メールの下書き',
        'required': ['company', 'item', 'quantity'],
        'optional': ['material', 'deadline', 'note'],
        'build': lambda f, tone: _build_order(f, tone),
    },
    'techpack_note': {
        'label': '技術パックの説明',
        'required': ['name'],
        'optional': ['material', 'size', 'sewing', 'note'],
        'build': lambda f, tone: _build_techpack(f, tone),
    },
}

# 語調。本人の書き方に合わせて選べるようにする。
TONES = {
    'polite': {'end': 'です。', 'end2': 'ます。', 'label': 'ていねい'},
    'casual': {'end': '。', 'end2': '。', 'label': 'カジュアル'},
    'minimal': {'end': '', 'end2': '', 'label': '短く'},
}


# 画面に出すときの項目名。英語のキーのまま見せると分かりにくいため。
FIELD_LABELS = {
    'name': '商品名', 'material': '素材', 'color': 'カラー', 'size': 'サイズ',
    'feature': '特徴', 'price': '価格', 'release': '発売日', 'shop': 'ショップ',
    'company': '会社名', 'item': '品名', 'quantity': '数量',
    'deadline': '希望納期', 'note': '備考', 'sewing': '縫製',
}


def _v(fields, key, default=''):
    """入力値を取り出す。無い項目は勝手に埋めない。"""
    val = fields.get(key)
    return str(val).strip() if val not in (None, '') else default


def _end(text, ending):
    """
    文末を整える。
    入力された文がすでに言い切りで終わっている場合に語尾を足すと
    「仕上げましたです。」のような文になるため、そのときは足さない。
    """
    if not text:
        return ''
    stripped = text.rstrip()
    if re.search(r'(です|ます|ました|でした|だ|。|！|？|\.|!|\?)$', stripped):
        # 句点が無いだけなら句点を付ける
        return stripped if re.search(r'[。！？\.!?]$', stripped) else stripped + '。'
    return stripped + ending


def _num(value):
    """数字を読みやすく桁区切りにする。数字でなければそのまま返す。"""
    s = str(value).strip().replace(',', '')
    try:
        return f'{int(s):,}'
    except ValueError:
        return str(value).strip()


def _build_product(f, tone):
    t = TONES.get(tone, TONES['polite'])
    name = _v(f, 'name')
    lines = [f'【{name}】']

    spec = []
    if _v(f, 'material'):
        spec.append(f'素材は{_v(f, "material")}')
    if _v(f, 'color'):
        spec.append(f'カラーは{_v(f, "color")}')
    if _v(f, 'size'):
        spec.append(f'サイズ展開は{_v(f, "size")}')
    if spec:
        lines.append(_end('、'.join(spec), t['end']))

    if _v(f, 'feature'):
        lines.append(_end(_v(f, 'feature'), t['end']))

    if _v(f, 'price'):
        lines.append(_end(f'価格は{_num(_v(f, "price"))}円', t['end']))

    return '\n'.join(lines)


def _build_sns(f, tone):
    name = _v(f, 'name')
    lines = [name]

    if _v(f, 'feature'):
        lines.append('')
        lines.append(_v(f, 'feature'))

    detail = []
    if _v(f, 'release'):
        detail.append(f'発売：{_v(f, "release")}')
    if _v(f, 'price'):
        detail.append(f'価格：¥{_num(_v(f, "price"))}')
    if detail:
        lines.append('')
        lines.extend(detail)

    if _v(f, 'shop'):
        lines.append('')
        lines.append(f'🛍 {_v(f, "shop")}')

    lines.append('')
    lines.append('#ARELM')
    return '\n'.join(lines)


def _build_order(f, tone):
    company = _v(f, 'company')
    item = _v(f, 'item')
    qty = _v(f, 'quantity')

    lines = [
        f'{company} ご担当者様',
        '',
        'いつもお世話になっております。ARELMの小林です。',
        '',
        '下記の通り発注をお願いしたく、ご連絡いたしました。',
        '',
        f'・品名：{item}',
        f'・数量：{qty}',
    ]
    if _v(f, 'material'):
        lines.append(f'・素材：{_v(f, "material")}')
    if _v(f, 'deadline'):
        lines.append(f'・希望納期：{_v(f, "deadline")}')
    if _v(f, 'note'):
        lines += ['', _v(f, 'note')]

    lines += [
        '',
        'ご確認のうえ、お見積もりをいただけますと幸いです。',
        'お手数をおかけしますが、よろしくお願いいたします。',
    ]
    return '\n'.join(lines)


def _build_techpack(f, tone):
    name = _v(f, 'name')
    lines = [f'{name} 仕様', '']
    if _v(f, 'material'):
        lines.append(f'素材：{_v(f, "material")}')
    if _v(f, 'size'):
        lines.append(f'サイズ：{_v(f, "size")}')
    if _v(f, 'sewing'):
        lines.append(f'縫製：{_v(f, "sewing")}')
    if _v(f, 'note'):
        lines += ['', f'備考：{_v(f, "note")}']
    return '\n'.join(lines)


# ------------------------------------------------------------------

class Generator:
    def __init__(self, learner=None):
        self.learner = learner or PhraseLearner()

    def templates(self):
        return [
            {
                'id': k,
                'label': v['label'],
                'required': v['required'],
                'optional': v['optional'],
                'labels': {k: FIELD_LABELS.get(k, k) for k in v['required'] + v['optional']},
            }
            for k, v in TEMPLATES.items()
        ]

    def generate(self, template_id, fields, tone='polite', variations=1):
        tpl = TEMPLATES.get(template_id)
        if not tpl:
            return {'ok': False, 'reason': f'「{template_id}」という型はありません'}

        missing = [k for k in tpl['required'] if not _v(fields, k)]
        if missing:
            # 足りない情報を勝手に作らない。何が要るかを伝える。
            return {
                'ok': False,
                'reason': '情報が足りません',
                'missing': missing,
                'missingLabels': [FIELD_LABELS.get(k, k) for k in missing],
                'message': f'次の項目を教えてください: {"、".join(FIELD_LABELS.get(k, k) for k in missing)}',
            }

        outs = []
        for _ in range(max(1, min(variations, 5))):
            text = tpl['build'](fields, tone)
            outs.append(text)

        # 学習した言い回しがあれば、参考として添える（勝手に混ぜない）
        suggestion = None
        if self.learner:
            purpose = 'product' if template_id.startswith('product') else template_id
            suggestion = self.learner.pick_phrase(purpose)

        return {
            'ok': True,
            'template': tpl['label'],
            'tone': TONES.get(tone, TONES['polite'])['label'],
            'outputs': outs,
            'learnedPhrase': suggestion,
            'note': '数値・固有名詞は入力された値をそのまま使っています。生成では作っていません。',
        }


if __name__ == '__main__':
    g = Generator()

    print('=== 商品説明文 ===')
    r = g.generate('product_description', {
        'name': 'オーバーサイズTシャツ',
        'material': '厚手コットン',
        'color': 'オフホワイト',
        'size': 'S/M/L',
        'feature': '一枚で着ても様になるゆったりとしたシルエットに仕上げました',
        'price': '4500',
    })
    print(r['outputs'][0])

    print('\n=== SNS投稿文 ===')
    r = g.generate('sns_post', {
        'name': 'オーバーサイズTシャツ',
        'feature': '夏の相棒になる一枚',
        'price': '4500',
        'release': '8月20日',
        'shop': 'suzuri.jp/areglm',
    })
    print(r['outputs'][0])

    print('\n=== 発注メール ===')
    r = g.generate('order_mail', {
        'company': '〇〇繊維株式会社',
        'item': 'コットン天竺 20/-',
        'quantity': '50m',
        'material': '綿100%',
        'deadline': '9月10日',
    })
    print(r['outputs'][0])

    print('\n=== 情報が足りないとき ===')
    r = g.generate('order_mail', {'company': '〇〇繊維'})
    print(r['message'])
