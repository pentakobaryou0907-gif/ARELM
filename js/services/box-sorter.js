/**
 * 商品自動仕分け（箱詰め）エンジン
 * 元は自作Pythonツール「商品自動仕分けツール」(auto_box_sorter.py) のロジックを
 * このツール内で完結するようJavaScriptに移植したもの。外部送信なし。
 */
const AReGLM_BOX_SORTER = {
    RULES_KEY: 'areglm_box_category_rules',
    RESULT_KEY: 'areglm_box_sort_result',
    DEFAULT_CAPACITY: 5,

    defaultRules() {
        // AReGLMの実商品カテゴリを初期値にしておく（商品一覧CSVの実データに合わせて調整可能）
        return {
            'カジュアルスウェット': 'アパレル-トップス',
            'デニムジャケット': 'アパレル-アウター',
            'スキニーパンツ': 'アパレル-ボトムス',
            'スニーカー': 'アパレル-シューズ',
            'Tシャツ': 'アパレル-トップス',
            'パーカー': 'アパレル-トップス'
        };
    },

    loadRules() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.RULES_KEY) || 'null');
            return saved || this.defaultRules();
        } catch {
            return this.defaultRules();
        }
    },

    saveRules(rules) {
        localStorage.setItem(this.RULES_KEY, JSON.stringify(rules));
    },

    /**
     * 商品名の配列を受け取り、カテゴリごとに箱へ自動仕分けする。
     * 箱がいっぱいになったら自動で新しい箱（A→B→C…）を作る。
     * 未定義の商品名は「00」（未分類）箱へ。
     */
    sort(productNames, { rules, capacity } = {}) {
        rules = rules || this.loadRules();
        capacity = capacity || this.DEFAULT_CAPACITY;

        const boxes = {}; // prefix -> [{number, suffix, items[]}]
        const rows = [];
        let counter = 1;

        for (const rawName of productNames) {
            const name = String(rawName).trim();
            if (!name) continue;
            const prefix = rules[name] || '00-未分類';

            if (!boxes[prefix]) boxes[prefix] = [{ number: 1, suffix: 'A', items: [] }];
            let box = boxes[prefix][boxes[prefix].length - 1];

            if (box.items.length >= capacity) {
                const nextSuffix = String.fromCharCode(box.suffix.charCodeAt(0) + 1);
                box = { number: box.number, suffix: nextSuffix, items: [] };
                boxes[prefix].push(box);
            }
            box.items.push(name);

            rows.push({
                商品名: name,
                商品番号: String(counter).padStart(3, '0'),
                箱名: `${prefix}-${box.number}${box.suffix}`
            });
            counter += 1;
        }

        return rows;
    },

    /** 既存の在庫（products）から商品名リストを取り出す */
    productsAsNames() {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        return products.map((p) => p.name || p.title || p.商品名).filter(Boolean);
    },

    run(productNames, opts) {
        const rows = this.sort(productNames, opts);
        localStorage.setItem(this.RESULT_KEY, JSON.stringify({ at: new Date().toISOString(), rows }));
        if (window.logActivity) {
            logActivity(`商品自動仕分け: ${rows.length}件を箱詰め`, {
                category: 'inventory',
                text: `自動仕分け ${rows.length}件`
            });
        }
        return rows;
    },

    lastResult() {
        try {
            return JSON.parse(localStorage.getItem(this.RESULT_KEY) || 'null');
        } catch {
            return null;
        }
    },

    /** 結果をCSVとして書き出し（Excel互換） */
    toCsv(rows) {
        const header = '商品名,商品番号,箱名';
        const lines = rows.map((r) => [r.商品名, r.商品番号, r.箱名].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
        return [header, ...lines].join('\n');
    }
};

window.AReGLM_BOX_SORTER = AReGLM_BOX_SORTER;
