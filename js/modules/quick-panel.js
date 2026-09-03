/**
 * クイックパネル
 *
 * どのページを開いていても、下から引き出して主要な操作ができる。
 * ページを移動しないので、作業の途中でも手が止まらない。
 *
 * できること:
 *   - タスク・メモをその場で追加
 *   - 在庫や商品をその場で調べる
 *   - エージェントに指示を出す
 *   - 各ページへ移動する
 *
 * 開き方: 右下のボタン、または ⌘K（Ctrl+K）
 */

let quickPanelOpen = false;

function initQuickPanel() {
    document.getElementById('quick-fab')?.addEventListener('click', toggleQuickPanel);
    document.getElementById('quick-close')?.addEventListener('click', closeQuickPanel);
    document.getElementById('quick-overlay')?.addEventListener('click', closeQuickPanel);

    // タブの切り替え
    document.querySelectorAll('.quick-tab').forEach((btn) => {
        btn.addEventListener('click', () => switchQuickTab(btn.dataset.qtab));
    });

    document.getElementById('quick-task-form')?.addEventListener('submit', quickAddTask);
    document.getElementById('quick-memo-form')?.addEventListener('submit', quickAddMemo);
    document.getElementById('quick-ai-form')?.addEventListener('submit', quickAskAi);
    document.getElementById('quick-search-input')?.addEventListener('input', quickSearch);

    // どのページからでも ⌘K / Ctrl+K で開ける
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            toggleQuickPanel();
        }
        if (e.key === 'Escape' && quickPanelOpen) closeQuickPanel();
    });

    renderQuickJump();
}

function toggleQuickPanel() {
    quickPanelOpen ? closeQuickPanel() : openQuickPanel();
}

function openQuickPanel() {
    const panel = document.getElementById('quick-panel');
    const overlay = document.getElementById('quick-overlay');
    if (!panel) return;

    panel.classList.add('open');
    overlay?.classList.add('open');
    quickPanelOpen = true;

    // 開いたらすぐ入力できるようにする
    setTimeout(() => document.getElementById('quick-search-input')?.focus(), 100);
    refreshQuickStatus();
}

function closeQuickPanel() {
    document.getElementById('quick-panel')?.classList.remove('open');
    document.getElementById('quick-overlay')?.classList.remove('open');
    quickPanelOpen = false;
}

function switchQuickTab(tab) {
    document.querySelectorAll('.quick-tab').forEach((b) => {
        b.classList.toggle('active', b.dataset.qtab === tab);
    });
    document.querySelectorAll('.quick-pane').forEach((p) => {
        p.classList.toggle('active', p.id === `quick-pane-${tab}`);
    });
}

/* ---------- その場で追加 ---------- */

function quickAddTask(e) {
    e.preventDefault();
    const input = document.getElementById('quick-task-title');
    const due = document.getElementById('quick-task-due');
    const title = input?.value?.trim();
    if (!title) return;

    const tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
    tasks.push({
        id: 'task_' + Date.now(),
        title,
        due: due?.value || '',
        priority: 'normal',
        done: false,
        createdAt: new Date().toISOString()
    });
    localStorage.setItem('areglm_tasks', JSON.stringify(tasks));

    e.target.reset();
    // 開いているページがホームなら、その場で一覧も更新する
    if (typeof renderTaskList === 'function') renderTaskList();
    if (typeof renderCalendar === 'function') renderCalendar();
    showNotification(`タスクを追加しました:「${title}」`, 'success');
    if (window.logActivity) logActivity('タスクを追加（クイック）', { category: 'task', text: title });
    refreshQuickStatus();
}

function quickAddMemo(e) {
    e.preventDefault();
    const input = document.getElementById('quick-memo-body');
    const body = input?.value?.trim();
    if (!body) return;

    const memos = JSON.parse(localStorage.getItem('areglm_memos') || '[]');
    memos.unshift({
        id: 'memo_' + Date.now(),
        title: '',
        body,
        pinned: false,
        createdAt: new Date().toISOString()
    });
    localStorage.setItem('areglm_memos', JSON.stringify(memos));

    e.target.reset();
    if (typeof renderMemoList === 'function') renderMemoList();
    showNotification('メモを追加しました', 'success');
    if (window.logActivity) logActivity('メモを追加（クイック）', { category: 'memo', text: body });
}

/* ---------- その場で調べる ---------- */

