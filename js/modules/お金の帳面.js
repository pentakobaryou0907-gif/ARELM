/**
 * お金の帳面（仕様書9章「在庫・売上・財務」）
 *
 * 売上 areglm_sales は、ホームの「売上」・分析・気づき・週次レポートが
 * 読みに行っているのに、書き込む画面がどこにも無かった。
 * ここで書き込めるようにし、同じ鍵・同じ項目名（date / product / total）を使う。
 *
 * 1件ごとに 売上・手数料・原価・利益・販売先 を残し、
 * 商品別の表と、資金残高の移り変わりを出す。
 * 「赤字にならない値段」は、手数料を差し引いても目標の利益が残る最低価格を出す。
 *
 * 手数料の率は各サービスが変えることがあるため、ここの数字は目安。
 * 変えたら自分の数字で上書きできるよう、この端末に保存する。
 * すべてこの端末の中だけで動く。外部へは一切送らない。
 */

const 帳面_売上キー = 'areglm_sales';
const 帳面_支出キー = 'areglm_expenses';
const 帳面_設定キー = 'areglm_ledger_settings';

/** 率は%、固定は1件あたりの円。SUZURIは本体価格を原価に入れる形なので手数料0。 */
const 販売先の既定 = {
    SUZURI:   { 率: 0,    固定: 0,  注: '売値＝本体価格＋トリブン。本体価格を「原価」に入れてください' },
    Shopify:  { 率: 3.55, 固定: 0,  注: 'Shopifyペイメントの決済手数料（ベーシック）の目安。月額料金は「支出」に' },
    BASE:     { 率: 6.6,  固定: 40, 注: '決済手数料3.6%＋40円とサービス利用料3%の目安' },
    メルカリ: { 率: 10,   固定: 0,  注: '販売手数料10%。送料は「原価」か「支出」に' },
    minne:    { 率: 10.56, 固定: 0, 注: '販売手数料の目安' },
    リアル:   { 率: 0,    固定: 0,  注: '手渡し・イベント販売。出店料は「支出」に' },
    その他:   { 率: 0,    固定: 0,  注: '' },
};

