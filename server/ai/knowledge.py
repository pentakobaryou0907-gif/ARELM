"""
知識ベース（出所と検証状態つき）

目的:
  作業しながら得た知識を溜めて、後から使えるようにする。
  ただし「どこから来た知識か」「確かめたか」を必ず一緒に記録する。

なぜ出所を残すのか:
  外部AIの回答は、もっともらしい嘘を含むことがある。
  それを検証せずに知識として溜めると、嘘が事実として定着し、
  後の判断を狂わせる。事業の判断に使うなら、これは致命的になる。

  そこで、確かめていない知識は「未検証」のまま保持し、
  参照するときも必ず未検証だと分かるようにする。

出所の種類:
  experience … 自分の経験・実際に起きたこと（最も確か）
  document   … 自分の資料から
  external   … 外部AIの回答（未検証）
  manual     … 自分で直接書いた

検証状態:
  unverified … まだ確かめていない
  verified   … 確かめて正しかった
  wrong      … 確かめたら間違いだった（消さずに残す。同じ誤りを繰り返さないため）
"""

import json
import os
import time
import uuid

import 安全に書く
from tokenizer import tokenize

SOURCE_TRUST = {
    'experience': 1.0,
    'manual': 0.95,
    'document': 0.9,
    'external': 0.3,   # 外部AIは確認するまで信用度を低く扱う
}



# 助詞や、どの文にも出てくる言い回し。
#
# これだけで当たっても、意味の一致にはならない。
# 「〜について」「〜という」は、話の中身と関係なくどこにでも出てくる。
_助詞や言い回し = {
    'ついて', 'について', 'という', 'こと', 'もの', 'ため', 'とき', 'ところ',
    'それ', 'これ', 'あれ', 'ある', 'いる', 'する', 'なる', 'できる',
    'から', 'まで', 'など', 'では', 'には', 'とし', 'によ', 'ので', 'のに',
    'また', 'さらに', 'そして', 'しかし', 'ただ', 'なお', 'つまり',
    '場合', '以上', '以下', '内容', '状況', '状態', '方法', '結果',
}


def _助詞や言い回しか(語):
    if not 語:
        return True
    if 語 in _助詞や言い回し:
        return True
    # ひらがなだけの短い語も、たいてい助詞か活用
    if len(語) <= 3 and all('ぁ' <= c <= 'ん' for c in 語):
        return True
    return False


