"""
外部AIの回答を、鵜呑みにせず自分で分析する

目的:
  外部AIの回答をそのまま知識として溜めると、嘘ごと蓄積される。
  そこで一度分解し、「何が書かれているか」を自分で判定してから扱う。

分析する観点:
  1. 主張の切り出し    … 文単位に分け、事実の主張と意見を分ける
  2. 断定度の判定      … 「〜です」と言い切っているか、「〜かもしれない」か
  3. 検証が要る箇所    … 数字・固有名詞・日付を含む主張は裏取りが必要
  4. 自分の知識との矛盾 … 過去に確認した内容と食い違っていないか
  5. 過去の誤りとの一致 … 以前間違いだと分かった内容を繰り返していないか

結果は「採用してよい主張」「要確認の主張」に仕分けて返す。
判断そのものは人が行う。ここでは材料を揃えるだけにする。
"""

import re

from tokenizer import tokenize

# 言い切っている表現。断定しているほど、裏取りの必要が高い。
ASSERTIVE = re.compile(r'(です|である|します|ます|だ|に違いない|必ず|絶対|確実に)[。\.]?$')

# ぼかしている表現。推測として扱ってよい。
HEDGED = re.compile(r'(かもしれ|と思わ|可能性|一般的に|とされ|傾向が|場合が|でしょう|推測)')

# 裏取りが必要な要素
HAS_NUMBER = re.compile(r'\d')
HAS_PERCENT = re.compile(r'[%％]|パーセント')
HAS_MONEY = re.compile(r'[¥$]|円|ドル|万|億')
HAS_DATE = re.compile(r'\d{4}年|\d{1,2}月|\d{1,2}日|昨年|今年|来年')
HAS_PROPER = re.compile(r'[A-Z][a-zA-Z]{2,}|株式会社|社|ブランド|大学|協会')

# 出典を示さずに権威づけする表現。根拠として弱い。
UNSOURCED_AUTHORITY = re.compile(r'(研究によ|調査によ|統計的に|専門家|一般的に言われ|多くの)')


def split_claims(text):
    """回答を主張の単位（文）に分ける"""
    if not text:
        return []
    text = re.sub(r'\s+', ' ', text)
    parts = re.split(r'(?<=[。！？\.\?!])\s*|\n+', text)
    claims = []
    for p in parts:
        p = p.strip(' 　-・*#>')
        if len(p) >= 8:
            claims.append(p)
    return claims


def analyze_claim(claim):
    """1つの主張を分析して、どう扱うべきかを判定する"""
    flags = []
    needs_check = False

    if HAS_NUMBER.search(claim):
        if HAS_PERCENT.search(claim):
            flags.append('割合の数字')
            needs_check = True
        if HAS_MONEY.search(claim):
            flags.append('金額')
            needs_check = True
        if HAS_DATE.search(claim):
            flags.append('日付')
            needs_check = True
        if not flags:
            flags.append('数値')
            needs_check = True

    if HAS_PROPER.search(claim):
        flags.append('固有名詞')
        needs_check = True

    if UNSOURCED_AUTHORITY.search(claim):
        flags.append('出典のない権威づけ')
        needs_check = True

    hedged = bool(HEDGED.search(claim))
    assertive = bool(ASSERTIVE.search(claim)) and not hedged

    if hedged:
        kind = 'opinion'      # ぼかしている＝意見・推測
    elif assertive and needs_check:
        kind = 'fact_claim'   # 言い切っている＋要検証要素あり＝最も危険
    elif assertive:
        kind = 'assertion'    # 言い切っているが検証要素は無い
    else:
        kind = 'statement'

    return {
        'text': claim,
        'kind': kind,
        'assertive': assertive,
        'hedged': hedged,
        'needsCheck': needs_check,
        'flags': flags,
    }


