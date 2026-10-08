/**
 * アプリ本体の控え（Service Worker）の登録
 *
 * 一度入れれば、入れ直さなくても、開くたびに最新へ自動で入れ替わる。
 * Mac が寝ている・落ちているときも、端末の中の控えで画面が開く（中身は sw.js）。
 *
 * 以前は「古い控えが画面を固めてしまう」ため、登録を全部外していた。
 * 今の sw.js は「先にネットワーク、繋がらないときだけ控え」なので、その心配は無い。
 * 古い版(自分を消すだけの sw.js)が残っている端末も、ブラウザが sw.js を取り直して、
 * 自動でこの版に入れ替わる。
 *
 * 安全な接続（https か localhost）でしか、ブラウザは Service Worker を許さない。
 * http://192.168.x.x のような接続では登録されず、これまで通り、Macが起きているときだけ開ける。
 */
(function registerShellWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('./sw.js', { scope: './', updateViaCache: 'none' })
            .then((reg) => {
                // 開いたまま長く置かれても、ときどき新しい版を探す
                setInterval(() => { reg.update().catch(() => {}); }, 30 * 60 * 1000);
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') reg.update().catch(() => {});
                });
            })
            .catch(() => { /* 登録できなくても、本体の動作は妨げない */ });
    });
})();
