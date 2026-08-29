/**
 * 端末内だけの音声認識
 *
 * なぜこれが要るのか:
 *   ブラウザ標準の音声認識は、音声をGoogleのサーバーへ送っている。
 *   「外部に一切送らない」という、このツールでいちばん大事な約束に
 *   真正面から反していた。
 *
 *   自作AIエンジンの中で、無料・オープンソースの音声認識モデル
 *   （faster-whisper・small）を動かしている。Ollamaで文章生成AIを
 *   ローカルで動かしているのと同じ考え方。証明書もクラウドも要らない。
 *
 *   （以前は macOS 標準の音声認識を試したが、アプリの署名・権限が
 *   無いと動かず、起動するたびクラッシュしていた。）
 *
 * 使い分け:
 *   端末内で認識できるなら、必ずそちらを使う。
 *   できない場合は、外へ送ることを先に伝えて、選んでもらう。
 *   黙って外へ出すことはしない。
 *
 * 音声はこの端末の中で文字にし、ファイルは処理後すぐ消える。
 */

/** 端末内で認識できるか。一度調べたら覚えておく。 */
let 端末内の状態 = null;

async function 端末内認識が使えるか() {
    if (端末内の状態) return 端末内の状態;
    try {
        const r = await fetch('/api/voice/status', { cache: 'no-store' });
        端末内の状態 = r.ok ? await r.json() : { ok: false, 使える: false };
    } catch {
        端末内の状態 = { ok: false, 使える: false, reason: '調べられませんでした' };
    }
    return 端末内の状態;
}

/** 録音中のもの */
let 録音機 = null;
let 集めた音 = [];

/**
 * 押したまま忘れられたときの、自動で止めるまでの長さ（秒）。
 *
 * 押し忘れて画面を離れると、マイクが入ったまま気づかず、
 * ずっとあとになって「止める」を押したときに、
 * そのとき拾った物音が指示として処理され、
 * 「話しかけていないのに勝手に反応した」ように見えていた
 * （実際には、ずっと前に開いたままだったマイクが拾った音）。
 *
 * 一言二言のつもりで押すボタンなので、この長さで十分なはず。
 */
const 最長録音秒 = 20;
let 自動停止のタイマー = null;

/** 自動で止まったときに、画面側へ知らせるための合図 */
let 自動停止で呼ぶもの = null;

/**
 * 録音を始める。
 *
 * 押したときだけマイクが入る。
 * 呼ばれていないのに録り続けることはしない
 * （押しっぱなしを防ぐため、上限を超えたら自動で止める）。
 */
async function 端末内で録音を始める(自動停止したら) {
    if (!window.isSecureContext) {
        showNotification('この接続ではマイクを使えません（127.0.0.1 か https:// が必要です）', 'error');
        return false;
    }

    try {
        const 流れ = await navigator.mediaDevices.getUserMedia({ audio: true });
        集めた音 = [];

        録音機 = new MediaRecorder(流れ);
        録音機.ondataavailable = (e) => {
            if (e.data.size) 集めた音.push(e.data);
        };
        録音機.start();

        document.body.classList.add('wake-listening');

        自動停止で呼ぶもの = 自動停止したら || null;
        clearTimeout(自動停止のタイマー);
        自動停止のタイマー = setTimeout(async () => {
            if (!録音機) return;   // すでに自分で止めていた
            showNotification(`話しかけてから${最長録音秒}秒たったので、自動で止めました`, 'info');
            const text = await 端末内で文字にする();
            if (自動停止で呼ぶもの) 自動停止で呼ぶもの(text);
        }, 最長録音秒 * 1000);

        return true;
    } catch (e) {
        showNotification(
            e.name === 'NotAllowedError'
                ? 'マイクが許可されていません'
                : 'マイクを使えませんでした: ' + e.message,
            'error'
        );
        return false;
    }
}

