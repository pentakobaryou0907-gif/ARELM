/**
 * 守り（この端末で本人か確かめる／覗かれないようにする）
 *
 * なぜこれが要るのか:
 *   このツールには、原価・取引先・売上が入っている。
 *   持ち出されたら困るものばかりなのに、
 *   開けば誰でも中身が見られる状態だった。
 *
 * ここでやること:
 *
 *   1. 端末ごとの本人確認
 *      いつも使う端末を覚えておき、
 *      覚えのない端末で開かれたときだけ合言葉を聞く。
 *      毎回聞くと、自分が使うときに邪魔になるため。
 *
 *   2. 目隠し
 *      席を外したとき、人が近づいたときに、
 *      金額や取引先をすぐ隠せるようにする。
 *
 * 正直に書いておきます:
 *
 *   ・合言葉は、そのままでは保存していません。
 *     繰り返し混ぜて別の形に変えたものだけを残します。
 *     ただし、これはブラウザに元から入っている仕組み（Web Crypto）を
 *     使っています。混ぜ方を一から作ってはいません。
 *     暗号を自作すると、たいてい弱くなるためです。
 *
 *   ・これは「持ち出しを止める鍵」ではありません。
 *     端末の中身を直接見られたら防げません。
 *     人が覗くのを防ぐためのもの、と考えてください。
 *     防げないことを防げるとは言いません。
 *
 * すべてこの端末の中だけで動きます。外部へは一切送りません。
 */

const 守りの鍵 = 'areglm_guard';
const 目隠しの鍵 = 'areglm_blind';

/** 何も操作しないまま、これだけ経ったら目隠しする（分） */
const はじめの放置分 = 5;

function 守りを読む() {
    try {
        return Object.assign({
            合言葉: null,        // {塩, 混ぜたもの, 回数}
            覚えた端末: [],      // [{印, 名前, 覚えた日}]
            使う: false,
        }, JSON.parse(localStorage.getItem(守りの鍵) || '{}'));
    } catch {
        return { 合言葉: null, 覚えた端末: [], 使う: false };
    }
}

function 守りを書く(中身) {
    localStorage.setItem(守りの鍵, JSON.stringify(中身));
}

/* ---------- 端末を見分ける ---------- */

/**
 * この端末の印を作る。
 *
 * 端末そのものから作れる手がかり（画面の大きさ、時間帯、
 * 使っているブラウザなど）を混ぜて、一つの文字列にする。
 *
 * これは「厳密な身分証」ではありません。
 * 同じ機種・同じ設定なら、たまたま一致することがあります。
 * 覚えのない端末を見分ける目安、という程度のものです。
 */
async function この端末の印() {
    const 手がかり = [
        navigator.userAgent,
        navigator.language,
        navigator.hardwareConcurrency || '',
        screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.platform || '',
    ].join('｜');

    return 混ぜる(手がかり, 'areglm-device', 1000);
}

/**
 * 文字列を、元に戻せない形に混ぜる。
 *
 * ブラウザに元から入っている仕組みを使っています。
 * 何度も混ぜ直すのは、総当たりで当てにくくするためです。
 */
