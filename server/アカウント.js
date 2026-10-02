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
    return { ok: true, 訳: 'パスワードを変えました' };
}

module.exports = {
    初期設定済みか,
    初期設定,
    ログイン,
    入場券から人を知る,
    入場券を返す,
    パスワード変更,
};
