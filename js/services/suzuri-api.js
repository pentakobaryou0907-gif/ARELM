/**
 * SUZURI 公式API — Gateway経由
 */
const AReGLM_SUZURI = {
    shopUrl: 'https://suzuri.jp/areglm',

    async getToken() {
        return AReGLM_SECURITY.loadApiKeySecure('suzuri', 'api');
    },

    async fetchProducts() {
        const token = await this.getToken();
        if (!token) throw new Error('SUZURI APIトークン未設定 → 設定（⚙）');

        let data;
        if (await AReGLM_API_CLIENT.health()) {
            data = await AReGLM_API_CLIENT.suzuriProducts(token);
        } else {
            // 外へ出る経路は、残さない。
            //
            // 審査員が見つけた。
            // ゲートウェイ（この端末内）が動いていないときに
            // ここから直接出ようとしていた。
            // 関所が止めるとはいえ、経路が無いほうが確かで、
            // 誰かが関所を外したときにも漏れない。
            throw new Error(
                'ゲートウェイが動いていないため、SUZURIとつなげません。'
                + '直接つなぐことはしません（外部へ出る経路を残さないため）。');
        }

        const list = data?.products || data?.data || (Array.isArray(data) ? data : []);
        return list.map((p) => this.normalizeProduct(p));
    },

    normalizeProduct(p) {
        const id = p.id ?? p.product_id;
        return {
            sku: `SZ-${id}`,
            suzuriId: id,
            name: p.name || p.title || `商品 #${id}`,
            price: parseInt(p.selling_price || p.price || 0, 10) || 0,
            quantity: p.stock ?? p.quantity ?? 0,
            source: 'suzuri',
            shopUrl: p.url || `${this.shopUrl}/products/${id}`,
            imageUrl: p.thumbnail_url || p.image_url || '',
            ecSync: { suzuri: { at: new Date().toISOString() } }
        };
    },

    async syncToInventory() {
        try {
            const products = await this.fetchProducts();
            localStorage.setItem('products', JSON.stringify(products));
            localStorage.setItem('areglm_suzuri_last_sync', new Date().toISOString());
            const logs = JSON.parse(localStorage.getItem('areglm_ec_sync_log') || '[]');
            logs.push({
                at: new Date().toISOString(),
                platform: 'suzuri',
                action: 'sync',
                detail: `${products.length}件取得`
            });
            localStorage.setItem('areglm_ec_sync_log', JSON.stringify(logs.slice(-500)));
            return { ok: true, count: products.length };
        } catch (e) {
            return { ok: false, error: e.message, fallback: true };
        }
    },

    syncFallback() {
        const drafts = JSON.parse(localStorage.getItem('areglm_suzuri_products') || '[]');
        const products = drafts.map((d) => ({
            sku: `SZ-${String(d.id).replace('sz_', '')}`,
            suzuriId: d.id,
            name: d.name,
            price: 0,
            quantity: 0,
            source: 'suzuri',
            shopUrl: this.shopUrl
        }));
        if (!products.length) return { ok: false, error: '同期する商品がありません' };
        localStorage.setItem('products', JSON.stringify(products));
        return { ok: true, count: products.length, fallback: true };
    },

    async createMaterial(fileDataUrl, fileName) {
        const token = await this.getToken();
        if (!token) throw new Error('APIトークン未設定');
        const base64 = fileDataUrl.split(',')[1];
        const mime = fileDataUrl.match(/data:([^;]+)/)?.[1] || 'image/png';
        const body = { material: { file_name: fileName || 'design.png', file_data: base64, content_type: mime } };

        if (await AReGLM_API_CLIENT.health()) {
            return AReGLM_API_CLIENT.suzuriPost(token, 'materials', body);
        }
        throw new Error('server を起動してください: cd server && npm start');
    },

    /**
     * 下書きを、実際にSUZURI上の商品として登録する。
     *
     * 正直に書いておくこと：
     *   SUZURIのv1 APIで商品を作るには、アップロードした素材（デザイン画像）の
     *   idを、どの向き・大きさで乗せるかという情報（texture_layout）と
     *   一緒に渡す必要があるとされている。ここでは素材のidを
     *   sample_illustration_id として渡す組み立てにしているが、
     *   本物のAPIトークンでまだ試せていないため、必須項目が
     *   これで足りているかは確認できていない。
     *   最初に本番トークンで試したときにエラーが返ってきたら、
     *   このリクエストの組み立てを見直してほしい。
     */
    async publishProductDraft(draft) {
        const token = await this.getToken();
        if (!token) throw new Error('SUZURIトークン未設定');
        if (!(await AReGLM_API_CLIENT.health())) throw new Error('API Gateway未起動');

        const product = {
            name: draft.name,
            item_type_id: draft.itemType,
            description: draft.description,
        };
        if (draft.materialId) {
            product.texture_layout = { sample_illustration_id: draft.materialId };
        }

        return AReGLM_API_CLIENT.suzuriPost(token, 'products', { product });
    }
};

window.AReGLM_SUZURI = AReGLM_SUZURI;
