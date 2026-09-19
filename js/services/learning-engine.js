/**
 * ARELM 学習エンジン
 * ------------------------------------------------------------
 * ツールを使うたびに「何をしたか」を蓄積し、傾向を分析して
 * AIチャットの応答やダッシュボードにフィードバックする。
 *
 * 外部AI・外部サービスへの送信は一切行わない。
 * すべてこの端末内（localStorage + サーバーのローカルファイル）で完結する、
 * 完全自作の軽量な学習・分析ロジック。
 */
const AReGLM_LEARNING = {
    STORAGE_KEY: 'areglm_learning_data',
    MAX_EVENTS: 1000,

    /** 現在の学習データを読み込む */
    load() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '') || this._empty();
        } catch {
            return this._empty();
        }
    },

    _empty() {
        return {
            events: [], // { at, category, tags[], mode, provider, text }
            counters: {}, // カテゴリ別の出現回数
            tagCounters: {}, // タグ（キーワード）別の出現回数
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    },

    save(data) {
        data.updatedAt = new Date().toISOString();
        if (data.events.length > this.MAX_EVENTS) {
            data.events = data.events.slice(-this.MAX_EVENTS);
        }
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        this.syncToServer(data);
        return data;
    },

    /** 簡易キーワード抽出（外部形態素解析APIは使わず、記号・助詞で素朴に分割） */
    extractTags(text) {
        if (!text) return [];
        const cleaned = String(text)
            .replace(/https?:\/\/\S+/g, '')
            .replace(/[、。！？!?・「」『』【】\[\]()（）,.\n\r\t]+/g, ' ');
        const stop = new Set([
            'の', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'や', 'から', 'まで',
            'です', 'ます', 'した', 'して', 'ので', 'こと', 'これ', 'それ', 'あれ',
            'the', 'and', 'for', 'with', 'this', 'that'
        ]);
        return cleaned
            .split(/\s+/)
            .map((w) => w.trim())
            .filter((w) => w.length >= 2 && w.length <= 20 && !stop.has(w.toLowerCase()))
            .slice(0, 12);
    },

    /**
     * 1件のアクションを記録する（作業のたびに呼ばれる学習の入口）
     * category: 'chat' | 'product' | 'sns' | 'inventory' | 'automation' | 'ec' | 'general'
     */
    record({ category = 'general', message = '', mode = '', provider = '', text = '' } = {}) {
        const data = this.load();
        const tags = this.extractTags(text || message);

        data.events.push({
            at: new Date().toISOString(),
            category,
            mode,
            provider,
            message,
            tags
        });

        data.counters[category] = (data.counters[category] || 0) + 1;
        if (mode) data.counters[`mode:${mode}`] = (data.counters[`mode:${mode}`] || 0) + 1;
        tags.forEach((t) => {
            data.tagCounters[t] = (data.tagCounters[t] || 0) + 1;
        });

        this.save(data);
        return data;
    },

    /** 上位N件のタグ・カテゴリを返す */
    topEntries(counterObj, n = 8) {
        return Object.entries(counterObj)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n);
    },

    /** 学習状況のサマリー（ダッシュボード表示用） */
    summary() {
        const data = this.load();
        return {
            totalEvents: data.events.length,
            topCategories: this.topEntries(data.counters, 6),
            topTags: this.topEntries(data.tagCounters, 10),
            updatedAt: data.updatedAt,
            since: data.createdAt
        };
    },

    /**
     * AIプロンプトに差し込む「学習済み傾向」の短文コンテキストを生成。
     * これによって使うほどにAIの提案がARELMの実際の作業内容に沿うようになる。
     */
    getContextSummary() {
        const data = this.load();
        if (!data.events.length) return '';

        const topTags = this.topEntries(data.tagCounters, 6).map(([t]) => t);
        const topCategories = this.topEntries(data.counters, 4).map(([c]) => c.replace(/^mode:/, ''));
        const recent = data.events.slice(-5).map((e) => e.message).filter(Boolean);

        let ctx = `[学習済みの傾向: 累計${data.events.length}件の作業から蓄積]\n`;
        if (topCategories.length) ctx += `よく使う機能: ${topCategories.join('、')}\n`;
        if (topTags.length) ctx += `頻出キーワード: ${topTags.join('、')}\n`;
        if (recent.length) ctx += `直近の作業: ${recent.join(' / ')}\n`;
        return ctx;
    },

    /** サーバー側にも永続化（ブラウザデータ消去に備えた保存先。外部送信ではなく自分のローカルサーバーのみ） */
    async syncToServer(data) {
        try {
            const gateway = await AReGLM_API_CLIENT?.health?.();
            if (!gateway) return;
            await fetch('/api/learning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch {
            /* サーバー未起動時は localStorage のみで動作継続 */
        }
    },

    /** サーバーに保存されている学習データを取り込む（別端末・別ブラウザとの統合） */
    async pullFromServer() {
        try {
            const res = await fetch('/api/learning');
            if (!res.ok) return null;
            const serverData = await res.json();
            if (!serverData || !serverData.events) return null;

            const local = this.load();
            const seen = new Set(local.events.map((e) => e.at));
            const merged = local.events.concat(serverData.events.filter((e) => !seen.has(e.at)));
            merged.sort((a, b) => new Date(a.at) - new Date(b.at));

            const combined = this._empty();
            combined.createdAt = serverData.createdAt || local.createdAt;
            merged.forEach((e) => {
                combined.events.push(e);
                combined.counters[e.category] = (combined.counters[e.category] || 0) + 1;
                if (e.mode) combined.counters[`mode:${e.mode}`] = (combined.counters[`mode:${e.mode}`] || 0) + 1;
                (e.tags || []).forEach((t) => {
                    combined.tagCounters[t] = (combined.tagCounters[t] || 0) + 1;
                });
            });
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(combined));
            return combined;
        } catch {
            return null;
        }
    }
};

window.AReGLM_LEARNING = AReGLM_LEARNING;
