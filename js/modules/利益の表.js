/**
 * 利益の表（在庫 → お金 → 利益）
 *
 * 本人の要望: 手数料がかかっても、必ず利益が出るようにしたい。売上・手数料・原価・利益を一つの表で見たい。
 *
 * 売り方ごとに、利益の出し方が違う:
 *   ・SUZURI … 作るのも送るのもSUZURI。こちらに入るのは「トリブン」（1つあたりの取り分）だけ。
 *              利益 = トリブン × 売れた数（売値との差は、SUZURIの取り分として「手数料」に数える）
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
function 一つあたりの利益(値段, 売り方, 設定 = {}) {
    const 価 = Number(値段) || 0;
    if (売り方 === 'SUZURI') {
        const 取り分 = Number(設定.トリブン) || 0;
        return { 手数料: Math.max(0, 価 - 取り分), 原価: 0, 送料: 0, 利益: 取り分 };
    }
    const 手数料 = Math.round(価 * (Number(設定.手数料率) || 0) / 100);
    const 原価 = Number(設定.原価) || 0;
    const 送料 = Number(設定.送料) || 0;
    return { 手数料, 原価, 送料, 利益: 価 - 手数料 - 原価 - 送料 };
}

/** 目標の利益率にするための値段（自分で売るとき）。手数料率と目標の合計が100%以上なら出せない */
function 目標の値段(売り方, 設定 = {}, 目標率 = 30) {
    if (売り方 === 'SUZURI') return null;
    const 率 = (Number(設定.手数料率) || 0) / 100 + (Number(目標率) || 0) / 100;
    if (率 >= 1) return null;
    return Math.ceil(((Number(設定.原価) || 0) + (Number(設定.送料) || 0)) / (1 - 率) / 10) * 10;
}

/** 商品と売上と設定から、表の行と合計を作る（画面と試験の両方で使う） */
function 利益を計算する(商品たち, 売上たち, 設定たち) {
    const 行たち = (商品たち || []).map((p) => {
        const 鍵 = 利益の商品の鍵(p);
        const 設定 = (設定たち || {})[鍵] || {};
        const 売り方 = 利益の売り方(p, 設定);
        const 売れた = (売上たち || []).filter((s) => (s.product_sku && s.product_sku === p.sku) || (!s.product_sku && s.product_name === p.name));
        const 数 = 売れた.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
        const 売上 = 売れた.reduce((a, s) => a + (Number(s.total) || (Number(s.price) || 0) * (Number(s.quantity) || 0)), 0);
        let 手数料, 原価, 送料, 利益;
        if (売り方 === 'SUZURI') {
            利益 = (Number(設定.トリブン) || 0) * 数;
            手数料 = Math.max(0, 売上 - 利益);
            原価 = 0; 送料 = 0;
        } else {
            手数料 = Math.round(売上 * (Number(設定.手数料率) || 0) / 100);
            原価 = (Number(設定.原価) || 0) * 数;
            送料 = (Number(設定.送料) || 0) * 数;
            利益 = 売上 - 手数料 - 原価 - 送料;
        }
        const 一つ = 一つあたりの利益(p.price, 売り方, 設定);
        return {
            鍵, 名: p.name || '(名前なし)', 値段: Number(p.price) || 0, 売り方, 設定, 数, 売上, 手数料, 原価, 送料, 利益,
            利益率: 売上 ? Math.round((利益 / 売上) * 1000) / 10 : null,
            一つあたり: 一つ.利益,
            赤字: 一つ.利益 < 0 || 利益 < 0,
            設定が無い: 売り方 === 'SUZURI' ? !(Number(設定.トリブン) > 0) : !(設定.原価 != null && 設定.原価 !== ''),
            目標の値段: 目標の値段(売り方, 設定),
        };
    });
    const 合計 = 行たち.reduce((a, r) => ({
        数: a.数 + r.数, 売上: a.売上 + r.売上, 手数料: a.手数料 + r.手数料, 原価: a.原価 + r.原価, 送料: a.送料 + r.送料, 利益: a.利益 + r.利益,
    }), { 数: 0, 売上: 0, 手数料: 0, 原価: 0, 送料: 0, 利益: 0 });
    return { 行たち, 合計 };
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
    const { 行たち, 合計 } = 利益を計算する(商品, 売上, 設定たち);
    箱.textContent = '';

    const 赤字 = 行たち.filter((r) => r.赤字);
    const 未設定 = 行たち.filter((r) => r.設定が無い);
    箱.append(利益の部品('p',
        `売上 ${利益の円(合計.売上)} − 手数料 ${利益の円(合計.手数料)} − 原価 ${利益の円(合計.原価)} − 送料・梱包 ${利益の円(合計.送料)} ＝ 利益 ${利益の円(合計.利益)}`
        + (赤字.length ? `　⚠ 赤字の商品が${赤字.length}件あります` : ''),
        'status-banner ' + (赤字.length || 合計.利益 < 0 ? 'warn' : 'ok')));
    if (未設定.length) 箱.append(利益の部品('p', `${未設定.length}件の商品は、トリブンまたは原価がまだです（入れると、正しい利益になります）。`, 'hint'));
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
        ['SUZURI', '自分で売る'].forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; o.selected = v === r.売り方; 売り方.append(o); });
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
