/**
 * 準備の状態 — このツールを動かす・作り続けるのに要るものが揃っているか
 *
 * ソフトは server の /api/setup-status がこの端末を調べた結果を出す。
 * アカウントと鍵は、この端末に暗号化して保存してあるかだけを見る（中身は出さない）。
 * 鍵は必須ではない。無くてもツール本体は自作の部分だけで動く。
 */

const 準備_鍵一覧 = [
    { 名: 'GitHub のトークン', 鍵: ['github', 'token'], 用途: 'バックアップ・進捗ログの控え、最新にする', 取り方: 'https://github.com/settings/tokens' },
    { 名: 'SwitchBot のトークンとシークレット', 鍵: ['switchbot', 'token'], 用途: '家電の操作（JARVIS）', 取り方: 'SwitchBotアプリ →プロフィール→設定→アプリバージョンを10回→開発者向けオプション' },
    { 名: 'SUZURI の API トークン', 鍵: ['suzuri', 'api'], 用途: '商品の同期・グッズ作成', 取り方: 'https://suzuri.jp/developer' },
    { 名: 'Gemini の API キー（任意）', 鍵: ['ai', 'gemini'], 用途: '画像を見る・長文（「脳: 自動」のとき）', 取り方: 'https://aistudio.google.com/apikey' },
    { 名: 'Claude の API キー（任意・有料）', 鍵: ['ai', 'claude'], 用途: '長文（使う前に必ず確認で止まる）', 取り方: 'https://console.anthropic.com' },
    { 名: 'Instagram のアクセストークン', 鍵: ['instagram', 'access_token'], 用途: 'SNSの成績を読む・投稿の補助', 取り方: 'https://developers.facebook.com' },
    { 名: 'Facebook ページのトークン', 鍵: ['facebook', 'page_access_token'], 用途: 'Facebookページの補助', 取り方: 'https://developers.facebook.com' },
    { 名: 'TikTok の開発者アプリ', 鍵: ['tiktok', 'client_secret'], 用途: 'TikTokの補助', 取り方: 'https://developers.tiktok.com' },
    { 名: 'Google の OAuth クライアント', 鍵: ['google', 'client_secret'], 用途: 'Googleフォト・ドライブ・カレンダー', 取り方: 'https://console.cloud.google.com' },
];

async function 準備の状態を描く() {
    const ソフト箱 = document.getElementById('setup-status-software');
    const 鍵箱 = document.getElementById('setup-status-keys');
    if (!ソフト箱 || !鍵箱) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    const 印 = (ある, 要る) => (ある ? '✓' : 要る ? '✗' : '－');
    const 行の色 = (ある, 要る) => (ある ? '' : 要る ? 'ledger-minus' : 'hint');

    ソフト箱.innerHTML = '<tr><td colspan="4" class="empty-cell">調べています…</td></tr>';
    try {
        const d = await (await fetch('/api/setup-status', { cache: 'no-store' })).json();
        ソフト箱.innerHTML = d.項目.map((x) => `<tr class="${行の色(x.ある, x.要る)}">
            <td>${印(x.ある, x.要る)}</td><td>${s(x.名)}${x.要る ? '' : ' <small class="hint">（任意）</small>'}</td>
            <td>${s(x.状態)}</td><td>${x.ある ? '' : s(x.入れ方)}</td></tr>`).join('');
        const 足りない = d.項目.filter((x) => x.要る && !x.ある);
        const 要約 = document.getElementById('setup-status-summary');
        if (要約) 要約.textContent = 足りない.length ? `必須のものが${足りない.length}つ足りません` : '必須のものは揃っています';
    } catch {
        ソフト箱.innerHTML = '<tr><td colspan="4" class="empty-cell">サーバーに聞けませんでした</td></tr>';
    }

    const 行 = await Promise.all(準備_鍵一覧.map(async (x) => {
        let ある = false;
        try { ある = !!(await AReGLM_SECURITY.loadApiKeySecure(x.鍵[0], x.鍵[1])); } catch { ある = false; }
        return `<tr class="${ある ? '' : 'hint'}"><td>${ある ? '✓' : '－'}</td><td>${s(x.名)}</td><td>${s(x.用途)}</td>
            <td>${ある ? '設定済み' : /^https:/.test(x.取り方) ? `<a href="${s(x.取り方)}" target="_blank" rel="noopener">${s(x.取り方)}</a>` : s(x.取り方)}</td></tr>`;
    }));
    鍵箱.innerHTML = 行.join('');
}

function init準備の状態() {
    document.getElementById('setup-status-refresh')?.addEventListener('click', 準備の状態を描く);
    if (document.getElementById('setup-status-software')) 準備の状態を描く();
}

window.init準備の状態 = init準備の状態;
window.準備の状態を描く = 準備の状態を描く;
