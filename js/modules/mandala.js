/**
 * 目標マンダラチャート
 * 「マンダラチャートテンプレート.xlsx」の構成（中央=目標／周囲8マス=アクションA〜H）を再現。
 * 目標を8つの具体的な行動に分解し、そのままタスクへ落とし込めるようにする。
 * この端末内（localStorage）のみで完結。
 */
const AREGLM_MANDALA_KEY = 'areglm_mandala';
const AREGLM_MANDALA_ACTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function initMandala() {
    renderMandala();
    document.getElementById('mandala-to-task-btn')?.addEventListener('click', mandalaActionsToTasks);
}

function loadMandala() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_MANDALA_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveMandala(data) {
    localStorage.setItem(AREGLM_MANDALA_KEY, JSON.stringify(data));
}

function renderMandala() {
    const box = document.getElementById('mandala-grid');
    if (!box) return;
    const data = loadMandala();

    // 3×3グリッド：中央が目標、周囲8マスがアクションA〜H
    const cells = [
        { key: 'A', label: 'アクション A' },
        { key: 'B', label: 'アクション B' },
        { key: 'C', label: 'アクション C' },
        { key: 'D', label: 'アクション D' },
        { key: 'goal', label: '目標' },
        { key: 'E', label: 'アクション E' },
        { key: 'F', label: 'アクション F' },
        { key: 'G', label: 'アクション G' },
        { key: 'H', label: 'アクション H' }
    ];

    box.innerHTML = cells
        .map(
            (c) => `<div class="mandala-cell${c.key === 'goal' ? ' mandala-goal' : ''}">
                <label>${AReGLM_SECURITY.sanitizeHtml(c.label)}</label>
                <textarea data-mandala-key="${c.key}" rows="3" placeholder="${c.key === 'goal' ? '達成したいこと' : 'そのために何をする？'}">${AReGLM_SECURITY.sanitizeHtml(data[c.key] || '')}</textarea>
            </div>`
        )
        .join('');

    box.querySelectorAll('textarea[data-mandala-key]').forEach((ta) => {
        ta.addEventListener('change', () => {
            const current = loadMandala();
            current[ta.dataset.mandalaKey] = ta.value;
            current.updatedAt = new Date().toISOString();
            saveMandala(current);
            if (window.AReGLM_LOCAL_AI) AReGLM_LOCAL_AI.learnLong(ta.value, 'goal');
            if (window.logActivity) {
                logActivity('マンダラチャートを更新', { category: 'goal', text: ta.value.slice(0, 300) });
            }
        });
    });
}

/** 記入済みのアクションをタスクとして登録する（重複は追加しない） */
function mandalaActionsToTasks() {
    const data = loadMandala();
    const actions = AREGLM_MANDALA_ACTIONS.map((k) => (data[k] || '').trim()).filter(Boolean);

    if (!actions.length) {
        showNotification('先にアクションを記入してください', 'info');
        return;
    }

    let tasks = [];
    try {
        tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
    } catch {
        tasks = [];
    }

    const existing = new Set(tasks.map((t) => t.title));
    let added = 0;
    actions.forEach((title) => {
        if (existing.has(title)) return;
        tasks.push({
            id: 'task_' + Date.now() + '_' + added,
            title,
            due: '',
            priority: 'normal',
            done: false,
            createdAt: new Date().toISOString()
        });
        added += 1;
    });

    localStorage.setItem('areglm_tasks', JSON.stringify(tasks));
    if (typeof renderTaskList === 'function') renderTaskList();

    showNotification(
        added ? `${added}件のアクションをタスクに追加しました` : 'すべて登録済みです',
        added ? 'success' : 'info'
    );
    if (window.logActivity && added) logActivity(`マンダラチャートから${added}件をタスク化`, { category: 'goal' });
}

window.initMandala = initMandala;
window.renderMandala = renderMandala;
