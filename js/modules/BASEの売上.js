/**
 * BASEの売上（在庫 → お金 → BASE）
 *
 * 本人の要望（2026-10-08）: SUZURIだけでなく、BASE（AReGLM.base.shop）での売上も分かるように。
 * BASEにある機能（注文の一覧・発送の状況・売上の集計）のようなものも入れる。
 *
 * やっていること:
 *   ・BASEの管理画面から本人が書き出した「注文のCSV」を取り込む（同じ注文は二重に入らない）
 *   ・取り込むのは、注文番号・日時・商品名・数・金額・対応状況だけ。
 *     お客さまの氏名・住所・電話・メールは、このツールに入れない（要らない個人情報を持たないため）
 *   ・注文の一覧（発送済みにする印を付けられる）と、月ごとの売上・手数料・利益
 *   ・BASEの手数料（率と1件あたりの額）は、プランで違うので、本人が公式の料金を確かめて入れる
 *
 * 取り込んだ売上は、在庫の売上（areglm_sales）に「販売先: BASE」として入り、利益の表にも出る。
 * BASE公式APIでの自動取り込みは、本人がBASE Developersでアプリを登録してから（まだ）。
 */

const BASE_手数料の鍵 = 'areglm_base_fee';
const BASE_発送の鍵 = 'areglm_base_shipped';

function BASE_手数料を読む() {
    try { const x = JSON.parse(localStorage.getItem(BASE_手数料の鍵) || '{}') || {}; return { 率: Number(x.率) || 0, 固定: Number(x.固定) || 0, 決めた: x.率 != null }; }
    catch { return { 率: 0, 固定: 0, 決めた: false }; }
}

function BASE_CSVの行を分ける(行) {
    const 列 = [];
    let 今 = '';
    let 引用 = false;
    for (let i = 0; i < 行.length; i++) {
        const c = 行[i];
        if (引用) {
            if (c === '"' && 行[i + 1] === '"') { 今 += '"'; i++; }
            else if (c === '"') 引用 = false;
            else 今 += c;
        } else if (c === '"') 引用 = true;
        else if (c === ',') { 列.push(今); 今 = ''; }
        else 今 += c;
    }
    列.push(今);
    return 列.map((v) => v.trim());
}

/**
 * BASEの注文CSVを、売上の行に変える。
 * 見出しの言い方が版で違っても読めるよう、「注文ID/注文番号」「注文日時」「商品名」「数量」「価格/単価」を探す。
 * 個人情報の列（氏名・住所・電話・メール）は、読んでも残さない。
 */
