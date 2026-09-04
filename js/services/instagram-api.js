/**
 * Instagram 公式API（Graph API）— Gateway経由
 *
 * 非公式の自動操作（ブラウザを乗っ取って画面を操作する等）は使わない方針
 * のため、投稿はMeta公式の Content Publishing API だけを使う。
 *
 * 正直に書いておくこと（下準備の段階であることの中身）:
 *   ・アクセストークン・投稿先のInstagramユーザーIDは、オーナー自身が
 *     Meta for Developersで発行し、設定（⚙）に入れる必要がある
 *     （自分のアカウントをアプリの管理者/テスターに加えれば、
 *     Meta側の審査を待たずに使える）。
 *   ・公式APIの仕様上、投稿する画像は「インターネット上の誰かが開ける
 *     URL」である必要がある（Meta側のサーバーが image_url を取りに来る
 *     ため、この端末だけに置いた画像のバイト列を直接渡す手段は無い）。
 *     SUZURIの商品画像のように、既に公開されているURLがある場合はそれを
 *     渡せる。AIで作っただけでまだどこにも公開していない画像は、
 *     先にどこかへ公開してからでないと使えない。
 *   ・ここでは接続・投稿処理そのものまでを用意する。「投稿を作成」画面
 *     からの導線（画像URLの受け渡し）は、次の段階で用意する。
 */
const AReGLM_INSTAGRAM = {
    async getToken() {
        return AReGLM_SECURITY.loadApiKeySecure('instagram', 'access_token');
    },

    getIgUserId() {
        return localStorage.getItem('areglm_instagram_ig_user_id') || '';
    },

    async isConnected() {
        return !!(await this.getToken()) && !!this.getIgUserId();
    },

    async disconnect() {
        localStorage.removeItem('areglm_instagram_ig_user_id');
        const store = JSON.parse(localStorage.getItem(AReGLM_SECURITY.SECRETS_KEY) || '{}');
        if (store.instagram) {
            delete store.instagram.access_token;
            localStorage.setItem(AReGLM_SECURITY.SECRETS_KEY, JSON.stringify(store));
        }
    },

    /** Graph APIへの共通呼び出し（method・path・body をそのまま中継） */
    async _call(method, path, body) {
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、Instagramとつなげません。');
        }
        const token = await this.getToken();
        if (!token) throw new Error('Instagramアクセストークン未設定 → 設定（⚙）');

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
     * 画像1枚の投稿用コンテナを作る（まだ公開はされない）。
     * @param imageUrl インターネット上で開ける画像URL（必須）
     * @param caption  投稿文（任意）
     * @returns {Promise<string>} コンテナID
     */
    async createMediaContainer(imageUrl, caption) {
        const igUserId = this.getIgUserId();
        if (!igUserId) throw new Error('InstagramユーザーID未設定 → 設定（⚙）');
        if (!imageUrl) throw new Error('画像URLが必要です（インターネット上で開けるURLのみ対応）');

        const 結果 = await this._call('POST', `/${igUserId}/media`, {
            image_url: imageUrl,
            caption: caption || '',
        });
        if (!結果.id) throw new Error('コンテナを作成できませんでした');
        return 結果.id;
    },

    /**
     * コンテナの処理が終わる（FINISHED）まで数秒おきに確認する。
     * Metaの案内どおり、作成直後は処理中（IN_PROGRESS）のことがある。
     */
    async _コンテナ完了を待つ(containerId, タイムアウトms = 60000) {
        const 締切 = Date.now() + タイムアウトms;
        while (Date.now() < 締切) {
            const 状態 = await this._call('GET', `/${containerId}?fields=status_code`);
            if (状態.status_code === 'FINISHED') return true;
            if (状態.status_code === 'ERROR') throw new Error('コンテナの処理に失敗しました');
            await new Promise((r) => setTimeout(r, 2000));
        }
        throw new Error('コンテナの処理が時間内に終わりませんでした');
    },

    /** 作成済みのコンテナを、実際にInstagramへ公開する */
    async publish(containerId) {
        const igUserId = this.getIgUserId();
        if (!igUserId) throw new Error('InstagramユーザーID未設定 → 設定（⚙）');
        const 結果 = await this._call('POST', `/${igUserId}/media_publish`, { creation_id: containerId });
        if (!結果.id) throw new Error('公開できませんでした');
        return 結果.id;
    },

    /** コンテナ作成→完了待ち→公開までを一度に行う */
    async publishImage(imageUrl, caption) {
        const containerId = await this.createMediaContainer(imageUrl, caption);
        await this._コンテナ完了を待つ(containerId);
        return this.publish(containerId);
    },
};

window.AReGLM_INSTAGRAM = AReGLM_INSTAGRAM;