/**
 * 録音を、文字にせずに打ち切る。
 *
 * 話しかけた内容を勝手に処理してほしくない場面
 * （画面を閉じた・別の画面へ移った等）で使う。
 */
function 端末内の録音を打ち切る() {
    clearTimeout(自動停止のタイマー);
    自動停止のタイマー = null;
    自動停止で呼ぶもの = null;
    if (!録音機) return;
    try {
        録音機.stream.getTracks().forEach((t) => t.stop());
        録音機.stop();
    } catch { /* すでに止まっていれば何もしない */ }
    録音機 = null;
    集めた音 = [];
    document.body.classList.remove('wake-listening');
}

/**
 * 録音を止めて、文字にする。
 *
 * @returns {Promise<string>} 文字にしたもの。できなければ空
 */
async function 端末内で文字にする() {
    if (!録音機) return '';

    // 自分で止めたので、自動で止めるタイマーはもう要らない。
    clearTimeout(自動停止のタイマー);
    自動停止のタイマー = null;
    自動停止で呼ぶもの = null;

    const 音 = await new Promise((返す) => {
        録音機.onstop = () => {
            // マイクは必ず切る。入れっぱなしにしないため。
            録音機.stream.getTracks().forEach((t) => t.stop());
            返す(new Blob(集めた音, { type: 'audio/wav' }));
        };
        録音機.stop();
    });

    録音機 = null;
    集めた音 = [];
    document.body.classList.remove('wake-listening');

    if (!音.size) return '';

    try {
        const r = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'audio/wav' },
            body: 音,
        });
        const d = await r.json();

        if (!d.ok) {
            showNotification('文字にできませんでした: ' + (d.reason || ''), 'error');
            return '';
        }
        return d.text || '';
    } catch (e) {
        showNotification('文字にできませんでした: ' + e.message, 'error');
        return '';
    }
}

/** いま録音しているか */
function 端末内で録音中か() {
    return 録音機 !== null;
}

/**
 * 状態を画面に出す。
 *
 * 「外へ送っているかどうか」は、いちばん知りたいことなので、
 * 隠さずそのまま書く。
 */
async function renderVoiceStatus() {
    const 箱 = document.getElementById('voice-status');
    if (!箱) return;

    const s = await 端末内認識が使えるか();
    箱.innerHTML = '';

    const 行 = (文, 級) => {
        const d = document.createElement('div');
        d.className = 'voice-line ' + (級 || '');
        d.textContent = 文;
        箱.appendChild(d);
    };

    if (s.使える) {
        行('✓ 端末内だけで文字にできます（Whisper・small）。音声は外へ出ません。', 'ok');
        return;
    }

    // 使えない場合。以前はここでmacOSの許可ダイアログ待ちを案内していたが、
    // 今は自作AIエンジンの中でWhisperを動かす形に変わり、
    // 許可ではなく「エンジンが起動していない」「モデルを読み込めない」が
    // ほとんどの原因になった。実際の理由をそのまま出す。
    行('✗ 端末内での音声認識を、いま使えません。', 'ng');
    行(s.reason || '理由は分かりませんでした。', '');

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm btn-secondary';
    b.textContent = 'もう一度確かめる';
    b.addEventListener('click', () => {
        端末内の状態 = null;
        renderVoiceStatus();
    });
    箱.appendChild(b);

    行('ブラウザ標準の音声認識を使うと、音声がGoogleのサーバーへ送られます。'
       + 'それが困る場合は、文字で入力してください。', '');
}

function initLocalVoice() {
    renderVoiceStatus();
}

window.initLocalVoice = initLocalVoice;
window.renderVoiceStatus = renderVoiceStatus;
window.端末内認識が使えるか = 端末内認識が使えるか;
window.端末内で録音を始める = 端末内で録音を始める;
window.端末内で文字にする = 端末内で文字にする;
window.端末内で録音中か = 端末内で録音中か;
window.端末内の録音を打ち切る = 端末内の録音を打ち切る;
