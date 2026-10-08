/**
 * 利益の表（在庫 → お金 → 利益）
 *
 * 本人の要望: 手数料がかかっても、必ず利益が出るようにしたい。売上・手数料・原価・利益を一つの表で見たい。
 *
 * 売り方ごとに、利益の出し方が違う:
 *   ・SUZURI … 作るのも送るのもSUZURI。こちらに入るのは「トリブン」（1つあたりの取り分）だけ。
 *              利益 = トリブン × 売れた数（売値との差は、SUZURIの取り分として「手数料」に数える）
 *   ・BASE … 利益 = 売上 − BASEの手数料（売上 × 率 ＋ 1件あたりの額 × 注文数）− 原価 × 数 − 送料・梱包 × 数
 *            （BASEの手数料は「BASE」タブで一度だけ決める。売上1件ごとに販売先を見て計算する）
 *   ・自分で売る（予約販売など）… 利益 = 売上 − 手数料（売上 × 率）− 原価 × 数 − 送料・梱包 × 数
 *
 * 売れていない商品も並べ、1つ売ったときの利益を出す（値段を決める前に、赤字に気づけるように）。
 * 赤字のものは赤く出し、目標の利益率にするための値段を示す。
 *
 * 売上は、在庫の「売上登録」（sales）と、取り込んだ売上（areglm_sales）の両方から読む。
 * 消さない: 設定を変えても、売上の記録はそのまま。
 */

const 利益の設定の鍵 = 'areglm_profit_settings';

function 利益の設定を読む() {
    try { return JSON.parse(localStorage.getItem(利益の設定の鍵) || '{}') || {}; } catch { return {}; }
}

function 利益の設定を書く(x) {
    localStorage.setItem(利益の設定の鍵, JSON.stringify(x));
}

function 利益の商品の鍵(p) {
    return String(p.sku || p.id || p.name || '');
}

function 利益の売り方(p, 設定) {
    if (設定 && 設定.売り方) return 設定.売り方;
    return (p.source === 'suzuri' || p.suzuriId || (p.shopUrl && String(p.shopUrl).includes('suzuri.jp'))) ? 'SUZURI' : '自分で売る';
}

/** 1つ売ったときの、手数料・原価・利益 */
function 一つあたりの利益(値段, 売り方, 設定 = {}, BASE手数料 = { 率: 0, 固定: 0 }) {
    const 価 = Number(値段) || 0;
    if (売り方 === 'SUZURI') {
        const 取り分 = Number(設定.トリブン) || 0;
        return { 手数料: Math.max(0, 価 - 取り分), 原価: 0, 送料: 0, 利益: 取り分 };
    }
    const 手数料 = 売り方 === 'BASE'
        ? Math.round(価 * (Number(BASE手数料.率) || 0) / 100) + (Number(BASE手数料.固定) || 0)
        : Math.round(価 * (Number(設定.手数料率) || 0) / 100);
    const 原価 = Number(設定.原価) || 0;
    const 送料 = Number(設定.送料) || 0;
    return { 手数料, 原価, 送料, 利益: 価 - 手数料 - 原価 - 送料 };
}

/** 目標の利益率にするための値段（自分で売る・BASE）。手数料率と目標の合計が100%以上なら出せない */
function 目標の値段(売り方, 設定 = {}, 目標率 = 30, BASE手数料 = { 率: 0, 固定: 0 }) {
    if (売り方 === 'SUZURI') return null;
    const 手数料率 = 売り方 === 'BASE' ? Number(BASE手数料.率) || 0 : Number(設定.手数料率) || 0;
    const 固定 = 売り方 === 'BASE' ? Number(BASE手数料.固定) || 0 : 0;
    const 率 = 手数料率 / 100 + (Number(目標率) || 0) / 100;
    if (率 >= 1) return null;
    return Math.ceil(((Number(設定.原価) || 0) + (Number(設定.送料) || 0) + 固定) / (1 - 率) / 10) * 10;
}

/** 売上1件の金額 */
function 売上の額(s) {
    return Number(s.total) || (Number(s.price) || 0) * (Number(s.quantity) || 0);
}

/**
 * 商品と売上と設定から、表の行と合計を作る（画面と試験の両方で使う）。
 * 同じ商品がSUZURIとBASEの両方で売れることもあるため、売上1件ごとに販売先を見て計算する。
 */
