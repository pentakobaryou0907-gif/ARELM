/**
 * iOS（iPhone・iPad）で使えるかを静的に検査する
 *
 * 実機でしか分からないこともあるが、
 * 「よくある落とし穴」は事前に見つけられる。
 *
 * 検査する内容:
 *   1. ホーム画面に追加したときの設定（iOS用メタタグ）
 *   2. アイコン画像が実在するか
 *   3. ノッチ・ホームバーに隠れない指定があるか
 *   4. 入力欄が勝手に拡大されないか（16px以上）
 *   5. 画面の高さ指定が iOS でずれないか
 *   6. 指で押しやすい大きさが確保されているか
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

let problems = 0;
const ok = (m) => console.log(`  OK  ${m}`);
const ng = (m) => {
    console.log(`  NG  ${m}`);
    problems += 1;
};

console.log('[iOS 対応チェック]');

/* 1. iOS用メタタグ */
const metas = [
    ['apple-mobile-web-app-capable', 'ホーム画面から全画面で開く'],
    ['apple-mobile-web-app-title', 'ホーム画面での名前'],
    ['viewport-fit=cover', 'ノッチまで画面を使う']
];
metas.forEach(([needle, label]) => {
    html.includes(needle) ? ok(label) : ng(`${label}（${needle} がありません）`);
});

/* 2. アイコン画像 */
const iconMatches = [...html.matchAll(/apple-touch-icon"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const manifestIcons = (manifest.icons || []).map((i) => i.src);

[...new Set([...iconMatches, ...manifestIcons])].forEach((src) => {
    fs.existsSync(path.join(root, src))
        ? ok(`アイコンが実在: ${src}`)
        : ng(`アイコンが見つかりません: ${src}`);
});

/* 3. セーフエリア */
const safeAreaTargets = ['.bottom-nav', '.quick-fab', '.composer-wrap'];
const safeCount = (css.match(/env\(safe-area-inset/g) || []).length;
safeCount >= safeAreaTargets.length
    ? ok(`ノッチ・ホームバー対応 ${safeCount}箇所`)
    : ng(`セーフエリア対応が足りません（${safeCount}箇所）`);

/* 4. 入力欄の拡大防止 */
css.includes('font-size: 16px')
    ? ok('入力欄が勝手に拡大されない（16px指定あり）')
    : ng('入力欄の文字が16px未満だと、iOSで勝手に拡大されます');

/* 5. 画面の高さ */
css.includes('100dvh') || css.includes('-webkit-fill-available')
    ? ok('画面の高さが iOS でずれない')
    : ng('100vh のままだと iOS で下がはみ出します');

/* 6. 押しやすい大きさ */
css.includes('pointer: coarse')
    ? ok('指で押しやすい大きさを確保')
    : ng('タッチ用の大きさ指定がありません');

/* 7. iOSで動かない機能を、黙って失敗させていないか */
const wake = fs.readFileSync(path.join(root, 'js', 'modules', 'wake-word.js'), 'utf8');
wake.includes('isIOS')
    ? ok('音声が使えない端末に案内を出す')
    : ng('iOSで音声が使えないとき、何も言わずに止まります');

console.log(
    problems === 0
        ? '\n  iOSで想定される問題は見つかりませんでした'
        : `\n  ${problems}件の問題があります`
);
process.exit(problems ? 1 : 0);
