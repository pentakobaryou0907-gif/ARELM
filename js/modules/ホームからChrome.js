/**
 * ホームから Chrome を開く
 *
 * なぜここに置くのか:
 *
 *   Chromeを開く仕組みは、エージェントの画面にある。
 *   だが、開きたいのはたいてい作業を始めるとき。
 *   そのたびにエージェントの画面へ行くのは遠い。
 *
 *   <b>いちばん最初に見る画面から、一押しで開ける</b>ようにする。
 *
 * ただの「リンクを開く」との違い:
 *
 *   ふつうのリンクは、この画面を出しているブラウザで開く。
 *   ここで開くのは<b>あなたのChrome</b>。
 *   ログインしてあるので、SUZURI も SNS もそのまま使える。
 *
 *   開いたあとは、遠隔操作の画面から操れる。
 */

/** ホームから開ける先 */
const ホームから開く先 = [
    { 名: 'SUZURI', 道: 'https://suzuri.jp/areglm', 説: '自分の店' },
    { 名: 'BASE', 道: 'https://AReGLM.base.shop', 説: '自分の店' },
    { 名: 'Instagram', 道: 'https://www.instagram.com/', 説: '投稿を見る' },
    { 名: 'X', 道: 'https://x.com/', 説: '投稿を見る' },
];

/** いま選ばれているアカウント名（空なら「いまのChromeの窓」でそのまま開く） */
function 選んだアカウント() {
    return document.getElementById('home-chrome-account')?.value || '';
}

async function Chromeで開く(道, ボタン) {
    const 元 = ボタン ? ボタン.textContent : '';
    if (ボタン) { ボタン.disabled = true; ボタン.textContent = '開いています…'; }

    // アカウントを選んでいれば、そのプロフィールの窓で開く。
    // ログインはChrome側で済んでいるものを使うだけで、
    // パスワードにはこちらから一切触れない。
    const アカウント = 選んだアカウント();
    const 中身 = アカウント
        ? { 操作: 'プロフィールで開く', プロフィール: アカウント, 道 }
        : { 操作: '開く', 道, 新しいタブ: true };

    try {
        const r = await fetch('/api/browser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(中身),
        });
        const d = await r.json();
        showNotification(d.訳, d.ok ? 'success' : 'error');

        // 開いたら、遠隔操作の画面も新しくしておく。
        // 開いた先をすぐ操れるようにするため。
        if (d.ok && typeof renderブラウザ操作 === 'function') {
            setTimeout(renderブラウザ操作, 1200);
        }
    } catch (e) {
        showNotification('開けませんでした: ' + e.message, 'error');
    } finally {
        if (ボタン) { ボタン.disabled = false; ボタン.textContent = 元; }
    }
}

function renderホームからChrome() {
    const 箱 = document.getElementById('home-chrome');
    if (!箱) return;

    箱.innerHTML = '';

    const 説 = document.createElement('p');
    説.className = 'hint';
    説.textContent = 'あなたのChromeで開きます。'
        + 'ログインしてあるので、そのまま使えます。'
        + '開いたあとは、エージェント画面の「遠隔操作」から操れます。';
    箱.appendChild(説);

    /* --- どのアカウント（プロフィール）で開くか --- */
    const 垢行 = document.createElement('div');
    垢行.className = 'guard-row';

    const 垢名札 = document.createElement('label');
    垢名札.textContent = 'アカウント: ';
    垢名札.htmlFor = 'home-chrome-account';
    垢行.appendChild(垢名札);

    const 垢選び = document.createElement('select');
    垢選び.id = 'home-chrome-account';
    const 既定 = document.createElement('option');
    既定.value = '';
    既定.textContent = 'いま開いている窓のまま';
    垢選び.appendChild(既定);
    垢行.appendChild(垢選び);
    箱.appendChild(垢行);

    // ログイン済みのプロフィールをサーバーに聞いて足す。
    // Chromeのパスワードには触れず、既にある窓を選ぶだけ。
    fetch('/api/browser')
        .then((r) => r.json())
        .then((d) => {
            (d.プロフィール || []).forEach((名) => {
                const o = document.createElement('option');
                o.value = 名;
                o.textContent = `${名} の窓で開く`;
                垢選び.appendChild(o);
            });
        })
        .catch(() => { /* 聞けなくても、いまの窓で開く方は使える */ });

    const 並び = document.createElement('div');
    並び.className = 'remote-sns-row';

    ホームから開く先.forEach((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-accent';
        b.textContent = x.名;
        b.title = x.説 + '（Chromeで開きます）';
        b.addEventListener('click', () => Chromeで開く(x.道, b));
        並び.appendChild(b);
    });
    箱.appendChild(並び);

    /* --- 好きな場所を開く --- */
    const 行 = document.createElement('div');
    行.className = 'guard-row';

    const 入力 = document.createElement('input');
    入力.type = 'text';
    入力.id = 'home-chrome-url';
    入力.placeholder = 'https://… ここに入れても開けます';
    入力.autocomplete = 'off';
    入力.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') 押した();
    });
    行.appendChild(入力);

    const 開く = document.createElement('button');
    開く.type = 'button';
    開く.className = 'btn btn-sm btn-primary';
    開く.textContent = 'Chromeで開く';
    開く.addEventListener('click', 押した);
    行.appendChild(開く);
    箱.appendChild(行);

    function 押した() {
        const u = 入力.value.trim();
        if (!u) { showNotification('場所を入れてください', 'error'); return; }
        Chromeで開く(u, 開く);
    }
}

function initホームからChrome() {
    if (document.getElementById('home-chrome')) renderホームからChrome();
}

window.initホームからChrome = initホームからChrome;
window.renderホームからChrome = renderホームからChrome;
window.Chromeで開く = Chromeで開く;
