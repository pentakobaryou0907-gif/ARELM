/**
 * モックアップ（商品に載せた見え方）
 *
 * なぜこれが要るのか:
 *   デザインだけ見ても、実際に服に載せたときの見え方は分からない。
 *   大きすぎた、位置が低かった、色が沈んだ——
 *   刷ってから気づくと、やり直しになる。
 *
 * 何をするものか、はっきりさせておく:
 *   商品の形は、写真ではなく線で描いている。
 *   写真のようなモックアップには、
 *   実物の写真か、写真を学習したモデルが要る。
 *   ここで確かめられるのは「大きさ・位置・配色の釣り合い」まで。
 *   「刷り上がりの見た目」ではありません。
 *
 * 透かしは一切入れない。
 * すべてこの端末の中だけで作る。外部へは一切送らない。
 */

/**
 * 載せられる商品。
 *
 * プリントできる範囲（版面）を持たせてある。
 * ここを外れると刷れないので、はみ出しを知らせるために要る。
 */
const 載せる商品 = {
    Tシャツ: {
        名: 'Tシャツ',
        版: { x: 0.30, y: 0.26, w: 0.40, h: 0.34 },  // 全体に対する割合
        描く: 'tshirt',
    },
    パーカー: {
        名: 'パーカー',
        版: { x: 0.30, y: 0.32, w: 0.40, h: 0.30 },
        描く: 'hoodie',
    },
    トート: {
        名: 'トートバッグ',
        版: { x: 0.24, y: 0.34, w: 0.52, h: 0.40 },
        描く: 'tote',
    },
};

/** 商品の色。刷った色が沈むかどうかを見るために要る。 */
const 商品の色 = {
    白: '#f4f2ee', 黒: '#1c1c1e', グレー: '#8a8a8a',
    ネイビー: '#1f2a44', ベージュ: '#d8cbb4', カーキ: '#5a5a42',
};

/** いまの設定 */
let モックの設定 = {
    商品: 'Tシャツ',
    色: '白',
    位置: 'front',   // front（胸）/ chest-small（左胸）/ back（背中）
    大きさ: 100,     // 版面に対する％
    上下: 0,         // 中心からのずれ（％）
};

/** 載せるデザイン（画像） */
let 載せる絵 = null;

/* ---------- 商品を描く ---------- */

function Tシャツを描く(g, w, h, 色) {
    const cx = w / 2;
    g.fillStyle = 色;
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 2;

    g.beginPath();
    g.moveTo(cx - w * 0.14, h * 0.10);              // 左襟
    g.lineTo(cx + w * 0.14, h * 0.10);              // 右襟
    g.lineTo(cx + w * 0.25, h * 0.14);              // 右肩
    g.lineTo(cx + w * 0.38, h * 0.34);              // 右袖先
    g.lineTo(cx + w * 0.30, h * 0.42);
    g.lineTo(cx + w * 0.24, h * 0.34);              // 右脇
    g.lineTo(cx + w * 0.24, h * 0.88);              // 右裾
    g.lineTo(cx - w * 0.24, h * 0.88);              // 左裾
    g.lineTo(cx - w * 0.24, h * 0.34);
    g.lineTo(cx - w * 0.30, h * 0.42);
    g.lineTo(cx - w * 0.38, h * 0.34);
    g.lineTo(cx - w * 0.25, h * 0.14);
    g.closePath();
    g.fill();
    g.stroke();

    // 襟。ここがないと上下が分からない。
    g.beginPath();
    g.ellipse(cx, h * 0.11, w * 0.14, h * 0.030, 0, 0, Math.PI);
    g.stroke();
}

