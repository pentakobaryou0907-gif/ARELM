/**
 * 時間帯による見た目の切り替え
 *
 * 目的: 長時間使っても目が疲れないようにする。
 *
 * 昼は明るく、夕方は暖色寄りに、夜は暗くして光量を落とす。
 * 夜間はブルーライトが強いと目が疲れやすいため、
 * 全体を少し暖色に寄せる。
 *
 * 自分で固定することもできる（設定は端末内に保存）。
 */

const AREGLM_THEME_KEY = 'areglm_theme_mode';

/**
 * 時間帯の区切り。
 * 夕方から徐々に暖かく、夜は暗くする。
 */
const THEME_SCHEDULE = [
    { id: 'morning', from: 5, to: 10, label: '朝' },
    { id: 'day', from: 10, to: 16, label: '昼' },
    { id: 'evening', from: 16, to: 19, label: '夕方' },
    { id: 'night', from: 19, to: 23, label: '夜' },
    { id: 'midnight', from: 23, to: 5, label: '深夜' }
];

function currentPeriod(date = new Date()) {
    const h = date.getHours();
    for (const p of THEME_SCHEDULE) {
        // 深夜のように日をまたぐ区間も正しく判定する
        if (p.from < p.to ? h >= p.from && h < p.to : h >= p.from || h < p.to) {
            return p;
        }
    }
    return THEME_SCHEDULE[1];
}

/* ------------------------------------------------------------------
   明暗を逆にする

   時間帯に合わせて夜は暗くしているが、
   人によっては逆のほうが目が楽なことがある。
   明るい／暗いを入れ替えられるようにする。

   時間帯そのものは変えない。色合い（朝の柔らかさ、夕方の暖かさ）は
   残したまま、明るさだけを入れ替える。
   ------------------------------------------------------------------ */

const AREGLM_THEME_FLIP_KEY = 'areglm_theme_flip';

/** 明暗を入れ替えた相手。左右どちらからでも引けるようにしてある。 */
const 明暗の相手 = {
    morning: 'night',
    day: 'midnight',
    evening: 'night',
    night: 'morning',
    midnight: 'day',
};

function isThemeFlipped() {
    return localStorage.getItem(AREGLM_THEME_FLIP_KEY) === 'true';
}

function setThemeFlipped(on) {
    localStorage.setItem(AREGLM_THEME_FLIP_KEY, on ? 'true' : 'false');
}

function loadThemeMode() {
    return localStorage.getItem(AREGLM_THEME_KEY) || 'auto';
}

function saveThemeMode(mode) {
    localStorage.setItem(AREGLM_THEME_KEY, mode);
}

/** 今あてる見た目を決める。固定されていればそれを使う。 */
function resolveTheme() {
    const mode = loadThemeMode();
    const 基本 = mode !== 'auto' ? mode : currentPeriod().id;
    if (!isThemeFlipped()) return 基本;
    return 明暗の相手[基本] || 基本;
}

function applyTheme() {
    const theme = resolveTheme();
    document.documentElement.setAttribute('data-theme', theme);
    renderThemeStatus();
    return theme;
}

function initTheme() {
    applyTheme();

    // 時間帯をまたいだら自動で切り替える（1分ごとに確認）
    setInterval(() => {
        if (loadThemeMode() === 'auto') applyTheme();
    }, 60000);

    // 明暗の入れ替え
    const flip = document.getElementById('theme-flip');
    if (flip) {
        flip.checked = isThemeFlipped();
        flip.addEventListener('change', (e) => {
            setThemeFlipped(e.target.checked);
            applyTheme();
            showNotification(
                e.target.checked ? '背景の明暗を逆にしました' : '背景を元に戻しました',
                'success'
            );
        });
    }

    document.getElementById('theme-mode')?.addEventListener('change', (e) => {
        saveThemeMode(e.target.value);
        applyTheme();
        const label = e.target.options[e.target.selectedIndex].textContent;
        showNotification(`見た目を「${label}」にしました`, 'success');
    });
}

function renderThemeStatus() {
    const sel = document.getElementById('theme-mode');
    if (sel) sel.value = loadThemeMode();

    const el = document.getElementById('theme-status');
    if (!el) return;

    const mode = loadThemeMode();
    const now = currentPeriod();
    el.textContent =
        mode === 'auto'
            ? `今は「${now.label}」の見た目です（時間帯に合わせて自動で変わります）`
            : '固定中です。自動に戻すと時間帯で変わります。';
}

window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.currentPeriod = currentPeriod;