function 利益を計算する(商品たち, 売上たち, 設定たち, BASE手数料 = { 率: 0, 固定: 0 }) {
    const 販売先別 = {};
    const 行たち = (商品たち || []).map((p) => {
        const 鍵 = 利益の商品の鍵(p);
        const 設定 = (設定たち || {})[鍵] || {};
        const 売り方 = 利益の売り方(p, 設定);
        const 売れた = (売上たち || []).filter((s) => (s.product_sku && s.product_sku === p.sku) || (!s.product_sku && s.product_name === p.name));
        let 数 = 0, 売上 = 0, 手数料 = 0, 原価 = 0, 送料 = 0, 利益 = 0;
        const 先ごと = {};
        売れた.forEach((s) => {
            const 先 = s.販売先 === 'BASE' ? 'BASE' : 売り方;
            (先ごと[先] = 先ごと[先] || []).push(s);
        });
        Object.entries(先ごと).forEach(([先, 列]) => {
            const 個 = 列.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
            const 額 = 列.reduce((a, s) => a + 売上の額(s), 0);
            let 料, 原, 送, 益;
            if (先 === 'SUZURI') {
                益 = (Number(設定.トリブン) || 0) * 個;
                料 = Math.max(0, 額 - 益); 原 = 0; 送 = 0;
            } else {
                料 = 先 === 'BASE'
                    ? Math.round(額 * (Number(BASE手数料.率) || 0) / 100) + (Number(BASE手数料.固定) || 0) * new Set(列.map((s) => s.注文ID || s.date)).size
                    : Math.round(額 * (Number(設定.手数料率) || 0) / 100);
                原 = (Number(設定.原価) || 0) * 個;
                送 = (Number(設定.送料) || 0) * 個;
                益 = 額 - 料 - 原 - 送;
            }
            数 += 個; 売上 += 額; 手数料 += 料; 原価 += 原; 送料 += 送; 利益 += 益;
            const b = 販売先別[先] = 販売先別[先] || { 売上: 0, 利益: 0, 数: 0 };
            b.売上 += 額; b.利益 += 益; b.数 += 個;
        });
        const 一つ = 一つあたりの利益(p.price, 売り方, 設定, BASE手数料);
        return {
            鍵, 名: p.name || '(名前なし)', 値段: Number(p.price) || 0, 売り方, 設定, 数, 売上, 手数料, 原価, 送料, 利益,
            利益率: 売上 ? Math.round((利益 / 売上) * 1000) / 10 : null,
            一つあたり: 一つ.利益,
            赤字: 一つ.利益 < 0 || 利益 < 0,
            設定が無い: 売り方 === 'SUZURI' ? !(Number(設定.トリブン) > 0) : !(設定.原価 != null && 設定.原価 !== ''),
            目標の値段: 目標の値段(売り方, 設定, 30, BASE手数料),
        };
    });
    const 合計 = 行たち.reduce((a, r) => ({
        数: a.数 + r.数, 売上: a.売上 + r.売上, 手数料: a.手数料 + r.手数料, 原価: a.原価 + r.原価, 送料: a.送料 + r.送料, 利益: a.利益 + r.利益,
    }), { 数: 0, 売上: 0, 手数料: 0, 原価: 0, 送料: 0, 利益: 0 });
    // 在庫に登録していない商品の売上（黙って表から落とさず、別に見せる）
    const 使った = new Set();
    (商品たち || []).forEach((p) => (売上たち || []).forEach((s, i) => {
        if ((s.product_sku && s.product_sku === p.sku) || (!s.product_sku && s.product_name === p.name)) 使った.add(i);
    }));
    const 在庫に無い = (売上たち || []).filter((s, i) => !使った.has(i));
    return { 行たち, 合計, 販売先別, 在庫に無い: { 件数: 在庫に無い.length, 売上: 在庫に無い.reduce((a, s) => a + 売上の額(s), 0), 名前: [...new Set(在庫に無い.map((s) => s.product_name))] } };
}

function 利益の円(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '−' : '') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}

