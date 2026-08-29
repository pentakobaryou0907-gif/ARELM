/**
 * 実データ（商品一覧_2025-08-07.csv）から取り込んだ初期商品データ。
 * ワンクリックで在庫に読み込めるようにする。既存データは上書きしない。
 */
const AREGLM_PRODUCT_SEED = [
    { sku: 'TSH001', name: 'ベーシックTシャツ', price: 2500, quantity: 50 },
    { sku: 'JKT002', name: 'デニムジャケット', price: 8500, quantity: 20 },
    { sku: 'PTS003', name: 'スキニーパンツ', price: 4500, quantity: 30 },
    { sku: 'SWT004', name: 'カジュアルスウェット', price: 3500, quantity: 25 },
    { sku: 'SHO005', name: 'スニーカー', price: 12000, quantity: 15 }
];

function importProductSeed() {
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const existing = new Set(products.map((p) => p.sku));

    let added = 0;
    AREGLM_PRODUCT_SEED.forEach((s) => {
        if (existing.has(s.sku)) return;
        products.push({
            id: 'seed_' + s.sku,
            sku: s.sku,
            name: s.name,
            price: s.price,
            quantity: s.quantity,
            reorderLevel: 5,
            source: 'seed',
            createdAt: new Date().toISOString()
        });
        added += 1;
    });

    localStorage.setItem('products', JSON.stringify(products));

    if (typeof loadInventoryHub === 'function') loadInventoryHub();
    if (typeof loadDashboardData === 'function') loadDashboardData();

    showNotification(
        added ? `${added}件の商品を読み込みました（既存${AREGLM_PRODUCT_SEED.length - added}件はそのまま）` : 'すべて登録済みです',
        added ? 'success' : 'info'
    );
    if (window.logActivity) logActivity(`商品マスターを読み込み（${added}件）`, { category: 'inventory' });
}

window.AREGLM_PRODUCT_SEED = AREGLM_PRODUCT_SEED;
window.importProductSeed = importProductSeed;
