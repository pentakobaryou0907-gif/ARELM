/**
 * 呼びかけで動くアシスタント
 *
 * 目的:
 *   画面を触らずに、思いついた瞬間に指示できるようにする。
 *
 * 聞き取りかたは2通りある。初期設定は「押したときだけ」。
 *
 *   押したときだけ（初期設定・推奨）
 *     ボタンを押した瞬間だけマイクが入る。
 *     話し終わる、または無音が続くと、その場でマイクを切る。
 *     押していない間、マイクは完全に切れている。
 *
 *   名前で呼ぶ
 *     呼び名が聞こえるまで待ち続ける。
 *     手が塞がっていても使えるが、その間マイクは入ったままになる。
 *     自分で選んだときだけ有効になる。
 *
 * 【重要・外部送信について】
 *   ブラウザ標準の音声認識（Web Speech API）は、
 *   Chrome の場合、音声をGoogleのサーバーへ送って文字にしている。
 *   つまり「この端末の中だけ」では処理されない。
 *
 *   以前このファイルには「外部に送らない」と書いてあったが、
 *   それは誤りだった。実態に合わせて訂正した。
 *
 *   外部に一切出さない方法として、
 *   このMacの中だけで文字にする仕組み（server/voice/）を用意してある。
 *   そちらが使える場合は自動でそちらを使う。
 *
 * 決めごと:
 *   - 音声も、文字にしたものも、一切保存しない
 *   - 呼ばれていないときの会話は受け取らない
 *   - マイクが入っている間は、画面に必ず印を出す
 */

const WAKE_NAME_KEY = 'areglm_wake_name';
const WAKE_ENABLED_KEY = 'areglm_wake_enabled';

// 聞き取りかた: 'push'（押したときだけ・初期設定） / 'always'（名前で呼ぶ）
const WAKE_MODE_KEY = 'areglm_wake_mode';

// 押したときだけの場合、何も話さないまま何秒でマイクを切るか
const 無音で切るまでの秒数 = 6;

// 呼び名の初期値。
const DEFAULT_WAKE_NAME = 'アレラム';

let wakeRecognition = null;
let wakeActive = false;
let wakeRestartTimer = null;

function getWakeName() {
    return localStorage.getItem(WAKE_NAME_KEY) || DEFAULT_WAKE_NAME;
}

function setWakeName(name) {
    localStorage.setItem(WAKE_NAME_KEY, name || DEFAULT_WAKE_NAME);
}

function isWakeEnabled() {
    return localStorage.getItem(WAKE_ENABLED_KEY) === 'true';
}

/**
 * 聞き取りかたを返す。
 *
 * 初期値を 'push'（押したときだけ）にしているのは、
 * 呼ばれてもいないのにマイクが入り続ける状態を、
 * 既定にしてはいけないと考えるため。
 */
function getWakeMode() {
    return localStorage.getItem(WAKE_MODE_KEY) === 'always' ? 'always' : 'push';
}

function setWakeMode(mode) {
    localStorage.setItem(WAKE_MODE_KEY, mode === 'always' ? 'always' : 'push');
}

/**
 * マイクが使えない接続のとき、切り替え先を案内する。
 *
 * 自動で転送すると、証明書の警告でツール自体が開けなくなるため、
 * 押したときだけ移動するボタンを出す。
 */
async function renderMicSwitch() {
    const box = document.getElementById('wake-switch-https');
    if (!box) return;

    // すでに使える接続なら何も出さない
    if (window.isSecureContext) {
        box.innerHTML = '';
        return;
    }

    try {
        const res = await fetch('/api/https-info');
        const info = await res.json();
        if (info.micWorksNow || !info.httpsAvailable) {
            box.innerHTML = '';
            return;
        }

        box.innerHTML = `
            <div class="mic-switch">
                <p>今の接続ではマイクを使えません（ブラウザの決まりです）。</p>
                <a class="btn btn-primary btn-sm" href="${AReGLM_SECURITY.escapeAttr(info.httpsUrl)}">
                    マイクを使えるようにする
                </a>
                <p class="hint">押すと安全な接続に切り替わります。
                初回だけ警告が出るので「詳細」→「アクセスする」で進んでください
                （このMacが発行した証明書です）。</p>
            </div>`;
    } catch {
        box.innerHTML = '';
    }
}

