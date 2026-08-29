/**
 * 馴染み機能（パーソナライズ）
 *
 * 革が使う人の形になじんでいくように、
 * 使うほどこのツールの並びや見え方が持ち主に合っていくようにする。
 *
 * 大事にしていること:
 *  1. 勝手に変えて戻せない、という状態を作らない。
 *     変化のたびに前の姿を保存し、いつでも戻せるようにする。
 *  2. 本人の指示が最優先。
 *     「この並びで固定」と言われたら、以後そこは自動で動かさない。
 *  3. 変化は「更新」を押したときだけ起きる。
 *     操作の途中で急に画面が変わると使いにくいため。
 */

const AREGLM_PERSONALIZE_KEY = 'areglm_personalize';
const AREGLM_PERSONALIZE_HISTORY_KEY = 'areglm_personalize_history';

// 何回か使ってから馴染ませ始める。使い始めから動くと落ち着かないため。
const ADAPT_MIN_ACTIONS = 20;

function defaultPersonalize() {
    return {
        version: 0,
        usage: {},          // 機能ID -> 使った回数
        pinned: [],         // 本人が固定した機能ID（自動で動かさない）
        order: null,        // ホームの並び（nullなら既定の順）
        navOrder: null,     // 下メニューの並び
        adaptedAt: null,
        auto: true          // 自動で馴染ませるかどうか
    };
}

function loadPersonalize() {
    try {
        return { ...defaultPersonalize(), ...JSON.parse(localStorage.getItem(AREGLM_PERSONALIZE_KEY) || '{}') };
    } catch {
        return defaultPersonalize();
    }
}

function savePersonalize(p) {
    localStorage.setItem(AREGLM_PERSONALIZE_KEY, JSON.stringify(p));
}

function loadPersonalizeHistory() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_PERSONALIZE_HISTORY_KEY) || '[]');
    } catch {
        return [];
    }
}

function savePersonalizeHistory(list) {
    // 履歴は消さずに残す。戻れなくなるのを防ぐため上限は多めにとる。
    localStorage.setItem(AREGLM_PERSONALIZE_HISTORY_KEY, JSON.stringify(list.slice(-50)));
}

/* ---------- 使用状況の記録 ---------- */

/**
 * 機能が使われたことを記録する。
 * ここでは画面を変えない。変化は「馴染ませる」を押したときだけ起きる。
 */
function recordUsage(featureId) {
    if (!featureId) return;
    const p = loadPersonalize();
    p.usage[featureId] = (p.usage[featureId] || 0) + 1;
    savePersonalize(p);
}

function totalActions(p) {
    return Object.values(p.usage).reduce((s, n) => s + n, 0);
}

/* ---------- 馴染ませる ---------- */

/**
 * 使用回数をもとに、ホームの並びを組み直す。
 * 固定された機能は動かさない。
 */
function computeOrder(p, sections) {
    const pinned = new Set(p.pinned || []);

    // 固定されたものは今の位置のまま、それ以外を使用回数順に並べ替える
    const movable = sections.filter((s) => !pinned.has(s.id));
    movable.sort((a, b) => (p.usage[b.id] || 0) - (p.usage[a.id] || 0));

    const result = [];
    let mi = 0;
    sections.forEach((s) => {
        if (pinned.has(s.id)) result.push(s.id);
        else result.push(movable[mi++].id);
    });
    return result;
}

/** ホーム画面の各セクションを拾う（idとタイトル） */
function collectHomeSections() {
    const container = document.querySelector('#dashboard-page .container');
    if (!container) return [];
    return Array.from(container.querySelectorAll(':scope > section.panel-card')).map((el, i) => {
        if (!el.dataset.sectionId) {
            // 見出しからIDを作る。無ければ位置で決める。
            const title = el.querySelector('h3')?.textContent?.trim() || `section-${i}`;
            el.dataset.sectionId = title.replace(/\s+/g, '').slice(0, 24);
        }
        return { id: el.dataset.sectionId, el };
    });
}

/**
 * 今の姿を履歴に残してから、馴染ませた姿に変える。
 * 履歴があるので、いつでも前の姿に戻せる。
 */
function adaptNow(silent = false) {
    const p = loadPersonalize();
    if (!p.auto) return { changed: false, reason: '自動で馴染ませる設定がオフです' };

    const acted = totalActions(p);
    if (acted < ADAPT_MIN_ACTIONS) {
        return { changed: false, reason: `もう少し使うと馴染み始めます（${acted}/${ADAPT_MIN_ACTIONS}）` };
    }

    const sections = collectHomeSections();
    if (!sections.length) return { changed: false, reason: 'ホーム画面が見つかりません' };

    const newOrder = computeOrder(p, sections);
    const current = p.order || sections.map((s) => s.id);

    if (JSON.stringify(newOrder) === JSON.stringify(current)) {
        return { changed: false, reason: 'すでに今の使い方に馴染んでいます' };
    }

    // 変える前の姿を残す
    const history = loadPersonalizeHistory();
    history.push({
        at: new Date().toISOString(),
        version: p.version,
        order: current,
        usageSnapshot: { ...p.usage }
    });
    savePersonalizeHistory(history);

    p.order = newOrder;
    p.version += 1;
    p.adaptedAt = new Date().toISOString();
    savePersonalize(p);

    applyPersonalize();

    if (!silent) {
        showNotification(`ツールがあなたの使い方に馴染みました（第${p.version}形）`, 'success');
        if (window.logActivity) logActivity(`ツールが馴染みました（第${p.version}形）`, { category: 'personalize' });
    }
    return { changed: true, version: p.version };
}

