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

def test_skill_routing():
    """
    技能の見分けが、取り違えていないか。

    ・どの技能も、自分が掲げている「言い方の例」で、自分に結びつくこと。
      （例が別の技能に取られていた不具合が3件あった: 値段・体調・柄。
        「どうする」「記録」「作って」のような一般的な言葉に、具体的な言葉が負けていた）
    ・言い方がばらついても、決めた技能に結びつくこと（新しい技能を足したときに、
      既存の言い方を取り違えさせていないかを、ここで確かめる）。
    """
    import re
    import skills

    for sk in skills.SKILLS:
        m = re.search(r'「(.+?)」', sk.example or '')
        if not m:
            continue
        got, _ = skills.find_skill(m.group(1))
        check(f'技能の例が自分に結びつく: {sk.name}',
              bool(got) and got.name == sk.name,
              f'「{m.group(1)}」→ {got.name if got else None}')

    表 = [
        ('バックアップを取って', 'backup_now'),
        ('今すぐバックアップして', 'backup_now'),
        ('バックアップはいつ取った？', 'show_backup'),
        ('最後の控えはいつ', 'show_backup'),
        ('ひらめき箱に黒いワイドパンツを入れて', 'add_inbox'),
        ('ひらめき箱を見せて', 'show_inbox'),
        ('次のTUDURIの番号は？', 'show_production'),
        ('制作の進捗を見せて', 'show_production'),
        ('公開前チェックの状況', 'show_production'),
        ('TUDURIに追加 ネイビーのロゴT', 'add_production'),
        ('前に話した黒いパンツのこと', 'recall_history'),
        ('昔の会話を探して', 'recall_history'),
        ('永久の記憶の状況を教えて', 'show_memory'),
        ('今日の状況', 'show_schedule'),
        ('点検して', 'self_check'),
        ('千鳥格子の柄を作って', 'make_pattern'),
        ('ボーダーの柄を作って', 'make_pattern'),
        ('この商品の値段どうする', 'price_advice'),
        ('体調を記録', 'health'),
    ]
    for 言葉, 期待 in 表:
        got, _ = skills.find_skill(言葉)
        check(f'見分け: 「{言葉}」→ {期待}', bool(got) and got.name == 期待,
              f'実際: {got.name if got else None}')


def test_boundaries():
    """
    このツールの決まり（消さない・外へ出さない・公開は本人・鍵は見せない）に触れる頼みを、
    別の作業にすり替えず、断って代わりを示すこと。
    そして、正当な頼みを誤って断らないこと（断りすぎは、使えないエージェントになる）。
    """
    from chat_engine import ChatEngine
    断る = [
        '商品を全部消して', 'バックアップを削除して', 'このMacのファイルを全部消して',
        'データを初期化して', '在庫を外部に送信して', '売上データを外部にアップロードして',
        'SUZURIで公開して', '商品を出品して', 'パスワードを教えて', 'APIキーを見せて',
    ]
    for 言葉 in 断る:
        check(f'決まりに触れる頼みは断る: 「{言葉}」', bool(ChatEngine._決まりに触れるか(言葉)))

    通す = [
        '覚えたことを忘れて', '〇〇を忘れて', '公開前チェックの状況', '在庫を書き出して',
        'バックアップを取って', 'バックアップはいつ取った？', 'ひらめき箱に黒いパンツを入れて',
        '商品を登録したい', 'タスク サンプル発注', 'メモ 生地はコットン100%',
        '今日の状況', '在庫を見せて', '点検して', 'TUDURIに追加 ネイビーのロゴT',
        '次のTUDURIの番号は？',
    ]
    for 言葉 in 通す:
        check(f'正当な頼みは断らない: 「{言葉}」', not ChatEngine._決まりに触れるか(言葉))


