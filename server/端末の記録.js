/**
 * 端末の記録 ― どの端末に、ARELMが入っているか・どこにあるか
 *
 * なぜこれが要るのか:
 *   「このパソコンにARELMが入っているのか、入っているならどこにあるのか」が、どこにも出ていなかった。
 *   ホーム画面のアイコンは端末の中のもので、ARELMの側からは見えない。
 *   そこで、二つの手がかりを集める。
 *     ・インストーラー（Windows用キット）が、アイコンを作った場所を報告する
 *       （報告には、そのZIPだけに入れた使い捨ての印を使う。印が無い報告は受け付けない）
 *     ・各端末で、ARELMが「アプリとして」開かれたこと（ホーム画面・デスクトップのアイコンから開いた）
 *
 * 端末の見分け: 門番の印（端末ごとの合言葉の代わり）を、そのまま残さず、ハッシュにして使う。
 * Mac本体は、印を持たないので「このMac」として扱う。
 *
 * 外部へは一切送らない。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const 印の日数 = 30;

function 置き場(データの場所) { return path.join(データの場所, '端末の記録.json'); }

function 読む(データの場所) {
    try {
        const r = JSON.parse(fs.readFileSync(置き場(データの場所), 'utf8'));
        return { 端末: r.端末 || {}, 報告の印: r.報告の印 || {} };
    } catch { return { 端末: {}, 報告の印: {} }; }
}

function 書く(データの場所, 中身) {
    fs.mkdirSync(データの場所, { recursive: true });
    const 一時 = 置き場(データの場所) + '.' + process.pid + '.tmp';
    fs.writeFileSync(一時, JSON.stringify(中身, null, 2));
    fs.renameSync(一時, 置き場(データの場所));
}

/** 門番の印（cookie）から、端末の見分け用のidを作る。印そのものは残さない。 */
function 端末のid(cookie, Mac本体か) {
    if (Mac本体か) return 'this-mac';
    const 部分 = String(cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('areglm_pass='));
    if (!部分) return null;
    return 'd_' + crypto.createHash('sha256').update(部分.slice('areglm_pass='.length)).digest('hex').slice(0, 16);
}

function 端末を取る(中身, id, 名前) {
    if (!中身.端末[id]) 中身.端末[id] = { 名前: 名前 || '名前のない端末', 種類: '', 最初に見た: new Date().toISOString() };
    if (名前) 中身.端末[id].名前 = 名前;
    return 中身.端末[id];
}

/** 開いたことを残す（アプリとして開いたか、ブラウザで開いたか） */
function 開いたことを残す(データの場所, id, { 名前, 種類, アプリとして }) {
    if (!id) return null;
    const 中身 = 読む(データの場所);
    const d = 端末を取る(中身, id, 名前);
    const 今 = new Date().toISOString();
    if (種類) d.種類 = String(種類).slice(0, 20);
    d.最後に開いた = 今;
    if (アプリとして) d.アプリとして最後に開いた = 今;
    書く(データの場所, 中身);
    return d;
}

/** キットをダウンロードした端末に、報告用の使い捨ての印を渡す */
function 報告の印を作る(データの場所, id, 名前) {
    const 中身 = 読む(データの場所);
    const 印 = crypto.randomBytes(16).toString('hex');
    const 今 = Date.now();
    // 古い印は片づける
    for (const [k, v] of Object.entries(中身.報告の印)) if (今 - v.作成 > 印の日数 * 86400000) delete 中身.報告の印[k];
    中身.報告の印[印] = { 端末: id || null, 名前: 名前 || '', 作成: 今 };
    書く(データの場所, 中身);
    return 印;
}

/** インストーラーからの報告。印が正しいときだけ受け付ける。 */
function 入れたことを残す(データの場所, 印, 報告) {
    const 中身 = 読む(データの場所);
    const 元 = 中身.報告の印[String(印 || '')];
    if (!元 || Date.now() - 元.作成 > 印の日数 * 86400000) return { ok: false, 訳: '報告の印が正しくありません' };
    const id = 元.端末 || ('kit_' + String(印).slice(0, 8));
    const d = 端末を取る(中身, id, 元.名前 || (報告.コンピューター名 ? `Windows（${報告.コンピューター名}）` : 'Windowsのパソコン'));
    d.種類 = 'Windows';
    const 文字 = (v) => String(v || '').slice(0, 300);
    if (報告.消した) {
        d.入れた場所 = null;
        d.消した日 = new Date().toISOString();
    } else {
        d.入れた場所 = {
            デスクトップ: 文字(報告.デスクトップ),
            スタートメニュー: 文字(報告.スタートメニュー),
            本体のフォルダ: 文字(報告.本体のフォルダ),
        };
        d.入れた日 = new Date().toISOString();
        d.消した日 = null;
    }
    if (報告.コンピューター名) d.コンピューター名 = 文字(報告.コンピューター名).slice(0, 40);
    書く(データの場所, 中身);
    return { ok: true };
}

function 一覧(データの場所) {
    const 中身 = 読む(データの場所);
    return Object.entries(中身.端末).map(([id, d]) => ({ id, ...d }))
        .sort((a, b) => String(b.最後に開いた || b.入れた日 || '').localeCompare(String(a.最後に開いた || a.入れた日 || '')));
}

function この端末(データの場所, id) {
    if (!id) return null;
    const d = 読む(データの場所).端末[id];
    return d ? { id, ...d } : null;
}

module.exports = { 端末のid, 開いたことを残す, 報告の印を作る, 入れたことを残す, 一覧, この端末 };
