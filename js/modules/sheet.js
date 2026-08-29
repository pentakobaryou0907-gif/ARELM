/**
 * 表（エクセル・スプレッドシートの代わり）
 *
 * なぜこれが要るのか:
 *   在庫や売上の管理を、外部のスプレッドシートで行っていた。
 *   このツールだけで完結させたいので、同じことができる表を作る。
 *
 * できること:
 *   ・行と列で数字や文字を入れる
 *   ・式が書ける（=A1*B1 のように）
 *   ・合計・平均・件数・最大・最小
 *   ・CSVの読み込みと書き出し
 *   ・登録済みの商品をそのまま表に出す
 *
 * 式について:
 *   四則演算と、決まった関数だけを扱う。
 *   何でも計算できるようにすると、
 *   書いたものがそのまま実行されてしまい危ないため、
 *   数字と記号だけを通す作りにしてある。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const AREGLM_SHEET_KEY = 'areglm_sheets';

/** いま開いている表 */
let いまの表 = null;

/** 列の名前（A, B, C ... Z, AA ...） */
function 列名(n) {
    let s = '';
    n += 1;
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

/** 列名から番号へ（A→0, B→1 ...） */
function 列番号(名) {
    let n = 0;
    for (const c of 名.toUpperCase()) {
        n = n * 26 + (c.charCodeAt(0) - 64);
    }
    return n - 1;
}

/* ---------- 保存 ---------- */

function 表たちを読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_SHEET_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 表たちを保存(表たち) {
    localStorage.setItem(AREGLM_SHEET_KEY, JSON.stringify(表たち));
}

/** 新しい表を作る */
function 表を作る(名前, 行数 = 20, 列数 = 8) {
    return {
        id: 'sheet_' + Date.now(),
        名前: 名前 || '新しい表',
        行数,
        列数,
        // 中身は { "0,0": "値" } の形で持つ。
        // 全マスを配列で持つと、空のマスまで保存されて無駄になるため。
        マス: {},
        作った日: new Date().toISOString(),
    };
}

/* ---------- 計算 ---------- */

/**
 * マスの中身を取り出す。
 * 式なら計算した結果、そうでなければそのままの値。
 */
function マスの値(表, 行, 列, 深さ = 0) {
    const 生 = 表.マス[`${行},${列}`];
    if (生 === undefined || 生 === '') return '';

    if (typeof 生 === 'string' && 生.startsWith('=')) {
        // 式が式を呼び合って終わらなくなるのを防ぐ
        if (深さ > 20) return '#循環';
        return 式を計算する(表, 生.slice(1), 深さ + 1);
    }
    return 生;
}

/** マスの中身を、数として取り出す。数でなければ0。 */
function マスの数(表, 行, 列, 深さ = 0) {
    const v = マスの値(表, 行, 列, 深さ);
    const n = Number(String(v).replace(/[,¥￥\s]/g, ''));
    return isNaN(n) ? 0 : n;
}

/** A1 のような書き方を、行と列に直す */
function 番地を読む(文字) {
    const m = String(文字).trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!m) return null;
    return { 行: Number(m[2]) - 1, 列: 列番号(m[1]) };
}

/**
 * 式を計算する。
 *
 * まず番地を数に置き換え、関数を計算し、
 * 最後に残った四則演算を解く。
 *
 * 危ないことをさせないため、
 * 最後に残ってよいのは数字と記号だけにしてある。
 */
function 式を計算する(表, 式, 深さ = 0) {
    let f = String(式).trim();

    // --- 範囲を使う関数（SUM など）を先に計算する ---
    const 関数たち = {
        SUM: (数たち) => 数たち.reduce((a, b) => a + b, 0),
        AVERAGE: (数たち) => (数たち.length ? 数たち.reduce((a, b) => a + b, 0) / 数たち.length : 0),
        COUNT: (数たち) => 数たち.filter((n) => n !== 0 || true).length,
        MAX: (数たち) => (数たち.length ? Math.max(...数たち) : 0),
        MIN: (数たち) => (数たち.length ? Math.min(...数たち) : 0),
    };

    f = f.replace(/(SUM|AVERAGE|COUNT|MAX|MIN)\s*\(\s*([A-Z]+\d+)\s*:\s*([A-Z]+\d+)\s*\)/gi,
        (全体, 名, 始, 終) => {
            const a = 番地を読む(始);
            const b = 番地を読む(終);
            if (!a || !b) return '#番地';

            const 数たち = [];
            for (let r = Math.min(a.行, b.行); r <= Math.max(a.行, b.行); r++) {
                for (let c = Math.min(a.列, b.列); c <= Math.max(a.列, b.列); c++) {
                    数たち.push(マスの数(表, r, c, 深さ));
                }
            }
            const fn = 関数たち[名.toUpperCase()];
            return fn ? String(fn(数たち)) : '#関数';
        });

    // --- 単独の番地を数に置き換える ---
    f = f.replace(/\b([A-Z]+)(\d+)\b/g, (全体, 列, 行) => {
        const a = 番地を読む(全体);
        return a ? String(マスの数(表, a.行, a.列, 深さ)) : '0';
    });

    // --- 残ったのが数と記号だけかを確かめる ---
    //
    // ここを確かめずに計算すると、
    // 書いた文字がそのまま実行されてしまう。
    // 数字・小数点・四則・括弧・空白 以外が残っていたら断る。
    if (!/^[\d+\-*/().\s]*$/.test(f)) return '#式';
    if (!f.trim()) return '';

    const 答え = 四則を解く(f);
    if (答え === null) return '#エラー';

    // 小数のゴミを落とす（0.1+0.2 が 0.30000000000000004 になるため）
    return Math.round(答え * 1e10) / 1e10;
}

