/**
 * 外の倉庫との橋渡し（Macの sync_store.json ⇄ GitHubの非公開倉庫）
 *
 * なぜ要るのか:
 *   Macが無いとき、iPad・Windows（公開先 github.io）は、GitHubの非公開倉庫で
 *   データを共有する（本人が 2026-10-08 に選んだ）。
 *   ただ、それだけだと、Macの中のデータ（これまでの商品・売上など）と、
 *   倉庫のデータが別々になる。Macが起きている間、両方を混ぜて同じにする。
 *
 * 決まり:
 *   ・同じ項目は、新しい方（updatedAt が大きい方）を残す。画面の sync.js・公開先と同じ決まり
 *   ・消さない。Macの側で値が変わるときは、前の値を永久の記憶へ移す（呼び出し側が渡す）
 *     倉庫の側は、書くたびにGitHubの履歴に前の中身が残る
 *   ・倉庫は非公開でなければ使わない（公開の倉庫にデータを置くと、誰でも読めてしまう）
 *   ・鍵は server/data の中（権限600）にだけ置き、画面・ログには出さない
 *   ・外への通信は、呼び出し側の許可リスト（safeFetch）を必ず通す
 *
 * 中身は、通信と読み書きを外から渡す純粋な作りにしてあり、tools/サーバーの試験.js で試せる。
 */

const fs = require('fs');
const path = require('path');

const 窓口 = 'https://api.github.com';
const ファイル = 'sync_store.json';

/** 同じ項目は、新しい方を残す（足す側が新しいときだけ入れ替える） */
function まぜる(元, 足す) {
    const 中身 = Object.assign({}, 元 || {});
    const 変わった項目 = [];
    Object.entries(足す || {}).forEach(([key, entry]) => {
        if (!entry || typeof entry.updatedAt !== 'number') return;
        const 今 = 中身[key];
        if (!今 || entry.updatedAt > 今.updatedAt) {
            中身[key] = entry;
            変わった項目.push(key);
        }
    });
    return { 中身, 変わった項目 };
}

function 設定を読む(場所) {
    try {
        const x = JSON.parse(fs.readFileSync(場所, 'utf8'));
        return x && x.持ち主 && x.倉庫 && x.鍵 ? x : null;
    } catch {
        return null;
    }
}

