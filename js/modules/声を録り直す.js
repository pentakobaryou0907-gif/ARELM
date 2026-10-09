/**
 * 声を録り直す ― 一本道で、確実に
 *
 * なぜこれが要るのか:
 *
 *   いま覚えている2件は、74〜90%が無音だった。
 *   録音の前後に、話し始める前と話し終わった後が入っていたため。
 *
 *   切り出しで補ってはいるが、
 *   <b>短く録り直せば、土台から良くなる</b>。
 *
 *   録り方が悪いと、あとで何をしても限界がある。
 *
 * 気をつけていること:
 *
 *   ・<b>録る前に「いま」と言う。</b>
 *     押した瞬間に録り始めると、身構える前の間が入る。
 *
 *   ・<b>短く録る。</b>1.5秒あれば呼び名には足りる。
 *     長いほど無音が増える。
 *
 *   ・<b>録れた中身をその場で見せる。</b>
 *     声が入っていたか、静かすぎなかったかを、
 *     覚えさせる前に分かるようにする。
 *
 *   ・<b>3回録る。</b>
 *     一度きりだと、たまたま変な言い方でも気づけない。
 */

/** 一回の録音の長さ（秒）。呼び名にはこれで足りる。 */
// 一回の録音の長さ（秒）。
//
// 「ねぇ」＋呼び名で、だいたい1.2〜1.6秒ほど。
// 前後の間を少し見て、2秒にしてある。
const 録る長さ = 2.0;

/** 何回録るか */
const 録る回数 = 3;

let 録れたもの = [];

async function マイクを借りる() {
    try {
        return await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
    } catch (e) {
        return null;
    }
}

/**
 * 一回録る。
 *
 * 「いま」と言ってから録り始める。
 * 押した瞬間だと、身構える前の間が入る。
 */