function initWakeWord() {
    renderMicSwitch();
    document.getElementById('wake-toggle')?.addEventListener('change', (e) => {
        localStorage.setItem(WAKE_ENABLED_KEY, e.target.checked ? 'true' : 'false');
        e.target.checked ? startWakeListening() : stopWakeListening();
        renderWakeStatus();
    });

    document.getElementById('wake-name')?.addEventListener('change', (e) => {
        const name = e.target.value.trim() || DEFAULT_WAKE_NAME;
        setWakeName(name);
        e.target.value = name;
        renderWakeStatus();
        if (typeof renderWakeState === 'function') renderWakeState();
        showNotification(`呼び名を「${name}」にしました`, 'success');
    });

    // 聞き取りかたの切り替え
    //
    // 以前は「名前で呼ぶ」を選んだうえで、
    // さらに「有効にする」を押す必要があった。
    // 二段階になっていて分かりにくく、
    // 選んだのに反応しない、ということが起きた。
    // いまは選んだ時点で待ち受けを始める。
    // ブラウザの音声認識を使うかどうか。
    // 既定は「使わない」。外へ出るものを既定にはしない。
    const 外部の入 = document.getElementById('wake-use-browser');
    if (外部の入) {
        外部の入.checked = localStorage.getItem('areglm_wake_use_browser') === 'true';
        外部の入.addEventListener('change', (e) => {
            localStorage.setItem('areglm_wake_use_browser', e.target.checked ? 'true' : 'false');
            if (e.target.checked) {
                showNotification('ブラウザの音声認識に切り替えました。Chromeでは音声がGoogleへ送られます。', 'warning');
            } else {
                showNotification('自作の聞き取りに戻しました。音声は外へ出ません。', 'success');
            }
            // 待ち受け中なら、切り替えを反映するために張り直す
            if (getWakeMode() === 'always') { stopWakeListening(); startWakeListening(); }
        });
    }

    document.querySelectorAll('input[name="wake-mode"]').forEach((r) => {
        r.checked = r.value === getWakeMode();
        r.addEventListener('change', (e) => {
            if (!e.target.checked) return;
            setWakeMode(e.target.value);

            if (e.target.value === 'push') {
                localStorage.setItem(WAKE_ENABLED_KEY, 'false');
                stopWakeListening();
                showNotification('押したときだけ聞くようにしました。マイクは切れています。', 'success');
            } else {
                localStorage.setItem(WAKE_ENABLED_KEY, 'true');
                startWakeListening();
            }
            renderWakeStatus();
            renderWakeState();
        });
    });

    // 押して話すボタン
    document.getElementById('wake-push')?.addEventListener('click', 一度だけ聞く);

    renderWakeStatus();
    renderWakeState();

    // 「名前で呼ぶ」を自分で選んでいるときだけ、待ち受けを始める。
    // 初期設定では何も始めない（マイクは切れたまま）。
    if (getWakeMode() === 'always') startWakeListening();
}

/**
 * いま待ち受けているかを、はっきり出す。
 *
 * 「呼んだのに反応しない」の多くは、
 * 待ち受けていないことに気づいていないのが原因だった。
 * 状態が見えていれば、すぐ分かる。
 */
function renderWakeState() {
    const 箱 = document.getElementById('wake-state');
    if (!箱) return;

    const 名 = getWakeName();

    if (getWakeMode() !== 'always') {
        箱.className = 'wake-state';
        箱.textContent = '名前を呼んでも反応しません。'
            + `「${名}」で呼びたい場合は、上の「名前で呼ぶと反応する」を選んでください。`;
        return;
    }

    if (wakeActive) {
        箱.className = 'wake-state on';
        箱.textContent = `🎙 待ち受け中です。「${名}」と呼びかけてください。`;
        return;
    }

    箱.className = 'wake-state warn';
    箱.textContent = '待ち受けを始めようとしています。'
        + 'マイクの許可を求められたら「許可」を選んでください。';
}

