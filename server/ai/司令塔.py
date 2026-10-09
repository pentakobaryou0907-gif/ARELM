# -*- coding: utf-8 -*-
"""
司令塔 ― 席を外しても、係が裏で進めて、結果をまとめて報告する

なぜこれが要るのか:
    チーム.py は、係ごとに手分けして実際に動かすところまで作ってある。
    だが動かす先は、開いている画面（チーム実行.js）だけだった。
    画面を閉じると、途中の手も、これからやる手も、止まる。

    夜の当番は、画面を閉じた夜でも動く。ただし読むだけで、
    やることを足す・控えを取る、まではしない。
    バックグラウンド作業.py は、長い文章を裏で書かせる列で、
    「在庫を見て」と言っても在庫は見ない（文章を書くだけ）。

    ここで、その隙間を埋める。
      ・司令    … 頼みを分ける.py で分け、チーム.py の係に振り、結果をまとめる
      ・列      … 仕事をファイルに残す。Macのサーバーが、画面が閉じていても進める
      ・門      … 送る・公開する・消す・忘れる、は、本人の「よい」が無ければ行わない
      ・記憶    … 係ごとに、終えた手を残す（次の仕事の手がかり）

第5の系統。次の4つとは混ぜない（役割が違うため）:
  ① エージェント定義.py … 画面ごとの口調
  ② バックグラウンド作業.py … 長い文章を裏で書かせる
  ③ 係たち.py … 相談の見方
  ④ チーム.py … 画面が開いているあいだの、係ごとの同時作業

外部へは一切問い合わせない。すべてこの端末の中で完結する。
"""

import os
import re
import time
import uuid

import チーム
import 段取り
import 頼みを分ける
import 永久の記憶
import 安全に書く

# ------------------------------------------------------------------
# 言葉（画面が開いていなくても進めてほしい、という合図）
# 「チームで」は ④ の合図なので、ここには入れない。
# ------------------------------------------------------------------
_司令言葉 = re.compile(
    r'(バックグラウンドで|裏側で|裏で|'
    r'席を外して|席を外すので|席を外しても|'
    r'離れている間に|離れている間も|'
    r'司令に任せて|司令塔に任せて|司令に|'
    r'いなくても進めて|終わったら報告して|終わったら報告)'
)


def 司令を頼まれたか(text):
    return bool(_司令言葉.search(text or ''))


def 司令言葉を除く(text):
    t = _司令言葉.sub(' ', text or '')
    return re.sub(r'\s+', ' ', t).strip(' 、,　')


# ------------------------------------------------------------------
# 行き先（この手が、どこで行われるか）
# ------------------------------------------------------------------
# 同期の控えを読めば、画面が無くても答えが出せる
_サーバーで読む = {
    'show_inventory', 'show_schedule', 'next_steps', 'price_advice',
    'check_duplicate', 'show_production', 'search_knowledge',
    'recall_history', 'show_memory', 'show_hq', 'show_activity',
}
# 同期の控えへ足す（消さない）。Node側が書く
_サーバーで書く = {
    'add_task', 'add_memo', 'add_product', 'add_production',
}
# Nodeの道具を呼ぶ（バックアップ・夜の当番・ひらめき箱・文章づくり）
_サーバーの道具 = {
    'backup_now', 'run_night', 'show_backup', 'show_night',
    'show_inbox', 'add_inbox', 'write_text',
}
# 画面の仕組みが要る（柄づくり・体調の記録・ツールの点検）
_画面が要る = {
    'make_pattern', 'health', 'self_check',
}

# 仕事の記録として残す件数。古いものは永久の記憶へ移してから外す
_保持件数 = 80


def 行き先(作業):
    if 作業 in _サーバーで読む:
        return '読む'
    if 作業 in _サーバーで書く:
        return '書く'
    if 作業 in _サーバーの道具:
        return '道具'
    if 作業 in _画面が要る:
        return '画面'
    if 作業 == 'forget':
        return '承認'
    return '画面'


