/**
 * 自作の音声認識の画面
 *
 * 「押して話す」「言葉を教える」「覚えた言葉を見る」をここでまとめる。
 *
 * 聞き取れなかったときは、素直に聞き返して教えてもらう。
 * 黙って諦めると、いつまでも覚えられない。
 *
 * 音声はこの端末の中だけで扱い、外部へは一切送らない。
 * 覚えるのは音の特徴だけで、音声そのものは残さない。
 */

let 録音の流れ = null;
let 録音の場 = null;
let 集めた波形 = [];
let 録音中の周波数 = 16000;

/** いま何をしているか（'聞き取る' か '教える'） */
let 録音の目的 = '聞き取る';
let 教える言葉 = '';

/**
 * 録音を始める。
 *
 * 生の波形をそのまま受け取る。
 * 圧縮された形だと、音の特徴が変わってしまうため。
 */
async function 自作の録音を始める(目的, 言葉) {
    if (!window.isSecureContext) {
        showNotification('この接続ではマイクを使えません（127.0.0.1 か https:// が必要です）', 'error');
        return false;
    }

    録音の目的 = 目的 || '聞き取る';
    教える言葉 = 言葉 || '';

    try {
        録音の流れ = await navigator.mediaDevices.getUserMedia({
            audio: {
                // 話し声には16kHzで足りる。高いほど重くなるだけ。
                sampleRate: 16000,
                channelCount: 1,
                // 声の特徴を残したいので、音を加工する機能は切る
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });

        録音の場 = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        録音中の周波数 = 録音の場.sampleRate;

        const 元 = 録音の場.createMediaStreamSource(録音の流れ);
        const 処理 = 録音の場.createScriptProcessor(4096, 1, 1);

        集めた波形 = [];
        処理.onaudioprocess = (e) => {
            集めた波形.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };

        元.connect(処理);
        処理.connect(録音の場.destination);
        録音の場._処理 = 処理;
        録音の場._元 = 元;

        document.body.classList.add('wake-listening');
        renderVoiceUI();
        return true;
    } catch (e) {
        showNotification(
            e.name === 'NotAllowedError' ? 'マイクが許可されていません' : 'マイクを使えませんでした: ' + e.message,
            'error'
        );
        return false;
    }
}

/** 録音を止めて、集めた波形を返す */
function 自作の録音を止める() {
    if (!録音の場) return null;

    try {
        録音の場._処理.disconnect();
        録音の場._元.disconnect();
        録音の場.close();
    } catch { /* すでに閉じていれば気にしない */ }

    録音の流れ?.getTracks().forEach((t) => t.stop());
    録音の流れ = null;
    録音の場 = null;
    document.body.classList.remove('wake-listening');

    // 集めた断片をひと続きにする
    const 全長 = 集めた波形.reduce((n, a) => n + a.length, 0);
    const 波形 = new Float32Array(全長);
    let 位置 = 0;
    集めた波形.forEach((a) => { 波形.set(a, 位置); 位置 += a.length; });
    集めた波形 = [];

    renderVoiceUI();
    return 波形;
}

function 録音中か() {
    return 録音の場 !== null;
}

/* ---------- 押して話す ---------- */

async function 押して話す() {
    if (録音中か()) {
        const 波形 = 自作の録音を止める();
        if (!波形 || !波形.length) return;

        const r = window.AReGLM_VOICE_LEARN.声を聞き取る(波形, 録音中の周波数);
        聞き取りの結果を出す(r, 波形);
        return;
    }
    await 自作の録音を始める('聞き取る');
}

/**
 * 聞き取った結果を扱う。
 *
 * 分かったらそのまま実行。
 * 迷ったら確かめる。
 * 分からなかったら、素直に聞いて覚える。
 */
// camera.js にも「結果を出す」がある。
// 同じ名前にしていたため、後から読み込まれる camera.js に
// 黙って上書きされ、聞き取りの結果が出せなくなっていた。
function 聞き取りの結果を出す(r, 波形) {
    const 箱 = document.getElementById('voice-result');

    if (r.結果 === 'わかった') {
        // 一度に複数言われることがある。
        // 「在庫を見せて、それから点検して」のように。
        const 並び = (r.言葉たち && r.言葉たち.length) ? r.言葉たち : [r.言葉];
        if (箱) {
            箱.className = 'voice-result ok';
            箱.textContent = 並び.length > 1
                ? `聞き取りました:「${並び.join('」「')}」（${並び.length}件として実行します）`
                : `聞き取りました:「${並び[0]}」`;
        }
        並びを実行する(並び);
        return;
    }

    if (r.結果 === 'たぶん') {
        if (箱) {
            箱.className = 'voice-result warn';
            箱.innerHTML = '';
            const 文 = document.createElement('div');
            文.textContent = `「${r.言葉}」でしょうか。（自信は高くありません）`;
            箱.appendChild(文);

            const はい = document.createElement('button');
            はい.type = 'button';
            はい.className = 'btn btn-sm btn-primary';
            はい.textContent = 'そうです';
            はい.addEventListener('click', () => {
                // 合っていたなら、この言い方も覚える。次から確かになる。
                window.AReGLM_VOICE_LEARN.声を覚える(r.言葉, 波形, 録音中の周波数);
                言葉を実行する(r.言葉);
                renderVoiceUI();
            });

            const ちがう = document.createElement('button');
            ちがう.type = 'button';
            ちがう.className = 'btn btn-sm btn-secondary';
            ちがう.textContent = 'ちがいます';
            ちがう.addEventListener('click', () => 聞き返す(波形));

            箱.appendChild(はい);
            箱.appendChild(ちがう);
        }
        return;
    }

    聞き返す(波形, r.訳);
}

/**
 * 分からなかったときに聞き返す。
 *
 * 教えてもらえば、次から通る。
 * ここで諦めると、いつまでも覚えられない。
 */
function 聞き返す(波形, 訳) {
    const 箱 = document.getElementById('voice-result');
    if (!箱) return;

    箱.className = 'voice-result ask';
    箱.innerHTML = '';

    const 文 = document.createElement('div');
    文.textContent = (訳 ? 訳 + '。' : '') + '何とおっしゃいましたか。教えていただければ、次から覚えます。';
    箱.appendChild(文);

    const 入力 = document.createElement('input');
    入力.type = 'text';
    入力.placeholder = '例: 今日の状況';
    入力.className = 'voice-teach-input';

    const 覚える = document.createElement('button');
    覚える.type = 'button';
    覚える.className = 'btn btn-sm btn-primary';
    覚える.textContent = '覚える';
    覚える.addEventListener('click', () => {
        const 言葉 = 入力.value.trim();
        if (!言葉) return;
        const r = window.AReGLM_VOICE_LEARN.声を覚える(言葉, 波形, 録音中の周波数);
        showNotification(r.訳, r.ok ? 'success' : 'error');
        if (r.ok) {
            箱.className = 'voice-result ok';
            箱.textContent = r.訳;
            言葉を実行する(言葉);
            renderVoiceUI();
        }
    });

    入力.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); 覚える.click(); }
    });

    箱.appendChild(入力);
    箱.appendChild(覚える);
    入力.focus();
}

