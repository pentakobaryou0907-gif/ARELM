/**
 * アカウント画面（設定ページ）
 *
 * 本人1人用のログイン。ここでできるのはパスワードの変更だけ。
 * アカウント自体はサーバー側（server/アカウント.js）にあり、
 * ここは画面だけ。外部へは何も送らない。
 */

function 入場券ヘッダ() {
    const 券 = sessionStorage.getItem('areglm_account_ticket');
    return 券 ? { Authorization: 'Bearer ' + 券, 'Content-Type': 'application/json' } : null;
}

async function アカウントAPI(パス, 本文, 再試行済み) {
    let h = 入場券ヘッダ();
    if (!h && !再試行済み) {
        const もらった = typeof ログインなしの入場券を取り直す === 'function' ? await ログインなしの入場券を取り直す() : null;
        if (もらった) { 入場券を覚える(もらった); return アカウントAPI(パス, 本文, true); }
    }
    if (!h) return { ok: false, 訳: 'ログインし直してください（入場券が切れています）' };
    try {
        const res = await fetch(パス, {
            method: 本文 ? 'POST' : 'GET',
            headers: h,
            body: 本文 ? JSON.stringify(本文) : undefined,
        });
        // サーバーを再起動すると入場券が無くなる。ログインなしなら、取り直して一度だけやり直す
        if (res.status === 401 && !再試行済み && typeof ログインなしの入場券を取り直す === 'function') {
            const もらった = await ログインなしの入場券を取り直す();
            if (もらった) { 入場券を覚える(もらった); return アカウントAPI(パス, 本文, true); }
        }
        return await res.json();
    } catch {
        return { ok: false, 訳: 'サーバーに繋がりませんでした' };
    }
}

