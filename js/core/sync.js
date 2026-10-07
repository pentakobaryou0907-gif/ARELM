/**
 * 端末同士のデータ連携
 *
 * なぜ要るのか:
 *   タスク・商品・売上などの中身は、これまでこの端末のブラウザの中
 *   （localStorage）にしか無かった。他の端末（iPad・別のPC）から
 *   Tailscale・LAN経由で開けるようにしても、そこで入れたデータは
 *   元の端末には届かず、逆も同じだった。同じものを見ているようで
 *   実は端末ごとに別々のデータを持っていただけ、という状態だった。
 *
 * 正はサーバー:
 *   サーバー（全端末で共通のこの1台）にあるものが正で、端末側は写し。
 *   iPhone・iPad の Safari は、7日使わないとブラウザ内のデータを消すことがある。
 *   消えても、次に開いたときサーバーから全部戻す。
 *
 * やっていること:
 *   1. 起動時、まだ送れていない変更があれば先に送ってまとめてもらい、
 *      それ以外はサーバーの版を取り込む。
 *   2. 以後、この端末でlocalStorageに書き込むたびに、
 *      「どの版を元に直したか（baseRev）」を添えてサーバーへ送る。
 *      サーバーは、ほかの端末の変更と id ごとにまとめて返す
 *      （server/同期のまとめ.js）。前は後から書いた一覧で丸ごと
 *      上書きしていて、Mac と iPad で別々に直すと片方が消えていた。
 *   3. 送れなかった変更は「まだ送れていない」印を残し、
 *      繋がり直したとき・30秒ごとに送り直す。前は次に同じ項目へ
 *      書き込むまで送られず、そのまま再読み込みすると変更が残らなかった。
 *
 * 他のjsファイルは何も変えなくてよい
 * （みんな localStorage.getItem/setItem をそのまま使い続けられる）。
 *
 * 対象外（端末ごとに別であるべきもの）:
 *   ・ログイン中の印（sessionToken・sessionExpiry・username・
 *     areglm_secure_session）
 *   ・暗号化して保存しているAPIキー等（areglm_encrypted_secrets）
 *     → 鍵は各端末ごとに、その端末の設定画面から入れてもらう決まりのまま
 *   ・この仕組み自身が使う記録（下のKEY）
 */

