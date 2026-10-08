/**
 * 画像編集
 *
 * 商品写真の調整・ぼかし・切り抜きをブラウザ内で行う。
 * canvas だけで処理し、外部サービスへは送信しない。
 * 書き出した画像に電子透かしは入らない。
 *
 * ぼかしは、写り込んだ他人や関係ないものを隠す用途を想定している。
 */

let editorImage = null;         // 読み込んだ元画像
let editorBlurRects = [];       // ぼかす範囲の一覧
let editorDragStart = null;

function initImageEditor() {
    document.getElementById('editor-file')?.addEventListener('change', loadEditorImage);
    document.getElementById('editor-download')?.addEventListener('click', downloadEditedImage);
    document.getElementById('editor-reset')?.addEventListener('click', resetEditor);
    document.getElementById('editor-undo-blur')?.addEventListener('click', () => {
        editorBlurRects.pop();
        renderEditor();
    });

    ['editor-brightness', 'editor-contrast', 'editor-saturate', 'editor-blur-strength']
        .forEach((id) => {
            const el = document.getElementById(id);
            el?.addEventListener('input', () => {
                updateEditorLabel(id);
                renderEditor();
            });
        });

    const canvas = document.getElementById('editor-canvas');
    if (canvas) {
        canvas.addEventListener('mousedown', onEditorDown);
        canvas.addEventListener('mousemove', onEditorMove);
        window.addEventListener('mouseup', onEditorUp);
    }
}

function updateEditorLabel(id) {
    const el = document.getElementById(id);
    const label = document.getElementById(id + '-val');
    if (el && label) label.textContent = el.value;
}

function loadEditorImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            editorImage = img;
            editorBlurRects = [];
            renderEditor();
            setEditorStatus(`${img.width} × ${img.height} を読み込みました`);
        };
        img.onerror = () => showNotification('画像を読み込めませんでした', 'error');
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function resetEditor() {
    editorBlurRects = [];
    ['editor-brightness', 'editor-contrast', 'editor-saturate'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = 100;
        updateEditorLabel(id);
    });
    renderEditor();
}

/** 表示用canvasの座標を、元画像の座標に変換する */
function toImageCoords(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height
    };
}

function onEditorDown(e) {
    if (!editorImage) return;
    const canvas = e.currentTarget;
    editorDragStart = toImageCoords(canvas, e.clientX, e.clientY);
}

function onEditorMove(e) {
    if (!editorDragStart || !editorImage) return;
    const canvas = e.currentTarget;
    const now = toImageCoords(canvas, e.clientX, e.clientY);
    renderEditor({
        x: Math.min(editorDragStart.x, now.x),
        y: Math.min(editorDragStart.y, now.y),
        w: Math.abs(now.x - editorDragStart.x),
        h: Math.abs(now.y - editorDragStart.y)
    });
}

function onEditorUp(e) {
    if (!editorDragStart || !editorImage) {
        editorDragStart = null;
        return;
    }
    const canvas = document.getElementById('editor-canvas');
    const now = toImageCoords(canvas, e.clientX, e.clientY);
    const rect = {
        x: Math.min(editorDragStart.x, now.x),
        y: Math.min(editorDragStart.y, now.y),
        w: Math.abs(now.x - editorDragStart.x),
        h: Math.abs(now.y - editorDragStart.y)
    };
    editorDragStart = null;

    // 極端に小さい範囲はクリック扱いにして無視する
    if (rect.w > 8 && rect.h > 8) {
        editorBlurRects.push(rect);
    }
    renderEditor();
}

function renderEditor(previewRect = null) {
    const canvas = document.getElementById('editor-canvas');
    if (!canvas) return;

    if (!editorImage) {
        canvas.width = 0;
        canvas.height = 0;
        return;
    }

    canvas.width = editorImage.width;
    canvas.height = editorImage.height;
    const ctx = canvas.getContext('2d');

    const b = document.getElementById('editor-brightness')?.value || 100;
    const c = document.getElementById('editor-contrast')?.value || 100;
    const s = document.getElementById('editor-saturate')?.value || 100;

    // 明るさ・コントラスト・彩度は canvas のフィルタで一括適用する
    ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
    ctx.drawImage(editorImage, 0, 0);
    ctx.filter = 'none';

    // 指定範囲だけをぼかす。
    // 元画像をぼかしてから、その範囲だけを切り出して重ねる。
    const strength = parseInt(document.getElementById('editor-blur-strength')?.value || '12', 10);
    const rects = previewRect ? editorBlurRects.concat([previewRect]) : editorBlurRects;

    if (rects.length && strength > 0) {
        const blurred = document.createElement('canvas');
        blurred.width = canvas.width;
        blurred.height = canvas.height;
        const bctx = blurred.getContext('2d');
        bctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) blur(${strength}px)`;
        bctx.drawImage(editorImage, 0, 0);

        rects.forEach((r) => {
            if (r.w <= 0 || r.h <= 0) return;
            ctx.drawImage(blurred, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        });
    }

    // ドラッグ中の範囲を枠線で示す
    if (previewRect && previewRect.w > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
        ctx.setLineDash([]);
    }

    const info = document.getElementById('editor-blur-count');
    if (info) info.textContent = editorBlurRects.length ? `ぼかし ${editorBlurRects.length}箇所` : '';
}

function downloadEditedImage() {
    const canvas = document.getElementById('editor-canvas');
    if (!canvas || !editorImage) {
        showNotification('先に画像を読み込んでください', 'error');
        return;
    }
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `areglm_edited_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setEditorStatus('保存しました');
        if (window.logActivity) logActivity('画像を編集して保存', { category: 'design' });
    }, 'image/png');
}

function setEditorStatus(msg) {
    const el = document.getElementById('editor-status');
    if (el) el.textContent = msg;
}

window.initImageEditor = initImageEditor;
