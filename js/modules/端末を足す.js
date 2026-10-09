/**
 * 端末を足す（打たずに、ほかの端末へデータの共有を渡す）
 *
 * 本人の要望（2026-10-09）「合言葉やパスワード、メールアドレスはなしにして、私のデバイスでしか開けないように」。
 * これまで、2台目からは、GitHubの鍵と「同期の合言葉」を、その端末で打ち直す必要があった。
 *
 * やり方:
 *   ・開いている端末（指紋・顔で開いた公開先、またはMac本体）が「ほかの端末へ渡す」でQRを出す
 *   ・QRの中身は、公開先の住所＋「#arelm-receive=…」（# の後ろは、ブラウザがどこへも送らない部分）
 *   ・新しい端末は、カメラでQRを読むだけ。開いたら、すぐに住所から「#arelm-receive=…」を消し、
 *     指紋・顔で始めた（開いた）あと、その端末の金庫にだけ入れる
 *   ・QRは出してから2分で消える。受け取りの期限も10分
 * 守り: QRには倉庫の鍵が入る。自分の端末で読むときだけ出す（画面にもそう書く）。外へは送らない。
 */

// 英数字だけにする（日本語にすると、ブラウザが住所の # の後ろを %E5… の形に変え、受け取る側で見つけられなかった）
const 受け取りの印 = '#arelm-receive=';
const 受け取り待ちの名 = 'areglm_receive_wait';   // sessionStorage（このタブの間だけ）
const 渡す期限の分 = 10;

