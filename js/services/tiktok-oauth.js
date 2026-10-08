/**
 * TikTok OAuth 2.0（Content Posting API向け）— Gateway経由
 *
 * 正直に書いておくこと（Googleとの大きな違い）:
 *   Googleの「デスクトップアプリ」種別は、この端末内（127.0.0.1）への
 *   折り返しを事前登録なしで受け付けてくれるが、TikTokにはその仕組みが
 *   無い。TikTok Developer Portal に登録する「リダイレクトURI」は、
 *   本人が所有・検証済みの実在するHTTPSドメインでなければならない
 *   （127.0.0.1やlocalhostは登録できない）。
 *
 *   そのため、この端末だけで完結する自動の受け取り（Googleと同じ
 *   ポップアップ→自動で戻る、という形）は作れない。代わりに、
 *   「認可後にTikTokが画面に出す認可コードを、本人がここへ貼り付ける」
 *   方式にしてある。ドメインを用意しなくても使える、最も確実な方法。
 *
 * 使うには:
 *   1. TikTok Developer Portal でアプリを作り、Content Posting API を追加
 *   2. 「リダイレクトURI」に、本人が用意した実在のHTTPSページ
 *      （例: GitHub Pagesの空ページなど。中身は何でもよい。
 *      認可コードはそのページのURLの ?code=... に載って現れるだけ）
 *      を登録する
 *   3. Client Key・Client Secret・上で登録したリダイレクトURIを
 *      このツールの設定に入れる
 *   4. 「TikTokで認可する」を押すとその画面が開くので、認可したら
 *      表示されたURLの code= の値をコピーし、貼り付け欄に入れる
 *
 * トークンの扱い: リフレッシュトークンは暗号化してこの端末にだけ保存。
 * アクセストークンはメモリ内にだけ持つ（Google連携と同じ考え方）。
 */