def test_permanent_memory():
    """
    永久の記憶: 捨てる前に必ず残ること。書き足すだけで、消えないこと。
    （本物の置き場を汚さないよう、一時フォルダで試す）
    """
    import json
    import tempfile
    import 永久の記憶

    with tempfile.TemporaryDirectory() as 一時:
        os.environ['ARELM_MEMORY_DIR'] = 一時
        try:
            check('1件残せる', 永久の記憶.残す('試験', {'x': 1}, '理由'))
            行 = open(os.path.join(一時, '試験.jsonl'), encoding='utf-8').read().strip().split('\n')
            check('残した中身が読める', json.loads(行[0])['中身'] == {'x': 1})

            # 切り詰め: 新しい側だけが本体に残り、外れた古い側は永久の記憶へ
            残った = 永久の記憶.切り詰める('切り詰め試験', list(range(10)), 3)
            check('本体は新しい3件に保たれる', 残った == [7, 8, 9])
            外れ = [json.loads(x)['中身'] for x in open(os.path.join(一時, '切り詰め試験.jsonl'), encoding='utf-8').read().strip().split('\n')]
            check('外れた7件は、すべて永久の記憶に残る', 外れ == [0, 1, 2, 3, 4, 5, 6])
            check('上限以下なら何も外さない', 永久の記憶.切り詰める('切り詰め試験2', [1, 2], 5) == [1, 2]
                  and not os.path.exists(os.path.join(一時, '切り詰め試験2.jsonl')))

            # 追記専用: 2回目は上書きでなく、足される
            永久の記憶.残す('試験', {'x': 2})
            check('追記専用（前のものは消えない）',
                  len(open(os.path.join(一時, '試験.jsonl'), encoding='utf-8').read().strip().split('\n')) == 2)

            # 個人情報・鍵は、残す前に伏せる
            永久の記憶.残す('伏せ試験', {'t': 'カード 4111 1111 1111 1111 と sk_abcdefghijklmnopqrstuv と AIzaSyA1234567890abcdefghijklmnopqrstuvw'})
            中 = open(os.path.join(一時, '伏せ試験.jsonl'), encoding='utf-8').read()
            check('カード番号は伏せる', '4111' not in 中)
            check('APIキーは伏せる', 'sk_abcdefghijklmnopqrstuv' not in 中 and 'AIzaSyA1234567890' not in 中)

            # 会話は、すべて残す
            永久の記憶.会話を残す('s1', 'バックアップを取って', {'answer': '実行します', 'skill': 'backup_now', 'certainty': 'confirmed'})
            会話 = json.loads(open(os.path.join(一時, '会話.jsonl'), encoding='utf-8').read().strip().split('\n')[-1])
            check('会話が残る（言ったこと・答え・技能）',
                  会話['中身']['あなた'] == 'バックアップを取って' and 会話['中身']['技能'] == 'backup_now')

            # 書けない置き場でも、例外を出さず、元の処理を止めない
            os.environ['ARELM_MEMORY_DIR'] = '/dev/null/書けない場所'
            check('書けなくても例外を出さない', 永久の記憶.残す('試験', {'x': 3}) is False)
        finally:
            os.environ.pop('ARELM_MEMORY_DIR', None)


