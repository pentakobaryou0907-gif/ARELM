/**
 * AReGLM セキュリティ — 情報漏洩防止
 */
const AReGLM_SECURITY = {
    SESSION_HOURS: 4,
    IDLE_MINUTES: 20,
    STORAGE_KEY: 'areglm_secure_session',
    SECRETS_KEY: 'areglm_encrypted_secrets',

    sanitizeHtml(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    escapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    generateToken() {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr);
        return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    },

    _deviceSalt() {
        let s = sessionStorage.getItem('areglm_device_salt');
        if (!s) {
            s = this.generateToken();
            sessionStorage.setItem('areglm_device_salt', s);
        }
        return s;
    },

    async encryptSecret(plainText) {
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const passphrase = this._deviceSalt() + (localStorage.getItem('username') || 'areglm');
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey(
            // 12万回では、いまの計算機に対して薄い。
            // 門番側と同じ60万回に揃える。
            // 揃えないと、片方だけ弱いところから破られる。
            { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
        return JSON.stringify({
            salt: Array.from(salt),
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(cipher)),
            // 回数も残す。
            // 残さないと、あとで回数を変えたときに
            // 前に閉じたものが開かなくなる。
            回数: 600000
        });
    },

    async decryptSecret(payloadJson) {
        try {
            const { salt, iv, data, 回数 } = JSON.parse(payloadJson);
            // 回数が残っていなければ、昔の12万回で閉じたもの。
            const 使う回数 = (typeof 回数 === 'number') ? 回数 : 120000;
            const enc = new TextEncoder();
            const passphrase = this._deviceSalt() + (localStorage.getItem('username') || 'areglm');
            const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
            const key = await crypto.subtle.deriveKey(
                // 読むときは、そのとき使った回数で開ける。
                // 回数を変えたせいで前の控えが開かなくなっては困る。
                { name: 'PBKDF2', salt: new Uint8Array(salt),
                    iterations: 使う回数, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            const dec = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                key,
                new Uint8Array(data)
            );
            return new TextDecoder().decode(dec);
        } catch {
            return null;
        }
    },

    async saveApiKeySecure(cat, id, plainKey) {
        const encrypted = await this.encryptSecret(plainKey);
        const store = JSON.parse(localStorage.getItem(this.SECRETS_KEY) || '{}');
        if (!store[cat]) store[cat] = {};
        store[cat][id] = encrypted;
        localStorage.setItem(this.SECRETS_KEY, JSON.stringify(store));
    },

    async loadApiKeySecure(cat, id) {
        const store = JSON.parse(localStorage.getItem(this.SECRETS_KEY) || '{}');
        const blob = store[cat]?.[id];
        if (!blob) return null;
        return this.decryptSecret(blob);
    },

    wipeSecrets() {
        localStorage.removeItem(this.SECRETS_KEY);
        localStorage.removeItem('areglm_api_config');
    },

    createSession(username) {
        const token = this.generateToken();
        const expiry = Date.now() + this.SESSION_HOURS * 60 * 60 * 1000;
        const session = { token, username, expiry, lastActivity: Date.now() };
        localStorage.setItem('sessionToken', token);
        localStorage.setItem('sessionExpiry', String(expiry));
        localStorage.setItem('username', username);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
        this.resetIdleTimer();
        this._applyLeakGuards();
        return session;
    },

    validateSession() {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return this._legacySessionCheck();
        try {
            const session = JSON.parse(raw);
            const now = Date.now();
            if (now > session.expiry || now - session.lastActivity > this.IDLE_MINUTES * 60 * 1000) {
                this.clearSession(true);
                return false;
            }
            session.lastActivity = now;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
            return true;
        } catch {
            return this._legacySessionCheck();
        }
    },

    _legacySessionCheck() {
        const token = localStorage.getItem('sessionToken');
        const expiry = localStorage.getItem('sessionExpiry');
        if (!token || !expiry) return false;
        if (Date.now() > parseInt(expiry, 10)) {
            this.clearSession(true);
            return false;
        }
        return true;
    },

    clearSession(wipeSensitive) {
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('sessionExpiry');
        localStorage.removeItem('username');
        localStorage.removeItem(this.STORAGE_KEY);
        sessionStorage.removeItem('areglm_device_salt');
        if (wipeSensitive) {
            this.wipeSecrets();
        }
        if (this._idleTimer) clearTimeout(this._idleTimer);
    },

    resetIdleTimer() {
        if (this._idleTimer) clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
            if (document.getElementById('main-app')?.style.display !== 'none') {
                this.clearSession(true);
                if (typeof hideMainApp === 'function') hideMainApp();
                if (typeof showNotification === 'function') {
                    showNotification('セキュリティのためセッションを終了しました', 'info');
                }
            }
        }, this.IDLE_MINUTES * 60 * 1000);
    },

    _applyLeakGuards() {
        document.querySelectorAll('input[type="password"][data-api-cat]').forEach((inp) => {
            inp.setAttribute('autocomplete', 'off');
            inp.setAttribute('spellcheck', 'false');
        });
    },

    /** 外部送信前チェック（許可ドメインのみ） */
    isAllowedEndpoint(url) {
        try {
            const u = new URL(url);
            const allowed = ['googleapis.com', 'groq.com', 'huggingface.co', 'cloudflare.com', 'suzuri.jp', 'graph.facebook.com', 'pinterest.com', 'google.com', 'thebase.in', 'stores.jp', 'myshopify.com'];
            return allowed.some((h) => u.hostname.endsWith(h));
        } catch {
            return false;
        }
    }
};

['click', 'keydown', 'scroll', 'touchstart'].forEach((ev) => {
    document.addEventListener(
        ev,
        () => {
            if (AReGLM_SECURITY.validateSession()) AReGLM_SECURITY.resetIdleTimer();
        },
        { passive: true }
    );
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && document.getElementById('main-app')?.style.display !== 'none') {
        document.querySelectorAll('input[type="password"]').forEach((i) => {
            if (i.value) i.blur();
        });
    }
});

window.AReGLM_SECURITY = AReGLM_SECURITY;
