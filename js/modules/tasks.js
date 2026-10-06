/**
 * タスク・予定管理（簡易カレンダー機能）
 * この端末内（localStorage）のみで完結。外部カレンダー連携なし。
 */
const AREGLM_TASK_KEY = 'areglm_tasks';

function initTasks() {
    document.getElementById('task-form')?.addEventListener('submit', handleTaskSubmit);
    renderTaskList();
}

function loadTasks() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_TASK_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveTasks(tasks) {
    localStorage.setItem(AREGLM_TASK_KEY, JSON.stringify(tasks));
}

function handleTaskSubmit(e) {
    e.preventDefault();
    const titleInput = document.getElementById('task-title');
    const dueInput = document.getElementById('task-due');
    const timeInput = document.getElementById('task-time');
    const repeatSel = document.getElementById('task-repeat');
    const remindChk = document.getElementById('task-remind');
    const prioritySel = document.getElementById('task-priority');
    const title = titleInput?.value?.trim();
    if (!title) return;

    const policy = AReGLM_CONTENT_POLICY.validate(title);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    const tasks = loadTasks();
    tasks.push({
        id: 'task_' + Date.now(),
        title,
        due: dueInput?.value || '',
        // 時刻。空なら「その日のうち」という扱いにする。
        time: timeInput?.value || '',
        // 繰り返し。終わったときに次回分を自動で作る。
        repeat: repeatSel?.value || '',
        // 期限が来たら知らせるか
        remind: remindChk ? remindChk.checked : true,
        // 知らせ済みかどうか。同じことを何度も知らせないため。
        reminded: false,
        priority: prioritySel?.value || 'normal',
        done: false,
        createdAt: new Date().toISOString()
    });
    saveTasks(tasks);

    if (titleInput) titleInput.value = '';
    if (dueInput) dueInput.value = '';
    if (timeInput) timeInput.value = '';
    // 繰り返しと知らせるかは、続けて同じ設定で足すことが多いので残す
    if (prioritySel) prioritySel.value = 'normal';
    renderTaskList();
    if (window.logActivity) logActivity('タスクを追加', { category: 'task', text: title });
}

function renderTaskList() {
    const box = document.getElementById('task-list');
    if (!box) return;

    const today = 今日();
    const tasks = loadTasks().sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const ad = a.due || '9999-99-99';
        const bd = b.due || '9999-99-99';
        if (ad !== bd) return ad < bd ? -1 : 1;
        const order = { high: 0, normal: 1, low: 2 };
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
    });

    if (!tasks.length) {
        box.innerHTML = '<li class="hint">タスクはありません</li>';
        return;
    }

    box.innerHTML = tasks
        .map((t) => {
            const overdue = !t.done && t.due && t.due < today;
            return `<li class="task-item${t.done ? ' done' : ''}${overdue ? ' overdue' : ''}">
                <label>
                    <input type="checkbox" data-id="${t.id}" data-action="toggle" ${t.done ? 'checked' : ''}>
                    <span class="task-title">${AReGLM_SECURITY.sanitizeHtml(t.title)}</span>
                </label>
                <span class="task-meta">
                    ${t.due ? `<span class="task-due${overdue ? ' overdue' : ''}">${AReGLM_SECURITY.sanitizeHtml(t.due)}${t.time ? ' ' + AReGLM_SECURITY.sanitizeHtml(t.time) : ''}${!t.done && typeof 残り時間の言い方 === 'function' ? `<em class="task-left">${AReGLM_SECURITY.sanitizeHtml(残り時間の言い方(t))}</em>` : ''}</span>` : ''}
                    ${t.repeat ? `<span class="task-repeat">${{ daily: '毎日', weekday: '平日', weekly: '毎週', monthly: '毎月' }[t.repeat] || ''}</span>` : ''}
                    ${t.remind === false ? '' : '<span class="task-bell" title="期限に知らせます">🔔</span>'}
                    <span class="task-priority priority-${AReGLM_SECURITY.sanitizeHtml(t.priority)}">${{ high: '重要', normal: '通常', low: '低' }[t.priority] || '通常'}</span>
                    <button type="button" class="btn-link danger" data-id="${t.id}" data-action="delete">削除</button>
                </span>
                ${タスクの中身(t)}
            </li>`;
        })
        .join('');

    box.querySelectorAll('[data-action="toggle"]').forEach((el) => {
        el.addEventListener('change', () => toggleTask(el.dataset.id));
    });
    box.querySelectorAll('[data-action="delete"]').forEach((el) => {
        el.addEventListener('click', () => deleteTask(el.dataset.id));
    });
    box.querySelectorAll('[data-action="check"]').forEach((el) => {
        el.addEventListener('change', () => タスクのチェックを切り替える(el.dataset.id, Number(el.dataset.index)));
    });
}

