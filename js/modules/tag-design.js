/**
 * 値札タグの下書き
 *
 * 工場やプリント業者に渡す前の、形と中身を決めるためのもの。
 * 実際の印刷用データではなく、
 * 「何を、どこに、どの大きさで載せるか」を決める段階のものにしてある。
 *
 * 透かしは一切入れない。
 * すべてこの端末の中だけで作る。外部へは一切送らない。
 */

const AREGLM_TAG_KEY = 'areglm_tags';

/** タグの形。よく使われる寸法にしてある（ミリ）。 */
const タグの形 = {
    縦長: { 幅: 40, 高さ: 70, 説明: 'もっとも一般的。情報を縦に並べられる' },
    正方: { 幅: 50, 高さ: 50, 説明: 'ロゴを大きく見せたいとき' },
    横長: { 幅: 70, 高さ: 40, 説明: '横書きの文字が多いとき' },
    細長: { 幅: 25, 高さ: 90, 説明: '袖や裾に付ける下げ札向き' },
};

function タグたちを読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_TAG_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function タグたちを保存(一覧) {
    localStorage.setItem(AREGLM_TAG_KEY, JSON.stringify(一覧));
}

/**
 * タグを描く。
 *
 * ミリで持っている寸法を、画面の点に直して描く。
 * 実寸のまま描くと小さすぎて見えないため、倍率をかけている。
 */
function タグを描く(canvas, 設定) {
    const 形 = タグの形[設定.形] || タグの形.縦長;
    const 倍 = 6;
    const w = 形.幅 * 倍;
    const h = 形.高さ * 倍;

    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');

    const 地 = 設定.地色 || '#f6f2e8';
    const 字 = 設定.文字色 || '#1c1c1e';

    g.fillStyle = 地;
    g.fillRect(0, 0, w, h);

    // 縁取り。切り抜き位置の目安になる。
    g.strokeStyle = 字;
    g.lineWidth = Math.max(1, 倍 * 0.35);
    g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);

    // 紐を通す穴。上から少し下げた中央に置くのが一般的。
    g.beginPath();
    g.arc(w / 2, 倍 * 7, 倍 * 2, 0, Math.PI * 2);
    g.strokeStyle = 字;
    g.lineWidth = Math.max(1, 倍 * 0.25);
    g.stroke();

    g.textAlign = 'center';
    g.fillStyle = 字;

    // ブランド名。いちばん目立たせる。
    const 名 = 設定.ブランド || 'AReGLM';
    let 大 = Math.min(w / Math.max(4, 名.length * 0.62), h * 0.14);
    g.font = `800 ${大}px "Helvetica Neue", "Hiragino Sans", sans-serif`;
    g.fillText(名, w / 2, h * 0.30);

    // シリーズ名
    if (設定.シリーズ) {
        g.font = `500 ${大 * 0.45}px "Helvetica Neue", "Hiragino Sans", sans-serif`;
        g.fillText(設定.シリーズ, w / 2, h * 0.30 + 大 * 0.85);
    }

    // 区切り線
    g.beginPath();
    g.moveTo(w * 0.2, h * 0.46);
    g.lineTo(w * 0.8, h * 0.46);
    g.lineWidth = Math.max(1, 倍 * 0.15);
    g.stroke();

    // 値段。買う人がいちばん探す情報なので、大きめに。
    if (設定.値段) {
        const 額 = '¥' + Number(設定.値段).toLocaleString('ja-JP');
        g.font = `700 ${大 * 0.8}px "Helvetica Neue", sans-serif`;
        g.fillText(額, w / 2, h * 0.60);
    }

    // 素材・原産国など、小さく載せる情報
    const 小さい情報 = [];
    if (設定.素材) 小さい情報.push(設定.素材);
    if (設定.原産国) 小さい情報.push(設定.原産国);
    if (設定.品番) 小さい情報.push(設定.品番);

    g.font = `400 ${大 * 0.34}px "Helvetica Neue", "Hiragino Sans", sans-serif`;
    小さい情報.forEach((t, i) => {
        g.fillText(t, w / 2, h * 0.72 + i * 大 * 0.5);
    });

    return { 幅mm: 形.幅, 高さmm: 形.高さ };
}

