/**
 * 外へ出さない（最後の関所）
 *
 * なぜこれが要るのか:
 *   このツールは公開しない・外へ送らない、が土台になっている。
 *   実際、外部の鍵は一つも設定されておらず、
 *   外部を呼ぶところは鍵が無いので必ず失敗する。
 *
 *   ただ「鍵が無いから、たまたま飛ばない」のと、
 *   「そもそも飛ばせない」のとは違う。
 *   鍵が一度でも入れば、前者は黙って外へ出る。
 *
 *   だからここで、外へ出る通信そのものを止める。
 *   自分で「外部を使う」と選んだときだけ通す。
 *
 * 止めるもの:
 *   ・fetch でこの端末の外へ出るもの
 *   ・XMLHttpRequest で外へ出るもの
 *   ・WebSocket で外へつなぐもの
 *   ・sendBeacon（画面を閉じるときに黙って送るやつ）
 *
 * 止めないもの:
 *   ・127.0.0.1 / localhost（自分の中の行き来。これが本体）
 *   ・data: blob: （その場で作ったもの。外には出ない）
 *   ・同じページの中の相対パス
 *
 * 止めたときは、黙って失敗させず、何を止めたかを画面の記録に残す。
 * 黙って止めると、動かない理由が分からなくなるため。
 */

const 外に出す許可の鍵 = 'areglm_allow_external';

/** 自分の中への行き先か */
function 中の行き先か(url) {
    try {
        const u = new URL(url, location.href);

        // その場で作ったものは、外へ出ない
        if (u.protocol === 'data:' || u.protocol === 'blob:') return true;

        // 自分の端末
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost'
            || u.hostname === '::1' || u.hostname === location.hostname) return true;

        return false;
    } catch {
        // 読み取れない行き先は、通さない。
        // 分からないものを通すのは、いちばん危ない。
        return false;
    }
}

function 外を許しているか() {
    return localStorage.getItem(外に出す許可の鍵) === 'true';
}

/** 止めたことを残す */
function 止めたことを残す(行き先, やり方) {
    const 記録 = (() => {
        try { return JSON.parse(localStorage.getItem('areglm_blocked_out') || '[]'); }
        catch { return []; }
    })();

    記録.push({ 行き先: String(行き先).slice(0, 200), やり方, とき: new Date().toISOString() });
    localStorage.setItem('areglm_blocked_out', JSON.stringify(記録.slice(-50)));

    if (typeof showNotification === 'function') {
        showNotification(
            `外へ出る通信を止めました（${new URL(String(行き先), location.href).hostname}）。`
            + 'このツールは外へ送らない決まりです。',
            'warning');
    }
    console.warn('[外に出さない] 止めました:', やり方, 行き先);
}

function 関所を置く() {
    // --- fetch ---
    const 元のfetch = window.fetch;
    window.fetch = function (入力, 設定) {
        const 行き先 = (入力 && 入力.url) ? 入力.url : 入力;
        if (!中の行き先か(行き先) && !外を許しているか()) {
            止めたことを残す(行き先, 'fetch');
            return Promise.reject(new Error(
                'このツールは外へ通信しません。外部を使う場合は、設定で明示的に許可してください。'));
        }
        return 元のfetch.apply(this, arguments);
    };

    // --- XMLHttpRequest ---
    const 元のopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (方法, url, ...残り) {
        if (!中の行き先か(url) && !外を許しているか()) {
            止めたことを残す(url, 'XMLHttpRequest');
            throw new Error('このツールは外へ通信しません。');
        }
        return 元のopen.call(this, 方法, url, ...残り);
    };

    // --- WebSocket ---
    const 元のWS = window.WebSocket;
    if (元のWS) {
        window.WebSocket = function (url, ...残り) {
            if (!中の行き先か(url) && !外を許しているか()) {
                止めたことを残す(url, 'WebSocket');
                throw new Error('このツールは外へ通信しません。');
            }
            return new 元のWS(url, ...残り);
        };
        window.WebSocket.prototype = 元のWS.prototype;
    }

    // --- sendBeacon ---
    //
    // これは画面を閉じるときに黙って送るためのもの。
    // 使っていないが、いちばん気づかれにくい経路なので塞ぐ。
    if (navigator.sendBeacon) {
        const 元のbeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function (url, ...残り) {
            if (!中の行き先か(url) && !外を許しているか()) {
                止めたことを残す(url, 'sendBeacon');
                return false;
            }
            return 元のbeacon(url, ...残り);
        };
    }
}

/** 止めた記録を読む（設定画面で見せるため） */
function 止めた記録を読む() {
    try { return JSON.parse(localStorage.getItem('areglm_blocked_out') || '[]'); }
    catch { return []; }
}

関所を置く();

window.中の行き先か = 中の行き先か;
window.外を許しているか = 外を許しているか;
window.止めた記録を読む = 止めた記録を読む;
