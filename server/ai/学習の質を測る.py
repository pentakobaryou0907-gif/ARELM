# -*- coding: utf-8 -*-
"""
学習の質を測る

なぜこれが要るのか:
    前に資料を1,677件まとめて取り込んだところ、
    AIの答えが目に見えて悪くなった。
    そのときは「取り込んだ」ことしか見ておらず、
    質が落ちたことに気づくのが遅れた。

    量を増やせば賢くなるわけではない。
    関係のない文章が混ざると、判断が濁る。

    そこで、取り込むたびにここで測り、
    落ちていたらその場で止められるようにする。

測るもの:
    1. 言い当て       … 分類が当たるか
    2. 言葉のつながり … 関係する語を正しく引けるか
    3. 断る力         … 知らないことを知らないと言えるか
    4. 語彙の汚れ     … 意味を成さない断片が増えていないか

外部へは一切問い合わせない。すべてこの端末の中で完結する。
"""

import 永久の記憶
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from learner import OnlineLearner        # noqa: E402
from semantics import SemanticModel      # noqa: E402
from tokenizer import tokenize           # noqa: E402

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')


# ------------------------------------------------------------------
# 言い当ての試験
#
# ここに並べるのは、この仕事で実際に出てくる言い方だけにしてある。
# 教科書のような一般知識は、このAIの役目ではないため入れない。
# ------------------------------------------------------------------
# 分類は、このAIが実際に学んだ種類で測る。
# 学んでいない種類を正解にすると、いつまでも0点になり、
# 良くなったのか悪くなったのかが分からなくなる。
言い当ての問題 = [
    ('顧客の購買意欲を高める宣伝の方法', 'marketing'),
    ('ターゲット層に向けた販売戦略を考える', 'marketing'),
    ('各国の伝統的な衣装と歴史的な背景', 'culture'),
    ('宗教と民族衣装の関わりについて', 'culture'),
    ('ニューラルネットワークの学習の仕組み', 'ai'),
    ('機械学習のモデルを訓練する手順', 'ai'),
]

# 言葉のつながりの試験。左の語から、右のどれかが引ければ正解。
つながりの問題 = [
    ('在庫', ['商品', '数量', '残り', '管理']),
    ('価格', ['原価', '利益', '値段', '販売']),
    ('デザイン', ['商品', '制作', 'ロゴ', 'プリント']),
]

# 断る力の試験。これらは持っていない情報なので、
# 答えてしまったら「知ったかぶり」になる。
断るべき問い = [
    '明日の天気を教えて',
    '今日のニュースは',
    'フランスの首都はどこ',
]


def 語彙の汚れを測る(learner):
    """
    意味を成さない断片が、どれくらい混ざっているかを見る。

    ここで数えるのは、ひらがなだけ2文字の語。
    「せれ」「ことに」のような、文章を切った残りかすにあたる。
    これが増えると、関係の無い語同士が結びついて判断が濁る。

    @return (割合, 例の並び)
    """
    語たち = list(getattr(learner, 'vocabulary', None) or [])
    if not 語たち:
        return 0.0, []

    かす = []
    for w in 語たち:
        if len(w) == 2 and all('ぁ' <= c <= 'ん' for c in w):
            かす.append(w)

    return len(かす) / len(語たち), かす[:12]


