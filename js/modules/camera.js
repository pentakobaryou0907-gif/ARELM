/**
 * カメラと画像の分析
 *
 * 目的:
 *   商品や生地をその場で撮り、色・明るさ・傾きといった
 *   数えられることを調べる。
 *
 * 何ができて、何ができないか（ここをはっきりさせておく）:
 *
 *   できること … 画素を数えれば分かること
 *     ・主な色（何色が、どれくらい使われているか）
 *     ・明るさ、コントラスト
 *     ・ぼけているかどうか
 *     ・縦横比と大きさ
 *
 *   できないこと … 「何が写っているか」を言い当てること
 *     これには写真を大量に学習したモデルが要る。
 *     このツールは外部モデルを使わない方針なので、
 *     「Tシャツが写っています」とは言えない。
 *     言えないことを言わないのが、このツールの約束。
 *
 * カメラは押したときだけ入る。勝手には入らない。
 * 撮った画像は、この端末の中だけに置く。外部へは一切送らない。
 */

let カメラの流れ = null;

/** カメラを入れる。押されたときだけ呼ばれる。 */
async function カメラを入れる() {
    const 映像 = document.getElementById('camera-view');
    if (!映像) return;

    if (!window.isSecureContext) {
        showNotification(
            'この接続ではカメラを使えません。127.0.0.1 か https:// で開いてください。',
            'error'
        );
        return;
    }

    try {
        // 背面カメラがあればそちらを使う。商品を撮ることが多いため。
        カメラの流れ = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 } },
            audio: false,
        });
        映像.srcObject = カメラの流れ;
        await 映像.play();
        document.getElementById('camera-box')?.classList.add('on');
        showNotification('カメラが入りました。切るまで映り続けます。', 'success');
    } catch (e) {
        showNotification(
            e.name === 'NotAllowedError'
                ? 'カメラが許可されていません。アドレス欄左のアイコンから許可してください'
                : 'カメラを使えませんでした: ' + e.message,
            'error'
        );
    }
}

/** カメラを切る。切ったことが目で分かるようにする。 */
function カメラを切る() {
    if (カメラの流れ) {
        カメラの流れ.getTracks().forEach((t) => t.stop());
        カメラの流れ = null;
    }
    const 映像 = document.getElementById('camera-view');
    if (映像) 映像.srcObject = null;
    document.getElementById('camera-box')?.classList.remove('on');
}

/** いまカメラが入っているか。自己点検から見えるようにしておく。 */
function カメラが入っているか() {
    return カメラの流れ !== null;
}

/* ---------- 画像を調べる ---------- */

/**
 * 画像から、数えれば分かることだけを取り出す。
 *
 * 推し量りは一切しない。
 * 「暗いので夜に撮った写真です」のようなことは言わない。
 * それは数えた結果ではなく、こちらの想像だから。
 */
function 画像を調べる(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const 画素 = ctx.getImageData(0, 0, w, h).data;

    let 明るさの合計 = 0;
    let 明るさの二乗和 = 0;
    const 色の数え = new Map();
    const 総数 = w * h;

    for (let i = 0; i < 画素.length; i += 4) {
        const r = 画素[i], g = 画素[i + 1], b = 画素[i + 2];

        // 目が感じる明るさ。緑を重く見るのは、人の目がそうできているため。
        const 明 = 0.299 * r + 0.587 * g + 0.114 * b;
        明るさの合計 += 明;
        明るさの二乗和 += 明 * 明;

        // 色を粗くまとめて数える。細かく分けると、
        // ほぼ同じ色が別物として散らばり、主な色が分からなくなる。
        const 鍵 = `${r >> 5},${g >> 5},${b >> 5}`;
        色の数え.set(鍵, (色の数え.get(鍵) || 0) + 1);
    }

    const 平均明るさ = 明るさの合計 / 総数;
    const 散らばり = Math.sqrt(明るさの二乗和 / 総数 - 平均明るさ * 平均明るさ);

    // 主な色を上から5つ
    const 主な色 = [...色の数え.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([鍵, 数]) => {
            const [r, g, b] = 鍵.split(',').map((v) => (parseInt(v, 10) << 5) + 16);
            return {
                色: `rgb(${r}, ${g}, ${b})`,
                割合: Math.round((数 / 総数) * 1000) / 10,
                名前: 色の呼び名(r, g, b),
            };
        });

    return {
        大きさ: `${w} × ${h}`,
        縦横比: (w / h).toFixed(2),
        明るさ: Math.round(平均明るさ),
        明暗の差: Math.round(散らばり),
        ぼけ具合: ぼけを測る(画素, w, h),
        主な色: 主な色,
    };
}

/**
 * ぼけているかを測る。
 *
 * 隣り合う画素の差が大きいほど、輪郭がはっきりしている。
 * 差が小さければ、ぼけているか、のっぺりした被写体。
 * どちらかまでは分からないので、そこは言い切らない。
 */
function ぼけを測る(画素, w, h) {
    let 差の合計 = 0;
    let 数 = 0;

    // すべて見ると重いので、間引いて見る。傾向をつかむには十分。
    for (let y = 1; y < h - 1; y += 3) {
        for (let x = 1; x < w - 1; x += 3) {
            const i = (y * w + x) * 4;
            const 右 = (y * w + x + 1) * 4;
            const 下 = ((y + 1) * w + x) * 4;
            差の合計 += Math.abs(画素[i] - 画素[右]) + Math.abs(画素[i] - 画素[下]);
            数 += 2;
        }
    }

    const 平均 = 数 ? 差の合計 / 数 : 0;
    return {
        値: Math.round(平均 * 10) / 10,
        見立て: 平均 < 4
            ? 'ぼけているか、のっぺりした被写体です（どちらかまでは分かりません）'
            : 平均 < 12
                ? 'ふつうです'
                : '輪郭がはっきりしています',
    };
}

