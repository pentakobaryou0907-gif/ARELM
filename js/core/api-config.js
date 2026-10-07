/**
 * API設定 — 動的なエンドポイント
 *
 * なぜこれが要るのか:
 *   127.0.0.1 に決め打ちしていたため、他の端末からは使えなかった。
 *   この端末のブラウザからしか見えないアドレスだから。
 *
 *   同じWi-Fi内の他の端末から使うには、
 *   その端末の実際のアドレスを使う必要がある。
 *
 * やり方:
 *   現在開いているページのホスト名を使う（window.location.hostname）。
 *   そうすれば、どの端末から開いても、その入口に合わせて繋がる。
 *
 *   ただし一つだけ例外がある:
 *   AIエンジンは常に127.0.0.1:8765でしか待ち受けない（外部から直接繋げない設計）。
 *   そちらはNodeサーバー（/api/ai-local/...）を経由して使う。
 */

/**
 * 現在のホスト名（IPアドレスまたは localhost）を返す。
 * 
 * 例:
 *   この端末から → "127.0.0.1" または "localhost"
 *   同じWi-Fi内の他の端末から → "192.168.1.5" など
 *   Tailscale経由 → "100.64.x.x" など
 */
function getHostname() {
    return window.location.hostname;
}

/**
 * 現在のプロトコル（http または https）を返す。
 */
function getProtocol() {
    return window.location.protocol; // "http:" または "https:"
}

/**
 * Nodeサーバーへの完全なベースURL。
 * 
 * 例: "http://192.168.1.5:8080"
 */
function getServerBaseURL() {
    const protocol = getProtocol();
    const hostname = getHostname();
    const port = window.location.port || (protocol === 'https:' ? '443' : '80');
    
    // ポート8090で開いている場合は8080のAPIサーバーを使う
    const apiPort = port === '8090' ? '8080' : port;
    
    return `${protocol}//${hostname}:${apiPort}`;
}

/**
 * APIエンドポイントの完全なURLを返す。
 * 
 * @param {string} path - APIのパス（例: "/api/health"）
 * @returns {string} 完全なURL
 */
function getAPIURL(path) {
    return `${getServerBaseURL()}${path}`;
}

/**
 * この端末からアクセスしているかどうか。
 */
function isLocalAccess() {
    const hostname = getHostname();
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

/**
 * 安全な接続（HTTPS）かどうか。
 */
function isSecureConnection() {
    return window.location.protocol === 'https:';
}

/**
 * WebSocketのURLを返す。
 * HTTPSの場合はwss:を使う。
 */
function getWebSocketURL(path) {
    const protocol = getProtocol() === 'https:' ? 'wss:' : 'ws:';
    const hostname = getHostname();
    const port = window.location.port || (getProtocol() === 'https:' ? '443' : '80');
    const apiPort = port === '8090' ? '8080' : port;
    
    return `${protocol}//${hostname}:${apiPort}${path}`;
}

// 外に出す
window.API_CONFIG = {
    getHostname,
    getProtocol,
    getServerBaseURL,
    getAPIURL,
    isLocalAccess,
    isSecureConnection,
    getWebSocketURL,
};

// デバッグ用
if (isLocalAccess()) {
    console.log('[API設定] この端末からアクセスしています:', getServerBaseURL());
} else {
    console.log('[API設定] 他の端末からアクセスしています:', getServerBaseURL());
}
