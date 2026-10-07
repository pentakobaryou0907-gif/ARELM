/**
 * アカウント — 本人だけが使うためのログイン
 *
 * なぜこれが要るのか:
 *   これまでのログインは、画面のJSに「admin / Admin@2024!」が
 *   直接書かれていて、しかもログイン画面にも表示されていた。
 *   画面を開ける人なら誰でもその場で入れる。個人の手元で試す分には
 *   よくても、会社で使える状態ではなかった。
 *
 * ここでやること:
 *   ・アカウントはサーバー側に保存する（パスワードは元に戻せない形で）
 *   ・アカウントは本人の1つだけ。最初の設定は、このMac本体からだけできる
 *     （他の端末から先に開かれて、乗っ取られないようにするため）
 *   ・パスワードを忘れたら、server/data/accounts.json を（本人が）別の場所へ
 *     移して再起動すると、最初の設定に戻る
 *   ・間違いが続いたら、しばらくその相手を締め出す
 *
 * 外部へは一切問い合わせません。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const 保存先 = process.env.ARELM_ACCOUNTS_FILE || path.join(__dirname, 'data', 'accounts.json');

const 表示の保存先 = process.env.ARELM_LOGIN_HINT_FILE || path.join(__dirname, 'data', 'ログイン表示.json');
const 混ぜる回数 = 600000;
const 許す間違い = 5;
const 締め出す分 = 15;
const 入場券の有効時間 = 4 * 60 * 60 * 1000;

const 間違い = new Map();   // 再起動で消えてよい
const 入場券 = new Map();    // 入場券の指紋 → { 名前, 役, 期限 }。再起動で消えてよい

function 読む() {
    try {
        const d = JSON.parse(fs.readFileSync(保存先, 'utf8'));
        return Array.isArray(d.人) ? d : { 人: [] };
    } catch {
        return { 人: [] };
    }
}

function 書く(中身) {
    fs.mkdirSync(path.dirname(保存先), { recursive: true });
    // 途中で止まっても壊れないよう、いったん別名で書いてから置き換える
    const 一時 = 保存先 + '.tmp';
    fs.writeFileSync(一時, JSON.stringify(中身, null, 2), { mode: 0o600 });
    fs.renameSync(一時, 保存先);
}

function 混ぜる(パスワード, 塩, 回数) {
    return crypto.pbkdf2Sync(String(パスワード), 塩, 回数, 32, 'sha256').toString('hex');
}

function 名前を整える(名前) {
    return String(名前 || '').trim();
}

function 名前を確かめる(名前) {
    if (!名前) return 'ユーザー名を入れてください';
    if (名前.length > 32) return 'ユーザー名は32文字までにしてください';
    if (/\s/.test(名前)) return 'ユーザー名に空白は使えません';
    return null;
}

function パスワードを確かめる(名前, パスワード) {
    const p = String(パスワード || '');
    if (p.length < 10) return 'パスワードは10文字以上にしてください';
    if (p.toLowerCase() === 名前.toLowerCase()) return 'パスワードにユーザー名と同じものは使えません';
    if (/^(.)\1+$/.test(p)) return '同じ文字だけのパスワードは使えません';
    return null;
}

function 初期設定済みか() {
    return 読む().人.length > 0;
}

function 人を作る(名前, パスワード, 役) {
    const 塩 = crypto.randomBytes(16).toString('hex');
    return {
        名前,
        役,
        塩,
        回数: 混ぜる回数,
        混ぜたもの: 混ぜる(パスワード, 塩, 混ぜる回数),
        作った日: new Date().toISOString(),
    };
}

/** 最初の管理者を作る。すでに誰かいれば断る。 */
function 初期設定(名前, パスワード) {
    名前 = 名前を整える(名前);
    const 名前の問題 = 名前を確かめる(名前);
    if (名前の問題) return { ok: false, 訳: 名前の問題 };
    const パスの問題 = パスワードを確かめる(名前, パスワード);
    if (パスの問題) return { ok: false, 訳: パスの問題 };

    const 中身 = 読む();
    if (中身.人.length > 0) {
        return { ok: false, 訳: 'すでに設定済みです' };
    }
    中身.人.push(人を作る(名前, パスワード, '管理者'));
    書く(中身);
    return { ok: true, 訳: 'アカウントを作りました' };
}