window.renderWakeState = renderWakeState;

/**
 * 呼びかけを待つ。
 * 認識は途切れるので、終わるたびに静かに張り直す。
 */
/**
 * この端末で音声認識が使えるかを調べる。
 *
 * iOSのSafariは音声認識に対応していない場合がある。
 * 使えないまま黙って動かないと原因が分からないので、
 * 何が起きているかをはっきり伝える。
 */
function speechSupport() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!window.isSecureContext) {
        return { ok: false, reason: 'insecure', isIOS };
    }
    if (!SR) {
        return { ok: false, reason: 'unsupported', isIOS };
    }
    return { ok: true, SR, isIOS };
}

/**
 * 待ち受けを始める。
 *
 * まず自作の待ち受けを試す。
 *
 * なぜその順なのか:
 *   ブラウザの音声認識は、Chromeの場合いったんGoogleへ音声を送って文字にする。
 *   このツールは「外部へ一切送らない」を土台にしているので、
 *   それが既定になっているのは筋が通らなかった。
 *
 *   呼び名は一語だけなので、自作で足りる。だからそちらを先に使う。
 *
 * 自作が使えないとき（呼び名をまだ教えていないとき）は、
 * 黙って外部へ切り替えたりしない。理由を言って止まる。
 * 外へ送るかどうかは、こちらが勝手に決めることではない。
 */
function startWakeListening() {
    if (自作の待ち受けを試す()) return;
    const support = speechSupport();
    const SR = support.SR;

    if (!support.ok && support.reason === 'unsupported') {
        // iOSでは対応していないことがあるので、代わりの手段を案内する
        showNotification(
            support.isIOS
                ? 'この端末のブラウザは音声認識に対応していません。文字での指示はそのまま使えます。'
                : 'このブラウザは音声認識に対応していません（Chrome推奨）',
            'error'
        );
        const t = document.getElementById('wake-toggle');
        if (t) t.checked = false;
        localStorage.setItem(WAKE_ENABLED_KEY, 'false');
        renderWakeStatus();
        return;
    }

    if (!window.isSecureContext) {
        showNotification(
            `このURL（${location.host}）では音声を使えません。https:// で開いてください`,
            'error'
        );
        const toggle = document.getElementById('wake-toggle');
        if (toggle) toggle.checked = false;
        localStorage.setItem(WAKE_ENABLED_KEY, 'false');
        return;
    }

    if (wakeActive) return;

    wakeRecognition = new SR();
    wakeRecognition.lang = 'ja-JP';
    wakeRecognition.continuous = true;
    wakeRecognition.interimResults = false;

    wakeRecognition.onstart = () => {
        wakeActive = true;
        // 聞いていることが分かるように、画面に印を付ける
        document.body.classList.add('wake-listening');
        renderWakeStatus();
        if (typeof renderWakeState === 'function') renderWakeState();
    };

    wakeRecognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (!e.results[i].isFinal) continue;
            handleWakeHeard(e.results[i][0].transcript.trim());
        }
    };

    wakeRecognition.onerror = (e) => {
        // 音が無い間のエラーは正常なので黙って続ける
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'not-allowed') {
            showNotification('マイクが許可されていません。アドレス欄左のアイコンから許可してください', 'error');
            stopWakeListening();
        }
    };

    wakeRecognition.onend = () => {
        wakeActive = false;
        document.body.classList.remove('wake-listening');
        renderWakeStatus();
        if (typeof renderWakeState === 'function') renderWakeState();
        // 有効なままなら、少し待って張り直す（切れっぱなしを防ぐ）
        if (isWakeEnabled()) {
            clearTimeout(wakeRestartTimer);
            wakeRestartTimer = setTimeout(startWakeListening, 600);
        }
    };

    try {
        wakeRecognition.start();
    } catch {
        /* すでに動いている場合は無視 */
    }
}

/**
 * 自作の待ち受けを試す。
 * 始められたら true、始められなかったら false。
 */
