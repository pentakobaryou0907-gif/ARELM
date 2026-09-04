/**
 * Google OAuth 2.0（デスクトップアプリ向け）— Gateway経由
 *
 * 使うには、本人がGoogle Cloud Consoleで「デスクトップアプリ」種別の
 * OAuthクライアントID・シークレットを発行し、設定（⚙）に入れた上で、
 * 「Googleにログインして連携」からブラウザでの認可を済ませておく必要がある。
 *
 * なぜ「デスクトップアプリ」種別か:
 *   ループバック（127.0.0.1宛、ポート番号は問わない）への戻りを、
 *   Googleが事前登録なしに受け付けてくれる唯一の種別のため
 *   （RFC 8252。 https://developers.google.com/identity/protocols/oauth2/native-app ）。
 *   この端末はWebサーバーではなくローカルの道具なので、固定のURLを
 *   Google Cloud Console側へ事前登録する「Webアプリケーション」種別より
 *   こちらが実態に合う。
 *
 * トークンの扱い:
 *   クライアントシークレット・リフレッシュトークンは AReGLM_SECURITY で
 *   暗号化してこの端末にだけ保存する。アクセストークン（短命）はメモリ内に
 *   だけ持ち、切れたらリフレッシュトークンから取り直す。
 *   サーバー（Node）側はどちらも保持しない。毎回ヘッダーで受け取って
 *   中継するだけ（Notion・Obsidian連携と同じ考え方）。
 *
 * 要求する権限（スコープ）:
 *   今はGmail送信・Driveバックアップの2つだけ。カレンダーは、実際の
 *   予定の追加・削除の実装ができた時点で、このスコープに追加すればよい
 *   （Googleの「段階的な認可」の仕組みで、再ログイン1回で済む）。
 */
