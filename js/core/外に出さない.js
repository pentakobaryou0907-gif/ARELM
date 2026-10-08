/**
 * 外へ出さない（最後の関所）
 *
 * なぜこれが要るのか:
 *   このツールは公開しない・外へ送らない、が土台になっている。
 *   実際、外部の鍵は一つも設定されておらず、
 *   外部を呼ぶところは鍵が無いので必ず失敗する。
 *
 *   ただ「鍵が無いから、たまたま飛ばない」のと、
 *   「そもそも飛ばせない」のとは違う。
 *   鍵が一度でも入れば、前者は黙って外へ出る。
 *
 *   だからここで、外へ出る通信そのものを止める。
 *   自分で「外部を使う」と選んだときだけ通す。
 *
 * 止めるもの:
 *   ・fetch でこの端末の外へ出るもの
 *   ・XMLHttpRequest で外へ出るもの
 *   ・WebSocket で外へつなぐもの
 *   ・sendBeacon（画面を閉じるときに黙って送るやつ）
 *
 * 止めないもの:
 *   ・127.0.0.1 / localhost（自分の中の行き来。これが本体）
 *   ・data: blob: （その場で作ったもの。外には出ない）
 *   ・同じページの中の相対パス
 *
 * 止めたときは、黙って失敗させず、何を止めたかを画面の記録に残す。
 * 黙って止めると、動かない理由が分からなくなるため。
 */

const 外に出す許可の鍵 = 'areglm_allow_external';

/** 自分の中への行き先か */
function 中の行き先か(url) {
    try {
        const u = new URL(url, location.href);

        // その場で作ったものは、外へ出ない
        if (u.protocol === 'data:' || u.protocol === 'blob:') return true;

        // 自分の端末
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost'
            || u.hostname === '::1' || u.hostname === location.hostname) return true;

        return false;
    } catch {
        // 読み取れない行き先は、通さない。
        // 分からないものを通すのは、いちばん危ない。
        return false;
    }
}

/**
 * 本人がこの端末の設定で選んだ、外の置き場だけは通す。
 *
 * Macの無い公開先（GitHub Pages）では、データの共有とAIを、外の公式・無料のサービスで行う
 * （本人が 2026-10-08 に選んだ。データ: GitHubの非公開倉庫／AI: Geminiの無料API）。
 * 「外を全部許す」にはせず、行き先を道（パス）まで絞って、この2つだけを通す:
 *   ・GitHub: 本人が決めたデータ用の倉庫（/repos/<持ち主>/<倉庫> と その中身）、
 *            鍵の持ち主を確かめる /user、倉庫が無いときに作る /user/repos
 *   ・Gemini: 文章を作る窓口（/v1beta/models/<名前>:generateContent）だけ
 *   ・GitHub: このツール自身の公開リポジトリの様子（commits・pulls・actions/runs を読むだけ。本人が「見る」を押したとき）
 * 設定（areglm_ext_store / areglm_ext_ai）は、本人が設定画面で保存したときだけ作られる。
 */
function 選んだ外の置き場か(url) {
    try {
        const u = new URL(url, location.href);
        if (u.protocol !== 'https:') return false;
        if (u.hostname === 'api.github.com') {
            // このツール自身の公開リポジトリの様子（最近の変更・取り込み待ち・自動処理の結果）を、読むだけ。
            // 設定の「GitHubの様子」で本人が「見る」を押したときだけ通す（鍵は付けない）
            if (localStorage.getItem('areglm_ext_github_view') === 'true'
                && /^\/repos\/pentakobaryou0907-gif\/ARELM\/(commits|pulls|actions\/runs)$/.test(u.pathname)) return true;
            const 置き場 = JSON.parse(localStorage.getItem('areglm_ext_store') || 'null');
            if (!置き場 || !置き場.倉庫) return false;
            if (u.pathname === '/user' || u.pathname === '/user/repos') return true;
            if (!置き場.持ち主) return false;
            const 道 = `/repos/${置き場.持ち主}/${置き場.倉庫}`;
            return u.pathname === 道 || u.pathname.startsWith(道 + '/contents/');
        }
        if (u.hostname === 'generativelanguage.googleapis.com') {
            return localStorage.getItem('areglm_ext_ai') === 'gemini'
                && /^\/v1beta\/models\/[\w.-]+:generateContent$/.test(u.pathname);
        }
        return false;
    } catch {
        return false;
    }
}

function 外を許しているか() {
    return localStorage.getItem(外に出す許可の鍵) === 'true';
}