function 自作の待ち受けを試す() {
    const 待 = window.AReGLM_VOICE_WAKE;
    if (!待) return false;

    // 常駐の待ち受けが動いているなら、画面側は下がる。
    //
    // 両方がマイクを掴むと、一度の呼びかけに二度返事をする。
    // 常駐のほうは画面を開かなくても応じられるので、そちらに任せる。
    // 「どこからでも使える」ようにするには、
    // どちらか一方だけが応じる形にしておく必要がある。
    if (window.__常駐が待ち受け中) {
        const t = document.getElementById('wake-toggle');
        if (t) t.checked = true;
        if (typeof renderWakeState === 'function') renderWakeState();
        console.log('[待ち受け] 常駐のほうが動いているので、画面側は下がります');
        return true;
    }

    // 外部を使うと自分で選んだときは、そちらに任せる
    if (localStorage.getItem('areglm_wake_use_browser') === 'true') return false;

    if (!待.呼び名を覚えているか()) {
        const 名 = 待.呼び名を読む();
        showNotification(
            `「${名}」の声をまだ覚えていません。下の「言葉を教える」で「${名}」を2回ほど録ってください。`
            + '覚えれば、外部に一切送らずに待ち受けます。',
            'error'
        );
        const t = document.getElementById('wake-toggle');
        if (t) t.checked = false;
        renderWakeStatus();
        if (typeof renderWakeState === 'function') renderWakeState();
        return true;   // 外部へは切り替えない
    }

    待.自作の待ち受けを始める({
        呼ばれたら() {
            wakeActive = true;
            document.body.classList.add('wake-listening');
            showNotification('はい、聞いています', 'info');
        },
        指示が揃ったら(波形, 周波数) {
            const r = window.AReGLM_VOICE_LEARN.声を聞き取る(波形, 周波数);
            if (r.結果 === 'わからない') {
                showNotification('呼ばれたのは分かりましたが、続きが聞き取れませんでした。'
                    + '「言葉を教える」で覚えさせてください。', 'error');
                return;
            }
            const 並び = (r.言葉たち && r.言葉たち.length) ? r.言葉たち : [r.言葉];
            並び.forEach((言葉, i) => {
                setTimeout(() => {
                    if (typeof 声で聞かれた !== 'undefined') 声で聞かれた = true;
                    runConsoleCommand(言葉, 'mainai');
                }, i * 700);
            });
        },
    }).then((r) => {
        if (!r.ok) {
            showNotification(r.訳, 'error');
            const t = document.getElementById('wake-toggle');
            if (t) t.checked = false;
        } else {
            wakeActive = true;
            document.body.classList.add('wake-listening');
            showNotification(r.訳, 'success');
        }
        renderWakeStatus();
        if (typeof renderWakeState === 'function') renderWakeState();
    });

    return true;
}

function stopWakeListening() {
    window.AReGLM_VOICE_WAKE?.自作の待ち受けを止める();
    clearTimeout(wakeRestartTimer);
    if (wakeRecognition) {
        wakeRecognition.onend = null; // 張り直さない
        try {
            wakeRecognition.stop();
        } catch {
            /* 停止済みなら無視 */
        }
    }
    wakeActive = false;
    document.body.classList.remove('wake-listening');
    renderWakeStatus();
}

/**
 * 聞こえた文に呼び名が含まれていれば、その後ろを指示として実行する。
 * 呼ばれていなければ何もしない（記録もしない）。
 */
/**
 * 呼び名が聞こえたかを判定する。
 *
 * 日本語の音声認識は固有名詞を正確に返さない。
 * 「アレラム」は「あれらむ」「アレラン」「有田む」などに化けることがある。
 * そのため、文字が完全に一致しなくても、
 * 近ければ呼ばれたとみなす。
 *
 * 返り値: 呼ばれていれば、呼び名の直後の位置。呼ばれていなければ -1。
 */