function パーカーを描く(g, w, h, 色) {
    const cx = w / 2;
    g.fillStyle = 色;
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 2;

    // フード
    g.beginPath();
    g.ellipse(cx, h * 0.13, w * 0.20, h * 0.085, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.stroke();

    g.beginPath();
    g.moveTo(cx - w * 0.20, h * 0.15);
    g.lineTo(cx + w * 0.20, h * 0.15);
    g.lineTo(cx + w * 0.29, h * 0.20);
    g.lineTo(cx + w * 0.40, h * 0.52);
    g.lineTo(cx + w * 0.31, h * 0.58);
    g.lineTo(cx + w * 0.27, h * 0.42);
    g.lineTo(cx + w * 0.27, h * 0.86);
    g.lineTo(cx - w * 0.27, h * 0.86);
    g.lineTo(cx - w * 0.27, h * 0.42);
    g.lineTo(cx - w * 0.31, h * 0.58);
    g.lineTo(cx - w * 0.40, h * 0.52);
    g.lineTo(cx - w * 0.29, h * 0.20);
    g.closePath();
    g.fill();
    g.stroke();

    // ポケット。ここにプリントは載らないので、位置決めの目安になる。
    g.beginPath();
    g.moveTo(cx - w * 0.17, h * 0.68);
    g.lineTo(cx + w * 0.17, h * 0.68);
    g.lineTo(cx + w * 0.20, h * 0.80);
    g.lineTo(cx - w * 0.20, h * 0.80);
    g.closePath();
    g.stroke();
}

function トートを描く(g, w, h, 色) {
    const cx = w / 2;
    g.fillStyle = 色;
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 2;

    // 持ち手
    g.beginPath();
    g.moveTo(cx - w * 0.13, h * 0.24);
    g.bezierCurveTo(cx - w * 0.13, h * 0.05, cx + w * 0.13, h * 0.05, cx + w * 0.13, h * 0.24);
    g.stroke();

    g.beginPath();
    g.rect(cx - w * 0.27, h * 0.24, w * 0.54, h * 0.60);
    g.fill();
    g.stroke();
}

/* ---------- 版面と、載せる ---------- */

/** いまの位置に応じた版面を出す */
function 版面を出す(w, h) {
    const 商 = 載せる商品[モックの設定.商品];
    const v = { ...商.版 };

    if (モックの設定.位置 === 'chest-small') {
        // 左胸。小さく、左寄りに。
        v.w *= 0.30;
        v.h *= 0.30;
        v.x = 商.版.x + 商.版.w * 0.08;
        v.y = 商.版.y + 商.版.h * 0.05;
    }

    return {
        x: v.x * w,
        y: (v.y + モックの設定.上下 / 100) * h,
        w: v.w * w,
        h: v.h * h,
    };
}

/**
 * 絵を版面に収めて載せる。
 *
 * 縦横の比は変えない。伸ばすと、デザインが崩れて別物になるため。
 */
function 絵を載せる(g, 版, 絵) {
    const 倍 = モックの設定.大きさ / 100;
    const 収まる = Math.min(版.w / 絵.width, 版.h / 絵.height) * 倍;

    const w = 絵.width * 収まる;
    const h = 絵.height * 収まる;
    const x = 版.x + (版.w - w) / 2;
    const y = 版.y + (版.h - h) / 2;

    g.drawImage(絵, x, y, w, h);

    // 版面をはみ出していないかを返す。刷れないと困るため。
    return (w > 版.w + 1) || (h > 版.h + 1);
}

/* ---------- 描く ---------- */

function renderMockup() {
    const canvas = document.getElementById('mockup-canvas');
    if (!canvas) return;

    const w = 600;
    const h = 700;
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');

    // 背景。商品の色との差が分かるよう、薄い灰にする。
    g.fillStyle = '#eceae6';
    g.fillRect(0, 0, w, h);

    const 色 = 商品の色[モックの設定.色] || '#f4f2ee';
    const 商 = 載せる商品[モックの設定.商品];

    if (商.描く === 'tshirt') Tシャツを描く(g, w, h, 色);
    else if (商.描く === 'hoodie') パーカーを描く(g, w, h, 色);
    else トートを描く(g, w, h, 色);

    const 版 = 版面を出す(w, h);
    let はみ出し = false;

    if (載せる絵) {
        はみ出し = 絵を載せる(g, 版, 載せる絵);
    } else {
        // 絵が無いときは、版面だけを示す。どこに載るかが分かる。
        g.save();
        g.strokeStyle = '#b5713f';
        g.setLineDash([6, 5]);
        g.lineWidth = 1.5;
        g.strokeRect(版.x, 版.y, 版.w, 版.h);
        g.fillStyle = '#b5713f';
        g.font = '13px "Hiragino Sans", sans-serif';
        g.textAlign = 'center';
        g.fillText('ここにデザインが載ります', 版.x + 版.w / 2, 版.y + 版.h / 2);
        g.restore();
    }

    // 状態を知らせる
    const 情 = document.getElementById('mockup-info');
    if (情) {
        const 部品 = [
            `${商.名}（${モックの設定.色}）`,
            { front: '胸・中央', 'chest-small': '左胸・小', back: '背中' }[モックの設定.位置],
            `大きさ ${モックの設定.大きさ}%`,
        ];
        情.textContent = 部品.join(' ／ ');
        情.className = 'hint';
    }

    const 警 = document.getElementById('mockup-warn');
    if (警) {
        // はみ出しは必ず知らせる。刷れないものを作っても仕方がない。
        警.textContent = はみ出し
            ? '⚠ デザインが刷れる範囲をはみ出しています。大きさを下げてください。'
            : '';
        警.className = はみ出し ? 'mockup-warn on' : 'mockup-warn';
    }
}

/**
 * 書き出す。透かしは入れない。
 *
 * 押しても何も起きたように見えない、という指摘があった。
 * 成功しても失敗しても、その場で分かるようにする
 * （メディアスタジオの動画書き出しと同じ形にそろえた）。
 */
function モックアップを書き出す() {
    const canvas = document.getElementById('mockup-canvas');
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
        a.download = `モックアップ_${モックの設定.商品}_${モックの設定.色}.png`;
        // 消えた要素だとクリックが効かないブラウザがあるため、
        // 一度DOMに入れてから押し、すぐ外す。
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotification?.('画像を保存しました', 'success');
        if (window.logActivity) logActivity('モックアップ画像を書き出し', { category: 'studio' });

        // 画像には何も埋め込まない。指紋だけを手元に控える。
        // あとから「これはうちで作ったものか」を確かめられるようにするため。
        window.AReGLM_真贋?.作ったものを控える(canvas.toDataURL('image/png'), {
            種類: 'モックアップ',
            名前: `${モックの設定.商品}／${モックの設定.色}`,
        });
    }, 'image/png');
}

