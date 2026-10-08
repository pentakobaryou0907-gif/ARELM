/**
 * ARELM パフォーマンス — デバウンス・キャッシュ・遅延描画
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

    /**
     * 省電力インターバル ― タブが裏にある間は中身を実行しない setInterval。
     *
     * 画面の再描画・監視表示など「見ている人がいなければ意味がない」処理向け。
     * タブが裏に回っている間は fn を呼ばず、表に戻った瞬間に一度だけ
     * 追いついて実行する（間隔を待たせて古い表示のままにしない）。
     *
     * 通知チェックや裏作業のポーリングなど「見ていなくても進める必要がある」
     * 処理には使わないこと（そちらは今まで通り setInterval のままでよい）。
     *
     * 戻り値は { id, stop() } 。id は clearInterval にそのまま渡せる。
     */
    smartInterval(fn, ms) {
        let missed = false;
        const tick = () => {
            if (document.hidden) { missed = true; return; }
            missed = false;
            fn();
        };
        const onVisible = () => {
            if (!document.hidden && missed) {
                missed = false;
                fn();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        const id = setInterval(tick, ms);
        return {
            id,
            stop() {
                clearInterval(id);
                document.removeEventListener('visibilitychange', onVisible);
            },
        };
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