# ------------------------------------------------------------------
# 承認の門（送る・公開する・消す・忘れる）
# ------------------------------------------------------------------
def 承認が要るか(action='', 文=''):
    """
    この手（または頼み全体）が、本人の「よい」を待ってからにするか。

    公開・送信は、よいと言われても、こちらからは行わない
    （SUZURIの公開ボタンは本人、外へ送らない、の決まり）。
    削除は、よいと言われても消さない。整理済みへ移せる、と案内するだけ。
    忘れるは、よいと言われてから、既存の「忘れる」を行う。
    """
    a = (action or '').strip()
    t = (文 or '').strip()

    if a == 'forget' or (t and re.search(r'(覚え(たこと|させたこと).{0,8})?(忘れて|忘れさせて)', t)
                         and not re.search(r'(忘れない|忘れずに)', t)):
        return {
            '種類': '忘れる',
            '訳': '覚えたことを忘れる操作です。よいと言われてから行います。忘れる前に、永久の記憶へ残します。',
            '行える': True,
        }

    if t and '公開前' not in t and re.search(r'(公開|出品)(して|しといて|お願い|してください|したい)', t):
        return {
            '種類': '公開',
            '訳': 'SUZURIの「商品を公開する」ボタンは、あなた自身が押します。よいと言われても、こちらからは押しません。',
            '行える': False,
            '本人が押す': True,
        }

    if t and re.search(r'(外部|外に|外へ|社外|クラウド|ネット(に|へ)).{0,10}(送|出し|アップロード|共有|渡し)', t):
        return {
            '種類': '送信',
            '訳': 'データを外へ送ることはしません。よいと言われても、送りません。手元の控え（CSV）に書き出すことはできます。',
            '行える': False,
        }

    if t and re.search(r'(SNS|インスタ|Instagram|TikTok).{0,8}(に|へ)?(投稿|発信)(して|しといて)', t):
        return {
            '種類': '投稿',
            '訳': '投稿そのものはしません。文章の下書きまで作ります。載せるかどうかは、あなたが決めてください。',
            '行える': False,
        }

    if t and re.search(
            r'(データ|ファイル|フォルダ|商品|在庫|売上|記録|履歴|バックアップ|控え|ひらめき|学習|全部|すべて|全て|ぜんぶ).{0,8}'
            r'(消して|消去|削除|全部消|空にして|初期化|破棄|捨てて)', t):
        if not re.search(r'(覚え|忘れ)', t):
            return {
                '種類': '削除',
                '訳': '消すことはしません。使わなくなったものは「整理済み」「見送り」に移せます。記録は残るので、あとで戻せます。',
                '行える': False,
            }

    return None


# ------------------------------------------------------------------
# 置き場（本物のデータは触らない。試験は ARELM_HQ_FILE で別の場所へ）
# ------------------------------------------------------------------
def _データの場所():
    return os.environ.get('ARELM_DATA_DIR') or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'data')


def _仕事の場所():
    return os.environ.get('ARELM_HQ_FILE') or os.path.join(_データの場所(), '司令の仕事.json')


def _決まりの場所():
    return os.environ.get('ARELM_HQ_RULES') or os.path.join(_データの場所(), '司令の決まり.json')


def _記憶の場所():
    return os.environ.get('ARELM_HQ_MEMORY') or os.path.join(_データの場所(), '司令の記憶.json')


# ------------------------------------------------------------------
# 読み書き
# ------------------------------------------------------------------
def _仕事を読む():
    try:
        import json
        with open(_仕事の場所(), encoding='utf-8') as f:
            r = json.load(f)
        if isinstance(r, list):
            return r
    except (OSError, ValueError):
        pass
    return []


def _仕事を書く(一覧):
    安全に書く.書く(_仕事の場所(), 一覧, indent=1)
    return True


def _決まりの既定():
    return [
        {
            'id': 'daily-inventory',
            '名前': '毎日の在庫点検',
            '使う': True,
            'きっかけ': 'daily',
            '時刻': '08:00',
            '頼み': '在庫を確認して、少ないものをやることに入れて',
            '説': '在庫を見て、少ないものがあれば、やることに残します。公開も送信もしません。',
        },
        {
            'id': 'daily-schedule',
            '名前': '毎日のやること確認',
            '使う': True,
            'きっかけ': 'daily',
            '時刻': '08:05',
            '頼み': '今日の状況を見て、次にやることを考えて',
            '説': '期限の近いやることと、次の一手を出します。読むだけです。',
        },
        {
            'id': 'weekly-backup',
            '名前': '週次のバックアップ',
            '使う': True,
            'きっかけ': 'weekly',
            '曜日': '月',
            '時刻': '09:00',
            '頼み': 'バックアップを取って',
            '説': '控えを取ります。消す・上書きはしません。',
        },
    ]


def 決まりを読む():
    try:
        import json
        with open(_決まりの場所(), encoding='utf-8') as f:
            r = json.load(f)
        if isinstance(r, list) and r:
            return r
    except (OSError, ValueError):
        pass
    return _決まりの既定()


def 決まりを書く(一覧):
    if not isinstance(一覧, list):
        return {'ok': False, '訳': '決まりの形が違います'}
    安全に書く.書く(_決まりの場所(), 一覧, indent=2)
    return {'ok': True, '決まり': 一覧}