function 帳面を読む(鍵) {
    try {
        const r = JSON.parse(localStorage.getItem(鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 帳面を保存(鍵, 中身) {
    localStorage.setItem(鍵, JSON.stringify(中身));
}

function 帳面の設定() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(帳面_設定キー) || '{}'); } catch { s = {}; }
    return {
        元手: Number(s.元手) || 0,
        販売先: { ...販売先の既定, ...(s.販売先 || {}) },
    };
}

function 帳面の設定を保存(s) {
    localStorage.setItem(帳面_設定キー, JSON.stringify(s));
}

function 円で(n) {
    const v = Math.round(Number(n) || 0);
    return `${v < 0 ? '−' : ''}¥${Math.abs(v).toLocaleString('ja-JP')}`;
}

/** 販売先の率から、売上に対する手数料を見積もる */
function 手数料を見積もる(販売先, 売上, 数量) {
    const 先 = 帳面の設定().販売先[販売先] || 販売先の既定.その他;
    const 件 = Math.max(1, Number(数量) || 1);
    return Math.round((Number(売上) || 0) * (Number(先.率) || 0) / 100 + (Number(先.固定) || 0) * 件);
}

/**
 * 手数料を引いても「原価＋目標利益」が残る最低の売値。
 * 売値×(1−率) − 固定 ≥ 原価＋利益 を売値について解く。
 */
function 赤字にならない値段(原価, 目標利益, 販売先) {
    const 先 = 帳面の設定().販売先[販売先] || 販売先の既定.その他;
    const 率 = (Number(先.率) || 0) / 100;
    if (率 >= 1) return null;
    const 必要 = (Number(原価) || 0) + (Number(目標利益) || 0) + (Number(先.固定) || 0);
    const 値 = Math.ceil(必要 / (1 - 率));
    const 手数料 = Math.round(値 * 率 + (Number(先.固定) || 0));
    return { 売値: 値, 手数料, 残る利益: 値 - 手数料 - (Number(原価) || 0) };
}

function 売上を記録する(入力) {
    const 合計 = Math.round(Number(入力.total) || 0);
    const 手数料 = 入力.fee === '' || 入力.fee == null
        ? 手数料を見積もる(入力.channel, 合計, 入力.qty)
        : Math.round(Number(入力.fee) || 0);
    const 原価 = Math.round(Number(入力.cost) || 0);
    const 記録 = {
        id: 'sale_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        date: 入力.date || 日付文字(new Date()),
        product: 入力.product || '',
        channel: 入力.channel || 'その他',
        qty: Math.max(1, Number(入力.qty) || 1),
        total: 合計,
        fee: 手数料,
        cost: 原価,
        profit: 合計 - 手数料 - 原価,
        note: 入力.note || '',
        createdAt: new Date().toISOString(),
    };
    const 全部 = 帳面を読む(帳面_売上キー);
    全部.push(記録);
    帳面を保存(帳面_売上キー, 全部);
    return 記録;
}

function 支出を記録する(入力) {
    const 記録 = {
        id: 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        date: 入力.date || 日付文字(new Date()),
        product: 入力.product || '',
        category: 入力.category || '',
        amount: Math.round(Number(入力.amount) || 0),
        note: 入力.note || '',
        createdAt: new Date().toISOString(),
    };
    const 全部 = 帳面を読む(帳面_支出キー);
    全部.push(記録);
    帳面を保存(帳面_支出キー, 全部);
    return 記録;
}

/** 商品ごとに 売上・手数料・原価・支出・利益・数量・販売先 をまとめる */
function 商品別にまとめる() {
    const 表 = {};
    const 行 = (名) => {
        const k = 名 || '（商品なし）';
        if (!表[k]) 表[k] = { 商品: k, 数量: 0, 売上: 0, 手数料: 0, 原価: 0, 支出: 0, 販売先: {} };
        return 表[k];
    };
    帳面を読む(帳面_売上キー).forEach((s) => {
        const r = 行(s.product);
        r.数量 += Number(s.qty) || 1;
        r.売上 += Number(s.total) || 0;
        r.手数料 += Number(s.fee) || 0;
        r.原価 += Number(s.cost) || 0;
        const 先 = s.channel || 'その他';
        r.販売先[先] = (r.販売先[先] || 0) + (Number(s.qty) || 1);
    });
    帳面を読む(帳面_支出キー).forEach((e) => {
        行(e.product).支出 += Number(e.amount) || 0;
    });
    return Object.values(表)
        .map((r) => ({ ...r, 利益: r.売上 - r.手数料 - r.原価 - r.支出 }))
        .sort((a, b) => b.利益 - a.利益);
}

/** 日ごとの入出金と、その日終わりの残高 */
function 資金の移り変わり() {
    const 日別 = {};
    帳面を読む(帳面_売上キー).forEach((s) => {
        const d = s.date || '';
        日別[d] = 日別[d] || { 入: 0, 出: 0, 内訳: [] };
        日別[d].入 += (Number(s.total) || 0) - (Number(s.fee) || 0);
        日別[d].出 += Number(s.cost) || 0;
        日別[d].内訳.push(`売上 ${s.product || ''}`);
    });
    帳面を読む(帳面_支出キー).forEach((e) => {
        const d = e.date || '';
        日別[d] = 日別[d] || { 入: 0, 出: 0, 内訳: [] };
        日別[d].出 += Number(e.amount) || 0;
        日別[d].内訳.push(`${e.category || '支出'} ${e.product || e.note || ''}`.trim());
    });
    let 残高 = 帳面の設定().元手;
    return Object.keys(日別).sort().map((d) => {
        残高 += 日別[d].入 - 日別[d].出;
        return { 日: d, ...日別[d], 残高 };
    });
}

function 帳面のフォームを読む() {
    const v = (id) => document.getElementById(id)?.value ?? '';
    return {
        種類: v('ledger-kind'),
        date: v('ledger-date'),
        product: v('ledger-product').trim(),
        channel: v('ledger-channel'),
        qty: v('ledger-qty'),
        total: v('ledger-amount'),
        amount: v('ledger-amount'),
        fee: v('ledger-fee').trim(),
        cost: v('ledger-cost'),
        category: v('ledger-category').trim(),
        note: v('ledger-note').trim(),
    };
}

function 帳面へ書く(e) {
    e.preventDefault();
    const 入力 = 帳面のフォームを読む();
    if (!(Number(入力.total) > 0)) {
        showNotification('金額を入れてください', 'error');
        return;
    }
    if (入力.種類 === 'expense') {
        const r = 支出を記録する(入力);
        if (window.logActivity) logActivity('支出を記録', { category: 'finance', text: `${r.category || '支出'} ${円で(r.amount)}` });
        showNotification(`支出を記録しました（${円で(r.amount)}）`, 'success');
    } else {
        const r = 売上を記録する(入力);
        if (window.logActivity) logActivity('売上を記録', { category: 'finance', text: `${r.product} ${円で(r.total)}` });
        const 色 = r.profit < 0 ? 'error' : 'success';
        showNotification(`売上を記録しました。利益 ${円で(r.profit)}${r.profit < 0 ? '（赤字です）' : ''}`, 色);
    }
    ['ledger-amount', 'ledger-fee', 'ledger-cost', 'ledger-note'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    お金の帳面を描く();
    if (typeof loadDashboardData === 'function') loadDashboardData();
    if (typeof 今日の運用を描く === 'function') 今日の運用を描く();
}

function 帳面の種類を切り替える() {
    const 支出 = document.getElementById('ledger-kind')?.value === 'expense';
    document.querySelectorAll('[data-ledger-sale]').forEach((el) => { el.hidden = 支出; });
    document.querySelectorAll('[data-ledger-expense]').forEach((el) => { el.hidden = !支出; });
    手数料の目安を出す();
}

function 手数料の目安を出す() {
    const 欄 = document.getElementById('ledger-fee');
    const 注 = document.getElementById('ledger-fee-note');
    if (!欄) return;
    const 先 = document.getElementById('ledger-channel')?.value || 'その他';
    const 金額 = document.getElementById('ledger-amount')?.value || 0;
    const 数量 = document.getElementById('ledger-qty')?.value || 1;
    欄.placeholder = `空なら目安 ${円で(手数料を見積もる(先, 金額, 数量))}`;
    if (注) 注.textContent = 帳面の設定().販売先[先]?.注 || '';
}

function 値段を計算する() {
    const 原価 = document.getElementById('ledger-price-cost')?.value;
    const 利益 = document.getElementById('ledger-price-profit')?.value;
    const 先 = document.getElementById('ledger-price-channel')?.value || 'その他';
    const 出 = document.getElementById('ledger-price-result');
    if (!出) return;
    if (!(Number(原価) >= 0) || 原価 === '') {
        出.textContent = '原価を入れると、手数料を引いても赤字にならない値段を出します。';
        return;
    }
    const r = 赤字にならない値段(原価, 利益, 先);
    if (!r) {
        出.textContent = 'この販売先の手数料率では計算できません。設定の率を見直してください。';
        return;
    }
    出.innerHTML = `${AReGLM_SECURITY.sanitizeHtml(先)}で <strong>${円で(r.売値)}</strong> 以上にすると、`
        + `手数料 ${円で(r.手数料)} を引いても利益 ${円で(r.残る利益)} が残ります。`;
}

function 帳面の行を不要へ(種類, id) {
    const 鍵 = 種類 === 'expense' ? 帳面_支出キー : 帳面_売上キー;
    const 全部 = 帳面を読む(鍵);
    const もの = 全部.find((x) => x.id === id);
    if (!もの) return;
    if (typeof 不要ボックスへ入れる === 'function') {
        不要ボックスへ入れる(種類 === 'expense' ? 'expense' : 'sale', もの, `${もの.date} ${もの.product || もの.category || ''} ${円で(もの.total ?? もの.amount)}`);
    }
    帳面を保存(鍵, 全部.filter((x) => x.id !== id));
    お金の帳面を描く();
    if (typeof loadDashboardData === 'function') loadDashboardData();
}

function 元手を決める() {
    const 今 = 帳面の設定();
    const 入 = prompt('記録を始めた時点の手元資金（円）', String(今.元手 || 0));
    if (入 == null) return;
    const 値 = Number(String(入).replace(/[,¥円\s]/g, ''));
    if (!Number.isFinite(値)) {
        showNotification('数字で入れてください', 'error');
        return;
    }
    let 保存 = {};
    try { 保存 = JSON.parse(localStorage.getItem(帳面_設定キー) || '{}'); } catch { 保存 = {}; }
    保存.元手 = 値;
    帳面の設定を保存(保存);
    お金の帳面を描く();
}

function 手数料率を直す() {
    const 先 = document.getElementById('ledger-channel')?.value || 'その他';
    const 今 = 帳面の設定().販売先[先];
    const 入 = prompt(`${先} の手数料（%）と1件あたりの固定額（円）を「率,固定」で入れてください`, `${今.率},${今.固定}`);
    if (入 == null) return;
    const [率, 固定] = String(入).split(/[,、\s]+/).map(Number);
    if (!Number.isFinite(率) || 率 < 0 || 率 >= 100) {
        showNotification('率は0〜99の数字で入れてください', 'error');
        return;
    }
    let 保存 = {};
    try { 保存 = JSON.parse(localStorage.getItem(帳面_設定キー) || '{}'); } catch { 保存 = {}; }
    保存.販売先 = { ...(保存.販売先 || {}), [先]: { ...今, 率, 固定: Number.isFinite(固定) ? 固定 : 0 } };
    帳面の設定を保存(保存);
    手数料の目安を出す();
    値段を計算する();
    showNotification(`${先} の手数料を ${率}%＋${固定 || 0}円 にしました`, 'success');
}

function お金の帳面を描く() {
    const 商品表 = document.getElementById('ledger-product-table');
    if (!商品表) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));

    const 売上 = 帳面を読む(帳面_売上キー);
    const 支出 = 帳面を読む(帳面_支出キー);
    const 合計 = {
        売上: 売上.reduce((a, x) => a + (Number(x.total) || 0), 0),
        手数料: 売上.reduce((a, x) => a + (Number(x.fee) || 0), 0),
        原価: 売上.reduce((a, x) => a + (Number(x.cost) || 0), 0),
        支出: 支出.reduce((a, x) => a + (Number(x.amount) || 0), 0),
    };
    合計.利益 = 合計.売上 - 合計.手数料 - 合計.原価 - 合計.支出;
    const 移り = 資金の移り変わり();
    const 残高 = 移り.length ? 移り[移り.length - 1].残高 : 帳面の設定().元手;

    const 要約 = document.getElementById('ledger-summary');
    if (要約) {
        要約.innerHTML = [
            ['売上', 合計.売上], ['手数料', -合計.手数料], ['原価', -合計.原価],
            ['支出', -合計.支出], ['利益', 合計.利益], ['資金残高', 残高],
        ].map(([名, 値]) => `<div class="ledger-sum${名 === '利益' && 値 < 0 ? ' minus' : ''}"><span>${名}</span><strong>${円で(値)}</strong></div>`).join('');
    }

    const 行 = 商品別にまとめる();
    商品表.innerHTML = 行.length
        ? 行.map((r) => `<tr class="${r.利益 < 0 ? 'ledger-minus' : ''}">
            <td>${s(r.商品)}</td><td>${r.数量}</td><td>${円で(r.売上)}</td><td>${円で(r.手数料)}</td>
            <td>${円で(r.原価 + r.支出)}</td><td><strong>${円で(r.利益)}</strong></td>
            <td>${s(Object.entries(r.販売先).map(([k, v]) => `${k}${v}`).join(' / '))}</td></tr>`).join('')
        : '<tr><td colspan="7" class="empty-cell">まだ記録がありません</td></tr>';

    const 在庫表 = document.getElementById('ledger-stock-table');
    if (在庫表) {
        const 商品 = typeof getProducts === 'function' ? getProducts() : [];
        const 売れた = {};
        売上.forEach((x) => {
            const k = x.product || '';
            売れた[k] = 売れた[k] || { EC: 0, リアル: 0 };
            売れた[k][x.channel === 'リアル' ? 'リアル' : 'EC'] += Number(x.qty) || 1;
        });
        在庫表.innerHTML = 商品.length
            ? 商品.slice(0, 50).map((p) => {
                const 名 = p.name || p.title || p.sku || '';
                const 売 = 売れた[名] || { EC: 0, リアル: 0 };
                return `<tr><td>${s(p.sku || '')}</td><td>${s(名)}</td><td>${Number(p.quantity) || 0}</td><td>${売.EC}</td><td>${売.リアル}</td></tr>`;
            }).join('')
            : '<tr><td colspan="5" class="empty-cell">在庫の画面で商品を登録すると、ここに並びます</td></tr>';
    }

    const 残高表 = document.getElementById('ledger-balance-table');
    if (残高表) {
        残高表.innerHTML = 移り.length
            ? 移り.slice(-14).reverse().map((r) => `<tr><td>${s(r.日)}</td><td>${円で(r.入)}</td><td>${円で(-r.出)}</td>
                <td><strong>${円で(r.残高)}</strong></td><td class="hint">${s(r.内訳.slice(0, 3).join('、'))}${r.内訳.length > 3 ? ' ほか' : ''}</td></tr>`).join('')
            : '<tr><td colspan="5" class="empty-cell">記録すると、いつ何に使ったかと残高がここに並びます</td></tr>';
    }

    const 最近 = document.getElementById('ledger-recent');
    if (最近) {
        const 並び = [
            ...売上.map((x) => ({ ...x, 種: 'sale' })),
            ...支出.map((x) => ({ ...x, 種: 'expense' })),
        ].sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date))).slice(0, 10);
        最近.innerHTML = 並び.length
            ? 並び.map((x) => `<li>
                <span>${s(x.date)} ${x.種 === 'sale' ? '売上' : '支出'} ${s(x.product || x.category || '')}
                ${x.種 === 'sale' ? `${s(x.channel)} ${円で(x.total)}（利益 ${円で(x.profit)}）` : 円で(-x.amount)}</span>
                <button type="button" class="btn-link" data-ledger-trash="${s(x.id)}" data-ledger-kind="${x.種}">不要へ移す</button>
            </li>`).join('')
            : '<li class="hint">まだ記録がありません</li>';
        最近.querySelectorAll('[data-ledger-trash]').forEach((b) => {
            b.addEventListener('click', () => 帳面の行を不要へ(b.dataset.ledgerKind, b.dataset.ledgerTrash));
        });
    }

    const 候補 = document.getElementById('ledger-product-options');
    if (候補 && typeof getProducts === 'function') {
        候補.innerHTML = getProducts().slice(0, 200)
            .map((p) => `<option value="${s(p.name || p.title || p.sku || '')}">`).join('');
    }
}