/**
 * 四則演算を、自分で解く。
 *
 * なぜ自分で解くのか:
 *   ここは Function() に渡して計算させていた。
 *   ところがこのツールは、自分自身に
 *   「文字列をコードとして実行しない」という決まり（CSP）をかけている。
 *   その決まりに引っかかって、計算がすべて #エラー になっていた。
 *
 *   決まりを緩めれば動くが、それは逆をやっている。
 *   文字列を実行しない、は守るべき決まりの方なので、
 *   計算する側を自分で書く。
 *
 *   この壊れ方は、画面を開いた直後だけは動いて、
 *   一度どこかへ問い合わせたあとから動かなくなる、という出方をしていた。
 *   気づきにくいので、点検（要件表の「表計算」）で見つけた。
 *
 * 解き方:
 *   前から一文字ずつ読んで、掛け算・割り算を先に、
 *   足し算・引き算を後に計算する。括弧が来たら中を先に解く。
 *
 * 解けなければ null を返す。
 * 適当な数を返すと、それが合っていると思われてしまう。
 */
function 四則を解く(式) {
    const 文字 = String(式);
    let 位置 = 0;

    const 飛ばす = () => { while (位置 < 文字.length && /\s/.test(文字[位置])) 位置++; };

    // 足し算・引き算（いちばん後に計算する）
    const 足し引き = () => {
        let 左 = 掛け割り();
        if (左 === null) return null;
        for (;;) {
            飛ばす();
            const c = 文字[位置];
            if (c !== '+' && c !== '-') return 左;
            位置++;
            const 右 = 掛け割り();
            if (右 === null) return null;
            左 = (c === '+') ? 左 + 右 : 左 - 右;
        }
    };

    // 掛け算・割り算（足し引きより先に計算する）
    const 掛け割り = () => {
        let 左 = 符号つき();
        if (左 === null) return null;
        for (;;) {
            飛ばす();
            const c = 文字[位置];
            if (c !== '*' && c !== '/') return 左;
            位置++;
            const 右 = 符号つき();
            if (右 === null) return null;
            if (c === '/') {
                // 0で割ったら、答えは無い。0を返すと嘘になる。
                if (右 === 0) return null;
                左 = 左 / 右;
            } else {
                左 = 左 * 右;
            }
        }
    };

    // 先頭の＋−（-A1 のような書き方）
    const 符号つき = () => {
        飛ばす();
        if (文字[位置] === '+') { 位置++; return 符号つき(); }
        if (文字[位置] === '-') {
            位置++;
            const v = 符号つき();
            return v === null ? null : -v;
        }
        return かたまり();
    };

    // 括弧のかたまり、または数
    const かたまり = () => {
        飛ばす();
        if (文字[位置] === '(') {
            位置++;
            const 中 = 足し引き();
            飛ばす();
            if (文字[位置] !== ')') return null;   // 閉じ括弧が無い
            位置++;
            return 中;
        }
        const 始 = 位置;
        while (位置 < 文字.length && /[\d.]/.test(文字[位置])) 位置++;
        if (位置 === 始) return null;
        const n = Number(文字.slice(始, 位置));
        return isFinite(n) ? n : null;
    };

    const 答え = 足し引き();
    飛ばす();

    // 最後まで読み切れていなければ、式が壊れている
    if (位置 !== 文字.length) return null;
    if (答え === null || !isFinite(答え)) return null;
    return 答え;
}

/* ---------- 画面 ---------- */