async function 混ぜる(文, 塩, 回数) {
    if (!(window.crypto && crypto.subtle)) {
        // 使えない場での逃げ道。弱いので、そのことを設定画面に出す。
        let h = 0;
        const 全 = 文 + '｜' + 塩;
        for (let i = 0; i < 全.length; i++) {
            h = ((h << 5) - h + 全.charCodeAt(i)) | 0;
        }
        return 'よわい:' + (h >>> 0).toString(16);
    }

    const 元 = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(文), 'PBKDF2', false, ['deriveBits']);

    const 混 = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: new TextEncoder().encode(塩),
        iterations: 回数,
        hash: 'SHA-256',
    }, 元, 256);

    return [...new Uint8Array(混)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function 塩を作る() {
    const a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues
        ? crypto.getRandomValues(a)
        : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- 合言葉 ---------- */

async function 合言葉を決める(言葉) {
    言葉 = (言葉 || '').trim();
    if (言葉.length < 4) {
        return { ok: false, 訳: '短すぎます。4文字以上にしてください。' };
    }

    const 塩 = 塩を作る();
    const 混 = await 混ぜる(言葉, 塩, 120000);

    const 守 = 守りを読む();
    守.合言葉 = { 塩, 混ぜたもの: 混, 回数: 120000 };
    守.使う = true;

    // いま使っている端末は、決めた時点で覚えておく。
    // そうしないと、決めた直後に自分が締め出される。
    const 印 = await この端末の印();
    if (!守.覚えた端末.some((d) => d.印 === 印)) {
        守.覚えた端末.push({ 印, 名前: この端末の呼び名(), 覚えた日: new Date().toISOString() });
    }

    守りを書く(守);
    return { ok: true, 訳: '合言葉を決めました。覚えのない端末で開いたときだけ聞きます。' };
}

async function 合言葉が合うか(言葉) {
    const 守 = 守りを読む();
    if (!守.合言葉) return true;
    const 混 = await 混ぜる((言葉 || '').trim(), 守.合言葉.塩, 守.合言葉.回数 || 120000);
    return 混 === 守.合言葉.混ぜたもの;
}

function この端末の呼び名() {
    const u = navigator.userAgent;
    if (/iPhone/.test(u)) return 'iPhone';
    if (/iPad/.test(u)) return 'iPad';
    if (/Mac/.test(u)) return 'Mac';
    if (/Android/.test(u)) return 'Android';
    if (/Windows/.test(u)) return 'Windows';
    return 'この端末';
}

/**
 * この端末が覚えられているか確かめる。
 *
 * 覚えられていなければ合言葉を聞き、
 * 合っていれば、その端末も覚える。
 *
 * @returns {Promise<boolean>} 使ってよいか
 */
/**
 * サーバーが、もう本人の端末と認めているか。
 *
 * 次の二つは、本人が自分で選んだ信頼で、サーバー側で確かめてある（この画面の合言葉より強い）:
 *   ・Macで「ログインも省く」を選んで許した端末
 *   ・Mac本体のブラウザで、「ログインなしで使う」を選んでいるとき
 * この二つなら、ここで合言葉をもう一度聞かない。
 * 聞いていたころは、合言葉を覚えていない本人が、新しい端末（iPadのアイコン・Windows）を開くたびに
 * 答えられず、画面が隠れていた（この設定は、端末間で同期されるため、全端末に効く）。
 * それ以外の端末（合言葉だけで入った端末など）は、これまでどおり聞く。
 */
async function サーバーが本人と認めた端末か() {
    try {
        const r = await fetch('/api/account/status', { cache: 'no-store' });
        if (!r.ok) return false;
        const s = await r.json();
        return s.ログインなし === true || s.端末でログイン省略 === true;
    } catch { return false; }
}

async function この端末を確かめる() {
    const 守 = 守りを読む();
    if (!守.使う || !守.合言葉) return true;

    const 印 = await この端末の印();
    if (守.覚えた端末.some((d) => d.印 === 印)) return true;

    if (await サーバーが本人と認めた端末か()) {
        守.覚えた端末.push({ 印, 名前: この端末の呼び名(), 覚えた日: new Date().toISOString(), 経路: 'サーバーが認めた端末' });
        守りを書く(守);
        return true;
    }

    // 入力欄が出せない環境（一部の埋め込みブラウザ等）では、聞けないので、確かめられなかったことにする
    let 言葉;
    try {
        言葉 = window.prompt(
            '覚えのない端末です。\n合言葉を入れてください。\n\n'
            + '（合っていれば、この端末を覚えます。次からは聞きません）');
    } catch { return false; }

    if (言葉 === null) return false;

    if (!await 合言葉が合うか(言葉)) {
        showNotification('合言葉が違います', 'error');
        return false;
    }

    守.覚えた端末.push({ 印, 名前: この端末の呼び名(), 覚えた日: new Date().toISOString() });
    守りを書く(守);
    showNotification('この端末を覚えました。次からは聞きません。', 'success');
    return true;
}

/* ---------- 目隠し ---------- */

let 放置の見張り = null;

/**
 * いま隠しているか。
 *
 * 別の印を持たず、実際に覆いがあるかで判断する。
 * 印だけ持っていたところ、覆いが外から取り除かれたときに
 * 「まだ隠している」と思い込み、二度と隠せなくなっていた。
 * 画面の本当の姿を見るほうが、ずれない。
 */
function 目隠し中か() {
    return !!document.getElementById('blind-cover');
}

function 目隠しの設定を読む() {
    try {
        return Object.assign({ 使う: false, 放置分: はじめの放置分, 席を外したら: true },
            JSON.parse(localStorage.getItem(目隠しの鍵) || '{}'));
    } catch {
        return { 使う: false, 放置分: はじめの放置分, 席を外したら: true };
    }
}

function 目隠しの設定を書く(中身) {
    localStorage.setItem(目隠しの鍵, JSON.stringify(中身));
}

/**
 * 目隠しをかける。
 *
 * 画面を消すのではなく、上に覆いをかける。
 * 消してしまうと、書きかけのものが失われることがあるため。
 */
function 目隠しをかける(訳) {
    if (目隠し中か()) return;

    const 覆い = document.createElement('div');
    覆い.id = 'blind-cover';
    覆い.className = 'blind-cover';
    覆い.innerHTML = '';

    const 中 = document.createElement('div');
    中.className = 'blind-inner';

    const 印 = document.createElement('div');
    印.className = 'blind-mark';
    印.textContent = '🙈';

    const 題 = document.createElement('b');
    題.textContent = '目隠し中';

    const 説 = document.createElement('small');
    説.textContent = 訳 || '中身を隠しています。書きかけのものはそのまま残っています。';

    const 戻す = document.createElement('button');
    戻す.type = 'button';
    戻す.className = 'btn btn-primary';
    戻す.textContent = '表示に戻す';
    戻す.addEventListener('click', () => 目隠しを外す());

    中.appendChild(印);
    中.appendChild(題);
    中.appendChild(説);
    中.appendChild(戻す);
    覆い.appendChild(中);
    document.body.appendChild(覆い);
    戻す.focus();
}

async function 目隠しを外す() {
    const 守 = 守りを読む();

    // 合言葉を決めてあるなら、外すときにも聞く。
    // 決めていないなら聞かない。決めていないのに聞いたら、
    // 自分で開けられなくなってしまう。
    if (守.使う && 守.合言葉) {
        const 言葉 = window.prompt('合言葉を入れてください');
        if (言葉 === null) return;
        if (!await 合言葉が合うか(言葉)) {
            showNotification('合言葉が違います', 'error');
            return;
        }
    }

    document.getElementById('blind-cover')?.remove();
    放置を数え直す();
}

function 放置を数え直す() {
    clearTimeout(放置の見張り);
    const 設定 = 目隠しの設定を読む();
    if (!設定.使う || 目隠し中か()) return;

    放置の見張り = setTimeout(
        () => 目隠しをかける(`${設定.放置分}分ほど操作がなかったので隠しました。`),
        Math.max(1, 設定.放置分) * 60 * 1000);
}

function 目隠しを見張り始める() {
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach((名) => {
        document.addEventListener(名, 放置を数え直す, { passive: true });
    });

    // 別の画面へ移ったときも隠す。
    // 席を外すときは、たいてい別のものに切り替える。
    document.addEventListener('visibilitychange', () => {
        const 設定 = 目隠しの設定を読む();
        if (設定.使う && 設定.席を外したら && document.hidden) {
            目隠しをかける('別の画面へ移ったので隠しました。');
        }
    });

    // すぐ隠したいときのため。Escを2回続けて押す。
    // 1回だと、他の場面で押したときにも隠れてしまう。
    let 前のEsc = 0;
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const いま = Date.now();
        if (いま - 前のEsc < 600) {
            目隠しをかける('すぐ隠す操作を受け取りました。');
            前のEsc = 0;
        } else {
            前のEsc = いま;
        }
    });

    放置を数え直す();
}

