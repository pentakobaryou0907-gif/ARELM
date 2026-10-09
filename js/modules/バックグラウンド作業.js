/**
 * マルチエージェント化 第2段 — 裏で進める作業（クライアント側）
 *
 * 「バックグラウンドで」「裏で」と言われた指示は、その場で答えず
 * サーバー側のキューに積み、後で結果を確認できるようにする。
 * JARVISと話している間も、それとは別に進む。
 */

const 背景作業_ポーリング間隔 = 8000;
let 背景作業_前回状態 = {};
let 背景作業_タイマー = null;

// 仕様書13章「エラーは自動リトライ、継続失敗時のみまとめて報告」対応。
// このセッションの間だけ覚える回数（ページを開き直したら0に戻る＝重くならない）。
const 背景作業_自動再試行の上限 = 2;
let 背景作業_再試行回数 = {};

/** 今見ている画面から、担当エージェントの手がかりを渡す（無ければ null） */
function 現在のページからエージェントを推定() {
    return document.querySelector('.page.active')?.id?.replace('-page', '') || null;
}

/** 発言の中に「バックグラウンドで」「裏で」があれば、それを取り除いた本文を返す */
function 背景実行の指示を拾う(text) {
    const トリガー = /(バックグラウンドで|裏側で|裏で|席を外して|席を外すので|席を外しても|離れている間に|離れている間も|司令に任せて|司令塔に任せて|いなくても進めて|終わったら報告して)/;
    if (!トリガー.test(text || '')) return null;
    const 本文 = text.replace(トリガー, '').trim();
    return 本文 || null;
}

async function 作業を頼む(内容, agentId) {
    try {
        const r = await fetch('/api/ai-local/agent-task/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 内容, agent: agentId || undefined }),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d || d.ok === false) {
            if (d?.error) showNotification(d.error, 'error');
            return null;
        }
        背景作業を確認する();
        return d.task;
    } catch {
        return null;
    }
}

async function 背景作業一覧を読む() {
    try {
        const r = await fetch('/api/ai-local/agent-task/list');
        if (!r.ok) return [];
        const d = await r.json();
        return d.一覧 || [];
    } catch {
        return [];
    }
}

async function 背景作業を確認する() {
    const 一覧 = await 背景作業一覧を読む();

    // 前回「待機中/実行中」だったのに、今回「完了/失敗」になったものを知らせる。
    for (const t of 一覧) {
        const 前 = 背景作業_前回状態[t.id];
        if (前 && (前 === '待機中' || 前 === '実行中') && (t.状態 === '完了' || t.状態 === '失敗')) {
            const 名 = t.agent?.名 ? `（${t.agent.絵 || ''}${t.agent.名}）` : '';
            if (typeof showNotification === 'function') {
                if (t.状態 === '完了') {
                    背景作業_再試行回数[t.id] = 0;
                    showNotification(`裏の作業が終わりました${名}: ${(t.結果 || '').slice(0, 60)}`, 'success');
                } else {
                    const 回数 = 背景作業_再試行回数[t.id] || 0;
                    if (回数 < 背景作業_自動再試行の上限) {
                        // 静かに自動でやり直す。うるさい通知にはしない。
                        背景作業_再試行回数[t.id] = 回数 + 1;
                        タスクを操作する('retry', t.id);
                    } else {
                        showNotification(
                            `裏の作業が繰り返し失敗しました${名}（自動で${背景作業_自動再試行の上限}回やり直しましたが、まだ失敗しています）: ${t.エラー || ''}`,
                            'error'
                        );
                    }
                }
            }
        }
        背景作業_前回状態[t.id] = t.状態;
    }

    背景作業を描く(一覧);
    if (document.getElementById('tasks-page')?.classList.contains('active')) {
        タスク管理画面を描く(一覧);
    }
    return 一覧;
}

