/**
 * 端末の記録（画面側）― この端末で、ARELMを「アプリとして」開いたかを、Macへ知らせる
 *
 * ホーム画面・デスクトップのアイコンは端末の中のもので、ARELMからは見えない。
 * そこで、開かれたときに「アイコンから開いたか（アプリとして）」を知らせて、
 * 設定の「3台の端末」で、どの端末に入っていて、どこにあるかを見られるようにする。
 *   ・iPad/iPhone … ホーム画面のアイコンから開くと、standalone になる
 *   ・Windows     … Windows用キットのアイコンから開くと ?from=windows-app が付く／Chromeのアプリとして開くと standalone
 * 外へは何も送らない（このMacのARELMへ知らせるだけ）。
 */

function アプリとして開いているか() {
    return navigator.standalone === true
        || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)
        || (window.matchMedia && matchMedia('(display-mode: window-controls-overlay)').matches)
        || /[?&]from=(windows-app|mac-app)\b/.test(location.search);
}

async function 開いたことを知らせる() {
    try {
        await fetch('/api/devices/seen', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                種類: typeof ホーム画面用の端末 === 'function' ? ホーム画面用の端末() : '',
                アプリとして: アプリとして開いているか(),
            }),
        });
    } catch { /* 知らせられなくても、使うことには困らない */ }
}

/** この端末に、ARELMが入っていると分かっているか（入れた場所の報告か、アイコンから開いた記録がある） */
async function この端末に入っているか() {
    if (アプリとして開いているか()) return true;
    try {
        const r = await fetch('/api/devices/mine', { cache: 'no-store' }).then((x) => x.json());
        const d = r && r.端末;
        return !!(d && (d.入れた場所 || d.アプリとして最後に開いた));
    } catch { return false; }
}

window.アプリとして開いているか = アプリとして開いているか;
window.開いたことを知らせる = 開いたことを知らせる;
window.この端末に入っているか = この端末に入っているか;
setTimeout(開いたことを知らせる, 2000);
