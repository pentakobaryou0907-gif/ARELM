/**
 * スクロール見張り番
 *
 * 経緯:
 *   「画面がスクロールできない」という不具合が何度も起き、
 *   そのたびに原因の切り分けに時間がかかった。
 *   しかも、見ている画面が最新かどうかも分からず、
 *   直したつもりが届いていない、ということが起きた。
 *
 * ここでの役割:
 *   1. スクロールを妨げる指定が入っていないか、定期的に自分で見張る
 *   2. 見つけたら、その場で自分で直す
 *   3. 直した記録を残し、あとから何が起きたか分かるようにする
 *   4. いま見ている画面がいつの版か、すぐ確かめられるようにする
 *
 * 外部へは一切送信しない。すべてこの端末の中だけで完結する。
 */

/** この画面がいつの版か。画面まわりを直したら日付を進める。 */
const 画面の版 = '2026-08-19-a';

/** 自動で直した記録（最大50件） */
const スクロール修復記録 = [];

/**
 * 縦スクロールを妨げる指定が入っていないか調べる。
 *
 * 妨げるものは3つしかない:
 *   - overflow-y が hidden か clip
 *   - position: fixed で画面に貼り付いている
 *   - height が固定されていて中身が入りきらない
 */
function スクロールの問題をさがす() {
    const 見つかった = [];
    const 対象 = [
        ['html', document.documentElement],
        ['body', document.body],
    ];

    対象.forEach(function (組) {
        const 名前 = 組[0];
        const 要素 = 組[1];
        if (!要素) return;

        const s = getComputedStyle(要素);
        if (/hidden|clip/.test(s.overflowY)) {
            見つかった.push({ 要素: 名前, 項目: 'overflow-y', 値: s.overflowY });
        }
        if (s.position === 'fixed') {
            見つかった.push({ 要素: 名前, 項目: 'position', 値: s.position });
        }
    });

    return 見つかった;
}

/**
 * 見つけた問題をその場で直す。
 *
 * CSS の !important より強いのは、要素に直接書いた !important だけ。
 * そのため setProperty の第3引数に 'important' を渡している。
 */
function スクロールを直す(問題) {
    問題.forEach(function (p) {
        const 要素 = p.要素 === 'html' ? document.documentElement : document.body;
        要素.style.setProperty('overflow-y', p.要素 === 'html' ? 'auto' : 'visible', 'important');
        要素.style.setProperty('position', 'static', 'important');
        要素.style.setProperty('height', 'auto', 'important');
    });

    スクロール修復記録.push({
        とき: new Date().toLocaleString('ja-JP'),
        内容: 問題.map(function (p) {
            return p.要素 + ' の ' + p.項目 + ' が ' + p.値 + ' でした';
        }).join(' / '),
    });
    if (スクロール修復記録.length > 50) スクロール修復記録.shift();
}

/**
 * いまスクロールできる状態か、実際に少し動かして確かめる。
 *
 * 指定を見るだけでは分からないことがあるため、
 * ほんの少しだけ動かしてみて、すぐ戻す。
 *
 * 動くか が null のときは、中身が画面より短く、
 * そもそも動かす必要がない状態を表す。
 */
function スクロールを試す() {
    const 中身 = document.documentElement.scrollHeight;
    const 画面 = document.documentElement.clientHeight;

    if (中身 <= 画面 + 1) {
        return { 中身の高さ: 中身, 画面の高さ: 画面, 動くか: null };
    }

    const もとの位置 = window.scrollY;
    window.scrollTo(0, もとの位置 + 10);
    const 動いた = window.scrollY !== もとの位置;
    window.scrollTo(0, もとの位置);

    return { 中身の高さ: 中身, 画面の高さ: 画面, 動くか: 動いた };
}

/**
 * いまの状態をまとめて返す。困ったときに中身を見るためのもの。
 */
function 画面の状態() {
    const h = getComputedStyle(document.documentElement);
    const b = getComputedStyle(document.body);

    let 入口 = location.port;
    if (location.port === '8090') 入口 = 'アプリ用（8090）';
    else if (location.port === '8443') 入口 = '安全な接続（8443）';
    else if (location.port === '8080') 入口 = '通常（8080）';

    return {
        画面の版: 画面の版,
        アドレス: location.href,
        入口: 入口,
        安全な接続: window.isSecureContext,
        html: { 縦: h.overflowY, 横: h.overflowX, 位置: h.position },
        body: { 縦: b.overflowY, 横: b.overflowX, 位置: b.position },
        スクロール: スクロールを試す(),
        自動で直した記録: スクロール修復記録.slice(),
    };
}

/**
 * 見張りを始める。
 *
 * 見張る回数を絞っているのは、端末に負荷をかけないため。
 * 画面の切り替えや窓の大きさ変更の直後だけ確かめれば十分で、
 * あとは念のため10秒おきに軽く見るだけにしてある。
 */
function initScrollGuard() {
    const 確かめる = function () {
        const 問題 = スクロールの問題をさがす();
        if (問題.length) スクロールを直す(問題);
    };

    確かめる();

    window.addEventListener('resize', 確かめる, { passive: true });
    document.addEventListener('click', function () {
        setTimeout(確かめる, 100);
    }, { passive: true });

    setInterval(確かめる, 10000);
}

window.initScrollGuard = initScrollGuard;
window.画面の状態 = 画面の状態;
window.AReGLM画面の版 = 画面の版;

// 読み込まれた時点ですぐ見張りを始める（他の指定より先に効かせるため）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollGuard);
} else {
    initScrollGuard();
}
