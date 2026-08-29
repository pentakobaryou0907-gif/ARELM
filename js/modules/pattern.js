/**
 * 服のパターン（型紙）の下書き
 *
 * なぜこれが要るのか:
 *   テックパックに寸法だけ書いても、工場では形が分からない。
 *   図があれば、思っていたものと違うものが上がってくる事故が減る。
 *
 * 何をするものか、はっきりさせておく:
 *   これは「打ち合わせ用の下書き」です。
 *   実際に裁断できる型紙ではありません。
 *
 *   本物の型紙には、縫い代・地の目・いせ込み・グレーディングなど、
 *   専門の知識と道具が要ります。
 *   ここで作れるのは、寸法を入れた形の図までです。
 *   「これで裁断できます」とは言いません。
 *
 * すべてこの端末の中だけで作る。外部へは一切送らない。
 */

/**
 * 型の種類と、その寸法。
 *
 * 寸法はセンチ。M サイズを基準にしてある。
 * 数値は一般的な既製服の目安で、そのまま使える保証はない。
 */
const 型の種類 = {
    Tシャツ: {
        名: 'Tシャツ（半袖）',
        寸法: { 着丈: 70, 身幅: 52, 肩幅: 46, 袖丈: 20, 袖口: 18, 襟ぐり: 18 },
        描く: 'top',
    },
    パーカー: {
        名: 'パーカー（プルオーバー）',
        寸法: { 着丈: 68, 身幅: 58, 肩幅: 52, 袖丈: 58, 袖口: 10, 襟ぐり: 20 },
        描く: 'top',
    },
    シャツ: {
        名: 'シャツ（長袖）',
        寸法: { 着丈: 74, 身幅: 54, 肩幅: 45, 袖丈: 60, 袖口: 11, 襟ぐり: 19 },
        描く: 'top',
    },
    パンツ: {
        名: 'パンツ',
        寸法: { 総丈: 100, ウエスト: 40, ヒップ: 52, わたり: 32, 裾幅: 20, 股上: 28 },
        描く: 'pants',
    },
    バッグ: {
        名: 'トートバッグ',
        寸法: { 高さ: 38, 幅: 36, マチ: 12, 持ち手長さ: 60, 持ち手幅: 3 },
        描く: 'bag',
    },
};

/** いま選んでいる型 */
let いまの型 = 'Tシャツ';

/**
 * 図を描く。
 *
 * センチをそのまま点にすると小さすぎるので、倍率をかける。
 * 実寸で見たいわけではなく、形と数字が分かればよいため。
 */
function 型紙を描く(canvas, 種類, 寸法) {
    const 型 = 型の種類[種類];
    if (!型) return;

    const 倍 = 5;
    const 余白 = 60;

    // 描くのに必要な幅と高さを、寸法から決める
    let 図幅, 図高;
    if (型.描く === 'top') {
        図幅 = (寸法.身幅 + 寸法.袖丈 * 2) * 倍;
        図高 = 寸法.着丈 * 倍;
    } else if (型.描く === 'pants') {
        図幅 = 寸法.ヒップ * 倍;
        図高 = 寸法.総丈 * 倍;
    } else {
        図幅 = 寸法.幅 * 倍;
        図高 = (寸法.高さ + 寸法.持ち手長さ * 0.5) * 倍;
    }

    canvas.width = 図幅 + 余白 * 2;
    canvas.height = 図高 + 余白 * 2;
    const g = canvas.getContext('2d');

    g.fillStyle = '#fffdf8';
    g.fillRect(0, 0, canvas.width, canvas.height);

    g.strokeStyle = '#1c1c1e';
    g.lineWidth = 2;
    g.fillStyle = '#1c1c1e';
    g.font = '11px "Helvetica Neue", "Hiragino Sans", sans-serif';

    const cx = canvas.width / 2;

    if (型.描く === 'top') 上着を描く(g, cx, 余白, 寸法, 倍);
    else if (型.描く === 'pants') パンツを描く(g, cx, 余白, 寸法, 倍);
    else バッグを描く(g, cx, 余白, 寸法, 倍);

    // 断り書きを図に入れる。
    // 図だけ渡ると「これで裁断できる」と思われるため。
    g.fillStyle = '#8a7a5a';
    g.font = '10px "Hiragino Sans", sans-serif';
    g.textAlign = 'left';
    g.fillText('※ 打ち合わせ用の下書きです。縫い代は含みません。この図では裁断できません。', 10, canvas.height - 12);
}