async function 一回録る(合図を出す) {
    const 流れ = await マイクを借りる();
    if (!流れ) return { ok: false, 訳: 'マイクを使えませんでした' };

    const 音場 = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const 入口 = 音場.createMediaStreamSource(流れ);
    const 拾う = 音場.createScriptProcessor(4096, 1, 1);

    const 集めた = [];
    拾う.onaudioprocess = (e) => {
        集めた.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    入口.connect(拾う);
    拾う.connect(音場.destination);

    // 少し待ってから合図する。押した直後は、まだ構えていない。
    await new Promise((r) => setTimeout(r, 400));
    合図を出す('どうぞ');

    await new Promise((r) => setTimeout(r, 録る長さ * 1000));

    拾う.disconnect();
    入口.disconnect();
    流れ.getTracks().forEach((t) => t.stop());
    await 音場.close();

    // つなげる
    const 全部 = 集めた.reduce((a, b) => a + b.length, 0);
    const 波形 = new Float32Array(全部);
    let 位置 = 0;
    集めた.forEach((x) => { 波形.set(x, 位置); 位置 += x.length; });

    return 中身を見る(波形);
}

/**
 * 録れた中身を見る。
 *
 * 覚えさせる前に、声が入っていたかを確かめる。
 * 入っていないものを覚えても、あとで困るだけ。
 */
function 中身を見る(波形) {
    let 最大 = 0;
    let 和 = 0;
    for (let i = 0; i < 波形.length; i++) {
        const v = Math.abs(波形[i]);
        if (v > 最大) 最大 = v;
        和 += v;
    }
    const 平均 = 和 / Math.max(1, 波形.length);

    if (最大 < 0.02) {
        return { ok: false, 訳: '声が入っていません。もう少し近くで、はっきり言ってみてください。', 波形 };
    }
    if (最大 > 0.98) {
        return { ok: false, 訳: '大きすぎて割れています。少し離れてみてください。', 波形 };
    }

    // 声の部分だけを取り出して、長さを見る
    const 芯 = window.AReGLM_VOICE_CORE;
    const 声 = 芯 && 芯.声の部分を切り出す ? 芯.声の部分を切り出す(波形) : 波形;
    if (!声 || 声.length < 16000 * 0.2) {
        return { ok: false, 訳: '短すぎます。もう一度、少しゆっくり言ってみてください。', 波形 };
    }

    const 秒 = (声.length / 16000).toFixed(1);
    return {
        ok: true,
        訳: `よく録れました（声の部分 ${秒}秒／大きさ ${(平均 * 100).toFixed(1)}）`,
        波形,
        声,
    };
}

async function render声を録り直す() {
    const 箱 = document.getElementById('voice-rerecord');
    if (!箱) return;

    箱.innerHTML = '';

    const 呼び名 = (typeof 呼び名を読む === 'function') ? 呼び名を読む() : 'アレラム';

    // 呼びかけの言い方。
    //
    // <b>「ねぇ」を付けるほうが確かです。</b>
    //
    // 呼び名だけだと、ふつうの会話の中の音とも似てしまい、
    // 話していないのに反応することがある。
    // 「ねぇ」を付ければ、その並びが偶然出ることはまず無い。
    //
    // ヘイSiri が「Siri」だけでないのも、同じ理由です。
    const 言い方 = 'ねぇ' + 呼び名;

    const 案内 = document.createElement('p');
    案内.className = 'hint';
    案内.textContent = `「${言い方}」と${録る回数}回 録ります。`
        + '「どうぞ」と出てから、ふだんの調子で言ってください。'
        + `一回 ${録る長さ}秒 です。`;
    箱.appendChild(案内);

    const 状態 = document.createElement('p');
    状態.className = 'rerecord-state';
    状態.textContent = '準備できています';
    箱.appendChild(状態);

    const 一覧 = document.createElement('div');
    一覧.className = 'rerecord-list';
    箱.appendChild(一覧);

    const 並び = document.createElement('div');
    並び.className = 'guard-row';

    const 始める = document.createElement('button');
    始める.type = 'button';
    始める.className = 'btn btn-primary btn-lg';
    始める.textContent = `🎤 「${言い方}」を録る`;
    始める.addEventListener('click', () => 録り始める(始める, 状態, 一覧, 言い方));
    並び.appendChild(始める);
    箱.appendChild(並び);

    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>「ねぇ」を付けるほうが、確かに届きます。</b>'
        + '呼び名だけだと、ふつうの会話の中の音とも似てしまい、'
        + '話していないのに反応することがあります。'
        + '「ねぇ」を付ければ、その並びが偶然出ることはまず無いためです。<br>'
        + '<b>いま覚えている声は、7〜9割が無音です。</b>'
        + '録音の前後に、話し始める前と話し終わった後が入っているためです。<br>'
        + 'そのせいで<b>聞き取れず</b>、しかも<b>静かなときに反応して</b>いました。'
        + '無音同士が「似ている」と判断されるからです。<br>'
        + '<b>短く録り直せば、土台から良くなります。</b>'
        + '録った音はこの端末の中だけで扱い、どこへも送りません。';
    箱.appendChild(断り);
}

async function 録り始める(ボタン, 状態, 一覧, 言い方) {
    ボタン.disabled = true;
    録れたもの = [];
    一覧.innerHTML = '';

    for (let 回 = 1; 回 <= 録る回数; 回++) {
        状態.textContent = `${回}回目 — 構えてください…`;
        状態.className = 'rerecord-state';

        const r = await 一回録る((合図) => {
            状態.textContent = `${回}回目 — ${合図}`;
            状態.className = 'rerecord-state doing';
        });

        const 行 = document.createElement('div');
        行.className = 'rerecord-row ' + (r.ok ? 'good' : 'bad');
        行.textContent = `${回}回目: ${r.ok ? '✓' : '✗'} ${r.訳}`;
        一覧.appendChild(行);

        if (r.ok) 録れたもの.push(r);

        if (回 < 録る回数) {
            状態.textContent = '少し待ってください…';
            状態.className = 'rerecord-state';
            await new Promise((res) => setTimeout(res, 1200));
        }
    }

    状態.textContent = `${録れたもの.length} / ${録る回数} 回 うまく録れました`;
    状態.className = 録れたもの.length >= 2 ? 'rerecord-state ok' : 'rerecord-state bad';

    if (録れたもの.length < 2) {
        const 注 = document.createElement('p');
        注.className = 'guard-off';
        注.textContent = '2回以上うまく録れないと、聞き分けられません。もう一度お試しください。';
        一覧.appendChild(注);
        ボタン.disabled = false;
        return;
    }

    // 覚えさせる
    状態.textContent = '覚えさせています…';
    let 覚えた = 0;
    for (const r of 録れたもの) {
        try {
            if (typeof 声を覚える === 'function') {
                await 声を覚える(言い方, r.波形, 16000);
                覚えた += 1;
            }
        } catch (e) {
            console.warn('覚えさせられませんでした:', e.message);
        }
    }

    状態.textContent = `${覚えた}通りの言い方で覚えました`;
    状態.className = 'rerecord-state ok';
    showNotification(`「${言い方}」を ${覚えた}通り 覚えました`, 'success');

    // 待ち受けにも入れ直す
    try {
        const 返 = await fetch('/api/voice-listener', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 使う: true }),
        });
        const j = await 返.json().catch(() => ({}));
        // 待ち受けの入れ直しは、Mac本体の画面からだけ（ほかの端末では断られる）。前は断られても「入れ直しました」と出ていた
        const 注 = document.createElement('p');
        注.className = 返.ok && j.ok !== false ? 'guard-on' : 'hint';
        注.textContent = 返.ok && j.ok !== false
            ? '待ち受けにも入れ直しました。呼びかけてみてください。'
            : `待ち受けの入れ直しはできませんでした（${j.訳 || 'Mac本体の画面からだけできます'}）。覚えた声は、次に待ち受けを起こしたときに使われます。`;
        一覧.appendChild(注);
    } catch {
        // 入れ直せなくても、覚えたことは残っている。
        // 次に待ち受けを起こしたときに使われる。
    }

    ボタン.disabled = false;
    if (typeof render育ち具合 === 'function') render育ち具合();
    if (typeof render声の診断 === 'function') render声の診断();
}

function init声を録り直す() {
    if (document.getElementById('voice-rerecord')) render声を録り直す();
}

window.init声を録り直す = init声を録り直す;
window.render声を録り直す = render声を録り直す;
