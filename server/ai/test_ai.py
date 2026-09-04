"""
自作AIエンジンの自動テスト

目的:
  細かい不具合や勘違いで作業が止まらないようにする。
  手で確認すると必ず見落とすので、機械的に検査する。

実行:
  python3 test_ai.py            … 全テスト
  python3 test_ai.py -v         … 詳細表示

ここで検査するのは、過去に実際に起きた不具合を含む。
一度直したものが元に戻っていないか（デグレ）を毎回確かめる。
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# test_chat_engine() が `from chat_engine import ChatEngine` する際、
# chat_engine.py 自身が `import 自分で覚える` 等の日本語名モジュールを
# importする。Syncthing同期でこれらのファイル名が分解済み(NFD)に戻り、
# ModuleNotFoundError でテストが落ちることがあるため、先に直しておく。
# 詳細は nfc_fix.py。
from nfc_fix import 日本語ファイル名をNFCに直す                # noqa: E402
日本語ファイル名をNFCに直す()

from fuzzy import best_match, levenshtein, normalize_loose   # noqa: E402
from knowledge import KnowledgeBase                          # noqa: E402
from learner import OnlineLearner                            # noqa: E402
from semantics import SemanticModel                          # noqa: E402
from similarity import SimilarityEngine                      # noqa: E402
from tokenizer import tokenize                               # noqa: E402
import analyzer                                              # noqa: E402
import rules                                                 # noqa: E402

VERBOSE = '-v' in sys.argv
_results = []


def check(name, condition, detail=''):
    _results.append((name, bool(condition), detail))
    if VERBOSE or not condition:
        mark = '  OK  ' if condition else '  失敗'
        print(f'{mark} {name}' + (f'  … {detail}' if detail and not condition else ''))


# ---------------------------------------------------------------
# トークナイザ
# ---------------------------------------------------------------

def test_tokenizer():
    print('\n[トークナイザ]')

    # 過去の不具合: 「Gジャン」が g と ジャン に割れていた
    t = tokenize('Gジャン', use_ngram=False)
    check('英数字1文字＋カナが1語になる（Gジャン）', 'gジャン' in t, str(t))

    t = tokenize('Tシャツ', use_ngram=False)
    check('Tシャツ が1語になる', 'tシャツ' in t, str(t))

    # 過去の不具合: ひらがなの切れ端が語として残っていた
    t = tokenize('世界観をせれることによりこの服が欲しい', use_ngram=False)
    check('ひらがなの切れ端が語にならない', 'せれることによりこの' not in t, str(t))
    check('内容語は残る（世界観）', '世界観' in t, str(t))

    # 実在するひらがな語は残す
    t = tokenize('こだわりを大切にする', use_ngram=False)
    check('ひらがなの実語が残る（こだわり）', 'こだわり' in t, str(t))

    # N-gram は検索用にだけ出る
    t_ng = tokenize('デニムジャケット', use_ngram=True)
    t_no = tokenize('デニムジャケット', use_ngram=False)
    check('N-gramは use_ngram=True のときだけ出る', len(t_ng) > len(t_no))
    check('全角半角・大小文字を揃える', tokenize('ＡＢＣ', use_ngram=False) == ['abc'])


# ---------------------------------------------------------------
# 学習・分類
# ---------------------------------------------------------------

def test_learner():
    print('\n[学習・分類]')
    m = OnlineLearner()
    data = [
        ('デニムジャケットを制作する 素材はデニム', 'product'),
        ('Tシャツを制作する 素材はコットン', 'product'),
        ('パンツを制作する 素材はデニム', 'product'),
        ('Instagramに商品レビューを投稿する', 'sns'),
        ('TikTokにリール動画を投稿する', 'sns'),
        ('サンプルの発注を今週中に済ませる', 'task'),
        ('生地の見積もりを工場に依頼する', 'task'),
    ]
    for text, cat in data:
        m.learn(text, cat)

    check('学習件数が正しい', m.total_docs == len(data), f'{m.total_docs}')
    check('カテゴリが3つできる', len(m.class_doc_counts) == 3, str(dict(m.class_doc_counts)))

    r = m.classify('コットンのTシャツを作りたい')
    check('商品の文を product と判定', r['category'] == 'product', str(r))

    r = m.classify('インスタに投稿する')
    check('SNSの文を sns と判定', r['category'] == 'sns', str(r))

    # 過去の不具合: 未知語で学習量の少ないカテゴリに偏っていた
    r = m.classify('全く学習していない未知の話題です')
    check('学習外の文は推測せず None を返す', r['category'] is None, str(r))

    # 過去の不具合: N-gram断片が分類を誤らせていた
    r = m.classify('ニュース記事を読む')
    check('無関係な語で誤分類しない', r['category'] is None or r['confidence'] < 0.9, str(r))

    # 確実／推測の区別
    a = m.answer('コットンのTシャツを作りたい')
    check('根拠を返す', len(a['basis']) > 0, str(a))
    check('確信度に応じたラベルが付く', a['certainty'] in ('confirmed', 'guess'), a['certainty'])

    a = m.answer('全く学習していない未知の話題です')
    check('わからない時は unknown', a['certainty'] == 'unknown', str(a))


# ---------------------------------------------------------------
# 忘却
# ---------------------------------------------------------------

def test_forget():
    print('\n[忘却]')
    m = OnlineLearner()
    m.learn('デニムジャケットを制作する', 'product')
    m.learn('ヒミツプロジェクトの新作コート', 'product')

    check('忘れる前は覚えている', 'ヒミツプロジェクト' in m.vocabulary)

    r = m.forget_term('ヒミツプロジェクト')
    check('忘却が成功する', r['forgotten'])
    check('語が消える', 'ヒミツプロジェクト' not in m.vocabulary)

    # 過去の不具合: N-gram断片が残っていた
    残 = [w for w in m.vocabulary if 'ヒミ' in w or 'ミツ' in w or 'ツプ' in w]
    check('N-gram断片も消える', not 残, str(残))
    check('他の学習は無傷', 'デニムジャケット' in m.vocabulary)

    # 文章単位の取り消し
    m2 = OnlineLearner()
    m2.learn('テスト文章です', 'test')
    before = m2.total_docs
    m2.unlearn('テスト文章です', 'test')
    check('文章単位で取り消せる', m2.total_docs == before - 1, f'{before} → {m2.total_docs}')


# ---------------------------------------------------------------
# 意味モデル
# ---------------------------------------------------------------

def test_semantics():
    print('\n[意味モデル]')
    m = SemanticModel(dim=16, min_count=1, window=4)
    corpus = [
        'デニムジャケットを制作する 素材はデニム 色はインディゴ',
        'Gジャンを制作する 素材はデニム 色はインディゴ',
        'デニムジャケットの生地を発注する', 'Gジャンの生地を発注する',
        'Tシャツを制作する 素材はコットン 色はホワイト',
        'カットソーを制作する 素材はコットン 色はホワイト',
        'Tシャツの生地を発注する', 'カットソーの生地を発注する',
        'スニーカーを制作する 素材はレザー', 'パンツを制作する 素材はデニム',
    ]
    for c in corpus:
        m.observe(c)

    r = m.build()
    check('意味モデルを構築できる', r.get('ok'), str(r))

    sims = m.similar_words('デニムジャケット', 3)
    top = sims[0]['term'] if sims else ''
    check('言い換えを発見できる（Gジャン）', 'ジャン' in top, str(sims[:2]))

    # 過去の不具合: 自分の断片が類似語に出ていた
    frags = [s['term'] for s in sims if s['term'] in 'デニムジャケット']
    check('自分の断片が類似語に出ない', not frags, str(frags))

    same = m.text_similarity('デニムジャケットを作る', 'Gジャンを作る')
    diff = m.text_similarity('デニムジャケットを作る', 'スニーカーを作る')
    check('同義の文は高い類似度', same is not None and same > 0.5, str(same))
    check('無関係の文は低い類似度', diff is not None and diff < 0.3, str(diff))

    # 保存して読み直しても壊れない
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
        path = f.name
    m.save(path)
    m2 = SemanticModel(dim=16, min_count=1, window=4)
    ok = m2.load(path)
    m2.build()
    check('保存・再読み込みできる', ok and m2.text_similarity('デニムジャケットを作る', 'Gジャンを作る') is not None)
    os.unlink(path)


# ---------------------------------------------------------------
# 類似判定（似た商品を作らない）
# ---------------------------------------------------------------

def test_similarity():
    print('\n[類似判定]')
    eng = SimilarityEngine()
    eng.add_many([
        {'id': 'TSH001', 'text': 'ベーシックTシャツ 白 厚手コットン', 'attrs': {'item': 'tshirt'}},
        {'id': 'JKT002', 'text': 'デニムジャケット インディゴ ウォッシュデニム', 'attrs': {'item': 'jacket'}},
    ])

    r = eng.compare('デニムジャケット インディゴ ウォッシュ加工', {'item': 'jacket'})
    check('ほぼ同じ商品を block 判定', r['verdict'] == 'block', f"{r['verdict']} {r['topScore']}")

    r = eng.compare('コーチジャケット カーキ ナイロン', {'item': 'coach'})
    check('違う商品は ok 判定', r['verdict'] == 'ok', f"{r['verdict']} {r['topScore']}")

    # 意味モデルを渡すと言い換えも検出できる。
    # build() は語彙10語未満だと構築しないので、テスト用データも
    # それを満たす量を用意する（少なすぎると意味を測れないため）。
    sm = SemanticModel(dim=16, min_count=1, window=4)
    for c in [
        'デニムジャケット 制作 素材 デニム 色 インディゴ',
        'Gジャン 制作 素材 デニム 色 インディゴ',
        'デニムジャケット 生地 発注 工場 依頼',
        'Gジャン 生地 発注 工場 依頼',
        'Tシャツ 制作 素材 コットン 色 ホワイト',
        'カットソー 制作 素材 コットン 色 ホワイト',
        'スニーカー 制作 素材 レザー 工場 依頼',
        'パンツ 制作 素材 デニム 色 ブラック',
    ]:
        sm.observe(c)
    build_result = sm.build()
    check('テスト用の意味モデルが構築できる', build_result.get('ok'), str(build_result))

    eng2 = SimilarityEngine(semantic_model=sm)
    eng2.add('JKT002', 'デニムジャケット インディゴ', {'item': 'jacket'})
    r = eng2.compare('Gジャン インディゴ', {'item': 'jacket'})
    check('意味モデルが類似判定に効いている', r['matches'][0]['semantic'] is not None, str(r['matches'][0]))
    check('言い換えを似ていると判定する', r['verdict'] in ('warn', 'block'), f"{r['verdict']} {r['topScore']}")


# ---------------------------------------------------------------
# 誤字対応
# ---------------------------------------------------------------

def test_fuzzy():
    print('\n[誤字対応]')
    vocab = ['デニムジャケット', 'Tシャツ', 'スウェット', 'スニーカー', 'コーチジャケット']

    cases = [
        ('デニムジャッケト', 'デニムジャケット'),   # 促音の入れ違い
        ('でにむじゃけっと', 'デニムジャケット'),   # ひらがな
        ('ﾃﾞﾆﾑｼﾞｬｹｯﾄ', 'デニムジャケット'),        # 半角カナ
        ('すにーかー', 'スニーカー'),               # ひらがな
        ('コーチジャケト', 'コーチジャケット'),      # 脱字
    ]
    for typo, expect in cases:
        r = best_match(typo, vocab)
        check(f'誤字を認識（{typo}）', r and r['match'] == expect, str(r))

    check('無関係な語には当てはめない', best_match('全然ちがう語', vocab) is None)
    check('編集距離が正しい', levenshtein('kitten', 'sitting') == 3)
    check('表記ゆれを吸収', normalize_loose('ジャケット') == normalize_loose('じゃけっと'))


# ---------------------------------------------------------------
# ルール
# ---------------------------------------------------------------

def test_rules():
    print('\n[ルール]')
    check('違法な内容を拒否', not rules.check('偽ブランドのコピー品を作る')['ok'])
    check('不正アクセスを拒否', not rules.check('他社サイトに不正アクセスする')['ok'])
    check('メールアドレスを拒否', not rules.check('連絡先は test@example.com です')['ok'])
    check('カード番号を拒否', not rules.check('4111 1111 1111 1111')['ok'])
    check('APIキーを拒否', not rules.check('キーは AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345 です')['ok'])
    check('通常の業務内容は通す', rules.check('デニムジャケットの生地を発注する')['ok'])

    # 外部通信の遮断
    import socket
    rules.block_external_network()
    blocked = False
    try:
        s = socket.socket()
        s.settimeout(2)
        s.connect(('example.com', 80))
    except rules.EgressBlocked:
        blocked = True
    except Exception:
        pass
    check('外部への通信が遮断される', blocked)


# ---------------------------------------------------------------
# 知識ベース・分析
# ---------------------------------------------------------------

def test_knowledge():
    print('\n[知識ベース]')
    kb = KnowledgeBase()

    r = kb.add('小ロット生産は原価が2倍になる', 'experience')
    check('自分の経験は確認済みで入る', r['status'] == 'verified', str(r))

    r = kb.add('海外発注は3週間で届く', 'external')
    check('外部AI由来は未検証で入る', r['status'] == 'unverified', str(r))
    ext_id = r['id']

    hits = kb.search('生産の原価')
    check('知識を検索できる', len(hits) > 0, str(hits))

    kb.verify(ext_id, correct=False, note='実際は6週間かかった')
    mistakes = kb.find_mistakes('海外発注の納期')
    check('誤りを記録して呼び出せる', len(mistakes) > 0, str(mistakes))
    check('誤りは削除されず残る', any(e['status'] == 'wrong' for e in kb.entries))

    hits = kb.search('海外発注')
    check('誤りは通常の検索結果に出さない', all(h['status'] != 'wrong' for h in hits))


def test_chat_engine():
    print('\n[会話エンジン]')
    from chat_engine import ChatEngine

    kb = KnowledgeBase()
    kb.add('小ロット生産は原価が2倍になる', 'experience')
    r = kb.add('海外発注は納期3週間で届く', 'external')
    kb.verify(r['id'], correct=False, note='実際は6週間かかった')
    kb.add('国内の工場に発注すると納期2週間で確実だった', 'experience')

    e = ChatEngine(knowledge=kb)
    ctx = {
        'today': '2026-08-16',
        'products': [
            {'name': 'Tシャツ', 'sku': 'T1', 'price': 2500, 'quantity': 2, 'reorderLevel': 5},
            {'name': 'デニムJK', 'sku': 'J1', 'price': 8500, 'quantity': 30, 'cost': 3400},
        ],
        'tasks': [{'title': 'サンプル発注', 'due': '2026-08-14', 'done': False}],
        'events': [],
    }

    r = e.respond('Tシャツの在庫は？', ctx)
    check('在庫を答える', r['ok'] and 'Tシャツ' in r['answer'], r['answer'][:40])

    r = e.respond('デニムJKの原価と粗利は？', ctx)
    check('粗利を計算する', '60.0%' in r['answer'], r['answer'][:60])

    r = e.respond('今日やることは？', ctx)
    check('期限切れを知らせる', '期限' in r['answer'], r['answer'][:40])

    # 持っていない情報は答えない
    r = e.respond('明日の天気は？', ctx)
    check('天気は答えない', not r['ok'] and '天気' in r['answer'], r['answer'][:40])

    r = e.respond('今日のニュースは？', ctx)
    check('ニュースは答えない', not r['ok'], r['answer'][:40])

    # 過去の記録を根拠に助言する
    r = e.respond('海外発注と国内発注どっちがいい？', ctx)
    check('失敗の記録を示す', '6週間' in r['answer'], r['answer'][:60])
    check('成功の記録も示す', '国内の工場' in r['answer'], r['answer'][:60])
    check('判断は本人に委ねる', 'ご自身' in r['answer'])

    # 次にやることを具体的に出す
    r = e.respond('次は何をすればいい？', ctx)
    check('次の一手を出す', r['ok'] and '理由' in r['answer'], r['answer'][:60])


def test_generator():
    print('\n[文章生成]')
    from generator import Generator

    g = Generator()
    r = g.generate('product_description', {
        'name': 'Tシャツ', 'material': 'コットン', 'price': '4500',
        'feature': 'ゆったり着られる一枚に仕上げました',
    })
    check('商品説明を作れる', r['ok'])
    out = r['outputs'][0]
    check('二重語尾にならない', 'ましたです' not in out, out)
    check('価格を桁区切りにする', '4,500' in out, out)

    r = g.generate('order_mail', {'company': 'A社'})
    check('足りない項目を日本語で伝える', not r['ok'] and '品名' in r['message'], str(r.get('message')))


def test_analyzer():
    print('\n[外部AIの分析]')
    kb = KnowledgeBase()
    kb.add('海外発注は3週間で届く', 'external')
    kb.verify(kb.entries[0]['id'], correct=False, note='実際は6週間')

    text = ('海外発注をすれば納期は3週間で届きます。'
            '2024年の市場は8兆円規模でした。'
            'まずは小ロットで試すのがよいでしょう。')
    r = analyzer.analyze(text, knowledge_base=kb)

    check('主張に分解できる', r['total'] == 3, str(r['total']))
    check('数値を含む主張を要確認にする', len(r['needsCheck']) >= 2, str(len(r['needsCheck'])))
    check('意見はそのまま受け取ってよい扱い', len(r['acceptable']) >= 1, str(len(r['acceptable'])))
    check('過去の誤りの繰り返しを検出', len(r['repeatsPastMistake']) >= 1, str(r['repeatsPastMistake']))


# ---------------------------------------------------------------

def main():
    print('=' * 52)
    print(' 自作AIエンジン 自動テスト')
    print('=' * 52)

    for fn in (test_tokenizer, test_learner, test_forget, test_semantics,
               test_similarity, test_fuzzy, test_rules, test_knowledge,
               test_analyzer, test_chat_engine, test_generator):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            check(f'{fn.__name__} が例外で停止', False, f'{type(e).__name__}: {e}')

    passed = sum(1 for _, ok, _ in _results if ok)
    failed = [(n, d) for n, ok, d in _results if not ok]

    print('\n' + '=' * 52)
    print(f' 結果: {passed}/{len(_results)} 件が成功')
    if failed:
        print(f'\n 失敗した項目 ({len(failed)}件):')
        for n, d in failed:
            print(f'   ✗ {n}')
            if d:
                print(f'       {d}')
    else:
        print(' すべて成功しました')
    print('=' * 52)

    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