/** 止めたことを残す */
function 止めたことを残す(行き先, やり方) {
    // 「歯止めを確かめる」が、止まっているかを見るためにわざと外へ
    // 出そうとする試験。本当に止めた事故ではないので、通知も記録もしない
    // （残すと、本物の「止めた記録」に試験の分が混ざって見分けがつかなくなる）。
    if (window.__関所の試験中) return;
    const 記録 = (() => {
        try { return JSON.parse(localStorage.getItem('areglm_blocked_out') || '[]'); }
        catch { return []; }
    })();

    記録.push({ 行き先: String(行き先).slice(0, 200), やり方, とき: new Date().toISOString() });
    localStorage.setItem('areglm_blocked_out', JSON.stringify(記録.slice(-50)));

    if (typeof showNotification === 'function') {
        showNotification(
            `外へ出る通信を止めました（${new URL(String(行き先), location.href).hostname}）。`
            + 'このツールは外へ送らない決まりです。',
            'warning');
    }
    console.warn('[外に出さない] 止めました:', やり方, 行き先);
}

function 関所を置く() {
    // --- fetch ---
    const 元のfetch = window.fetch;
    window.fetch = function (入力, 設定) {
        const 行き先 = (入力 && 入力.url) ? 入力.url : 入力;
        if (!中の行き先か(行き先) && !選んだ外の置き場か(行き先) && !外を許しているか()) {
            止めたことを残す(行き先, 'fetch');
            return Promise.reject(new Error(
                'このツールは外へ通信しません。外部を使う場合は、設定で明示的に許可してください。'));
        }
        return 元のfetch.apply(this, arguments);
    };

    // --- XMLHttpRequest ---
    const 元のopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (方法, url, ...残り) {
        if (!中の行き先か(url) && !選んだ外の置き場か(url) && !外を許しているか()) {
            止めたことを残す(url, 'XMLHttpRequest');
            throw new Error('このツールは外へ通信しません。');
        }
        return 元のopen.call(this, 方法, url, ...残り);
    };

    // --- WebSocket ---
    const 元のWS = window.WebSocket;
    if (元のWS) {
        window.WebSocket = function (url, ...残り) {
            if (!中の行き先か(url) && !選んだ外の置き場か(url) && !外を許しているか()) {
                止めたことを残す(url, 'WebSocket');
                throw new Error('このツールは外へ通信しません。');
            }
            return new 元のWS(url, ...残り);
        };
        window.WebSocket.prototype = 元のWS.prototype;
    }

    // --- sendBeacon ---
    //
    // これは画面を閉じるときに黙って送るためのもの。
    // 使っていないが、いちばん気づかれにくい経路なので塞ぐ。
    if (navigator.sendBeacon) {
        const 元のbeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function (url, ...残り) {
            if (!中の行き先か(url) && !選んだ外の置き場か(url) && !外を許しているか()) {
                止めたことを残す(url, 'sendBeacon');
                return false;
            }
            return 元のbeacon(url, ...残り);
        };
    }
}

/**
 * 本人が選んだ外の置き場へ送る、ただ一つの入口（公開先の倉庫・Gemini・GitHubの様子）。
 *
 * 画面のあちこちから外へ fetch すると、外への道が散らばって見張れなくなる
 * （ストッパーも、画面のファイルからの外への通信を止める）。そこで、外へ出る道はここ一か所にまとめる。
 *   ・行き先が「本人が選んだ置き場」（選んだ外の置き場か）でなければ、送らずに止める
 *     （「外を全部許す」設定があっても、この入口は選んだ置き場以外へは送らない）
 *   ・Gemini は無料の枠を超えると課金されるため、お金の見張り（paid-guard）で本人が許可しているときだけ送る
 */
function 選んだ置き場へ送る(url, 設定) {
    if (!選んだ外の置き場か(url)) {
        止めたことを残す(url, '選んだ置き場へ送る');
        return Promise.reject(new Error('本人が選んだ置き場ではないため、送りませんでした'));
    }
    let 先 = '';
    try { 先 = new URL(url, location.href).hostname; } catch { 先 = ''; }
    if (先 === 'generativelanguage.googleapis.com' && !(typeof 使ってよいか === 'function' && 使ってよいか('gemini'))) {
        return Promise.reject(new Error('Gemini は、お金がかかりうるため止めてあります（設定の「☁ Mac無しで使う」でキーを保存すると、使う許可も記録されます）'));
    }
    return window.fetch(url, 設定);
}

/** 止めた記録を読む（設定画面で見せるため） */
function 止めた記録を読む() {
    try { return JSON.parse(localStorage.getItem('areglm_blocked_out') || '[]'); }
    catch { return []; }
}

関所を置く();

window.中の行き先か = 中の行き先か;
window.外を許しているか = 外を許しているか;
window.選んだ外の置き場か = 選んだ外の置き場か;
window.選んだ置き場へ送る = 選んだ置き場へ送る;
window.止めた記録を読む = 止めた記録を読む;
