/**
 * Obsidian 連携 — Local REST APIプラグイン（無料）経由
 *
 * Obsidian側に無料のコミュニティプラグイン「Local REST API」を
 * 入れて有効にし、そこで発行されるAPIキーをARELMの設定に入れて使う。
 * この端末からObsidianのVaultへ、直接ノートを読み書きする。
 */
const AReGLM_OBSIDIAN = {
    async getKey() {
        return AReGLM_SECURITY.loadApiKeySecure('obsidian', 'key');
    },

    getPort() {
        return parseInt(localStorage.getItem('areglm_obsidian_port') || '27123', 10);
    },

    async call(method, path, body) {
        const key = await this.getKey();
        if (!key) throw new Error('ObsidianのAPIキー未設定 → 設定（⚙）');
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、Obsidianとつなげません。');
        }
        const res = await fetch('/api/obsidian-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Obsidian-Key': key },
            body: JSON.stringify({ method, path, body, port: this.getPort() }),
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data?.error || data?.hint || `Obsidian連携エラー（${res.status}）`);
        }
        return data;
    },

    /** 接続確認。サーバーの状態が取れれば、キー・ポートは有効。 */
    async testConnection() {
        const data = await this.call('GET', '/');
        return { ok: true, バージョン: data?.versions?.obsidian || '確認できました' };
    },

    /**
     * ノートを新規作成・上書き保存する（path は Vault内の相対パス。例: "ARELM/メモ.md"）。
     * Local REST APIの仕様上、本文は生のMarkdown文字列をそのまま送る。
     */
    async writeNote(path, markdown) {
        const 通り道 = `/vault/${path.split('/').map(encodeURIComponent).join('/')}`;
        return this.call('PUT', 通り道, markdown);
    },

    /** 既存ノートの末尾に追記する */
    async appendNote(path, markdown) {
        const 通り道 = `/vault/${path.split('/').map(encodeURIComponent).join('/')}`;
        return this.call('POST', 通り道, markdown);
    },
};

window.AReGLM_OBSIDIAN = AReGLM_OBSIDIAN;