def 測る(learner=None, semantic=None, 静か=False):
    """
    いまの状態を測って、点数を返す。

    @return dict 各項目の成績と、総合点（0.0〜1.0）
    """
    if learner is None:
        learner = OnlineLearner(os.path.join(DATA_DIR, 'ai_model.json'))
        learner.load()

    if semantic is None:
        semantic = SemanticModel()
        p = os.path.join(DATA_DIR, 'ai_semantics.json')
        if os.path.exists(p):
            semantic.load(p)
            semantic.build()

    結果 = {}

    # --- 1. 言い当て ---
    当たり = 0
    外れた = []
    for 文, 正解 in 言い当ての問題:
        r = learner.classify(文)
        if r.get('category') == 正解:
            当たり += 1
        else:
            外れた.append(f'{文} → {r.get("category")}（正解 {正解}）')
    結果['言い当て'] = {
        '点': 当たり / len(言い当ての問題),
        '内訳': f'{当たり}/{len(言い当ての問題)}',
        '外れ': 外れた,
    }

    # --- 2. 言葉のつながり ---
    つ当たり = 0
    つ外れ = []
    for 語, 期待 in つながりの問題:
        try:
            生 = semantic.similar_words(語, top_n=8) or []
            # 返る形が (語, 点) の組の場合と、辞書の場合の両方に備える
            近い = [x['term'] if isinstance(x, dict) else x[0] for x in 生]
        except Exception:
            近い = []
        if any(e in ' '.join(近い) for e in 期待):
            つ当たり += 1
        else:
            つ外れ.append(f'{語} → {近い[:5]}')
    結果['つながり'] = {
        '点': つ当たり / len(つながりの問題),
        '内訳': f'{つ当たり}/{len(つながりの問題)}',
        '外れ': つ外れ,
    }

    # --- 3. 断る力 ---
    #
    # 分類の結果ではなく、実際に返す答えで測る。
    # 「今日のニュースは」を marketing と分類すること自体は
    # 間違いではない（話題としては近い）。
    # 問題になるのは、知らないニュースを答えてしまうことなので、
    # 使う人が受け取る答えを見なければ意味がない。
    from chat_engine import ChatEngine
    ce = ChatEngine(learner=learner, knowledge=None, semantic=semantic)

    断れた = 0
    断れず = []
    for 問 in 断るべき問い:
        try:
            r = ce.respond(問, {'session_id': '測定'})
        except Exception as e:
            断れず.append(f'{問} → 答えられませんでした（{e}）')
            continue
        答え = r.get('answer') or ''
        知らないと言えたか = (
            r.get('certainty') == 'unknown'
            or '分かりません' in 答え
            or '知りません' in 答え
            or 'わかりません' in 答え
        )
        if 知らないと言えたか:
            断れた += 1
        else:
            断れず.append(f'{問} → {答え[:50]}')
    結果['断る力'] = {
        '点': 断れた / len(断るべき問い),
        '内訳': f'{断れた}/{len(断るべき問い)}',
        '外れ': 断れず,
    }

    # --- 4. 語彙の汚れ ---
    汚れ, 例 = 語彙の汚れを測る(learner)
    # 汚れは少ないほどよいので、点は裏返す。
    # 3割を超えたら使いものにならない、という目安で割っている。
    結果['語彙の汚れ'] = {
        '点': max(0.0, 1.0 - 汚れ / 0.3),
        '内訳': f'{汚れ*100:.1f}%',
        '外れ': 例,
    }

    # --- 総合 ---
    # 断る力を重くしているのは、嘘をつかないことが
    # このツールでいちばん大事な約束だから。
    重み = {'言い当て': 0.3, 'つながり': 0.2, '断る力': 0.35, '語彙の汚れ': 0.15}
    総合 = sum(結果[k]['点'] * w for k, w in 重み.items())

    結果['総合'] = round(総合, 3)
    結果['覚えた文'] = getattr(learner, 'total_docs', 0)
    結果['語彙'] = len(getattr(learner, 'vocabulary', []) or [])

    if not 静か:
        表示(結果)

    return 結果


def 表示(結果):
    print('=' * 52)
    print(f' 学習の質  総合 {結果["総合"]:.3f}')
    print(f' 覚えた文 {結果["覚えた文"]} / 語彙 {結果["語彙"]}')
    print('=' * 52)
    for k in ('言い当て', 'つながり', '断る力', '語彙の汚れ'):
        v = 結果[k]
        印 = '○' if v['点'] >= 0.7 else ('△' if v['点'] >= 0.4 else '×')
        print(f'  {印} {k:8s} {v["点"]:.2f}  ({v["内訳"]})')
        for e in v['外れ'][:3]:
            print(f'       - {e}')
    print()


if __name__ == '__main__':
    r = 測る()
    # 前回と比べられるよう、控えを残す
    控え = os.path.join(DATA_DIR, '学習の質の記録.json')
    履歴 = []
    if os.path.exists(控え):
        try:
            履歴 = json.load(open(控え, encoding='utf-8'))
        except Exception:
            履歴 = []
    履歴.append({k: (v if not isinstance(v, dict) else v['点']) for k, v in r.items()})
    json.dump(永久の記憶.切り詰める('学習の質の記録', 履歴, 50), open(控え, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