function 入場券を出す(人) {
    const 券 = crypto.randomBytes(32).toString('hex');
    const 指紋 = crypto.createHash('sha256').update(券).digest('hex');
    入場券.set(指紋, { 名前: 人.名前, 役: 人.役, 期限: Date.now() + 入場券の有効時間 });
    return 券;
}

function 入場券から人を知る(券) {
    if (!券) return null;
    const 指紋 = crypto.createHash('sha256').update(String(券)).digest('hex');
    const 中身 = 入場券.get(指紋);
    if (!中身) return null;
    if (Date.now() > 中身.期限) {
        入場券.delete(指紋);
        return null;
    }
    return 中身;
}

function 入場券を返す(券) {
    if (!券) return;
    入場券.delete(crypto.createHash('sha256').update(String(券)).digest('hex'));
}

/** ログイン。相手(住所)とユーザー名の組ごとに、間違いを数える。 */
function ログイン(名前, パスワード, 住所) {
    名前 = 名前を整える(名前);
    const 印 = `${住所}|${名前.toLowerCase()}`;
    const 記録 = 間違い.get(印);
    if (記録 && 記録.締め出し期限 && Date.now() < 記録.締め出し期限) {
        const 残り = Math.ceil((記録.締め出し期限 - Date.now()) / 60000);
        return { ok: false, 締め出し: true, 訳: `間違いが続いたため、あと${残り}分ほど試せません` };
    }

    const 人 = 読む().人.find((x) => x.名前.toLowerCase() === 名前.toLowerCase());

    // ユーザーがいなくても同じだけ時間をかける。
    // 「その名前は無い」と「パスワードが違う」を、速さで見分けられないようにする。
    const 塩 = 人 ? 人.塩 : '0'.repeat(32);
    const 回数 = 人 ? 人.回数 : 混ぜる回数;
    const 試し = Buffer.from(混ぜる(パスワード, 塩, 回数));
    const 本物 = Buffer.from(人 ? 人.混ぜたもの : '0'.repeat(64));
    const 合った = 人 && 試し.length === 本物.length && crypto.timingSafeEqual(試し, 本物);

    if (!合った) {
        const 回 = ((記録 && 記録.回) || 0) + 1;
        const 次 = { 回 };
        if (回 >= 許す間違い) {
            次.締め出し期限 = Date.now() + 締め出す分 * 60000;
            次.回 = 0;
        }
        間違い.set(印, 次);
        return { ok: false, 訳: 'ユーザー名またはパスワードが正しくありません' };
    }

    間違い.delete(印);
    return { ok: true, 名前: 人.名前, 役: 人.役, 入場券: 入場券を出す(人) };
}

/** 自分のパスワードを変える */
function パスワード変更(入場券の持ち主, 今のパスワード, 新しいパスワード) {
    if (!入場券の持ち主) return { ok: false, 訳: 'ログインし直してください' };
    const 中身 = 読む();
    const 人 = 中身.人.find((x) => x.名前 === 入場券の持ち主.名前);
    if (!人) return { ok: false, 訳: 'アカウントが見つかりません' };

    const 試し = Buffer.from(混ぜる(今のパスワード, 人.塩, 人.回数));
    const 本物 = Buffer.from(人.混ぜたもの);
    if (試し.length !== 本物.length || !crypto.timingSafeEqual(試し, 本物)) {
        return { ok: false, 訳: '今のパスワードが違います' };
    }
    const 問題 = パスワードを確かめる(人.名前, 新しいパスワード);
    if (問題) return { ok: false, 訳: 問題 };

    人.塩 = crypto.randomBytes(16).toString('hex');
    人.回数 = 混ぜる回数;
    人.混ぜたもの = 混ぜる(新しいパスワード, 人.塩, 人.回数);
    書く(中身);
    if (表示を読む()) 表示を書く(人.名前, 新しいパスワード);
    return { ok: true, 訳: 'パスワードを変えました' };
}