function findWakeCall(heard, name) {
    // そのまま含まれていれば、その直後から指示が始まる
    const direct = heard.indexOf(name);
    if (direct >= 0) return direct + name.length;

    if (typeof fuzzyRatio !== 'function') return -1;

    // 聞き間違えを想定し、元の文をそのまま走査して
    // 呼び名に最も近い部分を探す。
    // ゆるく整えた文字列で位置を測ると、消えた文字のぶんだけ
    // ずれて指示の頭が欠けるため、必ず元の文で測る。
    const len = name.length;
    const scanEnd = Math.min(heard.length, len + 5); // 呼び名は文頭付近に来る

    let bestEnd = -1;
    let bestScore = 0;

    for (let i = 0; i < scanEnd; i++) {
        for (let l = Math.max(2, len - 1); l <= len + 2; l++) {
            const part = heard.slice(i, i + l);
            if (part.length < 2) continue;
            const score = fuzzyRatio(part, name);
            // 同じ点数なら、より長く一致したほうを採る。
            // そうしないと語尾の切れ端が指示側に残ってしまう。
            if (score >= 0.7 && (score > bestScore || (score === bestScore && i + l > bestEnd))) {
                bestScore = score;
                bestEnd = i + l;
            }
        }
    }
    return bestEnd;
}

function handleWakeHeard(heard) {
    if (!heard) return;

    const name = getWakeName();
    const after = findWakeCall(heard, name);

    if (after < 0) {
        // 呼ばれていない。何が聞こえたかだけ薄く出して、
        // 待機できていることが分かるようにする（内容は残さない）。
        showWakeIdle(heard);
        return;
    }

    // 呼び名の切れ端が残ることがあるので取り除く。
    // 語尾が伸びて認識されると、
    // 余った文字が指示の頭に残ってしまうため。
    let command = heard
        .slice(after)
        .replace(/^[、。\s,.！!？?ー〜]+/, '')
        .replace(/^(さん|君|ちゃん|くん)/, '')
        // 先頭に1文字だけカタカナが浮いている場合は呼び名の残りとみなす
        .replace(/^[ァ-ヴ](?=[^ァ-ヴー])/, '')
        .replace(/^[、。\s]+/, '')
        .trim();

    showWakeHeard(heard);

    if (!command) {
        // 名前だけ呼ばれたときは、聞く姿勢を見せる
        speakBack('はい。ご用件をどうぞ。');
        openQuickPanelForVoice();
        return;
    }

    runWakeCommand(command);
}

/**
 * 呼ばれたあとの指示を実行する。
 *
 * 操作コマンドなら実行し、そうでなければ会話として答える。
 * その振り分けは runConsoleCommand の中で行うため、ここでは任せる。
 */
async function runWakeCommand(command) {
    if (typeof runConsoleCommand === 'function') {
        // 呼びかけに応じた実行なので、声で返してよい
        if (typeof 声で聞かれた !== 'undefined') 声で聞かれた = true;
        await runConsoleCommand(command, 'mainai');
        if (window.logActivity) {
            logActivity(`呼びかけで実行: ${command}`, { category: 'voice', text: command });
        }
        return;
    }

    // コンソールが読み込まれていない場合だけ、直接会話エンジンに聞く

    // 質問なら、その場で答えも返す
    if (window.AReGLM_LOCAL_AI) {
        try {
            const res = await fetch('/api/ai-local/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                // 会話の目印。これが無いと毎回「初対面」になり、話が続かない。
                session_id: getSessionId(),
                    text: command,
                    context: {
                        today: 今日(),
                        products: JSON.parse(localStorage.getItem('products') || '[]'),
                        tasks: JSON.parse(localStorage.getItem('areglm_tasks') || '[]'),
                        events: JSON.parse(localStorage.getItem('areglm_events') || '[]')
                    }
                })
            });
            const d = await res.json();
            if (d.answer) {
                showWakeAnswer(d.answer, d.ok);
                speakBack(d.answer.split('\n')[0]);
            }
        } catch {
            /* エンジンが停止していても操作は妨げない */
        }
    }

    if (window.logActivity) {
        logActivity(`呼びかけで実行: ${command}`, { category: 'voice', text: command });
    }
}

/**
 * 声で短く返す。長い内容は画面で見てもらう。
 *
 * 声と話し方は設定から選べる。
 * 選ばれていなければ、これまでどおりの読み方をする。
 */
