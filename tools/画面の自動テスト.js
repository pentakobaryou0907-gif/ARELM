#!/usr/bin/env node
/**
 * 画面の自動テスト — 主な流れを、実際の画面で押して確かめる。
 *
 *   cd tools && npm install   （初回だけ。puppeteer-core を入れる。Chrome は端末のものを使う）
 *   node tools/画面の自動テスト.js            主な流れだけ（約30秒）
 *   node tools/画面の自動テスト.js --全部押す   全ページの全ボタンも押す（数分）
 *
 * 動いているサーバー（8080）の画面を、空のブラウザで開く。
 * 本物のデータを汚さないよう、サーバーへの書き込み（POST 等）と同期は
 * すべてこのテストの中で答え、サーバーには届けない。外部への通信も止める。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let puppeteer;
try {
    puppeteer = require(require.resolve('puppeteer-core', { paths: [__dirname, path.join(__dirname, '..', 'server')] }));
} catch {
    console.log('－ puppeteer-core が入っていません（cd tools && npm install）');
    process.exit(2);
}

const BASE = process.env.AREGLM_URL || 'http://127.0.0.1:8080';
const CHROME = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/local/bin/google-chrome', '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p));
if (!CHROME) {
    console.log('－ Google Chrome が見つかりません（CHROME_PATH で場所を指定できます）');
    process.exit(2);
}

const 全部押す = process.argv.includes('--全部押す');
// 全部押すときに避けるもの: お金・公開・消す・送る・鍵・外への接続・端末を操るもの
const 押さない = /公開|削除|消す|消去|空に|最新にする|送信|送る|投稿|購入|支払|決済|ログアウト|操る|再起動|止める|初期化|全部|まとめて|解錠|開ける|ログイン|連携|接続|つなぐ|録音|マイク|カメラ|見守り|聞く|話す|読み上げ|待ち受け|Chrome|ブラウザ|画面を見|アップロード|取り込|書き出|取り出|ダウンロード|バックアップ|復元|戻す|印刷|共有|Drive|GitHub|SUZURI|Instagram|TikTok|YouTube|Facebook|Gmail|学習|忘れ|修正|書き換え|コミット|プッシュ|Tailscale|他の端末|入にする|使えるようにする|許す|合言葉/;

const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));
const 結果 = [];
function 確かめる(名, ok, 訳 = '') {
    結果.push({ 名, ok });
    console.log(`  ${ok ? '✓' : '✗'}  ${名}${ok || !訳 ? '' : `（${訳}）`}`);
}

(async () => {
    const 作業場 = fs.mkdtempSync(path.join(os.tmpdir(), 'areglm-ui-'));
    const b = await puppeteer.launch({
        executablePath: CHROME,
        userDataDir: 作業場,
        args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    });
    const pg = await b.newPage();
    await pg.setViewport({ width: 1280, height: 900 });

    const 落ちた = [];
    let いま = '起動';
    pg.on('pageerror', (e) => 落ちた.push(`${いま}: ${e.message} ${(String(e.stack || '').split('\n')[1] || '').trim()}`));
    // 入力に混ぜた onerror="alert('XSS')" が動いたときだけ、メッセージがちょうど XSS の alert になる。
    // 確認の文に入力がそのまま載るだけ（confirm の中の文字）は、スクリプトが動いたわけではない。
    pg.on('dialog', (d) => {
        if (d.type() === 'alert' && d.message() === 'XSS') 落ちた.push(`${いま}: 入力した記号がスクリプトとして動いた`);
        else if (/XSS/.test(d.message())) console.log(`  （${いま}: ${d.type()} に入力がそのまま載りました）`);
        d.dismiss().catch(() => {});
    });
    b.on('targetcreated', async (t) => {
        if (t.type() !== 'page') return;
        const np = await t.page().catch(() => null);
        if (np && np !== pg) np.close().catch(() => {});
    });

    const 書き込み = [];
    await pg.setRequestInterception(true);
    pg.on('request', (r) => {
        const u = r.url();
        if (u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
        if (!u.startsWith(BASE)) return r.abort();
        const 道 = u.slice(BASE.length);
        if (道.startsWith('/api/sync/all')) {
            return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, データ: {} }) });
        }
        if (道.startsWith('/api/') && r.method() !== 'GET') {
            書き込み.push(`${r.method()} ${道.split('?')[0]}`);
            return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        }
        return r.continue();
    });

    try {
        await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (e) {
        console.log(`－ ${BASE} を開けませんでした（サーバーが動いていますか）: ${e.message}`);
        await b.close();
        process.exit(2);
    }
    const 送る = (sel) => pg.evaluate((x) => document.querySelector(x).requestSubmit(), sel);
    const 見えるか = (sel) => pg.evaluate((s) => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none'; }, sel);

    // ---- ログイン ----
    いま = 'ログイン';
    await pg.type('#username', 'admin');
    await pg.type('#password', 'まちがい');
    await pg.keyboard.press('Enter');
    await 待つ(800);
    確かめる('違う合言葉ではログインできない', !(await 見えるか('#main-app')));
    await pg.evaluate(() => { document.getElementById('password').value = ''; });
    await pg.type('#password', 'Admin@2024!');
    await pg.keyboard.press('Enter');
    await 待つ(2000);
    確かめる('正しい合言葉でログインできる', await 見えるか('#main-app'));

    // ---- 商品登録 ----
    いま = '商品登録';
    const SKU = 'TEST-' + Date.now();
    await pg.evaluate(() => switchPage('inventory'));
    await 待つ(800);
    await pg.click('#add-product-btn');
    await 待つ(500);
    await pg.type('#modal-sku', SKU);
    await pg.type('#modal-name', 'テスト商品 <b>太字</b>');
    await pg.type('#modal-price', '3000');
    await pg.type('#modal-quantity', '5');
    await 送る('#product-modal-form');
    await 待つ(1200);
    const 商品 = await pg.evaluate((sku) => JSON.parse(localStorage.getItem('products') || '[]').find((p) => p.sku === sku || p.id === sku), SKU);
    確かめる('商品を登録すると一覧に入る', !!商品 && 商品.price == 3000 && 商品.quantity == 5, JSON.stringify(商品 || null).slice(0, 120));
    確かめる('商品名のタグは画面でただの文字になる', await pg.evaluate(() => {
        const 出た = [...document.querySelectorAll('#inventory-page *')].some((el) => el.children.length === 0 && el.textContent.includes('テスト商品'));
        const 太字になった = [...document.querySelectorAll('#inventory-page b')].some((el) => el.textContent === '太字');
        return 出た && !太字になった;
    }));

    // ---- タスク ----
    いま = 'タスク';
    await pg.evaluate(() => { switchPage('dashboard'); switchHomeTab('today'); });
    await 待つ(800);
    await pg.type('#task-title', 'テストのやること');
    await 送る('#task-form');
    await 待つ(800);
    確かめる('やることを足すと一覧に出る', await pg.evaluate(() => [...document.querySelectorAll('#task-list li')].some((li) => li.textContent.includes('テストのやること'))));

    // ---- 進捗ログ・お金 ----
    いま = '今日の運用';
    await pg.evaluate(() => { switchPage('dashboard'); switchHomeTab('today'); });
    await 待つ(800);
    await pg.type('#progress-where', 'デザイン完成');
    await 送る('#progress-form');
    await 待つ(600);
    確かめる('現在地を残すと「前回の続き」が出る', await pg.evaluate(() => (JSON.parse(localStorage.getItem('areglm_progress_log') || '[]')).some((x) => x.現在地 === 'デザイン完成')));

    // ---- バックアップの復元 ----
    いま = 'バックアップの復元';
    const 前の印 = await pg.evaluate(() => localStorage.getItem('sessionToken'));
    const 前のやること = await pg.evaluate(() => JSON.parse(localStorage.getItem('areglm_tasks') || '[]').length);
    const ファイル = path.join(作業場, 'backup.json');
    fs.writeFileSync(ファイル, JSON.stringify({
        app: 'ARELM', version: 1, exportedAt: new Date().toISOString(),
        data: {
            areglm_tasks: JSON.stringify([{ id: 'restored-task-1', title: '復元したやること', done: false }]),
            sessionToken: 'のっとり',
            areglm_google_client_id: 'のっとり',
        },
    }));
    await pg.evaluate(() => { switchPage('settings'); });
    await 待つ(600);
    const 入口 = await pg.$('#backup-import-file');
    await 入口.uploadFile(ファイル);
    await 待つ(1200);
    const 後 = await pg.evaluate(() => ({
        やること: JSON.parse(localStorage.getItem('areglm_tasks') || '[]'),
        印: localStorage.getItem('sessionToken'),
        google: localStorage.getItem('areglm_google_client_id'),
        状態: document.getElementById('backup-status')?.textContent || '',
    }));
    確かめる('復元すると、無かったやることが足される', 後.やること.some((t) => t.id === 'restored-task-1'), 後.状態);
    確かめる('復元しても、前からあるやることは消えない', 後.やること.length === 前のやること + 1);
    確かめる('復元でログインの印や設定を差し替えられない', 後.印 === 前の印 && 後.google !== 'のっとり');

    // ---- 持ち歩ける控え ----
    いま = '持ち歩ける控え';
    const 控え = await pg.evaluate(() => (typeof 持ち歩ける控えを作る === 'function' ? 持ち歩ける控えを作る() : null));
    確かめる('持ち歩ける控えを作れて、スクリプトを含まない', !!控え?.ok && !/<script/i.test(控え.中身));

    // ---- 全ページ ----
    いま = '全ページ';
    const ページ = await pg.evaluate(() => [...new Set([...document.querySelectorAll('[data-page]')].map((e) => e.dataset.page))]);
    const 長文 = '<img src=x onerror="alert(\'XSS\')">"\'&;' + 'あ'.repeat(2000);
    let 押した = 0;
    for (const name of ページ) {
        const タブ = name === 'dashboard' ? ['today', 'ai', 'note', 'plan', 'config'] : [null];
        for (const tab of タブ) {
            いま = name + (tab ? '/' + tab : '');
            await pg.evaluate((n, t) => { switchPage(n); if (t) switchHomeTab(t); }, name, tab);
            await 待つ(700);
            if (!全部押す) continue;
            await pg.evaluate((文) => {
                const page = document.querySelector('.page.active') || document.body;
                page.querySelectorAll('form').forEach((f) => {
                    if (f.offsetParent === null) return;
                    f.querySelectorAll('input[type="text"],input:not([type]),textarea').forEach((i) => { i.value = 文; });
                    try { f.requestSubmit(); } catch { /* 必須の欄が空のときは送られない */ }
                    f.querySelectorAll('input[type="text"],input:not([type]),textarea').forEach((i) => { i.value = ''; });
                });
            }, 長文);
            await 待つ(500);
            const 一覧 = await pg.evaluate((禁止) => {
                const re = new RegExp(禁止);
                const page = document.querySelector('.page.active') || document.body;
                return [...page.querySelectorAll('button')].filter((x) => x.offsetParent !== null && !x.disabled)
                    .map((x, i) => { x.dataset.uiTest = i; return { i, 名: (x.textContent || x.title || x.id || '').trim().slice(0, 30), id: x.id }; })
                    .filter((x) => x.名 && !re.test(x.名) && !re.test(x.id));
            }, 押さない.source);
            for (const ボ of 一覧.slice(0, 80)) {
                いま = `${name}${tab ? '/' + tab : ''} の「${ボ.名}」`;
                await pg.evaluate((i) => document.querySelector(`[data-ui-test="${i}"]`)?.click(), ボ.i).catch(() => {});
                押した++;
                await 待つ(200);
                await pg.keyboard.press('Escape').catch(() => {});
                await pg.evaluate((n, t) => {
                    document.querySelectorAll('.modal').forEach((m) => { m.style.display = 'none'; m.classList.remove('show'); });
                    if (document.querySelector('.page.active')?.id !== n + '-page') { switchPage(n); if (t) switchHomeTab(t); }
                }, name, tab).catch(() => {});
            }
        }
    }
    確かめる(`全ページを開いて${全部押す ? `ボタンを${押した}個押して` : ''}も、画面のエラーが出ない`, 落ちた.length === 0, 落ちた.slice(0, 5).join(' / '));

    await b.close();
    fs.rmSync(作業場, { recursive: true, force: true });
    const 失敗 = 結果.filter((x) => !x.ok).length;
    console.log(`結果: ${結果.length - 失敗}/${結果.length} 件が期待どおり（サーバーへの書き込み ${書き込み.length}件はテストの中で止めました）`);
    process.exit(失敗 ? 1 : 0);
})().catch((e) => {
    console.log(`✗ テストが途中で止まりました: ${e.message}`);
    process.exit(1);
});