/** 色に、日本語の呼び名を付ける */
function 色の呼び名(r, g, b) {
    const 最大 = Math.max(r, g, b);
    const 最小 = Math.min(r, g, b);
    const 差 = 最大 - 最小;

    if (差 < 30) {
        if (最大 < 60) return '黒';
        if (最大 < 120) return '濃いグレー';
        if (最大 < 190) return 'グレー';
        return '白';
    }

    if (r === 最大) return g > b ? (g > 150 ? '黄' : 'オレンジ') : (b > 120 ? '紫' : '赤');
    if (g === 最大) return b > r ? '青緑' : '緑';
    return r > g ? '紫' : '青';
}

/* ---------- 撮る ---------- */

function 撮る() {
    const 映像 = document.getElementById('camera-view');
    const canvas = document.getElementById('camera-canvas');
    if (!映像 || !canvas || !カメラの流れ) {
        showNotification('先にカメラを入れてください', 'error');
        return;
    }

    canvas.width = 映像.videoWidth;
    canvas.height = 映像.videoHeight;
    canvas.getContext('2d').drawImage(映像, 0, 0);

    結果を出す(画像を調べる(canvas), canvas);
}

/** 手元の画像ファイルを調べる */
function 画像を読み込む(file) {
    if (!file) return;
    const canvas = document.getElementById('camera-canvas');
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
        // 大きすぎる画像は縮めてから調べる。端末に負荷をかけないため。
        const 上限 = 1200;
        const 倍率 = Math.min(1, 上限 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * 倍率);
        canvas.height = Math.round(img.height * 倍率);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        結果を出す(画像を調べる(canvas), canvas);
        URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
}

function 結果を出す(調べ, canvas) {
    const 箱 = document.getElementById('camera-result');
    if (!箱) return;

    箱.innerHTML = '';
    canvas.classList.add('shown');

    const 表 = document.createElement('div');
    表.className = 'cam-facts';

    const 行 = (名, 値) => {
        const d = document.createElement('div');
        d.className = 'cam-row';
        d.innerHTML = '<span class="cam-name"></span><span class="cam-val"></span>';
        d.querySelector('.cam-name').textContent = 名;
        d.querySelector('.cam-val').textContent = 値;
        表.appendChild(d);
    };

    行('大きさ', 調べ.大きさ + ' 画素');
    行('縦横比', 調べ.縦横比);
    行('明るさ', `${調べ.明るさ} / 255` +
        (調べ.明るさ < 60 ? '（暗めです）' : 調べ.明るさ > 200 ? '（明るすぎます）' : ''));
    行('明暗の差', String(調べ.明暗の差) +
        (調べ.明暗の差 < 25 ? '（のっぺりしています）' : ''));
    行('輪郭', 調べ.ぼけ具合.見立て);

    箱.appendChild(表);

    const 色見出し = document.createElement('div');
    色見出し.className = 'cam-subhead';
    色見出し.textContent = '主な色';
    箱.appendChild(色見出し);

    const 色帯 = document.createElement('div');
    色帯.className = 'cam-colors';
    調べ.主な色.forEach((c) => {
        const s = document.createElement('span');
        s.className = 'cam-chip';
        s.style.background = c.色;
        s.title = `${c.名前} ${c.割合}%`;
        const 名 = document.createElement('em');
        名.textContent = `${c.名前} ${c.割合}%`;
        s.appendChild(名);
        色帯.appendChild(s);
    });
    箱.appendChild(色帯);

    const 断り = document.createElement('p');
    断り.className = 'hint';
    断り.textContent =
        '※ ここに出るのは、画素を数えれば分かることだけです。'
        + '「何が写っているか」は言い当てられません。'
        + 'それには写真を大量に学習したモデルが要り、このツールは外部モデルを使わない方針のためです。';
    箱.appendChild(断り);
}

/** 撮った画像を保存する（この端末の中だけ） */
function 画像を保存する() {
    const canvas = document.getElementById('camera-canvas');
    if (!canvas || !canvas.width) {
        showNotification('先に撮ってください', 'error');
        return;
    }
    canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `AReGLM_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
}

function initCamera() {
    document.getElementById('camera-start')?.addEventListener('click', カメラを入れる);
    document.getElementById('camera-stop')?.addEventListener('click', カメラを切る);
    document.getElementById('camera-shot')?.addEventListener('click', 撮る);
    document.getElementById('camera-save')?.addEventListener('click', 画像を保存する);
    document.getElementById('camera-file')?.addEventListener('change', (e) => {
        画像を読み込む(e.target.files?.[0]);
    });

    // 画面を離れるときは、必ずカメラを切る。
    // 入れっぱなしになるのを防ぐため。
    window.addEventListener('pagehide', カメラを切る);
}

window.initCamera = initCamera;
window.カメラを切る = カメラを切る;
window.カメラが入っているか = カメラが入っているか;
window.画像を調べる = 画像を調べる;
