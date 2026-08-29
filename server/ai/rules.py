"""
このツールが必ず守るルール（宣言ではなく強制）

方針:
  「気をつける」ではなく、違反しようとしても仕組み上できない状態にする。

強制している内容:
  1. 外部への通信を遮断する
     自作AIエンジンは学習データ（あなたの仕事・私生活の情報）を扱う。
     万一コードに誤りがあっても外へ出ないよう、
     localhost 以外への接続をソケット層で禁止する。

  2. 違法・犯罪に関わる内容は学習しない
     入力段階で弾き、モデルに残さない。

  3. 個人情報とみなせるものは学習させない
     マイナンバー・クレジットカード番号などの形式を検出して拒否する。
"""

import re
import socket

# ---------------------------------------------------------------
# 1. 外部通信の遮断
# ---------------------------------------------------------------

_ALLOWED_HOSTS = {'127.0.0.1', 'localhost', '::1', '0.0.0.0'}
_original_connect = socket.socket.connect
_original_connect_ex = socket.socket.connect_ex
_egress_blocked = False


class EgressBlocked(RuntimeError):
    """外部への通信をルールで止めたときに送出する"""


def _is_local(address):
    """接続先がこの端末内かどうか"""
    try:
        host = address[0] if isinstance(address, (tuple, list)) else address
    except (IndexError, TypeError):
        return False
    return str(host) in _ALLOWED_HOSTS


def block_external_network():
    """
    localhost 以外への接続を禁止する。
    このプロセスからは外部サーバーへ一切繋がらなくなる。
    """
    global _egress_blocked
    if _egress_blocked:
        return

    def guarded_connect(self, address, *args, **kwargs):
        if not _is_local(address):
            raise EgressBlocked(
                f'ルールにより外部への通信を遮断しました: {address}'
            )
        return _original_connect(self, address, *args, **kwargs)

    def guarded_connect_ex(self, address, *args, **kwargs):
        if not _is_local(address):
            raise EgressBlocked(
                f'ルールにより外部への通信を遮断しました: {address}'
            )
        return _original_connect_ex(self, address, *args, **kwargs)

    socket.socket.connect = guarded_connect
    socket.socket.connect_ex = guarded_connect_ex
    _egress_blocked = True


# ---------------------------------------------------------------
# 2. 違法・犯罪に関わる内容
# ---------------------------------------------------------------

BLOCKED_PATTERNS = [
    re.compile(r'(違法|犯罪|密輸|脱税|マネーロンダリング|マネロン)', re.I),
    re.compile(r'(偽ブランド|コピー品|模倣品|海賊版|無断転載|パクリ商品)', re.I),
    re.compile(r'(ハッキング|不正アクセス|クラッキング|乗っ取り|なりすまし)', re.I),
    re.compile(r'(麻薬|覚醒剤|大麻|銃器|爆弾|テロ)', re.I),
    re.compile(r'\b(illegal|counterfeit|piracy|hacking|unauthorized access)\b', re.I),

    # --- ここから下は、実際に試して素通りしたもの ---
    #
    # 「絶対に触れてはいけない」と決めてあるのに、
    # 試したら三つが通り抜けた。
    # 決まりを書くだけでは守れない。試して確かめないと分からない。

    # 他人の情報を扱う
    #
    # 自分のカードを登録するのは正当。
    # 「他人の」が付くと、まるで別の話になる。
    re.compile(r'(他人|人|誰か|客|顧客)の?\s*'
               r'(クレジット|カード番号|カード情報|暗証番号|口座|パスワード|個人情報)', re.I),
    re.compile(r'(名簿|顧客リスト|個人情報)を?\s*(売|買|流|渡|集め)', re.I),

    # 人のものをそのまま写す
    #
    # 「参考にする」と「そっくり写す」は違う。
    # 前者は学びだが、後者は権利を侵す。
    re.compile(r'(ロゴ|デザイン|商標|意匠|写真|画像|文章)を?\s*'
               r'(そのまま|そっくり|まるごと|完全に)?\s*(コピー|複製|流用|盗用|パクリ|パクっ)', re.I),
    re.compile(r'(他社|他人|よそ)の?\s*(ロゴ|デザイン|商標|写真)を?\s*(使|載せ|流用)', re.I),

    # 税とお金をごまかす
    re.compile(r'(確定申告|税|売上|帳簿|領収書|経費)を?\s*'
               r'(ごまか|偽|水増し|抜|隠|改ざん|でっちあげ)', re.I),
    re.compile(r'(二重帳簿|裏帳簿|架空(売上|請求|経費))', re.I),

    # 人を欺く
    re.compile(r'(サクラ|やらせ|自作自演)(レビュー|口コミ|評価)', re.I),
    re.compile(r'(レビュー|口コミ|評価|フォロワー|いいね)を?\s*(買|水増し|捏造|自作)', re.I),
    re.compile(r'(誇大広告|優良誤認|有利誤認)', re.I),

    # 規約に反するやり方
    #
    # 「非公式のものは一切使わない」という決まりに繋がる。
    re.compile(r'(スクレイピング|scraping|クローリング)を?\s*(して|し|する)', re.I),
    re.compile(r'(非公式|裏)\s*(API|api|ツール)', re.I),
    re.compile(r'(規約|利用規約|TOS)を?\s*(破|違反|くぐ|回避|かいくぐ)', re.I),
]

