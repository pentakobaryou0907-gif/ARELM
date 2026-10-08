/**
 * 通信先の可視化
 *
 * サーバーの許可リスト（公式APIのみ）を取得して画面に表示する。
 * 「どこに何を送っているか」をいつでも自分で確認できる状態にしておくための機能。
 */
async function initCompliance() {
    const box = document.getElementById('compliance-list');
    if (!box) return;

    try {
        const res = await fetch('/api/compliance');
        if (!res.ok) throw new Error('取得できませんでした');
        const info = await res.json();

        const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
        box.innerHTML = info.allowlist
            .map(
                (a) => `<article class="compliance-item">
                    <h4>${s(a.name)}</h4>
                    <p class="hint">提供元: ${s(a.provider)}</p>
                    <p class="compliance-host"><code>${s(a.host)}</code></p>
                    <a href="${AReGLM_SECURITY.escapeAttr(a.terms)}" target="_blank" rel="noopener noreferrer" class="hint">利用規約を確認</a>
                </article>`
            )
            .join('');
    } catch (err) {
        box.innerHTML = `<p class="hint">通信先リストを取得できませんでした（サーバー未起動の可能性）</p>`;
    }
}

/** 自作AIエンジンの稼働状況と学習量を表示する */
async function renderLocalAiStatus() {
    const box = document.getElementById('local-ai-status');
    if (!box || !window.AReGLM_LOCAL_AI) return;

    box.innerHTML = '<p class="hint">確認中…</p>';

    const alive = await AReGLM_LOCAL_AI.health();
    if (!alive) {
        box.innerHTML = `
            <p class="status-badge">停止中</p>
            <p class="hint">起動するにはターミナルで次を実行してください:</p>
            <p class="compliance-host"><code>cd ~/Developer/AReGLM/server/ai &amp;&amp; python3 server.py</code></p>`;
        return;
    }

    const s = await AReGLM_LOCAL_AI.summary();
    if (!s) {
        box.innerHTML = '<p class="status-badge connected">稼働中</p>';
        return;
    }

    const cats = Object.entries(s.categories || {})
        .map(([k, v]) => `${AReGLM_SECURITY.sanitizeHtml(k)}(${v})`)
        .join(' / ');
    const terms = (s.topTerms || [])
        .slice(0, 8)
        .map((t) => AReGLM_SECURITY.sanitizeHtml(t.term))
        .join('、');

    box.innerHTML = `
        <p class="status-badge connected">稼働中</p>
        <div class="pricing-metrics">
            <div class="pricing-metric"><span>学習した件数</span><strong>${s.totalDocs}</strong></div>
            <div class="pricing-metric"><span>覚えた語彙</span><strong>${s.vocabulary}</strong></div>
            <div class="pricing-metric"><span>学習回数</span><strong>${s.updates}</strong></div>
        </div>
        <p class="hint">分類できるカテゴリ: ${cats || 'まだありません'}</p>
        <p class="hint">よく出る語: ${terms || 'まだありません'}</p>`;
}

function initLocalAiPanel() {
    document.getElementById('local-ai-refresh')?.addEventListener('click', renderLocalAiStatus);
    renderLocalAiStatus();
}

window.initCompliance = initCompliance;
window.initLocalAiPanel = initLocalAiPanel;
window.renderLocalAiStatus = renderLocalAiStatus;