def _記憶を読む():
    try:
        import json
        with open(_記憶の場所(), encoding='utf-8') as f:
            r = json.load(f)
        if isinstance(r, dict):
            return r
    except (OSError, ValueError):
        pass
    return {}


def _記憶を書く(表):
    安全に書く.書く(_記憶の場所(), 表, indent=1)


def 記憶する(係, 文, 仕事id=''):
    """係が手を終えた内容を残す。古い分は永久の記憶へ移してから外す。"""
    係 = (係 or '司令').strip() or '司令'
    文 = (文 or '').strip()
    if not 文:
        return False
    表 = _記憶を読む()
    列 = list(表.get(係) or [])
    件 = {'とき': time.strftime('%Y-%m-%dT%H:%M:%S'), '文': 文[:400], '仕事': 仕事id}
    列.append(件)
    if len(列) > 20:
        for 古い in 列[:-20]:
            永久の記憶.残す('係の記憶_' + 係, 古い, 理由='係の記憶が20件を超えたので移す')
        列 = 列[-20:]
    表[係] = 列
    _記憶を書く(表)
    永久の記憶.残す('係の記憶_' + 係, 件, 理由='係が手を終えた')
    return True


def 記憶を出す(係, 件数=5):
    列 = _記憶を読む().get(係) or []
    return list(列[-件数:])


# ------------------------------------------------------------------
# 段を組む（頼みを分ける + チームの割り振り + 門）
# ------------------------------------------------------------------
def _拾う():
    from chat_engine import ChatEngine
    return ChatEngine._言葉から拾う


def 一手だけの段取り(text, 拾う=None):
    """チーム.一手だけの段取り と同じ考え。司令は、一手でも列に積む。"""
    拾う = 拾う or _拾う()
    文 = 司令言葉を除く(text) or (text or '').strip()
    if not 文:
        return None
    技, 確か = 頼みを分ける._技を決める(文)
    if not 技 or 確か < 0.5:
        return None
    材料 = 頼みを分ける._材料を拾う(技, 文, {}, 拾う)
    return {
        'name': 'hq-one',
        'label': f'司令の作業（{技.label}）',
        'summary': '席を外しても、この頼みを係に任せます。',
        'steps': [{'action': 技.action, 'why': f'{技.label}（「{文}」）', 'params': 材料, 'confirm': False}],
        '分からなかった': [],
    }


def 段を組む(text, 拾う=None):
    """
    頼みを、動かせる手順にする。
    分からなかった部分のうち、門に当たるものは、承認の手として残す
    （推測で作業を作らない。門だけは、行わないことを残すため）。
    """
    拾う = 拾う or _拾う()
    文 = 司令言葉を除く(text) or (text or '').strip()
    if not 文:
        return None
    複数 = 頼みを分ける.手順に直す(文, 拾う) if 段取り.頼まれているか(文) else None
    if 複数:
        段 = {
            'name': 'hq-adhoc',
            'label': f'司令の作業（{len(複数["steps"])}手）',
            'summary': '席を外しても、頼まれたことを係が進めます。',
            'steps': [dict(h) for h in 複数['steps']],
            '分からなかった': list(複数.get('分からなかった') or []),
        }
    else:
        段 = 一手だけの段取り(文, 拾う)
        if not 段:
            # 作業に当たらなくても、門だけは立てる（公開して、など）
            門 = 承認が要るか('', 文)
            if 門:
                return {
                    'name': 'hq-gate',
                    'label': '確認が要る頼み',
                    'summary': 門['訳'],
                    'steps': [],
                    '分からなかった': [],
                    '門': 門,
                }
            return None

    チーム化 = チーム.チームにする({'label': 段['label'], 'summary': 段['summary'], 'steps': 段['steps']})
    if チーム化:
        段 = dict(段, **{k: チーム化[k] for k in チーム化 if k != '分からなかった'})

    門 = 承認が要るか('', 文)
    if 門:
        段['門'] = 門
    return 段


def _手を整える(手, 番号):
    h = dict(手)
    h['番号'] = 番号
    h['状態'] = '待ち'
    h['行き先'] = 行き先(h.get('action'))
    h['結果'] = None
    門 = 承認が要るか(h.get('action'), h.get('why') or '')
    if 門:
        h['承認'] = 門
        h['行き先'] = '承認'
        h['状態'] = '承認待ち'
    elif h['行き先'] == '画面':
        h['状態'] = '画面待ち'
    return h


