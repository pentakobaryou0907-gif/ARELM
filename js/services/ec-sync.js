/**
 * EC公式API連携 — 在庫・商品の同期（アクティブな無料APIのみ）
 */
const AReGLM_EC_SYNC = {
    async syncPlatform(platformId, products) {
        const meta = AReGLM_API_REGISTRY.ec[platformId];
        if (!meta || !AReGLM_API_SELECTOR.isFreeOfficial(meta)) {
            return { ok: false, error: '無料公式APIではありません' };
        }

        const active = getActiveApis('ec').find((a) => a.id === platformId);
        if (!active) {
            return { ok: false, error: 'より優れたAPIが選択されたため、このECは自動除外されています' };
        }

        const token = await AReGLM_SECURITY.loadApiKeySecure('ec', platformId);
        if (!token) {
            return { ok: false, error: 'API未設定' };
        }

        // 本番: サーバープロキシ経由で各EC公式エンドポイントへ
        // フロントでは同期キューとログのみ（CORS・キー保護）
        const logs = JSON.parse(localStorage.getItem('areglm_ec_sync_log') || '[]');
        let count = 0;
        products.forEach((p) => {
            logs.push({
                at: new Date().toISOString(),
                platform: platformId,
                action: 'inventory_sync',
                detail: `${p.sku} → ${p.quantity}`,
                status: 'queued'
            });
            p.ecSync = p.ecSync || {};
            p.ecSync[platformId] = { at: new Date().toISOString(), quantity: p.quantity };
            count++;
        });
        localStorage.setItem('areglm_ec_sync_log', JSON.stringify(logs.slice(-500)));
        AReGLM_PERF.batchLocalWrite('products', products);
        return { ok: true, count };
    },

    async syncAllActiveEc() {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const platforms = getActiveApis('ec');
        if (!platforms.length) {
            showNotification('設定でECの公式APIキーを登録してください', 'info');
            return;
        }

        let total = 0;
        for (const p of platforms) {
            const res = await this.syncPlatform(p.id, products);
            if (res.ok) total += res.count;
        }
        localStorage.setItem('products', JSON.stringify(products));
        AReGLM_PERF.invalidate('ec');
        logActivity(`EC ${platforms.length}件と在庫を同期しました`);
        showNotification(`${platforms.length}つのECと${total}商品を同期キューに追加`, 'success');
    }
};

window.AReGLM_EC_SYNC = AReGLM_EC_SYNC;
