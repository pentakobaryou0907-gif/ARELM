/**
 * 商品開発 — SUZURI公式API + ショップ areglm
 */
function initProductDev() {
    document.getElementById('suzuri-create-form')?.addEventListener('submit', handleSuzuriCreate);
    document.getElementById('suzuri-material-file')?.addEventListener('change', previewSuzuriMaterial);
    document.getElementById('refresh-suzuri-btn')?.addEventListener('click', loadProductDev);
    document.getElementById('suzuri-import-inventory-btn')?.addEventListener('click', () => syncSuzuriInventory());
    document.getElementById('techpack-form')?.addEventListener('submit', handleTechpackAdd);
    document.getElementById('techpack-export-btn')?.addEventListener('click', exportTechpackCsv);
    populateSuzuriItemTypes();
    loadProductDev();
    renderTechpackTable();
}

function populateSuzuriItemTypes() {
    const sel = document.getElementById('suzuri-item-type');
    if (!sel) return;
    const types = [
        { id: 1, name: 'Tシャツ' },
        { id: 2, name: 'トートバッグ' },
        { id: 3, name: 'スマホケース' },
        { id: 4, name: 'タオル' },
        { id: 5, name: 'ポスター' },
        { id: 8, name: 'ロングスリーブT' },
        { id: 9, name: 'タンブラー' }
    ];
    // 選択肢を文字でつなげていた。ストッパーが見つけた。
    // 中身は固定だが、書き方が危ないので、部品で作る。
    sel.textContent = '';
    const 空 = document.createElement('option');
    空.value = '';
    空.textContent = '選択';
    sel.appendChild(空);
    types.forEach((t) => {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name;
        sel.appendChild(o);
    });
}

function previewSuzuriMaterial(e) {
    const preview = document.getElementById('suzuri-material-preview');
    const file = e.target.files?.[0];
    if (!preview || !file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        {
            preview.textContent = '';
            const 絵 = document.createElement('img');
            絵.src = ev.target.result;
            絵.alt = '';
            preview.appendChild(絵);
        }
        preview.dataset.dataUrl = ev.target.result;
    };
    reader.readAsDataURL(file);
}

async function handleSuzuriCreate(e) {
    e.preventDefault();
    const name = document.getElementById('suzuri-product-name')?.value?.trim();
    const itemType = document.getElementById('suzuri-item-type')?.value;
    const description = document.getElementById('suzuri-description')?.value?.trim() || '';
    const preview = document.getElementById('suzuri-material-preview');
    const materialData = preview?.dataset?.dataUrl;

    if (!name || !itemType) {
        showNotification('商品名とアイテムを入力してください', 'error');
        return;
    }

    const policy = AReGLM_CONTENT_POLICY.validate(name + ' ' + description);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    // 既存商品と似すぎていないか、自作AIエンジンで確認する。
    // 「似たような商品は作らない」を作成前に機械的に担保するため。
    if (window.AReGLM_LOCAL_AI) {
        await AReGLM_LOCAL_AI.indexProducts();
        const sim = await AReGLM_LOCAL_AI.checkSimilar(`${name} ${description}`, {
            item: itemType
        });
        if (sim && sim.verdict !== 'ok' && sim.matches?.length) {
            const top = sim.matches[0];
            const proceed = confirm(
                `${sim.message}\n\n` +
                `最も近い既存商品:\n「${top.text}」\n類似度: ${Math.round(top.score * 100)}%\n\n` +
                `このまま作成しますか？`
            );
            if (!proceed) return;
        }
    }

    const draft = {
        id: 'sz_' + Date.now(),
        name,
        itemType: parseInt(itemType, 10),
        description,
        status: 'draft',
        createdAt: new Date().toISOString()
    };

    if (materialData) {
        try {
            await AReGLM_SUZURI.createMaterial(materialData, 'design.png');
            draft.status = 'material_uploaded';
        } catch (err) {
            showNotification('素材API: ' + err.message, 'info');
        }
    }

    const list = JSON.parse(localStorage.getItem('areglm_suzuri_products') || '[]');
    list.push(draft);
    localStorage.setItem('areglm_suzuri_products', JSON.stringify(list));

    e.target.reset();
    preview.innerHTML = '<span class="hint">PNG/JPEG をアップロード</span>';
    delete preview.dataset.dataUrl;

    loadProductDev();
    logActivity(`SUZURI商品「${name}」を作成`);
    showNotification('作成しました。在庫ページで「同期」してください', 'success');
}

function loadProductDev() {
    renderSuzuriStatus();
    renderSuzuriProducts();
}

