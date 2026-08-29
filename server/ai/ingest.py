"""
資料の一括取り込み（自作AIへの学習）

あなた自身が持っている資料だけを読み込んで学習させる。
外部からデータを取得することは一切しない。

対応形式:
  .txt .md          そのまま読む
  .pdf              pdftotext があれば使う（無ければ飛ばす）
  .docx .pptx       ZIP内のXMLから本文だけを取り出す
  .csv              先頭行を見出しとして扱う

除外するもの:
  - プログラムのソースやライブラリ（学習の役に立たず語彙を汚す）
  - ルール違反の内容（違法・個人情報）
  - 短すぎる断片
"""

import argparse
import json
import os
import re
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rules                       # noqa: E402
import 権利の見分け                  # noqa: E402
from learner import OnlineLearner  # noqa: E402
from semantics import SemanticModel  # noqa: E402

TEXT_EXT = {'.txt', '.md'}
DOC_EXT = {'.pdf', '.docx', '.pptx'}
DATA_EXT = {'.csv'}

# 読み込まないディレクトリ（ソースコードや依存ライブラリ）
SKIP_DIRS = {
    'node_modules', '.git', '__pycache__', 'venv', 'env', 'site-packages',
    'dist', 'build', 'Library', 'Frameworks', 'vendor', '.cache',
    'Blender.app', 'CapCut', 'Assets', 'Packages', 'obj', 'bin',
}

# 内容からカテゴリを推定するための手がかり。
# ファイル名・パスに含まれていれば、そのカテゴリとして学習させる。
CATEGORY_HINTS = [
    ('culture', ['文化', '伝統', '民族', '国際', '衣装', '歴史', '宗教', '風習']),
    ('ethics', ['倫理', '道徳', '法', '権利', 'プライバシー']),
    ('society', ['社会', '経済', '政策', '地域', '人口', '環境']),
    ('marketing', ['マーケ', '消費者', '購買', 'ブランド', '広告', 'SNS']),
    ('design', ['デザイン', 'コンセプト', 'プロトタイプ', 'UI', 'UX']),
    ('ai', ['機械学習', 'ディープ', 'ニューラル', 'AI', 'GAN', '拡散', 'python']),
    ('business', ['ビジネス', '起業', '事業', '経営', '財務', '会計']),
]


def guess_category(path, roots=(), text=''):
    """
    どの種類の資料かを決める。

    以前はファイル名だけで決めていた。
    その結果、名前から分からないものが全て 'document' に集まり、
    7,000件を超える巨大な塊ができて、他の種類を飲み込んでしまった。
    実際にそれで判別の正しさが 0.709 から 0.663 に落ちた。

    そこで、
      1. まずファイル名で見る（はっきりしているので確実）
      2. 分からなければ、本文の言葉で見る
      3. それでも分からなければ None を返す

    None を返すのは「学ばせない」という意味。
    どこにも置けない文章は、混ぜても判断を濁らせるだけなので、
    無理に入れないほうがよい。

    @return カテゴリ名 または None
    """
    rel = path
    for r in roots:
        if path.startswith(r):
            rel = path[len(r):]
            break

    # --- 1. ファイル名・直下のフォルダ名で見る ---
    parts = [p for p in rel.split(os.sep) if p]
    target = ' '.join(parts).lower()

    for category, keywords in CATEGORY_HINTS:
        for k in keywords:
            if k.lower() in target:
                return category

    # --- 2. 本文の言葉で見る ---
    #
    # 数えるのは冒頭の一部だけにしてある。
    # 長い資料を丸ごと数えると、どの種類の言葉も一通り出てきて、
    # かえって決め手にならないため。
    if text:
        頭 = text[:4000].lower()
        点 = {}
        for category, keywords in CATEGORY_HINTS:
            n = sum(頭.count(k.lower()) for k in keywords)
            if n:
                点[category] = n

        if 点:
            一位 = max(点.items(), key=lambda x: x[1])
            # はっきり多いときだけ採る。
            # 僅差なら、どちらとも言えないので入れない。
            残り = sorted((v for k, v in 点.items() if k != 一位[0]), reverse=True)
            二位 = 残り[0] if 残り else 0
            if 一位[1] >= 3 and 一位[1] >= 二位 * 1.5:
                return 一位[0]

    # --- 3. 決められない ---
    return None


# ---------- 本文の取り出し ----------

def _from_zip_xml(path, inner_pattern, tag_pattern):
    """docx/pptx から本文テキストだけを取り出す"""
    try:
        with zipfile.ZipFile(path) as z:
            parts = [n for n in z.namelist() if re.match(inner_pattern, n)]
            out = []
            for n in sorted(parts):
                xml = z.read(n).decode('utf-8', errors='replace')
                out.extend(re.findall(tag_pattern, xml, re.S))
            return '\n'.join(out)
    except (zipfile.BadZipFile, OSError, KeyError):
        return ''


