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

/** 今見ている画面から、担当エージェントの手がかりを渡す（無ければ null） */
function 現在のページからエージェントを推定() {
    return document.querySelector('.page.active')?.id?.replace('-page', '') || null;
}

/** 発言の中に「バックグラウンドで」「裏で」があれば、それを取り除いた本文を返す */
function 背景実行の指示を拾う(text) {
    const トリガー = /(バックグラウンドで|裏側で|裏で)/;
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
                    showNotification(`裏の作業が終わりました${名}: ${(t.結果 || '').slice(0, 60)}`, 'success');
                } else {
                    showNotification(`裏の作業に失敗しました${名}: ${t.エラー || ''}`, 'error');
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
            const 本文 = AReGLM_SECURITY.sanitizeHtml(t.結果 || t.エラー || '');
            return `<div class="bg-task-item">
                <div class="bg-task-head">${名}<span class="bg-task-state bg-task-state-${AReGLM_SECURITY.sanitizeHtml(t.状態)}">${AReGLM_SECURITY.sanitizeHtml(t.状態)}</span></div>
                <div class="bg-task-content">${AReGLM_SECURITY.sanitizeHtml(t.内容 || '')}</div>
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
            const 本文 = AReGLM_SECURITY.sanitizeHtml(t.結果 || t.エラー || '');
            const 日時 = t.作成 ? new Date(t.作成 * 1000).toLocaleString('ja-JP') : '';
            return `<article class="task-manage-card">
                <div class="bg-task-head">
                    ${名}<span class="bg-task-state bg-task-state-${AReGLM_SECURITY.sanitizeHtml(t.状態)}">${AReGLM_SECURITY.sanitizeHtml(t.状態)}</span>
                    <small class="hint">${日時}</small>
                </div>
                <div class="bg-task-content">${AReGLM_SECURITY.sanitizeHtml(t.内容 || '')}</div>
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
}

window.作業を頼む = 作業を頼む;
window.背景実行の指示を拾う = 背景実行の指示を拾う;
window.現在のページからエージェントを推定 = 現在のページからエージェントを推定;
window.init背景作業 = init背景作業;
window.タスク管理画面を描く = タスク管理画面を描く;