function initお金の帳面() {
    const form = document.getElementById('ledger-form');
    if (!form) return;
    const 選択肢 = Object.keys(販売先の既定).map((k) => `<option value="${k}">${k}</option>`).join('');
    ['ledger-channel', 'ledger-price-channel'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = 選択肢;
    });
    const 日 = document.getElementById('ledger-date');
    if (日 && !日.value) 日.value = 日付文字(new Date());

    form.addEventListener('submit', 帳面へ書く);
    document.getElementById('ledger-kind')?.addEventListener('change', 帳面の種類を切り替える);
    ['ledger-channel', 'ledger-amount', 'ledger-qty'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', 手数料の目安を出す);
    });
    ['ledger-price-cost', 'ledger-price-profit', 'ledger-price-channel'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', 値段を計算する);
    });
    document.getElementById('ledger-balance-btn')?.addEventListener('click', 元手を決める);
    document.getElementById('ledger-fee-edit-btn')?.addEventListener('click', 手数料率を直す);
    帳面の種類を切り替える();
    値段を計算する();
    お金の帳面を描く();
}

window.initお金の帳面 = initお金の帳面;
window.お金の帳面を描く = お金の帳面を描く;
window.赤字にならない値段 = 赤字にならない値段;
window.手数料を見積もる = 手数料を見積もる;
window.商品別にまとめる = 商品別にまとめる;
