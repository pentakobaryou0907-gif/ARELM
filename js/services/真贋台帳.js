/**
 * 真贋台帳 ― 「これはうちで作ったものか」を後から確かめられるようにする
 *
 * なぜこれが要るのか:
 *
 *   要望の中に、両立しない二つが並んでいた。
 *     ・成果物に電子透かしを一切入れたくない
 *     ・誰かに真似されたとき、すぐ分かるようにしたい
 *
 *   透かしを埋め込めば前者が壊れる。何も残さなければ後者ができない。
 *
 *   そこで<b>画像そのものには一切手を加えず</b>、
 *   作ったときに「指紋」だけをこの端末に控えておく。
 *   画像は無改変のまま出ていき、手元には照合する手段が残る。
 *
 * 二種類の指紋を取る:
 *
 *   ・<b>そのままの指紋（SHA-256）</b>
 *     1バイトでも違えば別物になる。一致すれば、まず間違いなく同一ファイル。
 *
 *   ・<b>見た目の指紋（dHash）</b>
 *     縮小して明暗の並びだけを見る。保存し直し・圧縮・拡大縮小をされても
 *     だいたい残る。「作り直された複製」を見つけるのはこちら。
 *
 *   前者だけだと、スクショを取り直されただけで見失う。
 *   後者だけだと、たまたま似た画像を誤って身内と判定する。
 *   二つ揃えて、初めて使いものになる。
 *
 * 正直に書いておく:
 *   これは「世に出回っている画像を探しに行く」仕組みではない。
 *   <b>手元に持ってきた画像を照合する</b>ための台帳。
 *   外へ探しに行くことはしないし、外へ台帳を送ることもしない。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const 真贋台帳の鍵 = 'areglm_shinngan_daichou';

/** 見た目の指紋を作るときの大きさ。9×8で64ビットになる。 */
const 見た目の幅 = 9;
const 見た目の高さ = 8;

/* ==========================================================
   指紋を取る
   ========================================================== */

/**
 * 場所を data: の形にそろえる。
 *
 * ComfyUIで作った絵は /api/image/view?... という短い場所で返ってくる。
 * 指紋を取るには中身そのものが要るので、この端末の中から読み直す。
 * 外部の場所は読みに行かない（外へ出ないため）。
 */
async function 中身にそろえる(場所) {
    const s = String(場所 || '');
    if (s.startsWith('data:')) return s;
    if (!s.startsWith('/')) return null;   // 同じ端末の中のものだけ

    try {
        const blob = await fetch(s).then((r) => (r.ok ? r.blob() : null));
        if (!blob) return null;
        return await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

/** そのままの指紋。1バイトでも違えば変わる。 */
async function そのままの指紋(dataUrl) {
    const 中身 = String(dataUrl || '');
    const カンマ = 中身.indexOf(',');
    if (!中身.startsWith('data:') || カンマ < 0) return null;

    // base64 の部分だけを、生のバイトに戻して digest にかける。
    // 文字列のまま digest すると、同じ絵でも
    // data: の前置きが違うだけで別物になってしまう。
    let 生;
    try {
        const b64 = atob(中身.slice(カンマ + 1));
        生 = new Uint8Array(b64.length);
        for (let i = 0; i < b64.length; i++) 生[i] = b64.charCodeAt(i);
    } catch {
        return null;
    }

    const digest = await crypto.subtle.digest('SHA-256', 生);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 見た目の指紋（dHash）。
 *
 * 小さな白黒に潰し、<b>隣の明るさとの大小</b>だけを並べる。
 * 明るさそのものではなく大小を見るので、
 * 全体が明るくなったり、圧縮で少し荒れても、並びは残る。
 */
function 見た目の指紋(絵) {
    const c = document.createElement('canvas');
    c.width = 見た目の幅;
    c.height = 見た目の高さ;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(絵, 0, 0, 見た目の幅, 見た目の高さ);

    const 点 = g.getImageData(0, 0, 見た目の幅, 見た目の高さ).data;
    const 明るさ = [];
    for (let i = 0; i < 点.length; i += 4) {
        // 人の目の感じ方に合わせた重みで白黒にする
        明るさ.push(0.299 * 点[i] + 0.587 * 点[i + 1] + 0.114 * 点[i + 2]);
    }

    let ビット = '';
    for (let y = 0; y < 見た目の高さ; y++) {
        for (let x = 0; x < 見た目の幅 - 1; x++) {
            const 左 = 明るさ[y * 見た目の幅 + x];
            const 右 = 明るさ[y * 見た目の幅 + x + 1];
            ビット += 左 > 右 ? '1' : '0';
        }
    }
    return ビット;   // 64文字
}

/** dataUrl から絵を読み込む */
function 絵を読む(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('画像を読めませんでした'));
        img.src = dataUrl;
    });
}

/** 二つの見た目の指紋が、どれだけ違うか（違うビットの数） */
function 指紋の隔たり(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let 数 = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) 数++;
    return 数;
}

