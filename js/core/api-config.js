/**
 * API設定 — いま開いている入口に合わせる
 *
 * なぜこれが要るのか:
 *   127.0.0.1 に決め打ちすると、他の端末（同じWi-Fi・Tailscale）からは
 *   その端末自身の中を見に行ってしまい、繋がらない。
 *
 *   画面の API はもともと相対パス（/api/…）なので、同じ入口に届く。
 *   ここに置くのは、「絶対URLが要るとき」と「このMac自身かどうか」の判断。
 *
 *   8090 を 8080 に付け替えない。
 *   8080 は Cursor 等が先に持つことがあり、付け替えると他のアプリに当たる。
 *   同じページの入口（location.origin）を使う。
 */

function この端末からか() {
    const h = window.location.hostname;
    return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

function 安全な接続か() {
    return window.isSecureContext === true;
}

function 入口のベース() {
    return window.location.origin;
}

function APIのURL(path) {
    const p = String(path || '');
    return 入口のベース() + (p.startsWith('/') ? p : '/' + p);
}

/**
 * マイクが使えない開き方のとき、どこを開くか。
 * 他の端末を 127.0.0.1 へ飛ばすと、その端末の中を見に行って終わる。
 */
function マイクの開き方() {
    if (この端末からか()) {
        return 'このMacでは http://127.0.0.1:8090 で開いてください。';
    }
    return '他の端末では、設定の「どこでも」で出す https のアドレス（Tailscale）から開いてください。'
        + 'http の他端末では、ブラウザの決まりでマイクは使えません。';
}

window.API_CONFIG = {
    この端末からか,
    安全な接続か,
    入口のベース,
    APIのURL,
    マイクの開き方,
};
