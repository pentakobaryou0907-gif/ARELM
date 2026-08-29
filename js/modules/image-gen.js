/**
 * AI 服デザイン生成（Stable Diffusion XL）
 *
 * 拡散モデルは「ランダムノイズ → 反復デノイズ」で画像を作るため、
 * ステップ数を増やすほど破綻が減る（生成時間は伸びる）。
 * ガイダンス値はプロンプトへの忠実度で、高すぎると不自然になる。
 * アパレル用途では「出したくない要素」を negative prompt で明示するのが効果的。
 */

/** アパレル画像で頻出する破綻を抑えるための共通ネガティブプロンプト */
const AREGLM_NEGATIVE_PROMPT = [
    'low quality', 'blurry', 'distorted', 'deformed',
    'bad anatomy', 'extra limbs', 'extra fingers', 'mutated hands',
    'watermark', 'text', 'logo artifacts', 'jpeg artifacts',
    'wrinkled fabric texture errors', 'asymmetric sleeves'
].join(', ');

let imggenLastImage = null;

function initImageGen() {
    const ids = [
        'imggen-garment', 'imggen-material', 'imggen-color',
        'imggen-style', 'imggen-shot', 'imggen-extra'
    ];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        el?.addEventListener('input', buildImagePrompt);
        el?.addEventListener('change', buildImagePrompt);
    });

    bindRange('imggen-steps', 'imggen-steps-val');
    bindRange('imggen-guidance', 'imggen-guidance-val');

    document.getElementById('imggen-run-btn')?.addEventListener('click', runImageGen);
    document.getElementById('imggen-save-btn')?.addEventListener('click', saveGeneratedImage);

    buildImagePrompt();
}

function bindRange(rangeId, labelId) {
    const r = document.getElementById(rangeId);
    const l = document.getElementById(labelId);
    if (!r || !l) return;
    l.textContent = r.value;
    r.addEventListener('input', () => {
        l.textContent = r.value;
    });
}

/** 選択項目からSD向けの英語プロンプトを組み立てる */
function buildImagePrompt() {
    const val = (id) => document.getElementById(id)?.value?.trim() || '';
    const parts = [
        val('imggen-color'),
        val('imggen-material'),
        val('imggen-garment'),
        val('imggen-style'),
        val('imggen-shot'),
        val('imggen-extra'),
        'high quality apparel product photography, sharp focus, detailed fabric texture'
    ].filter(Boolean);

    const box = document.getElementById('imggen-prompt');
    if (box) box.value = parts.join(', ');
}

async function runImageGen() {
    const prompt = document.getElementById('imggen-prompt')?.value?.trim();
    if (!prompt) {
        showNotification('プロンプトが空です', 'error');
        return;
    }

    const out = document.getElementById('imggen-output');
    const btn = document.getElementById('imggen-run-btn');
    const saveBtn = document.getElementById('imggen-save-btn');

    if (out) out.innerHTML = '<span class="hint">生成中…（数十秒かかることがあります）</span>';
    if (btn) {
        btn.disabled = true;
        btn.textContent = '生成中…';
    }
    if (saveBtn) saveBtn.disabled = true;

    try {
        // 自作で作る。外部の鍵が無くても動くようにするため。
        const 返り = await AReGLM_LOCAL_FIRST.generateImage('local', prompt, {
            negativePrompt: AREGLM_NEGATIVE_PROMPT,
            steps: document.getElementById('imggen-steps')?.value,
            guidance: document.getElementById('imggen-guidance')?.value
        });

        // 返ってくる形が二通りある。
        //
        // 旧サイトは外部（Hugging Face）を呼んでいて、
        // 画像を文字列でそのまま受け取っていた。
        // 自作に切り替えたとき、自作側は
        // { type:'image', data:'data:image/png...' } という形で返すのに、
        // ここは文字列だけを見ていたので、
        // 図案は出来ているのに「画像を取得できませんでした」と出ていた。
        //
        // 作る側は正しく動いていて、受け取る側だけがずれていた。
        const img = (typeof 返り === 'string')
            ? 返り
            : (返り && 返り.type === 'image' ? 返り.data : '');

        if (img && img.startsWith('data:image')) {
            imggenLastImage = img;
            if (out) {
                out.innerHTML = `<img src="${AReGLM_SECURITY.escapeAttr(img)}" alt="作った服の図案">`;

                // 何をどう作ったのかを添える。
                // 出てきた絵だけ見せると、
                // 写真が出てくるものだと思われてしまう。
                if (返り && 返り.note) {
                    const 断り = document.createElement('p');
                    断り.className = 'hint imggen-note';
                    const 中身 = [];
                    if (返り.使った柄) 中身.push(`柄: ${返り.使った柄}`);
                    if (返り.載せた言葉) 中身.push(`文字: ${返り.載せた言葉}`);
                    if (返り.継ぎ目なし) 中身.push('継ぎ目なし');
                    断り.textContent = (中身.length ? 中身.join(' / ') + '　' : '') + 返り.note;
                    out.appendChild(断り);
                }

                // こちらから助言する。
                //
                // 出来た絵だけ見せて終わりでは、道具でしかない。
                // 色数が多ければ版代が上がり、線が細ければ潰れ、
                // 継ぎ目が合わなければ生地の上でずれる。
                // それは刷ってから言われても遅い。
                if (返り && 返り.助言 && 返り.助言.length) {
                    出せる助言を並べる(out, 返り);
                }
            }
            if (saveBtn) saveBtn.disabled = false;
            logActivity('自作で服の図案を作成', { category: 'design', text: prompt.slice(0, 500) });
        } else if (返り && 返り.text) {
            // 画像にできなかったときは、その理由をそのまま出す
            if (out) out.innerHTML = `<span class="hint">${AReGLM_SECURITY.sanitizeHtml(返り.text)}</span>`;
        } else {
            if (out) out.innerHTML = '<span class="hint">図案を作れませんでした</span>';
        }
    } catch (err) {
        if (out) {
            out.innerHTML = `<span class="hint">${AReGLM_SECURITY.sanitizeHtml(err.message)}</span>`;
        }
        showNotification('生成に失敗しました: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '生成する';
        }
    }
}

