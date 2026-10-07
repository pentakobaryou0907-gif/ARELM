/**
 * 大きいデータの置き場と、ブラウザの容量の見張り
 *
 * localStorage は iPhone・iPad の Safari で 1 サイトあたり約5MB まで。
 * 商品・記録・進捗が増えると、ある日から保存できなくなり、
 * 書いたつもりのものが黙って残らなかった（setItem が例外を投げて止まる）。
 *
 * ここでは:
 *   ・大きい項目（1つで 256KB を超えるもの）と、容量が足りずに
 *     入らなかった項目は、IndexedDB（ずっと大きく入る）へ移す。
 *     読むときは localStorage.getItem のままで読める（ほかの js は変えない）。
 *   ・使っている量が 8割を超えたら、画面に知らせる。
 *
 * どちらのブラウザ内の置き場も、端末側の控えにすぎない。
 * 正はサーバー（js/core/sync.js）にあり、消えても次に開くとき戻る。
 */
const AReGLM_物置 = {
    DB名: 'ARELM',
    棚名: '大きい項目',
    // Safari は文字数ではなくバイトで数えるので、1文字2バイトとして見積もる。
    上限バイト: 5 * 1024 * 1024,
    大きい境目: 256 * 1024,
    知らせる割合: 0.8,

    置いてある: new Map(),
    _db: null,
    _知らせた: false,

    _開く() {
        if (this._db) return Promise.resolve(this._db);
        return new Promise((ok, ng) => {
            if (!window.indexedDB) return ng(new Error('IndexedDB が使えません'));
            const 頼み = indexedDB.open(this.DB名, 1);
            頼み.onupgradeneeded = () => 頼み.result.createObjectStore(this.棚名);
            頼み.onsuccess = () => { this._db = 頼み.result; ok(this._db); };
            頼み.onerror = () => ng(頼み.error);
        });
    },

    async _棚(書く) {
        const db = await this._開く();
        return db.transaction(this.棚名, 書く ? 'readwrite' : 'readonly').objectStore(this.棚名);
    },

    /** 起動時に一度だけ。ほかの js が読み始める前に、IndexedDB の中身を手元へ出す */
    async 読み込む() {
        try {
            const 棚 = await this._棚(false);
            await new Promise((ok) => {
                const 鍵の頼み = 棚.getAllKeys();
                const 値の頼み = 棚.getAll();
                値の頼み.onsuccess = () => {
                    鍵の頼み.result.forEach((k, i) => this.置いてある.set(k, 値の頼み.result[i]));
                    ok();
                };
                値の頼み.onerror = () => ok();
            });
            // 前から localStorage にある大きい項目も移して、空きを作る。
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                const v = 原本の読み.call(localStorage, k) || '';
                if (!this.置いてある.has(k) && v.length * 2 > this.大きい境目) 物置へ移す(k, v);
            }
        } catch {
            // IndexedDB が使えない（プライベートブラウズ等）。localStorage だけで動く。
        }
        if (navigator.storage && navigator.storage.persist) {
            // 許されれば、ブラウザが容量の都合で勝手に消す対象から外れる。
            navigator.storage.persist().catch(() => {});
        }
    },

    async _しまう(key, value) {
        const 棚 = await this._棚(true);
        await new Promise((ok, ng) => {
            const r = 棚.put(value, key);
            r.onsuccess = ok; r.onerror = () => ng(r.error);
        });
    },

    async _出す(key) {
        try {
            const 棚 = await this._棚(true);
            棚.delete(key);
        } catch { /* 無ければそれでよい */ }
    },

    /** localStorage に入っている量（バイトの見積もり） */
    使っている量() {
        let 文字数 = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            文字数 += k.length + (原本の読み.call(localStorage, k) || '').length;
        }
        return 文字数 * 2;
    },

    様子() {
        const 量 = this.使っている量();
        let 物置の量 = 0;
        this.置いてある.forEach((v, k) => { 物置の量 += (k.length + v.length) * 2; });
        return {
            量,
            上限: this.上限バイト,
            割合: 量 / this.上限バイト,
            物置の数: this.置いてある.size,
            物置の量,
        };
    },

    容量を見る(急ぎ) {
        // 書くたびに全部を数えると重いので、10秒に1回まで。
        const 今 = Date.now();
        if (!急ぎ && this._見た時 && 今 - this._見た時 < 10000) return null;
        this._見た時 = 今;
        const s = this.様子();
        if (s.割合 >= this.知らせる割合 && !this._知らせた && typeof showNotification === 'function') {
            this._知らせた = true;
            showNotification(
                `ブラウザ内の保存が ${Math.round(s.割合 * 100)}% まで来ています。` +
                '大きいものから順に IndexedDB へ移しています。データはサーバーにも残っています。',
                'warning');
        }
        return s;
    },
};

const 原本の書き = Storage.prototype.setItem;
const 原本の読み = Storage.prototype.getItem;
const 原本の外し = Storage.prototype.removeItem;

function 物置へ移す(key, value) {
    AReGLM_物置.置いてある.set(key, value);
    AReGLM_物置._しまう(key, value)
        // IndexedDB へ書けたのを確かめてから localStorage 側を空ける（先に空けると、
        // 書けなかったときにどちらにも無くなる）。
        .then(() => { if (AReGLM_物置.置いてある.get(key) === value) 原本の外し.call(localStorage, key); })
        .catch(() => { /* この回は手元（この画面の間）とサーバーにだけある */ });
}

Storage.prototype.getItem = function (key) {
    if (this === window.localStorage && AReGLM_物置.置いてある.has(key)) {
        return AReGLM_物置.置いてある.get(key);
    }
    return 原本の読み.call(this, key);
};

Storage.prototype.setItem = function (key, value) {
    if (this !== window.localStorage) return 原本の書き.call(this, key, value);
    const 文字 = String(value);
    if (文字.length * 2 > AReGLM_物置.大きい境目) {
        物置へ移す(key, 文字);
        return;
    }
    try {
        原本の書き.call(this, key, 文字);
        if (AReGLM_物置.置いてある.has(key)) {
            AReGLM_物置.置いてある.delete(key);
            AReGLM_物置._出す(key);
        }
    } catch (e) {
        // 容量が足りない。前はここで例外のまま止まり、書いたものが残らなかった。
        if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
            物置へ移す(key, 文字);
            AReGLM_物置._知らせた = false;
            AReGLM_物置.容量を見る(true);
            return;
        }
        throw e;
    }
    AReGLM_物置.容量を見る();
};

Storage.prototype.removeItem = function (key) {
    if (this === window.localStorage && AReGLM_物置.置いてある.has(key)) {
        AReGLM_物置.置いてある.delete(key);
        AReGLM_物置._出す(key);
    }
    return 原本の外し.call(this, key);
};

window.AReGLM_物置 = AReGLM_物置;