/**
 * オーケストレーター（連携作業）の、途中経過つきの本文を選ぶ。
 *
 * 完了していれば最終結果、実行中ならここまでの最新の途中経過、
 * それも無ければエラー文、というように「今出せる中で一番新しいもの」を出す。
 * 単発作業（t.手順が無いもの）にも共通して使える。
 */
function 作業の表示本文(t) {
    if (t.結果) return t.結果;
    if (t.途中経過 && t.途中経過.length) return t.途中経過[t.途中経過.length - 1];
    return t.エラー || '';
}

/** 連携作業（オーケストレーター）の手順を、進み具合つきで並べたHTML。単発作業なら空文字。 */
function 連携手順の進み具合HTML(t) {
    if (!t.手順 || !t.手順.length) return '';
    const 現在 = t.現在の手順 || 0;
    const 並び = t.手順
        .map((a, i) => {
            let 記号 = '・';
            if (t.状態 === '完了' || i < 現在) 記号 = '✓';
            else if (i === 現在 && t.状態 === '実行中') 記号 = '⏳';
            else if (i === 現在 && t.状態 === '失敗') 記号 = '✕';
            return `<span class="bg-task-step">${記号} ${AReGLM_SECURITY.sanitizeHtml(a.絵 || '')}${AReGLM_SECURITY.sanitizeHtml(a.名 || '')}</span>`;
        })
        .join('<span class="bg-task-step-arrow">→</span>');
    return `<div class="bg-task-steps">${並び}</div>`;
}

function 背景作業を描く(一覧) {
    const 進行中 = (一覧 || []).filter((t) => t.状態 === '待機中' || t.状態 === '実行中');
    document.querySelectorAll('.bg-task-badge').forEach((el) => {
        el.hidden = !進行中.length;
        el.textContent = `🔄 ${進行中.length}件 進行中`;
    });

    const list = document.getElementById('bg-task-list');
    if (!list || list.hidden) return;

    if (!一覧 || !一覧.length) {
        list.innerHTML = '<p class="empty">まだ裏での作業はありません。「裏で〜して」と話しかけると、ここに並びます。</p>';
        return;
    }
    list.innerHTML = 一覧
        .slice(0, 20)
        .map((t) => {
            const 名 = t.agent?.名
                ? `${AReGLM_SECURITY.sanitizeHtml(t.agent.絵 || '')} ${AReGLM_SECURITY.sanitizeHtml(t.agent.名)} · `
                : '';
            const 本文 = AReGLM_SECURITY.sanitizeHtml(作業の表示本文(t));
            return `<div class="bg-task-item">
                <div class="bg-task-head">${名}<span class="bg-task-state bg-task-state-${AReGLM_SECURITY.sanitizeHtml(t.状態)}">${AReGLM_SECURITY.sanitizeHtml(t.状態)}</span></div>
                <div class="bg-task-content">${AReGLM_SECURITY.sanitizeHtml(t.内容 || '')}</div>
                ${連携手順の進み具合HTML(t)}
                ${本文 ? `<div class="bg-task-result">${本文}</div>` : ''}
            </div>`;
        })
        .join('');
}

function 背景作業一覧の表示を切り替える() {
    const list = document.getElementById('bg-task-list');
    if (!list) return;
    list.hidden = !list.hidden;
    if (!list.hidden) 背景作業を確認する();
}

/* ---------- 作業状況の管理画面（マルチエージェント化 拡張） ---------- */

let タスク管理_フィルター = 'すべて';
let タスク管理_最新一覧 = [];

/** 状態に応じて、その場でできる操作ボタンを組み立てる */
function タスク操作ボタン(t) {
    const ボタン = [];
    if (t.状態 === '待機中') {
        ボタン.push(`<button type="button" class="btn btn-sm btn-secondary" data-task-action="cancel" data-task-id="${t.id}">取り消す</button>`);
    }
    if (t.状態 === '失敗' || t.状態 === '取り消し済み') {
        ボタン.push(`<button type="button" class="btn btn-sm btn-secondary" data-task-action="retry" data-task-id="${t.id}">やり直す</button>`);
    }
    if (t.状態 !== '待機中' && t.状態 !== '実行中') {
        ボタン.push(`<button type="button" class="btn btn-sm btn-danger" data-task-action="delete" data-task-id="${t.id}">消す</button>`);
    }
    return ボタン.join('');
}