function 利益の部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function render利益の表() {
    const 箱 = document.getElementById('profit-panel');
    if (!箱) return;
    let 商品 = [];
    let 売上 = [];
    try { 商品 = JSON.parse(localStorage.getItem('products') || '[]'); } catch { 商品 = []; }
    try { 売上 = JSON.parse(localStorage.getItem('sales') || '[]').concat(JSON.parse(localStorage.getItem('areglm_sales') || '[]')); } catch { 売上 = []; }
    const 設定たち = 利益の設定を読む();
    const BASE手数料 = typeof BASE_手数料を読む === 'function' ? BASE_手数料を読む() : { 率: 0, 固定: 0 };
    const { 行たち, 合計, 販売先別, 在庫に無い } = 利益を計算する(商品, 売上, 設定たち, BASE手数料);
    箱.textContent = '';

    const 赤字 = 行たち.filter((r) => r.赤字);
    const 未設定 = 行たち.filter((r) => r.設定が無い);
    箱.append(利益の部品('p',
        `売上 ${利益の円(合計.売上)} − 手数料 ${利益の円(合計.手数料)} − 原価 ${利益の円(合計.原価)} − 送料・梱包 ${利益の円(合計.送料)} ＝ 利益 ${利益の円(合計.利益)}`
        + (赤字.length ? `　⚠ 赤字の商品が${赤字.length}件あります` : ''),
        'status-banner ' + (赤字.length || 合計.利益 < 0 ? 'warn' : 'ok')));
    if (Object.keys(販売先別).length) {
        箱.append(利益の部品('p', '販売先ごと: ' + Object.entries(販売先別).map(([k, v]) => `${k} 売上${利益の円(v.売上)}・利益${利益の円(v.利益)}（${v.数}個）`).join('　／　'), 'hint'));
    }
    if (未設定.length) 箱.append(利益の部品('p', `${未設定.length}件の商品は、トリブンまたは原価がまだです（入れると、正しい利益になります）。`, 'hint'));
    if (在庫に無い.件数) {
        箱.append(利益の部品('p', `在庫に登録していない商品の売上が ${利益の円(在庫に無い.売上)}（${在庫に無い.名前.slice(0, 5).join('、')}${在庫に無い.名前.length > 5 ? ' ほか' : ''}）あります。`
            + '上の表には入っていません。在庫に同じ名前で登録すると、利益まで出ます。', 'hint'));
    }
    if (!行たち.length) { 箱.append(利益の部品('p', 'まだ商品がありません。在庫一覧で商品を登録すると、ここに並びます。', 'hint')); return; }

    const 表 = 利益の部品('table', null, 'data-table');
    const 頭 = 利益の部品('tr');
    ['商品', '売り方', '値段', 'トリブン／原価・手数料率・送料', '売れた数', '売上', '手数料', '原価・送料', '利益', '1つあたり'].forEach((h) => 頭.append(利益の部品('th', h)));
    const thead = 利益の部品('thead');
    thead.append(頭);
    const tbody = 利益の部品('tbody');
    行たち.forEach((r) => {
        const tr = 利益の部品('tr');
        if (r.赤字) tr.style.background = 'rgba(220,38,38,.08)';
        tr.append(利益の部品('td', r.名));
        // 売り方
        const 売り方 = document.createElement('select');
        ['SUZURI', 'BASE', '自分で売る'].forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; o.selected = v === r.売り方; 売り方.append(o); });
        const 保存 = (変える) => {
            const x = 利益の設定を読む();
            x[r.鍵] = Object.assign({}, x[r.鍵] || {}, 変える);
            利益の設定を書く(x);
            render利益の表();
        };
        売り方.addEventListener('change', () => 保存({ 売り方: 売り方.value }));
        const td売り方 = 利益の部品('td');
        td売り方.append(売り方);
        tr.append(td売り方, 利益の部品('td', 利益の円(r.値段)));
        // 設定
        const td設定 = 利益の部品('td');
        const 数の欄 = (名, 値, 見本, 幅 = '70px') => {
            const i = document.createElement('input');
            i.type = 'number';
            i.step = 'any';
            i.min = '0';
            i.placeholder = 見本;
            i.title = 見本;
            i.style.width = 幅;
            if (値 != null && 値 !== '') i.value = 値;
            i.addEventListener('change', () => 保存({ [名]: i.value === '' ? '' : Number(i.value) }));
            return i;
        };
        if (r.売り方 === 'SUZURI') td設定.append(数の欄('トリブン', r.設定.トリブン, 'トリブン（円）', '90px'));
        else if (r.売り方 === 'BASE') td設定.append(数の欄('原価', r.設定.原価, '原価'), ' ', 数の欄('送料', r.設定.送料, '送料・梱包'), 利益の部品('div', '手数料は「BASE」タブで', 'hint'));
        else td設定.append(数の欄('原価', r.設定.原価, '原価'), ' ', 数の欄('手数料率', r.設定.手数料率, '手数料%', '60px'), ' ', 数の欄('送料', r.設定.送料, '送料・梱包'));
        tr.append(td設定);
        tr.append(利益の部品('td', String(r.数)), 利益の部品('td', 利益の円(r.売上)), 利益の部品('td', 利益の円(r.手数料)),
            利益の部品('td', 利益の円(r.原価 + r.送料)), 利益の部品('td', 利益の円(r.利益) + (r.利益率 != null ? `（${r.利益率}%）` : '')));
        const td一つ = 利益の部品('td', 利益の円(r.一つあたり));
        if (r.一つあたり < 0 && r.目標の値段) td一つ.append(利益の部品('div', `利益30%にするなら ${利益の円(r.目標の値段)}`, 'hint'));
        tr.append(td一つ);
        tbody.append(tr);
    });
    表.append(thead, tbody);
    const 包み = 利益の部品('div');
    包み.style.overflowX = 'auto';
    包み.append(表);
    箱.append(包み);
    箱.append(利益の部品('p', 'SUZURIは、売値からSUZURIの取り分を引いた「トリブン」だけが利益になります（SUZURIの商品編集画面で確かめた額を入れてください）。自分で売るものは、決済・販売サイトの手数料率と、原価・送料を入れます。', 'hint'));
}

window.render利益の表 = render利益の表;
window.利益を計算する = 利益を計算する;

// 試験（tools/サーバーの試験.js）から、画面を描かずに計算の部分だけを require で読むための出口。
// ブラウザには module が無いので、ここは何もしない（試験で、文字をコードとして動かす書き方を使わないため）。
if (typeof module !== 'undefined' && module.exports) module.exports = { 利益を計算する };