def analyze(text, knowledge_base=None, learner=None):
    """
    外部AIの回答をまるごと分析する。

    knowledge_base を渡すと、自分の知識と突き合わせて
    矛盾や過去の誤りとの一致も調べる。
    """
    claims = split_claims(text)
    if not claims:
        return {'ok': False, 'reason': '分析できる文がありません'}

    analyzed = [analyze_claim(c) for c in claims]

    # 自分の知識・過去の誤りと突き合わせる
    conflicts = []
    repeats_past_mistake = []
    if knowledge_base:
        for a in analyzed:
            for m in knowledge_base.find_mistakes(a['text']):
                # 語の重なりが少ないと偶然一致するので、ある程度重なった時だけ
                if len(m.get('matched', [])) >= 2:
                    repeats_past_mistake.append({
                        'claim': a['text'],
                        'pastMistake': m['text'],
                        'whatActuallyHappened': m.get('note', ''),
                    })

            for hit in knowledge_base.search(a['text'], top_n=2, include_unverified=False):
                if hit['score'] >= 0.5:
                    conflicts.append({
                        'claim': a['text'],
                        'yourKnowledge': hit['text'],
                        'source': hit['source'],
                        'note': '内容が一致しているか、食い違っていないか確認してください',
                    })

    # 自分が学習した語かどうか（知らない話題なら判断材料が無い）
    unknown_topic = False
    if learner:
        all_tokens = set()
        for a in analyzed:
            all_tokens |= set(tokenize(a['text'], use_ngram=False))
        known = [t for t in all_tokens if t in learner.vocabulary]
        unknown_topic = len(known) < max(2, len(all_tokens) * 0.1)

    need_check = [a for a in analyzed if a['needsCheck']]
    safe = [a for a in analyzed if not a['needsCheck']]

    return {
        'ok': True,
        'total': len(analyzed),
        'needsCheck': need_check,
        'acceptable': safe,
        'conflicts': conflicts,
        'repeatsPastMistake': repeats_past_mistake,
        'unknownTopic': unknown_topic,
        'summary': _build_summary(analyzed, need_check, repeats_past_mistake, unknown_topic),
    }


def _build_summary(analyzed, need_check, repeats, unknown_topic):
    """人が読んで判断できる短いまとめ"""
    lines = [f'{len(analyzed)}個の主張に分けました。']

    fact_claims = [a for a in analyzed if a['kind'] == 'fact_claim']
    if fact_claims:
        lines.append(f'うち{len(fact_claims)}個は「言い切っているが裏取りが必要」な主張です。')
    if need_check:
        lines.append(f'{len(need_check)}個に数値・固有名詞などが含まれ、確認が必要です。')
    if repeats:
        lines.append(f'⚠ {len(repeats)}個が、過去に誤りと分かった内容と一致しています。')
    if unknown_topic:
        lines.append('この話題はまだ学習していないため、正しさを判断できません。')
    if not need_check and not repeats:
        lines.append('検証が必要な数値・固有名詞は見つかりませんでした。')

    lines.append('採用するかどうかはご自身で判断してください。')
    return ' '.join(lines)


if __name__ == '__main__':
    from knowledge import KnowledgeBase

    kb = KnowledgeBase()
    kb.add('海外発注は納期が3週間で届く', 'external')
    kb.verify(kb.entries[0]['id'], correct=False, note='実際は6週間かかった')
    kb.add('小ロット生産は原価が2倍になる', 'experience')

    sample = (
        'アパレル業界では一般的に、Tシャツの原価率は30%程度とされています。'
        '海外発注をすれば納期は3週間で届きます。'
        '2024年の国内アパレル市場は8兆円規模でした。'
        'デザインはシンプルなほうが好まれるかもしれません。'
        'まずは小ロットで試すのがよいでしょう。'
    )

    r = analyze(sample, knowledge_base=kb)
    print('=== まとめ ===')
    print(r['summary'])

    print('\n=== 確認が必要な主張 ===')
    for a in r['needsCheck']:
        print(f'  [{a["kind"]}] {a["text"]}')
        print(f'      理由: {"、".join(a["flags"])}')

    print('\n=== そのまま受け取ってよい主張 ===')
    for a in r['acceptable']:
        print(f'  [{a["kind"]}] {a["text"]}')

    if r['repeatsPastMistake']:
        print('\n=== 過去の誤りの繰り返し ===')
        for m in r['repeatsPastMistake']:
            print(f'  ⚠ {m["claim"]}')
            print(f'     過去: {m["pastMistake"]}')
            print(f'     実際: {m["whatActuallyHappened"]}')