function タスク管理画面を描く(一覧) {
    if (一覧) タスク管理_最新一覧 = 一覧;
    const box = document.getElementById('task-manage-list');
    if (!box) return;

    const 対象 = タスク管理_フィルター === 'すべて'
        ? タスク管理_最新一覧
        : タスク管理_最新一覧.filter((t) => t.状態 === タスク管理_フィルター);

    if (!対象.length) {
        box.innerHTML = '<p class="empty">この条件の作業はありません。</p>';
        return;
    }

    box.innerHTML = 対象
        .map((t) => {
            const 名 = t.agent?.名
                ? `${AReGLM_SECURITY.sanitizeHtml(t.agent.絵 || '')} ${AReGLM_SECURITY.sanitizeHtml(t.agent.名)} · `
                : '';
            const 本文 = AReGLM_SECURITY.sanitizeHtml(作業の表示本文(t));
            const 日時 = t.作成 ? new Date(t.作成 * 1000).toLocaleString('ja-JP') : '';
            return `<article class="task-manage-card">
                <div class="bg-task-head">
                    ${名}<span class="bg-task-state bg-task-state-${AReGLM_SECURITY.sanitizeHtml(t.状態)}">${AReGLM_SECURITY.sanitizeHtml(t.状態)}</span>
                    <small class="hint">${日時}</small>
                </div>
                <div class="bg-task-content">${AReGLM_SECURITY.sanitizeHtml(t.内容 || '')}</div>
                ${連携手順の進み具合HTML(t)}
                ${本文 ? `<div class="bg-task-result">${本文}</div>` : ''}
                <div class="guard-row">${タスク操作ボタン(t)}</div>
            </article>`;
        })
        .join('');
}

