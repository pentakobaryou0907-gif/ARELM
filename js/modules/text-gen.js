/**
 * 文章生成の画面
 *
 * 自作の生成エンジン（server/ai/generator.py）を呼ぶ。
 * 外部AIは使わない。
 *
 * 方針:
 *  - 足りない情報は勝手に埋めず、何が要るかを伝える
 *  - 生成した文はチャット欄に出して、そのまま編集できるようにする
 */

let genTemplates = [];

async function initTextGen() {
    const sel = document.getElementById('gen-template');
    if (!sel) return;

    document.getElementById('gen-run')?.addEventListener('click', runTextGen);
    sel.addEventListener('change', renderGenFields);
    document.getElementById('gen-from-product')?.addEventListener('change', fillFromProduct);

    await loadGenTemplates();
    populateProductPicker();
}

/**
 * 登録済みの商品を選べるようにする。
 * 毎回同じ情報を打ち直さずに済むようにするため。
 */
function populateProductPicker() {
    const sel = document.getElementById('gen-from-product');
    if (!sel) return;

    let products = [];
    try {
        products = JSON.parse(localStorage.getItem('products') || '[]');
    } catch {
        products = [];
    }

    if (!products.length) {
        sel.innerHTML = '<option value="">（商品が登録されていません）</option>';
        sel.disabled = true;
        return;
    }

    sel.disabled = false;
    sel.innerHTML =
        '<option value="">商品から入力する…</option>' +
        products
            .map(
                (p) =>
                    `<option value="${AReGLM_SECURITY.escapeAttr(p.sku || p.id)}">${AReGLM_SECURITY.sanitizeHtml(p.name)}</option>`
            )
            .join('');
}

/** 選んだ商品の情報を入力欄へ流し込む */
function fillFromProduct(e) {
    const key = e.target.value;
    if (!key) return;

    let products = [];
    try {
        products = JSON.parse(localStorage.getItem('products') || '[]');
    } catch {
        products = [];
    }
    const p = products.find((x) => (x.sku || x.id) === key);
    if (!p) return;

    // 商品データの項目を、生成の入力欄に対応づける
    const map = {
        name: p.name,
        item: p.name,
        price: p.price,
        material: p.material,
        color: p.color,
        size: p.size,
        feature: p.description,
        shop: AREGLM_PROFILE?.suzuriShop
    };

    let filled = 0;
    document.querySelectorAll('#gen-fields [data-gen-key]').forEach((el) => {
        const v = map[el.dataset.genKey];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            el.value = String(v);
            filled += 1;
        }
    });

    const status = document.getElementById('gen-status');
    if (status) {
        status.textContent = filled
            ? `「${p.name}」から${filled}項目を入力しました`
            : `「${p.name}」に入力できる情報がありませんでした`;
    }
}

async function loadGenTemplates() {
    const sel = document.getElementById('gen-template');
    const status = document.getElementById('gen-status');
    if (!sel) return;

    try {
        const res = await fetch('/api/ai-local/generate/templates');
        if (!res.ok) throw new Error('取得できません');
        const data = await res.json();
        genTemplates = data.templates || [];
    } catch {
        genTemplates = [];
        if (status) status.textContent = '生成エンジンが停止しています';
        sel.innerHTML = '<option value="">（利用できません）</option>';
        return;
    }

    sel.innerHTML = genTemplates
        .map((t) => `<option value="${AReGLM_SECURITY.escapeAttr(t.id)}">${AReGLM_SECURITY.sanitizeHtml(t.label)}</option>`)
        .join('');
    renderGenFields();
}

