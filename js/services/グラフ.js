/**
 * グラフを描く（自作）
 *
 * なぜ自作するのか:
 *
 *   グラフの部品（Chart.js など）を入れれば早い。
 *   だが、それは他人が書いたコードを取り込むこと。
 *   この道具は「全部自作」で通してきたので、ここも通す。
 *
 *   それに、必要なのは折れ線と棒だけ。
 *   そのために何万行も取り込むのは、割に合わない。
 *
 * SVGで描く理由:
 *   ・拡大しても粗くならない
 *   ・色を後から変えられる（明るい画面・暗い画面の両方に合う）
 *   ・画像として保存できる
 *
 * すべてこの端末の中だけで動きます。外部へは一切送りません。
 */

/** 数を読みやすく */
function 数を縮める(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(Math.round(n));
}

function 文字を守る(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 折れ線グラフ ― 時間とともにどう動いたか
 *
 * @param {Array} 点たち [{ラベル, 値}]
 * @param {Object} 設定  {題, 高さ, 色}
 */
function 折れ線を描く(点たち, 設定) {
    設定 = 設定 || {};
    const 幅 = 640;
    const 高 = 設定.高さ || 200;
    const 余白 = { 上: 24, 右: 16, 下: 34, 左: 46 };
    const 内幅 = 幅 - 余白.左 - 余白.右;
    const 内高 = 高 - 余白.上 - 余白.下;

    if (!点たち || 点たち.length < 2) {
        return `<svg viewBox="0 0 ${幅} ${高}" class="chart">`
            + `<text x="${幅 / 2}" y="${高 / 2}" text-anchor="middle" class="chart-empty">`
            + 'まだ描けるだけの記録がありません（2件以上で描けます）</text></svg>';
    }

    const 値たち = 点たち.map((p) => Number(p.値) || 0);
    const 最大 = Math.max(...値たち, 1);
    const 最小 = Math.min(...値たち, 0);
    const 幅一つ = 内幅 / Math.max(1, 点たち.length - 1);

    const 位置 = 点たち.map((p, i) => ({
        x: 余白.左 + i * 幅一つ,
        y: 余白.上 + 内高 - ((Number(p.値) || 0) - 最小) / Math.max(1, 最大 - 最小) * 内高,
        p,
    }));

    const 線 = 位置.map((v, i) => `${i ? 'L' : 'M'}${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
    const 面 = `${線} L${位置[位置.length - 1].x.toFixed(1)},${余白.上 + 内高} `
        + `L${位置[0].x.toFixed(1)},${余白.上 + 内高} Z`;

    // 目盛り（横線）
    const 目盛り = [0, 0.5, 1].map((r) => {
        const y = 余白.上 + 内高 - r * 内高;
        const 値 = 最小 + r * (最大 - 最小);
        return `<line x1="${余白.左}" y1="${y.toFixed(1)}" x2="${幅 - 余白.右}" y2="${y.toFixed(1)}" class="chart-grid"/>`
            + `<text x="${余白.左 - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="chart-tick">${数を縮める(値)}</text>`;
    }).join('');

    // 下の見出しは、多いと重なるので間引く
    const 間引き = Math.max(1, Math.ceil(点たち.length / 6));
    const 下 = 位置.map((v, i) => (i % 間引き === 0 || i === 位置.length - 1)
        ? `<text x="${v.x.toFixed(1)}" y="${高 - 10}" text-anchor="middle" class="chart-tick">`
            + `${文字を守る(String(v.p.ラベル || '').slice(5))}</text>`
        : '').join('');

    const 丸 = 位置.map((v) =>
        `<circle cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="2.5" class="chart-dot">`
        + `<title>${文字を守る(v.p.ラベル)}: ${数を縮める(Number(v.p.値) || 0)}</title></circle>`).join('');

    return `<svg viewBox="0 0 ${幅} ${高}" class="chart" role="img" aria-label="${文字を守る(設定.題 || '推移')}">`
        + 目盛り
        + `<path d="${面}" class="chart-area"/>`
        + `<path d="${線}" class="chart-line"/>`
        + 丸 + 下
        + '</svg>';
}

/**
 * 棒グラフ ― 何が多いか、何が効くか
 *
 * @param {Array} 棒たち [{名, 値, 目立たせる}]
 */
function 棒を描く(棒たち, 設定) {
    設定 = 設定 || {};
    const 幅 = 640;
    const 一つの高さ = 26;
    const 高 = Math.max(60, 棒たち.length * 一つの高さ + 16);
    const 左 = 設定.左 || 110;
    const 右余白 = 52;

    if (!棒たち || !棒たち.length) {
        return `<svg viewBox="0 0 ${幅} 60" class="chart">`
            + `<text x="${幅 / 2}" y="34" text-anchor="middle" class="chart-empty">記録がありません</text></svg>`;
    }

    const 最大 = Math.max(...棒たち.map((b) => Number(b.値) || 0), 0.0001);
    const 内幅 = 幅 - 左 - 右余白;

    const 中身 = 棒たち.map((b, i) => {
        const y = 8 + i * 一つの高さ;
        const w = Math.max(2, (Number(b.値) || 0) / 最大 * 内幅);
        return `<text x="${左 - 8}" y="${y + 15}" text-anchor="end" class="chart-label">`
            + `${文字を守る(b.名)}</text>`
            + `<rect x="${左}" y="${y + 4}" width="${w.toFixed(1)}" height="14" rx="3" `
            + `class="chart-bar${b.目立たせる ? ' top' : ''}"/>`
            + `<text x="${(左 + w + 6).toFixed(1)}" y="${y + 15}" class="chart-value">`
            + `${文字を守る(b.表示 || 数を縮める(Number(b.値) || 0))}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${幅} ${高}" class="chart" role="img" aria-label="${文字を守る(設定.題 || '比べ')}">`
        + 中身 + '</svg>';
}

window.折れ線を描く = 折れ線を描く;
window.棒を描く = 棒を描く;