# ---------------------------------------------------------------
# 3. 学習させない個人情報
# ---------------------------------------------------------------

SENSITIVE_PATTERNS = [
    (re.compile(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'), 'クレジットカード番号らしき数列'),
    (re.compile(r'\b\d{12}\b'), 'マイナンバーらしき数列'),
    (re.compile(r'\b\d{3}-?\d{4}-?\d{4}\b'), '電話番号らしき数列'),
    (re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'), 'メールアドレス'),
    (re.compile(r'\b(sk|pk|ghp|gsk)_[A-Za-z0-9]{16,}\b'), 'APIキーらしき文字列'),
    (re.compile(r'\bAIza[0-9A-Za-z_-]{30,}\b'), 'Google APIキー'),
]


def check(text):
    """
    学習・処理してよい内容かを判定する。

    戻り値: {'ok': bool, 'reason': str|None, 'kind': str|None}
    """
    if not text or not isinstance(text, str):
        return {'ok': True, 'reason': None, 'kind': None}

    for p in BLOCKED_PATTERNS:
        m = p.search(text)
        if m:
            return {
                'ok': False,
                'kind': 'illegal',
                'reason': f'違法・犯罪に関わる可能性のある語が含まれています（{m.group(0)}）',
            }

    for p, label in SENSITIVE_PATTERNS:
        if p.search(text):
            return {
                'ok': False,
                'kind': 'sensitive',
                'reason': f'{label}が含まれているため学習しません',
            }

    return {'ok': True, 'reason': None, 'kind': None}


def redact(text):
    """
    個人情報らしき部分を伏せ字にして返す。
    どうしても本文を残したい場合に使う。
    """
    if not text:
        return text
    for p, _ in SENSITIVE_PATTERNS:
        text = p.sub('［伏せ字］', text)
    return text


RULES = [
    '外部への通信を行いません（localhost以外はソケット層で遮断）',
    '学習した内容を外部へ送信しません',
    '違法・犯罪・模倣品に関わる内容は学習しません',
    '個人情報（カード番号・マイナンバー・APIキー等）は学習しません',
    '外部のデータを許可なく取得しません',
]


if __name__ == '__main__':
    print('=== ルール ===')
    for r in RULES:
        print(' -', r)

    print('\n=== 内容チェック ===')
    samples = [
        '新作のデニムジャケットを制作する',
        '偽ブランドのコピー品を作る方法',
        '連絡先は test@example.com です',
        'カード番号 4111 1111 1111 1111',
        '他社サイトに不正アクセスして情報を取得する',
    ]
    for s in samples:
        r = check(s)
        mark = 'OK  ' if r['ok'] else '拒否'
        print(f'  {mark} {s}')
        if not r['ok']:
            print(f'        → {r["reason"]}')

    print('\n=== 外部通信の遮断テスト ===')
    block_external_network()
    try:
        s = socket.socket()
        s.settimeout(2)
        s.connect(('example.com', 80))
        print('  ✗ 外部に繋がってしまいました')
    except EgressBlocked as e:
        print(f'  ✓ {e}')
    except Exception as e:
        print(f'  ? 別の理由で失敗: {type(e).__name__}')

    try:
        s = socket.socket()
        s.settimeout(1)
        s.connect(('127.0.0.1', 8765))
        print('  ✓ localhost（自作AIエンジン）へは通常どおり接続できます')
        s.close()
    except EgressBlocked:
        print('  ✗ localhost まで塞いでしまいました')
    except OSError:
        print('  ✓ localhost は許可されています（エンジン停止中のため接続自体は失敗）')
