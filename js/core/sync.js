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
        // 指紋/Face IDの登録は端末ごとに別物。他の端末へ渡すと照合に失敗する。
        'areglm_passkey_id',
        'areglm_passkey_offer_later',
        'areglm_a2hs_dismissed',
        // この端末だけの識別子（同期すると、端末の区別がつかなくなる）
        'areglm_device_id',
        // 朝の報告を、この端末で見たか（端末ごと。同期すると、別の端末で見ただけで、こちらの通知が消える）
        'areglm_night_seen',
    ]),

    _送信待ち: {},
    _待ちの中身: {},
    控えの接頭辞: 'areglm_sync_backup_',

    _同期の対象か(key) {
        return !!key && !this.除外キー.has(key) && !key.startsWith(this.控えの接頭辞);
    },

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
            if (!this._同期の対象か(key)) return;
            if (!entry || typeof entry.updatedAt !== 'number') return;

            const 自分の時刻 = 自分の記録[key] || 0;
            // 同じかそれより新しければ取り込む。
            // 自分の方が新しい（まだサーバーへ送信できていない変更が
            // この端末にある）場合は、サーバーの古い値で上書きしない。
            if (entry.updatedAt >= 自分の時刻) {
                try {
                    if (typeof entry.value === 'string') {
                        // この端末で一度も同期していない項目に、この端末固有の値が
                        // 既にあるときは、上書きする前に控えを残す
                        // （サーバー側の値の方が、必ず正しいとは限らないため）。
                        const 今の値 = 原本のgetItem.call(localStorage, key);
                        if (!自分の記録[key] && 今の値 != null && 今の値 !== entry.value) {
                            原本のsetItem.call(localStorage, this.控えの接頭辞 + key, 今の値);
                        }
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

        // 導入前から端末にあったデータを、サーバーへも送っておく。
        //
        // このsync機能を入れる前から、この端末のlocalStorageには
        // 商品・在庫などのデータが既にあった。仕組み上、setItemが
        // 呼ばれたときだけサーバーへ送るので、そういう「元々あった」
        // データは、ユーザーが改めて保存し直すまでサーバー側に
        // 一度も現れない（＝他の端末からは永遠に見えない）。
        //
        // どちらが新しいか判断できないので、サーバーにまだ一件も
        // 無いキーに限って送る（サーバー側を上書きする事故を避ける）。
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!this._同期の対象か(key)) continue;
                if (データ[key]) continue; // サーバーに既にある → 触らない
                const value = 原本のgetItem.call(localStorage, key);
                if (typeof value === 'string') this._送信を予約する(key, value);
            }
        } catch {
            // 一部の環境でlocalStorage.lengthが使えなくても、他の起動処理は続ける。
        }
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
        this._待ちの中身[key] = value;
        this._送信待ち[key] = setTimeout(() => {
            delete this._待ちの中身[key];
            this._実際に送る(key, value);
        }, 900);
    },

    /** 予約中のものを今すぐ送る（画面を移る前などに使う） */
    async 今すぐ送る() {
        const 残り = Object.entries(this._待ちの中身);
        残り.forEach(([key]) => { clearTimeout(this._送信待ち[key]); });
        this._待ちの中身 = {};
        await Promise.all(残り.map(([key, value]) => this._実際に送る(key, value)));
    },

    /** この端末の同期対象が、すべてサーバーにあるか（無ければ、無いキーの一覧を返す） */
    async サーバーに無いもの() {
        let 応答;
        try {
            応答 = await fetch('/api/sync/all', { cache: 'no-store' }).then((r) => r.json());
        } catch {
            return ['(サーバーに繋がりません)'];
        }
        const サーバー側 = (応答 && 応答.データ) || {};
        const 無い = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (this._同期の対象か(key) && !サーバー側[key]) 無い.push(key);
        }
        return 無い;
    },

    /**
     * 127.0.0.1 で開かれたら、localhost へ移る。
     *
     * 指紋・Face ID（パスキー）は、IPアドレスのサイトでは使えず、
     * localhost なら使える。ただ、ブラウザのデータは「アドレスごと」に
     * 別々なので、移るとそれまでのデータが見えなくなる。
     * そこで、この端末のデータが全部サーバーに届いたことを確かめてから移る
     * （移った先は、起動時にサーバーから取り込む）。
     * 一つでも届いていなければ移らない（データを見失わないため）。
     */
    async localhostへ移る() {
        if (location.hostname !== '127.0.0.1') return;
        if (sessionStorage.getItem('areglm_no_localhost_move') === '1') return;
        try {
            await this.今すぐ送る();
            const 無い = await this.サーバーに無いもの();
            if (無い.length) {
                console.warn('[同期] サーバーに届いていない項目があるため、localhostへは移りません:', 無い);
                sessionStorage.setItem('areglm_no_localhost_move', '1');
                return;
            }
            location.replace(`http://localhost:${location.port}${location.pathname}${location.search}${location.hash}`);
        } catch (e) {
            console.warn('[同期] localhostへ移れませんでした:', e);
        }
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
    if (this === window.localStorage && AReGLM_SYNC._同期の対象か(key)) {
        AReGLM_SYNC._送信を予約する(key, value);
    }
};

window.AReGLM_SYNC = AReGLM_SYNC;
