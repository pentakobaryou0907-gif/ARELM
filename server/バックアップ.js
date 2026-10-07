/**
 * バックアップ（自動の控え・ワンタップで戻す）
 *
 * なぜこれが要るのか:
 *   一人で運営していると、データはこのMacの数個のファイル
 *   （商品・タスク・売上・知識メモ・ひらめき箱…）と各ブラウザの中にしか無い。
 *   Macが壊れる・操作を誤る、の一回で全部失う。
 *
 * やること:
 *   ・1日1回、自動で控えを取る（起動時にも、今日の分が無ければ取る）
 *   ・控えの置き場は、あれば iCloud Drive（Mac以外にも複製される）、
 *     無ければ ~/Documents。書けなければ、この端末のserver/data内。
 *   ・戻すときは、先に「戻す前の控え」を必ず取ってから戻す（取り返しがつくように）
 *   ・控えは自動では消さない（容量は小さい）
 *
 * 入れないもの:
 *   ・アカウント・合言葉（accounts.json / 門番.json）。パスワードの情報を
 *     別の場所に増やさないため。戻しても、ログインの設定は変わらない。
 *
 * 戻せるもの:
 *   ・商品・タスク・売上などのアプリのデータ（sync_store.json）
 *   ・ひらめき箱
 *   自作AIの学習ファイルなどは、動いているAIが書き換えるため、控えには入れるが
 *   自動では戻さない（壊れたときは、控えの中のファイルを手で戻す）。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const 取るファイル = [
    'sync_store.json',
    'ai_knowledge.json',
    'learning.json',
    'ブランドの記憶.json',
    '係たち.json',
    '呼び名.json',
    'agent_tasks.json',
    '覚えた作業.json',
    '直したやり方.json',
    '権利のある資料.json',
    '夜の当番.json',
    '朝の報告.jsonl',
];
const 取るフォルダ = ['ひらめき箱', 'techpack_decks', '永久の記憶'];
const 自動で戻すもの = ['sync_store.json', 'ひらめき箱'];

let データの場所 = null;
let 設定の場所 = null;

function 場所を教える(dataDir) {
    データの場所 = dataDir;
    設定の場所 = path.join(dataDir, 'バックアップ設定.json');
}

function 置き場の候補() {
    const 環境 = process.env.ARELM_BACKUP_DIR;
    if (環境) return [環境];
    const 一覧 = [];
    try {
        const 設定 = JSON.parse(fs.readFileSync(設定の場所, 'utf8'));
        if (設定.場所) 一覧.push(設定.場所);
    } catch { /* 無ければ既定 */ }
    const icloud = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
    if (fs.existsSync(icloud)) 一覧.push(path.join(icloud, 'ARELMバックアップ'));
    一覧.push(path.join(os.homedir(), 'Documents', 'ARELMバックアップ'));
    一覧.push(path.join(データの場所, 'バックアップ'));
    return 一覧;
}

/** 書ける置き場を、候補の先頭から順に探す */
function 置き場を決める() {
    const 理由 = [];
    for (const 場所 of 置き場の候補()) {
        try {
            fs.mkdirSync(場所, { recursive: true });
            const 試し = path.join(場所, '.書き込み確認');
            fs.writeFileSync(試し, 'ok');
            fs.unlinkSync(試し);
            return { 場所, 理由 };
        } catch (e) {
            理由.push(`${場所}: ${e.code || e.message}`);
        }
    }
    return { 場所: null, 理由 };
}

function 二桁(n) { return String(n).padStart(2, '0'); }
function 日付(d = new Date()) { return `${d.getFullYear()}-${二桁(d.getMonth() + 1)}-${二桁(d.getDate())}`; }
function 時刻(d = new Date()) { return `${二桁(d.getHours())}${二桁(d.getMinutes())}${二桁(d.getSeconds())}`; }

