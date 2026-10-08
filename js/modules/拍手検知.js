/**
 * 拍手で起動・スリープ
 *
 * なぜこれで作るのか:
 *   音声をどこかへ送ったり、文字にしたりする必要は無い。
 *   「鋭く大きな音が、静かな状態から急に立ち上がったか」だけを見れば、
 *   拍手らしさは判定できる。ブラウザの中だけで完結する
 *   （Web Audio API の音量解析だけを使い、録音・保存・送信はしない）。
 *
 * 正直に書いておくこと:
 *   これは音の大きさ・立ち上がりの鋭さだけを見た、簡易な判定。
 *   物を置く音・咳・ドアの音などを誤って拾うことがある。
 *   確実な拍手認識ではなく、あくまで実験的な機能として提供する。
 */

let 拍手_音声文脈 = null;
let 拍手_解析器 = null;
let 拍手_流れ = null;
let 拍手_ループ札 = null;
let 拍手_直前の音量 = 0;
let 拍手_最後に鳴った時刻 = 0;

/** JARVISが開いているかどうかで、「起動」か「スリープ切替」かを決める */
function 拍手を受け取った() {
    const overlay = document.getElementById('jarvis-overlay');
    if (!overlay) return;

    if (overlay.hidden) {
        // 閉じている → 起動する（名前を呼ばれたときと同じ扱い）
        if (typeof switchPage === 'function') switchPage('mainai');
        if (typeof JARVISモードを開く === 'function') JARVISモードを開く();
        return;
    }

    // 開いている → スリープの切り替え
    overlay.classList.toggle('jarvis-sleeping');
    const 寝ているか = overlay.classList.contains('jarvis-sleeping');
    const status = document.getElementById('jarvis-mic-status');
    if (寝ているか) {
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        if (status) status.textContent = '● スリープ中（拍手で復帰）';
    } else if (status) {
        status.textContent = '● 待機中';
    }
}

function 拍手検知を止める() {
    if (拍手_ループ札) cancelAnimationFrame(拍手_ループ札);
    拍手_ループ札 = null;
    if (拍手_流れ) 拍手_流れ.getTracks().forEach((t) => t.stop());
    拍手_流れ = null;
    if (拍手_音声文脈) 拍手_音声文脈.close().catch(() => {});
    拍手_音声文脈 = null;
    拍手_解析器 = null;
}

async function 拍手検知を始める() {
    if (拍手_音声文脈) return; // 既に動いている

    try {
        拍手_流れ = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        showNotification('マイクを使えませんでした: ' + e.message, 'error');
        const box = document.getElementById('clap-detect-toggle');
        if (box) box.checked = false;
        return;
    }

    拍手_音声文脈 = new (window.AudioContext || window.webkitAudioContext)();
    const 元 = 拍手_音声文脈.createMediaStreamSource(拍手_流れ);
    拍手_解析器 = 拍手_音声文脈.createAnalyser();
    拍手_解析器.fftSize = 512;
    元.connect(拍手_解析器);

    const 配列 = new Uint8Array(拍手_解析器.frequencyBinCount);
    拍手_直前の音量 = 0;

    // 静かな状態から、一気に大きくなった瞬間だけを拾う。
    // 単純な音量の大きさだけで見ると、大声や音楽にも反応してしまうため、
    // 「直前との差の大きさ」を見る（拍手特有の、急な立ち上がり）。
    const しきい値 = 45;
    const 不応期ms = 900; // 一度鳴ってから、次を受け付けるまでの間（反響の誤検知を防ぐ）

    const 見る = () => {
        拍手_解析器.getByteFrequencyData(配列);
        const 音量 = 配列.reduce((a, b) => a + b, 0) / 配列.length;
        const 差 = 音量 - 拍手_直前の音量;

        const 今 = Date.now();
        if (差 > しきい値 && 音量 > 30 && 今 - 拍手_最後に鳴った時刻 > 不応期ms) {
            拍手_最後に鳴った時刻 = 今;
            拍手を受け取った();
        }
        拍手_直前の音量 = 音量 * 0.7 + 拍手_直前の音量 * 0.3; // なだらかに追従させる

        拍手_ループ札 = requestAnimationFrame(見る);
    };
    見る();
}

function init拍手検知() {
    const box = document.getElementById('clap-detect-toggle');
    if (!box || box.dataset.配線済み) return;
    box.dataset.配線済み = '1';

    box.checked = localStorage.getItem('areglm_clap_detect') === 'true';
    if (box.checked) 拍手検知を始める();

    box.addEventListener('change', (e) => {
        localStorage.setItem('areglm_clap_detect', e.target.checked ? 'true' : 'false');
        if (e.target.checked) {
            拍手検知を始める();
            showNotification('拍手の検知を始めます（実験的機能）。', 'warning');
        } else {
            拍手検知を止める();
            showNotification('拍手の検知を止めました。', 'success');
        }
    });
}

window.init拍手検知 = init拍手検知;