def 仕事を受ける(text, 拾う=None, 定時=False, 名前=''):
    """列に積む。すぐには動かさない（進めるのは advance）。"""
    段 = 段を組む(text, 拾う)
    if not 段:
        return {
            'ok': True, '分かった': False,
            '訳': '動かせる作業として読み取れませんでした。'
                  '「在庫を見て」のように具体的に書いてください。'
                  '長い文章づくりだけなら、これまでどおり裏の文章係に回します。',
        }
    いま = time.time()
    手たち = [_手を整える(h, i) for i, h in enumerate(段.get('steps') or [])]
    仕事 = {
        'id': 'hq_' + uuid.uuid4().hex[:12],
        '頼み': (司令言葉を除く(text) or text or '').strip(),
        '元の文': (text or '').strip(),
        '名前': 名前 or 段.get('label') or '司令の作業',
        '状態': '進行中',
        '作成': いま,
        '更新': いま,
        '定時': bool(定時),
        'team': 段.get('team'),
        '門': dict(段['門'], 状態='待ち') if 段.get('門') else None,
        'steps': 手たち,
        '報告': None,
        '分からなかった': 段.get('分からなかった') or [],
    }
    if not 手たち and 仕事['門']:
        仕事['状態'] = '承認待ち'
    一覧 = _仕事を読む()
    一覧.append(仕事)
    _古いのを移す(一覧)
    _仕事を書く(一覧[-_保持件数:])
    return {
        'ok': True, '分かった': True, '仕事': 仕事,
        '訳': _受けた文(仕事),
    }


def _受けた文(仕事):
    行 = ['席を外しても進めます。進み具合は「作業」のページから見られます。']
    if 仕事.get('team'):
        行 += チーム.受け持ちの文({'steps': 仕事['steps'], 'team': 仕事['team']})
    else:
        for i, h in enumerate(仕事.get('steps') or [], 1):
            行.append(f'{i}. {h.get("agent_name") or "係"}　{h.get("why")}')
    if 仕事.get('門'):
        行 += ['', '確認が要る門があります:', '・' + 仕事['門']['訳'],
               '「よい」か「見送り」を、作業のページで選んでください。読む手は、門を待たずに進めます。']
    承認の手 = [h for h in (仕事.get('steps') or []) if h.get('状態') == '承認待ち']
    if 承認の手:
        行.append('次の手は、あなたの「よい」を待ってからにします: '
                  + '、'.join(h.get('why') or h.get('action') for h in 承認の手))
    行.append('送る・公開する・消す、は、よいと言われても、決まりどおり行いません。')
    return '\n'.join(行)


def _古いのを移す(一覧):
    """保持件数を超える、終わった仕事を、永久の記憶へ移してから外す。"""
    終わった = [x for x in 一覧 if x.get('状態') in ('完了', '失敗', '取り消し')]
    生きてる = [x for x in 一覧 if x.get('状態') not in ('完了', '失敗', '取り消し')]
    余り = len(終わった) - max(0, _保持件数 - len(生きてる) - 10)
    if 余り > 0:
        for 古い in 終わった[:余り]:
            永久の記憶.残す('司令の仕事', {
                'id': 古い.get('id'), '頼み': 古い.get('頼み'),
                '状態': 古い.get('状態'), '報告': 古い.get('報告'),
            }, 理由='司令の列が長くなったので移す')
            一覧.remove(古い)


# ------------------------------------------------------------------
# 同期の控えから読む（夜の当番と同じ形: {鍵: {value: JSON文字}}）
# ------------------------------------------------------------------
def _配列(同期, 鍵):
    try:
        店 = (同期 or {}).get(鍵)
        v = 店.get('value') if isinstance(店, dict) else 店
        if isinstance(v, str):
            import json
            v = json.loads(v)
        return v if isinstance(v, list) else None
    except (ValueError, TypeError, AttributeError):
        return None


def _数(p, *鍵たち, 既定=0):
    for k in 鍵たち:
        n = p.get(k) if isinstance(p, dict) else None
        try:
            if n is not None and str(n) != '':
                return float(n)
        except (TypeError, ValueError):
            pass
    return 既定