function speakBack(text) {
    if (!('speechSynthesis' in window) || !text) return;

    const 設定 = typeof 声の設定を読む === 'function'
        ? 声の設定を読む()
        : { 速さ: 1.05, 高さ: 1.0, 大きさ: 1.0, 読み上げる: true };

    // 「声では返さない」と選ばれていたら、黙る。
    // 画面には出ているので、内容が失われるわけではない。
    if (設定.読み上げる === false) return;

    try {
        const u = new SpeechSynthesisUtterance(text.slice(0, 120));
        u.lang = 'ja-JP';
        u.rate = 設定.速さ || 1.05;
        u.pitch = 設定.高さ || 1.0;
        u.volume = 設定.大きさ != null ? 設定.大きさ : 1.0;

        const 声 = typeof 選ばれた声 === 'function' ? 選ばれた声() : null;
        if (声) u.voice = 声;

        speechSynthesis.cancel(); // 前の発話が残っていたら止める
        speechSynthesis.speak(u);
    } catch {
        /* 読み上げが使えなくても動作は続ける */
    }
}

/* ---------- 画面表示 ---------- */

/**
 * 呼ばれていないときの表示。
 * 何も出ないと「壊れているのか、聞こえていないのか」が分からないため、
 * 聞き取れた内容だけを薄く出す。内容は保存も学習もしない。
 */
function showWakeIdle(text) {
    const el = document.getElementById('wake-status');
    if (!el) return;
    const name = getWakeName();
    el.innerHTML = `聞こえています:「${AReGLM_SECURITY.sanitizeHtml(text.slice(0, 30))}」`
        + `<br><small>「${AReGLM_SECURITY.sanitizeHtml(name)}」を先に付けて話しかけてください</small>`;
}

function showWakeHeard(text) {
    const box = ensureWakeToast();
    box.innerHTML = `<div class="wake-heard">🎤 ${AReGLM_SECURITY.sanitizeHtml(text)}</div>`;
    box.classList.add('show');
}

function showWakeAnswer(answer, ok) {
    const box = ensureWakeToast();
    const s = AReGLM_SECURITY.sanitizeHtml(answer).replace(/\n/g, '<br>');
    box.innerHTML += `<div class="wake-answer ${ok ? 'known' : 'unknown'}">${s}</div>`;
    box.classList.add('show');

    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(() => box.classList.remove('show'), 12000);
}

function ensureWakeToast() {
    let box = document.getElementById('wake-toast');
    if (!box) {
        box = document.createElement('div');
        box.id = 'wake-toast';
        box.className = 'wake-toast';
        document.body.appendChild(box);
        box.addEventListener('click', () => box.classList.remove('show'));
    }
    return box;
}

function openQuickPanelForVoice() {
    if (typeof openQuickPanel === 'function') {
        openQuickPanel();
        setTimeout(() => {
            document.querySelector('.quick-tab[data-qtab="ai"]')?.click();
            document.getElementById('quick-ai-input')?.focus();
        }, 150);
    }
}

function renderWakeStatus() {
    const nameInput = document.getElementById('wake-name');
    if (nameInput && !nameInput.value) nameInput.value = getWakeName();

    const toggle = document.getElementById('wake-toggle');
    if (toggle) toggle.checked = isWakeEnabled();

    const el = document.getElementById('wake-status');
    if (!el) return;

    const support = speechSupport();
    if (!support.ok && support.reason === 'unsupported') {
        el.textContent = support.isIOS
            ? 'この端末では音声認識が使えません。下の入力欄から文字で指示できます。'
            : 'このブラウザは音声認識に対応していません（Chrome推奨）。';
        if (toggle) toggle.disabled = true;
        return;
    }
    if (toggle) toggle.disabled = false;

    if (!isWakeEnabled()) {
        el.textContent = '待機していません。オンにすると呼びかけに反応します。';
        return;
    }
    el.textContent = wakeActive
        ? `待機中です。「${getWakeName()}、今日の状況」のように呼びかけてください。`
        : '接続を準備しています…';
}