/** 目的／完了条件／必要素材／手順／チェック／ログ項目 を持つタスクだけ、開ける中身を出す */
function タスクの中身(t) {
    if (!t.目的 && !t.完了条件 && !(t.手順 || []).length && !(t.チェック || []).length) return '';
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    const 並べる = (名, 列) => (列 || []).length
        ? `<div class="task-detail-row"><b>${名}</b><ol>${列.map((x) => `<li>${s(x)}</li>`).join('')}</ol></div>` : '';
    const チェック = t.チェック || [];
    const 済 = チェック.filter((c) => c.済).length;
    return `<details class="task-detail">
        <summary>中身を見る${チェック.length ? `（チェック ${済}/${チェック.length}）` : ''}</summary>
        ${t.目的 ? `<div class="task-detail-row"><b>目的</b><span>${s(t.目的)}</span></div>` : ''}
        ${t.完了条件 ? `<div class="task-detail-row"><b>完了条件</b><span>${s(t.完了条件)}</span></div>` : ''}
        ${並べる('必要素材', t.必要素材)}
        ${並べる('手順', t.手順)}
        ${チェック.length ? `<div class="task-detail-row"><b>チェック</b><ul class="task-checks">${チェック.map((c, i) => `<li><label>
            <input type="checkbox" data-action="check" data-id="${t.id}" data-index="${i}" ${c.済 ? 'checked' : ''}> ${s(c.文)}</label></li>`).join('')}</ul></div>` : ''}
        ${(t.ログ項目 || []).length ? `<div class="task-detail-row"><b>ログに残すこと</b><span>${t.ログ項目.map(s).join('・')}</span></div>` : ''}
    </details>`;
}

function タスクのチェックを切り替える(id, i) {
    const tasks = loadTasks();
    const t = tasks.find((x) => x.id === id);
    if (!t || !t.チェック || !t.チェック[i]) return;
    t.チェック[i].済 = !t.チェック[i].済;
    saveTasks(tasks);
    renderTaskList();
    const 開く = document.querySelector(`#task-list [data-action="check"][data-id="${CSS.escape(id)}"]`)?.closest('details');
    if (開く) 開く.open = true;
}

function toggleTask(id) {
    const tasks = loadTasks();
    const t = tasks.find((x) => x.id === id);
    if (t) {
        t.done = !t.done;
        // やり直したときは、また知らせられるように印を外す
        if (!t.done) t.reminded = false;
    }
    saveTasks(tasks);
    renderTaskList();
    if (typeof 今日の運用を描く === 'function') 今日の運用を描く();

    // 繰り返しのものは、終わった時点で次回分を作る
    if (t && t.done && t.repeat && typeof 繰り返しの次を作る === 'function') {
        繰り返しの次を作る(id);
    }
}

function deleteTask(id) {
    // 消さずに不要ボックスへ移す。
    // 「消さないで不要へ」という決まりを、ツールの中にも通す。
    const t = loadTasks().find((x) => x.id === id);
    if (t && typeof 不要ボックスへ入れる === 'function') {
        不要ボックスへ入れる('task', t, t.title);
    }
    saveTasks(loadTasks().filter((x) => x.id !== id));
    renderTaskList();
}

window.initTasks = initTasks;
window.renderTaskList = renderTaskList;

/* ==========================================================
   期限の見張りと、繰り返し

   これまで期限は日付だけで、過ぎても何も起きなかった。
   リマインダーとして使えるように、
     ・時刻まで指定できる
     ・期限が来たら知らせる
     ・終わったら次回分を自動で作る
   を足してある。

   すべてこの端末の中だけで動く。外部へは一切送らない。
   ========================================================== */

/** 期限を「日付＋時刻」として1つの時刻に直す */
function 期限の時刻(t) {
    if (!t.due) return null;
    // 時刻が無いときは、その日の終わりを期限とみなす。
    // 「今日中」と言われて朝から急かされても困るため。
    const 時刻 = t.time || '23:59';
    const d = new Date(`${t.due}T${時刻}`);
    return isNaN(d.getTime()) ? null : d;
}