def 読む手を行う(手, 同期):
    """画面が無くても答えが出せる手。書けない・送れない。"""
    a = 手.get('action')
    材料 = 手.get('params') or {}

    if a == 'show_inventory':
        商品 = _配列(同期, 'products')
        if 商品 is None:
            return {'ok': False, '文': '商品のデータを、まだ読み込んでいません'}
        少ない = []
        for p in 商品:
            残 = _数(p, 'quantity', 'stock', 'qty')
            下 = _数(p, 'reorderLevel', 既定=5)
            if 残 <= 下:
                少ない.append(p)
        名 = '、'.join((p.get('name') or '（名前なし）') for p in 少ない[:5])
        if len(少ない) > 5:
            名 += f' ほか{len(少ない) - 5}件'
        文 = [f'商品{len(商品)}件。']
        文.append(f'少ないもの {len(少ない)}件: {名}' if 少ない else '補充が要るものはありません。')
        return {'ok': True, '文': ''.join(文), '少ない': len(少ない)}

    if a == 'show_schedule':
        やること = _配列(同期, 'areglm_tasks') or []
        未 = [t for t in やること if not t.get('done')]
        期限 = [t for t in 未 if t.get('due')]
        文 = [f'やること {len(未)}件（全体{len(やること)}件）。']
        if 期限:
            文.append('期限のあるもの: ' + '、'.join((t.get('title') or '無題') for t in 期限[:5]))
        return {'ok': True, '文': ''.join(文), '未': len(未)}

    if a == 'show_production':
        制作 = _配列(同期, 'areglm_production_log') or []
        return {'ok': True, '文': f'制作の記録は {len(制作)}件です。公開はしていません。'}

    if a == 'price_advice':
        商品 = _配列(同期, 'products') or []
        割れ = [p for p in 商品 if _数(p, 'price') > 0 and _数(p, 'cost') > 0 and _数(p, 'price') <= _数(p, 'cost')]
        if 割れ:
            名 = '、'.join((p.get('name') or '') for p in 割れ[:5])
            return {'ok': True, '文': f'売値が原価以下の商品が{len(割れ)}件あります: {名}'}
        return {'ok': True, '文': '原価を割っている商品は、いま見当たりません。'}

    if a == 'check_duplicate':
        商品 = _配列(同期, 'products') or []
        対象 = str(材料.get('text') or 材料.get('name') or '').strip()
        if not 対象:
            return {'ok': False, '文': '比べる名前が聞き取れませんでした'}
        同 = [p for p in 商品 if 対象 in str(p.get('name') or '')]
        if 同:
            return {'ok': True, '文': f'近い名前の商品が{len(同)}件あります: ' + '、'.join(p.get('name') or '' for p in 同[:5])}
        return {'ok': True, '文': f'「{対象}」に近い名前の商品は、いま見当たりません。'}

    if a == 'next_steps':
        商品 = _配列(同期, 'products') or []
        やること = _配列(同期, 'areglm_tasks') or []
        少ない = [p for p in 商品 if _数(p, 'quantity', 'stock') <= _数(p, 'reorderLevel', 既定=5)]
        未 = [t for t in やること if not t.get('done')]
        手 = []
        if 少ない:
            手.append(f'在庫が少ない商品が{len(少ない)}件。補充をやることに残すと漏れません。')
        if 未:
            手.append(f'未完了のやることが{len(未)}件。いちばん近い期限から手を付けるとよいです。')
        if not 手:
            手.append('急ぐものは見当たりません。バックアップの新しさを見る、くらいです。')
        return {'ok': True, '文': '次にできること:\n' + '\n'.join('・' + x for x in 手)}

    if a == 'show_activity':
        return {'ok': True, '文': '画面の使い時間は、開いている端末にしかありません。在庫とやることを代わりに見ます。'}

    if a == 'show_memory':
        try:
            状況 = 永久の記憶.状況を出す() if hasattr(永久の記憶, '状況を出す') else None
        except Exception:  # noqa: BLE001
            状況 = None
        if isinstance(状況, dict):
            return {'ok': True, '文': str(状況.get('文') or 状況)}
        return {'ok': True, '文': '永久の記憶は、この端末の中に追記で残しています。'}

    if a == 'recall_history':
        q = str(材料.get('query') or '').strip()
        if not q:
            return {'ok': False, '文': '何について探すか、聞き取れませんでした'}
        try:
            件 = 永久の記憶.探す(q, 件数=5) if hasattr(永久の記憶, '探す') else []
        except Exception:  # noqa: BLE001
            件 = []
        if not 件:
            return {'ok': True, '文': f'「{q}」について、永久の記憶からは見つかりませんでした。'}
        return {'ok': True, '文': f'「{q}」で {len(件)}件 見つかりました。'}

    if a == 'search_knowledge':
        q = str(材料.get('query') or '').strip()
        if not q:
            return {'ok': False, '文': '何について調べるか、聞き取れませんでした'}
        return {'ok': True, '文': f'「{q}」を、覚えたことの中から探します（画面が開いているときの方が詳しいです）。'}

    if a == 'show_hq':
        生き = [x for x in _仕事を読む() if x.get('状態') in ('進行中', '承認待ち', '画面待ち')]
        if not 生き:
            return {'ok': True, '文': 'いま動いている司令の仕事はありません。'}
        行 = [f'動いている仕事 {len(生き)}件:']
        for x in 生き[:8]:
            行.append(f'・{x.get("名前") or x.get("頼み")}（{x.get("状態")}）')
        return {'ok': True, '文': '\n'.join(行)}

    return {'ok': False, '文': f'「{a}」は、裏からはまだ行えません'}


