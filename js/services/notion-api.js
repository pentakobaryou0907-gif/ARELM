/**
 * Notion 公式API — Gateway経由
 *
 * 使うには、本人がNotion側で統合トークンを発行し（無料）、
 * その統合を対象のページ・データベースに「共有」しておく必要がある
 * （Notion自身の権限モデル。ここでの設定だけでは、共有していない
 * ページには触れない）。
 */
const AReGLM_NOTION = {
    async getToken() {
        return AReGLM_SECURITY.loadApiKeySecure('notion', 'token');
    },

    getDatabaseId() {
        return localStorage.getItem('areglm_notion_database_id') || '';
    },

    /** Notion APIへ、パスと本文をそのまま中継する */
    async call(method, path, body) {
        const token = await this.getToken();
        if (!token) throw new Error('Notion統合トークン未設定 → 設定（⚙）');
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、Notionとつなげません。'
                + '直接つなぐことはしません（外部へ出る経路を残さないため）。');
        }
        const res = await fetch('/api/notion-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Notion-Token': token },
            body: JSON.stringify({ method, path, body }),
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data?.message || data?.error || `Notion API エラー（${res.status}）`);
        }
        return data;
    },

    /** 接続確認。自分の統合の情報が取れれば、トークンは有効。 */
    async testConnection() {
        const data = await this.call('GET', '/users/me');
        return { ok: true, 名前: data?.name || data?.bot?.owner?.type || '確認できました' };
    },

    /** 共有されているページ・データベースの一覧（検索） */
    async search(query = '') {
        const data = await this.call('POST', '/search', { query, page_size: 20 });
        return data?.results || [];
    },

    /**
     * データベースへ、1件のページ（行）を追加する。
     * properties は Notion API の形式（例: { '名前': { title: [{text:{content:'...'}}] } }）。
     * children を渡すと、ページ本文（ブロック）も一緒に作る。
     */
    async createPage(databaseId, properties, children) {
        const body = { parent: { database_id: databaseId }, properties };
        if (children) body.children = children;
        return this.call('POST', '/pages', body);
    },

    /** 見出し・段落だけの、シンプルな本文ブロックを作る（長い文章を渡すときの補助） */
    テキストブロックにする(text) {
        return (text || '')
            .split('\n')
            .filter((line) => line.trim())
            .slice(0, 90) // Notionは一度に作れるブロック数に上限があるため、念のため抑える
            .map((line) => ({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: line.slice(0, 2000) } }] },
            }));
    },
};

window.AReGLM_NOTION = AReGLM_NOTION;
