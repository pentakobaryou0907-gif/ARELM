/**
 * 読み込み時に壊れる問題を静的に見つける
 *
 * このツールの JS はすべてグローバルスコープを共有している。
 * そのため次の2つは、1箇所あるだけでページ全体が動かなくなる:
 *
 *   1. 同じ名前の const / let / function を別ファイルで宣言している
 *      → SyntaxError で以降のスクリプトが止まる
 *   2. まだ読み込まれていないファイルの値を、読み込み時に参照している
 *      → ReferenceError
 *
 * 構文チェックだけでは見つからないので、ここで別途調べる。
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// index.html に書かれた読み込み順のまま調べる
const files = [...html.matchAll(/src="(js\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((f) => fs.existsSync(path.join(root, f)));

let problems = 0;

/**
 * 名前として使える文字。
 *
 * このツールの関数名には日本語を使っている。
 * ここを A-Za-z だけにしていたら、
 * 「render様子」を「render」として拾ってしまい、
 * 「render守り」と名前がぶつかっている、と嘘の報告を出していた。
 *
 * 逆に言えば、日本語だけの名前（例:「指示を実行する」）は
 * ここに引っかからず、衝突していても見逃していた。
 * 見逃す方が、たちが悪い。
 */
const 名前の先頭 = 'A-Za-z_$\\u3005\\u3006\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff66-\\uff9f';
const 名前の続き = 名前の先頭 + '0-9\\u30fc';
const 宣言のかたち = new RegExp(
    `^(?:export\\s+)?(?:async\\s+)?(?:const|let|var|function|class)(?:\\s*\\*)?\\s+([${名前の先頭}][${名前の続き}]*)`, 'gm');
const 窓に置くかたち = new RegExp(
    `window\\.([${名前の先頭}][${名前の続き}]*)\\s*=`, 'g');

/* ---- 1. 名前の衝突 ---- */
const declaredIn = {};
const conflicts = [];

for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    宣言のかたち.lastIndex = 0;
    let m;
    while ((m = 宣言のかたち.exec(src))) {
        const name = m[1];
        if (declaredIn[name] && declaredIn[name] !== f) {
            conflicts.push({ name, first: declaredIn[name], second: f });
        } else if (!declaredIn[name]) {
            declaredIn[name] = f;
        }
    }
}

if (conflicts.length) {
    problems += conflicts.length;
    console.log(`名前の衝突 ${conflicts.length}件（ページ全体が止まります）:`);
    conflicts.forEach((c) => {
        console.log(`  ${c.name}`);
        console.log(`    ${c.first}`);
        console.log(`    ${c.second}`);
    });
}

/* ---- 2. 読み込み時の未定義参照 ---- */
const defined = new Set();
const early = [];

for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    let depth = 0;

    src.split('\n').forEach((line, i) => {
        const before = depth;
        depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (before !== 0) return; // 関数の中は実行時なので対象外

        const m = line.match(/^(?:const|let|var)\s+[\w$]+\s*=\s*([A-Z][\w$]*)/);
        if (m && /^(AReGLM|AREGLM)/.test(m[1]) && !defined.has(m[1])) {
            early.push(`${f}:${i + 1}  ${m[1]} を読み込み時に参照しています`);
        }
    });

    let mm;
    const re = new RegExp(宣言のかたち.source, 'gm');
    while ((mm = re.exec(src))) defined.add(mm[1]);
    const rw = new RegExp(窓に置くかたち.source, 'g');
    while ((mm = rw.exec(src))) defined.add(mm[1]);
}

if (early.length) {
    problems += early.length;
    console.log(`\n読み込み順の問題 ${early.length}件:`);
    early.forEach((e) => console.log(`  ${e}`));
}

/* ---- 3. onclick から呼ばれる関数が公開されているか ---- */
const inlineCalls = [...html.matchAll(/on\w+="([a-zA-Z_$][\w$]*)\(/g)].map((m) => m[1]);
const missing = [...new Set(inlineCalls)].filter((fn) => !defined.has(fn));

if (missing.length) {
    problems += missing.length;
    console.log(`\nHTMLから呼ばれているのに定義が見つからない関数 ${missing.length}件:`);
    missing.forEach((fn) => console.log(`  ${fn}()`));
}

if (problems === 0) {
    console.log(`調べたファイル ${files.length} / トップレベル宣言 ${Object.keys(declaredIn).length} — 問題なし`);
}

process.exit(problems ? 1 : 0);
