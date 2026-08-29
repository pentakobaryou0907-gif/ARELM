/**
 * 音声のやり取りを記録し、学習させる
 *
 * なぜこれが要るのか:
 *   話しかけた内容が、あとで見返せなかった。
 *   「ちゃんと聞き取れているか」「学習に使われているか」が
 *   画面から分からず、不安の元になっていた。
 *
 * ここでやること:
 *   1. 話しかけて文字になった内容を、日時つきで残す（この端末の中だけ）
 *   2. 確実に学習させる（コマンドとして即座に処理される言い方は、
 *      サーバー側の学習を経由しないため、ここで明示的に学習させる）
 *
 * 録音した「音声そのもの」は保存しない。
 *   声を文字にする処理（faster-whisper）は、文字にした直後に
 *   音声ファイルを消す作りになっている（AReGLMの一貫した方針）。
 *   ここで保存するのは、文字になったあとの「言葉」だけ。
 */

const 音声ログの鍵 = 'areglm_voice_log';

function 音声ログを読む() {
    try {
        const r = JSON.parse(localStorage.getItem(音声ログの鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 音声のやり取りを記録する(text, target) {
    const 文 = (text || '').trim();
    if (!文) return;

    const 一覧 = 音声ログを読む();
    一覧.push({ text: 文, target: target || '', at: new Date().toISOString() });
    localStorage.setItem(音声ログの鍵, JSON.stringify(一覧.slice(-200)));

    // 確実に学習させる。すでに他の経路（/agent-route 等）で学習済みでも、
    // 同じ短い文をもう一度学習させるだけなので害はない。
    fetch('/api/ai-local/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 文, category: 'voice:user' }),
    }).catch(() => { /* 学習は付加的なもの。失敗してもやり取り自体は続ける */ });

    if (typeof 音声ログを描く === 'function') 音声ログを描く();
}

function 音声ログを描く() {
    const 箱 = document.getElementById('voice-log-list');
    if (!箱) return;
    const 一覧 = 音声ログを読む().slice().reverse();
    if (!一覧.length) {
        箱.innerHTML = '<li class="empty">まだ話しかけた記録がありません。</li>';
        return;
    }
    箱.innerHTML = 一覧.slice(0, 50)
        .map((x) => `<li class="rule-log-item"><small>${AReGLM_SECURITY.sanitizeHtml(new Date(x.at).toLocaleString('ja-JP'))}</small> ${AReGLM_SECURITY.sanitizeHtml(x.text)}</li>`)
        .join('');
}

function 音声ログを消す() {
    if (!confirm('話しかけた記録を全て消しますか？（学習済みの内容そのものは残ります）')) return;
    localStorage.removeItem(音声ログの鍵);
    音声ログを描く();
}

function init音声のやり取り記録() {
    const btn = document.getElementById('voice-log-clear-btn');
    if (!btn || btn.dataset.配線済み) return;
    btn.dataset.配線済み = '1';
    btn.addEventListener('click', 音声ログを消す);
    音声ログを描く();
}

window.音声のやり取りを記録する = 音声のやり取りを記録する;
window.音声ログを描く = 音声ログを描く;
window.init音声のやり取り記録 = init音声のやり取り記録;
