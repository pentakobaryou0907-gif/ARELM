/**
 * 同一役割(subRole)でより優れた公式無料APIがあれば、劣るAPIを自動除外
 */
const AReGLM_API_SELECTOR = {
    STORAGE_KEY: 'areglm_auto_excluded',

    getAutoExcluded() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    },

    saveAutoExcluded(map) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(map));
    },

    isFreeOfficial(meta) {
        return meta && meta.official === true && meta.freeTier === true;
    },

    isConfigured(cat, id) {
        const c = getApiConfig()[cat]?.[id];
        return !!(c?.apiKey || c?.connected);
    },

    /** カテゴリ内の有効API一覧（無料公式・手動除外・自動除外を反映） */
    getActiveForCategory(category) {
        const registry = AReGLM_API_REGISTRY[category];
        if (!registry) return [];

        const manualBlock = getApiConfig()._blocked || [];
        const autoEx = this.getAutoExcluded();
        const byRole = {};

        Object.entries(registry).forEach(([id, meta]) => {
            if (!this.isFreeOfficial(meta)) return;
            if (manualBlock.includes(`${category}:${id}`)) return;
            if (!this.isConfigured(category, id)) return;

            (meta.subRoles || ['default']).forEach((role) => {
                if (!byRole[role]) byRole[role] = [];
                byRole[role].push({ category, id, meta, score: meta.qualityScore || 0 });
            });
        });

        const active = [];
        const newAutoEx = { ...autoEx };
        if (!newAutoEx[category]) newAutoEx[category] = [];

        const autoOptimize = getApiConfig()._autoOptimize !== false;

        Object.entries(byRole).forEach(([role, list]) => {
            list.sort((a, b) => b.score - a.score);
            if (autoOptimize) {
                const winner = list[0];
                active.push({ ...winner, role });
                list.slice(1).forEach((loser) => {
                    const key = `${loser.id}:${role}`;
                    if (!newAutoEx[category].includes(key)) newAutoEx[category].push(key);
                });
            } else {
                list.forEach((item) => active.push({ ...item, role }));
            }
        });

        if (autoOptimize) this.saveAutoExcluded(newAutoEx);
        return active;
    },

    /** UI用: 全APIの状態 */
    getCatalogStatus() {
        const result = [];
        Object.entries(AReGLM_API_REGISTRY).forEach(([cat, providers]) => {
            const activeIds = new Set(this.getActiveForCategory(cat).map((a) => a.id));
            const autoEx = this.getAutoExcluded()[cat] || [];

            Object.entries(providers).forEach(([id, meta]) => {
                let status = 'inactive';
                if (!this.isFreeOfficial(meta)) status = 'blocked';
                else if (autoEx.some((k) => k.startsWith(id + ':'))) status = 'auto_excluded';
                else if (activeIds.has(id)) status = 'active';
                else if (this.isConfigured(cat, id)) status = 'standby';

                result.push({ category: cat, id, meta, status });
            });
        });
        return result;
    },

    getBestAiForRole(role) {
        return this.getActiveForCategory('ai').find((a) => a.role === role) || this.getActiveForCategory('ai')[0];
    },

    renderStatusList(containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const labels = {
            active: '使用中',
            auto_excluded: '自動除外',
            standby: '待機',
            inactive: '未設定',
            blocked: '対象外'
        };

        el.innerHTML = this.getCatalogStatus()
            .map((item) => {
                const cls = item.status;
                return `<span class="api-pill ${cls}" title="${item.meta.docs}">${AReGLM_SECURITY.sanitizeHtml(item.meta.name)} <small>${labels[item.status]}</small></span>`;
            })
            .join('');
    }
};

window.AReGLM_API_SELECTOR = AReGLM_API_SELECTOR;
window.getActiveApis = (cat) => AReGLM_API_SELECTOR.getActiveForCategory(cat);