/** 寸法線と数字を書く。どこの寸法かが分からないと意味がないため。 */
function 寸法線(g, x1, y1, x2, y2, 文) {
    g.save();
    g.strokeStyle = '#b5713f';
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.setLineDash([]);

    g.fillStyle = '#b5713f';
    g.font = '11px "Hiragino Sans", sans-serif';
    g.textAlign = 'center';
    g.fillText(文, (x1 + x2) / 2, (y1 + y2) / 2 - 4);
    g.restore();
}

function 上着を描く(g, cx, 上, s, 倍) {
    const 身半 = (s.身幅 * 倍) / 2;
    const 肩半 = (s.肩幅 * 倍) / 2;
    const 着 = s.着丈 * 倍;
    const 袖 = s.袖丈 * 倍;
    const 襟半 = (s.襟ぐり * 倍) / 2;
    const 肩下 = 上 + 着 * 0.06;
    const 脇 = 上 + 着 * 0.30;

    g.beginPath();
    // 襟から右肩へ
    g.moveTo(cx - 襟半, 上);
    g.lineTo(cx + 襟半, 上);
    g.lineTo(cx + 肩半, 肩下);
    // 袖
    g.lineTo(cx + 肩半 + 袖, 肩下 + 袖 * 0.55);
    g.lineTo(cx + 肩半 + 袖, 肩下 + 袖 * 0.55 + s.袖口 * 倍 * 0.5);
    g.lineTo(cx + 身半, 脇);
    // 脇から裾
    g.lineTo(cx + 身半, 上 + 着);
    g.lineTo(cx - 身半, 上 + 着);
    g.lineTo(cx - 身半, 脇);
    // 左袖
    g.lineTo(cx - 肩半 - 袖, 肩下 + 袖 * 0.55 + s.袖口 * 倍 * 0.5);
    g.lineTo(cx - 肩半 - 袖, 肩下 + 袖 * 0.55);
    g.lineTo(cx - 肩半, 肩下);
    g.closePath();
    g.stroke();

    寸法線(g, cx - 身半, 上 + 着 + 14, cx + 身半, 上 + 着 + 14, `身幅 ${s.身幅}cm`);
    寸法線(g, cx - 肩半, 肩下 - 14, cx + 肩半, 肩下 - 14, `肩幅 ${s.肩幅}cm`);
    寸法線(g, cx + 身半 + 14, 上, cx + 身半 + 14, 上 + 着, `着丈 ${s.着丈}cm`);
}

function パンツを描く(g, cx, 上, s, 倍) {
    const ヒ半 = (s.ヒップ * 倍) / 2;
    const ウ半 = (s.ウエスト * 倍) / 2;
    const 総 = s.総丈 * 倍;
    const 股 = s.股上 * 倍;
    const 裾半 = (s.裾幅 * 倍) / 2;

    g.beginPath();
    g.moveTo(cx - ウ半, 上);
    g.lineTo(cx + ウ半, 上);
    g.lineTo(cx + ヒ半, 上 + 股 * 0.7);
    g.lineTo(cx + 裾半 * 1.2, 上 + 総);
    g.lineTo(cx + 裾半 * 0.2, 上 + 総);
    g.lineTo(cx, 上 + 股);          // 股下
    g.lineTo(cx - 裾半 * 0.2, 上 + 総);
    g.lineTo(cx - 裾半 * 1.2, 上 + 総);
    g.lineTo(cx - ヒ半, 上 + 股 * 0.7);
    g.closePath();
    g.stroke();

    寸法線(g, cx - ウ半, 上 - 14, cx + ウ半, 上 - 14, `ウエスト ${s.ウエスト}cm`);
    寸法線(g, cx + ヒ半 + 14, 上, cx + ヒ半 + 14, 上 + 総, `総丈 ${s.総丈}cm`);
    寸法線(g, cx - ヒ半 - 14, 上, cx - ヒ半 - 14, 上 + 股, `股上 ${s.股上}cm`);
}

