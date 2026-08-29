/**
 * 古いキャッシュの掃除
 *
 * 以前のバージョンが Service Worker を登録しており、
 * それがブラウザに残って index.html と CSS を古いまま返していた。
 * コードから登録処理を消しても、ブラウザ側の登録は残り続ける。
 *
 * このツールはこの端末のサーバーが動いていることが前提なので、
 * オフライン用のキャッシュは不要。残っているものを確実に取り除き、
 * 「直したのに画面が変わらない」が起きないようにする。
 *
 * 他のスクリプトより先に走らせる（index.html の先頭で読み込む）。
 */
(function cleanStaleCaches() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
            if (!regs.length) return null;

            // 登録されているものをすべて解除する
            return Promise.all(regs.map((r) => r.unregister())).then(() => {
                // キャッシュ本体も消す
                if (!('caches' in window)) return null;
                return caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
            }).then(() => {
                console.log('[AReGLM] 古いキャッシュを消しました。最新の画面を読み込みます。');
                // 消した直後の表示は古いままなので、一度だけ読み直す。
                // 無限に繰り返さないよう、印を付けてから再読み込みする。
                if (!sessionStorage.getItem('areglm_cache_cleared')) {
                    sessionStorage.setItem('areglm_cache_cleared', '1');
                    location.reload();
                }
            });
        })
        .catch(() => {
            /* 掃除に失敗しても本体の動作は妨げない */
        });
})();