/* ==========================================================
   指紋・Face ID（パスキー / WebAuthn）
   ========================================================== */
//
// 端末の中の安全な領域（Touch ID / Face ID）が、本人確認のうえで署名を作る。
// こちらは、その署名を、登録時に預かった公開鍵で確かめるだけ。
// 秘密鍵は端末の外に出ないので、こちらが漏れても指紋は漏れない。
//
// 登録できるのは、パスワードでログイン済みの本人だけ。
// 一度の使い捨ての「お題」(challenge) に署名させるので、盗み見た通信を
// 後から使い回しても通らない。

const お題の有効時間 = 2 * 60 * 1000;
const お題 = new Map();   // お題 → { 用途, 期限, 鍵の目印? }

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function お題を出す(用途, 付ける) {
    // 溜め込まれないよう、期限切れを掃除し、数にも上限を置く
    const 今 = Date.now();
    for (const [k, v] of お題) if (v.期限 < 今) お題.delete(k);
    if (お題.size >= 100) return null;
    const c = b64u(crypto.randomBytes(32));
    お題.set(c, { 用途, 期限: 今 + お題の有効時間, ...付ける });
    return c;
}

/** お題は一度しか使えない（取り出したら消す） */
function お題を使う(c, 用途) {
    const 中身 = お題.get(c);
    お題.delete(c);
    if (!中身 || 中身.用途 !== 用途 || 中身.期限 < Date.now()) return null;
    return 中身;
}

/** 表向きの名前（ホスト名）が、使ってよいものか。IPアドレスは使えない。 */
function 呼び名を確かめる(origin) {
    let u;
    try { u = new URL(origin); } catch { return null; }
    const 名 = u.hostname;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(名) || 名.includes(':')) return null;   // IPアドレス
    if (u.protocol !== 'https:' && 名 !== 'localhost') return null;       // 暗号化されていない所は不可
    return 名;
}

function 登録のお題(持ち主) {
    if (!持ち主) return { ok: false, 訳: 'ログインし直してください' };
    const c = お題を出す('登録', { 名前: 持ち主.名前 });
    if (!c) return { ok: false, 訳: 'いま込み合っています。少し待ってください' };
    return { ok: true, お題: c };
}