/**
 * 聞き取った複数の言葉を、言われた順に流す。
 *
 * 一度に投げると、前の返事が出る前に次が始まって
 * どちらの返事か分からなくなる。だから一つずつ待つ。
 */
async function 並びを実行する(並び) {
    for (const 言葉 of 並び) {
        言葉を実行する(言葉);
        await new Promise((r) => setTimeout(r, 700));
    }
}

/** 聞き取った言葉を、そのまま指示として流す */
function 言葉を実行する(言葉) {
    if (typeof runConsoleCommand === 'function') {
        if (typeof 声で聞かれた !== 'undefined') 声で聞かれた = true;
        runConsoleCommand(言葉, 'mainai');
    }
}

/* ---------- 言葉を教える ---------- */

async function 言葉を教え始める() {
    const 入力 = document.getElementById('voice-teach-word');
    const 言葉 = (入力?.value || '').trim();
    if (!言葉) {
        showNotification('覚えさせたい言葉を入れてください', 'error');
        return;
    }

    if (録音中か()) {
        const 波形 = 自作の録音を止める();
        if (!波形) return;
        const r = window.AReGLM_VOICE_LEARN.声を覚える(教える言葉, 波形, 録音中の周波数);
        showNotification(r.訳, r.ok ? 'success' : 'error');
        renderVoiceUI();
        return;
    }

    await 自作の録音を始める('教える', 言葉);
}

/* ---------- 画面 ---------- */

function renderVoiceUI() {
    const 押す = document.getElementById('voice-push');
    if (押す) {
        押す.textContent = (録音中か() && 録音の目的 === '聞き取る') ? '🎙 話し終わったら押す' : '🎤 押して話す';
        押す.classList.toggle('recording', 録音中か() && 録音の目的 === '聞き取る');
    }

    const 教 = document.getElementById('voice-teach-btn');
    if (教) {
        教.textContent = (録音中か() && 録音の目的 === '教える') ? '🎙 言い終わったら押す' : '🎤 この言葉を録る';
        教.classList.toggle('recording', 録音中か() && 録音の目的 === '教える');
    }

    const 一覧 = document.getElementById('voice-words');
    if (一覧 && window.AReGLM_VOICE_LEARN) {
        const 言葉たち = window.AReGLM_VOICE_LEARN.覚えた言葉たち();
        一覧.innerHTML = '';

        if (!言葉たち.length) {
            一覧.innerHTML = '<li class="hint">まだ何も覚えていません。'
                + '下から言葉を教えるか、押して話して聞き返されたときに教えてください。</li>';
            return;
        }

        言葉たち.forEach((w) => {
            const li = document.createElement('li');
            li.className = 'voice-word' + (w.回数 >= 2 ? ' sure' : '');

            const 名 = document.createElement('span');
            名.textContent = w.言葉;

            const 数 = document.createElement('small');
            // 1回だけだと不確かなので、そのことを伝える
            数.textContent = w.回数 >= 2 ? `${w.回数}回` : '1回（もう一度録ると確かになります）';

            const 消 = document.createElement('button');
            消.type = 'button';
            消.className = 'btn-link danger';
            消.textContent = '忘れる';
            消.addEventListener('click', () => {
                window.AReGLM_VOICE_LEARN.声を忘れる(w.言葉);
                renderVoiceUI();
            });

            li.appendChild(名);
            li.appendChild(数);
            li.appendChild(消);
            一覧.appendChild(li);
        });
    }
}

function initVoiceUI() {
    document.getElementById('voice-push')?.addEventListener('click', 押して話す);
    document.getElementById('voice-teach-btn')?.addEventListener('click', 言葉を教え始める);

    // 画面を離れるときは、必ずマイクを切る
    window.addEventListener('pagehide', () => { if (録音中か()) 自作の録音を止める(); });

    renderVoiceUI();
}

window.initVoiceUI = initVoiceUI;
window.renderVoiceUI = renderVoiceUI;
window.録音中か = 録音中か;