class KnowledgeBase:
    def __init__(self, path=None, semantic=None):
        # 言葉のつながり。あれば、言い換えでも探せる。
        self.semantic = semantic
        self.path = path
        self.entries = []
        if path and os.path.exists(path):
            self.load()

    # ---------- 追加 ----------

    def add(self, text, source='manual', topic=None, note=None):
        """
        知識を1件追加する。
        外部AI由来のものは自動的に「未検証」になる。
        """
        text = (text or '').strip()
        if not text:
            return {'added': False, 'reason': '内容が空です'}

        if source not in SOURCE_TRUST:
            source = 'manual'

        entry = {
            'id': uuid.uuid4().hex[:12],
            'text': text,
            'source': source,
            # 外部由来は必ず未検証から始める。ここを省略すると嘘が事実に化ける。
            'status': 'unverified' if source == 'external' else 'verified',
            'topic': topic or '',
            'note': note or '',
            'tokens': tokenize(text, use_ngram=True),
            'createdAt': time.time(),
            'verifiedAt': None,
        }
        self.entries.append(entry)
        return {'added': True, 'id': entry['id'], 'status': entry['status']}

    # ---------- 検証 ----------

    def verify(self, entry_id, correct=True, note=None):
        """
        知識を確認した結果を記録する。
        間違っていた場合も削除せず 'wrong' として残す。
        同じ誤りを繰り返さないために、誤りの記録こそ価値がある。
        """
        for e in self.entries:
            if e['id'] == entry_id:
                e['status'] = 'verified' if correct else 'wrong'
                e['verifiedAt'] = time.time()
                if note:
                    e['note'] = note
                return {'ok': True, 'status': e['status']}
        return {'ok': False, 'reason': '該当する知識がありません'}

    def forget(self, entry_id):
        """知識を1件消す"""
        before = len(self.entries)
        self.entries = [e for e in self.entries if e['id'] != entry_id]
        return {'ok': len(self.entries) < before}

    # ---------- 検索 ----------

    def search(self, query, top_n=5, include_unverified=True):
        """
        質問に関係する知識を探す。
        語の重なりで順位をつけ、出所の信用度と検証状態で補正する。

        検索では N-gram も使う。
        漢字が続く語（「海外発注」など）は1語として扱われるため、
        単語だけで比べると記録側の「国内」「発注」と一致せず、
        関係する記録を見落としてしまうため。
        """
        q_tokens = set(tokenize(query, use_ngram=True))
        if not q_tokens:
            return []

        # 助詞や言い回しだけで当たらないようにする。
        #
        # 「生地について」で会計監査の話が出ていた。
        # 「ついて」という助詞だけが当たっていたため。
        #
        # これでは何を聞いても同じ結果が返る。
        # <b>当たった語が助詞だけなら、それは当たっていない</b>。
        中身のある語 = {w for w in q_tokens if not _助詞や言い回しか(w)}
        if 中身のある語:
            q_tokens = 中身のある語

        # 言葉を広げて探す。
        #
        # 「原価は？」と聞かれたとき、
        # 記録に「原価」という字が無ければ、何も見つからなかった。
        # だが「金額」「棚卸資産」と書いてある記録は、同じことを言っている。
        #
        # 覚えたつながりを使えば、言い換えにも届く。
        # つながりは既に作ってあったのに、探すときに使っていなかった。
        # <b>作ってあるものを使っていない</b>のは、いちばんもったいない。
        #
        # 広げた語は、そのままの語より軽く数える。
        # 同じ重みにすると、遠い記録が上に来てしまう。
        広げた = {}
        if getattr(self, 'semantic', None) is not None:
            for 語 in list(q_tokens)[:6]:
                try:
                    for x in self.semantic.similar_words(語, 3):
                        近さ = x.get('similarity', 0)
                        if 近さ >= 0.45:
                            広げた[x['term']] = max(広げた.get(x['term'], 0), 近さ)
                except Exception:
                    # 広げられなくても、そのままの語では探せる。
                    # ここで止めると、検索そのものが動かなくなる。
                    pass

        results = []
        for e in self.entries:
            if not include_unverified and e['status'] == 'unverified':
                continue
            # 間違いと分かったものは通常の検索結果には出さない
            if e['status'] == 'wrong':
                continue

            語たち = set(e['tokens'])
            overlap = q_tokens & 語たち

            # 当たったのが助詞や言い回しだけなら、当たっていないのと同じ
            if overlap and all(_助詞や言い回しか(w) for w in overlap):
                overlap = set()

            # そのままの語で当たらなくても、広げた語で当たるかを見る
            広い当たり = {w: 広げた[w] for w in (set(広げた) & 語たち)}

            if not overlap and not 広い当たり:
                continue

            # そのままの語を主に、広げた語は控えめに足す
            base = len(overlap) / len(q_tokens)
            if 広い当たり:
                足し = sum(広い当たり.values()) / len(q_tokens) * 0.5
                base = min(1.0, base + 足し)
            trust = SOURCE_TRUST.get(e['source'], 0.5)
            if e['status'] == 'verified':
                trust = min(1.0, trust + 0.3)

            # あなた自身について覚えたことは、資料より先に出す。
            #
            # 「コーヒーの好みは？」に、
            # タイ石油公社のコーヒー栽培の話が並んでいた。
            # あなたの好みを聞かれているのに、よその話を出すのは的外れ。
            #
            # 会話から拾ったものは、あなた自身のこと。
            # 資料は、あなた以外のこと。
            # 聞かれているのが、どちらかは、たいてい前者。
            if (e.get('topic') or '').startswith('会話:'):
                trust = min(1.0, trust + 0.5)

            results.append({
                'id': e['id'],
                'text': e['text'],
                'source': e['source'],
                'status': e['status'],
                'topic': e['topic'],
                'score': round(base * trust, 4),
                'matched': sorted(overlap),
                '言い換えで当たった': sorted(広い当たり) if 広い当たり else [],
            })

        # 同じ点なら、あなた自身のことを先に出す。
        #
        # 点は1.00で頭打ちになるので、
        # 「あなたの決めごと」と「よその工場の話」が並ぶことがあった。
        # そのときに、よその話が先に出ていた。
        #
        # 聞かれているのは、たいてい<b>あなた自身のこと</b>。
        results.sort(key=lambda r: (
            -r['score'],
            0 if (r.get('topic') or '').startswith('会話:') else 1,
        ))
        return results[:top_n]

    def find_mistakes(self, query):
        """
        過去に「間違いだった」と記録した知識のうち、
        今の話題に関係するものを返す。同じ失敗を繰り返さないため。
        """
        q_tokens = set(tokenize(query, use_ngram=True))
        if not q_tokens:
            return []

        out = []
        for e in self.entries:
            if e['status'] != 'wrong':
                continue
            overlap = q_tokens & set(e['tokens'])
            if overlap:
                out.append({
                    'id': e['id'],
                    'text': e['text'],
                    'note': e['note'],
                    'matched': sorted(overlap),
                })
        return out

    def summary(self):
        by_source = {}
        by_status = {}
        for e in self.entries:
            by_source[e['source']] = by_source.get(e['source'], 0) + 1
            by_status[e['status']] = by_status.get(e['status'], 0) + 1
        return {
            'total': len(self.entries),
            'bySource': by_source,
            'byStatus': by_status,
        }

    # ---------- 保存 ----------

    def save(self):
        if not self.path:
            return False
        return 安全に書く.書く(self.path, {'entries': self.entries}, indent=1)

    def load(self):
        try:
            with open(self.path, encoding='utf-8') as f:
                self.entries = json.load(f).get('entries', [])
            return True
        except (json.JSONDecodeError, OSError):
            return False


if __name__ == '__main__':
    kb = KnowledgeBase()

    kb.add('デニムの生地は反物で仕入れると1mあたり800円だった', 'experience', topic='仕入れ')
    kb.add('小ロット生産は1着あたりの原価が2倍になる', 'experience', topic='生産')
    kb.add('Tシャツの適正原価は売価の30%程度が一般的', 'external', topic='価格')
    r = kb.add('海外発注は納期が3週間で確実に届く', 'external', topic='生産')
    wrong_id = r['id']

    print('=== 知識の一覧 ===')
    print(json.dumps(kb.summary(), ensure_ascii=False, indent=2))

    print('\n=== 「生産の原価について」で検索 ===')
    for r in kb.search('生産の原価について'):
        mark = '✓確認済' if r['status'] == 'verified' else '⚠未検証'
        print(f'  [{mark}] {r["text"]}  (出所:{r["source"]} スコア{r["score"]})')

    print('\n=== 外部AIの情報が間違いだと判明した場合 ===')
    kb.verify(wrong_id, correct=False, note='実際は6週間かかった。関税で1週間止まった')
    for m in kb.find_mistakes('海外発注の納期'):
        print(f'  ⚠ 過去の誤り: {m["text"]}')
        print(f'     実際: {m["note"]}')