function BASEの注文CSVを読む(文字) {
    const 行たち = String(文字 || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (行たち.length < 2) return [];
    const 見出し = BASE_CSVの行を分ける(行たち[0]);
    const 位置 = (候補, 除く = []) => 見出し.findIndex((h) => 候補.some((c) => h.includes(c)) && !除く.some((c) => h.includes(c)));
    const 注文 = 位置(['注文ID', '注文番号', '受注ID']);
    const 日時 = 位置(['注文日時', '注文日', '購入日']);
    const 商品 = 位置(['商品名']);
    const 種類 = 位置(['バリエーション', '種類']);
    const 数 = 位置(['数量', '個数']);
    const 価格 = 位置(['商品価格', '販売価格', '単価', '価格'], ['合計', '送料']);
    const 合計 = 位置(['商品合計', '小計'], ['送料']);
    const 状況 = 位置(['対応状況', 'ステータス', '発送状況']);
    if (注文 < 0 || 商品 < 0 || 数 < 0 || (価格 < 0 && 合計 < 0)) return [];
    const 金額 = (v) => Number(String(v || '').replace(/[¥,円\s]/g, '')) || 0;
    return 行たち.slice(1).map((l) => {
        const c = BASE_CSVの行を分ける(l);
        // 見出しと列の数が合わない行は、列がずれて読み違える（数量に価格が入る等）ため、取り込まない
        if (c.length !== 見出し.length) return null;
        const 個 = Number(c[数]) || 0;
        if (!c[注文] || !c[商品] || 個 <= 0) return null;
        const 単価 = 価格 >= 0 ? 金額(c[価格]) : Math.round(金額(c[合計]) / 個);
        const 名 = 種類 >= 0 && c[種類] ? `${c[商品]}（${c[種類]}）` : c[商品];
        const 日 = 日時 >= 0 && c[日時] ? new Date(String(c[日時]).replace(/\//g, '-').replace(' ', 'T')) : null;
        return {
            注文ID: String(c[注文]),
            date: 日 && !isNaN(日) ? 日.toISOString() : new Date().toISOString(),
            product_name: 名,
            商品名: c[商品],
            quantity: 個,
            price: 単価,
            total: 合計 >= 0 && 金額(c[合計]) ? 金額(c[合計]) : 単価 * 個,
            対応状況: 状況 >= 0 ? c[状況] : '',
            販売先: 'BASE',
        };
    }).filter(Boolean);
}

/** 取り込む。同じ注文の同じ商品は二重に入れない。商品名が在庫の商品と同じなら、その番号を付ける */
function BASEの売上を取り込む(行たち, 既存, 商品たち) {
    const 既に = new Set((既存 || []).filter((s) => s.販売先 === 'BASE').map((s) => `${s.注文ID}|${s.product_name}`));
    const 足す = [];
    (行たち || []).forEach((r) => {
        const 鍵 = `${r.注文ID}|${r.product_name}`;
        if (既に.has(鍵)) return;
        既に.add(鍵);
        const 同じ = (商品たち || []).find((p) => p.name === r.商品名 || p.name === r.product_name);
        足す.push(Object.assign({}, r, 同じ && 同じ.sku ? { product_sku: 同じ.sku } : {}));
    });
    return 足す;
}

/** 月ごとの、BASEの売上・注文数・手数料・未発送 */
function BASEをまとめる(売上たち, 手数料, 発送済み = {}, 月 = new Date().toISOString().slice(0, 7)) {
    const BASEの = (売上たち || []).filter((s) => s.販売先 === 'BASE');
    const 今月 = BASEの.filter((s) => String(s.date || '').slice(0, 7) === 月);
    const 注文たち = {};
    BASEの.forEach((s) => {
        const o = 注文たち[s.注文ID] = 注文たち[s.注文ID] || { 注文ID: s.注文ID, date: s.date, 品: [], 合計: 0, 対応状況: s.対応状況 || '' };
        o.品.push(`${s.product_name}×${s.quantity}`);
        o.合計 += Number(s.total) || 0;
    });
    const 一覧 = Object.values(注文たち).sort((a, b) => (a.date < b.date ? 1 : -1)).map((o) => Object.assign(o, {
        発送済み: !!発送済み[o.注文ID] || /発送済|完了|対応済/.test(o.対応状況),
    }));
    const 今月の注文数 = new Set(今月.map((s) => s.注文ID)).size;
    const 売上 = 今月.reduce((a, s) => a + (Number(s.total) || 0), 0);
    const 手数料額 = Math.round(売上 * (手数料.率 || 0) / 100) + (手数料.固定 || 0) * 今月の注文数;
    return { 月, 売上, 注文数: 今月の注文数, 手数料: 手数料額, 入る額: 売上 - 手数料額, 一覧, 未発送: 一覧.filter((o) => !o.発送済み).length };
}

function BASE_円(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '−' : '') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}

function BASE_部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function renderBASEの売上() {
    const 箱 = document.getElementById('base-sales-panel');
    if (!箱) return;
    let 売上 = [];
    try { 売上 = JSON.parse(localStorage.getItem('areglm_sales') || '[]'); } catch { 売上 = []; }
    let 発送済み = {};
    try { 発送済み = JSON.parse(localStorage.getItem(BASE_発送の鍵) || '{}') || {}; } catch { 発送済み = {}; }
    const 手数料 = BASE_手数料を読む();
    const ま = BASEをまとめる(売上, 手数料, 発送済み);
    箱.textContent = '';

    箱.append(BASE_部品('p',
        `${ま.月}: 売上 ${BASE_円(ま.売上)}（${ま.注文数}件）− 手数料 ${BASE_円(ま.手数料)} ＝ 入る額 ${BASE_円(ま.入る額)}　／　未発送 ${ま.未発送}件`,
        'status-banner ' + (ま.未発送 ? 'warn' : 'ok')));

    // 取り込み
    const 取り込み = BASE_部品('p');
    const ファイル = document.createElement('input');
    ファイル.type = 'file';
    ファイル.accept = '.csv,text/csv';
    ファイル.addEventListener('change', async () => {
        const f = ファイル.files && ファイル.files[0];
        if (!f) return;
        const 生 = await f.arrayBuffer();
        let 文字 = new TextDecoder('utf-8').decode(生);
        if (文字.includes('�')) { try { 文字 = new TextDecoder('shift_jis').decode(生); } catch { /* そのまま */ } }
        const 行たち = BASEの注文CSVを読む(文字);
        if (!行たち.length) { showNotification('BASEの注文CSV（見出しに「注文ID」「商品名」「数量」「価格」があるもの）を選んでください', 'error'); return; }
        let 既存 = [];
        try { 既存 = JSON.parse(localStorage.getItem('areglm_sales') || '[]'); } catch { 既存 = []; }
        let 商品 = [];
        try { 商品 = JSON.parse(localStorage.getItem('products') || '[]'); } catch { 商品 = []; }
        const 足す = BASEの売上を取り込む(行たち, 既存, 商品);
        localStorage.setItem('areglm_sales', JSON.stringify(既存.concat(足す)));
        showNotification(`${足す.length}件を取り込みました（重なり ${行たち.length - 足す.length}件は飛ばしました）`, 'success');
        ファイル.value = '';
        renderBASEの売上();
        if (typeof updateEcStats === 'function') updateEcStats();
    });
    取り込み.append('BASEの注文CSVを取り込む（BASEの管理画面 → 注文管理 → CSVで書き出したもの）: ', ファイル);
    箱.append(取り込み);
    箱.append(BASE_部品('p', 'お客さまの氏名・住所・電話・メールは取り込みません。注文番号・日時・商品名・数・金額・対応状況だけを残します。', 'hint'));

    // 手数料
    const 形 = document.createElement('form');
    形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
    const 率 = document.createElement('input');
    率.type = 'number'; 率.step = 'any'; 率.min = '0'; 率.placeholder = '手数料率 %'; 率.style.width = '110px';
    if (手数料.決めた) 率.value = 手数料.率;
    const 固定 = document.createElement('input');
    固定.type = 'number'; 固定.step = 'any'; 固定.min = '0'; 固定.placeholder = '1件あたり 円'; 固定.style.width = '110px';
    if (手数料.決めた) 固定.value = 手数料.固定;
    const 保存 = BASE_部品('button', '手数料を決める', 'btn btn-sm btn-secondary');
    保存.type = 'submit';
    形.append('BASEの手数料: ', 率, '% ＋ 1件あたり', 固定, '円', 保存);
    形.addEventListener('submit', (e) => {
        e.preventDefault();
        localStorage.setItem(BASE_手数料の鍵, JSON.stringify({ 率: Number(率.value) || 0, 固定: Number(固定.value) || 0 }));
        renderBASEの売上();
    });
    箱.append(形);
    箱.append(BASE_部品('p', 手数料.決めた
        ? '手数料は、利益の表にも使われます。'
        : '⚠ BASEの手数料がまだです。プランで違うので、BASEの公式の料金ページで確かめて入れてください（入れるまで、手数料0円で数えます）。', 'hint'));

    // 注文の一覧
    箱.append(BASE_部品('h4', `注文（${ま.一覧.length}件）`));
    if (!ま.一覧.length) { 箱.append(BASE_部品('p', 'まだありません。BASEの注文CSVを取り込むと、ここに並びます。', 'hint')); return; }
    const ul = BASE_部品('ul');
    ま.一覧.slice(0, 50).forEach((o) => {
        const li = BASE_部品('li', `${new Date(o.date).toLocaleDateString('ja-JP')}　#${o.注文ID}　${o.品.join('、')}　${BASE_円(o.合計)}　${o.発送済み ? '✓ 発送済み' : '● 未発送'} `);
        if (!o.発送済み) {
            const b = BASE_部品('button', '発送済みにする', 'btn btn-sm btn-secondary');
            b.type = 'button';
            b.addEventListener('click', () => {
                let x = {};
                try { x = JSON.parse(localStorage.getItem(BASE_発送の鍵) || '{}') || {}; } catch { x = {}; }
                x[o.注文ID] = new Date().toISOString();
                localStorage.setItem(BASE_発送の鍵, JSON.stringify(x));
                renderBASEの売上();
            });
            li.append(b);
        }
        ul.append(li);
    });
    箱.append(ul);
}

window.renderBASEの売上 = renderBASEの売上;
window.BASEの注文CSVを読む = BASEの注文CSVを読む;
window.BASE_手数料を読む = BASE_手数料を読む;
