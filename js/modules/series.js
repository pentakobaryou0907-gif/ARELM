/**
 * シリーズ管理
 *
 * 商品をシリーズ（コレクション）単位でまとめ、
 * 進捗・在庫・売価をシリーズごとに把握できるようにする。
 * すべてこの端末内（localStorage）で完結する。
 */
const AREGLM_SERIES_KEY = 'areglm_series';

const SERIES_STATUS = {
    planning: { label: '企画中', order: 0 },
    sampling: { label: 'サンプル制作', order: 1 },
    production: { label: '生産中', order: 2 },
    selling: { label: '販売中', order: 3 },
    closed: { label: '終了', order: 4 }
};

function initSeries() {
    document.getElementById('series-form')?.addEventListener('submit', handleSeriesAdd);
    renderSeriesList();
}

function loadSeries() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_SERIES_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveSeries(list) {
    localStorage.setItem(AREGLM_SERIES_KEY, JSON.stringify(list));
}

function handleSeriesAdd(e) {
    e.preventDefault();
    const name = document.getElementById('series-name')?.value?.trim();
    if (!name) return;

    const concept = document.getElementById('series-concept')?.value?.trim() || '';

    const policy = AReGLM_CONTENT_POLICY.validate(`${name} ${concept}`);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    const list = loadSeries();
    if (list.some((s) => s.name === name)) {
        showNotification(`シリーズ「${name}」はすでにあります`, 'error');
        return;
    }

    list.push({
        id: 'ser_' + Date.now(),
        name,
        concept,
        status: document.getElementById('series-status')?.value || 'planning',
        release: document.getElementById('series-release')?.value || '',
        skus: [],
        createdAt: new Date().toISOString()
    });
    saveSeries(list);

    e.target.reset();
    renderSeriesList();

    if (window.AReGLM_LOCAL_AI && concept) AReGLM_LOCAL_AI.learn(`${name} ${concept}`, 'series');
    if (window.logActivity) logActivity(`シリーズを追加: ${name}`, { category: 'series', text: `${name} ${concept}` });
}

function deleteSeries(id) {
    const list = loadSeries();
    const target = list.find((s) => s.id === id);
    if (!target) return;
    // シリーズを消しても商品自体は消えないことを明示する
    if (!confirm(`シリーズ「${target.name}」を削除しますか？\n（商品自体は削除されず、割り当てが外れるだけです）`)) return;
    saveSeries(list.filter((s) => s.id !== id));
    renderSeriesList();
}

function setSeriesStatus(id, status) {
    const list = loadSeries();
    const s = list.find((x) => x.id === id);
    if (!s) return;
    s.status = status;
    saveSeries(list);
    renderSeriesList();
    if (window.logActivity) logActivity(`シリーズ「${s.name}」を${SERIES_STATUS[status]?.label}に変更`, { category: 'series' });
}

/** シリーズに商品を割り当てる／外す */
function toggleSkuInSeries(seriesId, sku) {
    const list = loadSeries();
    const s = list.find((x) => x.id === seriesId);
    if (!s) return;
    s.skus = s.skus || [];
    const i = s.skus.indexOf(sku);
    if (i >= 0) s.skus.splice(i, 1);
    else s.skus.push(sku);
    saveSeries(list);
    renderSeriesList();
}

function getProducts() {
    try {
        return JSON.parse(localStorage.getItem('products') || '[]');
    } catch {
        return [];
    }
}

/** シリーズ内の商品から在庫・売価の合計を出す */
function seriesTotals(series, products) {
    const items = products.filter((p) => (series.skus || []).includes(p.sku || p.id));
    const stock = items.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const value = items.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 0), 0);
    const low = items.filter((p) => (p.quantity || 0) <= (p.reorderLevel || 5)).length;
    return { items, stock, value, low };
}

function renderSeriesList() {
    const box = document.getElementById('series-list');
    if (!box) return;

    const list = loadSeries().sort(
        (a, b) => (SERIES_STATUS[a.status]?.order ?? 9) - (SERIES_STATUS[b.status]?.order ?? 9)
    );
    const products = getProducts();

    if (!list.length) {
        box.innerHTML = '<p class="hint">シリーズがまだありません。上のフォームから追加してください。</p>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    const today = 今日();

    box.innerHTML = list
        .map((ser) => {
            const t = seriesTotals(ser, products);
            const st = SERIES_STATUS[ser.status] || { label: ser.status };

            let releaseNote = '';
            if (ser.release) {
                const days = Math.round(
                    (new Date(ser.release + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000
                );
                releaseNote = days < 0
                    ? `<span class="series-release past">発売日 ${s(ser.release)}（${-days}日経過）</span>`
                    : `<span class="series-release">発売予定 ${s(ser.release)}（あと${days}日）</span>`;
            }

            const statusOptions = Object.entries(SERIES_STATUS)
                .map(([k, v]) => `<option value="${k}"${k === ser.status ? ' selected' : ''}>${v.label}</option>`)
                .join('');

            // 割り当て候補（全商品）とチェック状態
            const skuChecks = products.length
                ? products
                      .map((p) => {
                          const sku = p.sku || p.id;
                          const on = (ser.skus || []).includes(sku);
                          return `<label class="series-sku${on ? ' on' : ''}">
                            <input type="checkbox" data-ser="${s(ser.id)}" data-sku="${s(sku)}"${on ? ' checked' : ''}>
                            ${s(p.name)}<small>${s(sku)}</small>
                          </label>`;
                      })
                      .join('')
                : '<p class="hint">商品が登録されていません。在庫一覧から追加してください。</p>';

            return `<article class="series-card status-${s(ser.status)}">
                <div class="series-head">
                    <h4>${s(ser.name)}</h4>
                    <select class="series-status-sel" data-ser="${s(ser.id)}">${statusOptions}</select>
                    <button type="button" class="btn-link danger" data-del="${s(ser.id)}">削除</button>
                </div>
                ${ser.concept ? `<p class="series-concept">${s(ser.concept)}</p>` : ''}
                <div class="series-stats">
                    <span><em>${t.items.length}</em> 商品</span>
                    <span><em>${t.stock}</em> 在庫</span>
                    <span><em>¥${t.value.toLocaleString('ja-JP')}</em> 在庫金額</span>
                    ${t.low ? `<span class="warn"><em>${t.low}</em> 要補充</span>` : ''}
                    <span class="series-status-badge">${s(st.label)}</span>
                    ${releaseNote}
                </div>
                <details class="series-assign">
                    <summary>商品を割り当てる（${t.items.length}/${products.length}）</summary>
                    <div class="series-sku-list">${skuChecks}</div>
                </details>
            </article>`;
        })
        .join('');

    box.querySelectorAll('.series-status-sel').forEach((sel) => {
        sel.addEventListener('change', () => setSeriesStatus(sel.dataset.ser, sel.value));
    });
    box.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', () => deleteSeries(btn.dataset.del));
    });
    box.querySelectorAll('input[data-sku]').forEach((cb) => {
        cb.addEventListener('change', () => toggleSkuInSeries(cb.dataset.ser, cb.dataset.sku));
    });
}

window.initSeries = initSeries;
window.renderSeriesList = renderSeriesList;