function 設定を書く(場所, 設定) {
    fs.mkdirSync(path.dirname(場所), { recursive: true });
    // 同時の保存でぶつからないよう、毎回ちがう名前に書いてから差し替える
    const 仮 = `${場所}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(仮, JSON.stringify(設定), { mode: 0o600 });
    fs.renameSync(仮, 場所);
}

/** 画面に見せてよい様子（鍵は決して入れない） */
function 様子(設定, 最後) {
    return {
        設定済み: !!設定,
        持ち主: 設定 ? 設定.持ち主 : null,
        倉庫: 設定 ? 設定.倉庫 : null,
        最後: 最後 || null,
    };
}

function 頭(鍵, 追加) {
    return Object.assign({
        Authorization: 'Bearer ' + 鍵,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ARELM',
    }, 追加 || {});
}

async function 倉庫を読む(設定, 取りに行く) {
    const 道 = `${窓口}/repos/${設定.持ち主}/${設定.倉庫}/contents/${ファイル}`;
    const r = await 取りに行く(道, { headers: 頭(設定.鍵) });
    if (r.status === 404) return { データ: {}, sha: null };
    if (!r.ok) throw new Error('倉庫を読めませんでした（' + r.status + '）');
    const j = await r.json();
    let 文字;
    if (j.content && j.encoding === 'base64') {
        文字 = Buffer.from(j.content, 'base64').toString('utf8');
    } else {
        const r2 = await 取りに行く(道, { headers: 頭(設定.鍵, { Accept: 'application/vnd.github.raw+json' }) });
        if (!r2.ok) throw new Error('倉庫を読めませんでした（' + r2.status + '）');
        文字 = await r2.text();
    }
    let データ = {};
    try { データ = JSON.parse(文字 || '{}') || {}; } catch { データ = {}; }
    return { データ, sha: j.sha };
}

/**
 * 一度だけ、両方を混ぜて同じにする。
 *   読む()      … Macの sync_store の中身
 *   書く(中身)  … Macの sync_store へ保存
 *   変わる(key, 前, 後) … Macの値が倉庫の値で置き換わるとき（永久の記憶へ前の値を移すため）
 *   取りに行く  … 許可リストを通る fetch
 */
async function 一度まわす({ 設定, 読む, 書く, 変わる, 取りに行く }) {
    if (!設定) return { ok: false, 訳: 'まだ設定されていません' };
    for (let 回 = 0; 回 < 4; 回++) {
        const 遠く = await 倉庫を読む(設定, 取りに行く);
        const 手元 = 読む() || {};

        // 倉庫の方が新しい項目を、Macへ
        const 手元へ = まぜる(手元, 遠く.データ);
        if (手元へ.変わった項目.length) {
            手元へ.変わった項目.forEach((k) => {
                const 前 = 手元[k];
                const 後 = 手元へ.中身[k];
                if (変わる && 前 && typeof 前.value === 'string' && typeof 後.value === 'string' && 前.value !== 後.value) {
                    変わる(k, 前.value, 後.value);
                }
            });
            書く(手元へ.中身);
        }

        // Macの方が新しい項目を、倉庫へ
        const 遠くへ = まぜる(遠く.データ, 手元);
        if (!遠くへ.変わった項目.length && 遠く.sha) {
            return { ok: true, 取り込んだ: 手元へ.変わった項目.length, 送った: 0 };
        }
        const 道 = `${窓口}/repos/${設定.持ち主}/${設定.倉庫}/contents/${ファイル}`;
        const 本文 = {
            message: 'ARELM: Macからの更新',
            content: Buffer.from(JSON.stringify(遠くへ.中身), 'utf8').toString('base64'),
        };
        if (遠く.sha) 本文.sha = 遠く.sha;
        const r = await 取りに行く(道, {
            method: 'PUT',
            headers: 頭(設定.鍵, { 'Content-Type': 'application/json' }),
            body: JSON.stringify(本文),
        });
        if (r.ok) return { ok: true, 取り込んだ: 手元へ.変わった項目.length, 送った: 遠くへ.変わった項目.length };
        // 他の端末が先に書いた。読み直して混ぜ直す
        if (r.status !== 409 && r.status !== 422) throw new Error('倉庫へ書けませんでした（' + r.status + '）');
    }
    throw new Error('他の端末と書き込みがぶつかり続けました');
}

/** 鍵の持ち主を確かめ、倉庫が非公開であることを確かめる（設定の保存のとき） */
async function 確かめる({ 鍵, 倉庫 }, 取りに行く) {
    if (!/^[A-Za-z0-9_.-]+$/.test(倉庫 || '')) throw new Error('倉庫の名前は、英数字と - _ . だけにしてください');
    const u = await 取りに行く(`${窓口}/user`, { headers: 頭(鍵) });
    if (u.status === 401) throw new Error('鍵が正しくないか、期限が切れています');
    if (!u.ok) throw new Error('鍵の持ち主を確かめられませんでした（' + u.status + '）');
    const 持ち主 = (await u.json()).login;
    const r = await 取りに行く(`${窓口}/repos/${持ち主}/${倉庫}`, { headers: 頭(鍵) });
    if (r.status === 404) throw new Error(`倉庫「${倉庫}」が見つかりません（先に、公開先の設定か GitHub で、非公開の倉庫を作ってください）`);
    if (!r.ok) throw new Error('倉庫を確かめられませんでした（' + r.status + '）');
    if ((await r.json()).private !== true) throw new Error(`倉庫「${倉庫}」が公開になっています。データは非公開の倉庫にしか置きません`);
    return { 持ち主, 倉庫, 鍵 };
}

module.exports = { まぜる, 設定を読む, 設定を書く, 様子, 一度まわす, 確かめる, 倉庫を読む };