/**
 * 図案についての助言を並べる。
 *
 * 直すべきものを上に、問題ないものを下に置く。
 * 良い知らせに埋もれて、直すべきものを見落とさないため。
 */
function 出せる助言を並べる(out, 返り) {
    const 箱 = document.createElement('div');
    箱.className = 'imggen-advice';

    const 頭 = document.createElement('b');
    const 直す = 返り.助言.filter((x) => x.重さ > 0).length;
    頭.textContent = 直す
        ? `プリントに出す前に、${直す}件 見てください`
        : 'プリントに出せる状態です';
    箱.appendChild(頭);

    返り.助言.forEach((x) => {
        const 行 = document.createElement('div');
        行.className = 'advice-item w' + x.重さ;

        const 件 = document.createElement('b');
        件.textContent = (x.重さ >= 3 ? '● ' : x.重さ === 2 ? '▲ ' : '✓ ') + x.件;
        行.appendChild(件);

        const 訳 = document.createElement('p');
        訳.textContent = x.訳;
        行.appendChild(訳);

        if (x.手) {
            const 手 = document.createElement('p');
            手.className = 'advice-how';
            手.textContent = '→ ' + x.手;
            行.appendChild(手);
        }

        // こちらで直せるものは、こちらで直す。
        //
        // 「〜してください」で終わらせると、
        // 結局こちらが手を動かすことになる。
        // 押せば済むものは、押せるようにする。
        if (x.直す) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-sm btn-primary';
            b.textContent = 'この場で直す（' + x.直す.種類 + '）';
            b.addEventListener('click', () => 助言のとおりに直す(x.直す, b));
            行.appendChild(b);
        }

        箱.appendChild(行);
    });

    if (返り.数字) {
        const 数 = document.createElement('small');
        数.className = 'advice-numbers';
        数.textContent = '測った値: '
            + Object.entries(返り.数字).map(([k, v]) => `${k} ${v}`).join(' / ');
        箱.appendChild(数);
    }

    out.appendChild(箱);
}

/**
 * 助言のとおりに、こちらで直す。
 *
 * 直し方はそれぞれ違うが、やることは同じ——
 * 指示を書き換えて、作り直す。
 * 使う人に書き換えさせない。
 */
async function 助言のとおりに直す(直す, ボタン) {
    const 欄 = document.getElementById('imggen-prompt');
    if (!欄) return;

    const 元 = ボタン.textContent;
    ボタン.disabled = true;
    ボタン.textContent = '直しています…';

    let 指示 = 欄.value;
    let 設定 = { width: 1024, height: 1024 };

    switch (直す.種類) {
        case '継ぎ目なしにする':
            // 言葉に足しておけば、次に作るときも同じ形になる
            if (!/継ぎ目/.test(指示)) 指示 = '継ぎ目なしの ' + 指示;
            break;

        case '大きく作り直す':
            設定.width = 設定.height = 直す.目標 || 2048;
            break;

        case '柄を大きく':
            // 大きく作れば、同じ柄でも線が太くなる
            設定.width = 設定.height = 2048;
            break;

        case '色を減らす':
            // 色を指す言葉が無ければ、二色に寄せる
            if (!/白黒|モノトーン|二色/.test(指示)) 指示 = 指示 + ' 白黒';
            break;

        default:
            break;
    }

    欄.value = 指示;

    const r = 図案をつくる(指示, 設定);
    const out = document.getElementById('imggen-output');
    if (r && r.type === 'image' && out) {
        imggenLastImage = r.data;
        out.innerHTML = `<img src="${AReGLM_SECURITY.escapeAttr(r.data)}" alt="直した図案">`;

        const 断り = document.createElement('p');
        断り.className = 'hint imggen-note';
        const 中身 = [];
        if (r.使った柄) 中身.push(`柄: ${r.使った柄}`);
        if (r.継ぎ目なし) 中身.push('継ぎ目なし');
        中身.push(`${設定.width}点`);
        断り.textContent = 中身.join(' / ') + '　' + r.note;
        out.appendChild(断り);

        if (r.助言 && r.助言.length) 出せる助言を並べる(out, r);
        document.getElementById('imggen-save-btn').disabled = false;
        showNotification(`直しました（${直す.種類}）`, 'success');
    } else {
        showNotification('直せませんでした', 'error');
    }

    ボタン.disabled = false;
    ボタン.textContent = 元;
}

function saveGeneratedImage() {
    if (!imggenLastImage) return;
    const a = document.createElement('a');
    a.href = imggenLastImage;
    a.download = `areglm_design_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showNotification('画像を保存しました', 'success');
}

window.initImageGen = initImageGen;
window.buildImagePrompt = buildImagePrompt;