function 行を作る(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function 入力欄(ラベル, 型, id) {
    const 枠 = document.createElement('div');
    枠.className = 'form-group';
    const l = 行を作る('label', ラベル);
    l.htmlFor = id;
    const i = document.createElement('input');
    i.type = 型;
    i.id = id;
    i.autocomplete = 型 === 'password' ? 'new-password' : 'off';
    枠.append(l, i);
    return 枠;
}

async function renderアカウント() {
    const 箱 = document.getElementById('account-panel');
    if (!箱) return;
    箱.textContent = '';

    const p = document.createElement('form');
    p.className = 'login-form';
    p.append(
        行を作る('h4', '自分のパスワードを変える'),
        入力欄('今のパスワード', 'password', 'acct-old-pass'),
        入力欄('新しいパスワード（10文字以上）', 'password', 'acct-chg-pass'),
    );
    const pb = 行を作る('button', 'パスワードを変える', 'btn btn-secondary');
    pb.type = 'submit';
    p.appendChild(pb);
    p.addEventListener('submit', async (e) => {
        e.preventDefault();
        const 結果 = await アカウントAPI('/api/account/password', {
            今の: document.getElementById('acct-old-pass').value,
            新しい: document.getElementById('acct-chg-pass').value,
        });
        showNotification(結果.訳 || '', 結果.ok ? 'success' : 'error');
        if (結果.ok) p.reset();
    });
    箱.appendChild(p);

    await ログインなしの欄を描く(箱);
    await 表示の欄を描く(箱);
    await パスキーの欄を描く(箱);
}

/* --- ログインなしで使う（このMac本体のブラウザだけ） --- */
async function ログインなしの欄を描く(箱) {
    const 枠 = document.createElement('div');
    枠.className = 'login-form';
    枠.appendChild(行を作る('h4', 'ログインなしで使う（このMacだけ）'));
    const s = await fetch('/api/account/status', { cache: 'no-store' }).then((y) => y.json()).catch(() => ({}));
    枠.appendChild(行を作る('p',
        'オンの間、このMacのブラウザ・アプリでは、ユーザー名とパスワードなしで開きます。'
        + 'Windows PCなど他の端末は、これまでどおり合言葉とログインが必要です。', 'hint'));
    if (s.ログインなし) {
        枠.appendChild(行を作る('p', '現在: オン（このMacではログイン不要）', 'guard-off'));
        枠.appendChild(行を作る('p', 'やめると、次からユーザー名とパスワードが必要です。忘れているときは、先に新しく作り直してください。', 'hint'));
        const b = 行を作る('button', 'ログインなしをやめる', 'btn btn-primary');
        b.type = 'button';
        b.addEventListener('click', async () => {
            if (!confirm('ログインなしをやめます。次からは、ユーザー名とパスワードが必要です。\nパスワードを覚えていますか？')) return;
            const r = await アカウントAPI('/api/account/nologin/set', { 有効: false });
            showNotification(r.訳 || '', r.ok ? 'success' : 'error');
            renderアカウント();
        });
        枠.appendChild(b);
    } else {
        枠.appendChild(行を作る('p', '現在: オフ', 'guard-on'));
        枠.appendChild(入力欄('いまのパスワード（オンにするときに確かめます）', 'password', 'acct-nologin-pass'));
        const b = 行を作る('button', 'ログインなしにする', 'btn btn-secondary');
        b.type = 'button';
        b.addEventListener('click', async () => {
            const r = await アカウントAPI('/api/account/nologin/set', { 有効: true, パスワード: document.getElementById('acct-nologin-pass').value });
            showNotification(r.訳 || '', r.ok ? 'success' : 'error');
            renderアカウント();
        });
        枠.appendChild(b);
    }
    箱.appendChild(枠);
}

/* --- ログイン画面にユーザー名とパスワードを表示する（本人が選んだときだけ） --- */
async function 表示の欄を描く(箱) {
    const 枠 = document.createElement('div');
    枠.className = 'login-form';
    枠.appendChild(行を作る('h4', 'ログイン画面に、パスワードを表示する'));

    const 今 = await fetch('/api/account/hint', { cache: 'no-store' }).then((y) => y.json()).catch(() => ({ 表示: false }));
    枠.appendChild(行を作る('p',
        '自分しか画面を見ない場合だけ使ってください。オンにすると、ログイン画面（このMacと、合言葉を通った他の端末）に、'
        + 'ユーザー名とパスワードがそのまま表示され、欄にも自動で入ります。画面を開ける人には誰にでも見えます。', 'hint'));
    枠.appendChild(行を作る('p', 今.表示 ? '現在: 表示しています' : '現在: 表示していません（おすすめの状態）', 今.表示 ? 'guard-off' : 'guard-on'));

    if (!今.表示) {
        枠.appendChild(入力欄('いまのパスワード（保存して表示します）', 'password', 'acct-hint-pass'));
        const b = 行を作る('button', 'ログイン画面に表示する', 'btn btn-secondary');
        b.type = 'button';
        b.addEventListener('click', async () => {
            const r = await アカウントAPI('/api/account/hint', { 表示: true, パスワード: document.getElementById('acct-hint-pass').value });
            showNotification(r.訳 || '', r.ok ? 'success' : 'error');
            renderアカウント();
        });
        枠.appendChild(b);
    } else {
        const b = 行を作る('button', '表示をやめる', 'btn btn-primary');
        b.type = 'button';
        b.addEventListener('click', async () => {
            const r = await アカウントAPI('/api/account/hint', { 表示: false });
            showNotification(r.訳 || '', r.ok ? 'success' : 'error');
            renderアカウント();
        });
        枠.appendChild(b);
    }
    箱.appendChild(枠);
}

/* --- 指紋・Face ID --- */
async function パスキーの欄を描く(箱) {
    const 枠 = document.createElement('div');
    枠.className = 'login-form';
    枠.appendChild(行を作る('h4', `${この端末の認証名()} で開く`));
    箱.appendChild(枠);

    const 使える = typeof パスキーが使えるか === 'function' ? パスキーが使えるか() : { ok: false, 訳: '読み込めませんでした' };
    const 今の端末 = localStorage.getItem('areglm_passkey_id');

    const 一覧 = await アカウントAPI('/api/passkey/list');
    const 登録 = (一覧.ok ? 一覧.一覧 : []);

    if (登録.length) {
        const ul = document.createElement('ul');
        ul.className = 'monitor-list';
        登録.forEach((k) => {
            const li = document.createElement('li');
            li.className = 'monitor-item';
            const 文 = `${k.名前}${k.id === 今の端末 ? '（この端末）' : ''} — 登録 ${new Date(k.作った日).toLocaleDateString('ja-JP')}`;
            li.appendChild(document.createTextNode(文 + ' '));
            const 外す = 行を作る('button', '外す', 'btn btn-sm btn-secondary');
            外す.type = 'button';
            外す.addEventListener('click', async () => {
                if (!confirm('この端末の指紋・Face IDでの入場を外します。パスワードでは今まで通り入れます。よろしいですか？')) return;
                const r = await アカウントAPI('/api/passkey/remove', { id: k.id });
                if (r.ok && k.id === 今の端末) localStorage.removeItem('areglm_passkey_id');
                showNotification(r.訳 || '', r.ok ? 'success' : 'error');
                renderアカウント();
            });
            li.appendChild(外す);
            ul.appendChild(li);
        });
        枠.appendChild(ul);
    } else {
        枠.appendChild(行を作る('p', 'まだ登録した端末はありません。', 'hint'));
    }

    if (!使える.ok) {
        枠.appendChild(行を作る('p', 'この画面では登録できません: ' + 使える.訳, 'hint'));
        return;
    }
    if (!(await この端末に生体認証があるか())) {
        枠.appendChild(行を作る('p', 'この端末には指紋・顔などの本人確認の仕組みが見つかりません（パスワードでご利用ください）', 'hint'));
        return;
    }
    const 登録済み = 今の端末 && 登録.some((k) => k.id === 今の端末);
    if (!登録済み) {
        const b = 行を作る('button', `この端末の ${この端末の認証名()} を登録する`, 'btn btn-primary');
        b.type = 'button';
        b.addEventListener('click', async () => {
            b.disabled = true;
            const r = await この端末のパスキーを登録する();
            showNotification(r.訳 || '', r.ok ? 'success' : 'error');
            renderアカウント();
        });
        枠.appendChild(b);
    }
    枠.appendChild(行を作る('p', '登録しても、パスワードでのログインは今まで通り使えます。端末ごとに登録してください。', 'hint'));
}

function initアカウント() {
    if (document.getElementById('account-panel')) renderアカウント();
}

window.initアカウント = initアカウント;
window.renderアカウント = renderアカウント;