def extract_text(path):
    """ファイルから本文を取り出す。読めなければ空文字を返す。"""
    ext = os.path.splitext(path)[1].lower()

    try:
        if ext in TEXT_EXT:
            with open(path, encoding='utf-8', errors='replace') as f:
                return f.read()

        if ext == '.docx':
            return _from_zip_xml(path, r'word/document\.xml', r'<w:t[^>]*>(.*?)</w:t>')

        if ext == '.pptx':
            return _from_zip_xml(path, r'ppt/slides/slide\d+\.xml', r'<a:t>(.*?)</a:t>')

        if ext == '.pdf':
            # pdftotext があるときだけ処理する（無ければ飛ばす）
            try:
                r = subprocess.run(
                    ['pdftotext', '-layout', path, '-'],
                    capture_output=True, timeout=60
                )
                return r.stdout.decode('utf-8', errors='replace')
            except (FileNotFoundError, subprocess.TimeoutExpired):
                return ''

        if ext in DATA_EXT:
            with open(path, encoding='utf-8', errors='replace') as f:
                # CSVは全部読むと数字だらけになるので先頭だけ
                return ''.join([next(f, '') for _ in range(30)])

    except OSError:
        return ''

    return ''


# レポートの表紙・ヘッダー・ページ番号など、中身の無い定型文。
# これを学習すると「伝統」の関連語が「学籍番号」「氏名」になってしまう。
BOILERPLATE_PATTERNS = [
    re.compile(r'^\s*(学籍番号|氏名|名前|提出日|提出期限|担当教員|科目名|授業名|講義名)\s*[:：]?'),
    re.compile(r'^\s*(ページ|page)\s*\d+', re.I),
    re.compile(r'^\s*\d+\s*/\s*\d+\s*$'),
    re.compile(r'^\s*[-–—=_*]{3,}\s*$'),
    re.compile(r'^\s*(参考文献|引用文献|References|目次|Contents)\s*$', re.I),
    re.compile(r'^\s*https?://\S+\s*$'),
    re.compile(r'^\s*\d{8}\s*$'),          # 学籍番号だけの行
    re.compile(r'^\s*(第\s*\d+\s*回|Week\s*\d+)', re.I),
]

# 個人を特定しうる語は学習させない（本人の氏名・学籍番号など）
PERSONAL_TOKENS = re.compile(r'(学籍番号|20\d{6}|小林遼汰|こばやし|kobayashi)', re.I)


def is_boilerplate(passage):
    """中身の無い定型文かどうか"""
    p = passage.strip()
    if not p:
        return True

    for pat in BOILERPLATE_PATTERNS:
        if pat.match(p):
            return True

    # 数字・記号ばかりの行は情報が無い
    letters = sum(1 for c in p if c.isalpha() or '぀' <= c <= '鿿')
    if letters < len(p) * 0.3:
        return True

    return False


# 図やコードの書き方そのもの。中身ではないので、覚えても意味がない。
#
# なぜこれを外すのか:
#   資料に埋まっていた図の書き方（mermaid 記法など）を、
#   そのまま文章として覚えていた。
#   その結果「デザイン」から引ける言葉が
#   flowchart, lr色, lr顧客 になっていた。
#   図の書き方であって、デザインの話ではない。
#
#   言葉のつながりを測る試験で、ここが落ちていたのが手がかりになった。
図やコードの記法 = re.compile(
    r'```[\s\S]*?```'                       # 囲みのコード
    r'|~~~[\s\S]*?~~~'
    r'|^\s*(?:graph|flowchart|sequenceDiagram|classDiagram|gantt|pie|'
    r'erDiagram|stateDiagram(?:-v2)?|journey|mindmap|timeline)\b.*$'
    r'|^\s*(?:LR|RL|TB|BT|TD)\s*$'
    r'|--?>\|[^|]*\|'                        # A -->|ラベル| B
    r'|-\.->|==>|--[->]',                     # 矢印いろいろ
    re.MULTILINE | re.IGNORECASE)

# HTMLやマークダウンの飾り。中身ではない。
飾り = re.compile(r'<[^>]{1,80}>|^\s*[|:\-+]{3,}\s*$', re.MULTILINE)