/* ---------- 設定画面 ---------- */

function render守り() {
    const 箱 = document.getElementById('guard-ui');
    if (!箱) return;

    const 守 = 守りを読む();
    const 目 = 目隠しの設定を読む();
    箱.innerHTML = '';

    /* --- 本人確認 --- */
    const 見出し1 = document.createElement('h4');
    見出し1.className = 'rule-head';
    見出し1.textContent = '覚えのない端末で開かれたら、合言葉を聞く';
    箱.appendChild(見出し1);

    const 説明1 = document.createElement('p');
    説明1.className = 'hint';
    説明1.textContent = 'いつも使う端末は覚えておき、そこでは聞きません。'
        + '覚えのない端末で開かれたときだけ聞きます。'
        + '合言葉はそのままでは保存せず、元に戻せない形に変えて残します。';
    箱.appendChild(説明1);

    const 状態 = document.createElement('p');
    状態.className = 守.合言葉 ? 'guard-on' : 'guard-off';
    状態.textContent = 守.合言葉
        ? `決めてあります（覚えた端末 ${守.覚えた端末.length}台）`
        : 'まだ決めていません（誰でも開けます）';
    箱.appendChild(状態);

    const 行1 = document.createElement('div');
    行1.className = 'guard-row';

    const 入力 = document.createElement('input');
    入力.type = 'password';
    入力.placeholder = 守.合言葉 ? '新しい合言葉' : '合言葉（4文字以上）';
    入力.autocomplete = 'new-password';

    const 決める = document.createElement('button');
    決める.type = 'button';
    決める.className = 'btn btn-sm btn-primary';
    決める.textContent = 守.合言葉 ? '変える' : '決める';
    決める.addEventListener('click', async () => {
        決める.disabled = true;
        決める.textContent = '作っています…';
        const r = await 合言葉を決める(入力.value);
        showNotification(r.訳, r.ok ? 'success' : 'error');
        入力.value = '';
        render守り();
    });

    入力.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); 決める.click(); }
    });

    行1.appendChild(入力);
    行1.appendChild(決める);
    箱.appendChild(行1);

    if (守.覚えた端末.length) {
        const 一覧 = document.createElement('ul');
        一覧.className = 'guard-devices';
        守.覚えた端末.forEach((d, i) => {
            const li = document.createElement('li');
            const 名 = document.createElement('span');
            名.textContent = `${d.名前}（${(d.覚えた日 || '').slice(0, 10)}）`;
            li.appendChild(名);

            const 忘れる = document.createElement('button');
            忘れる.type = 'button';
            忘れる.className = 'btn btn-sm btn-secondary';
            忘れる.textContent = 'この端末を忘れる';
            忘れる.addEventListener('click', () => {
                const s = 守りを読む();
                s.覚えた端末.splice(i, 1);
                守りを書く(s);
                render守り();
                showNotification('忘れました。次はその端末で合言葉を聞きます。', 'success');
            });
            li.appendChild(忘れる);
            一覧.appendChild(li);
        });
        箱.appendChild(一覧);
    }

    if (!(window.crypto && crypto.subtle)) {
        const 弱い = document.createElement('p');
        弱い.className = 'notice-strict';
        弱い.textContent = 'この場では、合言葉を安全に変換する仕組みが使えません。'
            + '弱い方法で代用しているので、大事な合言葉は使わないでください。'
            + '（https:// か 127.0.0.1 で開くと、本来の方法が使えます）';
        箱.appendChild(弱い);
    }

    /* --- 目隠し --- */
    const 見出し2 = document.createElement('h4');
    見出し2.className = 'rule-head';
    見出し2.textContent = '覗かれないように隠す';
    箱.appendChild(見出し2);

    const 説明2 = document.createElement('p');
    説明2.className = 'hint';
    説明2.innerHTML = '席を外したときや、人が近づいたときに中身を隠します。'
        + '<b>Escを2回続けて押すと、その場ですぐ隠れます。</b><br>'
        + '正直に書きます: <b>人が近づいたことを見て自動で隠すことはできません。</b>'
        + 'それにはカメラで人を見分ける必要があり、'
        + 'この端末の中だけで確実に見分ける仕組みは作れていません。'
        + '代わりに「操作が止まったら」「別の画面へ移ったら」で隠します。';
    箱.appendChild(説明2);

    const 入切2 = document.createElement('label');
    入切2.className = 'voice-style-toggle';
    const 印2 = document.createElement('input');
    印2.type = 'checkbox';
    印2.checked = 目.使う;
    印2.addEventListener('change', () => {
        const s = 目隠しの設定を読む();
        s.使う = 印2.checked;
        目隠しの設定を書く(s);
        放置を数え直す();
        showNotification(印2.checked ? '目隠しを使います' : '目隠しを止めました', 'success');
        render守り();
    });
    入切2.appendChild(印2);
    const 文2 = document.createElement('span');
    文2.innerHTML = '<b>目隠しを使う</b><small>操作が止まったとき、別の画面へ移ったときに隠します。</small>';
    入切2.appendChild(文2);
    箱.appendChild(入切2);

    const 行2 = document.createElement('div');
    行2.className = 'guard-row';
    const ラベル = document.createElement('label');
    ラベル.textContent = '何分で隠すか';
    const 分 = document.createElement('input');
    分.type = 'number';
    分.min = 1;
    分.max = 120;
    分.value = 目.放置分;
    分.addEventListener('change', () => {
        const s = 目隠しの設定を読む();
        s.放置分 = Math.min(120, Math.max(1, Number(分.value) || はじめの放置分));
        分.value = s.放置分;
        目隠しの設定を書く(s);
        放置を数え直す();
    });
    行2.appendChild(ラベル);
    行2.appendChild(分);

    const いま隠す = document.createElement('button');
    いま隠す.type = 'button';
    いま隠す.className = 'btn btn-sm btn-secondary';
    いま隠す.textContent = '🙈 いますぐ隠す';
    いま隠す.addEventListener('click', () => 目隠しをかける('手で隠しました。'));
    行2.appendChild(いま隠す);

    箱.appendChild(行2);

    const 断り = document.createElement('p');
    断り.className = 'hint';
    断り.textContent = 'これは持ち出しを止める鍵ではありません。'
        + 'この端末の中身を直接見られたら防げません。'
        + '人が覗くのを防ぐためのもの、と考えてください。';
    箱.appendChild(断り);
}

async function init守り() {
    目隠しを見張り始める();
    render守り();

    // 覚えのない端末なら、ここで確かめる
    const よい = await この端末を確かめる();
    if (!よい) {
        目隠しをかける('確かめられなかったので隠しています。');
    }
}

window.init守り = init守り;
window.render守り = render守り;
window.目隠しをかける = 目隠しをかける;
window.この端末を確かめる = この端末を確かめる;

// 点検から呼べるようにしておく。
// 「作りました」と書くだけでなく、実際に動かして確かめるため。
window.合言葉を決める = 合言葉を決める;
window.合言葉が合うか = 合言葉が合うか;
window.目隠しを外す = 目隠しを外す;