/* ==========================================================
   台帳の読み書き
   ========================================================== */

function 台帳を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(真贋台帳の鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 台帳を保存(一覧) {
    try {
        localStorage.setItem(真贋台帳の鍵, JSON.stringify(一覧));
        return true;
    } catch (e) {
        console.error('真贋台帳を保存できませんでした:', e);
        return false;
    }
}

/**
 * 作ったものを控える。
 *
 * <b>画像そのものは保存しない。</b>指紋と、いつ何として作ったかだけ。
 * 画像を持てば容量を食うし、そもそも控えるのは照合のためで、
 * 見返すためではない。
 */
async function 作ったものを控える(場所, メタ = {}) {
    try {
        const dataUrl = await 中身にそろえる(場所);
        if (!dataUrl) return null;

        const そのまま = await そのままの指紋(dataUrl);
        if (!そのまま) return null;

        const 絵 = await 絵を読む(dataUrl);
        const 見た目 = 見た目の指紋(絵);

        const 台帳 = 台帳を読む();

        // 同じものを二度控えない。作り直すたびに増えても意味がない。
        if (台帳.some((x) => x.そのまま === そのまま)) return null;

        台帳.push({
            そのまま,
            見た目,
            種類: メタ.種類 || '画像',
            名前: メタ.名前 || '',
            作った言葉: (メタ.作った言葉 || '').slice(0, 200),
            大きさ: `${絵.naturalWidth}×${絵.naturalHeight}`,
            控えた日: new Date().toISOString(),
        });

        // 増え続けると保存できなくなる。古いものから落とす。
        台帳を保存(台帳.slice(-2000));
        return そのまま;
    } catch (e) {
        // 控えられなくても、作ること自体は止めない。
        console.warn('真贋台帳に控えられませんでした:', e);
        return null;
    }
}

/**
 * 持ってきた画像が、うちで作ったものかを調べる。
 *
 * @returns {{判定:string, 訳:string, 元?:object, 隔たり?:number}}
 */
async function これはうちのものか(場所) {
    const 台帳 = 台帳を読む();
    if (!台帳.length) {
        return { 判定: '不明', 訳: 'まだ台帳に何も控えていません。先に何か作ると、そこから記録が始まります。' };
    }

    const dataUrl = await 中身にそろえる(場所);
    const そのまま = dataUrl ? await そのままの指紋(dataUrl) : null;
    if (!そのまま) {
        return { 判定: '不明', 訳: '画像として読めませんでした。' };
    }

    // まず、そのままの指紋で。一致すれば、それ以上調べる必要はない。
    const 完全一致 = 台帳.find((x) => x.そのまま === そのまま);
    if (完全一致) {
        return {
            判定: '同一',
            訳: `${new Date(完全一致.控えた日).toLocaleString('ja-JP')} に、このツールで作ったものと完全に同じファイルです。`,
            元: 完全一致,
            隔たり: 0,
        };
    }

    // 次に、見た目の指紋で。作り直された複製はここで出る。
    let 見た目;
    try {
        見た目 = 見た目の指紋(await 絵を読む(dataUrl));
    } catch {
        return { 判定: '不明', 訳: '画像として読めませんでした。' };
    }

    let 一番近い = null;
    let 最小の隔たり = Infinity;
    台帳.forEach((x) => {
        const d = 指紋の隔たり(見た目, x.見た目);
        if (d < 最小の隔たり) { 最小の隔たり = d; 一番近い = x; }
    });

    // 64ビット中いくつ違うか。
    //   5以下 … 保存し直し・圧縮くらいの違い。まず同じ絵。
    //   10以下 … 手を加えられている可能性。目で見て確かめる価値がある。
    //   それ以上 … 別の絵と考えてよい。
    if (最小の隔たり <= 5) {
        return {
            判定: 'ほぼ同じ',
            訳: `ファイルは違いますが、見た目はこのツールで作ったものとほぼ同じです`
                + `（64か所中${最小の隔たり}か所だけ違う）。`
                + `保存し直された、または圧縮された複製と考えられます。`,
            元: 一番近い,
            隔たり: 最小の隔たり,
        };
    }
    if (最小の隔たり <= 10) {
        return {
            判定: '似ている',
            訳: `このツールで作ったものと似ています（64か所中${最小の隔たり}か所が違う）。`
                + `手を加えられた複製かもしれません。目で見て確かめてください。`,
            元: 一番近い,
            隔たり: 最小の隔たり,
        };
    }
    return {
        判定: '別のもの',
        訳: `台帳の中に、これと近いものはありませんでした`
            + `（いちばん近いもので64か所中${最小の隔たり}か所が違う）。`
            + `このツールで作ったものではない可能性が高いです。`,
        隔たり: 最小の隔たり,
    };
}

window.AReGLM_真贋 = {
    作ったものを控える,
    これはうちのものか,
    台帳を読む,
    そのままの指紋,
};
