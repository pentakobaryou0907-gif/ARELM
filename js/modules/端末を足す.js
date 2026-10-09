/**
 * 端末を足す（打たずに、ほかの端末へデータの共有を渡す）
 *
 * 本人の要望（2026-10-09）「合言葉やパスワード、メールアドレスはなしにして、私のデバイスでしか開けないように」。
 * これまで、2台目からは、GitHubの鍵と「同期の合言葉」を、その端末で打ち直す必要があった。
 *
 * やり方（渡す側の画面に、QRを2つ順に出す）:
 *   ① 公開先の住所だけのQR（秘密は入っていない）。新しい端末のカメラで読んで、ARELMを開く
 *   ② データの鍵のQR。新しい端末の、ARELMの画面の「QRを読む」で読む（カメラのアプリでは読まない）
 *   Macへは、②の「文字をコピー」で写して、Macの欄に貼る。
 *
 * 前は、鍵の入った住所（公開先＋#arelm-receive=…）をQRにしていた。カメラで読むとブラウザがその住所を開くので、
 * 鍵が閲覧履歴に残り、履歴の同期（Google・iCloud）で外へ出うる。画面の中で読めば、住所には一度も入らない。
 * 受け取るときは、必ず「GitHubの誰の・どの倉庫か」を出して、本人に確かめてもらう（よそのQR・リンクで、
 * 知らない倉庫へデータを送らないため）。前の設定は消さず、金庫の「前の_…」へ移す。うまくいかなければ元に戻す。
 * 外へは送らない（GitHubへの確かめは、関所の「本人が選んだ置き場」だけ）。
 */

// 英数字だけにする（日本語にすると、ブラウザが住所の # の後ろを %E5… の形に変え、受け取る側で見つけられなかった）
const 受け取りの印 = '#arelm-receive=';      // 前の形（住所の # の後ろ）。貼られたときと、開かれたときだけ読む
const 受け取りの頭 = 'arelm-receive:';       // いまの形（QR・コピーする文字）
const 受け取り待ちの名 = 'areglm_receive_wait';   // sessionStorage（このタブの間だけ）
const 渡す期限の分 = 10;

