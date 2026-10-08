/**
 * Google連携（Gmail・Drive、カレンダーの土台）の設定画面まわり
 *
 * クライアントID・シークレットは AReGLM_SECURITY で暗号化してこの端末にだけ
 * 保存する（クライアントID自体は秘密ではないが、他の連携と同じ扱いに揃えて
 * 安全側に倒す）。実際にGoogleへログインする処理は
 * js/services/google-oauth.js が持つ。
 */

function initGoogle連携設定() {
    const idInput = document.getElementById('google-client-id');
    const secretInput = document.getElementById('google-client-secret');
    const saveBtn = document.getElementById('google-client-save-btn');
    const connectBtn = document.getElementById('google-connect-btn');
    const disconnectBtn = document.getElementById('google-disconnect-btn');
    const status = document.getElementById('google-status');
    const calBox = document.getElementById('gcal-sync-enabled');
    if (!saveBtn) return;

    const 表示を直す = async () => {
        const clientId = AReGLM_GOOGLE_OAUTH.getClientId();
        const secretあり = !!(await AReGLM_GOOGLE_OAUTH.getClientSecret());
        const 連携済み = await AReGLM_GOOGLE_OAUTH.isConnected();

        if (idInput) idInput.value = clientId;
        if (secretInput) secretInput.placeholder = secretあり ? '•••• 設定済み' : 'GOCSPX-…';
        if (connectBtn) connectBtn.disabled = !(clientId && secretあり);
        if (disconnectBtn) disconnectBtn.hidden = !連携済み;
        if (calBox) calBox.disabled = !連携済み;

        if (status) {
            if (連携済み) {
                const email = AReGLM_GOOGLE_OAUTH.getConnectedEmail();
                status.textContent = `連携済みです${email ? `（${email}）` : ''}。「週次レポート」からメール送信・Driveバックアップが使えます。`;
            } else if (clientId && secretあり) {
                status.textContent = 'クライアントID・シークレットは保存済みです。「Googleにログインして連携」を押してください。';
            } else {
                status.textContent = 'まだ設定されていません。';
            }
        }
    };

    saveBtn.addEventListener('click', async () => {
        const id = (idInput?.value || '').trim();
        const secret = (secretInput?.value || '').trim();
        if (!id && !secret) { showNotification('クライアントID・シークレットを入れてください', 'error'); return; }
        await AReGLM_GOOGLE_OAUTH.saveClientCredentials(id, secret);
        if (secretInput) secretInput.value = '';
        await 表示を直す();
        showNotification('Googleのクライアント情報を保存しました', 'success');
    });

    connectBtn?.addEventListener('click', async () => {
        connectBtn.disabled = true;
        connectBtn.textContent = 'ログイン待ち…';
        try {
            await AReGLM_GOOGLE_OAUTH.connect();
            showNotification('Googleと連携できました', 'success');
        } catch (e) {
            showNotification(e.message, 'error');
        } finally {
            connectBtn.textContent = 'Googleにログインして連携';
            await 表示を直す();
        }
    });

    disconnectBtn?.addEventListener('click', async () => {
        await AReGLM_GOOGLE_OAUTH.disconnect();
        await 表示を直す();
        showNotification('Googleとの連携を解除しました', 'success');
    });

    if (calBox) {
        calBox.checked = localStorage.getItem('areglm_gcal_sync_enabled') === 'true';
        calBox.addEventListener('change', (e) => {
            localStorage.setItem('areglm_gcal_sync_enabled', e.target.checked ? 'true' : 'false');
        });
    }

    表示を直す();
}

window.initGoogle連携設定 = initGoogle連携設定;