# ------------------------------------------------------------------
# 進める（読む手はその場で。書く手・道具は Node に返す）
# ------------------------------------------------------------------
def _待ちは満たされたか(仕事, 手):
    for i in 手.get('wait') or []:
        前 = (仕事.get('steps') or [None])[i] if i < len(仕事.get('steps') or []) else None
        if not 前 or 前.get('状態') not in ('完了', '見送り'):
            return False
    return True


def _門は書きを許すか(仕事):
    門 = 仕事.get('門')
    if not 門 or 門.get('状態') in ('よい', '見送り', None):
        return True
    # 待ちの門があるあいだは、読む手だけ進める（書くと、確認前に中身が変わる）
    return False


def _失敗で止まっているか(仕事):
    return any(h.get('状態') == '失敗' for h in (仕事.get('steps') or []))


def 報告をまとめる(仕事):
    行 = [f'「{仕事.get("名前") or 仕事.get("頼み")}」の報告です。']
    済 = 失 = 見 = 0
    for h in 仕事.get('steps') or []:
        係 = h.get('agent_name') or '係'
        状 = h.get('状態')
        結 = (h.get('結果') or {}).get('文') if isinstance(h.get('結果'), dict) else (h.get('結果') or '')
        if 状 == '完了':
            済 += 1
            行.append(f'✓ {係}: {結 or h.get("why")}')
        elif 状 == '失敗':
            失 += 1
            行.append(f'✗ {係}: {結 or "失敗しました"}')
        elif 状 == '見送り':
            見 += 1
            行.append(f'→ {係}: 見送り（{h.get("why")}）')
        elif 状 == '承認待ち':
            行.append(f'… {係}: あなたの「よい」待ち（{h.get("why")}）')
        elif 状 == '画面待ち':
            行.append(f'… {係}: 画面が開いたら進めます（{h.get("why")}）')
        else:
            行.append(f'… {係}: まだ（{h.get("why")}）')
    門 = 仕事.get('門')
    if 門:
        行.append('門: ' + 門.get('訳', '') + f'（{門.get("状態")}）')
    if 失:
        行.append('失敗が出たので、新しい手は始めていません。')
    return '\n'.join(行)


def _仕事を閉じる(仕事):
    手 = 仕事.get('steps') or []
    if 仕事.get('門') and 仕事['門'].get('状態') == '待ち' and not 手:
        仕事['状態'] = '承認待ち'
        return
    if any(h.get('状態') == '失敗' for h in 手):
        仕事['状態'] = '失敗'
        仕事['報告'] = 報告をまとめる(仕事)
        return
    未 = [h for h in 手 if h.get('状態') not in ('完了', '見送り')]
    門待ち = 仕事.get('門') and 仕事['門'].get('状態') == '待ち'
    if 未:
        if all(h.get('状態') == '承認待ち' for h in 未) or 門待ち:
            仕事['状態'] = '承認待ち'
        elif all(h.get('状態') == '画面待ち' for h in 未):
            仕事['状態'] = '画面待ち'
        else:
            仕事['状態'] = '進行中'
        return
    仕事['状態'] = '完了'
    仕事['報告'] = 報告をまとめる(仕事)


def 結果を入れる(仕事id, 番号, 結果):
    一覧 = _仕事を読む()
    仕事 = next((x for x in 一覧 if x.get('id') == 仕事id), None)
    if not 仕事:
        return {'ok': False, '訳': 'その仕事は見つかりません'}
    手たち = 仕事.get('steps') or []
    if not isinstance(番号, int) or 番号 < 0 or 番号 >= len(手たち):
        return {'ok': False, '訳': 'その手は見つかりません'}
    手 = 手たち[番号]
    ok = bool(結果 and 結果.get('ok'))
    手['結果'] = 結果
    手['状態'] = '完了' if ok else '失敗'
    仕事['更新'] = time.time()
    if ok:
        記憶する(手.get('agent_name') or '司令', 結果.get('文') or 手.get('why') or '', 仕事id)
    # 失敗したら、まだ始めていない手は始めない（チームと同じ）
    if not ok:
        for h in 手たち:
            if h.get('状態') in ('待ち',):
                h['状態'] = '見送り'
                h['結果'] = {'ok': False, '文': '前の手が失敗したので、始めていません'}
    _仕事を閉じる(仕事)
    _仕事を書く(一覧)
    return {'ok': True, '仕事': 仕事}


