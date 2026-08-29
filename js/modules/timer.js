/**
 * タイマー
 *
 * 作業の区切りを付けるためのもの。
 *
 * 画面を離れても正しく数えるため、
 * 「あと何秒」ではなく「いつ終わるか」を持っている。
 * 残り秒数を減らしていく作りだと、
 * 別のタブを見ている間に数えが止まってずれる。
 *
 * すべてこの端末の中だけで動く。外部へは一切送らない。
 */

const AREGLM_TIMER_KEY = 'areglm_timer';

let タイマーの針 = null;

function タイマーを読む() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_TIMER_KEY) || 'null');
    } catch {
        return null;
    }
}

function タイマーを保存(t) {
    if (t) localStorage.setItem(AREGLM_TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(AREGLM_TIMER_KEY);
}

/**
 * 始める。
 * @param {number} 分 何分はかるか
 * @param {string} 名前 何のための時間か
 */
function タイマーを始める(分, 名前) {
    分 = Number(分) || 0;
    if (分 <= 0) {
        showNotification('何分はかるかを入れてください', 'error');
        return;
    }

    タイマーを保存({
        終わり: Date.now() + 分 * 60000,
        分,
        名前: (名前 || '').trim() || '作業',
        知らせた: false,
    });
    タイマーを回す();
    renderTimer();
}

function タイマーを止める() {
    タイマーを保存(null);
    clearInterval(タイマーの針);
    タイマーの針 = null;
    renderTimer();
}

/** 残りを数える。1秒ごとに見るが、中身は引き算だけなので軽い。 */
function タイマーを回す() {
    clearInterval(タイマーの針);
    タイマーの針 = setInterval(() => {
        const t = タイマーを読む();
        if (!t) { clearInterval(タイマーの針); タイマーの針 = null; return; }

        if (Date.now() >= t.終わり && !t.知らせた) {
            t.知らせた = true;
            タイマーを保存(t);
            if (typeof showNotification === 'function') {
                showNotification(`時間になりました: ${t.名前}（${t.分}分）`, 'warn');
            }
            鳴らす();
        }
        renderTimer();
    }, 1000);
}

/**
 * 音で知らせる。
 *
 * 音のファイルを持たず、その場で波を作って鳴らす。
 * ファイルを置くと、それが外部由来かどうかの管理が要るため。
 */
function 鳴らす() {
    try {
        const 音 = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.3, 0.6].forEach((ずれ) => {
            const o = 音.createOscillator();
            const g = 音.createGain();
            o.type = 'sine';
            o.frequency.value = 880;
            // 急に鳴らすと耳に刺さるので、立ち上がりと減衰を付ける
            g.gain.setValueAtTime(0, 音.currentTime + ずれ);
            g.gain.linearRampToValueAtTime(0.18, 音.currentTime + ずれ + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, 音.currentTime + ずれ + 0.22);
            o.connect(g); g.connect(音.destination);
            o.start(音.currentTime + ずれ);
            o.stop(音.currentTime + ずれ + 0.25);
        });
    } catch {
        /* 音を鳴らせない端末でも、知らせは出ているので続ける */
    }
}

function renderTimer() {
    const 表示 = document.getElementById('timer-display');
    const 止 = document.getElementById('timer-stop');
    if (!表示) return;

    const t = タイマーを読む();
    if (!t) {
        表示.textContent = '';
        表示.className = 'timer-display';
        if (止) 止.hidden = true;
        return;
    }

    const 残り = Math.max(0, Math.round((t.終わり - Date.now()) / 1000));
    const 分 = String(Math.floor(残り / 60)).padStart(2, '0');
    const 秒 = String(残り % 60).padStart(2, '0');

    表示.textContent = `${t.名前}  ${分}:${秒}`;
    表示.className = 'timer-display on' + (残り === 0 ? ' done' : '');
    if (止) 止.hidden = false;
}

function initTimer() {
    document.getElementById('timer-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        タイマーを始める(
            document.getElementById('timer-min')?.value,
            document.getElementById('timer-name')?.value
        );
    });

    document.getElementById('timer-stop')?.addEventListener('click', タイマーを止める);

    // よく使う長さは、押すだけで始められるようにする
    document.querySelectorAll('[data-timer-min]').forEach((b) => {
        b.addEventListener('click', () => {
            タイマーを始める(b.dataset.timerMin, b.dataset.timerName || '作業');
        });
    });

    // 開き直したときも、続きから数える
    if (タイマーを読む()) タイマーを回す();
    renderTimer();
}

window.initTimer = initTimer;
window.タイマーを始める = タイマーを始める;
window.タイマーを止める = タイマーを止める;
window.タイマーを読む = タイマーを読む;