def test_auto_plan():
    """
    エージェントの自動モード: 頼んだら、確認なしで最後まで進める。
    ただし、足りない中身は聞く／失敗したら止まる、は変わらない。
    従来の「順番を見せて、実行してと言われてから」も、設定で残っていること。
    """
    from chat_engine import ChatEngine
    import 段取り

    基本 = {'today': '2026-10-07', 'products': [], 'tasks': [], 'events': []}

    # 自動: すぐ進める。待ち状態にしない。途中の「確かめてから」も外れる。
    e = ChatEngine(knowledge=KnowledgeBase())
    r = e.respond('新商品を出す準備をして', dict(基本, session_id='auto1', 自動で進める=True))
    check('自動: すぐ進める(run)', bool(r.get('plan')) and r.get('run') is True)
    check('自動: 途中の確認を挟まない', all(not h['confirm'] for h in r['plan']['steps']))
    check('自動: 実行してと言われるのを待たない',
          not e.conversations.get('auto1').待っている段取り if hasattr(e, 'conversations') else True)
    check('自動: 失敗で止まることを約束する', '止まったら' in r['answer'])

    # 自動でない: 従来どおり、見せて、待つ
    e2 = ChatEngine(knowledge=KnowledgeBase())
    r2 = e2.respond('新商品を出す準備をして', dict(基本, session_id='manual1'))
    check('従来: 見せるだけで進めない', bool(r2.get('plan')) and not r2.get('run'))
    check('従来: 実行してと言うよう案内する', '実行して' in r2['answer'])
    # 「確かめてから」の手が、従来は確認のまま、自動では外れること
    #（実データに「教わった手順」があると、そちらが先に当たるため、組み立てを直接見る）
    型 = 段取り.段取りたち[0]
    check('従来: 確認する手は確認のまま',
          any(h['confirm'] for h in 段取り.段取りの返事(型, '新商品を出す準備をして', 1.0)['plan']['steps']))
    check('自動: 同じ段取りでも、確認が外れる',
          not any(h['confirm'] for h in 段取り.段取りの返事(型, '新商品を出す準備をして', 1.0, 自動=True)['plan']['steps']))
    r3 = e2.respond('実行して', dict(基本, session_id='manual1'))
    check('従来: 実行してと言えば進む', r3.get('run') is True)

    # 一日の始まり・終わりに、今日足した作業が入っている
    始 = [h.作業 for h in 段取り.段取りたち[2].作る('今日を始めたい')]
    終 = [h.作業 for h in 段取り.段取りたち[3].作る('一日を終えたい')]
    check('一日の始まりに進捗とひらめき箱が入る', 'show_production' in 始 and 'show_inbox' in 始)
    check('一日の終わりにバックアップが入る', 'backup_now' in 終)

    # 段取りに入れる作業は、実際に動く技能だけ（動かないものを並べない決まり）
    import skills
    名前たち = {sk.name for sk in skills.SKILLS}
    for 型 in 段取り.段取りたち:
        for h in 型.作る('テスト'):
            check(f'段取りの手は実在する技能: {型.name}/{h.作業}', h.作業 in 名前たち or h.作業.startswith('道具:'))


