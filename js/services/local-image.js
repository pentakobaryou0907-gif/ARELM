/**
 * 自作の図案づくり
 *
 * 何ができて、何ができないか（先に書いておく）:
 *
 *   できること
 *     ・文字を主役にした図案（ロゴの下書き、プリント案）
 *     ・幾何学模様、縞、格子、水玉などの繰り返し柄
 *     ・言葉から色を選び、配色の当たりを付ける
 *     ・商品に載せたときの見え方（配置の検討）
 *
 *   できないこと
 *     ・写真のような画像
 *     　それには写真を大量に学習したモデルが要る。
 *     　このツールは外部モデルを使わない方針なので、作れない。
 *     　「作れます」とは言わない。
 *
 * 作ったものに透かしは一切入れない。
 * すべてこの端末の中だけで作る。外部へは一切送らない。
 */

/** 言葉から色を決めるための対応表。 */
const 言葉と色 = [
    { 語: ['黒', 'ブラック', 'black', 'ダーク', '闇'], 色: ['#111111', '#2b2b2b', '#454545'] },
    { 語: ['白', 'ホワイト', 'white', '無地'], 色: ['#f7f7f5', '#e8e6e0', '#d4d1c8'] },
    { 語: ['赤', 'レッド', 'red', '朱'], 色: ['#b3161d', '#e03a3a', '#7a0f14'] },
    { 語: ['青', 'ブルー', 'blue', '藍', 'デニム'], 色: ['#1b3a6b', '#2f5f9e', '#0d1f3c'] },
    { 語: ['緑', 'グリーン', 'green', 'カーキ'], 色: ['#2f5d3a', '#5a7d42', '#1b3a24'] },
    { 語: ['黄', 'イエロー', 'yellow', '金'], 色: ['#d9a520', '#f0c860', '#8a6a10'] },
    { 語: ['茶', 'ブラウン', 'brown', 'ベージュ', 'アース'], 色: ['#6b4f34', '#a08464', '#3d2c1c'] },
    { 語: ['紫', 'パープル', 'purple'], 色: ['#4b2d6b', '#7a55a3', '#2c1a40'] },
    { 語: ['灰', 'グレー', 'gray', 'grey'], 色: ['#5c5c5c', '#8a8a8a', '#333333'] },
    { 語: ['ピンク', 'pink', '桃'], 色: ['#c9506e', '#e88aa3', '#8a2f47'] },
];

/** 言葉から柄を決めるための対応表。 */
const 言葉と柄 = [
    { 語: ['縞', 'ストライプ', 'stripe', 'ボーダー'], 柄: 'stripe' },
    { 語: ['格子', 'チェック', 'check', 'plaid'], 柄: 'check' },
    { 語: ['水玉', 'ドット', 'dot', '玉'], 柄: 'dot' },
    { 語: ['迷彩', 'カモ', 'camo'], 柄: 'camo' },
    { 語: ['幾何', '三角', '円', 'geometric'], 柄: 'geo' },
    { 語: ['無地', 'プレーン', 'plain', 'シンプル'], 柄: 'plain' },
    // 「千鳥格子」を丸ごと入れてある。
    // 「千鳥」だけだと「格子」と同じ2文字で並び、
    // 長さで選ぶ仕組みでも引き分けて、先にある格子が勝っていた。
    { 語: ['千鳥格子', '千鳥', 'ハウンドトゥース', 'ハウンド', 'houndstooth', 'ツイード'], 柄: 'hound' },
    { 語: ['ヘリンボーン', '杉綾', 'herringbone'], 柄: 'herring' },
    { 語: ['アーガイル', '菱', 'argyle', 'ダイヤ柄'], 柄: 'argyle' },
    { 語: ['タイダイ', '絞り', 'tie-dye', 'tiedye', 'にじみ'], 柄: 'tiedye' },
];

/**
 * 言葉から、使う色を決める。
 *
 * 見つからないときは、落ち着いた既定の配色にする。
 * ばらばらな色を勝手に選ぶと、そのたびに雰囲気が変わって使いにくいため。
 */
function 色を決める(言葉) {
    const 低 = (言葉 || '').toLowerCase();
    for (const c of 言葉と色) {
        if (c.語.some((w) => 低.includes(w.toLowerCase()))) return c.色;
    }
    return ['#1c1c1e', '#4a4a4f', '#c9c5bc'];
}