function initMockup() {
    // 選べる中身を作る
    const 商 = document.getElementById('mock-item');
    if (商 && !商.options.length) {
        商.innerHTML = Object.entries(載せる商品)
            .map(([k, v]) => `<option value="${k}">${v.名}</option>`).join('');
    }
    const 色 = document.getElementById('mock-color');
    if (色 && !色.options.length) {
        色.textContent = '';
        Object.keys(商品の色).forEach((k) => {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = k;
            色.appendChild(o);
        });
    }

    const 変わったら = () => {
        モックの設定.商品 = document.getElementById('mock-item')?.value || 'Tシャツ';
        モックの設定.色 = document.getElementById('mock-color')?.value || '白';
        モックの設定.位置 = document.getElementById('mock-place')?.value || 'front';
        モックの設定.大きさ = Number(document.getElementById('mock-size')?.value) || 100;
        モックの設定.上下 = Number(document.getElementById('mock-shift')?.value) || 0;
        renderMockup();
    };

    ['mock-item', 'mock-color', 'mock-place', 'mock-size', 'mock-shift'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', 変わったら);
        document.getElementById(id)?.addEventListener('change', 変わったら);
    });

    // デザインを読み込む
    document.getElementById('mock-file')?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const img = new Image();
        img.onload = () => {
            載せる絵 = img;
            renderMockup();
            URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(f);
        e.target.value = '';
    });

    // 自作の図案をそのまま載せる。作ってすぐ確かめられるように。
    document.getElementById('mock-from-design')?.addEventListener('click', () => {
        const 言葉 = prompt('どんな図案を載せますか', '黒い縞のロゴ「AReGLM」');
        if (言葉 === null) return;
        if (typeof 図案をつくる !== 'function') {
            showNotification('図案づくりが読み込まれていません', 'error');
            return;
        }
        const r = 図案をつくる(言葉, { width: 800, height: 800, transparent: true });
        const img = new Image();
        img.onload = () => { 載せる絵 = img; renderMockup(); };
        img.src = r.data;
    });

    document.getElementById('mock-clear')?.addEventListener('click', () => {
        載せる絵 = null;
        renderMockup();
    });

    document.getElementById('mock-export')?.addEventListener('click', モックアップを書き出す);

    renderMockup();
}

window.initMockup = initMockup;
window.renderMockup = renderMockup;
window.載せる商品 = 載せる商品;
window.商品の色 = 商品の色;
