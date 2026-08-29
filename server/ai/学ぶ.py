# -*- coding: utf-8 -*-
"""
ソフトウェアの中から、学べる中身を取り出す

なぜこれが要るのか:
    アプリの中に ComfyUI のコピーが89GBある。
    ほとんどはモデルの重みと途中のダウンロードで、
    それ自体は読んでも意味がない。

    だが「どんな部品があって、それぞれ何をするか」は知識になる。
    画像生成の話を聞かれたとき、答えられる材料になる。

    ソースコードをそのまま覚えさせるのは筋が悪い。
    語彙が記号だらけになり、日本語の答えが濁る。
    一度それで学習の質を落としている。

    だから「説明にあたる部分」だけを取り出す。

取り出すもの:
    ・README や docs の文章
    ・部品（ノード）の名前と、その説明・分類・入力

取り出さないもの:
    ・処理そのもののコード
    ・モデルの重み、画像、途中のダウンロード
    ・鍵や認証情報らしきもの

外部へは一切問い合わせません。すべてこの端末の中で完結します。
"""

import ast
import os
import re

# 中へ入らない場所
入らない = {
    'node_modules', 'venv', '.venv', 'site-packages', '__pycache__', '.git',
    'models', 'output', 'input', 'temp', 'dist', 'build', '.cache',
    'comfy_env', 'web', 'tests', 'test',
}

# 鍵らしきものが入っていたら、その一片は捨てる
危ない言葉 = re.compile(
    r'(api[_-]?key|secret|password|passwd|token|credential|bearer\s|sk-[a-z0-9]{10,})',
    re.I)



# ComfyUI の分類を、日本語にする。
#
# なぜ要るのか:
#   取り出した説明は英語のまま。
#   知識として持たせても、「画像を拡大する部品」と日本語で聞くと引けなかった。
#   持っているのに引けないのでは、持っていないのと同じ。
#
#   分類は数が限られているので、日本語を添えるだけで届くようになる。
分類の訳 = {
    'conditioning': '条件付け・プロンプト',
    'sampling': '生成・サンプリング',
    'latent': '潜在画像',
    'image': '画像',
    'upscaling': '拡大・アップスケール',
    'loaders': '読み込み',
    'mask': 'マスク・切り抜き',
    'video': '動画',
    'audio': '音声',
    'model': 'モデル',
    'advanced': '応用',
    'text': '文字・テキスト',
    'style': '画風・スタイル',
    'controlnet': '姿勢・構図の制御',
    'lora': '追加学習（LoRA）',
    'inpaint': '部分描き直し',
    'postprocessing': '仕上げ・後処理',
    'transform': '変換',
    'batch': 'まとめて処理',
    'save': '保存',
    'preview': 'プレビュー',
    'utils': '道具',
    'api node': '外部の部品',
}


def 分類を日本語に(分類):
    """分類の道すじ（image/upscaling）を、日本語の言葉に置き換える。"""
    if not 分類:
        return ''
    出 = []
    for 片 in re.split(r'[/_\-]', 分類.lower()):
        片 = 片.strip()
        if not 片:
            continue
        訳 = 分類の訳.get(片)
        if 訳 and 訳 not in 出:
            出.append(訳)
    return '・'.join(出)

def _安全か(文):
    return not 危ない言葉.search(文 or '')


def _整える(文):
    """読める形にする。記号だけの行や、短すぎる行は落とす。"""
    if not 文:
        return ''
    文 = re.sub(r'```[\s\S]*?```', ' ', 文)          # 囲みのコード
    文 = re.sub(r'<[^>]{1,80}>', ' ', 文)            # HTMLの飾り
    文 = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', 文)  # リンクは文字だけ残す
    文 = re.sub(r'[#*>`|_-]{2,}', ' ', 文)
    文 = re.sub(r'\s+', ' ', 文).strip()
    return 文