function バッグを描く(g, cx, 上, s, 倍) {
    const 半 = (s.幅 * 倍) / 2;
    const 高 = s.高さ * 倍;
    const 持 = s.持ち手長さ * 倍 * 0.5;
    const 本体上 = 上 + 持 * 0.6;

    // 持ち手
    g.beginPath();
    g.moveTo(cx - 半 * 0.5, 本体上);
    g.bezierCurveTo(cx - 半 * 0.5, 本体上 - 持, cx + 半 * 0.5, 本体上 - 持, cx + 半 * 0.5, 本体上);
    g.stroke();

    // 本体
    g.beginPath();
    g.rect(cx - 半, 本体上, 半 * 2, 高);
    g.stroke();

    // マチ（点線で示す）
    g.save();
    g.setLineDash([5, 4]);
    g.strokeStyle = '#8a8a8a';
    g.beginPath();
    g.moveTo(cx - 半 + s.マチ * 倍 * 0.5, 本体上 + 高);
    g.lineTo(cx - 半 + s.マチ * 倍 * 0.5, 本体上 + 高 - s.マチ * 倍 * 0.4);
    g.moveTo(cx + 半 - s.マチ * 倍 * 0.5, 本体上 + 高);
    g.lineTo(cx + 半 - s.マチ * 倍 * 0.5, 本体上 + 高 - s.マチ * 倍 * 0.4);
    g.stroke();
    g.restore();

    寸法線(g, cx - 半, 本体上 + 高 + 14, cx + 半, 本体上 + 高 + 14, `幅 ${s.幅}cm`);
    寸法線(g, cx + 半 + 14, 本体上, cx + 半 + 14, 本体上 + 高, `高さ ${s.高さ}cm`);
    寸法線(g, cx - 半 * 0.5, 上 - 4, cx + 半 * 0.5, 上 - 4, `持ち手 ${s.持ち手長さ}cm`);
}

/* ---------- 画面 ---------- */

function renderPattern() {
    const canvas = document.getElementById('pattern-canvas');
    if (!canvas) return;

    const 型 = 型の種類[いまの型];
    const 寸法 = {};
    Object.keys(型.寸法).forEach((k) => {
        const el = document.getElementById('pat-' + k);
        寸法[k] = Number(el?.value) || 型.寸法[k];
    });

    型紙を描く(canvas, いまの型, 寸法);
}

/** 寸法の入力欄を、型に合わせて作り直す */
function 寸法欄を作る() {
    const 箱 = document.getElementById('pattern-fields');
    if (!箱) return;

    const 型 = 型の種類[いまの型];
    箱.innerHTML = '';

    Object.entries(型.寸法).forEach(([名, 既定]) => {
        const l = document.createElement('label');
        const s = document.createElement('span');
        s.textContent = 名;
        const i = document.createElement('input');
        i.type = 'number';
        i.id = 'pat-' + 名;
        i.min = '1';
        i.step = '0.5';
        i.value = String(既定);
        i.addEventListener('input', renderPattern);
        l.appendChild(s);
        l.appendChild(i);
        箱.appendChild(l);
    });
}

/** 図を書き出す */
/**
 * 押しても何も起きたように見えない、という指摘があった。
 * 成功しても失敗しても、その場で分かるようにする。
 */
function 型紙を書き出す() {
    const canvas = document.getElementById('pattern-canvas');
    if (!canvas) {
        showNotification?.('プレビューが見つかりません', 'error');
        return;
    }
    canvas.toBlob((blob) => {
        if (!blob) {
            showNotification?.('図の書き出しに失敗しました', 'error');
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `型紙下書き_${いまの型}.png`;
        // 消えた要素だとクリックが効かないブラウザがあるため、
        // 一度DOMに入れてから押し、すぐ外す。
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotification?.('図を保存しました', 'success');
        if (window.logActivity) logActivity('型紙下書きを書き出し', { category: 'studio' });

        // 画像には何も埋め込まず、指紋だけを控える
        window.AReGLM_真贋?.作ったものを控える(canvas.toDataURL('image/png'), {
            種類: '型紙下書き',
            名前: String(いまの型 || ''),
        });
    }, 'image/png');
}

function initPattern() {
    const 選 = document.getElementById('pattern-kind');
    if (選 && !選.options.length) {
        選.innerHTML = Object.entries(型の種類)
            .map(([k, v]) => `<option value="${k}">${v.名}</option>`).join('');
    }

    選?.addEventListener('change', () => {
        いまの型 = 選.value;
        寸法欄を作る();
        renderPattern();
    });

    document.getElementById('pattern-export')?.addEventListener('click', 型紙を書き出す);

    寸法欄を作る();
    renderPattern();
}

window.initPattern = initPattern;
window.renderPattern = renderPattern;
window.型紙を描く = 型紙を描く;
window.型の種類 = 型の種類;
