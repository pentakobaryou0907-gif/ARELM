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
};

window.端末の金庫 = 端末の金庫;
