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

async function アカウントAPI(パス, 本文) {
    const h = 入場券ヘッダ();
    if (!h) return { ok: false, 訳: 'ログインし直してください（入場券が切れています）' };
    try {
        const res = await fetch(パス, {
            method: 本文 ? 'POST' : 'GET',
            headers: h,
            body: 本文 ? JSON.stringify(本文) : undefined,
        });
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
}

function initアカウント() {
    if (document.getElementById('account-panel')) renderアカウント();
}

window.initアカウント = initアカウント;
window.renderアカウント = renderアカウント;
