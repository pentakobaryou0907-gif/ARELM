"""
自作AIエンジンのHTTPサーバー

Node側のゲートウェイから呼ばれる。外部への通信は一切行わず、
このプロセス内で完結する（ネットワークにも出ない）。

標準ライブラリのみで実装（Flask等は使わない）。
127.0.0.1 でのみ待ち受けるため、他の端末から直接は届かない。

エンドポイント:
  GET  /health              稼働確認
  POST /learn               1件学習する（使いながら育てる）
  POST /classify            カテゴリを推定
  POST /keywords            特徴語を抽出
  POST /related             関連語を返す
  GET  /summary             学習状況
  POST /similarity/check    似すぎ判定（似た商品を作らないため）
  POST /similarity/index    既存商品を登録し直す
  POST /design/learn-media  写真・動画からファッションの傾向を学ぶ
  POST /design/suggest      学習した傾向からデザイン提案の叩き台を出す
  POST /techpack-deck/build 商品ごとのテックパックスライド（.pptx）を作る
"""

import json
import os
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# すぐ下で `import 自分で覚える` のように、日本語名のモジュールを
# そのまま import している。Syncthing同期（Mac⇄Windows）のたびに
# 日本語ファイル名が分解済み(NFD)へ戻り、Pythonのimportが見つけられなく
# なることがあるため、使う直前にここで直しておく（ファイル名自体をNFCへ
# 戻す・詳細はnfc_fix.py）。_import_fix はその保険として、通常のimportが
# 失敗したときだけ働く、より下の階層での二重の備え（ファイル名を書き換え
# なくても、その場でNFC正規化して探し直す）。
from nfc_fix import 日本語ファイル名をNFCに直す  # noqa: E402
日本語ファイル名をNFCに直す()
import _import_fix                         # noqa: E402,F401  上の直しが効かなかった場合の保険
import analyzer                            # noqa: E402
from chat_engine import ChatEngine         # noqa: E402
from generator import Generator, PhraseLearner  # noqa: E402
import rules                               # noqa: E402
import skills                              # noqa: E402
from knowledge import KnowledgeBase        # noqa: E402
from learner import OnlineLearner          # noqa: E402
import ローカルLLM                          # noqa: E402
import 永久の記憶                          # noqa: E402
from semantics import SemanticModel        # noqa: E402
from similarity import SimilarityEngine    # noqa: E402

# 起動直後に外部通信を遮断する。
# 学習データが万一にも外へ出ないよう、他の処理より先に有効化する。
rules.block_external_network()

HOST = '127.0.0.1'
PORT = int(os.environ.get('AI_PORT', '8765'))


def _アプリの場所():
    """
    自分がどのアプリの中に居るかを、その場で調べる。

    ここは前まで場所を決め打ちしていた。
    アプリを別の場所へ移した途端、
    案内する直し方が存在しない場所を指すようになる。
    自分の位置から遡って探せば、どこへ移っても正しく言える。
    """
    ここ = os.path.abspath(__file__)
    while ここ != '/':
        ここ = os.path.dirname(ここ)
        if ここ.endswith('.app'):
            return ここ
    return '（アプリの外で動いています）'

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
MODEL_PATH = os.path.join(DATA_DIR, 'ai_model.json')
SEMANTIC_PATH = os.path.join(DATA_DIR, 'ai_semantics.json')

# モデルは全リクエストで共有するのでロックで保護する


# ------------------------------------------------------------------
# 保存をまとめる
#
# なぜこうしたか:
#   学習のたびに丸ごと保存していたため、資料を9,669件覚えたあと
#   1回の学習に5秒かかるようになった。
#   その間、会話の返事も待たされ、
#   「返事が来ない」「あとから勝手に話し出す」ように見えていた。
#
#   覚えること自体は一瞬で終わる。重いのは書き出しだけ。
#   そこで、書き出しは間隔をあけてまとめて行う。
#
# 失われないための備え:
#   ・変更があってから最大30秒で必ず書き出す
#   ・終了時にも書き出す
#   最悪でも直近30秒ぶんしか失われない。
# ------------------------------------------------------------------

_保存の間隔 = 30          # 秒
_未保存の変更 = False
_最後に保存した時刻 = 0.0
_保存の鍵 = threading.Lock()


def _あとで保存する():
    """変更があったことだけ記録する。書き出しは別に行う。"""
    global _未保存の変更
    _未保存の変更 = True


def _必要なら保存する(強制=False):
    """間隔があいていれば書き出す。呼ばれても毎回書くわけではない。"""
    global _未保存の変更, _最後に保存した時刻
    if not _未保存の変更 and not 強制:
        return False
    now = time.time()
    if not 強制 and (now - _最後に保存した時刻) < _保存の間隔:
        return False

    with _保存の鍵:
        learner.save()
        semantic.save(SEMANTIC_PATH)
        _未保存の変更 = False
        _最後に保存した時刻 = now
    return True


def _保存を見張る():
    """一定間隔で書き出す見張り。表の処理を止めないよう別で動かす。"""
    while True:
        time.sleep(5)
        try:
            _必要なら保存する()
        except Exception:
            # 書き出しに失敗しても、動き続けることを優先する。
            # 次の機会に書き出せばよい。
            pass

_lock = threading.Lock()
learner = OnlineLearner(MODEL_PATH)

# --- 画像を作る仕事の置き場 ---
#
# ComfyUI での画像生成は数分かかる。
# ふつうの /chat のように「聞いて、すぐ答えが返る」形にはできない。
# なので、頼まれたらすぐ番号を返し、裏の別スレッドで作らせ、
# 画面側はその番号で「できたか」を聞きに来る形にする。
_画像の仕事たち = {}
_画像の仕事の鍵 = threading.Lock()


def _画像を裏で作る(仕事id, プロンプト, 幅, 高さ):
    import 画像を作る
    結果 = 画像を作る.作る(プロンプト, 幅, 高さ)
    with _画像の仕事の鍵:
        if 仕事id in _画像の仕事たち:
            _画像の仕事たち[仕事id].update(結果)
            _画像の仕事たち[仕事id]['終わったか'] = True

# 意味モデル: 作業しながら共起を溜め、一定件数ごとに再学習する
semantic = SemanticModel()
if semantic.load(SEMANTIC_PATH):
    # load() は共起データを戻すだけで、語ベクトルは作らない。
    # 起動直後から言い換えを検出できるよう、ここで組み直しておく。
    semantic.build()