const AReGLM_GOOGLE_OAUTH = {
    SCOPES: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/drive.file',
    ],

    _accessToken: null,
    _accessTokenExpiry: 0,

    getClientId() {
        return localStorage.getItem('areglm_google_client_id') || '';
    },

    async getClientSecret() {
        return AReGLM_SECURITY.loadApiKeySecure('google', 'client_secret');
    },

    async saveClientCredentials(clientId, clientSecret) {
        if (clientId) localStorage.setItem('areglm_google_client_id', clientId);
        else localStorage.removeItem('areglm_google_client_id');
        if (clientSecret) await AReGLM_SECURITY.saveApiKeySecure('google', 'client_secret', clientSecret);
    },

    getConnectedEmail() {
        return localStorage.getItem('areglm_google_account_email') || '';
    },

    async isConnected() {
        return !!(await AReGLM_SECURITY.loadApiKeySecure('google', 'refresh_token'));
    },

    /** 連携を解除する（保存したリフレッシュトークン・メールアドレスを消すだけ。Google側の許可の取り消しは本人がGoogleアカウント設定から行う） */
    async disconnect() {
        localStorage.removeItem('areglm_google_account_email');
        localStorage.removeItem('areglm_drive_folder_id');
        const store = JSON.parse(localStorage.getItem(AReGLM_SECURITY.SECRETS_KEY) || '{}');
        if (store.google) {
            delete store.google.refresh_token;
            localStorage.setItem(AReGLM_SECURITY.SECRETS_KEY, JSON.stringify(store));
        }
        this._accessToken = null;
        this._accessTokenExpiry = 0;
    },

    /** アプリ用の入口（127.0.0.1宛、ポート番号込み）を、実際の起動設定から確かめる */
    async _redirectUri() {
        try {
            const cfg = await fetch('/api/other-devices').then((r) => r.json());
            const port = cfg?.アプリ入口 || 8090;
            return `http://127.0.0.1:${port}/oauth2callback/google`;
        } catch {
            return 'http://127.0.0.1:8090/oauth2callback/google';
        }
    },

    /** PKCE用の検証コードと、その挑戦コード（SHA-256・base64url）を作る */
    async _pkce() {
        const verifier = AReGLM_SECURITY.generateToken(); // 64文字の16進 → 43〜128文字の条件を満たす
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return { verifier, challenge };
    },

    /**
     * Googleへログインし、Gmail送信・Driveバックアップの許可をもらう。
     * ブラウザでポップアップを開き、本人が同意したら戻ってくる。
     */
    async connect() {
        const clientId = this.getClientId();
        const clientSecret = await this.getClientSecret();
        if (!clientId || !clientSecret) throw new Error('クライアントID・シークレット未設定 → 設定（⚙）');
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、Googleとつなげません。');
        }

        const redirectUri = await this._redirectUri();
        const { verifier, challenge } = await this._pkce();
        const state = AReGLM_SECURITY.generateToken();
        sessionStorage.setItem('areglm_google_oauth_verifier', verifier);
        sessionStorage.setItem('areglm_google_oauth_state', state);

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', this.SCOPES.join(' '));
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent'); // 毎回リフレッシュトークンをもらうため
        authUrl.searchParams.set('code_challenge', challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);

        const popup = window.open(authUrl.toString(), 'areglm_google_oauth', 'width=520,height=680');
        if (!popup) throw new Error('ポップアップがブロックされました。ブラウザの設定で許可してから、もう一度試してください。');

        const 戻り値 = await new Promise((resolve, reject) => {
            let 済み = false;
            const onMessage = (event) => {
                if (event.origin !== window.location.origin) return;
                if (event.data?.type !== 'areglm-google-oauth') return;
                済み = true;
                window.removeEventListener('message', onMessage);
                clearInterval(timer);
                if (event.data.error) reject(new Error(`Googleでの認可が拒否・失敗しました: ${event.data.error}`));
                else resolve(event.data);
            };
            window.addEventListener('message', onMessage);
            const timer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(timer);
                    window.removeEventListener('message', onMessage);
                    if (!済み) reject(new Error('認証がキャンセルされました（ウィンドウが閉じられました）'));
                }
            }, 500);
        });

        const 保存していたstate = sessionStorage.getItem('areglm_google_oauth_state');
        const 保存していたverifier = sessionStorage.getItem('areglm_google_oauth_verifier');
        sessionStorage.removeItem('areglm_google_oauth_state');
        sessionStorage.removeItem('areglm_google_oauth_verifier');
        if (!戻り値.state || 戻り値.state !== 保存していたstate) {
            throw new Error('state が一致しません（認証をやり直してください）');
        }

        const res = await fetch('/api/google-oauth-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Google-Client-Secret': clientSecret },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: clientId,
                code: 戻り値.code,
                code_verifier: 保存していたverifier,
                redirect_uri: redirectUri,
            }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error_description || data.error || 'トークンの取得に失敗しました');

        this._accessToken = data.access_token;
        this._accessTokenExpiry = Date.now() + ((data.expires_in || 3600) * 1000) - 30000;
        if (data.refresh_token) {
            await AReGLM_SECURITY.saveApiKeySecure('google', 'refresh_token', data.refresh_token);
        }

        // 連携したアカウントのメールアドレスを確かめる（失敗しても連携自体は成立しているので続行）
        try {
            const profile = await this.call('gmail-proxy', 'GET', '/gmail/v1/users/me/profile');
            if (profile?.emailAddress) localStorage.setItem('areglm_google_account_email', profile.emailAddress);
        } catch { /* 取れなくても致命的ではない */ }

        return true;
    },

    /** 有効なアクセストークンを返す。切れていればリフレッシュトークンで取り直す。 */
    async getAccessToken() {
        if (this._accessToken && Date.now() < this._accessTokenExpiry) return this._accessToken;

        const refreshToken = await AReGLM_SECURITY.loadApiKeySecure('google', 'refresh_token');
        if (!refreshToken) throw new Error('Google未連携です → 設定（⚙）でログインしてください');
        const clientId = this.getClientId();
        const clientSecret = await this.getClientSecret();
        if (!clientId || !clientSecret) throw new Error('クライアントID・シークレット未設定 → 設定（⚙）');
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、Googleとつなげません。');
        }

        const res = await fetch('/api/google-oauth-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Google-Client-Secret': clientSecret },
            body: JSON.stringify({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error_description || data.error || 'トークンの更新に失敗しました（設定（⚙）でログインし直してください）');
        }
        this._accessToken = data.access_token;
        this._accessTokenExpiry = Date.now() + ((data.expires_in || 3600) * 1000) - 30000;
        return this._accessToken;
    },

    /** Gmail/Driveプロキシへの共通呼び出し */
    async call(proxy, method, path, body, extra) {
        const token = await this.getAccessToken();
        const res = await fetch(`/api/${proxy}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Google-Access-Token': token },
            body: JSON.stringify({ method, path, body, ...(extra || {}) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || data?.error || `Google API エラー（${res.status}）`);
        return data;
    },
};

window.AReGLM_GOOGLE_OAUTH = AReGLM_GOOGLE_OAUTH;