function ハッシュ(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function フォルダごと写す(元, 先, 記録, 基準) {
    if (!fs.existsSync(元)) return;
    fs.mkdirSync(先, { recursive: true });
    for (const 名 of fs.readdirSync(元)) {
        const a = path.join(元, 名), b = path.join(先, 名);
        const st = fs.statSync(a);
        if (st.isDirectory()) フォルダごと写す(a, b, 記録, 基準);
        else {
            const 中身 = fs.readFileSync(a);
            fs.writeFileSync(b, 中身);
            記録.push({ 名前: path.relative(基準, a), bytes: 中身.length, sha256: ハッシュ(中身) });
        }
    }
}

/** 控えを一つ取る。種類: '毎日' | '手動' | '戻す前' */
function 控えを取る(種類 = '手動') {
    const 置き場 = 置き場を決める();
    if (!置き場.場所) return { ok: false, 訳: '控えの置き場に書き込めませんでした: ' + 置き場.理由.join(' / ') };

    const 名 = 種類 === '毎日' ? `ARELM-${日付()}` : `${種類 === '戻す前' ? '戻す前' : 'ARELM'}-${日付()}_${時刻()}`;
    const 最終 = path.join(置き場.場所, 名);
    // 途中で止まっても、半端な控えが「正しい控え」に見えないよう、作り終えてから名前を付ける
    const 作業中 = 最終 + '.作成中';
    try {
        fs.rmSync(作業中, { recursive: true, force: true });
        fs.mkdirSync(作業中, { recursive: true });
        const 記録 = [];
        for (const f of 取るファイル) {
            const 元 = path.join(データの場所, f);
            if (!fs.existsSync(元)) continue;
            const 中身 = fs.readFileSync(元);
            fs.writeFileSync(path.join(作業中, f), 中身);
            記録.push({ 名前: f, bytes: 中身.length, sha256: ハッシュ(中身) });
        }
        for (const d of 取るフォルダ) {
            // 永久の記憶は、置き場を切り替えているとき（検証用）は、そちらを控える
            const 元の場所 = (d === '永久の記憶' && process.env.ARELM_MEMORY_DIR)
                ? process.env.ARELM_MEMORY_DIR : path.join(データの場所, d);
            フォルダごと写す(元の場所, path.join(作業中, d), 記録, 元の場所 === path.join(データの場所, d) ? データの場所 : path.dirname(元の場所));
        }
        fs.writeFileSync(path.join(作業中, 'manifest.json'), JSON.stringify({
            作成: new Date().toISOString(), 種類, ファイル: 記録,
        }, null, 2));
        if (fs.existsSync(最終)) fs.renameSync(最終, 最終 + '_前の同名_' + 時刻());   // 上書きしない
        fs.renameSync(作業中, 最終);
        return { ok: true, 名前: 名, 場所: 置き場.場所, ファイル数: 記録.length, 代わりの場所: 置き場.場所 !== 置き場の候補()[0] };
    } catch (e) {
        try { fs.rmSync(作業中, { recursive: true, force: true }); } catch { /* 片付けられなくても続ける */ }
        return { ok: false, 訳: '控えを取れませんでした: ' + e.message };
    }
}

function 控えの一覧() {
    const 置き場 = 置き場を決める();
    if (!置き場.場所) return { ok: false, 訳: '置き場に書き込めません', 一覧: [] };
    const 一覧 = [];
    for (const 名 of fs.readdirSync(置き場.場所)) {
        if (!/^(ARELM|戻す前)-/.test(名) || 名.endsWith('.作成中')) continue;
        try {
            const m = JSON.parse(fs.readFileSync(path.join(置き場.場所, 名, 'manifest.json'), 'utf8'));
            一覧.push({ 名前: 名, 作成: m.作成, 種類: m.種類, ファイル数: m.ファイル.length });
        } catch { /* manifestの無い（壊れた）ものは一覧に出さない */ }
    }
    一覧.sort((a, b) => String(b.作成).localeCompare(String(a.作成)));
    return { ok: true, 場所: 置き場.場所, 一覧 };
}

function 状態() {
    const r = 控えの一覧();
    if (!r.ok) return r;
    const 最新 = r.一覧.find((x) => x.種類 !== '戻す前') || null;
    const 経過時間 = 最新 ? (Date.now() - new Date(最新.作成).getTime()) / 3600000 : null;
    return {
        ok: true,
        場所: r.場所,
        iCloudか: r.場所.includes('CloudDocs'),
        最新: 最新,
        古すぎる: !最新 || 経過時間 > 48,
        件数: r.一覧.length,
        一覧: r.一覧.slice(0, 30),
    };
}

/** 控えから戻す（先に「戻す前の控え」を取る） */
function 戻す(名前) {
    if (!/^(ARELM|戻す前)-[0-9_-]+$/.test(String(名前 || ''))) return { ok: false, 訳: '控えの名前が正しくありません' };
    const 置き場 = 置き場を決める();
    if (!置き場.場所) return { ok: false, 訳: '置き場に書き込めません' };
    const 元 = path.join(置き場.場所, 名前);
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(元, 'manifest.json'), 'utf8')); }
    catch { return { ok: false, 訳: 'その控えは壊れているか、見つかりません' }; }

    // 戻す前に、控えの中身が壊れていないか確かめる（壊れたもので上書きしない）
    for (const f of m.ファイル) {
        try {
            if (ハッシュ(fs.readFileSync(path.join(元, f.名前))) !== f.sha256) return { ok: false, 訳: `控えの中の ${f.名前} が壊れています。戻しませんでした` };
        } catch { return { ok: false, 訳: `控えの中の ${f.名前} が読めません。戻しませんでした` }; }
    }

    const 戻す前 = 控えを取る('戻す前');
    if (!戻す前.ok) return { ok: false, 訳: '戻す前の控えを取れなかったため、戻しませんでした: ' + 戻す前.訳 };

    const 戻した = [];
    try {
        // アプリのデータ。全項目の更新時刻を「いま」にして、各端末が必ず取り込むようにする
        const 同期 = path.join(元, 'sync_store.json');
        if (fs.existsSync(同期)) {
            const 店 = JSON.parse(fs.readFileSync(同期, 'utf8'));
            const いま = Date.now();
            Object.values(店).forEach((e) => { if (e && typeof e === 'object') e.updatedAt = いま; });
            const 先 = path.join(データの場所, 'sync_store.json');
            fs.writeFileSync(先 + '.tmp', JSON.stringify(店));
            fs.renameSync(先 + '.tmp', 先);
            戻した.push('sync_store.json');
        }
        // ひらめき箱は、足す形で戻す（今あるものは消さない）
        const 箱 = path.join(元, 'ひらめき箱');
        if (fs.existsSync(箱)) {
            フォルダごと写す(箱, path.join(データの場所, 'ひらめき箱'), [], 箱);
            戻した.push('ひらめき箱');
        }
    } catch (e) {
        return { ok: false, 訳: '戻している途中で止まりました（戻す前の控え: ' + 戻す前.名前 + '）: ' + e.message };
    }
    return { ok: true, 訳: 'アプリのデータを戻しました', 戻した, 戻す前の控え: 戻す前.名前, 自動で戻さないもの: 取るファイル.filter((f) => !自動で戻すもの.includes(f)) };
}