similarity = SimilarityEngine(semantic_model=semantic)

# 知識ベース: 作業しながら得た知識を、出所と検証状態つきで溜める
KNOWLEDGE_PATH = os.path.join(DATA_DIR, 'ai_knowledge.json')
# 言葉のつながりを渡す。
#
# 渡さないと、記録を探すときに言い換えが効かない。
# 「原価は？」と聞かれて、
# 「金額」と書いてある記録を見落としていた。
knowledge = KnowledgeBase(KNOWLEDGE_PATH, semantic=semantic)

# 文章生成: 型に本人の言い回しを重ねる。外部AIは使わない。
phrase_learner = PhraseLearner()
generator = Generator(phrase_learner)

# 会話エンジン: 自分のデータから答える。知らないことは答えない。
chat_engine = ChatEngine(learner=learner, knowledge=knowledge, semantic=semantic)

# あえて起動時には ローカルLLM.温めておく() を呼ばない。
#
# 一度は「起動直後に裏で温めておく」形にしたが、そうすると
# アプリを開いただけで（実際にエージェントへ話しかけていなくても）
# 5GB近いモデルがGPUメモリに乗ってしまい、「PCへの負担が大きい」との
# 指摘につながった。ローカルLLM.聞く() 側はすでに制限時間を設けていない
# ため、実際に話しかけられた最初の一言が多少待たされるだけで、
# 使っていない間はこの端末に何も負担をかけない今の形のほうに合わせる。

# 何件ごとに意味モデルを組み直すか。
# SVDは毎回やると重いので、溜まってから一括で行う。
REBUILD_EVERY = 10
_observations_since_build = 0