const AReGLM_TIKTOK_OAUTH = {
    SCOPES: ['user.info.basic', 'video.publish', 'video.upload'],

    _accessToken: null,
    _accessTokenExpiry: 0,

    getClientKey() {
        return localStorage.getItem('areglm_tiktok_client_key') || '';
    },

    async getClientSecret() {
        return AReGLM_SECURITY.loadApiKeySecure('tiktok', 'client_secret');
    },

    getRedirectUri() {
        return localStorage.getItem('areglm_tiktok_redirect_uri') || '';
    },

    async saveClientCredentials(clientKey, clientSecret, redirectUri) {
        if (clientKey) localStorage.setItem('areglm_tiktok_client_key', clientKey);
        if (redirectUri) localStorage.setItem('areglm_tiktok_redirect_uri', redirectUri);
        if (clientSecret) await AReGLM_SECURITY.saveApiKeySecure('tiktok', 'client_secret', clientSecret);
    },

    async isConnected() {
        return !!(await AReGLM_SECURITY.loadApiKeySecure('tiktok', 'refresh_token'));
    },

    async disconnect() {
        const store = JSON.parse(localStorage.getItem(AReGLM_SECURITY.SECRETS_KEY) || '{}');
        if (store.tiktok) {
            delete store.tiktok.refresh_token;
            localStorage.setItem(AReGLM_SECURITY.SECRETS_KEY, JSON.stringify(store));
        }
        this._accessToken = null;
        this._accessTokenExpiry = 0;
    },

    /** PKCE用の検証コードと、その挑戦コード（SHA-256・16進・TikTok仕様） */
    async _pkce() {
        const verifier = AReGLM_SECURITY.generateToken();
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        // TikTokはbase64urlではなく16進表記のcode_challengeを求める仕様のため、他とは形が違う。
        const challenge = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
        return { verifier, challenge };
    },

    /**
     * 認可画面を開く準備をする（実際に開くのは呼び出し側のUI）。
     * @returns {Promise<string>} 開くべきURL
     */
    async 認可URLを作る() {
        const clientKey = this.getClientKey();
        const redirectUri = this.getRedirectUri();
        if (!clientKey || !redirectUri) throw new Error('Client Key・リダイレクトURI未設定 → 設定（⚙）');

        const { verifier, challenge } = await this._pkce();
        const state = AReGLM_SECURITY.generateToken();
        sessionStorage.setItem('areglm_tiktok_oauth_verifier', verifier);
        sessionStorage.setItem('areglm_tiktok_oauth_state', state);

        const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
        url.searchParams.set('client_key', clientKey);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', this.SCOPES.join(','));
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', challenge);
        url.searchParams.set('code_challenge_method', 'S256');
        return url.toString();
    },

    /**
     * 認可後にTikTokが見せた画面のURL（またはcodeそのもの）を渡して、
     * トークンを取得する。
     */
    async 認可コードで連携する(コードまたはURL) {
        const clientKey = this.getClientKey();
        const clientSecret = await this.getClientSecret();
        const redirectUri = this.getRedirectUri();
        if (!clientKey || !clientSecret || !redirectUri) throw new Error('Client Key・Client Secret・リダイレクトURI未設定 → 設定（⚙）');

        let code = (コードまたはURL || '').trim();
        // URLごと貼られた場合は、code= の値だけを取り出す。
        try {
            const u = new URL(code);
            const 中の値 = u.searchParams.get('code');
            if (中の値) code = 中の値;
        } catch { /* URLではなく、コードそのものが貼られた場合はそのまま使う */ }
        if (!code) throw new Error('認可コードが読み取れませんでした');

        const verifier = sessionStorage.getItem('areglm_tiktok_oauth_verifier');
        sessionStorage.removeItem('areglm_tiktok_oauth_verifier');
        sessionStorage.removeItem('areglm_tiktok_oauth_state');
        if (!verifier) throw new Error('先に「TikTokで認可する」を押してから、コードを貼り付けてください');

        const res = await fetch('/api/tiktok-oauth-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tiktok-Client-Secret': clientSecret },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_key: clientKey,
                code,
                code_verifier: verifier,
                redirect_uri: redirectUri,
            }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error_description || data.error || 'トークンの取得に失敗しました');

        this._accessToken = data.access_token;
        this._accessTokenExpiry = Date.now() + ((data.expires_in || 86400) * 1000) - 30000;
        if (data.refresh_token) await AReGLM_SECURITY.saveApiKeySecure('tiktok', 'refresh_token', data.refresh_token);
        return true;
    },

    /** 有効なアクセストークンを返す。切れていればリフレッシュトークンで取り直す。 */
    async getAccessToken() {
        if (this._accessToken && Date.now() < this._accessTokenExpiry) return this._accessToken;

        const refreshToken = await AReGLM_SECURITY.loadApiKeySecure('tiktok', 'refresh_token');
        if (!refreshToken) throw new Error('TikTok未連携です → 設定（⚙）');
        const clientKey = this.getClientKey();
        const clientSecret = await this.getClientSecret();
        if (!clientKey || !clientSecret) throw new Error('Client Key・Client Secret未設定 → 設定（⚙）');

        const res = await fetch('/api/tiktok-oauth-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tiktok-Client-Secret': clientSecret },
            body: JSON.stringify({ grant_type: 'refresh_token', client_key: clientKey, refresh_token: refreshToken }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error_description || data.error || 'トークンの更新に失敗しました（設定（⚙）で認可し直してください）');
        }
        this._accessToken = data.access_token;
        this._accessTokenExpiry = Date.now() + ((data.expires_in || 86400) * 1000) - 30000;
        if (data.refresh_token) await AReGLM_SECURITY.saveApiKeySecure('tiktok', 'refresh_token', data.refresh_token);
        return this._accessToken;
    },
};

window.AReGLM_TIKTOK_OAUTH = AReGLM_TIKTOK_OAUTH;