async function タスクを操作する(action, id, btn) {
    if (btn) btn.disabled = true;
    try {
        const r = await fetch(`/api/ai-local/agent-task/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        const d = await r.json().catch(() => null);
        if (!d?.ok) {
            showNotification(d?.訳 || d?.error || '操作できませんでした', 'error');
            return;
        }
        await 背景作業を確認する();
    } finally {
        if (btn) btn.disabled = false;
    }
}

function init背景作業() {
    document.querySelectorAll('.bg-task-badge').forEach((el) => {
        el.addEventListener('click', 背景作業一覧の表示を切り替える);
    });

    document.querySelectorAll('#task-status-tabs [data-task-status]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#task-status-tabs [data-task-status]').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            タスク管理_フィルター = btn.dataset.taskStatus;
            タスク管理画面を描く();
        });
    });

    document.getElementById('task-manage-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-task-action]');
        if (!btn) return;
        タスクを操作する(btn.dataset.taskAction, btn.dataset.taskId, btn);
    });

    背景作業を確認する();
    if (背景作業_タイマー) clearInterval(背景作業_タイマー);
    背景作業_タイマー = setInterval(背景作業を確認する, 背景作業_ポーリング間隔);

    initオーケストレーター();
}

/* ==========================================================
   オーケストレーター（マルチエージェント化 拡張2）

   「裏で進める作業」は、1つの担当に丸ごと頼むだけだった。
   ここでは、複数の担当をクリックした順番に並べ、その順で
   バケツリレーさせる。前の担当の答えを次の担当が引き継ぐので、
   話しかけるたびに毎回担当を選び直さなくても、一連の流れを
   まとめて進められる。

   選ぶ順番＝実行する順番。並べ替えのドラッグ操作は用意していない
   （選び直しは「外す→また押す」で足りると考えたため）。
   ========================================================== */

let オーケストレーター_手順 = [];

function オーケストレーター_選択肢を描く() {
    const box = document.getElementById('agent-chain-picker');
    if (!box || !window.AGENT_一覧) return;
    box.innerHTML = Object.entries(window.AGENT_一覧)
        .map(([id, a]) => `<button type="button" class="chip-btn" data-chain-agent="${AReGLM_SECURITY.escapeAttr(id)}">`
            + `${AReGLM_SECURITY.sanitizeHtml(a.絵 || '')} ${AReGLM_SECURITY.sanitizeHtml(a.名)}</button>`)
        .join('');
}

function オーケストレーター_手順を描く() {
    const box = document.getElementById('agent-chain-steps');
    if (!box) return;
    if (!オーケストレーター_手順.length) {
        box.innerHTML = '<p class="hint">まだ選んでいません。上の担当を、進めたい順にクリックしてください。</p>';
        return;
    }
    box.innerHTML = オーケストレーター_手順
        .map((id, i) => {
            const a = window.AGENT_一覧?.[id];
            if (!a) return '';
            return `<button type="button" class="chip-btn chip-btn-active" data-chain-remove="${i}">`
                + `${i + 1}. ${AReGLM_SECURITY.sanitizeHtml(a.絵 || '')}${AReGLM_SECURITY.sanitizeHtml(a.名)} ✕</button>`;
        })
        .join('<span class="bg-task-step-arrow">→</span>');
}

async function オーケストレーターで進める() {
    const goalBox = document.getElementById('agent-chain-goal');
    const btn = document.getElementById('agent-chain-run-btn');
    const 目的 = (goalBox?.value || '').trim();
    if (!目的) {
        showNotification('全体の目的を書いてください', 'error');
        return;
    }
    if (!オーケストレーター_手順.length) {
        showNotification('担当を1人以上、進めたい順に選んでください', 'error');
        return;
    }

    if (btn) btn.disabled = true;
    try {
        const r = await fetch('/api/ai-local/agent-chain/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 目的, 手順: オーケストレーター_手順 }),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d || d.ok === false) {
            showNotification(d?.error || '始められませんでした', 'error');
            return;
        }
        showNotification('連携作業を始めました。下の「作業状況」に並びます。', 'success');
        if (goalBox) goalBox.value = '';
        オーケストレーター_手順 = [];
        オーケストレーター_手順を描く();
        背景作業を確認する();
    } finally {
        if (btn) btn.disabled = false;
    }
}

function initオーケストレーター() {
    if (!document.getElementById('agent-chain-picker')) return; // このページが無いHTMLでは何もしない

    オーケストレーター_選択肢を描く();
    オーケストレーター_手順を描く();

    document.getElementById('agent-chain-picker')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-chain-agent]');
        if (!btn) return;
        オーケストレーター_手順.push(btn.dataset.chainAgent);
        オーケストレーター_手順を描く();
    });

    document.getElementById('agent-chain-steps')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-chain-remove]');
        if (!btn) return;
        オーケストレーター_手順.splice(Number(btn.dataset.chainRemove), 1);
        オーケストレーター_手順を描く();
    });

    document.querySelectorAll('#agent-chain-recipes [data-recipe]').forEach((btn) => {
        btn.addEventListener('click', () => {
            オーケストレーター_手順 = btn.dataset.recipe.split(',');
            オーケストレーター_手順を描く();
        });
    });

    document.getElementById('agent-chain-run-btn')?.addEventListener('click', オーケストレーターで進める);
}

window.作業を頼む = 作業を頼む;
window.背景実行の指示を拾う = 背景実行の指示を拾う;
window.現在のページからエージェントを推定 = 現在のページからエージェントを推定;
window.init背景作業 = init背景作業;
window.タスク管理画面を描く = タスク管理画面を描く;