function クライアント情報を確かめる(clientDataJSON, 種類, 期待のお題, 実際のorigin) {
    let c;
    try { c = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')); } catch { return null; }
    if (c.type !== 種類 || c.challenge !== 期待のお題) return null;
    // ブラウザが付けた Origin ヘッダと、署名された origin が一致すること
    if (!実際のorigin || c.origin !== 実際のorigin) return null;
    const 名 = 呼び名を確かめる(c.origin);
    if (!名) return null;
    return { origin: c.origin, rpId: 名 };
}

function 認証データを確かめる(authDataB64, rpId) {
    const d = Buffer.from(authDataB64, 'base64url');
    if (d.length < 37) return null;
    const rpハッシュ = crypto.createHash('sha256').update(rpId).digest();
    if (!crypto.timingSafeEqual(d.subarray(0, 32), rpハッシュ)) return null;
    const flags = d[32];
    // 0x01: 本人が端末を操作した / 0x04: 指紋・顔などで本人確認された
    if (!(flags & 0x01) || !(flags & 0x04)) return null;
    return { d, flags, 回数: d.readUInt32BE(33) };
}

function 登録する(持ち主, 身元, 本文) {
    if (!持ち主) return { ok: false, 訳: 'ログインし直してください' };
    const { id, clientDataJSON, authenticatorData, publicKey, 名前 } = 本文 || {};
    if (![id, clientDataJSON, authenticatorData, publicKey].every((x) => typeof x === 'string' && x)) {
        return { ok: false, 訳: '登録の情報が足りません' };
    }
    const お = clientDataJSON && (() => {
        try { return JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')).challenge; } catch { return null; }
    })();
    const 中身 = お && お題を使う(お, '登録');
    if (!中身 || 中身.名前 !== 持ち主.名前) return { ok: false, 訳: '登録の有効時間が切れました。もう一度やり直してください' };

    const 情報 = クライアント情報を確かめる(clientDataJSON, 'webauthn.create', お, 身元.origin);
    if (!情報) return { ok: false, 訳: '接続元が確認できませんでした。localhost か https でお使いください' };
    const 認 = 認証データを確かめる(authenticatorData, 情報.rpId);
    if (!認) return { ok: false, 訳: '端末での本人確認（指紋・Face ID）が確認できませんでした' };

    // 認証データの中の「鍵の名札」が、送られた id と同じか
    if (!(認.flags & 0x40) || 認.d.length < 55) return { ok: false, 訳: '鍵の情報が読めませんでした' };
    const 長さ = 認.d.readUInt16BE(53);
    const 名札 = 認.d.subarray(55, 55 + 長さ);
    if (b64u(名札) !== id) return { ok: false, 訳: '鍵の名札が一致しません' };

    let 鍵;
    try { 鍵 = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64url'), format: 'der', type: 'spki' }); }
    catch { return { ok: false, 訳: '公開鍵が読めませんでした' }; }
    if (!['ec', 'rsa'].includes(鍵.asymmetricKeyType)) return { ok: false, 訳: 'この種類の鍵には対応していません' };

    const 中 = 読む();
    const 人 = 中.人.find((x) => x.名前 === 持ち主.名前);
    if (!人) return { ok: false, 訳: 'アカウントが見つかりません' };
    人.パスキー = 人.パスキー || [];
    if (人.パスキー.some((k) => k.id === id)) return { ok: false, 訳: 'この端末はすでに登録されています' };
    if (人.パスキー.length >= 10) return { ok: false, 訳: '登録できるのは10台までです。使わない端末を外してください' };
    人.パスキー.push({
        id,
        公開鍵: publicKey,
        rpId: 情報.rpId,
        名前: String(名前 || '名前なしの端末').slice(0, 40),
        作った日: new Date().toISOString(),
        回数: 認.回数,
    });
    書く(中);
    return { ok: true, 訳: 'この端末の指紋・Face IDを登録しました' };
}

function ログインのお題(id) {
    // 登録されていないidにも同じように答える（登録の有無を外から探られないように）
    const c = お題を出す('ログイン', { id: String(id || '') });
    if (!c) return { ok: false, 訳: 'いま込み合っています。少し待ってください' };
    return { ok: true, お題: c };
}

function パスキーでログイン(身元, 本文) {
    const { id, clientDataJSON, authenticatorData, signature } = 本文 || {};
    const 失敗 = { ok: false, 訳: '指紋・Face IDで確認できませんでした。パスワードでログインしてください' };
    if (![id, clientDataJSON, authenticatorData, signature].every((x) => typeof x === 'string' && x)) return 失敗;

    let お;
    try { お = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')).challenge; } catch { return 失敗; }
    const 中身 = お && お題を使う(お, 'ログイン');
    if (!中身 || 中身.id !== id) return 失敗;

    const 情報 = クライアント情報を確かめる(clientDataJSON, 'webauthn.get', お, 身元.origin);
    if (!情報) return 失敗;

    const 中 = 読む();
    let 持ち主 = null, 鍵の記録 = null;
    for (const 人 of 中.人) {
        const k = (人.パスキー || []).find((x) => x.id === id);
        if (k) { 持ち主 = 人; 鍵の記録 = k; }
    }
    if (!持ち主 || 鍵の記録.rpId !== 情報.rpId) return 失敗;

    const 認 = 認証データを確かめる(authenticatorData, 情報.rpId);
    if (!認) return 失敗;

    // 回数が0のままの端末（Appleのパスキー等）もあるので、両方0でなければ増えていること
    if ((認.回数 !== 0 || 鍵の記録.回数 !== 0) && 認.回数 <= 鍵の記録.回数) return 失敗;

    try {
        const 鍵 = crypto.createPublicKey({ key: Buffer.from(鍵の記録.公開鍵, 'base64url'), format: 'der', type: 'spki' });
        const 署名の対象 = Buffer.concat([認.d, crypto.createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()]);
        if (!crypto.verify('sha256', 署名の対象, 鍵, Buffer.from(signature, 'base64url'))) return 失敗;
    } catch {
        return 失敗;
    }

    鍵の記録.回数 = 認.回数;
    鍵の記録.最後に使った日 = new Date().toISOString();
    書く(中);
    return { ok: true, 名前: 持ち主.名前, 役: 持ち主.役, 入場券: 入場券を出す(持ち主) };
}

function パスキー一覧(持ち主) {
    if (!持ち主) return null;
    const 人 = 読む().人.find((x) => x.名前 === 持ち主.名前);
    return ((人 && 人.パスキー) || []).map((k) => ({ id: k.id, 名前: k.名前, rpId: k.rpId, 作った日: k.作った日, 最後に使った日: k.最後に使った日 || null }));
}

function パスキーを外す(持ち主, id) {
    if (!持ち主) return { ok: false, 訳: 'ログインし直してください' };
    const 中 = 読む();
    const 人 = 中.人.find((x) => x.名前 === 持ち主.名前);
    const 前 = ((人 && 人.パスキー) || []).length;
    if (!人 || !前) return { ok: false, 訳: '登録がありません' };
    人.パスキー = 人.パスキー.filter((k) => k.id !== id);
    if (人.パスキー.length === 前) return { ok: false, 訳: '見つかりません' };
    書く(中);
    return { ok: true, 訳: 'この端末の登録を外しました' };
}

/* ==========================================================
   ログイン画面に、ユーザー名とパスワードを表示する（本人が選んだときだけ）
   ========================================================== */
//
// 本人が「ログイン画面に表示する」を選んだときだけ、server/data/ に平文で置き、
// ログイン画面がそれを読んで表示する。初期設定は「表示しない」。
// 画面を開ける人には誰にでも見えるので、本人しか見ない前提のときだけ使う。
// 保存先は Git の管理外（server/data/）で、バックアップにも入れない。

function 表示を読む() {
    try {
        const d = JSON.parse(fs.readFileSync(表示の保存先, 'utf8'));
        return d && d.名前 && d.パスワード ? d : null;
    } catch { return null; }
}

function 表示を書く(名前, パスワード) {
    fs.mkdirSync(path.dirname(表示の保存先), { recursive: true });
    fs.writeFileSync(表示の保存先 + '.tmp', JSON.stringify({ 名前, パスワード }), { mode: 0o600 });
    fs.renameSync(表示の保存先 + '.tmp', 表示の保存先);
}

/** 入れたパスワードが、本当にいまのパスワードか確かめてから保存する */
function 表示を始める(持ち主, パスワード) {
    if (!持ち主) return { ok: false, 訳: 'ログインし直してください' };
    const 人 = 読む().人.find((x) => x.名前 === 持ち主.名前);
    if (!人) return { ok: false, 訳: 'アカウントが見つかりません' };
    const 試し = Buffer.from(混ぜる(パスワード, 人.塩, 人.回数));
    const 本物 = Buffer.from(人.混ぜたもの);
    if (試し.length !== 本物.length || !crypto.timingSafeEqual(試し, 本物)) {
        return { ok: false, 訳: 'いまのパスワードと違います' };
    }
    表示を書く(人.名前, String(パスワード));
    return { ok: true, 訳: 'ログイン画面に表示するようにしました' };
}

function 表示をやめる(持ち主) {
    if (!持ち主) return { ok: false, 訳: 'ログインし直してください' };
    try { fs.unlinkSync(表示の保存先); } catch { /* 元から無ければ、それでよい */ }
    return { ok: true, 訳: 'ログイン画面に表示しないようにしました' };
}

module.exports = {
    初期設定済みか,
    初期設定,
    ログイン,
    入場券から人を知る,
    入場券を返す,
    パスワード変更,
    登録のお題,
    登録する,
    ログインのお題,
    パスキーでログイン,
    パスキー一覧,
    パスキーを外す,
    表示を読む,
    表示を始める,
    表示をやめる,
};