/** 選ばれた型に応じて入力欄を出す */
function renderGenFields() {
    const box = document.getElementById('gen-fields');
    const sel = document.getElementById('gen-template');
    if (!box || !sel) return;

    const tpl = genTemplates.find((t) => t.id === sel.value);
    if (!tpl) {
        box.innerHTML = '';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    const field = (key, required) => {
        const label = tpl.labels?.[key] || key;
        return `<label class="gen-field">
            <span>${s(label)}${required ? ' <em>必須</em>' : ''}</span>
            <input type="text" data-gen-key="${s(key)}" placeholder="${s(label)}">
        </label>`;
    };

    box.innerHTML =
        tpl.required.map((k) => field(k, true)).join('') +
        tpl.optional.map((k) => field(k, false)).join('');

    // 型を変えると入力欄が作り直されるため、選んでいた商品を入れ直す
    const picker = document.getElementById('gen-from-product');
    if (picker?.value) {
        fillFromProduct({ target: picker });
    }
}

function collectGenFields() {
    const fields = {};
    document.querySelectorAll('#gen-fields [data-gen-key]').forEach((el) => {
        const v = el.value.trim();
        if (v) fields[el.dataset.genKey] = v;
    });
    return fields;
}

async function runTextGen() {
    const sel = document.getElementById('gen-template');
    const status = document.getElementById('gen-status');
    const btn = document.getElementById('gen-run');
    if (!sel?.value) return;

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'つくっています…';
    }
    if (status) status.textContent = '';

    try {
        const res = await fetch('/api/ai-local/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template: sel.value,
                fields: collectGenFields(),
                tone: document.getElementById('gen-tone')?.value || 'polite'
            })
        });
        const data = await res.json();

        if (!data.ok) {
            // 足りない情報を伝えるだけにして、勝手に補わない
            if (status) status.textContent = data.message || data.reason || 'つくれませんでした';
            return;
        }

        showGeneratedText(data);
        if (status) status.textContent = `${data.template}（${data.tone}）をつくりました`;
        if (window.logActivity) {
            logActivity(`文章を生成: ${data.template}`, { category: 'generate', text: data.outputs[0] });
        }
    } catch (err) {
        if (status) status.textContent = '生成エンジンに接続できませんでした';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '作る';
        }
    }
}

/** 生成した文をチャット欄に出す。コピーと編集ができるようにする。 */
function showGeneratedText(data) {
    const box = document.getElementById('chat-messages');
    if (!box) return;

    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    const text = data.outputs[0];

    const div = document.createElement('div');
    div.className = 'chat-generated';
    div.innerHTML = `
        <div class="generated-head">
            <strong>${s(data.template)}</strong>
            <span class="generated-tag">自作生成・外部送信なし</span>
        </div>
        <textarea class="generated-text" rows="${Math.min(14, text.split('\n').length + 2)}">${s(text)}</textarea>
        <div class="generated-actions">
            <button type="button" class="btn btn-sm btn-secondary" data-act="copy">コピー</button>
            <button type="button" class="btn btn-sm btn-secondary" data-act="sns">SNS投稿欄へ</button>
            <button type="button" class="btn btn-sm btn-secondary" data-act="learn">この書き方を覚えさせる</button>
        </div>
        <p class="generated-note">${s(data.note)}</p>`;

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;

    const ta = div.querySelector('.generated-text');

    div.querySelector('[data-act="copy"]').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(ta.value);
            showNotification('コピーしました', 'success');
        } catch {
            // クリップボードが使えない場合は選択状態にする
            ta.select();
            showNotification('選択しました。⌘Cでコピーしてください', 'info');
        }
    });

    div.querySelector('[data-act="sns"]').addEventListener('click', () => {
        const caption = document.getElementById('sns-caption');
        if (!caption) {
            showNotification('SNSページを開いてから実行してください', 'info');
            return;
        }
        caption.value = ta.value;
        if (typeof window.areglmNavigate === 'function') window.areglmNavigate('sns');
        showNotification('SNSの投稿欄に入れました', 'success');
    });

    div.querySelector('[data-act="learn"]').addEventListener('click', async () => {
        // 手直しした文を「自分の書き方」として覚えさせる
        try {
            const res = await fetch('/api/ai-local/generate/learn-style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ta.value, purpose: 'general' })
            });
            const r = await res.json();
            if (r.blocked) {
                showNotification(r.reason || 'この内容は覚えません', 'error');
                return;
            }
            showNotification(`${r.learned}文を覚えました。次からの生成に反映されます`, 'success');
        } catch {
            showNotification('覚えさせられませんでした', 'error');
        }
    });
}

window.initTextGen = initTextGen;
window.populateProductPicker = populateProductPicker;
window.loadGenTemplates = loadGenTemplates;