def _maybe_rebuild_semantics(force=False):
    """
    作業のたびに共起は溜まるが、SVDは重いので毎回は回さない。
    一定件数たまったとき、または明示的に指示されたときに組み直す。
    """
    global _observations_since_build
    if not force and _observations_since_build < REBUILD_EVERY:
        return None
    result = semantic.build()
    if result.get('ok'):
        _observations_since_build = 0
        semantic.save(SEMANTIC_PATH)
    return result


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get('Content-Length') or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except json.JSONDecodeError:
            return {}

    def _speech_to_text(self):
        """
        音声（生のバイト列）を受け取り、この端末の中だけで文字にする。

        一時ファイルに書き出して渡し、終わったら必ず消す
        （途中で失敗しても、finally で消す）。
        """
        import os
        import tempfile
        import 音声を文字にする

        length = int(self.headers.get('Content-Length') or 0)
        if not length:
            return self._send(400, {'ok': False, 'text': '', 'reason': '音声が届いていません'})

        音 = self.rfile.read(length)

        仮ファイル = tempfile.NamedTemporaryFile(suffix='.audio', delete=False)
        try:
            仮ファイル.write(音)
            仮ファイル.close()
            結果 = 音声を文字にする.文字にする(仮ファイル.name)
            return self._send(200, 結果)
        except Exception as e:
            return self._send(500, {'ok': False, 'text': '', 'reason': str(e)})
        finally:
            try:
                os.unlink(仮ファイル.name)
            except OSError:
                pass

    def _extract_document_text(self):
        """
        資料（PDF/Word/PowerPoint/テキスト）の生のバイト列を受け取り、
        この端末の中だけで本文を取り出す。

        既存の一括取り込み（ingest.py の extract_text）と同じ処理を、
        チャットへその場で添付したときにも使えるようにする。
        音声と同じく、一時ファイルへ書き出して渡し、必ず消す。
        """
        import os
        import tempfile
        import ingest

        拡張子 = (self.headers.get('X-File-Ext') or '').lower()
        許可 = {'.pdf', '.docx', '.pptx', '.txt', '.md', '.csv'}
        if 拡張子 not in 許可:
            return self._send(400, {'ok': False, 'text': '', 'reason': f'対応していない形式です: {拡張子}'})

        length = int(self.headers.get('Content-Length') or 0)
        if not length:
            return self._send(400, {'ok': False, 'text': '', 'reason': 'ファイルが届いていません'})
        if length > 20 * 1024 * 1024:
            return self._send(400, {'ok': False, 'text': '', 'reason': 'ファイルが大きすぎます（20MBまで）'})

        中身 = self.rfile.read(length)

        仮ファイル = tempfile.NamedTemporaryFile(suffix=拡張子, delete=False)
        try:
            仮ファイル.write(中身)
            仮ファイル.close()
            本文 = ingest.extract_text(仮ファイル.name)
            if not 本文.strip():
                return self._send(200, {'ok': False, 'text': '', 'reason': '本文を読み取れませんでした（画像だけのPDF等の可能性があります）'})
            上限 = 8000
            切れたか = len(本文) > 上限
            return self._send(200, {'ok': True, 'text': 本文[:上限], 'truncated': 切れたか})
        except Exception as e:
            return self._send(500, {'ok': False, 'text': '', 'reason': str(e)})
        finally:
            try:
                os.unlink(仮ファイル.name)
            except OSError:
                pass

    def log_message(self, fmt, *args):
        # アクセスログは出さない（学習内容が漏れないように）
        pass

    def do_GET(self):
        if self.path == '/health':
            return self._send(200, {'ok': True, 'service': 'ARELM AI Engine', 'local': True})

        # ---- 司令塔（席を外しても進める列）----
        if self.path == '/hq/list':
            import 司令塔
            return self._send(200, {
                'ok': True,
                '一覧': 司令塔.一覧を得る(),
                '決まり': 司令塔.決まりを読む(),
            })

        if self.path.startswith('/hq/memory'):
            import 司令塔
            from urllib.parse import urlparse, parse_qs
            係 = (parse_qs(urlparse(self.path).query).get('係') or [''])[0]
            return self._send(200, {'ok': True, '記憶': 司令塔.記憶を出す(係)})

        # ---- チーム（係で手分けして、実際の操作を進める）: 係の一覧 ----
        if self.path == '/team/roster':
            import チーム
            import 係たち
            return self._send(200, {
                'ok': True, '司令': チーム.司令, '係たち': チーム.一覧(),
                '働かせ方': 係たち.働かせ方たち,
                '使える作業': sorted(チーム.使える作業の名前と題().items()),
            })

        # ---- マルチエージェント化 第2段: 裏で進めている作業の一覧 ----
        if self.path == '/agent-task/list':
            import バックグラウンド作業
            return self._send(200, {'ok': True, '一覧': バックグラウンド作業.一覧を得る()})

        if self.path == '/speech-to-text-status':
            import 音声を文字にする
            return self._send(200, 音声を文字にする.状態を返す())

        if self.path.startswith('/image/status'):
            # 画像作りは数分かかるので、番号で「できたか」を聞きに来てもらう。
            from urllib.parse import urlparse, parse_qs
            仕事id = (parse_qs(urlparse(self.path).query).get('id') or [''])[0]
            with _画像の仕事の鍵:
                仕事 = _画像の仕事たち.get(仕事id)
            if not 仕事:
                return self._send(404, {'ok': False, '訳': 'その番号の仕事が見つかりません'})
            return self._send(200, dict(仕事))

        if self.path.startswith('/brand-memory'):
            # ブランドの記憶を読む。ブランド名は ?brand= で渡す。
            from urllib.parse import urlparse, parse_qs
            import ブランドの記憶
            クエリ = parse_qs(urlparse(self.path).query)
            ブランド = (クエリ.get('brand') or [''])[0]
            if not ブランド:
                return self._send(200, {'ブランド一覧': ブランドの記憶.既知のブランド一覧()})
            return self._send(200, {'記録': ブランドの記憶.読む(ブランド, 20)})

        if self.path == '/faq':
            import よくある質問
            return self._send(200, {'一覧': よくある質問.一覧を出す()})

        if self.path == '/generate/templates':
            with _lock:
                return self._send(200, {'templates': generator.templates()})

        if self.path == '/writable':
            # 覚えたことを、本当に書き出せるか。
            #
            # macOS は、隔離の印が付いたアプリを
            # 書き込めない場所（AppTranslocation）で動かすことがある。
            # そうなると学習は動いているように見えて、
            # 保存のたびに黙って失敗し、覚えたことが全部消えていた。
            #
            # 「動いています」と言いながら何も残っていない、という
            # いちばんたちの悪い壊れ方なので、外から確かめられるようにする。
            試し = os.path.join(os.path.dirname(MODEL_PATH), '.書けるか試し')
            場所 = os.path.dirname(os.path.abspath(MODEL_PATH))
            translocated = 'AppTranslocation' in 場所
            try:
                with open(試し, 'w') as f:
                    f.write('ok')
                os.remove(試し)
                書ける = True
                訳 = ''
            except Exception as e:
                書ける = False
                訳 = str(e)

            return self._send(200, {
                '書ける': 書ける,
                '場所': 場所,
                '隔離された場所で動いている': translocated,
                '訳': 訳,
                '直し方': (
                    'ターミナルで次を実行してください:\n'
                    f'xattr -dr com.apple.quarantine "{_アプリの場所()}"\n'
                    'そのあとアプリを開き直してください。'
                ) if not 書ける else '',
            })

        if self.path == '/topics':
            # 覚えた資料の中から、ファッションに近い話題を拾う。
            #
            # 旧サイトはここで外のニュースを取ってくる作りだったが、
            # 外へ出ない決まりなので、その枠は永久に埋まらなかった。
            # 向きを変えて、すでに覚えているものの中から拾う。
            import 話題
            with _lock:
                return self._send(200, 話題.拾う(learner, semantic, 12))

        if self.path == '/self-review':
            # 自分を見て、良くする案を出す。
            # コードは書き換えない。ふるまいとデータだけを見る。
            import 自分を良くする
            使われ方 = {}
            履歴 = []
            try:
                q = self.path.split('?', 1)
                _ = q
            except Exception:
                pass
            with _lock:
                return self._send(200, 自分を良くする.見立てる(
                    learner, semantic, 使われ方, 履歴))

        if self.path == '/learned-tasks':
            # あなたが教えた作業の一覧と、いま並べられる作業
            import 覚えた作業
            return self._send(200, {
                '覚えた作業': 覚えた作業.一覧を出す(),
                '並べられる作業': [
                    {'action': x.action, 'label': x.label, 'summary': x.summary}
                    for x in skills.SKILLS
                    if x.action not in 覚えた作業.覚えない作業
                ],
                # 何にでも使える道具。
                # 決まった作業だけでは「何でも」に届かないので、
                # 組み合わせられる部品として渡す。
                '道具': [
                    {'action': '道具:' + d, 'label': d, 'summary': 説}
                    for d, 説 in [
                        ('読む', 'データを見る（商品・やること・メモなど）'),
                        ('書く', '足す・直す（消すことはできません）'),
                        ('数える', '合計・平均・最大・最小・件数を出す'),
                        ('探す', '全部の中から言葉で探す'),
                        ('比べる', '数を比べて、続けるかを決める'),
                        ('知らせる', '画面に出す'),
                        ('開く', '画面を切り替える'),
                        ('書き出す', 'CSVにして手元に落とす'),
                    ]
                ],
            })

        if self.path == '/plans':
            # まとめての仕事の見分け方を、画面側にも渡す。
            #
            # 画面側は「在庫」などの言葉で先に操作へ振り分けている。
            # そのせいで「在庫を整えて」が、ただ在庫画面を開くだけになり、
            # 段取りまで届かなかった。
            #
            # 同じ言葉の並びを画面側にも持たせると、
            # 片方を直したときにもう片方が古いままになる。
            # だから、ここから渡して一か所にまとめる。
            import 段取り
            return self._send(200, {
                'plans': [
                    {'name': p.name, 'label': p.label,
                     'summary': p.summary, 'words': p.words}
                    for p in 段取り.段取りたち
                ],
                'requestWords': 段取り.頼まれ方,
                'requestEndings': list(段取り.頼みの語尾),
                'questionEndings': list(段取り.問いの語尾),
            })

        if self.path == '/summary':
            with _lock:
                s = learner.summary()
                s['knowledge'] = knowledge.summary()
                return self._send(200, s)
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        # 音声はJSONではなく生のバイト列で届く。
        # self._body() は中身をJSONとして読もうとして、
        # そのままではストリームを消費してしまうので、
        # 他の道より先に、ここで別扱いにする。
        if self.path == '/speech-to-text':
            return self._speech_to_text()

        if self.path == '/extract-document-text':
            return self._extract_document_text()

        data = self._body()

        try:
            if self.path == '/learn':
                text = (data.get('text') or '').strip()
                if not text:
                    return self._send(400, {'error': 'text が必要です'})

                # ルール違反の内容はモデルに残さない
                verdict = rules.check(text)
                if not verdict['ok']:
                    return self._send(200, {
                        'learned': False,
                        'blocked': True,
                        'kind': verdict['kind'],
                        'reason': verdict['reason'],
                    })

                with _lock:
                    global _observations_since_build
                    result = learner.learn(text, data.get('category'), int(data.get('weight', 1)))
                    # 書き出しはまとめて行う。毎回書くと1回5秒かかり、
                    # 会話の返事まで待たされてしまうため。
                    _あとで保存する()

                    # 作業内容をそのまま意味モデルにも流し込む
                    if semantic.observe(text):
                        _observations_since_build += 1
                        rebuilt = _maybe_rebuild_semantics()
                        if rebuilt:
                            result['semanticRebuilt'] = rebuilt
                    result['semanticPending'] = _observations_since_build
                return self._send(200, result)

            if self.path == '/forget':
                # 忘れる対象の指定方法:
                #   text     … その文章で学習した内容を取り消す
                #   term     … その語を完全に消す
                #   category … そのカテゴリごと消す
                #   all=true … 全部消す
                # 「忘れる」は、本体から取り除くだけにして、取り除く前の状態は永久の記憶に残す。
                永久の記憶.残す('忘れる操作', {k: data.get(k) for k in ('all', 'term', 'category', 'text') if data.get(k)},
                              'あなたの指示で忘れた（このあと本体から取り除く）')
                if data.get('all') or data.get('category'):
                    永久の記憶.ファイルを写して残す('学習の状態', MODEL_PATH)
                with _lock:
                    if data.get('all'):
                        result = learner.forget_all()
                        semantic.forget_all()
                    elif data.get('term'):
                        term = data['term']
                        result = learner.forget_term(term)
                        result['semanticRemoved'] = semantic.forget_term(term)
                    elif data.get('category'):
                        result = learner.forget_category(data['category'])
                    elif data.get('text'):
                        result = learner.unlearn(data['text'], data.get('category'))
                        semantic.unobserve(data['text'])
                    else:
                        return self._send(400, {'error': 'text / term / category / all のいずれかが必要です'})

                    learner.save()
                    semantic.build()
                    semantic.save(SEMANTIC_PATH)
                return self._send(200, result)

            # ---- 会話（自作・自分のデータから答える）----
            if self.path == '/self-review':
                # 使われ方と履歴は画面側が持っているので、送ってもらう
                import 自分を良くする
                with _lock:
                    return self._send(200, 自分を良くする.見立てる(
                        learner, semantic,
                        data.get('使われ方') or {},
                        data.get('履歴') or []))

            if self.path == '/learned-tasks':
                # 新しい作業を覚える／忘れる
                import 覚えた作業
                if data.get('忘れる'):
                    return self._send(200, 覚えた作業.忘れる(data['忘れる']))
                return self._send(200, 覚えた作業.覚える(
                    data.get('名前'), data.get('手順') or [], data.get('呼び方')))

            if self.path == '/deal-check':
                # 道の名前は英字にしてある。
                # 日本語にしたところ、ブラウザ側で符号化されて
                # ここの文字と一致せず、404 になっていた。
                # 貼り付けられた取引の文面に、危ない兆しが無いかを見る。
                # 文面はここで見るだけで、外部へは一切送らない。
                import 取引の危なさ
                結果 = 取引の危なさ.見る(data.get('text') or '', data.get('相手') or '')
                結果['文'] = 取引の危なさ.文にする(結果)
                return self._send(200, 結果)

            if self.path == '/faq':
                import よくある質問
                結果 = よくある質問.追加する(data.get('問'), data.get('答'))
                return self._send(200, 結果)

            if self.path == '/customer-reply':
                # お客様からの問い合わせに、返信の下書きを作る（AI受付の最小版）。
                # 自分からは何も送らない。文面を作るだけ。
                import よくある質問
                質問 = (data.get('質問') or '').strip()
                if not 質問:
                    return self._send(400, {'ok': False, '訳': '質問文が必要です'})

                verdict = rules.check(質問)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, '訳': verdict['reason']})

                結果 = よくある質問.返信を作る(
                    質問, data.get('商品一覧') or [], data.get('ブランド') or 'ARELM')
                return self._send(200, 結果)

            if self.path == '/sns/generate':
                # 商品情報とトーンから、投稿文を複数パターン作る。
                import SNS文章
                商品情報 = (data.get('商品情報') or '').strip()
                if not 商品情報:
                    return self._send(400, {'ok': False, '訳': '商品情報が必要です'})

                verdict = rules.check(商品情報)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, '訳': verdict['reason'], 'パターン': []})

                結果 = SNS文章.パターンを作る(
                    商品情報, data.get('トーン') or 'カジュアル', int(data.get('件数') or 3),
                    data.get('型') or 'キャプション')
                return self._send(200, 結果)

            if self.path == '/sns/carousel':
                # カルーセル投稿（複数枚スライド）の構成（フック＋各スライドの見出し・本文）を作る。
                import SNS文章
                商品情報 = (data.get('商品情報') or '').strip()
                if not 商品情報:
                    return self._send(400, {'ok': False, '訳': '商品情報が必要です'})

                verdict = rules.check(商品情報)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, '訳': verdict['reason'], 'フック': '', 'スライド': []})

                結果 = SNS文章.カルーセル構成を作る(
                    商品情報, data.get('トーン') or 'カジュアル', int(data.get('枚数') or 5))
                return self._send(200, 結果)

            if self.path == '/advisor/today':
                # 今の状況（クライアントが在庫・SNS・タスク等から作った文章）から、
                # 今日いちばん大事なことを3つだけ選ぶ。JARVISモードの
                # 起動時ブリーフィングとは別の、もう一段深い「優先順位付け」用。
                import アドバイザー
                状況 = (data.get('状況') or '').strip()
                if not 状況:
                    return self._send(400, {'ok': False, '訳': '状況が必要です'})

                verdict = rules.check(状況)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, '訳': verdict['reason'], '答え': ''})

                結果 = アドバイザー.今日の優先順位を選ぶ(状況)
                return self._send(200, 結果)

            if self.path == '/brand-memory':
                # ブランドの記録を1件足す（記録テーブルへの手入力・自動保存の両方から使う）
                import ブランドの記憶
                ブランド = (data.get('ブランド') or '').strip()
                内容 = (data.get('内容') or '').strip()
                if not ブランド or not 内容:
                    return self._send(400, {'ok': False, '訳': 'ブランドと内容が必要です'})

                verdict = rules.check(内容)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, '訳': verdict['reason']})

                結果 = ブランドの記憶.記録する(ブランド, 内容, data.get('種類') or '気づき')
                return self._send(200, 結果)

            if self.path == '/image/start':
                # 商品アイディアなどの画像を、この端末の中の ComfyUI で作る。
                # 外部の画像生成APIは使わない。
                プロンプト = (data.get('プロンプト') or '').strip()
                if not プロンプト:
                    return self._send(400, {'error': 'プロンプト が必要です'})

                verdict = rules.check(プロンプト)
                if not verdict['ok']:
                    return self._send(200, {
                        'ok': False, 'blocked': True, '訳': verdict['reason'],
                    })

                import uuid as _uuid
                仕事id = _uuid.uuid4().hex[:12]
                幅 = int(data.get('幅') or 1024)
                高さ = int(data.get('高さ') or 1024)

                with _画像の仕事の鍵:
                    _画像の仕事たち[仕事id] = {
                        'ok': None, '終わったか': False, '訳': '作っています…',
                        'プロンプト': プロンプト,
                    }

                threading.Thread(
                    target=_画像を裏で作る, args=(仕事id, プロンプト, 幅, 高さ),
                    daemon=True,
                ).start()

                return self._send(200, {
                    '仕事id': 仕事id,
                    '訳': '画像を作り始めました。この端末のモデルなので数分かかります。',
                })

            if self.path == '/remote-task/step':
                # エージェントの指示で、遠隔操作の画面から一手だけ自動で動く。
                #
                # 実際に操作を行うのは Node 側（パソコンを操る.js・
                # ブラウザを操る.js）。ここでは「次に何をするか」だけを
                # ローカルLLMに決めてもらう。危ない指示は先に断る。
                目的 = (data.get('目的') or '').strip()
                if not 目的:
                    return self._send(400, {'error': '目的 が必要です'})

                verdict = rules.check(目的)
                if not verdict['ok']:
                    return self._send(200, {
                        'する': False, '終わり': True, 'blocked': True,
                        '訳': verdict['reason'],
                    })

                import リモート作業
                with _lock:
                    決めた = リモート作業.一手を決める(
                        目的,
                        data.get('これまで') or [],
                        data.get('使える作業') or [],
                        画面=data.get('画面'),
                        上限=data.get('上限'),
                    )
                return self._send(200, 決めた)

            # ---- 司令塔（席を外しても進める列）----
            if self.path == '/hq/submit':
                import 司令塔
                本文 = (data.get('text') or '').strip()
                if not 本文:
                    return self._send(400, {'ok': False, '訳': '頼みを入れてください'})
                verdict = rules.check(本文)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, '分かった': False, '訳': verdict['reason']})
                return self._send(200, 司令塔.仕事を受ける(本文, 定時=bool(data.get('定時'))))

            if self.path == '/hq/advance':
                import 司令塔
                司令塔.定時を積む()
                return self._send(200, 司令塔.進める(data.get('同期')))

            if self.path == '/hq/result':
                import 司令塔
                return self._send(200, 司令塔.結果を入れる(data.get('id'), data.get('番号'), data.get('結果') or {}))

            if self.path == '/hq/approve':
                import 司令塔
                return self._send(200, 司令塔.門に答える(data.get('id'), data.get('よい') is not False, data.get('番号')))

            if self.path == '/hq/cancel':
                import 司令塔
                return self._send(200, 司令塔.取り消す(data.get('id')))

            if self.path == '/hq/rules':
                import 司令塔
                if data.get('決まり') is not None:
                    return self._send(200, 司令塔.決まりを書く(data.get('決まり')))
                return self._send(200, {'ok': True, '決まり': 司令塔.決まりを読む()})

            # ---- チーム: 頼んだら誰がやるかの下見（動かさない）----
            if self.path == '/team/preview':
                import チーム
                import 段取り
                import 頼みを分ける
                発言 = (data.get('text') or '').strip()
                if not 発言:
                    return self._send(400, {'ok': False, '訳': '頼みを入れてください'})
                本文 = チーム.チーム言葉を除く(発言) or 発言
                段 = None
                結果 = 頼みを分ける.手順に直す(本文, ChatEngine._言葉から拾う) if 段取り.頼まれているか(本文) else None
                if 結果:
                    段 = {'label': f'頼まれた作業（{len(結果["steps"])}手）', 'summary': '', 'steps': 結果['steps']}
                else:
                    段 = チーム.一手だけの段取り(発言, ChatEngine._言葉から拾う)
                if not 段:
                    return self._send(200, {'ok': True, '分かった': False,
                                            '訳': '頼みを、動かせる作業として読み取れませんでした。「〜して」の形で、もう少し具体的に書いてみてください。'})
                チーム化 = チーム.チームにする(段)
                if not チーム化:
                    return self._send(200, {'ok': True, '分かった': False,
                                            '訳': '受け持つ係のいない作業が含まれています。この頼みは、チームではなく、これまでどおり一人で進めます。'})
                return self._send(200, {'ok': True, '分かった': True, '段取り': チーム化,
                                        '分からなかった': (結果 or {}).get('分からなかった', [])})

            # ---- チーム: 係を足す・外す（足せるのは「相談」の見方まで。専任の作業は、はじめの係だけ）----
            if self.path == '/team/agent/add':
                import チーム
                return self._send(200, チーム.係を足す(
                    data.get('名前'), data.get('得意'), data.get('呼ばれる言葉'),
                    data.get('受け持つ作業'), data.get('見方')))

            if self.path == '/team/agent/remove':
                import チーム
                return self._send(200, チーム.係を外す(data.get('名前')))

            # ---- 一文に、いくつもの頼みが入っているか（画面側が、会話へ回すか決めるために聞く）----
            #
            # 「在庫を確認して、少ないものをやることに入れて」は、画面側のキーワード・
            # 一つの操作を選ぶ判定に先に取られ、在庫画面を開くだけで終わっていた。
            # 複数の頼みなら、先に会話（手順にして自動で進める）へ回してもらう。
            if self.path == '/split-request':
                import 段取り
                import 頼みを分ける
                発言 = (data.get('text') or '').strip()
                結果 = None
                if 発言 and 段取り.頼まれているか(発言):
                    結果 = 頼みを分ける.手順に直す(発言, ChatEngine._言葉から拾う)
                return self._send(200, {'ok': True, '複数': bool(結果), '手数': len(結果['steps']) if 結果 else 0})

            # ---- エージェントの意図判定（話しかけられた言葉→操作、または会話）----
            if self.path == '/agent-route':
                import エージェントの意図判定

                発言 = (data.get('text') or '').strip()
                if not 発言:
                    return self._send(400, {'error': 'text が必要です'})
                verdict = rules.check(発言)
                if not verdict['ok']:
                    # キー名は 意図を選ぶ() の戻り値と揃える（'材料'・'会話の返事'）。
                    # ここだけ '引数'・'返事' という別名になっていたため、
                    # 画面側（判定.会話の返事 を見る）には常に空と映り、
                    # 方針で止めた理由が表示されずに黙って終わっていた。
                    return self._send(200, {
                        'ok': True, '操作id': None, '材料': '', '会話の返事': verdict['reason'],
                    })
                結果 = エージェントの意図判定.意図を選ぶ(
                    発言,
                    data.get('操作たち') or [],
                    data.get('直近の会話') or [],
                    persona=data.get('persona') or '',
                    page=data.get('page') or '',
                )
                with _lock:
                    learner.learn(発言, 'agent:user')
                return self._send(200, 結果)

            # ---- マルチエージェント化 第2段: 裏で進める作業をキューへ積む ----
            if self.path == '/agent-task/submit':
                import バックグラウンド作業

                内容 = (data.get('内容') or '').strip()
                if not 内容:
                    return self._send(400, {'error': '内容が必要です'})
                verdict = rules.check(内容)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, 'error': verdict['reason']})
                task = バックグラウンド作業.追加する(内容, agent=data.get('agent') or None)
                return self._send(200, {'ok': True, 'task': task})

            # ---- マルチエージェント化 拡張2: オーケストレーター（複数担当の連携作業） ----
            if self.path == '/agent-chain/submit':
                import バックグラウンド作業

                目的 = (data.get('目的') or '').strip()
                if not 目的:
                    return self._send(400, {'error': '目的が必要です'})
                verdict = rules.check(目的)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, 'error': verdict['reason']})
                手順 = data.get('手順')
                if not isinstance(手順, list) or not 手順:
                    return self._send(400, {'error': '手順（担当の並び）が必要です'})
                try:
                    task = バックグラウンド作業.連携作業を追加する(目的, 手順)
                except ValueError as e:
                    return self._send(400, {'error': str(e)})
                return self._send(200, {'ok': True, 'task': task})

            # ---- 作業状況の管理: 取り消し・やり直し・削除 ----
            if self.path == '/agent-task/cancel':
                import バックグラウンド作業
                id = (data.get('id') or '').strip()
                if not id:
                    return self._send(400, {'error': 'id が必要です'})
                return self._send(200, バックグラウンド作業.取り消す(id))

            if self.path == '/agent-task/retry':
                import バックグラウンド作業
                id = (data.get('id') or '').strip()
                if not id:
                    return self._send(400, {'error': 'id が必要です'})
                return self._send(200, バックグラウンド作業.やり直す(id))

            if self.path == '/agent-task/delete':
                import バックグラウンド作業
                id = (data.get('id') or '').strip()
                if not id:
                    return self._send(400, {'error': 'id が必要です'})
                return self._send(200, バックグラウンド作業.消す(id))

            # ---- ローカルLLMを裏で温める（「これから話しかけそうだ」の合図を受けて）----
            #
            # すぐ返事をする。読み込み自体は別スレッドに任せ、
            # 呼んだ側（画面）を待たせない。
            if self.path == '/warm':
                threading.Thread(target=ローカルLLM.温めておく, daemon=True).start()
                return self._send(200, {'ok': True})

            if self.path == '/chat':
                text = (data.get('text') or '').strip()
                if not text:
                    return self._send(400, {'error': 'text が必要です'})
                verdict = rules.check(text)
                if not verdict['ok']:
                    return self._send(200, {
                        'ok': False, 'certainty': 'blocked',
                        'answer': verdict['reason'], 'sources': [],
                    })
                with _lock:
                    # 会話を続けるため、どの会話かを伝える。
                    # 画面ごと・端末ごとに分かれるので、話が混ざらない。
                    ctx = dict(data.get('context') or {})
                    ctx['session_id'] = data.get('session_id') or ctx.get('session_id')
                    result = chat_engine.respond(text, ctx)
                    # 会話の内容もそのまま学習させる
                    learner.learn(text, 'chat:user')
                # 会話は、すべて永久の記憶に残す（会話の続きの期限が切れても、記録は残る）。
                永久の記憶.会話を残す(ctx.get('session_id'), text, result)
                return self._send(200, result)

            # ---- 文章生成（自作・型ベース）----
            if self.path == '/generate':
                with _lock:
                    result = generator.generate(
                        data.get('template') or '',
                        data.get('fields') or {},
                        data.get('tone', 'polite'),
                        int(data.get('variations', 1)),
                    )
                return self._send(200, result)

            if self.path == '/generate/learn-style':
                # 本人が書いた文章から言い回しを学ぶ
                text = (data.get('text') or '').strip()
                if not text:
                    return self._send(400, {'error': 'text が必要です'})
                verdict = rules.check(text)
                if not verdict['ok']:
                    return self._send(200, {'learned': 0, 'blocked': True, 'reason': verdict['reason']})
                with _lock:
                    n = phrase_learner.learn(text, data.get('purpose', 'general'))
                return self._send(200, {'learned': n, 'stats': phrase_learner.stats()})

            # ---- コードの安全点検で見つかった箇所を、直接ローカルLLMに聞く ----
            #
            # 通常の /chat は chat_engine（在庫・SNS等の話題分類）を通るため、
            # コードの話をすると見当違いの業務回答が返ってきてしまっていた。
            # ここは分類を挟まず、ローカルLLM（Qwen2.5）に直接聞く専用の入口。
            if self.path == '/code-review':
                text = (data.get('text') or '').strip()
                if not text:
                    return self._send(400, {'error': 'text が必要です'})
                verdict = rules.check(text)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, 'answer': verdict['reason']})

                if not ローカルLLM.使えるか():
                    return self._send(200, {
                        'ok': False,
                        'answer': 'この端末のローカルLLM（Ollama）が起動していません。'
                                  '設定 → 自己点検 で状態を確かめてください。',
                    })

                答え = ローカルLLM.聞く(text)
                if not 答え:
                    return self._send(200, {'ok': False, 'answer': '答えられませんでした。'})
                return self._send(200, {'ok': True, 'answer': 答え})

            # ---- 通訳（N-13）----
            #
            # 通常の /chat（chat_engine）は「天気」「翻訳」等を、
            # このツールが持たない世間知識として先に断る作りになっている
            # （的外れな回答を避けるための決まり）。だが翻訳そのものは
            # 世間知識ではなく、渡された文をそのまま言い換えるだけの作業
            # なので、分類を挟まずここで直接ローカルLLMに頼む。
            if self.path == '/translate':
                text = (data.get('text') or '').strip()
                言語 = (data.get('言語') or '英語').strip()
                if not text:
                    return self._send(400, {'error': 'text が必要です'})
                verdict = rules.check(text)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, 'answer': verdict['reason']})

                if not ローカルLLM.使えるか():
                    return self._send(200, {
                        'ok': False,
                        'answer': 'この端末のローカルLLM（Ollama）が起動していません。',
                    })

                指示 = (
                    f'次の文章を{言語}に翻訳してください。'
                    '説明や前置きは書かず、訳文だけをそのまま返してください。\n\n'
                    f'【原文】\n{text}'
                )
                答え = ローカルLLM.聞く(指示)
                with _lock:
                    learner.learn(text, 'translate:user')
                if not 答え:
                    return self._send(200, {'ok': False, 'answer': '訳せませんでした。'})
                return self._send(200, {'ok': True, 'answer': 答え, '言語': 言語})

            # ---- 外部AIの回答を自分で分析する ----
            if self.path == '/analyze':
                text = (data.get('text') or '').strip()
                if not text:
                    return self._send(400, {'error': 'text が必要です'})
                with _lock:
                    result = analyzer.analyze(text, knowledge_base=knowledge, learner=learner)
                return self._send(200, result)

            # ---- 知識ベース ----
            if self.path == '/knowledge/add':
                text = (data.get('text') or '').strip()
                if not text:
                    return self._send(400, {'error': 'text が必要です'})
                verdict = rules.check(text)
                if not verdict['ok']:
                    return self._send(200, {'added': False, 'blocked': True,
                                            'reason': verdict['reason']})
                with _lock:
                    result = knowledge.add(
                        text,
                        source=data.get('source', 'manual'),
                        topic=data.get('topic'),
                        note=data.get('note'),
                    )
                    knowledge.save()
                return self._send(200, result)

            if self.path == '/knowledge/search':
                with _lock:
                    hits = knowledge.search(
                        data.get('query') or '',
                        int(data.get('topN', 5)),
                        include_unverified=data.get('includeUnverified', True),
                    )
                    # 過去に誤りと判明したものがあれば必ず一緒に返す
                    mistakes = knowledge.find_mistakes(data.get('query') or '')
                return self._send(200, {'results': hits, 'pastMistakes': mistakes})

            if self.path == '/knowledge/verify':
                with _lock:
                    result = knowledge.verify(
                        data.get('id'),
                        correct=bool(data.get('correct', True)),
                        note=data.get('note'),
                    )
                    knowledge.save()
                return self._send(200, result)

            if self.path == '/knowledge/forget':
                with _lock:
                    # 消す前の1件を、永久の記憶に残す
                    for e in knowledge.entries:
                        if e.get('id') == data.get('id'):
                            永久の記憶.残す('忘れた知識', e, 'あなたの指示で知識メモから取り除いた')
                    result = knowledge.forget(data.get('id'))
                    knowledge.save()
                return self._send(200, result)

            if self.path == '/semantics/rebuild':
                with _lock:
                    return self._send(200, _maybe_rebuild_semantics(force=True) or {'ok': False})

            if self.path == '/semantics/similar':
                with _lock:
                    return self._send(200, {
                        'similar': semantic.similar_words(data.get('term') or '',
                                                          int(data.get('topN', 10)))
                    })

            if self.path == '/classify':
                with _lock:
                    return self._send(200, learner.classify(data.get('text') or ''))

            if self.path == '/answer':
                # 確実か推測かを明示して返す（断定できないものは断定しない）
                with _lock:
                    return self._send(200, learner.answer(data.get('text') or ''))

            if self.path == '/keywords':
                with _lock:
                    kws = learner.keywords(data.get('text') or '', int(data.get('topN', 10)))
                return self._send(200, {'keywords': [{'term': t, 'score': s} for t, s in kws]})

            if self.path == '/related':
                with _lock:
                    return self._send(200, {'related': learner.related_terms(data.get('term') or '')})

            if self.path == '/similarity/index':
                items = data.get('items') or []
                with _lock:
                    global similarity
                    # 意味モデルを必ず渡す。渡し忘れると言い換えを検出できなくなる。
                    similarity = SimilarityEngine(semantic_model=semantic)
                    similarity.add_many(items)
                return self._send(200, {'ok': True, 'indexed': len(items)})

            if self.path == '/similarity/check':
                with _lock:
                    result = similarity.compare(
                        data.get('text') or '',
                        data.get('attrs') or {},
                        int(data.get('topN', 5)),
                    )
                return self._send(200, result)

            if self.path == '/similarity/duplicates':
                with _lock:
                    return self._send(200, {'pairs': similarity.find_duplicates_within()})

            # ---- デザイン学習（アップロードした写真・動画からファッションの傾向を学ぶ）----
            #
            # 外部の画像認識APIは使わない。この端末のPillow/numpyだけで、
            # 色・構図の大まかな傾向を見て、学習データに加える
            # （デザイン分析.py 参照。厳密な認識ではなく、あくまで参考程度のもの）。
            if self.path == '/design/learn-media':
                種類 = data.get('種類') or 'image'
                元 = data.get('path') or data.get('dataUrl') or ''
                説明文 = (data.get('説明文') or '').strip()
                ファイル名 = data.get('ファイル名') or ''

                if not 元:
                    return self._send(400, {'error': '画像・動画のデータが必要です'})

                import デザイン分析
                if 種類 == 'video':
                    特徴 = デザイン分析.動画から特徴を取り出す(元)
                else:
                    特徴 = デザイン分析.画像から特徴を取り出す(元)

                if not 特徴.get('ok'):
                    return self._send(200, {'ok': False, '訳': 特徴.get('訳', '解析できませんでした')})

                text = デザイン分析.特徴をテキストにする(特徴)
                if 説明文:
                    text = f'{text} {説明文}'.strip()

                verdict = rules.check(text)
                if not verdict['ok']:
                    return self._send(200, {'ok': False, '訳': verdict['reason']})

                # 説明文（本人が書いた言葉）にだけ、権利チェックをかける。
                # 画像そのものの権利の有無は技術的に判定できないため、
                # 添えられた文章から「他人の資料の転載」らしさだけを見る。
                if 説明文:
                    import 権利の見分け
                    判定 = 権利の見分け.調べる(説明文)
                    if not 判定['学ばせてよいか']:
                        return self._send(200, {
                            'ok': False,
                            '訳': f'説明文に{判定["種類"]}が含まれるため、学習しませんでした',
                        })

                with _lock:
                    learner.learn(text, 'design_trend')
                    knowledge.add(text, source='document', topic='design_trend',
                                  note=f'アップロード（{ファイル名 or 種類}）から')
                    knowledge.save()

                return self._send(200, {
                    'ok': True,
                    'キーワード': 特徴.get('キーワード', []),
                    '構図': 特徴.get('構図'),
                    '訳': 'この画像/動画の傾向を学習しました',
                })

            # ---- 学習したファッション傾向から、デザイン提案の叩き台を出す ----
            #
            # 断定はしない。あくまで「これまで学習した中では」という
            # 参考程度の提案にとどめる（学習の質は、学ばせた量に依存する）。
            if self.path == '/design/suggest':
                お題 = (data.get('お題文') or '').strip()
                with _lock:
                    if お題:
                        キーワード = [t for t, _s in learner.keywords(お題, 8)]
                        for t in list(キーワード[:3]):
                            キーワード.extend(x['term'] for x in learner.related_terms(t, 4))
                    else:
                        # お題が無ければ、design_trendカテゴリで多く学んだ語を出す
                        カテゴリ語 = learner.class_word_counts.get('design_trend') or {}
                        上位 = sorted(カテゴリ語.items(), key=lambda x: -x[1])[:20]
                        キーワード = [t for t, _c in 上位]

                    見た = set()
                    絞った = []
                    for k in キーワード:
                        if k not in 見た:
                            見た.add(k)
                            絞った.append(k)

                return self._send(200, {
                    'ok': True,
                    'キーワード': 絞った[:12],
                    '訳': 'これまで学習した内容からの傾向です。断定はできません。',
                })

            # ---- テックパックスライド（.pptx）を組み立てる ----
            #
            # Canva公式APIには「1着1スライド＋テキストの精密配置」を
            # 無料で自動組み立てできる仕組みが無いため（本命のAutofill
            # APIはCanva Enterprise専用）、この端末だけで.pptxを完成
            # させる。.pptxはCanva・PowerPoint・Keynoteのどれでも開ける。
            if self.path == '/techpack-deck/build':
                商品たち = data.get('商品たち') or []
                if not 商品たち:
                    return self._send(400, {'error': '商品が1件もありません'})

                for 商品 in 商品たち:
                    text = f"{商品.get('name', '')} {商品.get('description', '')}"
                    verdict = rules.check(text)
                    if not verdict['ok']:
                        return self._send(200, {
                            'ok': False,
                            '訳': f"「{商品.get('name', '')}」: {verdict['reason']}",
                        })

                import techpack_deck
                import uuid as _uuid
                ファイル名 = f'techpack_{_uuid.uuid4().hex[:10]}.pptx'
                出力パス = os.path.join(DATA_DIR, 'techpack_decks', ファイル名)
                結果 = techpack_deck.スライドを作る(
                    商品たち, 出力パス, タイトル=data.get('タイトル') or 'OEM商品開発資料')
                if not 結果.get('ok'):
                    return self._send(200, 結果)

                return self._send(200, {'ok': True, 'ファイル名': ファイル名, '枚数': 結果['枚数']})

            self._send(404, {'error': 'not found'})

        except Exception as e:  # noqa: BLE001 — 何が来てもプロセスを落とさない
            self._send(500, {'error': str(e)})


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    # 保存の見張りを動かす。表の処理を止めないよう別で動かす。
    threading.Thread(target=_保存を見張る, daemon=True).start()

    # 音声認識モデルを、起動直後の裏側で先に読み込んでおく。
    #
    # 読み込みには初回だけ数十秒かかる。話しかけたそのときに
    # 読み込みが始まると、「反応が遅い・聞き取ってくれない」に見える。
    # サーバー起動と同時に裏で済ませておけば、実際に使うときには
    # もう準備できている。
    def _音声認識を先に用意する():
        import 音声を文字にする
        音声を文字にする.使えるか()

    threading.Thread(target=_音声認識を先に用意する, daemon=True).start()

    # マルチエージェント化 第2段: 裏で進める作業の常駐ワーカーを起動する。
    import バックグラウンド作業
    バックグラウンド作業.起動する()
    import 司令塔
    司令塔.起動時の片付け()

    # 終了の合図を受けたら、覚えたことを書き出してから終わる。
    #
    # これまで拾っていたのは Ctrl+C だけだった。
    # ツールの再起動や、Macの終了で送られてくるのは別の合図で、
    # そちらは拾っていなかったので、最後の30秒ぶんの学習が
    # 黙って消えることがあった。
    def _合図で終わる(番号, 位置):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, _合図で終わる)
    signal.signal(signal.SIGHUP, _合図で終わる)

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'ARELM AI Engine: http://{HOST}:{PORT}')
    print(f'モデル: {MODEL_PATH}')
    print(f'学習済み: {learner.total_docs}件 / 語彙 {len(learner.vocabulary)}語')
    print('※ このプロセスは外部へ一切通信しません')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        # 終わるときは必ず書き出す。覚えたことを失わないため。
        try:
            _必要なら保存する(強制=True)
            print('\n保存して終了しました')
        except Exception:
            pass


if __name__ == '__main__':
    main()