/** 保存された並びを画面に反映する */
function applyPersonalize() {
    const p = loadPersonalize();
    if (!p.order) return;

    const sections = collectHomeSections();
    const map = new Map(sections.map((s) => [s.id, s.el]));
    const container = document.querySelector('#dashboard-page .container');
    if (!container) return;

    p.order.forEach((id) => {
        const el = map.get(id);
        if (el) container.appendChild(el);
    });
}

/* ---------- 戻す ---------- */

/**
 * ひとつ前の姿に戻す。
 * わがままではなく正当な指示として扱う。何度でも戻せる。
 */
function revertPersonalize() {
    const history = loadPersonalizeHistory();
    if (!history.length) {
        showNotification('戻せる姿がありません（まだ変化していません）', 'info');
        return false;
    }

    const prev = history.pop();
    savePersonalizeHistory(history);

    const p = loadPersonalize();
    p.order = prev.order;
    p.version = prev.version;
    p.adaptedAt = new Date().toISOString();
    savePersonalize(p);

    applyPersonalize();
    renderPersonalizePanel();
    showNotification(`前の姿に戻しました（第${prev.version}形）`, 'success');
    if (window.logActivity) logActivity(`前の姿に戻しました（第${prev.version}形）`, { category: 'personalize' });
    return true;
}

/** 最初の姿に戻す（履歴は消さない） */
function resetPersonalize() {
    if (!confirm('最初の並びに戻します。よろしいですか？\n（これまでの変化の記録は残るので、また馴染ませられます）')) {
        return;
    }
    const p = loadPersonalize();

    const history = loadPersonalizeHistory();
    history.push({
        at: new Date().toISOString(),
        version: p.version,
        order: p.order,
        usageSnapshot: { ...p.usage }
    });
    savePersonalizeHistory(history);

    p.order = null;
    p.version = 0;
    savePersonalize(p);

    location.reload(); // 既定の並びに戻すため読み直す
}

/** 今の並びを固定する。以後そこは自動で動かさない。 */
function pinCurrentOrder() {
    const p = loadPersonalize();
    const sections = collectHomeSections();
    p.pinned = sections.map((s) => s.id);
    p.auto = false;
    savePersonalize(p);
    renderPersonalizePanel();
    showNotification('今の並びで固定しました。以後、勝手には変わりません', 'success');
}

/** 固定を解除して、また馴染むようにする */
function unpinOrder() {
    const p = loadPersonalize();
    p.pinned = [];
    p.auto = true;
    savePersonalize(p);
    renderPersonalizePanel();
    showNotification('また使い方に合わせて馴染むようにしました', 'success');
}

/* ---------- 画面 ---------- */

function initPersonalize() {
    applyPersonalize();

    document.getElementById('personalize-adapt')?.addEventListener('click', () => {
        const r = adaptNow();
        if (!r.changed) showNotification(r.reason, 'info');
        renderPersonalizePanel();
    });
    document.getElementById('personalize-revert')?.addEventListener('click', revertPersonalize);
    document.getElementById('personalize-reset')?.addEventListener('click', resetPersonalize);
    document.getElementById('personalize-pin')?.addEventListener('click', pinCurrentOrder);
    document.getElementById('personalize-unpin')?.addEventListener('click', unpinOrder);

    // ページを開くたびに使用回数を記録する
    // 下のメニュー・ヘッダーのボタン・ホームの機能カード、すべてを対象にする
    document.querySelectorAll('.bottom-nav-item, .nav-link[data-page], [data-goto]').forEach((el) => {
        el.addEventListener('click', () => recordUsage(el.dataset.page || el.dataset.goto));
    });

    renderPersonalizePanel();
}

function renderPersonalizePanel() {
    const box = document.getElementById('personalize-status');
    if (!box) return;

    const p = loadPersonalize();
    const history = loadPersonalizeHistory();
    const acted = totalActions(p);

    const top = Object.entries(p.usage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => `${AReGLM_SECURITY.sanitizeHtml(k)}(${v})`)
        .join('、');

    const state = p.auto
        ? (acted < ADAPT_MIN_ACTIONS
            ? `馴染み始めるまであと${ADAPT_MIN_ACTIONS - acted}回`
            : '使い方に合わせて馴染みます')
        : '今の並びで固定中';

    box.innerHTML = `
        <div class="pricing-metrics">
            <div class="pricing-metric"><span>今の姿</span><strong>第${p.version}形</strong></div>
            <div class="pricing-metric"><span>使った回数</span><strong>${acted}</strong></div>
            <div class="pricing-metric"><span>戻せる姿</span><strong>${history.length}</strong></div>
        </div>
        <p class="hint">状態: ${AReGLM_SECURITY.sanitizeHtml(state)}</p>
        ${top ? `<p class="hint">よく使う機能: ${top}</p>` : ''}
        ${p.adaptedAt ? `<p class="hint">最後に馴染んだ日: ${new Date(p.adaptedAt).toLocaleString('ja-JP')}</p>` : ''}`;

    const pinBtn = document.getElementById('personalize-pin');
    const unpinBtn = document.getElementById('personalize-unpin');
    if (pinBtn) pinBtn.style.display = p.auto ? '' : 'none';
    if (unpinBtn) unpinBtn.style.display = p.auto ? 'none' : '';
}

window.initPersonalize = initPersonalize;
window.recordUsage = recordUsage;
window.adaptNow = adaptNow;
window.revertPersonalize = revertPersonalize;
window.renderPersonalizePanel = renderPersonalizePanel;