function 端末を足すの文字(バイト) {
    let s = '';
    new Uint8Array(バイト).forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function 受け取りの中身を包む(包み, いま, 控え) {
    const 中身 = { v: 1, github: String(包み.github || ''), 倉庫: String(包み.倉庫 || 'ARELM-data'), 同期: String(包み.同期 || '') };
    // 控え（復旧用）は期限を付けない。受け取りの期限は「受け取れる間」で、渡した鍵そのものを使えなくするものではない
    if (控え) 中身.控え = 1;
    else 中身.期限 = いま + 渡す期限の分 * 60000;
    if (包み.gemini) 中身.gemini = String(包み.gemini);
    return 端末を足すの文字(new TextEncoder().encode(JSON.stringify(中身)));
}

/** 渡す中身から、QR・コピー用の文字を作る（arelm-receive:…）。住所ではないので、開かれない */
function 受け取りの文字を作る(包み, いま = Date.now(), 控え = false) {
    return 受け取りの頭 + 受け取りの中身を包む(包み, いま, 控え);
}

/** 前の形（公開先の住所＋#arelm-receive=…）。試験と、前の形を貼られたときの読み取りのためだけに残す */
function 受け取りの住所を作る(包み, いま = Date.now()) {
    const 元 = (typeof 公開先の住所 === 'string' && 公開先の住所) || (location.origin + location.pathname);
    return 元 + 受け取りの印 + 受け取りの中身を包む(包み, いま, false);
}

/** 受け取りの文字（arelm-receive:… か、前の形の住所）を読む。形が違えば null */
function 受け取りの中身を読む(文字, いま = Date.now()) {
    const s = String(文字 || '').trim();
    let 本体 = s;
    const i = s.indexOf(受け取りの印);
    const j = s.indexOf(受け取りの頭);
    if (i >= 0) 本体 = s.slice(i + 受け取りの印.length);
    else if (j >= 0) 本体 = s.slice(j + 受け取りの頭.length);
    if (!/^[A-Za-z0-9_-]{20,4000}$/.test(本体)) return null;
    try {
        const 戻す = atob(本体.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((本体.length + 3) % 4));
        const x = JSON.parse(new TextDecoder().decode(Uint8Array.from(戻す, (c) => c.charCodeAt(0))));
        if (!x || x.v !== 1 || typeof x.github !== 'string' || typeof x.同期 !== 'string' || typeof x.倉庫 !== 'string') return null;
        if (!/^[A-Za-z0-9_.-]+$/.test(x.倉庫) || x.同期.length < 8 || !x.github) return null;
        if (x.gemini != null && typeof x.gemini !== 'string') return null;
        if (x.控え === 1) return x;
        if (typeof x.期限 !== 'number' || いま > x.期限) return { 期限切れ: true };
        return x;
    } catch { return null; }
}

function 受け取り待ちを読む() {
    try { return JSON.parse(sessionStorage.getItem(受け取り待ちの名) || 'null'); } catch { return null; }
}

function 受け取り待ちがあるか() {
    return !!受け取り待ちを読む();
}

/** 読んだ・貼った・開いた受け取りを、このタブにだけ置く（指紋・顔で開いたあとに仕上げる） */
function 受け取り待ちを置く(x) {
    try { sessionStorage.setItem(受け取り待ちの名, JSON.stringify(x)); return true; } catch { return false; }
}

/**
 * 開いた端末の金庫へ、受け取った中身を入れ、データの共有を始める（指紋・顔で開いたあとに呼ぶ）。
 *   ・受け取った鍵で、GitHubの誰の鍵かを先に確かめ、「誰の・どの倉庫か」を出して本人に確かめてもらう
 *   ・前の設定（鍵・同期の鍵・倉庫）は消さず、金庫の「前の_…」へ移す
 *   ・つながらなかったら、前の設定に戻す（動いていた共有を止めない）
 *   ・Geminiの「お金がかかる機能」の許可は、ここでは変えない（倉庫から来る本人の選びに任せる）
 * 受け取れたら true。やめた・失敗したら false。
 */
async function 受け取りを仕上げる() {
    const x = 受け取り待ちを読む();
    if (!x || !window.端末の金庫 || !端末の金庫.開いているか()) return false;
    sessionStorage.removeItem(受け取り待ちの名);   // 一度きり
    const 金庫 = 端末の金庫;
    const 前 = {
        設定: localStorage.getItem(外の倉庫.設定の名),
        github: await 金庫.出す('github'),
        同期: await 金庫.出す('同期の合言葉'),
        gemini: await 金庫.出す('gemini'),
        AI: localStorage.getItem(外のAI.設定の名),
    };
    let 前の倉庫 = null;
    try { 前の倉庫 = JSON.parse(前.設定 || 'null'); } catch { 前の倉庫 = null; }
    // 戻すときは、閉じたままの写しを、そのまま置き直す（開けなかった項目を「無いもの」と取り違えて消さない）
    const 写し = 金庫.中身の写し(['github', '同期の合言葉', 'gemini', '前の_github', '前の_同期の合言葉', '前の_gemini', '前の_外の倉庫']);
    const 元に戻す = async () => {
        if (前.設定 != null) localStorage.setItem(外の倉庫.設定の名, 前.設定); else localStorage.removeItem(外の倉庫.設定の名);
        金庫.写しから戻す(写し);
        if (前.AI != null) localStorage.setItem(外のAI.設定の名, 前.AI); else localStorage.removeItem(外のAI.設定の名);
    };
    try {
        // 関所が /user を通せるよう、倉庫の名前だけ先に置く（鍵はまだ金庫へ入れない）
        localStorage.setItem(外の倉庫.設定の名, JSON.stringify({ 持ち主: '', 倉庫: x.倉庫 }));
        const 持ち主 = await 外の倉庫.鍵の持ち主(x.github);
        const 同じ = !!(前の倉庫 && 前の倉庫.持ち主 === 持ち主 && 前の倉庫.倉庫 === x.倉庫);
        const 文 = `GitHub「${持ち主}」の倉庫「${x.倉庫}」のデータを、この端末で使います。\n`
            + '自分のGitHubの名前でなければ、「キャンセル」を押してください（よそのQR・リンクかもしれません）。'
            + (前の倉庫 && 前の倉庫.倉庫 && !同じ ? `\n\nいまの共有（${前の倉庫.持ち主 || '?'}/${前の倉庫.倉庫}）は、控えに移します（消しません）。` : '');
        if (!confirm(文)) {
            await 元に戻す();
            showNotification('受け取りをやめました', 'info');
            return false;
        }
        // 前の値は、消さずに控えへ移す（違うときだけ）
        if (前.github && 前.github !== x.github) await 金庫.入れる('前の_github', 前.github);
        if (前.同期 && 前.同期 !== x.同期) await 金庫.入れる('前の_同期の合言葉', 前.同期);
        if (前.gemini && x.gemini && 前.gemini !== x.gemini) await 金庫.入れる('前の_gemini', 前.gemini);
        if (前.設定 && !同じ) await 金庫.入れる('前の_外の倉庫', 前.設定);

        await 金庫.入れる('github', x.github);
        await 金庫.入れる('同期の合言葉', x.同期);
        // 倉庫が開けるか（同期の鍵が合うか）まで確かめる。だめなら、ここで元に戻る
        await 外の倉庫.準備する(x.倉庫);
        if (x.gemini) {
            await 金庫.入れる('gemini', x.gemini);
            localStorage.setItem(外のAI.設定の名, 'gemini');
        }
    } catch (e) {
        try { await 元に戻す(); } catch { /* 戻せなくても、知らせは出す */ }
        showNotification('受け取れませんでした（前の設定のままです）: ' + e.message, 'error');
        return false;
    }
    showNotification('ほかの端末から受け取りました。データをそろえています…', 'success');
    try {
        const 変わった = await サーバー無しで取り込み直す();
        if (変わった) setTimeout(() => location.reload(), 1200);
    } catch (e) {
        showNotification('受け取りましたが、まだ取り込めていません: ' + e.message, 'error');
    }
    return true;
}

/* ==========================================================
   画面の中でQRを読む（カメラの映像は、この端末の中だけで使う）
   ========================================================== */

function jsQRを読み込む() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return new Promise((ok, ng) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/jsQR.js';
        s.onload = () => (window.jsQR ? ok(window.jsQR) : ng(new Error('QRを読む部品が読み込めませんでした')));
        s.onerror = () => ng(new Error('QRを読む部品が読み込めませんでした'));
        document.head.appendChild(s);
    });
}

