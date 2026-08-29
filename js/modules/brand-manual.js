/**
 * ブランドマニュアル
 * ブランドのルール・決めごとを項目ごとにまとめる。
 * 「マニュアル・ルール決めが綺麗にまとめきれない」という課題に対応し、
 * 何を決めるべきかの項目をあらかじめ用意しておく方式にしている。
 * すべてこの端末内（localStorage）で完結。
 */
const AREGLM_MANUAL_KEY = 'areglm_brand_manual';

const AREGLM_MANUAL_SECTIONS = [
    { id: 'concept', title: 'ブランドコンセプト', placeholder: '何を大切にしているブランドか。一言で言うと？' },
    { id: 'target', title: 'ターゲット', placeholder: '誰に届けたいか（年齢・好み・生活シーン）' },
    { id: 'tone', title: 'トーン＆マナー', placeholder: '写真の雰囲気、使う色、文章の話し方（敬語かタメ口か）' },
    { id: 'sns', title: 'SNS運用ルール', placeholder: '投稿頻度、ハッシュタグ、返信の方針、載せないもの' },
    { id: 'product', title: '商品づくりのルール', placeholder: '素材の基準、価格の決め方、サイズ展開' },
    { id: 'member', title: 'メンバーとの進め方', placeholder: '連絡手段、依頼の出し方、決定権は誰にあるか' },
    { id: 'ng', title: 'やらないこと', placeholder: 'ブランドとしてやらないと決めたこと' }
];

function initBrandManual() {
    renderBrandManual();
    document.getElementById('manual-export-btn')?.addEventListener('click', exportBrandManual);
}

function loadManual() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_MANUAL_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveManual(data) {
    localStorage.setItem(AREGLM_MANUAL_KEY, JSON.stringify(data));
}

function renderBrandManual() {
    const box = document.getElementById('manual-sections');
    if (!box) return;
    const data = loadManual();

    box.innerHTML = AREGLM_MANUAL_SECTIONS.map((s) => {
        const filled = (data[s.id] || '').trim();
        return `<details class="manual-section${filled ? ' filled' : ''}">
            <summary>
                <span>${AReGLM_SECURITY.sanitizeHtml(s.title)}</span>
                <span class="manual-status">${filled ? '記入済' : '未記入'}</span>
            </summary>
            <textarea data-manual-id="${s.id}" rows="3" placeholder="${AReGLM_SECURITY.escapeAttr(s.placeholder)}">${AReGLM_SECURITY.sanitizeHtml(filled)}</textarea>
        </details>`;
    }).join('');

    box.querySelectorAll('textarea[data-manual-id]').forEach((ta) => {
        ta.addEventListener('change', () => {
            const current = loadManual();
            current[ta.dataset.manualId] = ta.value;
            saveManual(current);
            renderBrandManual();
            // マニュアルはブランドの方針そのものなので全文を学習させる
            if (window.AReGLM_LOCAL_AI) AReGLM_LOCAL_AI.learnLong(ta.value, 'manual');
            if (window.logActivity) {
                logActivity('ブランドマニュアルを更新', { category: 'manual', text: ta.value.slice(0, 500) });
            }
        });
    });
}

function exportBrandManual() {
    const data = loadManual();
    const filled = AREGLM_MANUAL_SECTIONS.filter((s) => (data[s.id] || '').trim());
    if (!filled.length) {
        showNotification('まだ記入された項目がありません', 'info');
        return;
    }

    const lines = [`# ${AREGLM_PROFILE.brand} ブランドマニュアル`, ''];
    filled.forEach((s) => {
        lines.push(`## ${s.title}`, '', data[s.id].trim(), '');
    });
    lines.push('---', `書き出し日: ${new Date().toLocaleString('ja-JP')}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `areglm_brand_manual_${今日()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showNotification(`${filled.length}項目を書き出しました`, 'success');
}

window.initBrandManual = initBrandManual;
window.renderBrandManual = renderBrandManual;