/** 今日の分が無ければ取る。1時間ごとに見る。 */
function 毎日の控えを始める() {
    const 見る = () => {
        try {
            const r = 控えの一覧();
            if (r.ok && r.一覧.some((x) => x.名前 === `ARELM-${日付()}`)) return;
            const 結果 = 控えを取る('毎日');
            console.log(結果.ok ? `[バックアップ] 今日の控えを取りました: ${結果.名前}` : `[バックアップ] 取れませんでした: ${結果.訳}`);
        } catch (e) {
            console.warn('[バックアップ] 失敗:', e.message);
        }
    };
    setTimeout(見る, 15000);          // 起動直後の混雑を避ける
    setInterval(見る, 60 * 60 * 1000);
}

function 場所を変える(新しい場所) {
    const p = String(新しい場所 || '').trim();
    if (!p || !path.isAbsolute(p)) return { ok: false, 訳: '絶対パス（/Users/...）で指定してください' };
    try {
        fs.mkdirSync(p, { recursive: true });
        fs.accessSync(p, fs.constants.W_OK);
    } catch (e) { return { ok: false, 訳: 'そこには書き込めません: ' + e.message }; }
    fs.writeFileSync(設定の場所, JSON.stringify({ 場所: p }, null, 2));
    return { ok: true, 訳: '控えの置き場を変えました' };
}

module.exports = { 場所を教える, 控えを取る, 控えの一覧, 状態, 戻す, 毎日の控えを始める, 場所を変える };