def clean_passage(passage):
    """
    個人を特定しうる部分と、図やコードの書き方を取り除く。
    残りが短くなれば捨てる。

    書き方そのものを覚えると、言葉のつながりが濁る。
    「中身」だけを覚えたい。
    """
    cleaned = 図やコードの記法.sub(' ', passage)
    cleaned = 飾り.sub(' ', cleaned)
    cleaned = PERSONAL_TOKENS.sub(' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def split_passages(text, min_len=25, max_len=400):
    """
    長い文書を、意味のまとまりごとに切り分ける。
    1ファイルまるごと1件として学習させると語の共起がぼやけるため。
    """
    text = re.sub(r'[ \t　]+', ' ', text)
    blocks = re.split(r'\n{2,}', text)

    raw = []
    for block in blocks:
        block = block.strip()
        if len(block) < min_len:
            continue
        if len(block) <= max_len:
            raw.append(block)
            continue
        # 長すぎる塊は文の切れ目で分ける
        for sentence in re.split(r'(?<=[。！？\.\?!])\s*', block):
            sentence = sentence.strip()
            if len(sentence) >= min_len:
                raw.append(sentence[:max_len])

    # 定型文を除き、個人を特定しうる部分を取り除く
    passages = []
    for p in raw:
        if is_boilerplate(p):
            continue
        cleaned = clean_passage(p)
        if len(cleaned) >= min_len:
            passages.append(cleaned)
    return passages


def collect_files(roots, extensions):
    """対象ファイルを集める（除外ディレクトリは辿らない）"""
    found = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith('.')]
            for fn in filenames:
                if os.path.splitext(fn)[1].lower() in extensions:
                    found.append(os.path.join(dirpath, fn))
    return sorted(found)


# ---------- 取り込み ----------

