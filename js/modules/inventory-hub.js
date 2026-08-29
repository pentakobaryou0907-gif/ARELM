/**
 * 在庫管理 — SUZURIショップ (suzuri.jp/areglm) の商品のみ
 */
function initInventoryHub() {
    document.querySelectorAll('.hub-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchHubTab(btn.dataset.hubTab));
    });
    document.querySelectorAll('.hub-group-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchHubGroup(btn.dataset.hubGroup));
    });
    // 初期状態：既定で選ばれているタブ（在庫一覧）を含む「商品」グループを開いておく。
    document.querySelectorAll('.hub-tab-btn').forEach((b) => { b.hidden = b.dataset.hubGroup !== 'product'; });
    document.getElementById('suzuri-sync-btn')?.addEventListener('click', syncSuzuriInventory);
    document.getElementById('suzuri-shop-open-btn')?.addEventListener('click', () => window.open(AREGLM_PROFILE.suzuriShop, '_blank', 'noopener'));
    document.getElementById('inbound-btn')?.addEventListener('click', () => openInventoryModal('inbound'));
    document.getElementById('outbound-btn')?.addEventListener('click', () => openInventoryModal('outbound'));
    document.getElementById('refresh-inventory-hub-btn')?.addEventListener('click', loadInventoryHub);
    document.getElementById('autosort-run-btn')?.addEventListener('click', runAutoSort);
    document.getElementById('autosort-from-stock-btn')?.addEventListener('click', loadAutoSortFromStock);
    document.getElementById('autosort-rules-btn')?.addEventListener('click', editAutoSortRules);
    document.getElementById('autosort-export-btn')?.addEventListener('click', exportAutoSortCsv);
    loadInventoryHub();
    renderAutoSortResult();
    SUZURIボタンの案内を直す();
}

/**
 * 「SUZURIから同期」ボタンに、押す前から状態が伝わるようにする（1-2）。
 *
 * このボタンは未接続でも押せてしまう（この端末に既にある分だけを
 * 使う「代わりの動き」に切り替わるだけで、エラーにはならない）。
 * だからこそ、色の濃淡だけでなく、hoverで「今どちらの動きになるか」を
 * はっきり伝える。
 */
function SUZURIボタンの案内を直す() {
    const btn = document.getElementById('suzuri-sync-btn');
    if (!btn) return;
    const 接続済み = !!getApiConfig().suzuri?.api?.connected;
    btn.title = 接続済み
        ? 'SUZURIの実際の商品データを取りに行きます'
        : 'SUZURIのAPIトークンが未設定のため、この端末に既にあるデータだけで代わりに整えます（設定 → SUZURI連携でトークンを入れると本来の同期になります）';
    btn.classList.toggle('btn-needs-setup', !接続済み);
}

function runAutoSort() {
    const raw = document.getElementById('autosort-input')?.value || '';
    const names = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!names.length) {
        showNotification('商品名を1行ずつ入力してください', 'error');
        return;
    }
    const rows = AReGLM_BOX_SORTER.run(names);
    renderAutoSortResult(rows);
    showNotification(`${rows.length}件を自動仕分けしました`, 'success');
}

function loadAutoSortFromStock() {
    const names = AReGLM_BOX_SORTER.productsAsNames();
    if (!names.length) {
        showNotification('在庫データがありません。先にSUZURIから同期してください', 'error');
        return;
    }
    document.getElementById('autosort-input').value = names.join('\n');
    showNotification(`在庫から${names.length}件を読み込みました`, 'info');
}

function editAutoSortRules() {
    const rules = AReGLM_BOX_SORTER.loadRules();
    const current = Object.entries(rules).map(([k, v]) => `${k}=${v}`).join('\n');
    const input = prompt('仕分けルールを編集（1行ごとに 商品名=カテゴリ-箱プレフィックス）', current);
    if (input === null) return;
    const newRules = {};
    input.split('\n').forEach((line) => {
        const [name, cat] = line.split('=').map((s) => s?.trim());
        if (name && cat) newRules[name] = cat;
    });
    AReGLM_BOX_SORTER.saveRules(newRules);
    showNotification('仕分けルールを更新しました', 'success');
}

