/**
 * ARELM のアプリ本体を、端末の中に控えておく Service Worker
 *
 * 目的:
 *   ・一度入れたら、入れ直さなくても、開くたびに最新へ自動で入れ替わる
 *   ・Mac が寝ている・落ちているときも、端末の中の控えで画面が開く
 *
 * 経緯（同じ失敗を繰り返さないため）:
 *   以前の版は「まず控えを返す」作りで、直したのに画面が変わらなくなり、
 *   いったん仕組みごと取り除いた。今回は逆にしてある。
 *     ・必ず「先にネットワーク」から取り、取れたら控えを新しく書き換える
 *     ・控えを返すのは、繋がらない・遅すぎるときだけ
 *   だから、Mac が起きていれば、常に最新の画面になる。
 *
 * 控えないもの:
 *   ・/api/ （データ・ログイン・AI）。古い答えを返すと、間違った状態に見えるため
 *   ・合言葉の画面や、別の場所へ飛ばされた応答（門番の画面を ARELM として控えない）
 */

const 控えの名前 = 'arelm-shell-v1';
const 待つ時間 = 1500;   // この間に答えが無ければ、先に控えを出して開く（取得は裏で続けて、控えを最新にする。触ってすぐ開くため短くしてある）

// 最初に必ず控えるもの。残りは、開いたときに自動で控える。
const 最初の控え = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const 箱 = await caches.open(控えの名前);
        // 画面が読み込む script / css を、index.html から拾って控える（Macが無くても全部開くため）
        try {
            const r = await fetch('./index.html', { cache: 'no-store' });
            if (r.ok && !r.redirected) {
                const 本文 = await r.clone().text();
                if (本文.includes('id="main-app"')) {
                    await 箱.put('./index.html', r);
                    const 一覧 = [...本文.matchAll(/(?:src|href)="([^"#]+\.(?:js|css|json|png|woff2?|ico))(?:\?[^"]*)?"/g)]
                        .map((m) => m[1])
                        .filter((u) => !/^(?:[a-z]+:)?\/\//i.test(u));
                    // 1件の失敗で全体を止めない（足りない分は、開いたときに足される）
                    await Promise.all([...new Set(一覧)].map(async (u) => {
                        try {
                            const x = await fetch(u, { cache: 'no-store' });
                            if (控えてよい(x)) await 箱.put(new URL(u, self.registration.scope).href, x);
                        } catch { /* 無視 */ }
                    }));
                }
            }
        } catch { /* 繋がらないときは、開いたときに控える */ }
        await Promise.all(最初の控え.map(async (u) => {
            try { const x = await fetch(u, { cache: 'no-store' }); if (控えてよい(x)) await 箱.put(u, x); } catch { /* 無視 */ }
        }));
        // 待たずに、すぐ新しい中身へ入れ替える
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // 古い名前の控えは消す（今の名前のものだけ残す）
        const 名前たち = await caches.keys();
        await Promise.all(名前たち.filter((k) => k !== 控えの名前).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

function 控えてよい(res) {
    // 失敗・別の場所へ飛ばされた応答（門番の画面など）・他サイトの応答は控えない
    return !!res && res.ok && !res.redirected && res.type === 'basic';
}

async function ネットワーク優先(req) {
    const 箱 = await caches.open(控えの名前);
    // 画面(index.html)のURLは、?以降がどう変わっても同じ控えを使う
    const 鍵 = req.mode === 'navigate' ? './index.html' : req;

    const 取る = fetch(req, { cache: 'no-store' }).then(async (res) => {
        if (控えてよい(res)) {
            if (req.mode === 'navigate') {
                // 画面のHTMLは、中身が ARELM のものか確かめてから控える
                const 本文 = await res.clone().text();
                if (本文.includes('id="main-app"')) await 箱.put(鍵, res.clone());
            } else {
                await 箱.put(鍵, res.clone());
            }
        }
        return res;
    });

    let タイマー;
    const 時間切れ = new Promise((resolve) => { タイマー = setTimeout(() => resolve(null), 待つ時間); });
    try {
        const 結果 = await Promise.race([取る, 時間切れ]);
        clearTimeout(タイマー);
        if (結果) return 結果;
        // 遅すぎる: 控えがあれば先に出す。取得は裏で続き、控えを新しくする
        const あった = await 箱.match(鍵, { ignoreSearch: req.mode !== 'navigate' });
        if (あった) { 取る.catch(() => {}); return あった; }
        return await 取る;
    } catch (e) {
        clearTimeout(タイマー);
        const あった = await 箱.match(鍵, { ignoreSearch: req.mode !== 'navigate' });
        if (あった) return あった;
        throw e;
    }
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;           // 他サイトへの通信には関与しない
    // データ・ログイン・AIは、いつも本物に聞く（公開先のサブフォルダでも効くよう、場所は控えの範囲から決める）
    if (url.pathname.startsWith(new URL('api/', self.registration.scope).pathname)) return;
    if (url.pathname === new URL('sw.js', self.registration.scope).pathname) return;                      // 自分自身は、ブラウザが取り直す
    if (req.headers.has('range')) return;                       // 動画などの部分取得は任せる
    event.respondWith(ネットワーク優先(req));
});
