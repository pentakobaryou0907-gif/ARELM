/**
 * JARVISモード ― エージェントページ（#mainai-page）の上に重ねる、
 * 近未来HUD風の全画面ビュー。
 *
 * 大事なこと：会話の中身は新しく作らない。
 * 既存の「エージェント」（#mainai-form / #mainai-input / #mainai-log /
 * #mainai-mic-btn）をそのまま裏で動かし、ここは見た目とTTSの読み上げを
 * 足すだけの「スキン」にする。二重に会話ロジックを持つと、
 * 挙動が食い違ったときに直すところが2箇所になってしまうため。
 *
 * 音声の聞き取りは、この端末の中だけで完結するWhisper経由の
 * 既存の仕組み（端末内で録音を始める・文字にする）を使う。
 * ブラウザ標準のWeb Speech APIを使う「常時待ち受け」は、
 * Chromeでは音声がGoogleへ送られてしまうため、ここでは採用しない
 * （このツールの「外部送信なし」という一貫した方針を優先した）。
 */

let jarvisマイク監視中 = false;

/**
 * 業務ハブ：コアの周りに、機能領域ごとのノードを配置する。
 *
 * 「AIが今そこで動いている」を演出だけで見せかけると、
 * 実際とズレたときに信用を失う。だから、光るかどうかは
 * この端末に実際にある数字（要補充・未対応・期限切れ等）だけで決める。
 * 何もなければ、正直に暗いままにする。
 */
const JARVIS_ノード定義 = [
    {
        id: 'inventory', 名: '在庫', 絵: '📦',
        光る: () => {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            return products.some((p) => (p.quantity ?? 0) <= (p.reorderLevel ?? 5));
        },
    },
    {
        id: 'sns', 名: 'SNS', 絵: '📣',
        光る: () => {
            const q = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
            return q.some((x) => x.status === 'pending');
        },
    },
    { id: 'brands', 名: 'ブランド', 絵: '◆', 光る: () => false },
    { id: 'studio', 名: '開発', 絵: '✎', 光る: () => false },
    {
        id: 'remote', 名: '遠隔操作', 絵: '🖥',
        // 「自動で作業する」の「止める」ボタンが見えている＝実行中。
        // 別に印を持つのではなく、既にある画面の状態をそのまま見る。
        光る: () => {
            const btn = document.getElementById('remote-auto-stop');
            return !!btn && !btn.hidden;
        },
    },
    {
        id: 'dashboard', 名: '記録・計画', 絵: '◎',
        光る: () => {
            const tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
            const today = typeof 今日 === 'function' ? 今日() : new Date().toISOString().slice(0, 10);
            return tasks.some((t) => !t.done && t.due && t.due <= today);
        },
    },
    { id: 'settings', 名: '設定', 絵: '⚙', 光る: () => false },
];

function 業務ハブのノードを描く() {
    const 箱 = document.getElementById('jarvis-nodes');
    const hud = document.getElementById('jarvis-hud');
    if (!箱 || !hud) return;

    // ノードの中心が、外側の光る輪のふちに乗るよう、
    // 実際に描かれたHUDの大きさから半径を決める（固定pxだと画面幅で崩れるため）。
    const 半径 = Math.max(60, hud.clientWidth / 2 - 6);

    箱.innerHTML = '';
    const 数 = JARVIS_ノード定義.length;
    JARVIS_ノード定義.forEach((n, i) => {
        const 角度 = (360 / 数) * i - 90; // 12時の位置から時計回りに配置
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jarvis-node';
        btn.style.setProperty('--jn-angle', `${角度}deg`);
        btn.style.setProperty('--jn-radius', `${半径}px`);
        try {
            if (n.光る()) btn.classList.add('jn-active');
        } catch { /* データが読めなくても、暗いままにするだけで済ませる */ }

        const 絵 = document.createElement('span');
        絵.textContent = n.絵;
        const ラベル = document.createElement('small');
        ラベル.textContent = n.名;
        btn.appendChild(絵);
        btn.appendChild(ラベル);

        btn.addEventListener('click', () => {
            JARVISモードを閉じる();
            if (typeof switchPage === 'function') switchPage(n.id);
        });

        箱.appendChild(btn);
    });
}
window.業務ハブのノードを描く = 業務ハブのノードを描く;

