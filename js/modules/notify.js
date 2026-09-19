/**
 * 通知
 *
 * 期限切れのタスクや在庫切れなど、見落とすと困ることを知らせる。
 * ブラウザ標準の通知APIを使い、外部サービスは使わない。
 *
 * 方針:
 *  - 同じ内容を何度も通知しない（うるさいと無視されるようになるため）
 *  - 重要でないものは通知しない。画面上の表示だけにとどめる
 *  - 許可されていなければ何もしない（勝手に求めない）
 */
const AREGLM_NOTIFY_STATE_KEY = 'areglm_notify_state';
const AREGLM_NOTIFY_INTERVAL_MS = 30 * 60 * 1000; // 30分ごとに確認

function initNotify() {
    document.getElementById('notify-enable')?.addEventListener('click', requestNotifyPermission);
    renderNotifyStatus();

    // 起動直後と、以降30分ごとに確認する
    setTimeout(checkAndNotify, 10000);
    setInterval(checkAndNotify, AREGLM_NOTIFY_INTERVAL_MS);
}

function notifySupported() {
    return typeof Notification !== 'undefined';
}

async function requestNotifyPermission() {
    if (!notifySupported()) {
        showNotification('このブラウザは通知に対応していません', 'error');
        return;
    }
    const result = await Notification.requestPermission();
    renderNotifyStatus();
    if (result === 'granted') {
        showNotification('通知を有効にしました', 'success');
        checkAndNotify();
    } else {
        showNotification('通知は許可されませんでした', 'info');
    }
}

function renderNotifyStatus() {
    const el = document.getElementById('notify-status');
    if (!el) return;

    if (!notifySupported()) {
        el.textContent = 'このブラウザは通知に対応していません';
        return;
    }

    const map = {
        granted: '通知は有効です（期限切れ・在庫切れをお知らせします）',
        denied: '通知はブロックされています。ブラウザの設定から許可してください',
        default: '通知はまだ有効になっていません'
    };
    el.textContent = map[Notification.permission] || '';

    const btn = document.getElementById('notify-enable');
    if (btn) btn.style.display = Notification.permission === 'granted' ? 'none' : '';
}

function loadNotifyState() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_NOTIFY_STATE_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveNotifyState(state) {
    localStorage.setItem(AREGLM_NOTIFY_STATE_KEY, JSON.stringify(state));
}

/**
 * 同じ内容を繰り返し通知しないための判定。
 * 同一キーは1日1回までにする。
 */
function shouldNotify(key) {
    const state = loadNotifyState();
    const today = 今日();
    if (state[key] === today) return false;
    state[key] = today;
    saveNotifyState(state);
    return true;
}

/** 知らせるべきことを集める。通知の有無に関わらず画面表示にも使う。 */
function collectAlerts() {
    const today = 今日();
    const alerts = [];

    let tasks = [];
    let products = [];
    let events = [];
    try {
        tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
        products = JSON.parse(localStorage.getItem('products') || '[]');
        events = JSON.parse(localStorage.getItem('areglm_events') || '[]');
    } catch {
        /* 壊れていても通知処理で落とさない */
    }

    const overdue = tasks.filter((t) => !t.done && t.due && t.due < today);
    if (overdue.length) {
        alerts.push({
            key: `overdue-${today}`,
            title: `期限切れのタスクが${overdue.length}件あります`,
            body: overdue.slice(0, 3).map((t) => t.title).join('、'),
            level: 'high'
        });
    }

    const dueToday = tasks.filter((t) => !t.done && t.due === today);
    if (dueToday.length) {
        alerts.push({
            key: `duetoday-${today}`,
            title: `今日が期限のタスクが${dueToday.length}件あります`,
            body: dueToday.slice(0, 3).map((t) => t.title).join('、'),
            level: 'normal'
        });
    }

    const todayEvents = events.filter((e) => e.date === today);
    if (todayEvents.length) {
        alerts.push({
            key: `event-${today}`,
            title: `今日の予定が${todayEvents.length}件あります`,
            body: todayEvents.slice(0, 3).map((e) => e.title).join('、'),
            level: 'normal'
        });
    }

    const outOfStock = products.filter((p) => (p.quantity || 0) === 0);
    if (outOfStock.length) {
        alerts.push({
            key: `outofstock-${today}`,
            title: `在庫切れの商品が${outOfStock.length}件あります`,
            body: outOfStock.slice(0, 3).map((p) => p.name).join('、'),
            level: 'high'
        });
    }

    return alerts;
}

function checkAndNotify() {
    const alerts = collectAlerts();
    renderAlertPanel(alerts);

    if (!notifySupported() || Notification.permission !== 'granted') return;

    // 重要なものだけ通知する。細かいものまで出すと無視されるようになる。
    alerts
        .filter((a) => a.level === 'high')
        .forEach((a) => {
            if (!shouldNotify(a.key)) return;
            try {
                new Notification(`ARELM — ${a.title}`, {
                    body: a.body,
                    tag: a.key,           // 同じタグは上書きされ、積み上がらない
                    requireInteraction: false
                });
            } catch {
                /* 通知に失敗しても操作は妨げない */
            }
        });
}

function renderAlertPanel(alerts) {
    const box = document.getElementById('alert-panel');
    if (!box) return;

    if (!alerts.length) {
        box.innerHTML = '<p class="hint">急ぎの用件はありません。</p>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    box.innerHTML = alerts
        .map(
            (a) => `<div class="alert-item level-${s(a.level)}">
                <strong>${s(a.title)}</strong>
                ${a.body ? `<span>${s(a.body)}</span>` : ''}
            </div>`
        )
        .join('');
}

window.initNotify = initNotify;
window.checkAndNotify = checkAndNotify;
