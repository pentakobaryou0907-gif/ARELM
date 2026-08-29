/**
 * デザイン制作 — SNS投稿画像・モックアップ下地をブラウザ内で作成
 * canvas のみで完結。外部サービスへの送信は一切なし。
 */
let designLogoImage = null;

function initDesignStudio() {
    const ids = ['design-size', 'design-bg', 'design-fg', 'design-title', 'design-subtitle', 'design-fontsize'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', renderDesignCanvas);
        el.addEventListener('change', renderDesignCanvas);
    });

    document.getElementById('design-logo')?.addEventListener('change', handleDesignLogo);
    document.getElementById('design-download-btn')?.addEventListener('click', downloadDesign);

    renderDesignCanvas();
}

function handleDesignLogo(e) {
    const file = e.target.files?.[0];
    if (!file) {
        designLogoImage = null;
        renderDesignCanvas();
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            designLogoImage = img;
            renderDesignCanvas();
        };
        img.onerror = () => showNotification('ロゴ画像の読み込みに失敗しました', 'error');
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function renderDesignCanvas() {
    const canvas = document.getElementById('design-canvas');
    if (!canvas) return;

    const [w, h] = (document.getElementById('design-size')?.value || '1080x1080').split('x').map(Number);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    const bg = document.getElementById('design-bg')?.value || '#111111';
    const fg = document.getElementById('design-fg')?.value || '#ffffff';
    const title = document.getElementById('design-title')?.value || '';
    const subtitle = document.getElementById('design-subtitle')?.value || '';
    const fontSize = parseInt(document.getElementById('design-fontsize')?.value || '110', 10);

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // ロゴは上部中央に、キャンバス幅の25%までに収める
    let cursorY = h / 2;
    if (designLogoImage) {
        const maxLogoW = w * 0.25;
        const scale = Math.min(maxLogoW / designLogoImage.width, maxLogoW / designLogoImage.height);
        const lw = designLogoImage.width * scale;
        const lh = designLogoImage.height * scale;
        ctx.drawImage(designLogoImage, (w - lw) / 2, h * 0.18 - lh / 2, lw, lh);
        cursorY = h * 0.55;
    }

    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (title) {
        ctx.font = `bold ${fontSize}px 'AReGLM Display', 'Hiragino Sans', 'Segoe UI', sans-serif`;
        wrapCanvasText(ctx, title, w / 2, cursorY, w * 0.85, fontSize * 1.15);
    }

    if (subtitle) {
        const subSize = Math.max(20, Math.round(fontSize * 0.35));
        ctx.font = `${subSize}px 'Hiragino Sans', 'Segoe UI', sans-serif`;
        ctx.globalAlpha = 0.85;
        wrapCanvasText(ctx, subtitle, w / 2, cursorY + fontSize * 1.0, w * 0.8, subSize * 1.3);
        ctx.globalAlpha = 1;
    }
}

/** 幅に収まるように折り返して描画（日本語は1文字ずつ判定） */
function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = [];
    let line = '';
    for (const ch of text) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = ch;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);

    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

function downloadDesign() {
    const canvas = document.getElementById('design-canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
        if (!blob) {
            showNotification('画像の生成に失敗しました', 'error');
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `areglm_design_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showNotification('PNGを保存しました', 'success');
        if (window.logActivity) logActivity('デザインを書き出し', { category: 'design' });
    }, 'image/png');
}

window.initDesignStudio = initDesignStudio;
window.renderDesignCanvas = renderDesignCanvas;