function renderSuzuriStatus() {
    const el = document.getElementById('suzuri-connection-status');
    if (!el) return;
    const ok = getApiConfig().suzuri?.api?.connected;
    el.className = 'status-banner ' + (ok ? 'ok' : 'warn');
    el.innerHTML = ok
        ? `<strong>SUZURI連携準備OK</strong> — <a href="${AREGLM_PROFILE.suzuriShop}" target="_blank" rel="noopener">ショップ</a> · 公式API無料`
        : `<strong>APIトークンを設定</strong> — <a href="https://suzuri.jp/developer" target="_blank" rel="noopener">開発者ページ</a> → 設定（⚙）`;
}

function renderSuzuriProducts() {
    const grid = document.getElementById('suzuri-products-grid');
    if (!grid) return;
    const list = JSON.parse(localStorage.getItem('areglm_suzuri_products') || '[]');
    if (!list.length) {
        grid.innerHTML = '<p class="empty-state">商品がありません</p>';
        return;
    }
    grid.innerHTML = list
        .slice()
        .reverse()
        .map(
            (p) => `<article class="dev-card">
            <h4>${AReGLM_SECURITY.sanitizeHtml(p.name)}</h4>
            <span class="status-badge">${p.status}</span>
            <button type="button" class="btn btn-sm btn-danger" onclick="deleteSuzuriProduct('${p.id}')">削除</button>
        </article>`
        )
        .join('');
}

function deleteSuzuriProduct(id) {
    let list = JSON.parse(localStorage.getItem('areglm_suzuri_products') || '[]');
    list = list.filter((p) => p.id !== id);
    localStorage.setItem('areglm_suzuri_products', JSON.stringify(list));
    loadProductDev();
}

/**
 * 技術パック（寸法表）— 製造・発注仕様書として使える簡易スペックシート。
 * この端末内のみで完結（localStorage）。
 */
const AREGLM_TECHPACK_KEY = 'areglm_techpack';

function loadTechpackRows() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_TECHPACK_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveTechpackRows(rows) {
    localStorage.setItem(AREGLM_TECHPACK_KEY, JSON.stringify(rows));
}

function handleTechpackAdd(e) {
    e.preventDefault();
    const product = document.getElementById('techpack-product')?.value?.trim();
    const size = document.getElementById('techpack-size')?.value;
    const part = document.getElementById('techpack-part')?.value?.trim();
    const value = document.getElementById('techpack-value')?.value;
    const note = document.getElementById('techpack-note')?.value?.trim() || '';

    if (!product || !part || value === '') {
        showNotification('商品名・部位・寸法を入力してください', 'error');
        return;
    }

    const policy = AReGLM_CONTENT_POLICY.validate(`${product} ${part} ${note}`);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    const rows = loadTechpackRows();
    rows.push({
        id: 'tp_' + Date.now(),
        product,
        size,
        part,
        value: parseFloat(value),
        note,
        createdAt: new Date().toISOString()
    });
    saveTechpackRows(rows);

    e.target.reset();
    document.getElementById('techpack-size').value = 'M';
    renderTechpackTable();
    logActivity(`技術パックに追加: ${product} / ${part}`, { category: 'techpack', text: `${product} ${part} ${value}cm` });
}

function renderTechpackTable() {
    const tbody = document.getElementById('techpack-tbody');
    if (!tbody) return;
    const rows = loadTechpackRows();
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">寸法データがありません</td></tr>';
        return;
    }
    tbody.innerHTML = rows
        .slice()
        .reverse()
        .map(
            (r) => `<tr>
                <td>${AReGLM_SECURITY.sanitizeHtml(r.product)}</td>
                <td>${AReGLM_SECURITY.sanitizeHtml(r.size)}</td>
                <td>${AReGLM_SECURITY.sanitizeHtml(r.part)}</td>
                <td>${r.value}</td>
                <td>${AReGLM_SECURITY.sanitizeHtml(r.note || '')}</td>
                <td><button type="button" class="btn btn-sm btn-danger" onclick="deleteTechpackRow('${r.id}')">削除</button></td>
            </tr>`
        )
        .join('');
}

function deleteTechpackRow(id) {
    saveTechpackRows(loadTechpackRows().filter((r) => r.id !== id));
    renderTechpackTable();
}

function exportTechpackCsv() {
    const rows = loadTechpackRows();
    if (!rows.length) {
        showNotification('書き出す寸法データがありません', 'info');
        return;
    }
    const header = ['商品名', 'サイズ', '部位', '寸法(cm)', 'メモ'];
    const lines = [header.join(',')].concat(
        rows.map((r) => [r.product, r.size, r.part, r.value, r.note || ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    );
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `techpack_${今日()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    logActivity('技術パックをCSV書き出し');
}

window.initProductDev = initProductDev;
window.loadProductDev = loadProductDev;
window.deleteSuzuriProduct = deleteSuzuriProduct;
window.deleteTechpackRow = deleteTechpackRow;
window.renderTechpackTable = renderTechpackTable;