function JARVISモードを開く() {
    const overlay = document.getElementById('jarvis-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    document.body.classList.add('jarvis-active');

    時計を更新();
    if (!window._jarvis時計札) {
        window._jarvis時計札 = setInterval(時計を更新, 1000);
    }

    // レイアウト確定後（overlay表示直後はまだ幅0のことがある）に描く。
    requestAnimationFrame(業務ハブのノードを描く);

    const 呼び名 = document.querySelector('[data-tool-name]')?.textContent?.trim() || 'アレラム';
    const textEl = document.getElementById('jarvis-text');
    if (textEl) textEl.textContent = `おはようございます。${呼び名}です。状況を確認しています…`;

    // 開いた直後に、今日の状況（起動時ブリーフィング）を自動で報告する。
    // 既存の「今日」コマンド（おはよう、でも拾える）をそのまま使う。
    setTimeout(() => JARVISへ送る('おはよう'), 400);
}

function JARVISモードを閉じる() {
    const overlay = document.getElementById('jarvis-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove('jarvis-sleeping'); // 次に開いたときは、必ず起きた状態から
    document.body.classList.remove('jarvis-active');
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    JARVISの状態(null);
}

/** #mainai-form へ実際に投げる（会話の中身は既存のエージェントに丸ごと任せる） */
function JARVISへ送る(text) {
    const input = document.getElementById('mainai-input');
    const form = document.getElementById('mainai-form');
    if (!input || !form) return;
    input.value = text;
    JARVISの状態('thinking');
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

function JARVISの状態(state) {
    const hud = document.getElementById('jarvis-hud');
    if (hud) hud.classList.remove('listening', 'thinking', 'speaking');
    if (hud && state) hud.classList.add(state);

    const micStatus = document.getElementById('jarvis-mic-status');
    if (micStatus) {
        if (state === 'listening') {
            micStatus.textContent = '● 聞いています';
            micStatus.classList.add('on');
        } else {
            micStatus.textContent = '● 待機中';
            micStatus.classList.remove('on');
        }
    }
}

function 時計を更新() {
    const el = document.getElementById('jarvis-clock');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

/**
 * #mainai-log に新しい行が増えるたびに、最後のAIの発言だけを
 * 中央のHUDテキストへ映し、声でも読み上げる。
 */
function 最新のAI発言をJARVISへ映す() {
    const log = document.getElementById('mainai-log');
    if (!log) return;
    const 行たち = log.querySelectorAll('.console-line.console-assistant');
    const 最後 = 行たち[行たち.length - 1];
    if (!最後) return;

    // appendConsoleLine は改行を <br> に変えてDOMへ入れている
    // （console-line.js 側の仕様）。.textContent は <br> を何も出さずに
    // 読み飛ばすため、そのまま拾うと文がくっついて読めなくなる。
    // <br> を \n に戻してから、残りのタグを剥がす。
    const 文 = 最後.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
        .trim();
    const textEl = document.getElementById('jarvis-text');
    if (textEl) textEl.textContent = 文;

    const briefEl = document.getElementById('jarvis-brief');
    if (briefEl) {
        const 状況 = typeof reportTodayStatus === 'function' ? reportTodayStatus().split('\n')[0] : '';
        briefEl.textContent = 状況;
    }

    JARVISの状態('speaking');
    if (typeof speakBack === 'function') {
        speakBack(文);
        // speakBack は最大120文字までしか読み上げず、読み終わりの合図も
        // 受け取れる作りになっていない（画面はテキストで全文見せる方針のため）。
        // 大まかな長さから、待つ時間を見積もって待機状態へ戻す。
        const 秒 = Math.min(14, Math.max(2, Math.min(文.length, 120) / 11));
        clearTimeout(window._jarvis発話タイマー);
        window._jarvis発話タイマー = setTimeout(() => {
            if (!document.getElementById('jarvis-overlay')?.hidden) JARVISの状態(null);
            // 「続けて聞く」がONなら、話し終わった直後に自分でマイクを開き直す。
            // 常時待ち受け（マイクを開けっぱなし）はこのツールの方針に反するため
            // 採用しない。あくまで「1往復ぶんだけ、次もボタンを押さず話せる」
            // という、既存の押したときだけ聞く仕組みの延長でしかない。
            if (継続会話が有効か()) JARVISマイクを開き直す();
        }, 秒 * 1000);
    }
}

/** 「続けて聞く」トグルがONで、JARVISモードが開いたままか */
function 継続会話が有効か() {
    const overlay = document.getElementById('jarvis-overlay');
    if (!overlay || overlay.hidden) return false;
    return localStorage.getItem('areglm_jarvis_continuous') === 'true';
}

/** 話し終わった直後に、既存のマイクボタンを押し直す（1往復ぶんだけ聞く） */
function JARVISマイクを開き直す() {
    const btn = document.getElementById('mainai-mic-btn');
    if (!btn || btn.disabled) return;
    // すでに聞いている・考え中なら、二重に押さない。
    if (btn.classList.contains('listening')) return;
    if (document.getElementById('jarvis-hud')?.classList.contains('thinking')) return;
    btn.click();
}

/** マイクボタンの見た目（.listening クラス）を見て、HUDの状態に反映する */
function JARVISマイク状態を見張る() {
    if (jarvisマイク監視中) return;
    const btn = document.getElementById('mainai-mic-btn');
    if (!btn) return;
    jarvisマイク監視中 = true;
    const mo = new MutationObserver(() => {
        const 聞いている = btn.classList.contains('listening');
        const jarvisBtn = document.getElementById('jarvis-mic-btn');
        if (jarvisBtn) jarvisBtn.classList.toggle('listening', 聞いている);
        if (聞いている) JARVISの状態('listening');
        else if (document.getElementById('jarvis-hud')?.classList.contains('listening')) JARVISの状態(null);
    });
    mo.observe(btn, { attributes: true, attributeFilter: ['class'] });
}

function initJarvisMode() {
    const 開くbtn = document.getElementById('jarvis-mode-btn');
    const overlay = document.getElementById('jarvis-overlay');
    if (!開くbtn || !overlay || overlay.dataset.配線済み) return;
    overlay.dataset.配線済み = '1';

    開くbtn.addEventListener('click', JARVISモードを開く);
    document.getElementById('jarvis-exit-btn')?.addEventListener('click', JARVISモードを閉じる);

    document.getElementById('jarvis-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('jarvis-input');
        const text = (input?.value || '').trim();
        if (!text) return;
        input.value = '';
        JARVISへ送る(text);
    });

    document.getElementById('jarvis-mic-btn')?.addEventListener('click', () => {
        document.getElementById('mainai-mic-btn')?.click();
    });

    // 「続けて聞く」トグル。既定はオフ（マイクは明示的にオンにされたときだけ、
    // という方針を守るため）。オンにした本人だけが、その場で有効にできる。
    const 継続トグル = document.getElementById('jarvis-continuous-toggle');
    if (継続トグル) {
        継続トグル.checked = localStorage.getItem('areglm_jarvis_continuous') === 'true';
        継続トグル.addEventListener('change', (e) => {
            localStorage.setItem('areglm_jarvis_continuous', e.target.checked ? 'true' : 'false');
        });
    }

    const log = document.getElementById('mainai-log');
    if (log) {
        const mo = new MutationObserver(最新のAI発言をJARVISへ映す);
        mo.observe(log, { childList: true });
    }

    JARVISマイク状態を見張る();

    // F4でマイクを切り替える（JARVISモードが開いているときだけ）。
    // 参照デザインにあった「ミュートの全体ショートカット」に相当。
    // ページ全体で常時奪うと他の操作と衝突しうるため、開いている間だけに絞る。
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'F4') return;
        const overlay2 = document.getElementById('jarvis-overlay');
        if (!overlay2 || overlay2.hidden) return;
        e.preventDefault();
        document.getElementById('jarvis-mic-btn')?.click();
    });

    // 「エージェント」ページを開いたら、既定でJARVISモードになるようにする。
    // 既定は「する」（本人の指示）。外したいときだけ、下のチェックを外す。
    const 既定チェック = document.getElementById('jarvis-default-toggle');
    if (既定チェック) {
        既定チェック.checked = localStorage.getItem('areglm_jarvis_default') !== 'false';
        既定チェック.addEventListener('change', (e) => {
            localStorage.setItem('areglm_jarvis_default', e.target.checked ? 'true' : 'false');
        });
    }

    // ページの出入りを見張る：
    //   ・「エージェント」へ来たら、既定がONならJARVISモードを自動で開く
    //   ・離れたら、聞き取りを打ち切り、声も止める
    if (typeof switchPage === 'function' && !window._jarvisページ離脱を見張り中) {
        window._jarvisページ離脱を見張り中 = true;
        const 元のswitchPage = window.switchPage;
        window.switchPage = function (pageName, ...残り) {
            const overlay2 = document.getElementById('jarvis-overlay');
            if (overlay2 && !overlay2.hidden) JARVISモードを閉じる();
            const 結果 = 元のswitchPage.call(this, pageName, ...残り);
            if (pageName === 'mainai' && localStorage.getItem('areglm_jarvis_default') !== 'false') {
                JARVISモードを開く();
            }
            return 結果;
        };
    }
}

window.initJarvisMode = initJarvisMode;
window.JARVISモードを開く = JARVISモードを開く;
window.JARVISモードを閉じる = JARVISモードを閉じる;
