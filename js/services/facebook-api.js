/**
 * Facebook 公式API（Graph API・ページ投稿）— Gateway経由
 *
 * Instagram連携と同じ考え方・同じサーバー中継口（/api/instagram-proxy、
 * どちらもgraph.facebook.com宛のため共用できる）を使う。
 *
 * 正直に書いておくこと（下準備の段階であることの中身）:
 *   ・ページアクセストークン・投稿先のページIDは、オーナー自身が
 *     Meta for Developersで発行し、設定（⚙）に入れる必要がある。
 *   ・公式APIの仕様上、画像つきで投稿する場合の画像は「インターネット上の
 *     誰かが開けるURL」である必要がある（InstagramのGraph API連携と同じ
 *     制約）。この端末だけに置いた画像は、先にどこかへ公開してからで
 *     ないと使えない。
 *   ・文章だけの投稿（画像なし）は、画像URLが無くてもそのまま出せる。
 */
const AReGLM_FACEBOOK = {
    async getToken() {
        return AReGLM_SECURITY.loadApiKeySecure('facebook', 'page_access_token');
    },

    getPageId() {
        return localStorage.getItem('areglm_facebook_page_id') || '';
    },

    async isConnected() {
        return !!(await this.getToken()) && !!this.getPageId();
    },

    async disconnect() {
        localStorage.removeItem('areglm_facebook_page_id');
        const store = JSON.parse(localStorage.getItem(AReGLM_SECURITY.SECRETS_KEY) || '{}');
        if (store.facebook) {
            delete store.facebook.page_access_token;
            localStorage.setItem(AReGLM_SECURITY.SECRETS_KEY, JSON.stringify(store));
        }
    },

    /** Graph APIへの共通呼び出し（Instagram連携と同じ中継口をそのまま使う） */
    async _call(method, path, body) {
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、Facebookとつなげません。');
        }
        const token = await this.getToken();
        if (!token) throw new Error('Facebookページアクセストークン未設定 → 設定（⚙）');

        const res = await fetch('/api/instagram-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Instagram-Access-Token': token },
            body: JSON.stringify({ method, path, body }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data?.error?.message || data?.error || `Graph API エラー（${res.status}）`);
        }
        return data;
    },

    /**
     * ページへ投稿する。画像URLが有ればその画像つき、無ければ文章だけ。
     * @param message 投稿文
     * @param imageUrl インターネット上で開ける画像URL（任意）
     * @returns {Promise<string>} 投稿id
     */
    async publish(message, imageUrl) {
        const pageId = this.getPageId();
        if (!pageId) throw new Error('FacebookページID未設定 → 設定（⚙）');

        const 結果 = imageUrl
            ? await this._call('POST', `/${pageId}/photos`, { url: imageUrl, caption: message || '' })
            : await this._call('POST', `/${pageId}/feed`, { message: message || '' });

        const id = 結果.post_id || 結果.id;
        if (!id) throw new Error('投稿できませんでした');
        return id;
    },
};

window.AReGLM_FACEBOOK = AReGLM_FACEBOOK;
