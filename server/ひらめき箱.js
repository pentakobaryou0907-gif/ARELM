/**
 * ひらめき箱 — 外出先から、写真・URL・ひとことを投げ込む受け皿
 *
 * 街で見かけたもの、気になったURL、思いついたこと。スマホやiPadから
 * 1タップで送っておき、あとでMacで整理する。
 *
 * 守っていること:
 *   ・消さない（「整理済み」にするだけ。中身も画像も残る）
 *   ・URLは保存するだけ。このツールは外を見に行かない決まりのため、
 *     URLの先を取りに行くことはしない
 *   ・画像は、種類（jpeg/png/webp/gif）を中身の先頭で確かめ、大きさにも上限を付ける
 *   ・画像のファイル名は推測できない長いランダムな名前（名前を知らないと見られない）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let 箱の場所 = null;
let 項目の場所 = null;
let 画像の場所 = null;

const 画像の上限 = 8 * 1024 * 1024;
const 本文の上限 = 2000;

function 場所を教える(dataDir) {
    箱の場所 = path.join(dataDir, 'ひらめき箱');
    項目の場所 = path.join(箱の場所, 'items.json');
    画像の場所 = path.join(箱の場所, 'images');
    fs.mkdirSync(画像の場所, { recursive: true });
}

function 読む() {
    try {
        const d = JSON.parse(fs.readFileSync(項目の場所, 'utf8'));
        return Array.isArray(d) ? d : [];
    } catch { return []; }
}

function 書く(中身) {
    fs.writeFileSync(項目の場所 + '.tmp', JSON.stringify(中身, null, 2));
    fs.renameSync(項目の場所 + '.tmp', 項目の場所);
}

/** 画像の先頭の数バイトで、本当にその種類か確かめる */
function 画像の種類(buf) {
    if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
    if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
    if (buf.length > 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString())) return 'gif';
    return null;
}

function 追加(本文) {
    const { 種類, 文, 画像, 端末 } = 本文 || {};
    const テキスト = String(文 || '').trim().slice(0, 本文の上限);
    let url = null;
    let 画像ファイル = null;

    if (画像) {
        const m = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(画像));
        if (!m) return { ok: false, 訳: '画像の形式が正しくありません（jpeg・png・webp・gif）' };
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 画像の上限) return { ok: false, 訳: '画像が大きすぎます（8MBまで）' };
        const 実際 = 画像の種類(buf);
        if (!実際) return { ok: false, 訳: '画像として読めませんでした' };
        画像ファイル = crypto.randomBytes(16).toString('hex') + '.' + 実際;
        fs.writeFileSync(path.join(画像の場所, 画像ファイル), buf);
    }
    if (種類 === 'URL') {
        try {
            const u = new URL(テキスト);
            if (!['http:', 'https:'].includes(u.protocol)) throw new Error('scheme');
            url = u.toString();
        } catch { return { ok: false, 訳: 'URLの形が正しくありません（http:// か https:// で始まるもの）' }; }
    }
    if (!テキスト && !画像ファイル) return { ok: false, 訳: '中身がありません' };

    const 一覧 = 読む();
    const 項目 = {
        id: crypto.randomBytes(8).toString('hex'),
        種類: 画像ファイル ? '画像' : (url ? 'URL' : 'メモ'),
        文: テキスト,
        url,
        画像: 画像ファイル,
        端末: String(端末 || '').slice(0, 40),
        作成: new Date().toISOString(),
        状態: '未整理',
    };
    一覧.push(項目);
    書く(一覧);
    return { ok: true, 訳: 'ひらめき箱に入れました', 項目 };
}

function 一覧を返す() {
    return 読む().slice().reverse();
}

/** 整理済み／未整理を切り替える（消しはしない） */
function 状態を変える(id, 状態) {
    if (!['未整理', '整理済み'].includes(状態)) return { ok: false, 訳: '状態が正しくありません' };
    const 一覧 = 読む();
    const x = 一覧.find((y) => y.id === id);
    if (!x) return { ok: false, 訳: '見つかりません' };
    x.状態 = 状態;
    書く(一覧);
    return { ok: true };
}

function 画像のパス(名前) {
    if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(String(名前 || ''))) return null;
    const p = path.join(画像の場所, 名前);
    return fs.existsSync(p) ? p : null;
}

module.exports = { 場所を教える, 追加, 一覧を返す, 状態を変える, 画像のパス };