window.initWakeWord = initWakeWord;
window.getWakeName = getWakeName;
window.startWakeListening = startWakeListening;
window.stopWakeListening = stopWakeListening;

/* ==========================================================
   押したときだけ聞く

   ボタンを押した瞬間にマイクを入れ、
   話し終わるか、無音が続いたら、その場で切る。
   押していない間、マイクは完全に切れている。
   ========================================================== */

let 一回だけの認識 = null;
let 無音タイマー = null;

/**
 * いまマイクが入っているかどうか。
 * 画面の表示と、二重に起動しないための判定に使う。
 */
function マイクが入っているか() {
    return wakeActive || 一回だけの認識 !== null;
}

/**
 * 一度だけ聞いて、聞き終わったらマイクを切る。
 *
 * 呼び名は要らない。押した時点で「呼びかけた」ことになるため。
 */
function 一度だけ聞く() {
    const support = speechSupport();
    if (!support.ok) {
        音声が使えない理由を伝える(support);
        return;
    }
    if (マイクが入っているか()) {
        // すでに聞いているなら、もう一度押されたら止める
        押して聞くのをやめる();
        return;
    }

    const SR = support.SR;
    一回だけの認識 = new SR();
    一回だけの認識.lang = 'ja-JP';
    一回だけの認識.continuous = false;   // 一区切りで終わる
    一回だけの認識.interimResults = true; // 話している途中を画面に出すため

    const 無音を数え直す = () => {
        clearTimeout(無音タイマー);
        無音タイマー = setTimeout(押して聞くのをやめる, 無音で切るまでの秒数 * 1000);
    };

    一回だけの認識.onstart = () => {
        document.body.classList.add('wake-listening');
        renderWakeStatus();
        無音を数え直す();
    };

    一回だけの認識.onresult = (e) => {
        無音を数え直す();
        let 確定 = '';
        let 途中 = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) 確定 += e.results[i][0].transcript;
            else 途中 += e.results[i][0].transcript;
        }
        if (途中) showWakeHeard(途中);
        if (確定.trim()) {
            押して聞くのをやめる();
            // 押して話したものは、呼び名なしでそのまま指示として受け取る
            runWakeCommand(確定.trim());
        }
    };

    一回だけの認識.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') {
            押して聞くのをやめる();
            return;
        }
        if (e.error === 'not-allowed') {
            showNotification('マイクが許可されていません。アドレス欄左のアイコンから許可してください', 'error');
        }
        押して聞くのをやめる();
    };

    一回だけの認識.onend = () => {
        押して聞くのをやめる();
    };

    try {
        一回だけの認識.start();
    } catch {
        一回だけの認識 = null;
    }
}

/**
 * マイクを切る。
 * 二重に呼ばれても問題ないようにしてある。
 */
function 押して聞くのをやめる() {
    clearTimeout(無音タイマー);
    if (一回だけの認識) {
        一回だけの認識.onend = null;
        try {
            一回だけの認識.stop();
        } catch {
            /* 停止済みなら無視 */
        }
        一回だけの認識 = null;
    }
    if (!wakeActive) document.body.classList.remove('wake-listening');
    renderWakeStatus();
}

/**
 * 音声が使えない理由を、そのまま分かる言葉で伝える。
 */
function 音声が使えない理由を伝える(support) {
    if (!window.isSecureContext) {
        showNotification(
            'この接続（' + location.host + '）ではマイクを使えません。'
            + 'ブラウザの決まりで、127.0.0.1 か https:// でないと使えません。',
            'error'
        );
        return;
    }
    showNotification(
        support.isIOS
            ? 'この端末のブラウザは音声認識に対応していません。文字での指示はそのまま使えます。'
            : 'このブラウザは音声認識に対応していません（Chrome推奨）',
        'error'
    );
}

window.一度だけ聞く = 一度だけ聞く;
window.押して聞くのをやめる = 押して聞くのをやめる;
window.マイクが入っているか = マイクが入っているか;
window.getWakeMode = getWakeMode;
window.setWakeMode = setWakeMode;