/** カメラでQRを読む。読めた文字を 見つけた(文字) に渡す。閉じたら何もしない */
async function QRを読む(見つけた) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showNotification('このブラウザでは、画面の中でカメラが使えません。渡す端末で「文字をコピー」して、下の欄に貼ってください', 'error');
        return;
    }
    const 幕 = document.createElement('div');
    幕.id = 'qr-reader';
    幕.setAttribute('role', 'dialog');
    幕.setAttribute('aria-label', 'QRを読む');
    幕.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px';
    const 映像 = document.createElement('video');
    映像.setAttribute('playsinline', '');
    映像.muted = true;
    映像.style.cssText = 'max-width:min(92vw,480px);max-height:60vh;border-radius:12px;background:#000';
    const 文 = document.createElement('p');
    文.style.cssText = 'color:#fff;margin:0;text-align:center';
    文.textContent = '渡す端末に出ている「② データの鍵のQR」を、枠の中に入れてください';
    const 閉じる = document.createElement('button');
    閉じる.type = 'button';
    閉じる.className = 'btn btn-secondary';
    閉じる.textContent = '閉じる';
    幕.append(映像, 文, 閉じる);
    document.body.appendChild(幕);

    let 流れ = null;
    let 終わった = false;
    const 片付ける = () => {
        終わった = true;
        if (流れ) 流れ.getTracks().forEach((t) => t.stop());
        幕.remove();
    };
    閉じる.addEventListener('click', 片付ける);
    try {
        流れ = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
        片付ける();
        showNotification('カメラを使えませんでした。渡す端末で「文字をコピー」して、下の欄に貼ってください', 'error');
        return;
    }
    if (終わった) { 流れ.getTracks().forEach((t) => t.stop()); return; }
    映像.srcObject = 流れ;
    try { await 映像.play(); } catch { /* 自動再生が止められても、次の映りで読む */ }

    let 探す;
    if ('BarcodeDetector' in window) {
        try {
            const 読み手 = new window.BarcodeDetector({ formats: ['qr_code'] });
            探す = async () => ((await 読み手.detect(映像))[0] || {}).rawValue || null;
        } catch { 探す = null; }
    }
    if (!探す) {
        let jsQR;
        try { jsQR = await jsQRを読み込む(); } catch (e) { 片付ける(); showNotification(e.message, 'error'); return; }
        const 画 = document.createElement('canvas');
        const 筆 = 画.getContext('2d', { willReadFrequently: true });
        探す = async () => {
            const w = 映像.videoWidth;
            const h = 映像.videoHeight;
            if (!w || !h) return null;
            const 縮 = Math.min(1, 720 / Math.max(w, h));
            画.width = Math.round(w * 縮);
            画.height = Math.round(h * 縮);
            筆.drawImage(映像, 0, 0, 画.width, 画.height);
            const 絵 = 筆.getImageData(0, 0, 画.width, 画.height);
            const r = jsQR(絵.data, 絵.width, 絵.height, { inversionAttempts: 'dontInvert' });
            return r ? r.data : null;
        };
    }
    const 回す = async () => {
        if (終わった) return;
        let 文字 = null;
        try { 文字 = await 探す(); } catch { 文字 = null; }
        if (文字 && 受け取りの中身を読む(文字)) {
            片付ける();
            見つけた(文字);
            return;
        }
        if (文字 && /^https?:\/\//.test(文字)) 文.textContent = 'それは①（住所）のQRです。渡す端末で「次へ」を押して、②を出してください';
        setTimeout(回す, 250);
    };
    回す();
}