function exportAutoSortCsv() {
    const result = AReGLM_BOX_SORTER.lastResult();
    if (!result?.rows?.length) {
        showNotification('先に自動仕分けを実行してください', 'error');
        return;
    }
    const csv = AReGLM_BOX_SORTER.toCsv(result.rows);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `自動仕分け結果_${今日()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function renderAutoSortResult(rows) {
    const tbody = document.getElementById('autosort-tbody');
    if (!tbody) return;
    rows = rows || AReGLM_BOX_SORTER.lastResult()?.rows || [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">まだ実行していません</td></tr>';
        return;
    }
    tbody.innerHTML = rows
        .map(
            (r) => `<tr><td>${AReGLM_SECURITY.sanitizeHtml(r.商品番号)}</td><td>${AReGLM_SECURITY.sanitizeHtml(r.商品名)}</td><td>${AReGLM_SECURITY.sanitizeHtml(r.箱名)}</td></tr>`
        )
        .join('');
}

/**
 * 在庫ページのサブタブが9個も横に並び、一覧性が悪かった（1-4）。
 * 「商品／お金／連携・履歴」の上位グループをまず選び、
 * その中の詳細タブだけを見せる2段階の作りにする。
 * タブ・パネルの仕組み自体（switchHubTab）はそのまま使う。
 */
function switchHubGroup(group) {
    document.querySelectorAll('.hub-group-btn').forEach((b) => b.classList.toggle('active', b.dataset.hubGroup === group));

    const タブたち = document.querySelectorAll('.hub-tab-btn');
    タブたち.forEach((b) => { b.hidden = b.dataset.hubGroup !== group; });

    // いま選ばれているタブが、このグループに無ければ、
    // このグループの最初のタブへ自動で切り替える。
    const 選択中 = document.querySelector('.hub-tab-btn.active');
    if (!選択中 || 選択中.dataset.hubGroup !== group) {
        const 最初 = document.querySelector(`.hub-tab-btn[data-hub-group="${group}"]`);
        if (最初) switchHubTab(最初.dataset.hubTab);
    }
}

function switchHubTab(tab) {
    document.querySelectorAll('.hub-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.hubTab === tab));
    document.querySelectorAll('.hub-panel').forEach((p) => p.classList.toggle('active', p.id === `hub-panel-${tab}`));

    // 隠れている間に描くと、位置がずれることがある。
    // 表を開いたときに、その場で描き直す。
    if (tab === 'sheet' && typeof renderSheet === 'function') renderSheet();
    if (tab === 'preorder' && typeof renderPreorders === 'function') renderPreorders();
}

function getSuzuriProductsOnly() {
    return JSON.parse(localStorage.getItem('products') || '[]').filter(
        (p) => p.source === 'suzuri' || p.suzuriId || (p.shopUrl && p.shopUrl.includes('suzuri.jp'))
    );
}

function loadInventoryHub() {
    AReGLM_PERF.scheduleRender(() => {
        // 画面を描き直すだけの処理で、保存を書き換えてはいけない。
        //
        // ここは以前、SUZURI から来た商品だけを残して
        // localStorage に書き戻していた。
        // そのため、手で登録した商品（source が付かない）は、
        // 保存された直後の描き直しで消えていた。
        //
        // 「商品を追加」を押して保存しても何も増えない、という
        // 見つけにくい壊れ方をしていた。保存は成功していて、
        // その直後に消されていたため、エラーも出なかった。
        //
        // 描くのは全部。読むだけにして、書き戻さない。
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        if (typeof displayInventoryTable === 'function') displayInventoryTable(products);
        if (typeof updateProductSelects === 'function') updateProductSelects(products);
        if (typeof loadSalesData === 'function') loadSalesData();
        renderSuzuriShopBanner();
        renderSeedImportBanner(products);
        renderEcSyncLog();
        updateEcStats();
    });
}

/**
 * 「商品マスターを読み込む」ボタンが表下の小さいボタンに埋もれていて
 * 気づかれにくかったため、未取込データがあるときだけ
 * ページ上部に目立つ帯を出す。取込済みなら何も出さない。
 *
 * また、表下の元のボタンは「（5件）」のまま固定表示で、
 * 全件取込済みでも「まだ読み込める」ように見えていたため、
 * 未取込件数に合わせてラベルを変え、0件なら隠す。
 */
function renderSeedImportBanner(products) {
    const 帯 = document.getElementById('seed-import-banner');
    const 元ボタン = document.getElementById('import-product-seed-btn');
    if (!window.AREGLM_PRODUCT_SEED) return;

    const 既存 = new Set((products || []).map((p) => p.sku));
    const 未取込件数 = AREGLM_PRODUCT_SEED.filter((s) => !既存.has(s.sku)).length;

    if (帯) {
        帯.hidden = 未取込件数 === 0;
        const 文 = document.getElementById('seed-import-banner-text');
        if (文 && 未取込件数 > 0) 文.textContent = `未取込の商品マスターデータが${未取込件数}件あります。読み込むと在庫一覧に追加されます。`;
    }

    if (元ボタン) {
        if (未取込件数 === 0) {
            元ボタン.hidden = true;
        } else {
            元ボタン.hidden = false;
            元ボタン.textContent = `商品マスターを読み込む（${未取込件数}件）`;
        }
    }
}

function renderSuzuriShopBanner() {
    const el = document.getElementById('suzuri-shop-banner');
    if (!el) return;
    const last = localStorage.getItem('areglm_suzuri_last_sync');
    // URLをそのまま href に入れていた。ストッパーが見つけた。
    // javascript: のような文字が入ると、押した時点で命令が動く。
    el.textContent = '';

    const 見出し = document.createElement('strong');
    見出し.textContent = '販売先: ';
    el.appendChild(見出し);

    const 先 = document.createElement('a');
    先.href = AREGLM_PROFILE.suzuriShop;
    先.target = '_blank';
    先.rel = 'noopener';
    先.textContent = AREGLM_PROFILE.suzuriShop;
    el.appendChild(先);

    const 注 = document.createElement('span');
    注.className = 'hint';
    注.textContent = last
        ? `最終同期: ${new Date(last).toLocaleString('ja-JP')}`
        : '未同期 — APIトークン設定後「同期」';
    el.appendChild(注);
}

async function syncSuzuriInventory() {
    const btn = document.getElementById('suzuri-sync-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '同期中…';
    }

    let result = await AReGLM_SUZURI.syncToInventory();
    if (!result.ok && result.fallback) {
        result = AReGLM_SUZURI.syncFallback();
    }

    if (btn) {
        btn.disabled = false;
        btn.textContent = 'SUZURIから同期';
    }

    if (result.ok) {
        showNotification(`SUZURI商品 ${result.count}件を反映しました`, 'success');
        logActivity(`SUZURIショップから${result.count}件同期`);
        loadInventoryHub();
        if (typeof loadDashboardData === 'function') loadDashboardData();
    } else {
        showNotification(result.error || '同期失敗', 'error');
    }
}

function renderEcSyncLog() {
    const tbody = document.getElementById('ec-sync-tbody');
    if (!tbody) return;
    const logs = JSON.parse(localStorage.getItem('areglm_ec_sync_log') || '[]')
        .filter((l) => l.platform === 'suzuri')
        .slice(-15)
        .reverse();
    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">同期履歴なし</td></tr>';
        return;
    }
    tbody.innerHTML = logs
        .map(
            (l) => `<tr>
            <td>${new Date(l.at).toLocaleString('ja-JP')}</td>
            <td>${AReGLM_SECURITY.sanitizeHtml(l.action)}</td>
            <td>${AReGLM_SECURITY.sanitizeHtml(l.detail)}</td>
        </tr>`
        )
        .join('');
}

function updateEcStats() {
    // 「商品」の数は、登録したもの全部を数える。
    // SUZURI から来たものだけを数えていたので、
    // 手で登録した商品がいくらあっても 0 のままだった。
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const sales = JSON.parse(localStorage.getItem('areglm_sales') || '[]');
    setHubText('hub-total-products', products.length);
    setHubText('hub-total-sales', `¥${sales.reduce((s, x) => s + (x.total || 0), 0).toLocaleString('ja-JP')}`);

    // ここだけは SUZURI のものを数える。グッズ制作の欄なので。
    setHubText('hub-studio-products', getSuzuriProductsOnly().length);
}

function setHubText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

window.initInventoryHub = initInventoryHub;
window.loadInventoryHub = loadInventoryHub;
window.getSuzuriProductsOnly = getSuzuriProductsOnly;
window.syncSuzuriInventory = syncSuzuriInventory;
window.runAutoSort = runAutoSort;