function 端末を足すの文字(バイト) {
    let s = '';
    new Uint8Array(バイト).forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 渡す中身から、受け取りの住所を作る（公開先の住所＋#arelm-receive=…） */
function 受け取りの住所を作る(包み, いま = Date.now()) {
    const 中身 = { v: 1, github: String(包み.github || ''), 倉庫: String(包み.倉庫 || 'ARELM-data'), 同期: String(包み.同期 || ''), 期限: いま + 渡す期限の分 * 60000 };
    if (包み.gemini) 中身.gemini = String(包み.gemini);
    const 元 = (typeof 公開先の住所 === 'string' && 公開先の住所) || (location.origin + location.pathname);
    return 元 + 受け取りの印 + 端末を足すの文字(new TextEncoder().encode(JSON.stringify(中身)));
}

/** 受け取りの住所（またはその # の後ろ）を読む。形が違えば null */
function 受け取りの中身を読む(文字, いま = Date.now()) {
    const s = String(文字 || '');
    const i = s.indexOf(受け取りの印);
    const 本体 = i >= 0 ? s.slice(i + 受け取りの印.length) : s;
    if (!/^[A-Za-z0-9_-]{20,4000}$/.test(本体)) return null;
    try {
        const 戻す = atob(本体.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((本体.length + 3) % 4));
        const x = JSON.parse(new TextDecoder().decode(Uint8Array.from(戻す, (c) => c.charCodeAt(0))));
        if (!x || x.v !== 1 || typeof x.github !== 'string' || typeof x.同期 !== 'string' || typeof x.倉庫 !== 'string') return null;
        if (!/^[A-Za-z0-9_.-]+$/.test(x.倉庫) || x.同期.length < 8 || !x.github) return null;
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

/**
 * 開いた端末の金庫へ、受け取った中身を入れ、データの共有を始める（指紋・顔で開いたあとに呼ぶ）。
 * 受け取れたら true。
 */
async function 受け取りを仕上げる() {
    const x = 受け取り待ちを読む();
    if (!x || !window.端末の金庫 || !端末の金庫.開いているか()) return false;
    sessionStorage.removeItem(受け取り待ちの名);   // 一度きり
    try {
        await 端末の金庫.入れる('github', x.github);
        await 端末の金庫.入れる('同期の合言葉', x.同期);
        localStorage.setItem(外の倉庫.設定の名, JSON.stringify({ 持ち主: '', 倉庫: x.倉庫 }));
        await 外の倉庫.準備する(x.倉庫);
        if (x.gemini) {
            await 端末の金庫.入れる('gemini', x.gemini);
            localStorage.setItem(外のAI.設定の名, 'gemini');
            // 渡した端末で、本人がGeminiを許可している（キーを保存したのが、その印）。この端末でも同じにする
            if (typeof 使ってよいか === 'function' && !使ってよいか('gemini') && typeof 許可を切り替える === 'function') 許可を切り替える('gemini', true);
        }
        showNotification('ほかの端末から受け取りました。データをそろえています…', 'success');
        const 変わった = await サーバー無しで取り込み直す();
        if (変わった) setTimeout(() => location.reload(), 1200);
        return true;
    } catch (e) {
        localStorage.removeItem(外の倉庫.設定の名);
        showNotification('受け取れませんでした: ' + e.message, 'error');
        return false;
    }
}

/**
 * 「ほかの端末へ渡す」のQRを出す（2分で消える）。中身は 取る() が返す（開いた金庫・Mac本体からだけ取れる）。
 */
function 渡す欄を描く(箱, 取る) {
    const 欄 = document.createElement('div');
    欄.className = 'login-form';
    const 題 = document.createElement('h4');
    題.textContent = 'ほかの端末へ渡す（打たずに、同じデータにする）';
    const 説明 = document.createElement('p');
    説明.className = 'hint';
    説明.textContent = '新しい端末（iPhone・iPad・Windows・Android）のカメラで、出てきたQRを読むだけです。読んだ端末で「この端末で始める」を押すと、同じデータになります。'
        + 'QRには、データの倉庫の鍵が入っています。自分の端末で読むときだけ出してください（2分で消えます）。';
    const 出す = document.createElement('button');
    出す.type = 'button';
    出す.className = 'btn btn-secondary';
    出す.textContent = 'QRを出す';
    const 置き場 = document.createElement('div');
    let 消す札 = null;
    出す.addEventListener('click', async () => {
        出す.disabled = true;
        try {
            const 包み = await 取る();
            if (!包み || !包み.github || !包み.同期) { showNotification('まだ、データの共有が始まっていません', 'error'); return; }
            const 住所 = 受け取りの住所を作る(包み);
            置き場.textContent = '';
            const 絵 = document.createElement('div');
            絵.style.cssText = 'background:#fff;padding:12px;border-radius:8px;width:fit-content;max-width:100%;margin:8px 0';
            const q = qrcode(0, 'L');
            q.addData(住所);
            q.make();
            // SVGはこの端末の中で組み立てた文字列だけ（外から来た文字は入らない）
            絵.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
            const svg = 絵.querySelector('svg');
            if (svg) svg.style.cssText = 'width:min(300px,75vw);height:auto;display:block';
            const コピー = document.createElement('button');
            コピー.type = 'button';
            コピー.className = 'btn btn-sm btn-secondary';
            コピー.textContent = 'リンクをコピー（Macへ渡すとき）';
            コピー.addEventListener('click', async () => {
                try { await navigator.clipboard.writeText(住所); コピー.textContent = 'コピーしました（2分で使えなくなります）'; }
                catch { コピー.textContent = 'コピーできませんでした'; }
            });
            const 残り = document.createElement('p');
            残り.className = 'hint';
            置き場.append(絵, コピー, 残り);
            let 秒 = 120;
            clearInterval(消す札);
            残り.textContent = `あと${秒}秒で消えます`;
            消す札 = setInterval(() => {
                秒 -= 1;
                残り.textContent = `あと${秒}秒で消えます`;
                if (秒 <= 0) { clearInterval(消す札); 置き場.textContent = ''; }
            }, 1000);
        } catch (e) {
            showNotification('QRを出せませんでした: ' + e.message, 'error');
        } finally {
            出す.disabled = false;
        }
    });
    欄.append(題, 説明, 出す, 置き場);
    箱.appendChild(欄);
}

// 開いた瞬間に、住所から「#arelm-receive=…」を読み取り、すぐに消す（履歴・画面に残さない）
(function 受け取りを拾う() {
    if (typeof location === 'undefined' || !String(location.hash).startsWith(受け取りの印)) return;
    const x = 受け取りの中身を読む(location.hash);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 消せなくても、読み取りは続ける */ }
    if (!x) return;
    if (x.期限切れ) {
        document.addEventListener('DOMContentLoaded', () => showNotification('受け取りの期限が切れています。渡す端末で、もう一度QRを出してください', 'error'));
        return;
    }
    try { sessionStorage.setItem(受け取り待ちの名, JSON.stringify(x)); } catch { /* 置けなければ、受け取れない */ }
})();

window.受け取り待ちがあるか = 受け取り待ちがあるか;
window.受け取りを仕上げる = 受け取りを仕上げる;
window.渡す欄を描く = 渡す欄を描く;
window.受け取りの中身を読む = 受け取りの中身を読む;
if (typeof module !== 'undefined' && module.exports) module.exports = { 受け取りの住所を作る, 受け取りの中身を読む };

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