function renderSheet() {
    const 箱 = document.getElementById('sheet-grid');
    if (!箱 || !いまの表) return;

    const 表 = いまの表;
    let html = '<table class="sheet-table"><thead><tr><th class="sheet-corner"></th>';
    for (let c = 0; c < 表.列数; c++) html += `<th>${列名(c)}</th>`;
    html += '</tr></thead><tbody>';

    for (let r = 0; r < 表.行数; r++) {
        html += `<tr><th class="sheet-rownum">${r + 1}</th>`;
        for (let c = 0; c < 表.列数; c++) {
            const 生 = 表.マス[`${r},${c}`] ?? '';
            const 表示 = マスの値(表, r, c);
            const 式か = typeof 生 === 'string' && 生.startsWith('=');
            html += `<td><input type="text" data-r="${r}" data-c="${c}"`
                + ` class="sheet-cell${式か ? ' is-formula' : ''}"`
                + ` value="${AReGLM_SECURITY.escapeAttr(String(表示))}"`
                + ` data-raw="${AReGLM_SECURITY.escapeAttr(String(生))}"></td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    箱.innerHTML = html;

    // マスを触ったときの動き
    箱.querySelectorAll('.sheet-cell').forEach((入力) => {
        // 選ぶと、式そのものが出る（計算結果ではなく）
        入力.addEventListener('focus', () => {
            入力.value = 入力.dataset.raw || '';
        });
        入力.addEventListener('blur', () => {
            const r = Number(入力.dataset.r);
            const c = Number(入力.dataset.c);
            const 値 = 入力.value;
            if (値 === '') delete 表.マス[`${r},${c}`];
            else 表.マス[`${r},${c}`] = 値;
            表を今のに保存();
            renderSheet();
            集計を出す();
        });
        入力.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); 入力.blur(); }
        });
    });

    集計を出す();
}

/** 表全体の要約を出す */
function 集計を出す() {
    const 箱 = document.getElementById('sheet-summary');
    if (!箱 || !いまの表) return;

    const 表 = いまの表;
    let 埋まったマス = 0;
    let 数のマス = 0;
    let 合計 = 0;

    for (let r = 0; r < 表.行数; r++) {
        for (let c = 0; c < 表.列数; c++) {
            const v = マスの値(表, r, c);
            if (v === '') continue;
            埋まったマス++;
            const n = Number(String(v).replace(/[,¥￥\s]/g, ''));
            if (!isNaN(n)) { 数のマス++; 合計 += n; }
        }
    }

    箱.textContent = `埋まったマス ${埋まったマス} ／ 数のマス ${数のマス} ／ 数の合計 ${合計.toLocaleString('ja-JP')}`;
}

function 表を今のに保存() {
    if (!いまの表) return;
    const 表たち = 表たちを読む();
    const i = 表たち.findIndex((x) => x.id === いまの表.id);
    if (i >= 0) 表たち[i] = いまの表;
    else 表たち.push(いまの表);
    表たちを保存(表たち);
}

function 表の一覧を出す() {
    const 選 = document.getElementById('sheet-select');
    if (!選) return;
    const 表たち = 表たちを読む();
    選.innerHTML = 表たち.map((s) =>
        `<option value="${AReGLM_SECURITY.escapeAttr(s.id)}"${いまの表 && s.id === いまの表.id ? ' selected' : ''}>`
        + `${AReGLM_SECURITY.sanitizeHtml(s.名前)}</option>`).join('');
}

/* ---------- 出し入れ ---------- */

/** 登録済みの商品を、そのまま表にする */
function 商品から表を作る() {
    let 商品 = [];
    try {
        商品 = JSON.parse(localStorage.getItem('products') || '[]');
    } catch {
        商品 = [];
    }

    if (!商品.length) {
        showNotification('商品がまだ登録されていません', 'error');
        return;
    }

    const 表 = 表を作る('在庫表', Math.max(20, 商品.length + 6), 6);
    const 見出し = ['商品名', '種類', '価格', '在庫数', '在庫金額', '備考'];
    見出し.forEach((h, c) => { 表.マス[`0,${c}`] = h; });

    商品.forEach((p, i) => {
        const r = i + 1;
        表.マス[`${r},0`] = p.name || '';
        表.マス[`${r},1`] = p.category || '';
        表.マス[`${r},2`] = p.price ?? 0;
        表.マス[`${r},3`] = p.quantity ?? 0;
        // 在庫金額は式にする。数を直したら自動で合うようにするため。
        表.マス[`${r},4`] = `=C${r + 1}*D${r + 1}`;
    });

    const 合計行 = 商品.length + 2;
    表.マス[`${合計行},0`] = '合計';
    表.マス[`${合計行},3`] = `=SUM(D2:D${商品.length + 1})`;
    表.マス[`${合計行},4`] = `=SUM(E2:E${商品.length + 1})`;

    いまの表 = 表;
    表を今のに保存();
    表の一覧を出す();
    renderSheet();
    showNotification(`商品${商品.length}件から在庫表を作りました`, 'success');
}

/** CSVを読み込む */
function CSVを読み込む(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const 中身 = String(e.target.result || '');
        const 行たち = CSVを分ける(中身);
        if (!行たち.length) {
            showNotification('中身が読めませんでした', 'error');
            return;
        }

        const 列数 = Math.max(...行たち.map((r) => r.length));
        const 表 = 表を作る(file.name.replace(/\.[^.]+$/, ''), 行たち.length + 5, Math.max(列数, 4));
        行たち.forEach((行, r) => {
            行.forEach((値, c) => {
                if (値 !== '') 表.マス[`${r},${c}`] = 値;
            });
        });

        いまの表 = 表;
        表を今のに保存();
        表の一覧を出す();
        renderSheet();
        showNotification(`${行たち.length}行を読み込みました`, 'success');
    };
    reader.readAsText(file);
}

/**
 * CSVを行と列に分ける。
 *
 * 引用符の中のカンマは区切りにしない。
 * 「商品名,"黒,白"」のような書き方があるため。
 */
function CSVを分ける(文字) {
    const 行たち = [];
    let 行 = [];
    let マス = '';
    let 引用符の中 = false;

    for (let i = 0; i < 文字.length; i++) {
        const c = 文字[i];

        if (引用符の中) {
            if (c === '"') {
                if (文字[i + 1] === '"') { マス += '"'; i++; }
                else 引用符の中 = false;
            } else マス += c;
            continue;
        }

        if (c === '"') { 引用符の中 = true; }
        else if (c === ',') { 行.push(マス); マス = ''; }
        else if (c === '\n') { 行.push(マス); 行たち.push(行); 行 = []; マス = ''; }
        else if (c !== '\r') { マス += c; }
    }
    if (マス !== '' || 行.length) { 行.push(マス); 行たち.push(行); }

    return 行たち.filter((r) => r.some((v) => v !== ''));
}

/** CSVとして書き出す */
function CSVを書き出す() {
    if (!いまの表) return;
    const 表 = いまの表;

    const 行たち = [];
    for (let r = 0; r < 表.行数; r++) {
        const 行 = [];
        let 何か入っている = false;
        for (let c = 0; c < 表.列数; c++) {
            const v = String(マスの値(表, r, c) ?? '');
            if (v !== '') 何か入っている = true;
            // カンマや引用符を含むときは、引用符で囲む
            行.push(/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
        }
        if (何か入っている) 行たち.push(行.join(','));
    }

    // Excelで開いたときに文字化けしないよう、先頭に印を付ける
    const blob = new Blob(['﻿' + 行たち.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${表.名前}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- 入口 ---------- */

function initSheet() {
    const 表たち = 表たちを読む();
    いまの表 = 表たち[表たち.length - 1] || 表を作る('新しい表');
    if (!表たち.length) 表を今のに保存();

    表の一覧を出す();
    renderSheet();

    document.getElementById('sheet-new')?.addEventListener('click', () => {
        const 名 = prompt('表の名前を決めてください', '新しい表');
        if (名 === null) return;
        いまの表 = 表を作る(名 || '新しい表');
        表を今のに保存();
        表の一覧を出す();
        renderSheet();
    });

    document.getElementById('sheet-select')?.addEventListener('change', (e) => {
        const 表 = 表たちを読む().find((x) => x.id === e.target.value);
        if (表) { いまの表 = 表; renderSheet(); }
    });

    document.getElementById('sheet-from-products')?.addEventListener('click', 商品から表を作る);
    document.getElementById('sheet-export')?.addEventListener('click', CSVを書き出す);
    document.getElementById('sheet-import')?.addEventListener('change', (e) => {
        CSVを読み込む(e.target.files?.[0]);
        e.target.value = '';
    });

    document.getElementById('sheet-add-row')?.addEventListener('click', () => {
        if (!いまの表) return;
        いまの表.行数 += 5;
        表を今のに保存();
        renderSheet();
    });

    document.getElementById('sheet-add-col')?.addEventListener('click', () => {
        if (!いまの表) return;
        いまの表.列数 += 2;
        表を今のに保存();
        renderSheet();
    });

    document.getElementById('sheet-delete')?.addEventListener('click', () => {
        if (!いまの表) return;
        if (!confirm(`「${いまの表.名前}」を不要ボックスへ移しますか。\n（消えません。あとで戻せます）`)) return;

        if (typeof 不要ボックスへ入れる === 'function') {
            不要ボックスへ入れる('other', いまの表, '表: ' + いまの表.名前);
        }
        表たちを保存(表たちを読む().filter((x) => x.id !== いまの表.id));
        const 残り = 表たちを読む();
        いまの表 = 残り[残り.length - 1] || 表を作る('新しい表');
        表の一覧を出す();
        renderSheet();
    });
}

window.initSheet = initSheet;
window.renderSheet = renderSheet;
window.式を計算する = 式を計算する;
window.四則を解く = 四則を解く;
window.列名 = 列名;
window.列番号 = 列番号;
window.CSVを分ける = CSVを分ける;
window.商品から表を作る = 商品から表を作る;