def 起動時の片付け():
    """
    サーバーが落ちたとき、書く手が「実行中」のまま残ることがある。
    書いていないかもしれないので、待ちに戻す（二重に足すより、もう一度試す）。
    読む手の実行中は、結果が無いままなので失敗にする。
    """
    一覧 = _仕事を読む()
    変わった = False
    for 仕事 in 一覧:
        この仕事 = False
        for 手 in 仕事.get('steps') or []:
            if 手.get('状態') != '実行中':
                continue
            この仕事 = True
            変わった = True
            if 手.get('行き先') in ('書く', '道具'):
                手['状態'] = '待ち'
                手['結果'] = None
            else:
                手['状態'] = '失敗'
                手['結果'] = {'ok': False, '文': 'サーバーの再起動で中断されました'}
        if この仕事:
            _仕事を閉じる(仕事)
    if 変わった:
        _仕事を書く(一覧)


def 進める(同期=None):
    """
    列を一回進める。
      ・読む手は、同期の控えからその場で結果を入れる
      ・書く手・道具は、Node に渡す（ここでは書かない）
      ・画面待ち・承認待ちは、触らない
    """
    一覧 = _仕事を読む()
    書く手 = []
    変わった = False
    for 仕事 in 一覧:
        if 仕事.get('状態') not in ('進行中', '承認待ち', '画面待ち'):
            continue
        if _失敗で止まっているか(仕事):
            _仕事を閉じる(仕事)
            変わった = True
            continue
        書き可 = _門は書きを許すか(仕事)
        for 手 in 仕事.get('steps') or []:
            if 手.get('状態') not in ('待ち',):
                continue
            if not _待ちは満たされたか(仕事, 手):
                continue
            先 = 手.get('行き先')
            if 先 == '読む':
                手['状態'] = '実行中'
                結果 = 読む手を行う(手, 同期)
                手['結果'] = 結果
                手['状態'] = '完了' if 結果.get('ok') else '失敗'
                仕事['更新'] = time.time()
                変わった = True
                if 結果.get('ok'):
                    記憶する(手.get('agent_name') or '司令', 結果.get('文') or '', 仕事.get('id'))
                else:
                    for h in 仕事['steps']:
                        if h.get('状態') == '待ち':
                            h['状態'] = '見送り'
                            h['結果'] = {'ok': False, '文': '前の手が失敗したので、始めていません'}
                    break
            elif 先 in ('書く', '道具'):
                if not 書き可:
                    continue
                手['状態'] = '実行中'
                仕事['更新'] = time.time()
                変わった = True
                書く手.append({
                    '仕事id': 仕事['id'],
                    '番号': 手['番号'],
                    'action': 手.get('action'),
                    'params': 手.get('params') or {},
                    'why': 手.get('why') or '',
                    '係': 手.get('agent_name') or '',
                })
            elif 先 == '画面':
                手['状態'] = '画面待ち'
                変わった = True
            elif 先 == '承認':
                手['状態'] = '承認待ち'
                変わった = True
        _仕事を閉じる(仕事)
        変わった = True
    if 変わった:
        _仕事を書く(一覧)
    return {'ok': True, '書く手': 書く手, '一覧': 一覧}


def 一覧を得る():
    return _仕事を読む()


def 仕事を見る(仕事id):
    return next((x for x in _仕事を読む() if x.get('id') == 仕事id), None)


def 取り消す(仕事id):
    一覧 = _仕事を読む()
    仕事 = next((x for x in 一覧 if x.get('id') == 仕事id), None)
    if not 仕事:
        return {'ok': False, '訳': '見つかりません'}
    if 仕事.get('状態') in ('完了', '失敗', '取り消し'):
        return {'ok': False, '訳': f'すでに{仕事["状態"]}です'}
    仕事['状態'] = '取り消し'
    仕事['更新'] = time.time()
    仕事['報告'] = '本人が取り消しました。途中まで進んだ分は、消していません。'
    for h in 仕事.get('steps') or []:
        if h.get('状態') in ('待ち', '実行中', '承認待ち', '画面待ち'):
            h['状態'] = '見送り'
            h['結果'] = {'ok': False, '文': '取り消されたので、始めていません'}
    _仕事を書く(一覧)
    return {'ok': True, '仕事': 仕事}


