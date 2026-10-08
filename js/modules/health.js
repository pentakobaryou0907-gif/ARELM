/**
 * 体調の記録とアシスト
 *
 * 目的:
 *   無理をしすぎていないかを、自分で気づけるようにする。
 *   一人で作業を進めていると、疲れに気づくのが遅れるため。
 *
 * 扱い方:
 *   - 体調は最も個人的な情報なので、この端末から一切出さない
 *   - 外部AIにも送らない（自作AIにも学習させない）
 *   - 診断はしない。医療の判断はできないため、気づきを促すだけにする
 *
 * 記録するもの: 睡眠時間・気分・体の調子・ひとこと
 */

const AREGLM_HEALTH_KEY = 'areglm_health';

const MOOD_LEVELS = [
    { v: 5, label: 'とても良い' },
    { v: 4, label: '良い' },
    { v: 3, label: 'ふつう' },
    { v: 2, label: '良くない' },
    { v: 1, label: 'とても悪い' }
];

function initHealth() {
    document.getElementById('health-form')?.addEventListener('submit', saveHealthToday);
    renderHealth();
}

function loadHealth() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_HEALTH_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveHealthList(list) {
    localStorage.setItem(AREGLM_HEALTH_KEY, JSON.stringify(list));
}

function saveHealthToday(e) {
    e.preventDefault();

    const today = 今日();
    const entry = {
        date: today,
        sleep: parseFloat(document.getElementById('health-sleep')?.value) || null,
        mood: parseInt(document.getElementById('health-mood')?.value, 10) || null,
        body: parseInt(document.getElementById('health-body')?.value, 10) || null,
        note: document.getElementById('health-note')?.value?.trim() || '',
        at: new Date().toISOString()
    };

    const list = loadHealth().filter((h) => h.date !== today);
    list.push(entry);
    saveHealthList(list);

    document.getElementById('health-note').value = '';
    renderHealth();
    showNotification('今日の体調を記録しました', 'success');

    // 体調は個人的な情報なので、活動履歴には内容を残さない
    if (window.logActivity) logActivity('体調を記録', { category: 'health', text: '体調を記録' });
}

/**
 * 記録から気づきを出す。
 * 診断はせず、事実と、そこから言えることだけを伝える。
 */
function healthInsights(list) {
    const notes = [];
    if (list.length < 2) {
        return ['何日か記録すると、傾向が見えるようになります。'];
    }

    const recent = list.slice(-7);

    // 睡眠
    const sleeps = recent.map((h) => h.sleep).filter((v) => typeof v === 'number');
    if (sleeps.length >= 3) {
        const avg = sleeps.reduce((a, b) => a + b, 0) / sleeps.length;
        notes.push(`直近${sleeps.length}日の睡眠は平均${avg.toFixed(1)}時間です。`);
        if (avg < 6) {
            notes.push('睡眠が短い日が続いています。作業の詰め込みすぎかもしれません。');
        }
    }

    // 気分・体の調子が下がり続けていないか
    const moods = recent.map((h) => h.mood).filter((v) => typeof v === 'number');
    if (moods.length >= 3) {
        const last3 = moods.slice(-3);
        if (last3.every((v, i) => i === 0 || v <= last3[i - 1]) && last3[last3.length - 1] <= 2) {
            notes.push('気分が下がり続けています。予定を減らすことも選択肢です。');
        }
    }

    const bodies = recent.map((h) => h.body).filter((v) => typeof v === 'number');
    if (bodies.length >= 3 && bodies.slice(-3).every((v) => v <= 2)) {
        notes.push('体の調子が良くない日が続いています。無理をしないでください。');
    }

    // 記録が途切れていないか
    const lastDate = list[list.length - 1]?.date;
    if (lastDate) {
        const gap = Math.round(
            (new Date(今日()) - new Date(lastDate)) / 86400000
        );
        if (gap >= 3) notes.push(`${gap}日ぶりの記録です。`);
    }

    if (!notes.length) notes.push('大きな変化はありません。');
    return notes;
}

/** 体調とタスク量を見比べて、詰め込みすぎていないか伝える */
function healthWorkloadCheck(list) {
    const today = 今日();
    const latest = list[list.length - 1];
    if (!latest || latest.date !== today) return null;

    let tasks = [];
    try {
        tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
    } catch {
        tasks = [];
    }

    const open = tasks.filter((t) => !t.done).length;
    const poor = (latest.mood && latest.mood <= 2) || (latest.body && latest.body <= 2);
    const short = latest.sleep !== null && latest.sleep < 6;

    if (poor && open >= 5) {
        return `体調が良くない日に未完了のタスクが${open}件あります。今日は優先度の高いものだけに絞ることをおすすめします。`;
    }
    if (short && open >= 8) {
        return `睡眠が${latest.sleep}時間で、未完了のタスクが${open}件あります。詰め込みすぎかもしれません。`;
    }
    return null;
}

function renderHealth() {
    const box = document.getElementById('health-status');
    if (!box) return;

    const list = loadHealth().sort((a, b) => (a.date < b.date ? -1 : 1));
    const today = 今日();
    const todayEntry = list.find((h) => h.date === today);

    // 今日すでに記録していれば、フォームに反映する
    if (todayEntry) {
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el && v !== null && v !== undefined) el.value = v;
        };
        set('health-sleep', todayEntry.sleep);
        set('health-mood', todayEntry.mood);
        set('health-body', todayEntry.body);
    }

    if (!list.length) {
        box.innerHTML = '<p class="hint">まだ記録がありません。今日の分から始めてみてください。</p>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    const insights = healthInsights(list);
    const workload = healthWorkloadCheck(list);

    // 直近14日を簡単な棒で表す
    const recent = list.slice(-14);
    const bars = recent
        .map((h) => {
            const m = h.mood || 0;
            const height = m ? m * 18 : 4;
            const day = h.date.slice(5).replace('-', '/');
            return `<div class="health-bar" title="${s(day)} 気分${m || '-'} 睡眠${h.sleep ?? '-'}h">
                <span style="height:${height}px" class="hb-fill level-${m}"></span>
                <small>${s(day.slice(-2))}</small>
            </div>`;
        })
        .join('');

    box.innerHTML = `
        ${workload ? `<div class="health-alert">${s(workload)}</div>` : ''}
        <div class="health-chart">${bars}</div>
        <ul class="health-insights">
            ${insights.map((n) => `<li>${s(n)}</li>`).join('')}
        </ul>
        <p class="hint">記録した内容はこの端末から出ません。外部AIにも送りません。
        体調の判断は医療の専門家にご相談ください。ここでは気づきをお伝えするだけです。</p>`;
}

window.initHealth = initHealth;
window.renderHealth = renderHealth;
window.healthWorkloadCheck = healthWorkloadCheck;
