/**
 * Alibaba OEM テックパックスライド — 「1着=1スライド」の商品開発資料
 *
 * なぜこの形にしたか:
 *   Canva公式APIには、画像とテキスト（寸法・素材・原価）を精密に
 *   配置したスライドを無料で自動組み立てできる仕組みが無い
 *   （本命のAutofill APIはCanva Enterprise専用で、個人利用では
 *   使えない）。そこでこの端末だけで .pptx を完成させる。
 *   .pptx は Canva・PowerPoint・Keynote のどれでも開けるので、
 *   Canvaで編集したい場合は、Canva側の「インポート」機能（無料）で
 *   このファイルを取り込めばよい。外部APIへは一切送らない。
 *
 * 商品の追加は js/modules/product-dev.js の SUZURI商品を作る() と
 * 同じ順番で確認する: ポリシー検証 → 既存商品との類似チェック。
 * 寸法（サイズ表）は、この機能では持たず、既存の「技術パック
 * （寸法表）」に同じ商品名で登録済みの行をそのまま使う（二重管理を避ける）。
 */

const AREGLM_OEMDECK_KEY = 'areglm_oem_deck_items';
let oemdeckImageDataUrl = '';

function initOemDeck() {
    document.getElementById('oemdeck-form')?.addEventListener('submit', handleOemDeckAdd);
    document.getElementById('oemdeck-image-file')?.addEventListener('change', previewOemDeckImage);
    document.getElementById('oemdeck-suggest-btn')?.addEventListener('click', handleOemDeckSuggest);
    document.getElementById('oemdeck-build-btn')?.addEventListener('click', handleOemDeckBuild);
    renderOemDeckList();
}

function loadOemDeckItems() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_OEMDECK_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function saveOemDeckItems(items) {
    localStorage.setItem(AREGLM_OEMDECK_KEY, JSON.stringify(items));
}

function previewOemDeckImage(e) {
    const preview = document.getElementById('oemdeck-image-preview');
    const file = e.target.files?.[0];
    if (!preview || !file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        oemdeckImageDataUrl = ev.target.result;
        preview.textContent = '';
        const img = document.createElement('img');
        img.src = oemdeckImageDataUrl;
        img.alt = '';
        preview.appendChild(img);
    };
    reader.readAsDataURL(file);
}

/** 同じ商品名で「技術パック（寸法表）」に登録済みの寸法行を拾ってくる */
function 商品名から寸法行を拾う(name) {
    const rows = typeof loadTechpackRows === 'function' ? loadTechpackRows() : [];
    return rows
        .filter((r) => r.product === name)
        .map((r) => ({ size: r.size, part: r.part, value: r.value }));
}

async function handleOemDeckAdd(e) {
    e.preventDefault();
    const name = document.getElementById('oemdeck-name')?.value?.trim();
    const description = document.getElementById('oemdeck-description')?.value?.trim() || '';
    const material = document.getElementById('oemdeck-material')?.value?.trim() || '';
    const cost = document.getElementById('oemdeck-cost')?.value?.trim() || '';
    const lead = document.getElementById('oemdeck-lead')?.value?.trim() || '';

    if (!name) {
        showNotification('商品名を入力してください', 'error');
        return;
    }

    const policy = AReGLM_CONTENT_POLICY.validate(`${name} ${description}`);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    // 既存商品と似すぎていないか確認する（SUZURI商品を作る() と同じ考え方）。
    // 商品開発ページには既にSUZURI商品の一覧があるので、それも比較対象に含める。
    if (window.AReGLM_LOCAL_AI) {
        await AReGLM_LOCAL_AI.indexProducts();
        const sim = await AReGLM_LOCAL_AI.checkSimilar(`${name} ${description}`, {});
        if (sim && sim.verdict !== 'ok' && sim.matches?.length) {
            const top = sim.matches[0];
            const proceed = confirm(
                `${sim.message}\n\n最も近い既存商品:\n「${top.text}」\n類似度: ${Math.round(top.score * 100)}%\n\n`
                + 'このままリストに追加しますか？'
            );
            if (!proceed) return;
        }
    }

    const items = loadOemDeckItems();
    items.push({
        id: 'oemdeck_' + Date.now(),
        name, description, material, cost, lead,
        imageDataUrl: oemdeckImageDataUrl || '',
        createdAt: new Date().toISOString(),
    });
    saveOemDeckItems(items);

    e.target.reset();
    oemdeckImageDataUrl = '';
    const preview = document.getElementById('oemdeck-image-preview');
    if (preview) preview.innerHTML = '<span class="hint">未選択（AI生成、または「技術パック」で使った画像を後から追加できます）</span>';

    renderOemDeckList();
    logActivity(`OEMテックパックスライドに追加: ${name}`);
}

