/**
 * メモ
 *
 * 普通のメモとして書くだけで、自作AIがその内容を覚える。
 * あとで「あの件どうだった？」と聞けば、書いた内容から答えられるようになる。
 *
 * 以前は「メモ」と「知識メモ」に分かれていたが、
 * 使うときに迷うので1つにまとめた。
 *
 * 出所を選べるようにしてあるのは、
 * 人やAIから聞いた話を「確かめた事実」と混ぜないため。
 * 未確認のものは印を付けて残し、確かめたら切り替えられる。
 *
 * すべてこの端末の中だけで保存する。外部には送らない。
 */
const AREGLM_MEMO_KEY = 'areglm_memos';

// 出所の見せ方。人から聞いた話は確かめるまで区別する。
const MEMO_SOURCES = {
    manual: { label: 'メモ', verified: true },
    experience: { label: '経験', verified: true },
    document: { label: '資料', verified: true },
    external: { label: '未確認', verified: false }
};

let memoSearchWord = '';

function initMemo() {
    document.getElementById('memo-form')?.addEventListener('submit', handleMemoSubmit);
    document.getElementById('memo-search')?.addEventListener('input', (e) => {
        memoSearchWord = e.target.value.trim();
        renderMemoList();
    });
    renderMemoList();
}

function loadMemos() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_MEMO_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveMemos(memos) {
    localStorage.setItem(AREGLM_MEMO_KEY, JSON.stringify(memos));
}

function handleMemoSubmit(e) {
    e.preventDefault();
    const titleInput = document.getElementById('memo-title');
    const bodyInput = document.getElementById('memo-body');
    const sourceSel = document.getElementById('memo-source');

    const body = bodyInput?.value?.trim();
    if (!body) return;

    const policy = AReGLM_CONTENT_POLICY.validate(body);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    const source = sourceSel?.value || 'manual';
    const memos = loadMemos();
    memos.unshift({
        id: 'memo_' + Date.now(),
        title: titleInput?.value?.trim() || '',
        body,
        source,
        // 人やAIから聞いた話は、確かめるまで未確認として扱う
        status: MEMO_SOURCES[source]?.verified ? 'verified' : 'unverified',
        note: '',
        pinned: false,
        createdAt: new Date().toISOString()
    });
    saveMemos(memos);

    if (titleInput) titleInput.value = '';
    if (bodyInput) bodyInput.value = '';
    renderMemoList();

    // 書いた内容を自作AIに覚えさせる（この端末の中だけ）
    if (window.AReGLM_LOCAL_AI) {
        AReGLM_LOCAL_AI.learnLong(body, 'memo');
        // 出所つきでも記録し、あとで根拠として引けるようにする
        AReGLM_LOCAL_AI.addKnowledge(body, source, titleInput?.value?.trim() || '');
    }

    if (window.logActivity) logActivity('メモを追加', { category: 'memo', text: body });
}

function renderMemoList() {
    const box = document.getElementById('memo-list');
    if (!box) return;

    let memos = loadMemos();

    // 探している言葉があれば絞り込む
    if (memoSearchWord) {
        const w = memoSearchWord.toLowerCase();
        memos = memos.filter((m) => `${m.title} ${m.body}`.toLowerCase().includes(w));
    }

    memos.sort(
        (a, b) => (b.pinned - a.pinned) || new Date(b.createdAt) - new Date(a.createdAt)
    );

    if (!memos.length) {
        box.innerHTML = memoSearchWord
            ? '<p class="hint">見つかりませんでした。</p>'
            : '<p class="hint">まだメモがありません。</p>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');

    box.innerHTML = memos
        .map((m) => {
            const src = MEMO_SOURCES[m.source] || MEMO_SOURCES.manual;
            const wrong = m.status === 'wrong';
            const unverified = m.status === 'unverified';

            return `<article class="memo-card${m.pinned ? ' pinned' : ''}${wrong ? ' wrong' : ''}${unverified ? ' unverified' : ''}">
                ${m.title ? `<h4>${s(m.title)}</h4>` : ''}
                <p>${s(m.body).replace(/\n/g, '<br>')}</p>
                ${m.note ? `<p class="memo-note">実際: ${s(m.note)}</p>` : ''}
                <div class="memo-meta">
                    <span class="memo-tag">${s(src.label)}</span>
                    ${wrong ? '<span class="memo-tag wrong">誤りと判明</span>' : ''}
                    ${unverified ? '<span class="memo-tag unverified">未確認</span>' : ''}
                    <time>${new Date(m.createdAt).toLocaleDateString('ja-JP')}</time>
                    <span class="memo-actions">
                        <button type="button" class="btn-link" data-id="${m.id}" data-action="pin">${m.pinned ? '固定解除' : '固定'}</button>
                        ${unverified ? `<button type="button" class="btn-link" data-id="${m.id}" data-action="ok">確認済にする</button>` : ''}
                        ${!wrong ? `<button type="button" class="btn-link" data-id="${m.id}" data-action="ng">違っていた</button>` : ''}
                        <button type="button" class="btn-link danger" data-id="${m.id}" data-action="delete">削除</button>
                    </span>
                </div>
            </article>`;
        })
        .join('');

    box.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const { id, action } = btn.dataset;
            if (action === 'pin') togglePinMemo(id);
            if (action === 'delete') deleteMemo(id);
            if (action === 'ok') setMemoStatus(id, 'verified');
            if (action === 'ng') markMemoWrong(id);
        });
    });
}

function togglePinMemo(id) {
    const memos = loadMemos();
    const memo = memos.find((m) => m.id === id);
    if (memo) memo.pinned = !memo.pinned;
    saveMemos(memos);
    renderMemoList();
}

function setMemoStatus(id, status) {
    const memos = loadMemos();
    const memo = memos.find((m) => m.id === id);
    if (!memo) return;
    memo.status = status;
    saveMemos(memos);
    renderMemoList();
    showNotification('確認済みにしました', 'success');
}

/**
 * 内容が違っていたと分かったときに記録する。
 * 消さずに残すのは、同じ思い違いを繰り返さないため。
 */
function markMemoWrong(id) {
    const memos = loadMemos();
    const memo = memos.find((m) => m.id === id);
    if (!memo) return;

    const note = prompt('実際はどうでしたか？（次に同じ話が出たとき警告に使います）');
    if (note === null) return;

    memo.status = 'wrong';
    memo.note = note.trim();
    saveMemos(memos);
    renderMemoList();

    // AIにも「これは誤りだった」と伝える
    if (window.AReGLM_LOCAL_AI) {
        AReGLM_LOCAL_AI.searchKnowledge(memo.body, 1).then((r) => {
            const hit = r?.results?.[0];
            if (hit) AReGLM_LOCAL_AI.verifyKnowledge(hit.id, false, memo.note);
        });
    }

    showNotification('誤りとして記録しました（削除はしていません）', 'success');
}

function deleteMemo(id) {
    const memo = loadMemos().find((m) => m.id === id);
    if (!confirm('このメモを不要ボックスへ移しますか？\n（消えません。あとで戻せます）')) return;

    // 消さずに不要ボックスへ移す
    if (memo && typeof 不要ボックスへ入れる === 'function') {
        不要ボックスへ入れる('memo', memo, (memo.body || '').slice(0, 30));
    }
    saveMemos(loadMemos().filter((m) => m.id !== id));
    renderMemoList();

    // AIが覚えた内容も一緒に忘れさせる
    if (memo && window.AReGLM_LOCAL_AI) {
        AReGLM_LOCAL_AI.forget({ text: memo.body });
    }
}

window.initMemo = initMemo;
window.renderMemoList = renderMemoList;
