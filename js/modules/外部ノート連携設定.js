/**
 * Notion・Obsidian連携の設定画面まわり
 *
 * トークン・APIキーは AReGLM_SECURITY で暗号化してこの端末にだけ保存する。
 * データベースID・ポート番号は秘密ではないので、そのまま localStorage に置く。
 */

function initNotion設定() {
    const tokenInput = document.getElementById('notion-token');
    const dbInput = document.getElementById('notion-database-id');
    const saveBtn = document.getElementById('notion-save-btn');
    const testBtn = document.getElementById('notion-test-btn');
    const status = document.getElementById('notion-status');
    if (!saveBtn) return;

    const 表示を直す = async () => {
        const 設定済み = !!(await AReGLM_NOTION.getToken());
        const db = AReGLM_NOTION.getDatabaseId();
        if (dbInput) dbInput.value = db;
        if (tokenInput) tokenInput.placeholder = 設定済み ? '•••• 設定済み' : 'secret_… または ntn_…';
        if (status) {
            status.textContent = 設定済み
                ? (db ? 'トークン・データベースとも設定済みです。' : 'トークンは設定済みですが、データベースIDが未入力です。')
                : 'まだ設定されていません。';
        }
    };

    saveBtn.addEventListener('click', async () => {
        const token = (tokenInput?.value || '').trim();
        const db = (dbInput?.value || '').trim();
        if (token) await AReGLM_SECURITY.saveApiKeySecure('notion', 'token', token);
        if (db) localStorage.setItem('areglm_notion_database_id', db);
        else localStorage.removeItem('areglm_notion_database_id');
        if (tokenInput) tokenInput.value = '';
        await 表示を直す();
        showNotification('Notionの設定を保存しました', 'success');
    });

    testBtn?.addEventListener('click', async () => {
        status.textContent = '確認しています…';
        try {
            const 結果 = await AReGLM_NOTION.testConnection();
            status.textContent = `つながりました（${結果.名前}）`;
            showNotification('Notionに接続できました', 'success');
        } catch (e) {
            status.textContent = `つながりませんでした: ${e.message}`;
            showNotification(e.message, 'error');
        }
    });

    表示を直す();
}

function initObsidian設定() {
    const keyInput = document.getElementById('obsidian-key');
    const portInput = document.getElementById('obsidian-port');
    const saveBtn = document.getElementById('obsidian-save-btn');
    const testBtn = document.getElementById('obsidian-test-btn');
    const status = document.getElementById('obsidian-status');
    if (!saveBtn) return;

    const 表示を直す = async () => {
        const 設定済み = !!(await AReGLM_OBSIDIAN.getKey());
        if (portInput) portInput.value = AReGLM_OBSIDIAN.getPort();
        if (keyInput) keyInput.placeholder = 設定済み ? '•••• 設定済み' : 'プラグインの設定画面に表示されるキー';
        if (status) status.textContent = 設定済み ? '設定済みです。' : 'まだ設定されていません。';
    };

    saveBtn.addEventListener('click', async () => {
        const key = (keyInput?.value || '').trim();
        const port = (portInput?.value || '').trim();
        if (key) await AReGLM_SECURITY.saveApiKeySecure('obsidian', 'key', key);
        if (port) localStorage.setItem('areglm_obsidian_port', port);
        if (keyInput) keyInput.value = '';
        await 表示を直す();
        showNotification('Obsidianの設定を保存しました', 'success');
    });

    testBtn?.addEventListener('click', async () => {
        status.textContent = '確認しています…';
        try {
            const 結果 = await AReGLM_OBSIDIAN.testConnection();
            status.textContent = `つながりました（Obsidian ${結果.バージョン}）`;
            showNotification('Obsidianに接続できました', 'success');
        } catch (e) {
            status.textContent = `つながりませんでした: ${e.message}`;
            showNotification(e.message, 'error');
        }
    });

    表示を直す();
}

function init外部ノート連携設定() {
    initNotion設定();
    initObsidian設定();
}

window.init外部ノート連携設定 = init外部ノート連携設定;
