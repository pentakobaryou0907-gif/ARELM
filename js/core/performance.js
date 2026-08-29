/**
 * AReGLM パフォーマンス — デバウンス・キャッシュ・遅延描画
 */
const AReGLM_PERF = {
    _cache: new Map(),
    _cacheTtl: 8000,

    debounce(fn, ms = 280) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    },

    cached(key, fn) {
        const hit = this._cache.get(key);
        if (hit && Date.now() - hit.at < this._cacheTtl) return hit.data;
        const data = fn();
        this._cache.set(key, { data, at: Date.now() });
        return data;
    },

    invalidate(prefix) {
        for (const k of this._cache.keys()) {
            if (k.startsWith(prefix)) this._cache.delete(k);
        }
    },

    scheduleRender(fn) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(fn, { timeout: 120 });
        } else {
            requestAnimationFrame(fn);
        }
    },

    batchLocalWrite(key, value) {
        clearTimeout(this._writeTimer);
        this._pendingWrites = this._pendingWrites || {};
        this._pendingWrites[key] = value;
        this._writeTimer = setTimeout(() => {
            Object.entries(this._pendingWrites).forEach(([k, v]) => {
                localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            });
            this._pendingWrites = {};
            this.invalidate('');
        }, 400);
    }
};

window.AReGLM_PERF = AReGLM_PERF;
