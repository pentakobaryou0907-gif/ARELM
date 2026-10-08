/**
 * 取引先（顧客）管理 と バーコードマスター
 * 既存の「顧客管理.xlsx」「Product Management List.xlsx（バーコードマスター）」の
 * 項目構成をそのまま踏襲。すべてこの端末内（localStorage）で完結する。
 */
const AREGLM_CUSTOMER_KEY = 'areglm_customers';
const AREGLM_BARCODE_KEY = 'areglm_barcodes';

function initCustomers() {
    document.getElementById('customer-form')?.addEventListener('submit', handleCustomerAdd);
    document.getElementById('customer-export-btn')?.addEventListener('click', exportCustomersCsv);
    document.getElementById('barcode-form')?.addEventListener('submit', handleBarcodeAdd);
    document.getElementById('barcode-export-btn')?.addEventListener('click', exportBarcodesCsv);
    renderCustomerTable();
    renderBarcodeTable();
}

/* ---------- 取引先 ---------- */

function loadCustomers() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_CUSTOMER_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveCustomers(rows) {
    localStorage.setItem(AREGLM_CUSTOMER_KEY, JSON.stringify(rows));
}

function handleCustomerAdd(e) {
    e.preventDefault();
    const get = (id) => document.getElementById(id)?.value?.trim() || '';
    const code = get('customer-code');
    const company = get('customer-company');
    if (!code || !company) return;

    const policy = AReGLM_CONTENT_POLICY.validate(`${company} ${get('customer-person')}`);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    const rows = loadCustomers();
    if (rows.some((r) => r.code === code)) {
        showNotification(`顧客コード「${code}」はすでに登録されています`, 'error');
        return;
    }

    rows.push({
        id: 'cust_' + Date.now(),
        code,
        company,
        rank: document.getElementById('customer-rank')?.value || 'B',
        person: get('customer-person'),
        dept: get('customer-dept'),
        zip: get('customer-zip'),
        address: get('customer-address'),
        tel: get('customer-tel'),
        createdAt: new Date().toISOString()
    });
    saveCustomers(rows);

    e.target.reset();
    document.getElementById('customer-rank').value = 'B';
    renderCustomerTable();
    logActivity(`取引先を登録: ${company}`, { category: 'customer', text: company });
}

function renderCustomerTable() {
    const tbody = document.getElementById('customer-tbody');
    if (!tbody) return;
    const rows = loadCustomers().sort((a, b) => a.rank.localeCompare(b.rank) || a.code.localeCompare(b.code));

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">取引先が登録されていません</td></tr>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    tbody.innerHTML = rows
        .map(
            (r) => `<tr>
                <td>${s(r.code)}</td>
                <td>${s(r.company)}</td>
                <td><span class="rank-badge rank-${s(r.rank)}">${s(r.rank)}</span></td>
                <td>${s(r.person)}</td>
                <td>${s(r.dept)}</td>
                <td>${s(r.zip ? r.zip + ' ' : '')}${s(r.address)}</td>
                <td>${s(r.tel)}</td>
                <td><button type="button" class="btn btn-sm btn-danger" onclick="deleteCustomer('${r.id}')">削除</button></td>
            </tr>`
        )
        .join('');
}

function deleteCustomer(id) {
    if (!confirm('この取引先を削除しますか？')) return;
    saveCustomers(loadCustomers().filter((r) => r.id !== id));
    renderCustomerTable();
}

function exportCustomersCsv() {
    const rows = loadCustomers();
    if (!rows.length) {
        showNotification('書き出す取引先がありません', 'info');
        return;
    }
    downloadCsv(
        ['顧客コード', '会社名', '顧客ランク', '担当者名', '担当部署', '郵便番号', '住所', '電話番号'],
        rows.map((r) => [r.code, r.company, r.rank, r.person, r.dept, r.zip, r.address, r.tel]),
        'customers'
    );
    logActivity('取引先をCSV書き出し');
}

/* ---------- バーコードマスター ---------- */

function loadBarcodes() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_BARCODE_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveBarcodes(rows) {
    localStorage.setItem(AREGLM_BARCODE_KEY, JSON.stringify(rows));
}

function handleBarcodeAdd(e) {
    e.preventDefault();
    const codeInput = document.getElementById('barcode-code');
    const nameInput = document.getElementById('barcode-name');
    const code = codeInput?.value?.trim();
    const name = nameInput?.value?.trim();
    if (!code || !name) return;

    const rows = loadBarcodes();
    const existing = rows.find((r) => r.code === code);
    if (existing) {
        showNotification(`このバーコードは「${existing.name}」に登録済みです`, 'error');
        return;
    }

    rows.push({
        id: 'bc_' + Date.now(),
        code,
        name,
        createdAt: new Date().toISOString()
    });
    saveBarcodes(rows);

    e.target.reset();
    renderBarcodeTable();
    codeInput.focus(); // 連続スキャンできるようフォーカスを戻す
    logActivity(`バーコード登録: ${name}`, { category: 'barcode', text: `${code} ${name}` });
}

function renderBarcodeTable() {
    const tbody = document.getElementById('barcode-tbody');
    if (!tbody) return;
    const rows = loadBarcodes();

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">バーコードが登録されていません</td></tr>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    tbody.innerHTML = rows
        .slice()
        .reverse()
        .map(
            (r) => `<tr>
                <td><code>${s(r.code)}</code></td>
                <td>${s(r.name)}</td>
                <td>${new Date(r.createdAt).toLocaleString('ja-JP')}</td>
                <td><button type="button" class="btn btn-sm btn-danger" onclick="deleteBarcode('${r.id}')">削除</button></td>
            </tr>`
        )
        .join('');
}

function deleteBarcode(id) {
    saveBarcodes(loadBarcodes().filter((r) => r.id !== id));
    renderBarcodeTable();
}

function exportBarcodesCsv() {
    const rows = loadBarcodes();
    if (!rows.length) {
        showNotification('書き出すバーコードがありません', 'info');
        return;
    }
    downloadCsv(
        ['バーコード', '商品名', '登録日時'],
        rows.map((r) => [r.code, r.name, new Date(r.createdAt).toLocaleString('ja-JP')]),
        'barcodes'
    );
    logActivity('バーコードをCSV書き出し');
}

/* ---------- 共通 ---------- */

function downloadCsv(header, rows, prefix) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(',')].concat(rows.map((r) => r.map(esc).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}_${今日()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

window.initCustomers = initCustomers;
window.renderCustomerTable = renderCustomerTable;
window.renderBarcodeTable = renderBarcodeTable;
window.deleteCustomer = deleteCustomer;
window.deleteBarcode = deleteBarcode;