function quickSearch(e) {
    const q = e.target.value.trim();
    const box = document.getElementById('quick-search-results');
    if (!box) return;

    if (!q) {
        box.innerHTML = '<p class="hint">商品名・SKU・メモの内容などで探せます。</p>';
        return;
    }

    const lower = q.toLowerCase();
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    const results = [];

    const pick = (key) => {
        try {
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch {
            return [];
        }
    };

    // 商品
    pick('products')
        .filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(lower))
        .slice(0, 5)
        .forEach((p) => {
            results.push(
                `<div class="quick-result"><span class="qr-kind">商品</span>
                 <span>${s(p.name)}</span>
                 <small>在庫${s(p.quantity ?? 0)} / ¥${Number(p.price || 0).toLocaleString('ja-JP')}</small></div>`
            );
        });

    // タスク
    pick('areglm_tasks')
        .filter((t) => String(t.title).toLowerCase().includes(lower))
        .slice(0, 5)
        .forEach((t) => {
            results.push(
                `<div class="quick-result"><span class="qr-kind">タスク</span>
                 <span>${s(t.title)}</span>
                 <small>${t.done ? '完了' : s(t.due || '期限なし')}</small></div>`
            );
        });

    // メモ
    pick('areglm_memos')
        .filter((m) => `${m.title} ${m.body}`.toLowerCase().includes(lower))
        .slice(0, 5)
        .forEach((m) => {
            results.push(
                `<div class="quick-result"><span class="qr-kind">メモ</span>
                 <span>${s(String(m.body).slice(0, 40))}</span></div>`
            );
        });

    // ブランド
    pick('brands')
        .filter((b) => String(b.name).toLowerCase().includes(lower))
        .slice(0, 3)
        .forEach((b) => {
            results.push(
                `<div class="quick-result"><span class="qr-kind">ブランド</span>
                 <span>${s(b.name)}</span><small>${s(b.category || '')}</small></div>`
            );
        });

    box.innerHTML = results.length
        ? results.join('')
        : '<p class="hint">見つかりませんでした。</p>';
}

/* ---------- エージェントに聞く ---------- */

async function quickAskAi(e) {
    e.preventDefault();
    const input = document.getElementById('quick-ai-input');
    const out = document.getElementById('quick-ai-answer');
    const text = input?.value?.trim();
    if (!text || !out) return;

    out.innerHTML = '<p class="hint">考えています…</p>';
    input.value = '';

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));

    try {
        const res = await fetch('/api/ai-local/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            // 会話の目印。これが無いと毎回「初対面」になり、話が続かない。
            session_id: getSessionId(),
                text,
                context: {
                    today: 今日(),
                    products: JSON.parse(localStorage.getItem('products') || '[]'),
                    tasks: JSON.parse(localStorage.getItem('areglm_tasks') || '[]'),
                    events: JSON.parse(localStorage.getItem('areglm_events') || '[]')
                }
            })
        });
        const d = await res.json();

        // 答えを組み立てて入れていた。ストッパーが見つけた。
        // 守ってはいたが、組み立てる書き方そのものをやめる。
        out.textContent = '';
        const 枠 = document.createElement('div');
        枠.className = 'quick-answer ' + (d.ok ? 'known' : 'unknown');

        const 本 = document.createElement('p');
        本.textContent = d.answer || '';
        本.style.whiteSpace = 'pre-wrap';
        枠.appendChild(本);

        if (d.sources && d.sources.length) {
            const 根拠 = document.createElement('small');
            根拠.textContent = '根拠: ' + d.sources.join('、');
            枠.appendChild(根拠);
        }
        out.appendChild(枠);
    } catch {
        out.innerHTML = '<p class="hint">エージェントに接続できませんでした。</p>';
    }
}

/* ---------- 移動 ---------- */

function renderQuickJump() {
    const box = document.getElementById('quick-jump');
    if (!box) return;

    const pages = [
        { id: 'dashboard', label: 'ホーム', icon: '⌂' },
        { id: 'mainai', label: 'エージェント', icon: '◈' },
        { id: 'chat', label: 'AIチャット', icon: '✦' },
        { id: 'brands', label: 'ブランド', icon: '◆' },
        { id: 'sns', label: 'SNS', icon: '◎' },
        { id: 'inventory', label: '在庫', icon: '▣' },
        { id: 'studio', label: '商品開発', icon: '✎' },
        { id: 'tasks', label: '作業状況', icon: '🔄' },
        { id: 'settings', label: '設定', icon: '⚙' }
    ];

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v);
    box.innerHTML = pages
        .map(
            (p) =>
                `<button type="button" class="quick-jump-btn" data-page="${s(p.id)}">
                    <span class="qj-icon">${s(p.icon)}</span>${s(p.label)}
                 </button>`
        )
        .join('');

    box.querySelectorAll('.quick-jump-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (typeof window.areglmNavigate === 'function') {
                window.areglmNavigate(btn.dataset.page);
            }
            closeQuickPanel();
        });
    });
}

/** 今の状況を短く出す（開いたときに一目で分かるように） */
function refreshQuickStatus() {
    const box = document.getElementById('quick-status');
    if (!box) return;

    const today = 今日();
    const pick = (k) => {
        try {
            return JSON.parse(localStorage.getItem(k) || '[]');
        } catch {
            return [];
        }
    };

    const tasks = pick('areglm_tasks').filter((t) => !t.done);
    const overdue = tasks.filter((t) => t.due && t.due < today).length;
    const products = pick('products');
    const low = products.filter((p) => (p.quantity || 0) <= (p.reorderLevel || 5)).length;

    const items = [];
    if (overdue) items.push(`<span class="qs-warn">期限切れ ${overdue}</span>`);
    items.push(`未完了 ${tasks.length}`);
    if (low) items.push(`<span class="qs-warn">要補充 ${low}</span>`);
    items.push(`商品 ${products.length}`);

    box.innerHTML = items.join(' · ');
}

window.initQuickPanel = initQuickPanel;
window.openQuickPanel = openQuickPanel;