/**
 * 受け取る欄（QRを読む・貼る）。読めたら、すぐ仕上げる（金庫が開いているとき）か、
 * 受け取り待ちに置いて 置いたら() を呼ぶ（新しい端末で、指紋・顔で始める前）。
 */
function 受け取る欄を描く(箱, 置いたら) {
    const 欄 = document.createElement('div');
    欄.className = 'receive-box';
    const 題 = document.createElement('p');
    題.className = 'hint';
    題.textContent = 'ほかの端末ですでに使っているとき: その端末の設定「☁」→「ほかの端末へ渡す」で出る「② データの鍵のQR」を、ここで読みます。';
    const 読む = document.createElement('button');
    読む.type = 'button';
    読む.className = 'btn btn-secondary';
    読む.textContent = 'QRを読む';
    const 貼る枠 = document.createElement('div');
    貼る枠.className = 'form-group';
    const l = document.createElement('label');
    const 欄id = 'receive-paste-' + Math.random().toString(36).slice(2, 8);
    l.htmlFor = 欄id;
    l.textContent = 'または、コピーした文字を貼る（arelm-receive:…）';
    const 入 = document.createElement('input');
    入.id = 欄id;
    入.type = 'password';
    入.autocomplete = 'off';
    入.spellcheck = false;
    const 受ける = document.createElement('button');
    受ける.type = 'button';
    受ける.className = 'btn btn-sm btn-secondary';
    受ける.textContent = '貼った文字で受け取る';
    貼る枠.append(l, 入, 受ける);

    const 受けた = async (文字) => {
        const x = 受け取りの中身を読む(文字);
        入.value = '';
        if (!x) { showNotification('形が違います。渡す端末で、もう一度コピーしてください', 'error'); return; }
        if (x.期限切れ) { showNotification('受け取りの期限が切れています。渡す端末で、もう一度QRを出してください', 'error'); return; }
        受け取り待ちを置く(x);
        if (window.端末の金庫 && 端末の金庫.開いているか()) { await 受け取りを仕上げる(); return; }
        if (typeof 置いたら === 'function') 置いたら();
    };
    読む.addEventListener('click', () => QRを読む(受けた));
    受ける.addEventListener('click', () => 受けた(入.value));
    // 貼った欄で Enter を押したとき、外の形（「この端末で始める」）を送らない
    入.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); 受けた(入.value); } });
    欄.append(題, 読む, 貼る枠);
    箱.appendChild(欄);
    return 欄;
}

