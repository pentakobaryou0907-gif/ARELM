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
 * やっていること:
 *   1. 起動時、サーバー（全端末で共通のこの1台）から最新の値を
 *      取り込み、この端末のlocalStorageへ反映する（自分の方が新しければ、
 *      取り込まない）。
 *   2. 以後、この端末でlocalStorageに書き込むたびに、サーバーへも
 *      書き写す（少し間を置いてまとめて送る）。
 *
 * これにより、他のjsファイルは何も変えなくてよい
 * （みんな localStorage.getItem/setItem をそのまま使い続けられる）。
 *
 * 対象外（端末ごとに別であるべきもの）:
 *   ・ログイン中の印（sessionToken・sessionExpiry・username・
 *     areglm_secure_session）
 *   ・暗号化して保存しているAPIキー等（areglm_encrypted_secrets）
 *     → 鍵は各端末ごとに、その端末の設定画面から入れてもらう決まりのまま
 *   ・この仕組み自身が使う記録（下のKEY）
 *
 * サーバーへ届かない間（オフライン・サーバー停止中）も、
 * この端末の中には書き込み済みなので、その場では困らない。
 * 次に繋がったとき、また書き込みが起きたタイミングで送り直される
 * （繋がっていない間の変更を後から必ず送り直す仕組みまでは持たない。
 * 複雑にするほど、無言でデータが消える事故が起きやすいため、
 * あえて単純にしてある）。
 */

const AReGLM_SYNC = {
    META_KEY: 'areglm_sync_meta',

    除外キー: new Set([
        'sessionToken', 'sessionExpiry', 'username',
        'areglm_secure_session', 'areglm_encrypted_secrets',
        'areglm_sync_meta',
    ]),

    _送信待ち: {},

    /** 起動時、サーバーの最新値をこの端末へ取り込む */
    async 起動時に取り込む() {
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
        const 自分の記録 = this._メタを読む();

        Object.entries(データ).forEach(([key, entry]) => {
            if (this.除外キー.has(key)) return;
            if (!entry || typeof entry.updatedAt !== 'number') return;

            const 自分の時刻 = 自分の記録[key] || 0;
            // 同じかそれより新しければ取り込む。
            // 自分の方が新しい（まだサーバーへ送信できていない変更が
            // この端末にある）場合は、サーバーの古い値で上書きしない。
            if (entry.updatedAt >= 自分の時刻) {
                try {
                    if (typeof entry.value === 'string') {
                        // setItem を横取りする前の、素のlocalStorageに直接書く
                        // （横取りしたsetItemを通すと、取り込んだ直後に
                        // また同じ内容をサーバーへ送り返すだけの無駄が起きる）。
                        原本のsetItem.call(localStorage, key, entry.value);
                    }
                    自分の記録[key] = entry.updatedAt;
                } catch {
                    // 容量超過等。1件失敗しても他の項目は続ける。
                }
            }
        });

        this._メタを書く(自分の記録);
    },

    _メタを読む() {
        try {
            return JSON.parse(原本のgetItem.call(localStorage, this.META_KEY) || '{}');
        } catch {
            return {};
        }
    },

    _メタを書く(中身) {
        原本のsetItem.call(localStorage, this.META_KEY, JSON.stringify(中身));
    },

    /** 書き込みを検知して、少し間を置いてからサーバーへ送る */
    _送信を予約する(key, value) {
        clearTimeout(this._送信待ち[key]);
        this._送信待ち[key] = setTimeout(() => this._実際に送る(key, value), 900);
    },

    async _実際に送る(key, value) {
        const 時刻 = Date.now();
        try {
            const r = await fetch('/api/sync/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value, updatedAt: 時刻 }),
            });
            if (!r.ok) return;
            const meta = this._メタを読む();
            meta[key] = 時刻;
            this._メタを書く(meta);
        } catch {
            // 送れなくても、この端末には既に書き込み済み。
            // 次にこのキーへ書き込みが起きたときに、また送信を試みる。
        }
    },
};

// setItem を横取りする前の、素のままの実装を控えておく
// （横取りした後の自分自身を呼んでしまう無限ループを避けるため）。
const 原本のsetItem = Storage.prototype.setItem;
const 原本のgetItem = Storage.prototype.getItem;

Storage.prototype.setItem = function (key, value) {
    原本のsetItem.call(this, key, value);
    if (this === window.localStorage && !AReGLM_SYNC.除外キー.has(key)) {
        AReGLM_SYNC._送信を予約する(key, value);
    }
};

window.AReGLM_SYNC = AReGLM_SYNC;