/** 言葉から柄を決める。見つからなければ文字を主役にする。 */
function 柄を決める(言葉) {
    const 低 = (言葉 || '').toLowerCase();

    // いちばん長く当たった言葉を採る。
    //
    // 上から順に見ていたところ、「千鳥格子」が
    // 先にある「格子」に当たって、市松になっていた。
    // 「千鳥格子」と言われて格子を出すのでは、頼まれた物と違う。
    //
    // 長い言葉のほうが、たまたま当たる見込みが低い。
    // だから長さで選ぶ。
    let 最良 = null;
    let 最長 = 0;

    for (const p of 言葉と柄) {
        for (const w of p.語) {
            const t = w.toLowerCase();
            if (低.includes(t) && t.length > 最長) {
                最長 = t.length;
                最良 = p.柄;
            }
        }
    }

    return 最良 || 'text';
}

/**
 * 図案に載せる言葉を取り出す。
 *
 * かぎ括弧や引用符で囲まれた部分があれば、それを使う。
 * 無ければ、指示から色や柄を表す語を除いた残りを使う。
 */
function 載せる言葉(指示) {
    // かぎ括弧で囲まれていれば、それが載せたい言葉。
    const 括弧 = 指示.match(/[「『”"']([^」』”"']{1,20})[」』”"']/);
    if (括弧) return 括弧[1];

    // 英数字の並びがあれば、それを使う。
    // ブランド名やロゴの文字は、たいてい英字で書かれるため。
    const 英字 = 指示.match(/[A-Za-z][A-Za-z0-9._-]{1,19}/);
    if (英字) return 英字[0];

    // それ以外は、色や柄や言い回しを取り除いた残りを見る。
    let 残り = 指示;
    [...言葉と色, ...言葉と柄].forEach((x) => {
        x.語.forEach((w) => {
            残り = 残り.split(w).join(' ');
        });
    });
    残り = 残り
        .replace(/画像|生成|作って|つくって|描いて|かいて|して|ください|お願い|ほしい/g, ' ')
        .replace(/デザイン|ロゴ|イラスト|図案|プリント|グラフィック|柄/g, ' ')
        .replace(/[のをでにはがとへ、。・]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 1文字だけ残るのは、助詞の削り残しであることがほとんど。
    // それを図案に載せると「い」のような意味のない字が出てしまうので、
    // 2文字未満は使わない。
    if (残り.length < 2) return 'ARELM';

    return 残り.slice(0, 16);
}

/* ---------- 描く ---------- */

function 縞を描く(g, w, h, 色) {
    const 幅 = Math.max(12, Math.round(w / 14));
    for (let x = -h; x < w + h; x += 幅 * 2) {
        g.fillStyle = 色[1];
        g.save();
        g.translate(x, 0);
        g.rotate(-0.35);
        g.fillRect(0, -h, 幅, h * 3);
        g.restore();
    }
}

function 格子を描く(g, w, h, 色) {
    const 間 = Math.max(24, Math.round(w / 9));
    g.strokeStyle = 色[1];
    g.lineWidth = Math.max(3, 間 / 8);
    for (let x = 間 / 2; x < w; x += 間) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let y = 間 / 2; y < h; y += 間) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
}

function 水玉を描く(g, w, h, 色) {
    const 間 = Math.max(30, Math.round(w / 8));
    const 半径 = 間 / 5;
    for (let y = 間 / 2, 行 = 0; y < h; y += 間, 行++) {
        for (let x = 間 / 2 + (行 % 2 ? 間 / 2 : 0); x < w; x += 間) {
            g.fillStyle = 色[1];
            g.beginPath(); g.arc(x, y, 半径, 0, Math.PI * 2); g.fill();
        }
    }
}

/**
 * 迷彩を描く。
 *
 * 出る形をその都度変えると、同じ指示で違うものが出てしまう。
 * 指示の文字から数を作り、同じ指示なら同じ柄が出るようにしてある。
 */
function 迷彩を描く(g, w, h, 色, 種) {
    let 状態 = 種;
    const 次 = () => {
        // 同じ指示なら同じ並びが出るようにするための、簡単な数の作り方
        状態 = (状態 * 1664525 + 1013904223) % 4294967296;
        return 状態 / 4294967296;
    };

    for (let i = 0; i < 26; i++) {
        g.fillStyle = 色[1 + (i % 2)];
        g.beginPath();
        const cx = 次() * w;
        const cy = 次() * h;
        const r = (0.06 + 次() * 0.10) * Math.min(w, h);
        g.moveTo(cx + r, cy);
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
            const ゆらぎ = r * (0.65 + 次() * 0.6);
            g.lineTo(cx + Math.cos(a) * ゆらぎ, cy + Math.sin(a) * ゆらぎ);
        }
        g.closePath();
        g.fill();
    }
}