/* ==========================================================
   渡す側（QRを2つ順に出す）
   ========================================================== */

function QRの絵を作る(文字) {
    const 絵 = document.createElement('div');
    絵.style.cssText = 'background:#fff;padding:12px;border-radius:8px;width:fit-content;max-width:100%;margin:8px 0';
    const q = qrcode(0, 'L');
    q.addData(文字);
    q.make();
    // SVGはこの端末の中で組み立てた文字列だけ（外から来た文字は入らない）
    絵.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    const svg = 絵.querySelector('svg');
    if (svg) svg.style.cssText = 'width:min(300px,75vw);height:auto;display:block';
    return 絵;
}

/** コピーした文字を、時間が来たらクリップボードから外す（できる範囲で。画面が前に無いと外せないことがある） */
async function 写しを外す(元の文字) {
    try {
        if (navigator.clipboard.readText) {
            const 今 = await navigator.clipboard.readText();
            if (今 !== 元の文字) return;
        }
        await navigator.clipboard.writeText('');
    } catch { /* 外せなくても、画面からは消える */ }
}

/**
 * 「ほかの端末へ渡す」。中身は 取る() が返す（開いた金庫・Mac本体からだけ取れる）。
 * ①住所のQR → ②データの鍵のQR（2分で画面から消える）。Macへは②の文字をコピーして貼る。
 */