def ingest(roots, model_path, semantic_path, limit=None, dry_run=False, verbose=False, max_per_category=1500):
    extensions = TEXT_EXT | DOC_EXT | DATA_EXT
    files = collect_files(roots, extensions)
    if limit:
        files = files[:limit]

    print(f'対象ファイル: {len(files)}件')
    if dry_run:
        for f in files[:30]:
            print(f'  [{guess_category(f, roots) or "種類不明・学ばせない"}] {os.path.basename(f)}')
        if len(files) > 30:
            print(f'  … 他 {len(files) - 30}件')
        return

    learner = OnlineLearner(model_path)
    semantic = SemanticModel()
    semantic.load(semantic_path)

    # 知識としても残す。
    #
    # ここが抜けていた。
    #
    # 682件の資料を取り込んでいるのに、
    # 学習データにしか入れていなかった。
    # 学習データは「どの分類か」を当てるためのもので、
    # <b>「何と書いてあったか」を引き出せない</b>。
    #
    # そのせいで「生地について」と聞かれても
    # 「まだ分かりません」としか返せずにいた。
    # 682件の資料が、そこにあるのに使えていなかった。
    from knowledge import KnowledgeBase
    知識の道 = os.path.join(os.path.dirname(model_path), 'ai_knowledge.json')
    知識 = KnowledgeBase(知識の道, semantic=semantic)
    知識に足した = 0

    stats = {'files': 0, 'passages': 0, 'learned': 0, 'blocked': 0, 'skipped': 0}

    # すでに覚えている数から数え始める。
    #
    # ここが抜けていた。
    #
    # 上限はこの回だけに効いていて、
    # 前に覚えたぶんを見ていなかった。
    # そのせいで ai が7,363件（全体の42%）まで積み上がり、
    # 文化の判別が落ちた（0.880 → 0.697）。
    #
    # 一度に大量に入れなくても、
    # 何回かに分けて入れれば、いくらでも偏る作りだった。
    by_category = {}
    try:
        既に = getattr(learner, "class_doc_counts", None) or {}
        for k, v in dict(既に).items():
            by_category[k] = int(v)
        if by_category:
            多い = sorted(by_category.items(), key=lambda x: -x[1])[:3]
            print('  すでに覚えている数から数えます: '
                  + '、'.join(f'{k} {v}件' for k, v in 多い))
    except Exception as e:
        print(f'  いまの数を読めませんでした（0から数えます）: {e}')
    権利控え = []

    for i, path in enumerate(files, 1):
        text = extract_text(path)
        if not text or len(text) < 50:
            stats['skipped'] += 1
            continue

        # --- 他人の権利がかかっているものは、中身を覚えない ---
        #
        # 覚えない代わりに、在ったことだけ控えておく。
        # 黙って飛ばすと「学んだつもり」の食い違いが起きるため。
        権利 = 権利の見分け.調べる(text, path)
        if not 権利['学ばせてよいか']:
            権利控え.append(権利の見分け.控えを作る(path, 権利, text))
            stats['rights'] = stats.get('rights', 0) + 1
            stats['skipped'] += 1
            continue

        # 本文も渡して、名前から分からないものは中身で決める
        category = guess_category(path, roots, text)
        if category is None:
            # どこにも置けない資料は学ばせない。
            # 混ぜると判断が濁り、実際に正しさが落ちたため。
            stats['unclassified'] = stats.get('unclassified', 0) + 1
            stats['skipped'] += 1
            continue

        passages = split_passages(text)
        if not passages:
            stats['skipped'] += 1
            continue

        # ひとつの種類だけが極端に多くなると、
        # その種類が他を飲み込んでしまう。
        # 実際、ethics を8,000件入れたところ、
        # 文化やマーケティングの判別が 0.83 から 0.17 に落ちた。
        # そこで種類ごとに上限を設ける。
        if by_category.get(category, 0) >= max_per_category:
            stats['over_limit'] = stats.get('over_limit', 0) + 1
            stats['skipped'] += 1
            continue

        stats['files'] += 1
        for p in passages:
            stats['passages'] += 1

            # ルール違反（違法・個人情報）は学習させない
            verdict = rules.check(p)
            if not verdict['ok']:
                stats['blocked'] += 1
                continue

            learner.learn(p, category)
            semantic.observe(p)
            stats['learned'] += 1

            # 引き出せる形でも残す。
            #
            # 短すぎるものは残さない。
            # 「はい」「以上」のような断片は、
            # 引き出しても役に立たず、探すのを遅くするだけ。
            if len(p) >= 40:
                try:
                    知識.add(p, source='manual', topic=category,
                             note=f'資料から（{os.path.basename(path)}）')
                    知識に足した += 1
                except Exception:
                    # 一つ入らなくても、学習は続ける。
                    # ここで止めると、取り込みそのものが終わらない。
                    pass
            by_category[category] = by_category.get(category, 0) + 1

        if verbose or i % 20 == 0:
            print(f'  {i}/{len(files)}  {os.path.basename(path)[:40]:<40} '
                  f'[{category}] {len(passages)}節')

    print('\n意味モデルを構築中…（語数が多いと時間がかかります）')
    build_result = semantic.build()

    learner.save()

    # 知識も保存する
    try:
        知識.save()
        print(f'  引き出せる形でも {知識に足した}件 残しました')
    except Exception as e:
        print(f'  知識を保存できませんでした: {e}')
    semantic.save(semantic_path)

    print('\n=== 取り込み結果 ===')
    print(f'  読み込んだファイル : {stats["files"]}')
    print(f'  飛ばしたファイル   : {stats["skipped"]}')
    print(f'  抽出した文節       : {stats["passages"]}')
    print(f'  学習した文節       : {stats["learned"]}')
    print(f'  種類不明で除外     : {stats.get("unclassified", 0)}')
    print(f'  ルールで除外       : {stats["blocked"]}')
    print(f'  上限で見送り       : {stats.get("over_limit", 0)}')
    print(f'  権利があり見送り   : {stats.get("rights", 0)}')

    # 権利がかかっていたものは、控えを残す。
    # 覚えていないことを、あとから確かめられるようにするため。
    if 権利控え:
        控え先 = os.path.join(os.path.dirname(model_path), '権利のある資料.json')
        既存 = []
        if os.path.exists(控え先):
            try:
                with open(控え先, encoding='utf-8') as f:
                    既存 = json.load(f)
            except Exception:
                既存 = []
        既存.extend(権利控え)
        with open(控え先, 'w', encoding='utf-8') as f:
            json.dump(既存, f, ensure_ascii=False, indent=1)
        print()
        print(権利の見分け.まとめ(権利控え))
    print(f'  語彙               : {len(learner.vocabulary)}')
    print(f'  意味モデル         : {build_result}')
    print('\n  カテゴリ別:')
    for c, n in sorted(by_category.items(), key=lambda x: -x[1]):
        print(f'    {c:<12} {n}')


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(here, '..', 'data')

    ap = argparse.ArgumentParser(description='自分の資料を自作AIに学習させる')
    ap.add_argument('roots', nargs='+', help='取り込むフォルダー')
    ap.add_argument('--limit', type=int, help='先頭N件だけ処理する')
    ap.add_argument('--dry-run', action='store_true', help='対象を確認するだけ')
    ap.add_argument('--verbose', action='store_true')
    ap.add_argument(
        '--max-per-category', type=int, default=1500,
        help='ひとつの種類につき、この件数までしか学ばせない（既定 1500）',
    )
    args = ap.parse_args()

    ingest(
        args.roots,
        os.path.join(data_dir, 'ai_model.json'),
        os.path.join(data_dir, 'ai_semantics.json'),
        limit=args.limit,
        dry_run=args.dry_run,
        verbose=args.verbose,
        max_per_category=args.max_per_category,
    )


if __name__ == '__main__':
    main()
