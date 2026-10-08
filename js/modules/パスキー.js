/**
 * 指紋・Face ID でアプリを開く（パスキー / WebAuthn）
 *
 * 端末の安全な領域が本人確認（Touch ID / Face ID）をして署名を作り、
 * サーバー（server/アカウント.js）がその署名を確かめる。
 * 指紋や顔の情報は端末の外に出ない。サーバーが預かるのは公開鍵だけ。
 *
 * 使えない場合（ここでは何も壊さず、パスワードのログインに任せる）:
 *   ・アドレスが 127.0.0.1 などのIPアドレス → localhost で開く必要がある
 *   ・http の他の端末（LAN/Tailscaleのhttp）→ https でないとブラウザが許さない
 *   ・指紋・Face IDを持たない端末
 */

const パスキーの目印 = 'areglm_passkey_id';   // この端末で登録した鍵の名札（端末ごと。同期しない）

const 変換 = {
    送る: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    戻す: (文) => {
        const b = atob(文.replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from(b, (c) => c.charCodeAt(0));
    },
};


/**
 * この端末の本人確認の呼び名（表示のためだけ）。
 * 実際にどの方式が出るかは端末のOSが決める。ブラウザからは
 * 「指紋か顔か」までは分からないので、機種の種類から推し量った名前を出す。
 */
function この端末の認証名() {
    const ua = navigator.userAgent || '';
    const タッチ点 = navigator.maxTouchPoints || 0;
    if (/iPhone/.test(ua)) return 'Face ID';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && タッチ点 > 1)) return 'Touch ID / Face ID';   // iPadOSはMac名義で来ることがある
    if (/Macintosh|Mac OS X/.test(ua)) return 'Touch ID';
    if (/Windows/.test(ua)) return 'Windows Hello';
    if (/Android/.test(ua)) return '指紋 / 顔認証';
    return '生体認証';
}

/** この端末に、指紋・顔などの本人確認の仕組みがあるか（無い端末には登録を勧めない） */
async function この端末に生体認証があるか() {
    try {
        return !!(window.PublicKeyCredential
            && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
        return false;
    }
}

/** この画面で、指紋・Face IDが使えるか。使えないなら、その理由も返す。 */
function パスキーが使えるか() {
    if (!window.PublicKeyCredential || !navigator.credentials) {
        return { ok: false, 訳: 'このブラウザは指紋・Face IDに対応していません' };
    }
    const 名 = location.hostname;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(名) || 名.includes(':')) {
        return { ok: false, 訳: 'IPアドレスでは使えません。http://localhost:' + (location.port || 80) + ' で開いてください' };
    }
    if (!window.isSecureContext) {
        return { ok: false, 訳: '暗号化されていない接続では使えません。https のアドレス（またはlocalhost）で開いてください' };
    }
    return { ok: true };
}

async function パスキー用API(パス, 本文, 入場券) {
    const h = { 'Content-Type': 'application/json' };
    if (入場券) h.Authorization = 'Bearer ' + 入場券;
    const res = await fetch(パス, { method: 'POST', headers: h, body: JSON.stringify(本文 || {}) });
    return res.json();
}

/** この端末を登録する（パスワードでログイン済みのときだけ） */
async function この端末のパスキーを登録する() {
    const 使える = パスキーが使えるか();
    if (!使える.ok) return 使える;
    const 券 = sessionStorage.getItem('areglm_account_ticket');
    if (!券) return { ok: false, 訳: 'ログインし直してください' };

    const お題 = await パスキー用API('/api/passkey/register/options', {}, 券);
    if (!お題.ok) return お題;

    let 結果;
    try {
        結果 = await navigator.credentials.create({
            publicKey: {
                challenge: 変換.戻す(お題.お題),
                rp: { name: 'ARELM', id: location.hostname },
                user: {
                    id: new TextEncoder().encode('arelm-owner'),
                    name: localStorage.getItem('username') || 'owner',
                    displayName: localStorage.getItem('username') || 'owner',
                },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',   // この端末のTouch ID / Face ID
                    userVerification: 'required',          // 指紋・顔の確認を必須にする
                    residentKey: 'preferred',
                },
                attestation: 'none',
                timeout: 60000,
            },
        });
    } catch (e) {
        return { ok: false, やめた: e && e.name === 'NotAllowedError', 訳: e && e.name === 'NotAllowedError' ? '登録をやめました（または時間切れです）' : '登録できませんでした: ' + (e && e.message) };
    }

    const r = 結果.response;
    if (!r.getPublicKey || !r.getAuthenticatorData) {
        return { ok: false, 訳: 'このブラウザでは、鍵の情報を取り出せません。新しいバージョンのChrome/Safariをお使いください' };
    }
    const 端末名 = (navigator.userAgentData?.platform || navigator.platform || '端末') + ' / ' + location.hostname;
    const 返事 = await パスキー用API('/api/passkey/register/verify', {
        id: 結果.id,
        clientDataJSON: 変換.送る(r.clientDataJSON),
        authenticatorData: 変換.送る(r.getAuthenticatorData()),
        publicKey: 変換.送る(r.getPublicKey()),
        名前: 端末名,
    }, 券);
    if (返事.ok) localStorage.setItem(パスキーの目印, 結果.id);
    return 返事;
}