const AReGLM_SYNC = {
    META_KEY: 'areglm_sync_meta',

    除外キー: new Set([
        'sessionToken', 'sessionExpiry', 'username',
        'areglm_secure_session', 'areglm_encrypted_secrets',
        'areglm_sync_meta',
    ]),

    _送信待ち: {},
    _送っている: {},
    最後の様子: null,

    _入れてよいか(key) {
        return !this.除外キー.has(key);
    },

    /** 起動時、まだ送れていない変更を送り、サーバーの最新値をこの端末へ取り込む */
    async 起動時に取り込む() {
        if (window.AReGLM_物置) await AReGLM_物置.読み込む();

        let 応答;
        try {
            const r = await fetch('/api/sync/all', { cache: 'no-store' });
            if (!r.ok) return;
            応答 = await r.json();
        } catch {
            // サーバーに繋がらなくても、この端末に元々あるデータだけで動く。
            return;
        }

        const データ = (応答 && 応答.データ) || {};
        const 記録 = this._メタを読む();
        const この端末は空だったか = Object.keys(記録).length === 0;
        let 戻した数 = 0;
        const 先に送る = [];

        Object.entries(データ).forEach(([key, entry]) => {
            if (!this._入れてよいか(key)) return;
            if (!entry || typeof entry.value !== 'string') return;
            const 自分 = 記録[key];
            const 手元 = localStorage.getItem(key);

            if (自分 && 自分.まだ) {
                先に送る.push(key);
                return;
            }
            if (自分 && 自分.rev === entry.rev && 手元 !== null) return;
            if (手元 !== null && 手元 !== entry.value && (!自分 || typeof 自分.rev !== 'number')) {
                // この端末にだけあった中身（同期の記録が無い・版の番号を付ける前の記録）。上書きせず、
                // 元の版が分からないものとして送り、足し合わせてもらう。
                先に送る.push(key);
                return;
            }
            try {
                // setItem を横取りする前の実装に直接書く
                // （取り込んだ直後に、同じ内容をサーバーへ送り返さないため）。
                原本のsetItem.call(localStorage, key, entry.value);
                if (手元 === null) 戻した数 += 1;
                記録[key] = { rev: entry.rev };
            } catch {
                // 1件失敗しても他の項目は続ける。
            }
        });

        // サーバーにまだ無い、この端末にだけある項目も送っておく（サーバーを正にするため）。
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (this._入れてよいか(k) && !(k in データ) && !先に送る.includes(k)) 先に送る.push(k);
        }
        if (window.AReGLM_物置) {
            AReGLM_物置.置いてある.forEach((_v, k) => {
                if (this._入れてよいか(k) && !(k in データ) && !先に送る.includes(k)) 先に送る.push(k);
            });
        }
        this._メタを書く(記録);

        // ほかの画面が読み始める前に、まとめた結果をこの端末へ戻しておく。
        await Promise.all(先に送る.map((k) => this._実際に送る(k)));

        this.最後の様子 = { 時刻: Date.now(), 戻した数, この端末は空だったか };
        if (この端末は空だったか && 戻した数 > 0) {
            setTimeout(() => {
                if (typeof showNotification === 'function') {
                    showNotification(`この端末にデータが無かったので、サーバーから ${戻した数} 種類を戻しました`, 'info');
                }
            }, 1500);
        }

        this._送り直しを始める();
    },

    _メタを読む() {
        try {
            const 中身 = JSON.parse(原本のgetItem.call(localStorage, this.META_KEY) || '{}');
            // 前の形（項目ごとに時刻の数だけ）は、版の分からない記録として読み替える。
            Object.keys(中身).forEach((k) => {
                if (typeof 中身[k] === 'number') 中身[k] = { rev: null };
            });
            return 中身;
        } catch {
            return {};
        }
    },

    _メタを書く(中身) {
        try { 原本のsetItem.call(localStorage, this.META_KEY, JSON.stringify(中身)); } catch { /* 容量 */ }
    },

    _印を付ける(key, 直す) {
        const meta = this._メタを読む();
        meta[key] = 直す(meta[key] || { rev: null });
        this._メタを書く(meta);
    },

    /** 書き込みを検知して、少し間を置いてからサーバーへ送る */
    _送信を予約する(key) {
        // 再読み込みや電池切れで送る前に止まっても、次に開いたとき送り直せるよう、先に印を付ける。
        this._印を付ける(key, (m) => ({ ...m, まだ: true }));
        clearTimeout(this._送信待ち[key]);
        this._送信待ち[key] = setTimeout(() => this._実際に送る(key), 900);
    },

    async _実際に送る(key) {
        delete this._送信待ち[key];
        if (this._送っている[key]) {
            // 前の送信の返事を待ってから送る（元にした版を正しく添えるため）。
            this._送っている[key].then(() => this._送信を予約する(key));
            return;
        }
        const 中身 = localStorage.getItem(key);
        if (中身 === null) return;
        const 元の版 = (this._メタを読む()[key] || {}).rev;

        let 済んだ;
        this._送っている[key] = new Promise((r) => { 済んだ = r; });
        try {
            const r = await fetch('/api/sync/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: 中身, baseRev: typeof 元の版 === 'number' ? 元の版 : null }),
            });
            if (!r.ok) return;
            const 返事 = await r.json();
            const 今の中身 = localStorage.getItem(key);

            if (今の中身 === 中身) {
                if (typeof 返事.value === 'string') {
                    原本のsetItem.call(localStorage, key, 返事.value);
                    this._まとめたと知らせる(key);
                }
                this._印を付ける(key, () => ({ rev: 返事.rev }));
            } else {
                // 送っている間にまた書き換わった。新しい中身はまだ送っていない。
                // まとめ直しがあったときは、新しい中身はまとめる前の版を元にしているので、
                // 元の版を進めない（進めると、ほかの端末で足したものを「外した」と見てしまう）。
                this._印を付ける(key, (m) => ({
                    rev: typeof 返事.value === 'string' ? m.rev : 返事.rev,
                    まだ: true,
                }));
            }
        } catch {
            // 送れなくても、この端末には既に書き込み済み。「まだ」の印が残るので後で送り直す。
        } finally {
            delete this._送っている[key];
            済んだ();
        }
    },

    _まとめたと知らせる(key) {
        window.dispatchEvent(new CustomEvent('areglm-sync-merged', { detail: { key } }));
        // 開いている画面の一覧を、まとめた中身で描き直す。
        clearTimeout(this._描き直し待ち);
        this._描き直し待ち = setTimeout(() => {
            if (typeof loadDashboardData === 'function') try { loadDashboardData(); } catch { /* 画面側の都合 */ }
            if (typeof renderTaskList === 'function') try { renderTaskList(); } catch { /* 画面側の都合 */ }
        }, 300);
    },

    まだ送れていない数() {
        const meta = this._メタを読む();
        return Object.keys(meta).filter((k) => meta[k] && meta[k].まだ).length;
    },

    送り直す() {
        const meta = this._メタを読む();
        Object.keys(meta).forEach((k) => {
            if (meta[k] && meta[k].まだ && !this._送っている[k] && !this._送信待ち[k]) this._実際に送る(k);
        });
    },

    _送り直しを始める() {
        if (this._送り直しの時計) return;
        this._送り直しの時計 = setInterval(() => this.送り直す(), 30000);
        window.addEventListener('online', () => this.送り直す());
    },
};

// setItem を横取りする前の実装を控えておく
// （横取りした後の自分自身を呼んでしまう無限ループを避けるため）。
// 大きい物置.js が先に読まれていれば、その中身（大きい項目は IndexedDB へ）を通る。
const 原本のsetItem = Storage.prototype.setItem;
const 原本のgetItem = Storage.prototype.getItem;

Storage.prototype.setItem = function (key, value) {
    原本のsetItem.call(this, key, value);
    if (this === window.localStorage && AReGLM_SYNC._入れてよいか(key)) {
        AReGLM_SYNC._送信を予約する(key);
    }
};

window.AReGLM_SYNC = AReGLM_SYNC;