function 渡す欄を描く(箱, 取る) {
    const 欄 = document.createElement('div');
    欄.className = 'login-form';
    const 題 = document.createElement('h4');
    題.textContent = 'ほかの端末へ渡す（打たずに、同じデータにする）';
    const 説明 = document.createElement('p');
    説明.className = 'hint';
    説明.textContent = '新しい端末（iPhone・iPad・Windows・Android）に、2つのQRを順に読ませます。'
        + '②には、データの倉庫の鍵が入っています。自分の端末で読むときだけ出してください。'
        + '2台目の端末かMacへ渡しておくと、この端末を無くしても、ほかの端末で倉庫のデータを開けます（控えになります）。';
    const 出す = document.createElement('button');
    出す.type = 'button';
    出す.className = 'btn btn-secondary';
    出す.textContent = '渡し始める';
    const 控えボタン = document.createElement('button');
    控えボタン.type = 'button';
    控えボタン.className = 'btn btn-sm btn-secondary';
    控えボタン.textContent = '復旧用の控えを出す';
    const 置き場 = document.createElement('div');
    let 消す札 = null;

    const 片付ける = () => { clearInterval(消す札); 置き場.textContent = ''; };
    const 残りを数える = (残り, 秒, 終わり) => {
        clearInterval(消す札);
        残り.textContent = `あと${秒}秒で消えます（画面から消えるだけです。写真に撮らないでください）`;
        消す札 = setInterval(() => {
            秒 -= 1;
            残り.textContent = `あと${秒}秒で消えます（画面から消えるだけです。写真に撮らないでください）`;
            if (秒 <= 0) { 片付ける(); if (終わり) 終わり(); }
        }, 1000);
    };
    const 中身を取る = async () => {
        const 包み = await 取る();
        if (!包み || !包み.github || !包み.同期) { showNotification('まだ、データの共有が始まっていません', 'error'); return null; }
        // Geminiのキーは、この端末で本人が許しているときだけ渡す（受け取る側で許可を勝手に入れないため）
        if (包み.gemini && !(typeof 使ってよいか === 'function' && 使ってよいか('gemini'))) delete 包み.gemini;
        return 包み;
    };
    const 鍵のQRを出す = (包み, 控え) => {
        置き場.textContent = '';
        const 文字 = 受け取りの文字を作る(包み, Date.now(), 控え);
        const 見出し = document.createElement('p');
        見出し.textContent = 控え
            ? '復旧用の控え: この文字を、どの端末の「貼った文字で受け取る」に貼っても受け取れます。紙に書く・印刷するときは、他人に見せないでください。'
            : '② データの鍵のQR: 新しい端末の、ARELMの画面の「QRを読む」で読みます（カメラのアプリでは読まないでください。中身が検索へ送られることがあります）。';
        const コピー = document.createElement('button');
        コピー.type = 'button';
        コピー.className = 'btn btn-sm btn-secondary';
        コピー.textContent = '文字をコピー（Macへ渡すとき）';
        コピー.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(文字);
                コピー.textContent = 'コピーしました（2分後にクリップボードから外します）';
                setTimeout(() => 写しを外す(文字), 120000);
            } catch { コピー.textContent = 'コピーできませんでした'; }
        });
        const 残り = document.createElement('p');
        残り.className = 'hint';
        置き場.append(見出し);
        if (控え) {
            const 文 = document.createElement('code');
            文.style.cssText = 'display:block;word-break:break-all;user-select:all;background:#fff;color:#111;padding:8px;border-radius:6px';
            文.textContent = 文字;
            置き場.append(文);
        } else {
            置き場.append(QRの絵を作る(文字));
        }
        置き場.append(コピー, 残り);
        残りを数える(残り, 120);
    };

    出す.addEventListener('click', async () => {
        出す.disabled = true;
        try {
            const 包み = await 中身を取る();
            if (!包み) return;
            置き場.textContent = '';
            const 住所 = (typeof 公開先の住所 === 'string' && 公開先の住所) || (location.origin + location.pathname);
            const 見出し = document.createElement('p');
            見出し.textContent = '① 新しい端末のカメラで読んで、ARELMを開きます（秘密は入っていません）。開いたら、その画面の「QRを読む」を押してから、「次へ」を押してください。';
            const 次へ = document.createElement('button');
            次へ.type = 'button';
            次へ.className = 'btn btn-primary';
            次へ.textContent = '次へ（② データの鍵のQRを出す）';
            次へ.addEventListener('click', () => 鍵のQRを出す(包み, false));
            const 直接 = document.createElement('button');
            直接.type = 'button';
            直接.className = 'btn btn-sm btn-secondary';
            直接.textContent = 'Macへ渡す（文字をコピーする）';
            直接.addEventListener('click', () => 鍵のQRを出す(包み, false));
            置き場.append(見出し, QRの絵を作る(住所), 次へ, ' ', 直接);
        } catch (e) {
            showNotification('QRを出せませんでした: ' + e.message, 'error');
        } finally {
            出す.disabled = false;
        }
    });
    控えボタン.addEventListener('click', async () => {
        if (!confirm('復旧用の控えを出します。データの倉庫の鍵が、そのまま文字で出ます。\n周りに人がいないときだけ、続けてください。')) return;
        try {
            const 包み = await 中身を取る();
            if (包み) 鍵のQRを出す(包み, true);
        } catch (e) {
            showNotification('出せませんでした: ' + e.message, 'error');
        }
    });
    欄.append(題, 説明, 出す, ' ', 控えボタン, 置き場);
    箱.appendChild(欄);
}

