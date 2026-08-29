/**
 * カレンダー（予定・タスクの月表示）
 *
 * タスクの期限と、カレンダー専用の予定をまとめて月単位で見る。
 * すべてこの端末内（localStorage）で完結し、外部カレンダーとは連携しない。
 */
const AREGLM_EVENT_KEY = 'areglm_events';

let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-11

function initCalendar() {
    document.getElementById('cal-prev')?.addEventListener('click', () => shiftMonth(-1));
    document.getElementById('cal-next')?.addEventListener('click', () => shiftMonth(1));
    document.getElementById('cal-today')?.addEventListener('click', () => {
        const now = new Date();
        calendarYear = now.getFullYear();
        calendarMonth = now.getMonth();
        renderCalendar();
    });
    document.getElementById('event-form')?.addEventListener('submit', handleEventAdd);
    renderCalendar();
}

function shiftMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear -= 1;
    } else if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear += 1;
    }
    renderCalendar();
}

function loadEvents() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_EVENT_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveEvents(events) {
    localStorage.setItem(AREGLM_EVENT_KEY, JSON.stringify(events));
}

function handleEventAdd(e) {
    e.preventDefault();
    const dateEl = document.getElementById('event-date');
    const titleEl = document.getElementById('event-title');
    const date = dateEl?.value;
    const title = titleEl?.value?.trim();
    if (!date || !title) return;

    const policy = AReGLM_CONTENT_POLICY.validate(title);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    const events = loadEvents();
    events.push({
        id: 'ev_' + Date.now(),
        date,
        title,
        createdAt: new Date().toISOString()
    });
    saveEvents(events);

    e.target.reset();
    // 追加した予定の月へ移動して、その場で確認できるようにする
    const d = new Date(date + 'T00:00:00');
    calendarYear = d.getFullYear();
    calendarMonth = d.getMonth();
    renderCalendar();

    if (window.AReGLM_LOCAL_AI) AReGLM_LOCAL_AI.learn(title, 'schedule');
    if (window.logActivity) logActivity('予定を追加', { category: 'schedule', text: title });
}

function deleteEvent(id) {
    saveEvents(loadEvents().filter((e) => e.id !== id));
    renderCalendar();
}

/** その日に紐づく予定とタスクをまとめて返す */
function itemsForDate(dateStr, events, tasks) {
    const items = [];
    events.filter((e) => e.date === dateStr).forEach((e) => {
        items.push({ kind: 'event', id: e.id, title: e.title });
    });
    tasks.filter((t) => t.due === dateStr).forEach((t) => {
        items.push({ kind: 'task', id: t.id, title: t.title, done: t.done, priority: t.priority });
    });
    return items;
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('calendar-label');
    if (!grid) return;

    const events = loadEvents();
    let tasks = [];
    try {
        tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
    } catch {
        tasks = [];
    }

    if (label) label.textContent = `${calendarYear}年 ${calendarMonth + 1}月`;

    const first = new Date(calendarYear, calendarMonth, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const startWeekday = first.getDay(); // 0=日
    const todayStr = 今日();

    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    let html = weekdays
        .map((w, i) => `<div class="cal-head${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`)
        .join('');

    // 月初までの空きマス
    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-cell empty"></div>';
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');

    for (let day = 1; day <= daysInMonth; day++) {
        // ローカル時刻で日付文字列を作る（toISOStringだと時差でずれるため）
        const mm = String(calendarMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dateStr = `${calendarYear}-${mm}-${dd}`;

        const weekday = new Date(calendarYear, calendarMonth, day).getDay();
        const items = itemsForDate(dateStr, events, tasks);
        const isToday = dateStr === todayStr;

        html += `<div class="cal-cell${isToday ? ' today' : ''}${weekday === 0 ? ' sun' : weekday === 6 ? ' sat' : ''}">
            <div class="cal-day">${day}</div>`;

        items.slice(0, 4).forEach((it) => {
            const cls = it.kind === 'task'
                ? `cal-item task${it.done ? ' done' : ''}${it.priority === 'high' ? ' high' : ''}`
                : 'cal-item event';
            html += `<div class="${cls}" title="${AReGLM_SECURITY.escapeAttr(it.title)}">${s(it.title)}</div>`;
        });
        if (items.length > 4) {
            html += `<div class="cal-more">他${items.length - 4}件</div>`;
        }

        html += '</div>';
    }

    grid.innerHTML = html;
    renderUpcoming(events, tasks);
}

/** 直近の予定を一覧で出す（月表示だけだと見落とすため） */
function renderUpcoming(events, tasks) {
    const box = document.getElementById('calendar-upcoming');
    if (!box) return;

    const today = 今日();
    const list = [];

    events.forEach((e) => {
        if (e.date >= today) list.push({ date: e.date, title: e.title, kind: 'event', id: e.id });
    });
    tasks.forEach((t) => {
        if (t.due && !t.done && t.due >= today) {
            list.push({ date: t.due, title: t.title, kind: 'task', id: t.id });
        }
    });

    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    if (!list.length) {
        box.innerHTML = '<p class="hint">今後の予定はありません。</p>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    box.innerHTML = list
        .slice(0, 8)
        .map((it) => {
            const d = new Date(it.date + 'T00:00:00');
            const days = Math.round((d - new Date(today + 'T00:00:00')) / 86400000);
            const when = days === 0 ? '今日' : days === 1 ? '明日' : `${days}日後`;
            return `<li class="upcoming-item">
                <span class="upcoming-when${days === 0 ? ' now' : ''}">${when}</span>
                <span class="upcoming-date">${s(it.date)}</span>
                <span class="upcoming-title">${s(it.title)}</span>
                <span class="upcoming-kind">${it.kind === 'task' ? 'タスク' : '予定'}</span>
                ${it.kind === 'event' ? `<button type="button" class="btn-link danger" data-ev="${s(it.id)}">削除</button>` : ''}
            </li>`;
        })
        .join('');

    box.querySelectorAll('[data-ev]').forEach((btn) => {
        btn.addEventListener('click', () => deleteEvent(btn.dataset.ev));
    });
}

window.initCalendar = initCalendar;
window.renderCalendar = renderCalendar;
window.deleteEvent = deleteEvent;
