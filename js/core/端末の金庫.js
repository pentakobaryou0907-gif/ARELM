/**
 * 端末の金庫（公開先＝Macの無い場所で使う鍵の置き場）
 *
 * なぜ要るのか:
 *   公開先では、データ共有にGitHubの鍵、AIにGeminiのキーが要る。
 *   そのまま localStorage に置くと、端末を手に取った人に読まれる。
 *   これまでの鍵の置き方（security.js）は、タブを閉じると読めなくなる作りで、
 *   開くたびに入れ直しになってしまう。
 *
 * やり方:
 *   本人がこの端末で決めた合言葉から、PBKDF2（60万回）で暗号の鍵を作り、
 *   中身はAES-GCMで閉じて localStorage に置く。合言葉そのものは、どこにも残さない。
 *   合言葉を入れて開いている間だけ、暗号の鍵を sessionStorage に置く
 *   （タブを閉じる・ログアウト・自動ロックで消える）。
 *
 * 他の端末へは同期しない（sync.js の除外キー）。
 */

const 端末の金庫 = {
    置き場の名: 'areglm_local_vault',     // localStorage（閉じた中身と塩）
    鍵の名: 'areglm_vault_key',           // sessionStorage（開いている間だけ）
    回数: 600000,

    _置き場を読む() {
        try { return JSON.parse(localStorage.getItem(this.置き場の名) || 'null') || { 塩: null, 中身: {} }; }
        catch { return { 塩: null, 中身: {} }; }
    },

    _置き場を書く(x) {
        localStorage.setItem(this.置き場の名, JSON.stringify(x));
    },

    /** 合言葉から暗号の鍵を作り、開いている間だけ置く（合言葉を確かめた後に呼ぶ） */
    async 開ける(合言葉) {
        const 置き場 = this._置き場を読む();
        if (!Array.isArray(置き場.塩)) {
            置き場.塩 = Array.from(crypto.getRandomValues(new Uint8Array(16)));
            this._置き場を書く(置き場);
        }
        const 材料 = await crypto.subtle.importKey('raw', new TextEncoder().encode(合言葉), 'PBKDF2', false, ['deriveBits']);
        const ビット = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: new Uint8Array(置き場.塩), iterations: this.回数, hash: 'SHA-256' }, 材料, 256);
        sessionStorage.setItem(this.鍵の名, Array.from(new Uint8Array(ビット), (b) => b.toString(16).padStart(2, '0')).join(''));
    },

    開いているか() {
        return !!sessionStorage.getItem(this.鍵の名);
    },

    閉じる() {
        sessionStorage.removeItem(this.鍵の名);
    },

    async _鍵() {
        const 十六 = sessionStorage.getItem(this.鍵の名);
        if (!十六) return null;
        const バイト = new Uint8Array(十六.match(/../g).map((h) => parseInt(h, 16)));
        return crypto.subtle.importKey('raw', バイト, 'AES-GCM', false, ['encrypt', 'decrypt']);
    },

    async 入れる(名, 値) {
        const 鍵 = await this._鍵();
        if (!鍵) throw new Error('金庫が閉じています（合言葉を入れ直してください）');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const 閉じた = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, 鍵, new TextEncoder().encode(String(値)));
        const 置き場 = this._置き場を読む();
        置き場.中身[名] = { iv: Array.from(iv), data: Array.from(new Uint8Array(閉じた)) };
        this._置き場を書く(置き場);
    },

    async 出す(名) {
        const 鍵 = await this._鍵();
        const 物 = this._置き場を読む().中身[名];
        if (!鍵 || !物) return null;
        try {
            const 開いた = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(物.iv) }, 鍵, new Uint8Array(物.data));
            return new TextDecoder().decode(開いた);
        } catch {
            return null;
        }
    },

    入っているか(名) {
        return !!this._置き場を読む().中身[名];
    },

    /** 自動で作った値が使えなかったとき（倉庫の合言葉と違った等）に、入れたものを取り下げる。本人が入れた値には使わない */
    取り下げる(名) {
        const 置き場 = this._置き場を読む();
        delete 置き場.中身[名];
        this._置き場を書く(置き場);
    },

    /* ==========================================================
       指紋・顔（パスキー）で開ける — 本人の要望（2026-10-09）「合言葉やパスワードはなしに」
       ==========================================================
       金庫の鍵（ランダム。前の合言葉の端末は、合言葉から作った鍵をそのまま使う）を、パスキーで包んで置く。
         ・PRF（パスキーが、本人確認のあとにだけ出す秘密）が使える端末: 秘密からHKDFで包む鍵を作る。
           パスキーで本人確認しない限り、金庫の中身は誰にも開けない（JSを書き換えても開けない）
         ・PRFが無い端末: 取り出せない形の鍵をこの端末（IndexedDB）に作って包む。
           開くときにパスキーの本人確認を求めるが、守りは「端末を手に取った人が、すぐには開けない」まで
       どちらも、合言葉・パスワード・メールアドレスは使わない。パスキーの名前は「ARELM」だけ。
       パスキーの名札は、この端末にだけ置く（同期しない）。 */
    パスキーの名: 'areglm_local_passkey',
    _PRFの塩: new TextEncoder().encode('ARELM-vault-v1'),

    _b64(バイト) {
        let s = '';
        new Uint8Array(バイト).forEach((b) => { s += String.fromCharCode(b); });
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    _b64から(文字) {
        const s = atob(String(文字).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(文字).length + 3) % 4));
        return Uint8Array.from(s, (c) => c.charCodeAt(0));
    },

    パスキーの記録() {
        try { return JSON.parse(localStorage.getItem(this.パスキーの名) || 'null'); } catch { return null; }
    },

    /** この端末で、パスキー（指紋・顔・Windows Hello）が使えるか */
    パスキーが使えるか() {
        return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
    },

    /** この端末で、指紋・顔で開けるようにしてあるか */
    指紋で開けるか() {
        const x = this.パスキーの記録();
        return !!(x && x.id && this._置き場を読む().包み && this._置き場を読む().包み[x.id]);
    },

    async _包む鍵(PRFの出力) {
        const 材料 = await crypto.subtle.importKey('raw', PRFの出力, 'HKDF', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('ARELM'), info: new TextEncoder().encode('金庫の鍵を包む') },
            材料, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },

    /* PRFが無い端末の、取り出せない鍵（IndexedDB に置く） */
    _端末の鍵の箱(動き) {
        return new Promise((ok, ng) => {
            const 開く = indexedDB.open('arelm-vault', 1);
            開く.onupgradeneeded = () => 開く.result.createObjectStore('鍵');
            開く.onerror = () => ng(開く.error);
            開く.onsuccess = () => {
                const db = 開く.result;
                const tx = db.transaction('鍵', 'readwrite');
                const 結果 = 動き(tx.objectStore('鍵'));
                tx.oncomplete = () => { db.close(); ok(結果 && 'result' in 結果 ? 結果.result : undefined); };
                tx.onerror = () => { db.close(); ng(tx.error); };
            };
        });
    },

    /** いま開いている金庫の鍵（無ければ、新しく作る）を返す */
    _いまの鍵のバイト() {
        const 十六 = sessionStorage.getItem(this.鍵の名);
        if (十六) return new Uint8Array(十六.match(/../g).map((h) => parseInt(h, 16)));
        return crypto.getRandomValues(new Uint8Array(32));
    },

    _鍵を開いておく(バイト) {
        sessionStorage.setItem(this.鍵の名, Array.from(new Uint8Array(バイト), (b) => b.toString(16).padStart(2, '0')).join(''));
    },

    /** パスキーの答えを確かめる（種類・お題・出どころ・本人確認の印・署名）。公開先にはサーバーが無いので、この端末で確かめる */
    async _答えを確かめる(答え, お題, 記録) {
        const 戻す = (b) => new TextDecoder().decode(b);
        const 客 = JSON.parse(戻す(答え.response.clientDataJSON));
        if (客.type !== 'webauthn.get' || 客.challenge !== this._b64(お題) || 客.origin !== location.origin) return false;
        const 認 = new Uint8Array(答え.response.authenticatorData);
        const rp = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.hostname)));
        if (rp.some((b, i) => 認[i] !== b)) return false;
        if ((認[32] & 0x05) !== 0x05) return false;              // 本人がいる（UP）・本人確認した（UV）
        if (!記録.公開鍵) return true;                              // 公開鍵を取れなかった端末（古いブラウザ）は、ここまで
        const 客のハッシュ = new Uint8Array(await crypto.subtle.digest('SHA-256', 答え.response.clientDataJSON));
        const 署名の元 = new Uint8Array(認.length + 32);
        署名の元.set(認, 0);
        署名の元.set(客のハッシュ, 認.length);
        const 署名 = new Uint8Array(答え.response.signature);
        if (記録.方式 === -257) {
            const 鍵 = await crypto.subtle.importKey('spki', this._b64から(記録.公開鍵), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
            return crypto.subtle.verify('RSASSA-PKCS1-v1_5', 鍵, 署名, 署名の元);
        }
        const 鍵 = await crypto.subtle.importKey('spki', this._b64から(記録.公開鍵), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, 鍵, this._DERから(署名), 署名の元);
    },

    /** ECDSAの署名（DER）を、WebCrypto の形（r と s を32バイトずつ）に直す */
    _DERから(der) {
        let i = 2;
        if (der[1] & 0x80) i += der[1] & 0x7f;
        const 読む = () => {
            i += 1;                     // 0x02（整数）
            const 長さ = der[i]; i += 1;
            let 数 = der.slice(i, i + 長さ); i += 長さ;
            while (数.length > 32 && 数[0] === 0) 数 = 数.slice(1);
            const 出 = new Uint8Array(32);
            出.set(数, 32 - 数.length);
            return 出;
        };
        const r = 読む();
        const s = 読む();
        const 出 = new Uint8Array(64);
        出.set(r, 0);
        出.set(s, 32);
        return 出;
    },

    async _PRFを聞く(id) {
        const お題 = crypto.getRandomValues(new Uint8Array(32));
        const 答え = await navigator.credentials.get({
            publicKey: {
                challenge: お題,
                rpId: location.hostname,
                allowCredentials: [{ type: 'public-key', id: this._b64から(id) }],
                userVerification: 'required',
                timeout: 120000,
                extensions: { prf: { eval: { first: this._PRFの塩 } } },
            },
        });
        const 結果 = 答え.getClientExtensionResults ? 答え.getClientExtensionResults() : {};
        const 出力 = 結果 && 結果.prf && 結果.prf.results && 結果.prf.results.first;
        return { 答え, お題, 出力: 出力 ? new Uint8Array(出力) : null };
    },

    /**
     * この端末を、指紋・顔で開けるようにする（新しく始める端末も、前の合言葉で開いた端末も）。
     * 前の合言葉で開いているときは、その鍵をそのまま包む（中身を作り直さない・消さない）。
     */
    async 指紋で開けるようにする() {
        if (!this.パスキーが使えるか()) throw new Error('この端末・ブラウザでは、指紋・顔が使えません（Safari・Chrome・Edge で開いてください）');
        // 中身があるのに閉じたまま新しい鍵で包むと、前の中身が二度と開けなくなる。先に開いてもらう
        if (!this.開いているか() && Object.keys(this._置き場を読む().中身 || {}).length) {
            throw new Error('この端末の金庫には、前の中身があります。先に、前の決め方で開いてください');
        }
        const 鍵のバイト = this._いまの鍵のバイト();
        const 作った = await navigator.credentials.create({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: { id: location.hostname, name: 'ARELM' },
                user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'ARELM', displayName: 'ARELM' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
                timeout: 120000,
                extensions: { prf: { eval: { first: this._PRFの塩 } } },
            },
        });
        const id = this._b64(作った.rawId);
        let 公開鍵 = null;
        let 方式 = -7;
        try {
            公開鍵 = 作った.response.getPublicKey ? this._b64(作った.response.getPublicKey()) : null;
            方式 = 作った.response.getPublicKeyAlgorithm ? 作った.response.getPublicKeyAlgorithm() : -7;
        } catch { 公開鍵 = null; }
        const 結果 = 作った.getClientExtensionResults ? 作った.getClientExtensionResults() : {};
        let 出力 = 結果 && 結果.prf && 結果.prf.results && 結果.prf.results.first ? new Uint8Array(結果.prf.results.first) : null;
        // 作るときにPRFの答えをくれない端末（Safariなど）は、もう一度だけ本人確認して受け取る
        if (!出力 && 結果 && 結果.prf && 結果.prf.enabled) {
            try { 出力 = (await this._PRFを聞く(id)).出力; } catch { 出力 = null; }
        }

        let 包む鍵;
        let 包み方;
        if (出力) {
            包む鍵 = await this._包む鍵(出力);
            包み方 = 'prf';
        } else {
            包む鍵 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            await this._端末の鍵の箱((箱) => 箱.put(包む鍵, id));
            包み方 = '端末';
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const 包んだ = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, 包む鍵, 鍵のバイト);
        const 置き場 = this._置き場を読む();
        if (!Array.isArray(置き場.塩)) 置き場.塩 = Array.from(crypto.getRandomValues(new Uint8Array(16)));
        置き場.包み = Object.assign({}, 置き場.包み, { [id]: { 包み方, iv: Array.from(iv), data: Array.from(new Uint8Array(包んだ)) } });
        this._置き場を書く(置き場);
        localStorage.setItem(this.パスキーの名, JSON.stringify({ id, 公開鍵, 方式, 包み方, 作った日: new Date().toISOString() }));
        this._鍵を開いておく(鍵のバイト);
        return { ok: true, 包み方 };
    },

    /** 指紋・顔で開ける（本人確認できなければ、開かない） */
    async 指紋で開ける() {
        const 記録 = this.パスキーの記録();
        const 包み = 記録 && this._置き場を読む().包み && this._置き場を読む().包み[記録.id];
        if (!記録 || !包み) throw new Error('この端末は、まだ指紋・顔で開けるようにしていません');
        const { 答え, お題, 出力 } = await this._PRFを聞く(記録.id);
        if (!(await this._答えを確かめる(答え, お題, 記録))) throw new Error('本人確認の答えが正しくありませんでした');
        let 包む鍵;
        if (包み.包み方 === 'prf') {
            if (!出力) throw new Error('この端末では、指紋・顔の秘密を受け取れませんでした（ブラウザを新しくしてください）');
            包む鍵 = await this._包む鍵(出力);
        } else {
            包む鍵 = await this._端末の鍵の箱((箱) => 箱.get(記録.id));
            if (!包む鍵) throw new Error('この端末の鍵が見つかりません（ブラウザのデータを消した場合は、ほかの端末から受け取り直してください）');
        }
        const 開いた = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(包み.iv) }, 包む鍵, new Uint8Array(包み.data));
        this._鍵を開いておく(開いた);
        return { ok: true, 包み方: 包み.包み方 };
    },
};

window.端末の金庫 = 端末の金庫;
if (typeof module !== 'undefined' && module.exports) module.exports = { 端末の金庫 };