/** 指紋・Face IDでログインする。成功したら入場券などを返す。 */
async function パスキーでログインする() {
    const 使える = パスキーが使えるか();
    if (!使える.ok) return 使える;
    const id = localStorage.getItem(パスキーの目印);
    if (!id) return { ok: false, 訳: 'この端末はまだ登録されていません' };

    const お題 = await パスキー用API('/api/passkey/login/options', { id });
    if (!お題.ok) return お題;

    let 結果;
    try {
        結果 = await navigator.credentials.get({
            publicKey: {
                challenge: 変換.戻す(お題.お題),
                rpId: location.hostname,
                allowCredentials: [{ type: 'public-key', id: 変換.戻す(id) }],
                userVerification: 'required',
                timeout: 60000,
            },
        });
    } catch (e) {
        return { ok: false, やめた: true, 訳: e && e.name === 'NotAllowedError' ? '' : '指紋・Face IDを使えませんでした: ' + (e && e.message) };
    }
    const r = 結果.response;
    return パスキー用API('/api/passkey/login/verify', {
        id: 結果.id,
        clientDataJSON: 変換.送る(r.clientDataJSON),
        authenticatorData: 変換.送る(r.authenticatorData),
        signature: 変換.送る(r.signature),
    });
}

let ログイン画面のパスキーを試す = null;

/** ログイン画面の「指紋・Face IDで開く」ボタンを整える */
function ログイン画面のパスキーを整える(ログインできたとき) {
    const ボタン = document.getElementById('passkey-login-btn');
    if (!ボタン) return;
    const 登録済み = !!localStorage.getItem(パスキーの目印);
    ボタン.hidden = !(登録済み && パスキーが使えるか().ok);
    if (ボタン.hidden) return;
    ボタン.textContent = `🔐 ${この端末の認証名()} で開く`;

    if (!ログイン画面のパスキーを試す) {
        let 試し中 = false;
        ログイン画面のパスキーを試す = async (自動) => {
            if (試し中) return;
            試し中 = true;
            const r = await パスキーでログインする().catch(() => ({ ok: false, 訳: '' }));
            試し中 = false;
            if (r.ok) return ログインできたとき(r);
            // 自動で出した確認をやめたときは、黙ってパスワード欄に任せる
            if (!r.やめた || !自動) {
                if (r.訳) showNotification(r.訳, 'error');
            }
        };
        ボタン.addEventListener('click', () => ログイン画面のパスキーを試す(false));
    }
    // アプリを開いた瞬間に、そのまま本人確認を求める（すでにログイン中なら求めない）
    if (document.getElementById('main-app')?.style.display === 'none') ログイン画面のパスキーを試す(true);
}

/** 放置でログアウトされてログイン画面に戻ったとき、もう一度自動で求める */
function パスキーをもう一度求める() {
    if (ログイン画面のパスキーを試す && !document.getElementById('passkey-login-btn')?.hidden) {
        setTimeout(() => ログイン画面のパスキーを試す(true), 300);
    }
}

/**
 * パスワードでログインした直後に、この端末の登録を案内する。
 * 次からは打たずに開ける。一度「あとで」を選んだ端末には、
 * 毎回は出さない（設定画面からいつでも登録できる）。
 */
async function パスキー登録を案内する() {
    if (!パスキーが使えるか().ok) return;
    if (localStorage.getItem(パスキーの目印)) return;
    if (localStorage.getItem('areglm_passkey_offer_later') === '1') return;
    if (!(await この端末に生体認証があるか())) return;
    if (document.getElementById('passkey-offer')) return;

    const 名 = この端末の認証名();
    const 枠 = document.createElement('div');
    枠.id = 'passkey-offer';
    枠.setAttribute('role', 'dialog');
    枠.style.cssText = 'position:fixed;left:12px;right:12px;bottom:16px;z-index:10000;max-width:420px;margin:0 auto;'
        + 'background:#fff;color:#111;border-radius:12px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,.3)';
    const 文 = document.createElement('p');
    文.style.margin = '0 0 10px';
    文.textContent = `この端末では、次から ${名} で開けるようにしますか？（ユーザー名・パスワードを打たずに済みます）`;
    const 並び = document.createElement('div');
    並び.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const あとで = document.createElement('button');
    あとで.type = 'button';
    あとで.className = 'btn btn-sm btn-secondary';
    あとで.textContent = 'あとで';
    あとで.addEventListener('click', () => {
        localStorage.setItem('areglm_passkey_offer_later', '1');
        枠.remove();
    });
    const 登録 = document.createElement('button');
    登録.type = 'button';
    登録.className = 'btn btn-sm btn-primary';
    登録.textContent = `${名} を登録する`;
    登録.addEventListener('click', async () => {
        登録.disabled = true;
        const r = await この端末のパスキーを登録する();
        showNotification(r.訳 || '', r.ok ? 'success' : 'error');
        if (r.ok || !r.やめた) 枠.remove(); else 登録.disabled = false;
    });
    並び.append(あとで, 登録);
    枠.append(文, 並び);
    document.body.appendChild(枠);
}

window.パスキーが使えるか = パスキーが使えるか;
window.この端末のパスキーを登録する = この端末のパスキーを登録する;
window.パスキーでログインする = パスキーでログインする;
window.ログイン画面のパスキーを整える = ログイン画面のパスキーを整える;
window.パスキーをもう一度求める = パスキーをもう一度求める;
window.パスキー登録を案内する = パスキー登録を案内する;
window.この端末の認証名 = この端末の認証名;
window.この端末に生体認証があるか = この端末に生体認証があるか;
window.パスキーの目印 = パスキーの目印;