function renderOemDeckList() {
    const box = document.getElementById('oemdeck-list');
    if (!box) return;
    const items = loadOemDeckItems();
    if (!items.length) {
        box.innerHTML = '<p class="empty-state">まだ商品がありません</p>';
        return;
    }
    box.innerHTML = items
        .map((it) => {
            const 寸法数 = 商品名から寸法行を拾う(it.name).length;
            return `<article class="dev-card">
                ${it.imageDataUrl ? `<img src="${AReGLM_SECURITY.escapeAttr(it.imageDataUrl)}" alt="" class="oemdeck-thumb">` : ''}
                <h4>${AReGLM_SECURITY.sanitizeHtml(it.name)}</h4>
                <p class="hint">${AReGLM_SECURITY.sanitizeHtml(it.description || '')}</p>
                <small class="hint">寸法行: ${寸法数}件${it.material ? ' / ' + AReGLM_SECURITY.sanitizeHtml(it.material) : ''}</small>
                <button type="button" class="btn btn-sm btn-danger" onclick="deleteOemDeckItem('${it.id}')">削除</button>
            </article>`;
        })
        .join('');
}

function deleteOemDeckItem(id) {
    saveOemDeckItems(loadOemDeckItems().filter((it) => it.id !== id));
    renderOemDeckList();
}

/**
 * 学習した写真・動画・チャットの傾向から、デザイン提案の叩き台を出す。
 * 断定はしない（学習量に応じて精度は変わる）。
 */
async function handleOemDeckSuggest() {
    const btn = document.getElementById('oemdeck-suggest-btn');
    const out = document.getElementById('oemdeck-suggest-result');
    const お題 = document.getElementById('oemdeck-description')?.value?.trim() || '';

    if (btn) { btn.disabled = true; btn.textContent = '確認中…'; }
    try {
        const r = await fetch('/api/ai-local/design/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ お題文: お題 }),
        }).then((y) => y.json());

        if (out) {
            if (r?.ok && r.キーワード?.length) {
                out.textContent = `提案キーワード: ${r.キーワード.join('、')}（${r.訳}）`;
            } else {
                out.textContent = 'まだ学習データが少なく、提案できませんでした。チャットで写真・動画を「これでデザインを学習する」に使うと増えます。';
            }
        }
    } catch (err) {
        if (out) out.textContent = '提案を取得できませんでした: ' + err.message;
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '学習した傾向から提案'; }
    }
}

/** リスト全件をサーバーへ送り、テックパックスライド（.pptx）を組み立てる */
async function handleOemDeckBuild() {
    const items = loadOemDeckItems();
    if (!items.length) {
        showNotification('リストに商品がありません。まず追加してください', 'error');
        return;
    }

    const btn = document.getElementById('oemdeck-build-btn');
    const result = document.getElementById('oemdeck-result');
    if (btn) { btn.disabled = true; btn.textContent = '作成中…'; }
    if (result) result.textContent = '';

    const 商品たち = items.map((it) => ({
        name: it.name,
        description: it.description,
        画像dataUrl: it.imageDataUrl || null,
        techpack: {
            寸法行たち: 商品名から寸法行を拾う(it.name),
            素材: it.material,
            原価: it.cost,
            納期: it.lead,
        },
    }));

    try {
        const r = await fetch('/api/ai-local/techpack-deck/build', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 商品たち, タイトル: `${(typeof AREGLM_PROFILE !== 'undefined' && AREGLM_PROFILE.name) || 'OEM'} 商品開発資料` }),
        }).then((y) => y.json());

        if (r?.ok && r.ファイル名) {
            const url = `/api/techpack-deck/download/${encodeURIComponent(r.ファイル名)}`;
            if (result) {
                result.innerHTML = '';
                const p = document.createElement('p');
                p.textContent = `${r.枚数}枚のスライドを作成しました。`;
                const a = document.createElement('a');
                a.href = url;
                a.textContent = 'ダウンロード（.pptx）';
                a.className = 'btn btn-sm btn-primary';
                const note = document.createElement('p');
                note.className = 'hint';
                note.textContent = 'PowerPoint・Keynoteでそのまま開けます。Canvaで編集したい場合は、Canvaの「インポート」からこのファイルを取り込んでください。';
                result.appendChild(p);
                result.appendChild(a);
                result.appendChild(note);
            }
            logActivity(`OEMテックパックスライドを作成（${items.length}件）`);
        } else {
            showNotification(r?.訳 || 'スライドを作成できませんでした', 'error');
        }
    } catch (err) {
        showNotification('作成に失敗しました: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'PPTXを作成'; }
    }
}

window.initOemDeck = initOemDeck;
window.deleteOemDeckItem = deleteOemDeckItem;
