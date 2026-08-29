/**
 * 自作の待ち受け（名前で呼ぶと反応する）
 *
 * なぜこれを作ったのか:
 *   これまでの「名前で呼ぶ」は、ブラウザの音声認識を使っていた。
 *   便利だが、Chromeのそれは音声をGoogleへ送って文字にしている。
 *
 *   このツールは「外部へ一切送らない」を土台にしている。
 *   その土台に、外へ送る仕組みが一つだけ残っていた。
 *   名前を呼ぶだけの、たった一語のために。
 *
 *   一語なら、自作で足りる。だから作り直した。
 *
 * やり方:
 *   マイクの音を、直近2秒だけ持ち回る（それ以前は捨てる）。
 *   0.4秒ごとに、その2秒の中に「覚えた呼び名」が居ないかを探す。
 *   居たら、そこから先を指示として聞き取る。
 *
 *   音は端末の中だけを流れ、どこにも保存しない。
 *   持ち回るのは直近2秒だけで、それも次の音で上書きされる。
 *
 * 正直に書いておく:
 *   呼び名は、先に教えてもらう必要がある。
 *   教わっていない声は聞き分けられない。
 *   教えていないのに反応したふりはしない。
 */

/** 直近どれだけ持ち回るか（秒）。長くすると重く、短いと呼び名が切れる。 */
const 持ち回る秒 = 2.0;

/** 何秒ごとに探すか。短くすると反応は速いが、その分ずっと計算し続ける。 */
const 探す間隔 = 400;

/** 指示を聞き取る最長（秒）。これを超えたら区切る。 */
const 指示の最長 = 6.0;

/** これだけ静かになったら、言い終わったとみなす（秒） */
const 言い終わりの静けさ = 0.9;

let 待ち受け中 = false;
let 音の入口 = null;      // MediaStream
let 音の場 = null;        // AudioContext
let 処理 = null;          // ScriptProcessorNode
let 環 = null;            // 直近を持ち回す輪
let 環の位置 = 0;
let 周波数 = 16000;
let 探すタイマー = null;

/** 呼びかけの後、指示を集めている最中か */
let 指示を集めている = false;
let 集めた = null;
let 集めた長さ = 0;
let 静かな長さ = 0;

/** 呼び名を聞き取ったとき、指示を聞き取ったときに呼ばれる */
let 呼ばれたら = null;
let 指示が揃ったら = null;

function 呼び名を読む() {
    return (localStorage.getItem('areglm_wake_name') || 'アレラム').trim();
}

/**
 * 呼び名を覚えているか。
 *
 * 覚えていないなら、待ち受けても永久に反応しない。
 * 「動いています」と表示だけして反応しないのが、いちばん困る。
 * だから始める前に確かめて、教えてくださいと言う。
 */
function 呼び名を覚えているか() {
    const 学 = window.AReGLM_VOICE_LEARN;
    if (!学) return false;
    const 名 = 呼び名を読む();
    return 学.覚えた言葉たち().some((x) => x.言葉 === 名);
}

/** 直近2秒を、時間の順に並べ直して取り出す */
function 直近を取り出す() {
    const 出 = new Float32Array(環.length);
    出.set(環.subarray(環の位置), 0);
    出.set(環.subarray(0, 環の位置), 環.length - 環の位置);
    return 出;
}

function 環を空にする() {
    環.fill(0);
    環の位置 = 0;
}

/** 音の大きさ（この値で、話しているかどうかを見る） */
function 大きさ(波形) {
    let 和 = 0;
    for (let i = 0; i < 波形.length; i++) 和 += 波形[i] * 波形[i];
    return Math.sqrt(和 / Math.max(1, 波形.length));
}

/**
 * 呼び名が居るかを探す。
 *
 * 覚えている全部と比べるのではなく、呼び名だけと比べる。
 * 全部と比べると、他の言葉が呼び名より近くなったときに
 * 呼んでいないのに動き出してしまう。
 */
function 呼び名を探す() {
    const 芯 = window.AReGLM_VOICE_CORE;
    const 学 = window.AReGLM_VOICE_LEARN;
    if (!芯 || !学) return null;

    const 名 = 呼び名を読む();
    const 型たち = 学.覚えた声を読む().filter((x) => x.言葉 === 名);
    if (!型たち.length) return null;

    const 波形 = 直近を取り出す();
    if (大きさ(波形) < 0.01) return null;   // 静かなときは計算しない

    const 声 = 芯.声の部分を切り出す(波形);
    if (!声) return null;

    const 特徴 = 芯.MFCCにする(声, 周波数);
    if (特徴.length < 4) return null;

    let 最小 = Infinity;
    型たち.forEach((t) => {
        const 型 = t.特徴.map((a) => Float32Array.from(a));
        const r = 芯.中から探す(特徴, 型);
        if (r.ずれ < 最小) 最小 = r.ずれ;
    });

    // 呼び名は少し厳しめにする。
    // 呼んでいないのに動き出す方が、呼んでも動かないより困るため。
    return 最小 <= 26 ? { ずれ: Math.round(最小 * 10) / 10 } : null;
}

