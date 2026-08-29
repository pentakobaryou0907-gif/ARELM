/**
 * 自分自身を取り除く Service Worker
 *
 * 経緯:
 *   以前のバージョンが Service Worker を登録しており、
 *   それが index.html と CSS をキャッシュから返し続けていた。
 *   その結果、コードを直しても画面に反映されず、
 *   さらに古い index.html には修復用のコードが入っていないため、
 *   ブラウザ側だけでは直せない状態になっていた。
 *
 * ここでの役割:
 *   ブラウザは Service Worker のファイルを定期的に取り直す。
 *   そのとき、この「自分を消す」中身に置き換わり、
 *   キャッシュをすべて削除して登録を解除する。
 *   開いているページも読み直して、最新の状態に戻す。
 *
 * このツールはこの端末のサーバーが動いていることが前提なので、
 * オフライン用のキャッシュは不要。今後は登録しない。
 */

self.addEventListener('install', () => {
    // 待たずにすぐ新しい（この）中身へ入れ替える
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // 溜まっているキャッシュをすべて消す
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));

            // 自分の登録を解除する
            await self.registration.unregister();

            // 開いているページを最新の内容で読み直す
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach((client) => client.navigate(client.url));
        })()
    );
});

// 取り込みには一切関与しない。必ずネットワークから取らせる。
self.addEventListener('fetch', () => {});