function renderTagPreview() {
    const canvas = document.getElementById('tag-canvas');
    if (!canvas) return;

    const 取 = (id) => document.getElementById(id)?.value || '';
    const 寸 = タグを描く(canvas, {
        形: 取('tag-shape'),
        ブランド: 取('tag-brand'),
        シリーズ: 取('tag-series'),
        値段: 取('tag-price'),
        素材: 取('tag-material'),
        原産国: 取('tag-origin'),
        品番: 取('tag-code'),
        地色: 取('tag-bg'),
        文字色: 取('tag-fg'),
    });

    const 情報 = document.getElementById('tag-size');
    if (情報) {
        const 形 = タグの形[取('tag-shape')] || タグの形.縦長;
        情報.textContent = `${寸.幅mm} × ${寸.高さmm} mm　${形.説明}`;
    }
}

/** 画像として書き出す。透かしは入れない。 */
/**
 * モックアップ・型紙と同じ書き出し不具合（押しても無反応に見える）が
 * ここにも同じ形で潜んでいたため、あわせて直した。
 */
function タグを書き出す() {
    const canvas = document.getElementById('tag-canvas');
    if (!canvas) {
        showNotification?.('プレビューが見つかりません', 'error');
        return;
    }
    canvas.toBlob((blob) => {
        if (!blob) {
            showNotification?.('画像の書き出しに失敗しました', 'error');
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `値札タグ_${(document.getElementById('tag-brand')?.value || 'AReGLM')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotification?.('画像を保存しました', 'success');
        if (window.logActivity) logActivity('値札タグを書き出し', { category: 'studio' });

        // 画像には何も埋め込まず、指紋だけを控える
        window.AReGLM_真贋?.作ったものを控える(canvas.toDataURL('image/png'), {
            種類: '値札タグ',
            名前: document.getElementById('tag-brand')?.value || 'AReGLM',
        });
    }, 'image/png');
}

function initTagDesign() {
    const 形 = document.getElementById('tag-shape');
    if (形 && !形.options.length) {
        形.innerHTML = Object.keys(タグの形)
            .map((k) => `<option value="${k}">${k}（${タグの形[k].幅}×${タグの形[k].高さ}mm）</option>`).join('');
    }

    // どれを触っても、その場で見た目に反映する
    ['tag-shape', 'tag-brand', 'tag-series', 'tag-price', 'tag-material',
     'tag-origin', 'tag-code', 'tag-bg', 'tag-fg'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', renderTagPreview);
        document.getElementById(id)?.addEventListener('change', renderTagPreview);
    });

    document.getElementById('tag-export')?.addEventListener('click', タグを書き出す);

    document.getElementById('tag-save')?.addEventListener('click', () => {
        const 取 = (id) => document.getElementById(id)?.value || '';
        const 一覧 = タグたちを読む();
        一覧.push({
            id: 'tag_' + Date.now(),
            形: 取('tag-shape'), ブランド: 取('tag-brand'), シリーズ: 取('tag-series'),
            値段: 取('tag-price'), 素材: 取('tag-material'), 原産国: 取('tag-origin'),
            品番: 取('tag-code'), 地色: 取('tag-bg'), 文字色: 取('tag-fg'),
            作った日: typeof 今日 === 'function' ? 今日() : '',
        });
        タグたちを保存(一覧);
        showNotification(`値札タグを保存しました（全${一覧.length}件）`, 'success');
    });

    renderTagPreview();
}

window.initTagDesign = initTagDesign;
window.renderTagPreview = renderTagPreview;
window.タグを描く = タグを描く;
window.タグの形 = タグの形;
