/**
 * 知識メモの画面
 *
 * 仕事で分かったことを、出所と検証状態つきで記録・検索する。
 * 外部AI由来の情報は「未検証」として区別し、確認するまで
 * 事実として扱わない。間違いと分かったものは消さずに残す。
 */

const KNOWLEDGE_SOURCE_LABEL = {
    experience: '自分の経験',
    document: '自分の資料',
    manual: '自分で記入',
    external: '外部AI'
};

const KNOWLEDGE_STATUS_LABEL = {
    verified: '確認済み',
    unverified: '未検証',
    wrong: '誤りと判明'
};

function initKnowledgeUi() {
    document.getElementById('knowledge-form')?.addEventListener('submit', handleKnowledgeAdd);
    document.getElementById('knowledge-search-btn')?.addEventListener('click', runKnowledgeSearch);
    document.getElementById('knowledge-refresh')?.addEventListener('click', runKnowledgeSearch);

    document.getElementById('knowledge-query')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            runKnowledgeSearch();
        }
    });
}

async function handleKnowledgeAdd(e) {
    e.preventDefault();
    if (!window.AReGLM_LOCAL_AI) {
        showNotification('自作AIエンジンが起動していません', 'error');
        return;
    }

    const textEl = document.getElementById('knowledge-text');
    const text = textEl?.value?.trim();
    if (!text) return;

    const source = document.getElementById('knowledge-source')?.value || 'manual';
    const topic = document.getElementById('knowledge-topic')?.value?.trim() || '';

    const result = await AReGLM_LOCAL_AI.addKnowledge(text, source, topic);
    if (!result) {
        showNotification('記録できませんでした（エンジンが停止している可能性があります）', 'error');
        return;
    }
    if (result.blocked) {
        showNotification(result.reason || 'ルールにより記録しませんでした', 'error');
        return;
    }

    e.target.reset();
    showNotification(
        result.status === 'unverified'
            ? '記録しました（未検証として保存されています）'
            : '記録しました',
        'success'
    );

    // 記録した内容で検索し、その場で一覧に反映する
    const queryEl = document.getElementById('knowledge-query');
    if (queryEl) queryEl.value = text.slice(0, 20);
    runKnowledgeSearch();

    if (window.logActivity) logActivity('知識メモを記録', { category: 'knowledge', text });
}

async function runKnowledgeSearch() {
    const box = document.getElementById('knowledge-results');
    if (!box || !window.AReGLM_LOCAL_AI) return;

    const query = document.getElementById('knowledge-query')?.value?.trim();
    if (!query) {
        box.innerHTML = '<p class="hint">探したい言葉を入れてください。</p>';
        return;
    }

    box.innerHTML = '<p class="hint">検索中…</p>';
    const data = await AReGLM_LOCAL_AI.searchKnowledge(query, 10);

    if (!data) {
        box.innerHTML = '<p class="hint">検索できませんでした（エンジンが停止している可能性があります）</p>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    let html = '';

    // 過去に誤りと分かったものは最優先で見せる
    if (data.pastMistakes?.length) {
        html += '<div class="knowledge-mistakes"><strong>この話題で過去に誤りと分かったこと</strong><ul>';
        data.pastMistakes.forEach((m) => {
            html += `<li>${s(m.text)}`;
            if (m.note) html += `<br><small>実際: ${s(m.note)}</small>`;
            html += '</li>';
        });
        html += '</ul></div>';
    }

    if (!data.results?.length) {
        html += '<p class="hint">該当する記録はありません。</p>';
        box.innerHTML = html;
        return;
    }

    html += data.results
        .map((r) => {
            const src = KNOWLEDGE_SOURCE_LABEL[r.source] || r.source;
            const st = KNOWLEDGE_STATUS_LABEL[r.status] || r.status;
            return `<article class="knowledge-item status-${s(r.status)}">
                <p class="knowledge-text">${s(r.text)}</p>
                <div class="knowledge-meta">
                    <span class="knowledge-badge">${s(src)}</span>
                    <span class="knowledge-badge status">${s(st)}</span>
                    ${r.topic ? `<span class="knowledge-badge">${s(r.topic)}</span>` : ''}
                    <span class="knowledge-actions">
                        <button type="button" class="btn-link" data-kid="${s(r.id)}" data-act="ok">正しかった</button>
                        <button type="button" class="btn-link danger" data-kid="${s(r.id)}" data-act="ng">間違いだった</button>
                    </span>
                </div>
            </article>`;
        })
        .join('');

    box.innerHTML = html;

    box.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => markKnowledge(btn.dataset.kid, btn.dataset.act === 'ok'));
    });
}

async function markKnowledge(id, correct) {
    let note = '';
    if (!correct) {
        // 何が実際に起きたかを残す。これが次の警告の中身になる。
        note = prompt('実際はどうでしたか？（次に同じ話が出たとき警告に使います）') || '';
    }

    const r = await AReGLM_LOCAL_AI.verifyKnowledge(id, correct, note);
    if (!r?.ok) {
        showNotification('記録できませんでした', 'error');
        return;
    }

    showNotification(correct ? '確認済みにしました' : '誤りとして記録しました（削除はしていません）', 'success');
    runKnowledgeSearch();
}

window.initKnowledgeUi = initKnowledgeUi;
window.runKnowledgeSearch = runKnowledgeSearch;