/** 一定ごとに呼び名を探す */
function 見張り() {
    if (!待ち受け中 || 指示を集めている) return;

    const 見つけた = 呼び名を探す();
    if (!見つけた) return;

    環を空にする();          // 呼び名の音を、指示に混ぜないため
    指示を集めている = true;
    集めた = new Float32Array(Math.ceil(周波数 * 指示の最長));
    集めた長さ = 0;
    静かな長さ = 0;

    if (typeof 呼ばれたら === 'function') 呼ばれたら(見つけた);
}

/** 呼びかけの後の指示を、言い終わるまで集める */
function 指示を溜める(入ってきた) {
    const 残り = 集めた.length - 集めた長さ;
    const 入れる = Math.min(残り, 入ってきた.length);
    集めた.set(入ってきた.subarray(0, 入れる), 集めた長さ);
    集めた長さ += 入れる;

    // 言い終わりを見る。
    // 何も言われないまま最長まで待つと、待たされている感じになる。
    if (大きさ(入ってきた) < 0.012) {
        静かな長さ += 入ってきた.length / 周波数;
    } else {
        静かな長さ = 0;
    }

    const 言い終わった = 静かな長さ >= 言い終わりの静けさ && 集めた長さ > 周波数 * 0.4;
    const 一杯 = 集めた長さ >= 集めた.length;

    if (言い終わった || 一杯) {
        const 波形 = 集めた.slice(0, 集めた長さ);
        指示を集めている = false;
        集めた = null;
        環を空にする();
        if (typeof 指示が揃ったら === 'function') 指示が揃ったら(波形, 周波数);
    }
}

/**
 * 待ち受けを始める。
 *
 * @param {{呼ばれたら:Function, 指示が揃ったら:Function}} 手当て
 */
async function 自作の待ち受けを始める(手当て = {}) {
    if (待ち受け中) return { ok: true, 訳: 'すでに待ち受けています' };

    if (!window.AReGLM_VOICE_CORE || !window.AReGLM_VOICE_LEARN) {
        return { ok: false, 訳: '聞き取りの土台が読み込まれていません' };
    }
    if (!呼び名を覚えているか()) {
        return {
            ok: false,
            訳: `「${呼び名を読む()}」をまだ覚えていません。`
                + '先に「言葉を教える」で、その呼び名を2回ほど録ってください。'
                + '覚えていない声には反応できません。',
        };
    }

    呼ばれたら = 手当て.呼ばれたら;
    指示が揃ったら = 手当て.指示が揃ったら;

    try {
        音の入口 = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                // 声の特徴をそのまま残したいので、加工は切る。
                // 加工が入ると、覚えたときと音が変わって当たらなくなる。
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });
    } catch (e) {
        return { ok: false, 訳: 'マイクを使えませんでした（' + (e.name || e.message) + '）' };
    }

    音の場 = new (window.AudioContext || window.webkitAudioContext)();
    周波数 = 音の場.sampleRate;
    環 = new Float32Array(Math.ceil(周波数 * 持ち回る秒));
    環の位置 = 0;

    const 元 = 音の場.createMediaStreamSource(音の入口);
    処理 = 音の場.createScriptProcessor(4096, 1, 1);

    処理.onaudioprocess = (e) => {
        const 入ってきた = e.inputBuffer.getChannelData(0);

        if (指示を集めている) {
            指示を溜める(入ってきた);
            return;
        }

        // 直近だけを持ち回す。古い音は上書きして消える。
        for (let i = 0; i < 入ってきた.length; i++) {
            環[環の位置] = 入ってきた[i];
            環の位置 = (環の位置 + 1) % 環.length;
        }
    };

    元.connect(処理);
    処理.connect(音の場.destination);

    待ち受け中 = true;
    探すタイマー = setInterval(見張り, 探す間隔);

    return { ok: true, 訳: `「${呼び名を読む()}」と呼ばれるのを待っています（音は外へ出ません）` };
}

function 自作の待ち受けを止める() {
    待ち受け中 = false;
    指示を集めている = false;
    集めた = null;

    clearInterval(探すタイマー);
    探すタイマー = null;

    if (処理) { 処理.onaudioprocess = null; 処理.disconnect(); 処理 = null; }
    if (音の場) { 音の場.close().catch(() => {}); 音の場 = null; }
    if (音の入口) { 音の入口.getTracks().forEach((t) => t.stop()); 音の入口 = null; }
    環 = null;
}

function 自作で待ち受け中か() {
    return 待ち受け中;
}

window.AReGLM_VOICE_WAKE = {
    自作の待ち受けを始める,
    自作の待ち受けを止める,
    自作で待ち受け中か,
    呼び名を覚えているか,
    呼び名を読む,
};
