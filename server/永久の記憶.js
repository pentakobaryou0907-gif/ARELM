/**
 * 永久の記憶（サーバー側）
 *
 * 画面側の記録（会話・活動記録・ログ・メモ・商品など）は、画面を軽く保つために、
 * 「直近の200件だけ」のように古いものを外している所が30か所以上ある。
 * 一か所ずつ上限を外すと、画面が重くなり、ブラウザの保存容量（約5MB）も超える。
 *
 * そこで、端末間の同期（/api/sync/push）の出口で、
 * 「前に届いた値にあって、今回の値から無くなった項目」を見つけ、
 * 追記専用のファイルへ必ず移す。
 * 切り詰め・編集・削除のどれで無くなっても、前の姿が残る。
 *
 * AI側（server/ai/永久の記憶.py）も同じ置き場・同じ形式に書く。
 *
 * 守っていること:
 *   ・書き足すだけ。書き換えも消しもしない。
 *   ・カード番号・APIキーらしきものは、残す前に伏せる。
 *   ・書けなくても、同期は止めない。
 *   ・外へは送らない。
 */

const fs = require('fs');
const path = require('path');

let 置き場 = null;
const 一件の上限 = 200000;

const 伏せるもの = [
    [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '【カード番号らしき数列を伏せました】'],
    [/\b\d{12}\b/g, '【番号らしき数列を伏せました】'],
    [/\b(sk|pk|ghp|gsk)_[A-Za-z0-9]{16,}\b/g, '【APIキーらしき文字列を伏せました】'],
    [/\bAIza[0-9A-Za-z_-]{30,}\b/g, '【APIキーらしき文字列を伏せました】'],
];

// 残す意味が薄く、数が多いだけの記録（この端末の状態のメモ・画面の一時状態）は対象にしない
const 残さないキー = new Set(['areglm_sync_meta', 'areglm_home_tab', 'areglm_work_tabs', 'areglm_theme_flip']);

function 場所を教える(dataDir) {
    置き場 = process.env.ARELM_MEMORY_DIR || path.join(dataDir, '永久の記憶');
}

function ファイル名(分類) {
    return String(分類 || '無題').replace(/[^\w぀-ヿ一-鿿-]/g, '_').slice(0, 60) || '無題';
}

function 伏せる(文) {
    return 伏せるもの.reduce((a, [re, 代わり]) => a.replace(re, 代わり), 文);
}

function 残す(分類, 中身, 理由) {
    try {
        let 行 = 伏せる(JSON.stringify({ とき: new Date().toISOString(), 分類, 理由: 理由 || '', 中身 }));
        if (行.length > 一件の上限) {
            行 = JSON.stringify({ とき: new Date().toISOString(), 分類, 理由: 理由 || '', 切れた: true, 中身: 行.slice(0, 一件の上限) });
        }
        fs.mkdirSync(置き場, { recursive: true });
        fs.appendFileSync(path.join(置き場, ファイル名(分類) + '.jsonl'), 行 + '\n');
        return true;
    } catch (e) {
        console.warn('[永久の記憶] 残せませんでした:', 分類, e.message);
        return false;
    }
}

/** 前の値にあって、今の値に無い項目（同じものが複数あれば、数で見る）を返す */
function 外れた項目(前, 今) {
    const 数 = new Map();
    今.forEach((x) => { const k = JSON.stringify(x); 数.set(k, (数.get(k) || 0) + 1); });
    const 外れた = [];
    前.forEach((x) => {
        const k = JSON.stringify(x);
        const n = 数.get(k) || 0;
        if (n > 0) 数.set(k, n - 1);
        else 外れた.push(x);
    });
    return 外れた;
}

/** 同期の入口から呼ぶ。配列の値だけを対象にする。 */
function 差分を残す(キー, 前の値, 今の値) {
    try {
        if (!置き場 || 残さないキー.has(キー)) return 0;
        const 前 = JSON.parse(前の値);
        const 今 = JSON.parse(今の値);
        if (!Array.isArray(前) || !Array.isArray(今)) return 0;
        const 外れた = 外れた項目(前, 今);
        外れた.forEach((x) => 残す(キー, x, '画面の記録から外れた（切り詰め・編集・削除のいずれか）'));
        return 外れた.length;
    } catch {
        return 0;   // 値が配列でない・壊れている場合は、何もしない
    }
}

function ファイルたち() {
    try {
        return fs.readdirSync(置き場).filter((f) => f.endsWith('.jsonl'));
    } catch { return []; }
}

function 状況() {
    const 一覧 = ファイルたち().map((f) => {
        const p = path.join(置き場, f);
        const 中身 = fs.readFileSync(p, 'utf8');
        return { 分類: f.replace(/\.jsonl$/, ''), 件数: 中身 ? 中身.split('\n').filter(Boolean).length : 0, バイト: Buffer.byteLength(中身) };
    });
    return {
        ok: true,
        置き場,
        分類の数: 一覧.length,
        合計件数: 一覧.reduce((a, x) => a + x.件数, 0),
        合計バイト: 一覧.reduce((a, x) => a + x.バイト, 0),
        分類: 一覧.sort((a, b) => b.件数 - a.件数).slice(0, 12),
    };
}

/** 言葉で探す。新しい順に、最大 件数 まで。 */
function 探す(語, 件数 = 10) {
    const q = String(語 || '').trim().toLowerCase();
    if (!q) return { ok: false, 訳: '何を探すか、教えてください' };
    const 見つけた = [];
    for (const f of ファイルたち()) {
        const 行たち = fs.readFileSync(path.join(置き場, f), 'utf8').split('\n').filter(Boolean);
        for (const 行 of 行たち) {
            if (!行.toLowerCase().includes(q)) continue;
            try { 見つけた.push(JSON.parse(行)); } catch { /* 壊れた1行は飛ばす */ }
        }
    }
    見つけた.sort((a, b) => String(b.とき).localeCompare(String(a.とき)));
    return { ok: true, 見つかった数: 見つけた.length, 結果: 見つけた.slice(0, 件数) };
}

module.exports = { 場所を教える, 残す, 差分を残す, 状況, 探す };
