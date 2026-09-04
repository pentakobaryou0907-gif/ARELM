/**
 * カレンダー（予定・タスクの月表示）
 *
 * タスクの期限と、カレンダー専用の予定をまとめて月単位で見る。
 * 基本はこの端末内（localStorage）で完結するが、設定（⚙）でiCloud
 * カレンダー連携（js/services/icloud-caldav-api.js）をしていれば、
 * 表示中の月のiCloud側の予定も一緒に読み込んで重ねて表示する
 * （読み取りのみ。iCloud側の予定はこの画面からは削除できない）。
 */
const AREGLM_EVENT_KEY = 'areglm_events';

let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-11
let icloud予定キャッシュ = []; // {date, title, source:'icloud'}

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

async function handleEventAdd(e) {
    e.preventDefault();
    const dateEl = document.getElementById('event-date');
    const titleEl = document.getElementById('event-title');
    const icloudEl = document.getElementById('event-icloud-also');
    const date = dateEl?.value;
    const title = titleEl?.value?.trim();
    const iCloudにも = !!icloudEl?.checked;
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

    // 「iCloudにも追加」が付いていて連携済みなら、iCloud側にも作る。
    // 失敗してもローカルの予定は既に保存済みなので、通知だけして続ける。
    if (iCloudにも && window.AReGLM_ICLOUD_CAL && (await AReGLM_ICLOUD_CAL.isConnected())) {
        const カレンダー = AReGLM_ICLOUD_CAL.getKnownCalendars();
        if (カレンダー[0]) {
            try {
                await AReGLM_ICLOUD_CAL.createEvent(カレンダー[0].href, { title, startISO: date, endISO: date, allDay: true });
                icloud最後に読んだ月 = null; // 今作った予定をすぐ表示に反映させる
                showNotification('iCloudにも予定を追加しました', 'success');
            } catch (err) {
                showNotification('iCloudへの追加に失敗しました: ' + err.message, 'error');
            }
        } else {
            showNotification('iCloud側のカレンダーが見つかりません（設定でもう一度「接続する」を押してください）', 'error');
        }
    }

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

/**
 * 表示中の月のiCloud側の予定を読み込む。
 * 未接続・失敗時は静かに空配列にする（ローカルの予定表示自体は妨げない）。
 */
async function iCloud予定を読み込む() {
    if (!window.AReGLM_ICLOUD_CAL || !(await AReGLM_ICLOUD_CAL.isConnected())) {
        icloud予定キャッシュ = [];
        return;
    }
    const カレンダー = AReGLM_ICLOUD_CAL.getKnownCalendars();
    if (!カレンダー.length) { icloud予定キャッシュ = []; return; }

    const 月初 = new Date(calendarYear, calendarMonth, 1);
    const 月末 = new Date(calendarYear, calendarMonth + 1, 1);
    const 結果 = [];
    for (const cal of カレンダー) {
        try {
            const 予定たち = await AReGLM_ICLOUD_CAL.listEvents(cal.href, 月初.toISOString(), 月末.toISOString());
            予定たち.forEach((e) => {
                // e.start は「20260905」（終日）か「20260905T093000Z」（時刻あり）の形。
                // 先頭8桁だけ拾えば、どちらでも YYYY-MM-DD が作れる。
                const 数字だけ = (e.start || '').replace(/[^0-9]/g, '');
                if (数字だけ.length < 8) return;
                const dateStr = `${数字だけ.slice(0, 4)}-${数字だけ.slice(4, 6)}-${数字だけ.slice(6, 8)}`;
                結果.push({ date: dateStr, title: e.title || '(無題)', source: 'icloud', calendarName: cal.name });
            });
        } catch {
            // 1つのカレンダーで失敗しても、他のカレンダー・ローカル表示は続ける
        }
    }
    icloud予定キャッシュ = 結果;
}

/** その日に紐づく予定とタスクをまとめて返す */
function itemsForDate(dateStr, events, tasks) {
    const items = [];
    events.filter((e) => e.date === dateStr).forEach((e) => {
        items.push({ kind: 'event', id: e.id, title: e.title });
    });
    icloud予定キャッシュ.filter((e) => e.date === dateStr).forEach((e) => {
        items.push({ kind: 'icloud', title: e.title });
    });
    tasks.filter((t) => t.due === dateStr).forEach((t) => {
        items.push({ kind: 'task', id: t.id, title: t.title, done: t.done, priority: t.priority });
    });
    return items;
}

let icloud最後に読んだ月 = null;

async function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('calendar-label');
    if (!grid) return;

    // 月をまたいだ時だけ読み直す（同じ月の中での再描画のたびに毎回iCloudへ
    // 取りに行くと遅いし、無駄な通信になる）
    const 月キー = `${calendarYear}-${calendarMonth}`;
    if (icloud最後に読んだ月 !== 月キー) {
        icloud最後に読んだ月 = 月キー;
        await iCloud予定を読み込む();
    }
    const hint = document.getElementById('calendar-icloud-hint');
    if (hint) {
        hint.textContent = icloud予定キャッシュ.length
            ? `iCloudから ${icloud予定キャッシュ.length}件の予定を表示しています`
            : '';
    }

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
                : it.kind === 'icloud' ? 'cal-item icloud' : 'cal-item event';
            html += `<div class="${cls}" title="${AReGLM_SECURITY.escapeAttr(it.title)}">${it.kind === 'icloud' ? '☁ ' : ''}${s(it.title)}</div>`;
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
    icloud予定キャッシュ.forEach((e) => {
        if (e.date >= today) list.push({ date: e.date, title: e.title, kind: 'icloud' });
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
                <span class="upcoming-kind">${it.kind === 'task' ? 'タスク' : it.kind === 'icloud' ? '☁iCloud' : '予定'}</span>
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