/** 期限までの残り時間を、読める言葉にする */
function 残り時間の言い方(t) {
    const 期限 = 期限の時刻(t);
    if (!期限) return '';

    const 差 = 期限.getTime() - Date.now();
    const 分 = Math.round(差 / 60000);

    if (分 < 0) {
        const 過ぎた = -分;
        if (過ぎた < 60) return `${過ぎた}分すぎ`;
        if (過ぎた < 60 * 24) return `${Math.floor(過ぎた / 60)}時間すぎ`;
        return `${Math.floor(過ぎた / 60 / 24)}日すぎ`;
    }
    if (分 < 60) return `あと${分}分`;
    if (分 < 60 * 24) return `あと${Math.floor(分 / 60)}時間`;
    return `あと${Math.floor(分 / 60 / 24)}日`;
}

/**
 * 次回の期限を出す。
 *
 * 「平日のみ」は、土日に当たったら月曜へ送る。
 * 週末に催促しても意味がないため。
 */
function 次回の期限(t) {
    if (!t.repeat || !t.due) return null;

    const d = new Date(`${t.due}T00:00`);
    if (isNaN(d.getTime())) return null;

    switch (t.repeat) {
        case 'daily':
            d.setDate(d.getDate() + 1);
            break;
        case 'weekday':
            do {
                d.setDate(d.getDate() + 1);
            } while (d.getDay() === 0 || d.getDay() === 6);
            break;
        case 'weekly':
            d.setDate(d.getDate() + 7);
            break;
        case 'monthly': {
            // 月末の扱い。1月31日の翌月は2月31日にならないよう、
            // その月に無い日は月末に寄せる。
            const 日 = d.getDate();
            d.setDate(1);
            d.setMonth(d.getMonth() + 1);
            const 月末 = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(日, 月末));
            break;
        }
        default:
            return null;
    }

    return 日付文字(d);
}

/**
 * 期限を見張り、来ていたら知らせる。
 *
 * 1分ごとに見ているが、やること全体を数えるだけなので軽い。
 * 同じことを何度も知らせないよう、知らせ済みの印を付ける。
 */
function 期限を見張る() {
    const tasks = loadTasks();
    if (!tasks.length) return;

    let 変わった = false;
    const 今 = Date.now();

    tasks.forEach((t) => {
        if (t.done || !t.remind || t.reminded) return;
        const 期限 = 期限の時刻(t);
        if (!期限) return;
        if (期限.getTime() > 今) return;

        t.reminded = true;
        変わった = true;

        if (typeof showNotification === 'function') {
            showNotification(`期限です: ${t.title}`, t.priority === 'high' ? 'error' : 'warn');
        }
    });

    if (変わった) {
        saveTasks(tasks);
        renderTaskList();
    }
}

/**
 * 終わったやることが繰り返しなら、次回分を作る。
 *
 * 元のものは「終わった記録」として残す。
 * 消してしまうと、いつやったかが分からなくなるため。
 */
function 繰り返しの次を作る(id) {
    const tasks = loadTasks();
    const t = tasks.find((x) => x.id === id);
    if (!t || !t.done || !t.repeat) return;

    const 次 = 次回の期限(t);
    if (!次) return;

    // すでに次回分があるなら作らない（二重に増えないように）
    const ある = tasks.some((x) => !x.done && x.title === t.title && x.due === 次);
    if (ある) return;

    tasks.push({
        id: 'task_' + Date.now(),
        title: t.title,
        due: 次,
        time: t.time || '',
        repeat: t.repeat,
        remind: t.remind,
        reminded: false,
        priority: t.priority,
        done: false,
        createdAt: new Date().toISOString(),
    });
    saveTasks(tasks);
    renderTaskList();

    if (typeof showNotification === 'function') {
        showNotification(`次回分を作りました: ${t.title}（${次}）`, 'success');
    }
}

/** 見張りを始める */
function initTaskReminder() {
    期限を見張る();
    setInterval(期限を見張る, 60000);
}

window.期限の時刻 = 期限の時刻;
window.残り時間の言い方 = 残り時間の言い方;
window.次回の期限 = 次回の期限;
window.繰り返しの次を作る = 繰り返しの次を作る;
window.initTaskReminder = initTaskReminder;