function 幾何を描く(g, w, h, 色) {
    const 数 = 7;
    for (let i = 0; i < 数; i++) {
        g.fillStyle = 色[(i % 2) + 1];
        g.globalAlpha = 0.75;
        const s = (0.12 + (i / 数) * 0.3) * Math.min(w, h);
        const x = (w / (数 + 1)) * (i + 1);
        const y = h / 2 + Math.sin(i) * h * 0.15;
        if (i % 3 === 0) {
            g.beginPath(); g.arc(x, y, s / 2, 0, Math.PI * 2); g.fill();
        } else if (i % 3 === 1) {
            g.fillRect(x - s / 2, y - s / 2, s, s);
        } else {
            g.beginPath();
            g.moveTo(x, y - s / 2);
            g.lineTo(x + s / 2, y + s / 2);
            g.lineTo(x - s / 2, y + s / 2);
            g.closePath(); g.fill();
        }
    }
    g.globalAlpha = 1;
}

/**
 * 文字を主役にした図案を描く。
 *
 * 幅に合わせて字の大きさを決める。
 * 決め打ちにすると、長い言葉がはみ出すため。
 */
function 文字を描く(g, w, h, 色, 言葉) {
    let 大きさ = Math.round(w / Math.max(4, 言葉.length * 0.62));
    大きさ = Math.min(大きさ, Math.round(h * 0.32));

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${大きさ}px "Helvetica Neue", "Hiragino Sans", sans-serif`;

    // 影を薄く敷いて、地の色から浮かせる
    g.fillStyle = 色[0];
    g.globalAlpha = 0.35;
    g.fillText(言葉, w / 2 + 大きさ * 0.04, h / 2 + 大きさ * 0.04);
    g.globalAlpha = 1;

    g.fillStyle = 色[2];
    g.fillText(言葉, w / 2, h / 2);

    // 下線。文字幅に合わせる。
    const 幅 = g.measureText(言葉).width;
    g.strokeStyle = 色[1];
    g.lineWidth = Math.max(2, 大きさ / 16);
    g.beginPath();
    g.moveTo(w / 2 - 幅 / 2, h / 2 + 大きさ * 0.62);
    g.lineTo(w / 2 + 幅 / 2, h / 2 + 大きさ * 0.62);
    g.stroke();
}


/* ==========================================================
   服の柄（継ぎ目が出ないように描く）

   なぜ継ぎ目にこだわるのか:
     生地に柄を敷き詰めるとき、一枚の絵を縦横に並べて刷る。
     端が揃っていないと、そこに線が見える。
     一度刷ってから気づくと、生地ごと無駄になる。

     だから、端をまたぐ形は反対側にも描く。
     そうすれば、並べたときに必ず繋がる。
   ========================================================== */

/**
 * 端をまたぐものを、反対側にも描く。
 *
 * 図案の右端からはみ出した分は、左端にも同じものを描く。
 * 上下も同じ。これで、並べたときに切れ目が出ない。
 */
function 回り込んで描く(g, w, h, 描く) {
    for (const dx of [-w, 0, w]) {
        for (const dy of [-h, 0, h]) {
            g.save();
            g.translate(dx, dy);
            描く(g);
            g.restore();
        }
    }
}

/** 千鳥格子。ツイードの定番で、少ない色で成立する。 */
function 千鳥格子を描く(g, w, h, 色) {
    const 一辺 = Math.max(24, Math.round(w / 12));
    g.fillStyle = 色[0];
    g.fillRect(0, 0, w, h);
    g.fillStyle = 色[1] || '#ffffff';

    for (let y = -一辺; y < h + 一辺; y += 一辺 * 2) {
        for (let x = -一辺; x < w + 一辺; x += 一辺 * 2) {
            // 市松の地
            g.fillRect(x, y, 一辺, 一辺);
            g.fillRect(x + 一辺, y + 一辺, 一辺, 一辺);

            // 千鳥らしい爪。これが無いとただの市松になる。
            const t = 一辺 / 2;
            g.beginPath();
            g.moveTo(x + 一辺, y);
            g.lineTo(x + 一辺 + t, y - t);
            g.lineTo(x + 一辺 + t, y);
            g.closePath();
            g.fill();

            g.beginPath();
            g.moveTo(x + 一辺, y + 一辺 * 2);
            g.lineTo(x + 一辺 - t, y + 一辺 * 2 + t);
            g.lineTo(x + 一辺, y + 一辺 * 2 + t);
            g.closePath();
            g.fill();
        }
    }
}

/** ヘリンボーン。杉綾。落ち着いた印象になる。 */
function ヘリンボーンを描く(g, w, h, 色) {
    const 幅 = Math.max(16, Math.round(w / 20));
    g.fillStyle = 色[0];
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 色[1] || '#ffffff';
    g.lineWidth = Math.max(4, 幅 / 4);
    g.lineCap = 'butt';

    let 段 = 0;
    for (let y = -幅; y < h + 幅; y += 幅) {
        const 右上がり = 段 % 2 === 0;
        for (let x = -幅 * 2; x < w + 幅 * 2; x += 幅 * 2) {
            g.beginPath();
            if (右上がり) {
                g.moveTo(x, y + 幅);
                g.lineTo(x + 幅, y);
            } else {
                g.moveTo(x, y);
                g.lineTo(x + 幅, y + 幅);
            }
            g.stroke();
        }
        段 += 1;
    }
}

/** アーガイル。菱形。ニットやソックスの定番。 */
function アーガイルを描く(g, w, h, 色) {
    const 幅 = Math.max(48, Math.round(w / 5));
    const 高 = Math.round(幅 * 1.4);

    g.fillStyle = 色[0];
    g.fillRect(0, 0, w, h);

    // 菱形
    const 菱 = (cx, cy, c) => {
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(cx, cy - 高 / 2);
        g.lineTo(cx + 幅 / 2, cy);
        g.lineTo(cx, cy + 高 / 2);
        g.lineTo(cx - 幅 / 2, cy);
        g.closePath();
        g.fill();
    };

    let 段 = 0;
    for (let y = 0; y <= h + 高; y += 高 / 2) {
        let 列 = 0;
        for (let x = (段 % 2 ? 0 : 幅 / 2) - 幅; x <= w + 幅; x += 幅) {
            菱(x, y, 列 % 2 ? (色[1] || '#ffffff') : (色[2] || 色[1] || '#888888'));
            列 += 1;
        }
        段 += 1;
    }

    // 斜めの細線。アーガイルはこれが入って初めてそれらしくなる。
    g.strokeStyle = 色[2] || '#ffffff';
    g.lineWidth = Math.max(3, 幅 / 40);
    g.setLineDash([幅 / 6, 幅 / 8]);
    for (let x = -w; x < w * 2; x += 幅) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke();
        g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke();
    }
    g.setLineDash([]);
}

/** 継ぎ目の出ない水玉。端にかかる玉を反対側にも描く。 */
function 継ぎ目なし水玉を描く(g, w, h, 色, 種) {
    g.fillStyle = 色[0];
    g.fillRect(0, 0, w, h);

    const 間 = Math.max(48, Math.round(w / 8));
    const 半径 = 間 / 4;

    let s = 種 || 1;
    const 次 = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };

    for (let y = 0; y < h; y += 間) {
        for (let x = 0; x < w; x += 間) {
            const cx = x + 間 / 2 + (次() - 0.5) * 間 * 0.2;
            const cy = y + 間 / 2 + (次() - 0.5) * 間 * 0.2;
            g.fillStyle = 次() > 0.5 ? (色[1] || '#ffffff') : (色[2] || 色[1] || '#cccccc');

            回り込んで描く(g, w, h, (gg) => {
                gg.beginPath();
                gg.arc(cx, cy, 半径, 0, Math.PI * 2);
                gg.fill();
            });
        }
    }
}

/** タイダイ風。にじみを重ねる。 */
function タイダイを描く(g, w, h, 色, 種) {
    let s = 種 || 1;
    const 次 = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };

    g.fillStyle = 色[0];
    g.fillRect(0, 0, w, h);

    for (let i = 0; i < 6; i++) {
        const cx = 次() * w;
        const cy = 次() * h;
        const r = (0.2 + 次() * 0.4) * w;
        const c = 色[1 + (i % Math.max(1, 色.length - 1))] || 色[1] || '#ffffff';

        回り込んで描く(g, w, h, (gg) => {
            const 濃淡 = gg.createRadialGradient(cx, cy, 0, cx, cy, r);
            濃淡.addColorStop(0, c);
            濃淡.addColorStop(1, 'rgba(0,0,0,0)');
            gg.fillStyle = 濃淡;
            gg.beginPath();
            gg.arc(cx, cy, r, 0, Math.PI * 2);
            gg.fill();
        });
    }
}

/**
 * 図案を作る。
 *
 * @param {string} 指示 「黒 縞 のロゴ」のような言葉
 * @param {object} 設定 { width, height, transparent }
 * @returns {{type:string, data?:string, text?:string, note:string}}
 */
function 図案をつくる(指示, 設定 = {}) {
    const w = 設定.width || 1024;
    const h = 設定.height || 1024;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');

    const 色 = 色を決める(指示);
    const 柄 = 柄を決める(指示);

    // 「継ぎ目なし」「リピート」と言われたら、端が繋がる描き方にする。
    // 設定で渡されていなくても、言葉から読み取る。
    // 生地に敷き詰める話なら、これが要るかどうかは本人が言うより
    // こちらが気づくべきこと。
    if (/継ぎ目|つなぎ目|リピート|敷き詰|seamless|repeat|総柄|全面/.test(指示 || '')) {
        設定.継ぎ目なし = true;
    }
    const 言葉 = 載せる言葉(指示);

    // 同じ指示なら同じ図案が出るよう、文字から数を作る
    let 種 = 0;
    for (const c of 指示 || '') 種 = (種 * 31 + c.charCodeAt(0)) % 2147483647;

    // 地の色。透過が要るときは塗らない。
    if (!設定.transparent) {
        g.fillStyle = 色[0];
        g.fillRect(0, 0, w, h);
    }

    switch (柄) {
        case 'stripe': 縞を描く(g, w, h, 色); break;
        case 'check':  格子を描く(g, w, h, 色); break;
        case 'dot':
            // 「継ぎ目なし」と言われたら、端が繋がる描き方にする。
            // 生地に敷き詰めるなら、こちらでないと線が見える。
            if (設定.継ぎ目なし) 継ぎ目なし水玉を描く(g, w, h, 色, 種 || 1);
            else 水玉を描く(g, w, h, 色);
            break;
        case 'hound':   千鳥格子を描く(g, w, h, 色); break;
        case 'herring': ヘリンボーンを描く(g, w, h, 色); break;
        case 'argyle':  アーガイルを描く(g, w, h, 色); break;
        case 'tiedye':  タイダイを描く(g, w, h, 色, 種 || 1); break;
        case 'camo':   迷彩を描く(g, w, h, 色, 種 || 1); break;
        case 'geo':    幾何を描く(g, w, h, 色); break;
        case 'plain':  break;
        default:       break;
    }

    // 柄だけのときも、指示に言葉が入っていれば載せる
    if (柄 === 'text' || (言葉 && 言葉 !== 'ARELM')) {
        文字を描く(g, w, h, 色, 言葉);
    }

    // 作ったら、こちらから助言する。
    //
    // 聞かれるまで黙っているのでは、助けたことにならない。
    // 色数・線の細さ・継ぎ目・大きさは、
    // 刷ってから気づくと生地ごと無駄になる。
    let 見立て = null;
    try {
        if (typeof 図案を見て助言する === 'function') {
            見立て = 図案を見て助言する(canvas, { 柄 });
        }
    } catch (e) {
        // 助言が出せなくても、図案そのものは渡す。
        // ここで止まると、絵まで届かなくなる。
        console.warn('図案の助言を出せませんでした:', e.message);
    }

    return {
        type: 'image',
        data: canvas.toDataURL('image/png'),
        note: '自作で作った図案です（透かしは入っていません）。'
            + '写真のような画像は、自作だけでは作れません。'
            + 'ロゴの下書き、プリント案、配色の検討にお使いください。',
        使った色: 色,
        使った柄: 柄,
        載せた言葉: 言葉,
        継ぎ目なし: !!設定.継ぎ目なし,
        助言: 見立て ? 見立て.助言 : [],
        数字: 見立て ? 見立て.数字 : null,
    };
}

window.図案をつくる = 図案をつくる;
window.色を決める = 色を決める;
window.柄を決める = 柄を決める;
