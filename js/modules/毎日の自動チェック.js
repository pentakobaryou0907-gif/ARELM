/**
 * 毎日の自動チェック ― 決まった時刻に、在庫の少ない商品を知らせる
 *
 * なぜこの形にしたのか:
 *
 *   「まとめて更新」は、押したときだけ動く。
 *   毎朝ボタンを押さなくても、決まった時間に
 *   在庫が少ない商品だけ、勝手に教えてほしい。
 *
 *   商品のデータは、いまこのブラウザ（localStorage）の中にしかない。
 *   サーバー側だけで動くCron（crontabやnode-cron）を作っても、
 *   そこからは商品を見られず、意味が無い。
 *
 *   だから、この画面が開いている間だけ効く形にする。
 *   1分ごとに時刻を見て、決めた時刻ちょうどになったら、
 *   その日一回だけ確かめて、知らせる。
 *
 *   このツールの入口（AReGLMのChrome窓）は、ふだん開けっぱなしで
 *   使われているので、多くの場合は実際に効く。
 *   閉じているときは鳴らない。これは正直に書いておく。
 *
 * 知らせ方:
 *   画面の中の通知（showNotification）に加えて、
 *   すでにある「知らせる」操作（パソコンを操る.js）を使い、
 *   macOSの通知としても出す。タブを見ていなくても気づける。
 */

const 自動チェック時刻キー = 'areglm_auto_check_time';
const 自動チェック有効キー = 'areglm_auto_check_enabled';
const 最後に実行した日キー = 'areglm_auto_check_last_date';

/** 既定は朝8時 */
const 既定の時刻 = '08:00';

let 監視の札 = null;

function 自動チェックが有効か() {
    return localStorage.getItem(自動チェック有効キー) !== 'false';   // 既定はON
}

function 自動チェック時刻を読む() {
    return localStorage.getItem(自動チェック時刻キー) || 既定の時刻;
}

function 自動チェック時刻を決める(時刻) {
    if (!/^\d{2}:\d{2}$/.test(時刻 || '')) return false;
    localStorage.setItem(自動チェック時刻キー, 時刻);
    return true;
}

function 自動チェックを切り替える(有効か) {
    localStorage.setItem(自動チェック有効キー, 有効か ? 'true' : 'false');
}

/** 今日、この時刻に、まだ実行していないか */
function 今日まだ実行していないか() {
    const 今日 = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(最後に実行した日キー) !== 今日;
}

function 実行済みにする() {
    const 今日 = new Date().toISOString().slice(0, 10);
    localStorage.setItem(最後に実行した日キー, 今日);
}

/** 在庫が少ない商品を数え、知らせる */
async function 在庫チェックを行う() {
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const 少ない = products.filter((p) => (p.quantity ?? p.stock ?? 0) <= (p.reorderLevel || 5));

    if (!少ない.length) {
        // 何も無ければ、静かに終える。
        // 毎日「異常なし」を出し続けると、そのうち見なくなる。
        logActivity?.('毎朝の在庫チェック: 補充が要るものはありませんでした');
        return;
    }

    const 商品名たち = 少ない.slice(0, 5).map((p) => p.name || '（名称未設定）').join('、');
    const 文 = `在庫が少ない商品が${少ない.length}件あります: ${商品名たち}`
        + (少ない.length > 5 ? ' ほか' : '');

    showNotification?.(文, 'info');
    logActivity?.(`毎朝の在庫チェック: ${文}`);

    // macOSの通知としても出す（タブを見ていなくても気づけるように）
    try {
        await fetch('/api/computer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 操作: '知らせる', 材料: { 文 } }),
        });
    } catch {
        /* 通知だけの機能なので、失敗しても他には影響しない */
    }
}

/** 1分ごとに時刻を見る */
function 監視を始める() {
    if (監視の札) return;
    監視の札 = setInterval(() => {
        if (!自動チェックが有効か()) return;

        const 今 = new Date();
        const いまの時刻 = String(今.getHours()).padStart(2, '0') + ':'
            + String(今.getMinutes()).padStart(2, '0');

        if (いまの時刻 !== 自動チェック時刻を読む()) return;
        if (!今日まだ実行していないか()) return;

        実行済みにする();
        在庫チェックを行う();
    }, 60000);
}

function init毎日の自動チェック() {
    監視を始める();

    const 有効チェック = document.getElementById('auto-check-enabled');
    const 時刻入力 = document.getElementById('auto-check-time');
    if (有効チェック) {
        有効チェック.checked = 自動チェックが有効か();
        有効チェック.addEventListener('change', () => 自動チェックを切り替える(有効チェック.checked));
    }
    if (時刻入力) {
        時刻入力.value = 自動チェック時刻を読む();
        時刻入力.addEventListener('change', () => {
            if (自動チェック時刻を決める(時刻入力.value)) {
                showNotification?.(`毎日 ${時刻入力.value} に在庫チェックするよう決めました`, 'success');
            }
        });
    }
}

window.init毎日の自動チェック = init毎日の自動チェック;
window.在庫チェックを行う = 在庫チェックを行う;   // 手動で今すぐ試したいとき用
