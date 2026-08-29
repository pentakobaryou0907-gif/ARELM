/**
 * 自作AIエンジン（Python）との連携
 *
 * 外部サービスではなく、この端末内で動く自作エンジンを呼ぶ。
 * 学習は「使いながら」行う方式で、操作するたびに1件ずつ覚えていく。
 * エンジンが起動していなくても、ツール本体の操作は妨げない設計にしている。
 */
const AReGLM_LOCAL_AI = {
    available: null, // null=未確認 / true=稼働中 / false=停止中

    async _post(path, body) {
        const res = await fetch('/api/ai-local' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `AI ${res.status}`);
        return data;
    },

    async health() {
        try {
            const res = await fetch('/api/ai-local/health');
            this.available = res.ok;
            return res.ok;
        } catch {
            this.available = false;
            return false;
        }
    },

    /** 1件学習させる。失敗しても操作を止めない。 */
    async learn(text, category) {
        if (!text || this.available === false) return null;
        try {
            return await this._post('/learn', { text, category });
        } catch {
            return null;
        }
    },

    /**
     * 長い文章を段落ごとに分けて学習させる。
     * 会話や資料をまるごと1件として渡すと語の共起がぼやけるため、
     * 意味のまとまりごとに分割して覚えさせる。
     */
    async learnLong(text, category, maxChunks = 20) {
        if (!text || this.available === false) return null;

        const chunks = String(text)
            .split(/\n{2,}|(?<=[。！？])\s*/)
            .map((s) => s.trim())
            .filter((s) => s.length >= 8);

        if (!chunks.length) return this.learn(text, category);

        let learned = 0;
        let blocked = 0;
        for (const chunk of chunks.slice(0, maxChunks)) {
            const r = await this.learn(chunk, category);
            if (r?.learned) learned += 1;
            else if (r?.blocked) blocked += 1;
        }
        return { learned, blocked, chunks: Math.min(chunks.length, maxChunks) };
    },

    /**
     * 会話の1往復を学習させる。
     * 自分の発言とAIの返答は役割が違うので別カテゴリで覚えさせ、
     * 「自分の言い回し」と「返ってきた知識」を混ぜないようにする。
     */
    async learnConversation(userText, assistantText, mode) {
        if (this.available === false) return null;
        const tag = mode ? `chat:${mode}` : 'chat';
        if (userText) await this.learnLong(userText, `${tag}:user`);
        if (assistantText) await this.learnLong(assistantText, `${tag}:reply`);
        return true;
    },

    /**
     * 学習内容を忘れさせる。
     * { term } 語を消す / { text } その文章の学習を取り消す
     * { category } カテゴリごと / { all: true } 全部
     */
    async forget(spec) {
        try {
            return await this._post('/forget', spec || {});
        } catch {
            return null;
        }
    },

    /**
     * 確実か推測かを明示した回答を得る。
     * 断定できないものは断定させないための入口。
     */
    async answer(text) {
        try {
            return await this._post('/answer', { text });
        } catch {
            return null;
        }
    },

    /**
     * 外部AIの回答を、鵜呑みにせず自分で分析する。
     * 数値・固有名詞を含む主張や、過去に誤りと分かった内容を洗い出す。
     */
    async analyze(text) {
        try {
            return await this._post('/analyze', { text });
        } catch {
            return null;
        }
    },

    /** 知識を出所つきで記録する */
    async addKnowledge(text, source = 'manual', topic = '', note = '') {
        try {
            return await this._post('/knowledge/add', { text, source, topic, note });
        } catch {
            return null;
        }
    },

    /** 記録した知識を検索する（過去の誤りも一緒に返る） */
    async searchKnowledge(query, topN = 5) {
        try {
            return await this._post('/knowledge/search', { query, topN });
        } catch {
            return null;
        }
    },

    /** 知識の正誤を記録する。間違いも消さずに残る。 */
    async verifyKnowledge(id, correct, note = '') {
        try {
            return await this._post('/knowledge/verify', { id, correct, note });
        } catch {
            return null;
        }
    },

    async classify(text) {
        try {
            return await this._post('/classify', { text });
        } catch {
            return null;
        }
    },

    async keywords(text, topN = 10) {
        try {
            return await this._post('/keywords', { text, topN });
        } catch {
            return null;
        }
    },

    async summary() {
        try {
            const res = await fetch('/api/ai-local/summary');
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    },

    /** 既存商品をエンジン側に登録し直す（似すぎ判定の比較対象） */
    async indexProducts() {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const items = products.map((p) => ({
            id: p.sku || p.id,
            text: [p.name, p.description, p.material, p.color].filter(Boolean).join(' '),
            attrs: {
                item: p.itemType || '',
                color: p.color || '',
                material: p.material || ''
            }
        }));
        try {
            return await this._post('/similarity/index', { items });
        } catch {
            return null;
        }
    },

    /** 新しい商品案が既存と似すぎていないか確認する */
    async checkSimilar(text, attrs) {
        try {
            return await this._post('/similarity/check', { text, attrs });
        } catch {
            return null;
        }
    }
};

window.AReGLM_LOCAL_AI = AReGLM_LOCAL_AI;