/*
 * 前の形（住所の #arelm-receive=…）で開かれたら、すぐ住所から消して、受け取り待ちに置く。
 * 開いたあとのタブに貼られたとき（hashchange）も同じ（前は開いたときしか見ず、住所に残ったままだった）。
 */
function 住所の受け取りを拾う() {
    if (typeof location === 'undefined' || !String(location.hash).startsWith(受け取りの印)) return;
    const x = 受け取りの中身を読む(location.hash);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 消せなくても、読み取りは続ける */ }
    if (!x) return;
    if (x.期限切れ) {
        const 知らせ = () => showNotification('受け取りの期限が切れています。渡す端末で、もう一度QRを出してください', 'error');
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', 知らせ); else 知らせ();
        return;
    }
    受け取り待ちを置く(x);
    if (document.readyState !== 'loading' && window.端末の金庫 && 端末の金庫.開いているか()) 受け取りを仕上げる();
}
住所の受け取りを拾う();
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('hashchange', 住所の受け取りを拾う);

window.受け取り待ちがあるか = 受け取り待ちがあるか;
window.受け取りを仕上げる = 受け取りを仕上げる;
window.渡す欄を描く = 渡す欄を描く;
window.受け取る欄を描く = 受け取る欄を描く;
window.受け取りの中身を読む = 受け取りの中身を読む;
if (typeof module !== 'undefined' && module.exports) module.exports = { 受け取りの住所を作る, 受け取りの文字を作る, 受け取りの中身を読む };

/**
 * 公開先で、前に開いた続き（新しいタブ）のときは、金庫が閉じている。共有・AIが黙って止まらないよう、上に帯を出す。
 * 押すと指紋・顔で開き、待っている受け取りがあれば仕上げ、倉庫の最新を取り込む。
 */
function 金庫を開ける帯を出す() {
    if (!(typeof サーバーの無い公開先か === 'function' && サーバーの無い公開先か())) return;
    if (!window.端末の金庫 || !端末の金庫.指紋で開けるか() || 端末の金庫.開いているか()) return;
    if (document.getElementById('vault-open-band')) return;
    const 帯 = document.createElement('div');
    帯.id = 'vault-open-band';
    帯.className = 'status-banner warn';
    帯.setAttribute('role', 'status');
    const 文 = document.createElement('span');
    文.textContent = '指紋・顔で開くと、データの共有とAIが使えます。';
    const 押す = document.createElement('button');
    押す.type = 'button';
    押す.className = 'btn btn-sm btn-primary';
    押す.textContent = '指紋・顔で開く';
    押す.addEventListener('click', async () => {
        押す.disabled = true;
        try {
            await 端末の金庫.指紋で開ける();
            帯.remove();
            if (受け取り待ちがあるか()) { await 受け取りを仕上げる(); return; }
            if (window.外の倉庫 && 外の倉庫.使えるか()) {
                const 変わった = await サーバー無しで取り込み直す();
                if (変わった) location.reload();
            }
        } catch (e) {
            showNotification(e && e.name === 'NotAllowedError' ? '本人確認が取り消されました' : (e && e.message) || '開けませんでした', 'error');
        } finally {
            押す.disabled = false;
        }
    });
    帯.append(文, ' ', 押す);
    const 置く所 = document.querySelector('#main-app main, #main-app') || document.body;
    置く所.insertBefore(帯, 置く所.firstChild);
}
window.金庫を開ける帯を出す = 金庫を開ける帯を出す;
