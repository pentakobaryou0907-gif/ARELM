/**
 * エージェント — このツールを操作する相棒
 *
 * サイトのAI（AIチャット）とは役割が違う。
 *
 *   エージェント    … ツールを操作する。完全にこの端末内で動く。
 *                 数えた事実しか答えないので、作り話ができない。
 *   サイトのAI  … 文章・画像を作る。外部APIを使うため、嘘が混じりうる。
 *
 * エージェントが守ること:
 *   1. 分からないことは分からないと言う。推測で実行しない。
 *   2. 推測を述べるときは「推測です」と明示する。
 *   3. 外部へ送信しない。
 *   4. 消す操作は必ず確認する。
 *   5. 忘れてと言われたら本当に忘れる。
 *   6. 使うほど、その人の言い方に馴染む。
 */

const MAINAI_RULES = [
    '分からないことは分からないと答えます。推測で勝手に実行しません',
    '推測を述べるときは「推測です」と必ず言います',
    '事実でないことを事実のように言いません',
    '外部へは一切送信しません（この端末の中だけで動きます）',
    '消す操作は必ず確認してから行います',
    '「忘れて」と言われた内容は、断片まで本当に忘れます',
    '違法・犯罪・模倣品に関わることはしません',
    '個人情報（カード番号・APIキー等）は覚えません'
];

const MAINAI_ABILITIES = [
    { icon: '📋', text: '今日やることをまとめて報告する', example: '今日の状況' },
    { icon: '✅', text: 'タスクを追加する', example: 'タスク サンプル発注' },
    { icon: '📝', text: 'メモを取る', example: 'メモ 生地屋を探す' },
    { icon: '🔎', text: '内容を判定し、根拠を示す', example: '判定 デニムの新作' },
    { icon: '🧠', text: '覚えた内容を忘れる', example: '忘れて ○○' },
    { icon: '🚪', text: '各ページを開く', example: '在庫' },
    { icon: '🔄', text: '全データを更新する', example: '更新' },
    { icon: '💾', text: 'バックアップを書き出す', example: 'バックアップ' },
    { icon: '🤖', text: '全自動モードを切り替える', example: '全自動' },
    { icon: '💡', text: '分からない言い方は聞き返し、教われば覚える', example: '（短い言葉でも可）' }
];

function initMainAi() {
    // 指示の入口。ホームのコンソールと同じ仕組みを使う。
    document.getElementById('mainai-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('mainai-input');
        const text = input?.value?.trim();
        if (!text) return;
        runMainAiCommand(text);
        if (input) input.value = '';
    });

    document.getElementById('mainai-mic-btn')?.addEventListener('click', () => {
        // ホームのマイク処理を、出力先だけエージェント側にして使い回す
        toggleConsoleMic('mainai');
    });

    document.getElementById('mainai-refresh')?.addEventListener('click', refreshMainAiPage);

    renderMainAiRules();
    renderMainAiAbilities();
    refreshMainAiPage();

    appendMainAiLine('assistant',
        'こんにちは。ツールの操作はここで受け付けます。'
        + '分からない言い方は聞き返しますので、教えていただければ次から覚えます。');
}

/** エージェントへの指示。表示先をエージェント側にしてコンソールの仕組みを使う */
function runMainAiCommand(text) {
    if (typeof runConsoleCommand === 'function') {
        runConsoleCommand(text, 'mainai');
    }
    setTimeout(() => {
        refreshMainAiPage();
        renderMainAiSuggest();
    }, 300);
}

function appendMainAiLine(role, text) {
    if (typeof appendConsoleLine === 'function') {
        appendConsoleLine(role, text, 'mainai');
    }
}

/* ---------- 表示 ---------- */

/**
 * ルールの表示。
 *
 * 中身は rules-ui.js が受け持つ。
 * こちらで別に持つと、片方だけ直したときに食い違うため。
 */
function renderMainAiRules() {
    if (typeof renderRules === 'function') renderRules();
}

function renderMainAiAbilities() {
    const box = document.getElementById('mainai-abilities');
    if (!box) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    box.innerHTML = MAINAI_ABILITIES
        .map(
            (a) => `<li>
                <span class="ability-icon">${s(a.icon)}</span>
                <span class="ability-text">${s(a.text)}</span>
                <button type="button" class="ability-try" data-ex="${AReGLM_SECURITY.escapeAttr(a.example)}">${s(a.example)}</button>
            </li>`
        )
        .join('');

    box.querySelectorAll('.ability-try').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('mainai-input');
            if (input) {
                input.value = btn.dataset.ex;
                input.focus();
            }
        });
    });
}