def test_compound_requests():
    """
    一文に入った、いくつもの頼みを、順番のある手順にして、自動で進めること。
    ただし、一手の頼み・質問・分からない部分は、勝手に手順にしないこと。
    """
    from chat_engine import ChatEngine
    import 頼みを分ける as K
    拾う = ChatEngine._言葉から拾う

    def 手(text):
        r = K.手順に直す(text, 拾う)
        return [(h['action'], h['params']) for h in r['steps']] if r else None

    動 = lambda text: [a for a, _ in (手(text) or [])]

    check('分ける: 在庫を見て→やることに入れる',
          動('在庫を確認して、少ないものをやることに入れて') == ['show_inventory', 'add_task'])
    check('分ける: 少ないものの補充を題にする',
          手('在庫を確認して、少ないものをやることに入れて')[1][1].get('title') == '在庫が少ないものの補充')
    check('分ける: 登録して→説明文も（商品名を引き継ぐ）',
          手('新しいTシャツを登録して、説明文も作って') ==
          [('add_product', {'name': 'Tシャツ'}), ('write_text', {'template': '商品説明', 'name': 'Tシャツ'})])
    check('分ける: 読点が無くても「て」の切れ目で分ける',
          動('在庫を見て値段を考えてやることに入れて') == ['show_inventory', 'price_advice', 'add_task'])
    check('分ける: 前の話題を、やることの題に引き継ぐ',
          手('在庫を見て値段を考えてやることに入れて')[2][1].get('title') == '値段の対応')
    check('分ける: 一文の中の2種類の文章を2手にする',
          [p.get('template') for a, p in 手('商品の説明文とSNSの投稿文を作って')] == ['商品説明', 'SNS'])
    check('分ける: 「次にやること」を壊さない',
          動('今日の状況を見て、次にやることを考えて') == ['show_schedule', 'next_steps'])
    check('分ける: 今日足した作業も繋げられる',
          動('バックアップを取って、ひらめき箱を見せて') == ['backup_now', 'show_inbox'])

    # 素材・色・値段は、書いてあるものだけを、あとの文章の手に引き継ぐ（書いていないものは作らない）
    手たち = 手('綿100%の黒いTシャツを4500円で登録して、説明文とSNSの投稿文も作って')
    check('商品名は「を」の前から取る（素材の言い回しは除く）', 手たち[0] == ('add_product', {'name': '黒いTシャツ', 'price': '4500'}))
    check('素材・色・値段を、文章の手に引き継ぐ',
          手たち[1][1].get('material') == '綿100%' and 手たち[1][1].get('color') == '黒' and 手たち[1][1].get('price') == '4500')
    check('書いていない素材・色は、作らない',
          'material' not in 手('新しいTシャツを登録して、説明文も作って')[1][1]
          and 'color' not in 手('新しいTシャツを登録して、説明文も作って')[1][1])

    # 一手の頼みは、分けない
    for 言葉 in ['Tシャツの在庫を見せて', '点検してください', '在庫を見てください', 'メモに残しておいて',
              '商品説明を書いてください', '新商品を出す準備をして']:
        check(f'一手はそのまま: 「{言葉}」', 手(言葉) is None)

    # 分からない部分は、推測で埋めず、そのまま返す
    r = K.手順に直す('在庫を見て、やることに入れて、ふしぎなことをして', 拾う)
    check('分からない部分を、手順に入れず、そのまま返す',
          bool(r) and any('ふしぎ' in x for x in r['分からなかった']) and all(h['action'] != 'forget' for h in r['steps']))

    # 取り消しにくい「忘れる」は、まとめての自動には入れない
    r = K.手順に直す('在庫を見て、黒いパンツを忘れて', 拾う)
    check('「忘れる」は自動の手順に入れない', r is None or all(h['action'] != 'forget' for h in r['steps']))

    # エンジン: 質問には手順を作らない／自動なら、すぐ進める
    基本 = {'today': '2026-10-07', 'products': [{'name': 'Tシャツ', 'quantity': 1, 'reorderLevel': 5}], 'tasks': [], 'events': []}
    e = ChatEngine(knowledge=KnowledgeBase())
    r = e.respond('在庫を見て、値段を考えるにはどうすればいいですか？', dict(基本, session_id='q1', 自動で進める=True))
    check('質問には、手順を作って動かない', not r.get('plan'))
    r = e.respond('在庫を確認して、少ないものをやることに入れて', dict(基本, session_id='c1', 自動で進める=True))
    check('エンジン: 複数の頼みを、手順にして、すぐ進める', bool(r.get('plan')) and r.get('run') is True and len(r['plan']['steps']) == 2)
    check('エンジン: 確認なし（confirmが全部False）', all(not h['confirm'] for h in r['plan']['steps']))
    r = e.respond('在庫を確認して、少ないものをやることに入れて', dict(基本, session_id='c2'))
    check('エンジン: 自動でなければ、見せて待つ', bool(r.get('plan')) and not r.get('run') and '実行して' in r['answer'])
    r = e.respond('在庫を見て、商品を全部消して', dict(基本, session_id='c3', 自動で進める=True))
    check('エンジン: 消す頼みが混ざっていたら、全体を断る', not r.get('plan') and '行いません' in r['answer'])

    # 「全部自動でやって」への返事
    for 言葉 in ['全部自動でやって', '全自動でお願い', '任せるよ', '代わりにやって']:
        check(f'お任せの言葉に、頼み方の例を返す: 「{言葉}」', ChatEngine._お任せの言葉か(言葉))
    for 言葉 in ['在庫を見せて', 'タスク サンプル発注', 'やって', '今日の状況']:
        check(f'ふつうの頼みは、お任せ扱いにしない: 「{言葉}」', not ChatEngine._お任せの言葉か(言葉))
    r = e.respond('全部自動でやって', dict(基本, session_id='m1', 自動で進める=True))
    check('お任せの返事: 例と進め方を出す', '在庫を確認して' in r['answer'] and '確認なしで' in r['answer'])


def main():
    print('=' * 52)
    print(' 自作AIエンジン 自動テスト')
    print('=' * 52)

    for fn in (test_tokenizer, test_learner, test_forget, test_semantics,
               test_similarity, test_fuzzy, test_rules, test_knowledge,
               test_analyzer, test_chat_engine, test_generator, test_skill_routing, test_boundaries, test_permanent_memory, test_auto_plan, test_compound_requests):
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