def 文書から取る(道, 最長=400):
    """README や docs から、意味のある文だけを取り出す。"""
    try:
        with open(道, encoding='utf-8', errors='ignore') as f:
            中身 = f.read(200000)
    except OSError:
        return []

    出 = []
    for 段 in re.split(r'\n{2,}', 中身):
        文 = _整える(段)
        if len(文) < 40 or len(文) > 最長:
            continue
        if not _安全か(文):
            continue
        # 記号ばかりの行は捨てる
        字 = sum(1 for c in 文 if c.isalnum() or ord(c) > 0x3000)
        if 字 / max(1, len(文)) < 0.6:
            continue

        # バッジ・画像・リンクの塊は、読み物ではない。
        #
        # 最初のふるいでは通ってしまい、
        # 「[![Website][website-shield]][website-url] …」のような行が
        # 学ぶ対象に入っていた。中身が無いので、覚えても濁るだけ。
        if 段.count('](') >= 2 or 段.count('][') >= 2:
            continue
        if re.search(r'<img|<a\s|!\[|https?://\S+\s+https?://', 段):
            continue
        # URLだらけの行も落とす
        if len(re.findall(r'https?://', 段)) >= 2:
            continue
        # 英字だけで、しかも大文字と記号が多い行（見出し飾りなど）
        if not re.search(r'[ぁ-んァ-ヶ一-龠]', 文) and len(文.split()) < 6:
            continue

        出.append(文)
    return 出


def ノードから取る(道):
    """
    部品（ノード）の定義から、名前と説明を取り出す。

    コードそのものは読まない。
    クラス名・分類・説明・入力の名前だけを見る。
    そこが「何をする部品か」を表しているため。
    """
    try:
        with open(道, encoding='utf-8', errors='ignore') as f:
            中身 = f.read(400000)
        木 = ast.parse(中身)
    except (OSError, SyntaxError, ValueError):
        return []

    出 = []
    for 節 in ast.walk(木):
        if not isinstance(節, ast.ClassDef):
            continue

        名 = 節.name
        分類 = ''
        説明 = ast.get_docstring(節) or ''
        入力 = []
        戻り = ''

        for 中 in 節.body:
            # CATEGORY = "image/upscaling" のような行
            if isinstance(中, ast.Assign):
                for 先 in 中.targets:
                    if not isinstance(先, ast.Name):
                        continue
                    if 先.id == 'CATEGORY' and isinstance(中.value, ast.Constant):
                        分類 = str(中.value.value)
                    if 先.id == 'DESCRIPTION' and isinstance(中.value, ast.Constant):
                        説明 = 説明 or str(中.value.value)
                    if 先.id == 'RETURN_TYPES':
                        try:
                            戻り = '、'.join(
                                str(x.value) for x in 中.value.elts
                                if isinstance(x, ast.Constant))
                        except AttributeError:
                            pass

            # INPUT_TYPES の中に出てくる入力の名前
            if isinstance(中, ast.FunctionDef) and 中.name == 'INPUT_TYPES':
                for x in ast.walk(中):
                    if isinstance(x, ast.Constant) and isinstance(x.value, str):
                        v = x.value
                        if 2 <= len(v) <= 24 and re.fullmatch(r'[A-Za-z0-9_]+', v):
                            if v not in ('required', 'optional', 'hidden') and v not in 入力:
                                入力.append(v)

        # 分類も説明も無いものは、部品として意味を持たない
        if not 分類 and not 説明:
            continue

        説明 = _整える(説明)[:300]
        if not _安全か(名 + 説明):
            continue

        訳 = 分類を日本語に(分類)
        if 訳:
            文 = f'{名}（{訳}）は、ComfyUI の {分類} という分類の部品です。'
        else:
            文 = f'{名} は、ComfyUI の {分類 or "分類なし"} の部品です。'
        if 説明:
            文 += f' {説明}'
        if 入力:
            文 += f' 受け取るもの: {"、".join(入力[:8])}。'
        if 戻り:
            文 += f' 返すもの: {戻り}。'
        出.append(文)

    return 出


def 集める(根, 上限=1200):
    """
    その場所から、学べる中身を集める。

    @return {'文書': [...], 'ノード': [...], '見たファイル': int}
    """
    文書 = []
    ノード = []
    見た = 0

    for 現在, フォルダたち, ファイルたち in os.walk(根):
        フォルダたち[:] = [d for d in フォルダたち
                        if d not in 入らない and not d.startswith('.')]

        for f in ファイルたち:
            道 = os.path.join(現在, f)
            低 = f.lower()

            if 低.endswith('.md') or 低.startswith('readme'):
                文書.extend(文書から取る(道))
                見た += 1
            elif 低.endswith('.py'):
                ノード.extend(ノードから取る(道))
                見た += 1

            if len(文書) + len(ノード) >= 上限:
                return {'文書': 文書[:上限], 'ノード': ノード[:上限], '見たファイル': 見た}

    return {'文書': 文書, 'ノード': ノード, '見たファイル': 見た}