/** 覚えていること（学習量・知識・忘却可能かどうか） */
async function refreshMainAiPage() {
    renderMainAiPhrases();
    renderMainAiSuggest();

    const banner = document.getElementById('mainai-health');
    const box = document.getElementById('mainai-memory');

    if (!window.AReGLM_LOCAL_AI) {
        if (banner) {
            banner.className = 'status-banner warn';
            banner.innerHTML = '<strong>エージェントを読み込めていません</strong>';
        }
        return;
    }

    const alive = await AReGLM_LOCAL_AI.health();
    if (banner) {
        banner.className = 'status-banner ' + (alive ? 'ok' : 'warn');
        banner.innerHTML = alive
            ? '<strong>エージェント 稼働中</strong> — この端末の中だけで動いています'
            : '<strong>エージェント 停止中</strong> — <code>server/ai/start_ai.sh</code> で起動してください（ツール本体は使えます）';
    }

    if (!box) return;
    if (!alive) {
        box.innerHTML = '<p class="hint">停止中のため、覚えている内容を確認できません。</p>';
        return;
    }

    const s = await AReGLM_LOCAL_AI.summary();
    if (!s) {
        box.innerHTML = '<p class="hint">情報を取得できませんでした。</p>';
        return;
    }

    const cats = Object.entries(s.categories || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `${AReGLM_SECURITY.sanitizeHtml(k)}(${v})`)
        .join('、');

    const kn = s.knowledge || {};
    const unverified = (kn.byStatus || {}).unverified || 0;
    const wrong = (kn.byStatus || {}).wrong || 0;

    box.innerHTML = `
        <div class="pricing-metrics">
            <div class="pricing-metric"><span>覚えた作業</span><strong>${s.totalDocs || 0}</strong></div>
            <div class="pricing-metric"><span>覚えた言葉</span><strong>${s.vocabulary || 0}</strong></div>
            <div class="pricing-metric"><span>知識メモ</span><strong>${kn.total || 0}</strong></div>
        </div>
        ${cats ? `<p class="hint">分野: ${cats}</p>` : ''}
        ${unverified ? `<p class="hint">うち<strong>${unverified}件</strong>は未検証（確認するまで事実として扱いません）</p>` : ''}
        ${wrong ? `<p class="hint">誤りと分かったもの <strong>${wrong}件</strong>（消さずに残し、同じ話が出たら警告します）</p>` : ''}
        <p class="hint">「忘れて ○○」と指示すると、その内容を断片まで消します。</p>`;
}

/** 覚えた言い方の一覧 */
function renderMainAiPhrases() {
    const box = document.getElementById('mainai-phrases');
    if (!box) return;

    let phrases = [];
    try {
        phrases = JSON.parse(localStorage.getItem('areglm_console_phrases') || '[]');
    } catch {
        phrases = [];
    }

    if (!phrases.length) {
        box.innerHTML = '<p class="hint">まだ覚えた言い方はありません。分からない指示をすると聞き返すので、そこで教えてください。</p>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    box.innerHTML = `<div class="phrase-list">${phrases
        .slice()
        .reverse()
        .map(
            (p) => `<span class="phrase-chip">
                「${s(p.phrase)}」→ ${s(commandLabel(p.commandId))}
                <button type="button" class="btn-link danger" data-ph="${s(p.phrase)}">忘れる</button>
            </span>`
        )
        .join('')}</div>`;

    box.querySelectorAll('[data-ph]').forEach((btn) => {
        btn.addEventListener('click', () => forgetPhrase(btn.dataset.ph));
    });
}

function commandLabel(id) {
    if (typeof AREGLM_COMMANDS === 'undefined') return id;
    return AREGLM_COMMANDS.find((c) => c.id === id)?.label || id;
}

function forgetPhrase(phrase) {
    let list = [];
    try {
        list = JSON.parse(localStorage.getItem('areglm_console_phrases') || '[]');
    } catch {
        list = [];
    }
    list = list.filter((p) => p.phrase !== phrase);
    localStorage.setItem('areglm_console_phrases', JSON.stringify(list));
    renderMainAiPhrases();
    showNotification(`「${phrase}」の覚えを消しました`, 'success');
}

/** 今の状況から、次にやるとよいことを短く出す */
function renderMainAiSuggest() {
    const box = document.getElementById('mainai-suggest');
    if (!box) return;

    const today = 今日();
    let tasks = [];
    try {
        tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
    } catch {
        tasks = [];
    }

    const overdue = tasks.filter((t) => !t.done && t.due && t.due < today).length;
    const chips = [];

    if (overdue) chips.push({ text: `期限切れ${overdue}件を確認`, cmd: '今日の状況' });
    chips.push({ text: '今日の状況', cmd: '今日の状況' });
    chips.push({ text: '全データ更新', cmd: '更新' });
    chips.push({ text: 'できること', cmd: 'できること' });

    box.innerHTML = chips
        .map(
            (c) =>
                `<button type="button" class="suggest-chip" data-cmd="${AReGLM_SECURITY.escapeAttr(c.cmd)}">${AReGLM_SECURITY.sanitizeHtml(c.text)}</button>`
        )
        .join('');

    box.querySelectorAll('.suggest-chip').forEach((btn) => {
        btn.addEventListener('click', () => runMainAiCommand(btn.dataset.cmd));
    });
}

window.initMainAi = initMainAi;
window.refreshMainAiPage = refreshMainAiPage;
window.runMainAiCommand = runMainAiCommand;
