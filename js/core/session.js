/**
 * 会話のつながり
 *
 * なぜこれが要るのか:
 *   AIに話しかけるたびに「初対面」として扱われ、
 *   「商品を登録したい」→「名前は？」→「黒Tシャツ」と答えても、
 *   何の話だったか分からなくなっていた。
 *
 *   会話ごとに目印を付けて送れば、続きとして扱える。
 *
 * 目印の決め方:
 *   このブラウザに一つだけ持たせる。
 *   端末やタブが違えば別の目印になるので、話が混ざらない。
 *
 * 中身は目印だけで、会話の内容はここに残さない。
 */

const AREGLM_SESSION_KEY = 'areglm_session_id';

function getSessionId() {
    let id = localStorage.getItem(AREGLM_SESSION_KEY);
    if (!id) {
        // 時刻と乱数を混ぜる。ほかの端末とぶつからないようにするため。
        id = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(AREGLM_SESSION_KEY, id);
    }
    return id;
}

/**
 * 会話を最初からにする。
 * 話が混線したときや、別の用件を始めたいときに使う。
 */
function resetSession() {
    localStorage.removeItem(AREGLM_SESSION_KEY);
    return getSessionId();
}

/**
 * AIへ送る中身に、会話の目印を足す。
 *
 * 送り先ごとに書き足すと付け忘れるため、ここに一本化する。
 * 実際、付け忘れて会話が続かなくなっていた。
 */
function withSession(body) {
    return Object.assign({}, body || {}, { session_id: getSessionId() });
}

window.getSessionId = getSessionId;
window.resetSession = resetSession;
window.withSession = withSession;