def 門に答える(仕事id, よい, 番号=None):
    """
    本人の「よい」「見送り」。
    公開・送信・削除は、よいでも行わない（訳を残すだけ）。
    忘れるは、よいなら Node が既存の forget を行う。
    """
    一覧 = _仕事を読む()
    仕事 = next((x for x in 一覧 if x.get('id') == 仕事id), None)
    if not 仕事:
        return {'ok': False, '訳': '見つかりません'}
    返事 = []

    if 番号 is None and 仕事.get('門') and 仕事['門'].get('状態') == '待ち':
        門 = 仕事['門']
        門['状態'] = 'よい' if よい else '見送り'
        仕事['更新'] = time.time()
        if よい and not 門.get('行える'):
            返事.append(門.get('訳') or 'この操作は、こちらからは行いません。')
        elif not よい:
            返事.append('見送りにしました。ほかの手は続けます。')
        else:
            返事.append('了解しました。続けます。')

    対象 = []
    if isinstance(番号, int):
        if 0 <= 番号 < len(仕事.get('steps') or []):
            対象 = [仕事['steps'][番号]]
    else:
        対象 = [h for h in (仕事.get('steps') or []) if h.get('状態') == '承認待ち']

    忘れる手 = []
    for 手 in 対象:
        承 = 手.get('承認') or {}
        if よい:
            if 承.get('行える') and 手.get('action') == 'forget':
                手['状態'] = '待ち'
                手['行き先'] = '道具'
                忘れる手.append({
                    '仕事id': 仕事['id'], '番号': 手['番号'],
                    'action': 'forget', 'params': 手.get('params') or {},
                    'why': 手.get('why') or '', '係': 手.get('agent_name') or '',
                })
                返事.append('忘れる操作を、これから行います（永久の記憶へ残してから）。')
            elif not 承.get('行える'):
                手['状態'] = '見送り'
                手['結果'] = {'ok': True, '文': 承.get('訳') or 'この操作は行いません'}
                返事.append(承.get('訳') or 'この操作は行いません。')
            else:
                手['状態'] = '待ち'
        else:
            手['状態'] = '見送り'
            手['結果'] = {'ok': True, '文': '見送りにしました'}
            返事.append(f'「{手.get("why")}」は見送りにしました。')

    _仕事を閉じる(仕事)
    _仕事を書く(一覧)
    return {'ok': True, '訳': '\n'.join(返事) or '受け取りました', '仕事': 仕事, '書く手': 忘れる手}


# ------------------------------------------------------------------
# 定時（画面が閉じていても、決まった時刻に列へ積む）
# ------------------------------------------------------------------
_曜日 = ['月', '火', '水', '木', '金', '土', '日']


def _今日の印(いま):
    return いま.strftime('%Y-%m-%d')


def 定時を見る(決まり=None, いま=None):
    """
    きっかけが来ている決まりを返す。
    同じ日に一度積んだものは、もう積まない（繰り返しでやることを増やさないため）。
    """
    import datetime
    いま = いま or datetime.datetime.now()
    決まり = 決まり if 決まり is not None else 決まりを読む()
    今日 = _今日の印(いま)
    出 = []
    for x in 決まり:
        if x.get('使う') is False:
            continue
        if x.get('最後に動いた日') == 今日:
            continue
        時, 分 = 8, 0
        m = re.match(r'(\d{1,2}):(\d{2})', str(x.get('時刻') or '08:00'))
        if m:
            時, 分 = int(m.group(1)), int(m.group(2))
        if (いま.hour, いま.minute) < (時, 分):
            continue
        きっかけ = x.get('きっかけ')
        if きっかけ == 'weekly':
            曜 = _曜日[いま.weekday()] if いま.weekday() < 7 else ''
            if 曜 != (x.get('曜日') or '月'):
                continue
        elif きっかけ != 'daily':
            continue
        出.append(x)
    return 出


def 定時に印を付ける(決まりid, いま=None):
    import datetime
    いま = いま or datetime.datetime.now()
    一覧 = 決まりを読む()
    for x in 一覧:
        if x.get('id') == 決まりid:
            x['最後に動いた日'] = _今日の印(いま)
    決まりを書く(一覧)


def 定時を積む(いま=None):
    """来ている決まりを、列へ積む。印は積めたときだけ付ける。"""
    出 = []
    for x in 定時を見る(いま=いま):
        r = 仕事を受ける(x.get('頼み') or '', 定時=True, 名前=x.get('名前') or '')
        if r.get('分かった'):
            定時に印を付ける(x.get('id'), いま=いま)
            出.append(r['仕事'])
    return 出
