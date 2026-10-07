/**
 * チームで手分けして進める（マルチエージェントの「実際に動かす」部分）
 *
 * なぜこれが要るのか:
 *   係たち.py は「どの係が、どう働くか」まで決められたが、動かす先が無かった。
 *   いくつもの頼みを一人で順番にこなすと、待ち時間が長く、どこで止まったかも見えにくい。
 *   そして「やりました」と言った本人が、自分で確かめていた。
 *
 *   ここで、係ごとに同時に進め、別の係（点検係）が、できた結果を実際に確かめる。
 *
 * ここでの決まり（Python側の チーム.py と同じ）:
 *   1. 同じ係の手は、頼まれた順に一つずつ。違う係の手だけが、同時に進む。
 *   2. 前の手の結果に頼る手（同じ商品名を使う等）は、その手が終わるのを待つ。
 *   3. 画面を切り替える手は、頼まれた順に（待ち先に入れてある）。
 *   4. 足りない中身を聞くのは、同時に何か所も出さず、一つずつ順番に。
 *   5. 失敗が出たら、どの係も新しい手を始めない。始めなかった手は、報告に書く。
 *   6. 点検係は、書いたはずのデータを、実際に読み直して確かめる。
 *      確かめようがない手は、「確かめていない」と書く（確かめたふりをしない）。
 *
 * すべてこの端末の中だけで動く。外部へは一切送らない。
 */

const チームの設定の鍵 = 'areglm_agent_team';
const チームの記録の鍵 = 'areglm_team_log';

/** チームで進めるか。既定は進める。'0' のときだけ、これまでどおり一人で順に進める。 */
function チームで進めるか() {
    const v = localStorage.getItem(チームの設定の鍵);
    return !(v === '0' || v === 'false');
}

/* ---------- 小さな道具 ---------- */

function チームの待つ(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** 「終わった」ことを、ほかの手に知らせる札 */
function チームの終わり札() {
    let 終える;
    const 待つ = new Promise((r) => { 終える = r; });
    return { 待つ, 終える };
}

/** 聞くことを、一つずつ順番にするための列（同時に何か所も聞かないため） */
function チームの質問の列を作る() {
    let 列 = Promise.resolve();
    return (処理) => {
        const 結果 = 列.then(処理);
        列 = 結果.catch(() => { /* 一つ失敗しても、次の質問は出す */ });
        return 結果;
    };
}

/* ---------- 掲示板（係のカード） ---------- */

function チームの掲示板を作る(箱, 係たち, 点検の名前) {
    const 板 = document.createElement('div');
    板.className = 'team-board';
    const カード = new Map();

    係たち.forEach((a) => {
        const c = document.createElement('div');
        c.className = 'team-card idle';
        const 上 = document.createElement('b');
        上.textContent = `${a.絵 || '🙂'} ${a.名前}`;
        const 下 = document.createElement('small');
        下.textContent = '待機中';
        c.append(上, 下);
        板.appendChild(c);
        カード.set(a.名前, { c, 下 });
    });
    箱.appendChild(板);

    // 点検係は、作業もするし、確かめもする。確かめる様子は、板の下に一行で出す。
    const 点検の行 = document.createElement('div');
    点検の行.className = 'team-checker';
    点検の行.textContent = `🛡 ${点検の名前 || '点検係'}: できた結果を実際に確かめます`;
    箱.appendChild(点検の行);

    return {
        変える(名, 状態, 文) {
            const k = カード.get(名);
            if (!k) return;
            k.c.className = 'team-card ' + 状態;
            k.下.textContent = 文;
        },
        点検を出す(文) { 点検の行.textContent = `🛡 ${点検の名前 || '点検係'}: ${文}`; },
    };
}

/* ---------- 点検係: 書いたはずのデータを、実際に読み直して確かめる ---------- */

/** 手を行う前の様子を控える（行ったあとと比べるため） */
const チームの帳面 = {
    add_task: { 鍵: 'areglm_tasks', 欄: 'title', 中身: (m) => String(m.title || '').trim() },
    add_memo: { 鍵: 'areglm_memos', 欄: 'body', 中身: (m) => String(m.body || m.title || '').trim() },
    add_product: { 鍵: 'products', 欄: 'name', 中身: (m) => String(m.name || '').trim() },
    add_production: { 鍵: 'areglm_production_log', 欄: null, 中身: null },
};

async function チームの控えを取る(手) {
    const 帳 = チームの帳面[手.action];
    if (帳) return { 数: 蓄えを読む(帳.鍵).length };
    if (手.action === 'add_inbox' && typeof アカウントAPI === 'function') {
        const r = await アカウントAPI('/api/inbox/list');
        return { 数: r && r.ok && Array.isArray(r.一覧) ? r.一覧.length : null };
    }
    return null;
}

/**
 * 行ったあとに、実際にそうなっているかを確かめる。
 * @returns {Promise<{確か: true|false|null, 文: string}>}
 *   true=確認できた / false=食い違い（成功と言ったのに、データに見当たらない）/ null=確かめようがない
 */
async function チームの裏を取る(手, 材料, 控え) {
    const 帳 = チームの帳面[手.action];
    if (帳 && 控え) {
        const 後 = 蓄えを読む(帳.鍵);
        if (後.length <= 控え.数) return { 確か: false, 文: `記録が増えていません（${控え.数}件のまま）` };
        if (帳.欄) {
            const 期待 = 帳.中身(材料);
            if (期待 && !後.some((x) => String(x[帳.欄] || '').trim() === 期待)) {
                return { 確か: false, 文: '記録は増えましたが、頼んだ中身と合いません' };
            }
        }
        return { 確か: true, 文: `記録が増えたことを確認（${控え.数}→${後.length}件）` };
    }
    if (手.action === 'add_inbox' && 控え && 控え.数 != null && typeof アカウントAPI === 'function') {
        const r = await アカウントAPI('/api/inbox/list');
        if (!r || !r.ok) return { 確か: null, 文: 'ひらめき箱を読み直せませんでした' };
        return r.一覧.length > 控え.数
            ? { 確か: true, 文: `ひらめき箱が増えたことを確認（${控え.数}→${r.一覧.length}件）` }
            : { 確か: false, 文: 'ひらめき箱に増えていません' };
    }
    if (手.action === 'backup_now' && typeof アカウントAPI === 'function') {
        const r = await アカウントAPI('/api/backup/status');
        const 作成 = r && r.ok && r.最新 ? Date.parse(r.最新.作成) : NaN;
        if (!Number.isFinite(作成)) return { 確か: null, 文: 'バックアップの状況を読み直せませんでした' };
        return Date.now() - 作成 < 5 * 60 * 1000
            ? { 確か: true, 文: 'いま取ったバックアップがあることを確認' }
            : { 確か: false, 文: '新しいバックアップが見当たりません' };
    }
    return { 確か: null, 文: '確かめる方法が無い手（結果の文だけで判断）' };
}

/* ---------- 本体 ---------- */

/**
 * 段取り（チーム情報つき）を、係ごとに手分けして進める。
 *
 * @param {object} 段   steps の各手に agent_name / wait / wave が付いたもの
 * @param {HTMLElement} 箱
 * @param {string|null} 作業の目印  上のタブの目印
 * @param {Function} 中断か  やめてほしいと言われたか
 * @param {string} 出力先
 * @returns {Promise<{済み:string[], 飛ばした:string[], 止まった:object|null, 手の結果:Array, 係たち:string[]}>}
 */
async function チームで手分けして進める(段, 箱, 作業の目印, 中断か, 出力先) {
    const 手たち = 段.steps;
    const 全体 = 手たち.length;
    const 手の結果 = 手たち.map(() => ({ 状態: '待ち', 確か: undefined }));
    const 札 = 手たち.map(() => チームの終わり札());
    const 聞く = チームの質問の列を作る();

    // 係ごとの順番（頼まれた順）
    const 列たち = new Map();
    手たち.forEach((h, i) => {
        const k = h.agent_name || '?';
        if (!列たち.has(k)) 列たち.set(k, []);
        列たち.get(k).push(i);
    });

    const 板 = チームの掲示板を作る(箱, 段.team.agents, 段.team.checker);
    const 済み = [];
    const 飛ばした = [];
    let 止まった = null;
    let 済んだ数 = 0;
    let 確かめた数 = 0;

    const 途中経過 = (していること) => {
        if (作業の目印 && typeof 作業を進める === 'function') 作業を進める(作業の目印, 済んだ数, していること);
    };

    async function 一手を進める(i) {
        const 手 = 手たち[i];
        const 係 = 手.agent_name;
        const 材料 = Object.assign({}, 手.params || {});
        let 部品 = null;
        try {
            // 前の結果に頼る手は、その手が終わるのを待つ
            if ((手.wait || []).length) {
                板.変える(係, 'waiting', `${手.wait.map((w) => w + 1).join('・')}手目を待っています`);
                await Promise.all(手.wait.map((w) => 札[w].待つ));
            }
            if (中断か() || 止まった) { 手の結果[i].状態 = '始めず'; return; }

            // 足りない中身を聞く／戻しにくい手は確かめる（一人で進めるときと同じ決まり。聞くのは一つずつ）
            板.変える(係, 'asking', `${i + 1}手目: 確認しています`);
            const 前置き = await 一手の前に確かめる(手, 材料, 箱, i + 1, 全体, 作業の目印, 聞く);
            if (前置き === '飛ばす') {
                手の結果[i].状態 = '飛ばした';
                飛ばした.push(手.why);
                const 飛ばし部品 = 手を出す(箱, i + 1, 全体, `${係}　${手.why}`);
                手を終える(飛ばし部品, false, '飛ばしました');
                return;
            }
            if (中断か() || 止まった) { 手の結果[i].状態 = '始めず'; return; }

            部品 = 手を出す(箱, i + 1, 全体, `${係}　${手.why}`);
            板.変える(係, 'working', `${i + 1}手目: ${手.why.replace(/（.*$/, '')}`);
            途中経過(`${係}: ${手.why}`);

            const 控え = await チームの控えを取る(手);
            const 結果 = await 一手を行う(手, 材料, 出力先);
            if (!結果.ok) {
                手を終える(部品, false, 結果.文);
                手の結果[i].状態 = '失敗';
                止まった = 止まった || { 手: 手.why, 訳: 結果.文, 係 };
                return;
            }

            // 点検係が、実際に確かめる
            板.点検を出す(`${i + 1}手目「${手.why.replace(/（.*$/, '')}」を確かめています…`);
            const 裏 = await チームの裏を取る(手, 材料, 控え);
            手の結果[i].確か = 裏.確か;
            if (裏.確か !== null) 確かめた数 += 1;
            if (裏.確か === false) {
                手を終える(部品, false, `${結果.文}\n点検係: ${裏.文}`);
                手の結果[i].状態 = '失敗';
                止まった = 止まった || { 手: 手.why, 訳: `「できた」と返りましたが、点検係が確かめると、${裏.文}`, 係 };
                return;
            }
            手を終える(部品, true, 裏.確か === true ? `${結果.文}\n✔ 点検係: ${裏.文}` : 結果.文);
            手の結果[i].状態 = '済';
            済み.push(手.why);
            済んだ数 += 1;
        } catch (e) {
            if (部品) 手を終える(部品, false, '失敗しました: ' + e.message);
            手の結果[i].状態 = '失敗';
            止まった = 止まった || { 手: 手.why, 訳: e.message, 係 };
        } finally {
            札[i].終える();
        }
    }

    async function 係を進める(係, 番号たち) {
        for (let n = 0; n < 番号たち.length; n++) {
            await 一手を進める(番号たち[n]);
            // 続けざまに動かすと、画面の書き換えが追いつかない（同じ時刻のIDがぶつかるのも防ぐ）
            if (n < 番号たち.length - 1) await チームの待つ(250);
        }
        const 結果たち = 番号たち.map((i) => 手の結果[i].状態);
        const 数 = (状) => 結果たち.filter((x) => x === 状).length;
        if (数('失敗')) 板.変える(係, 'failed', `止まりました（${数('済')}手済み）`);
        else if (数('始めず')) 板.変える(係, 'idle', `${数('済')}手済み。残りは始めていません`);
        else if (数('飛ばした')) 板.変える(係, 'done', `${数('済')}手済み（飛ばし ${数('飛ばした')}）`);
        else 板.変える(係, 'done', `${数('済')}手、終わりました`);
    }

    await Promise.all([...列たち].map(([係, 番号たち]) => 係を進める(係, 番号たち)));

    const 見る = 手の結果.filter((x) => x.確か !== undefined);
    板.点検を出す(見る.length
        ? `${確かめた数}件を実際に確かめました（確かめようがない手 ${見る.length - 確かめた数}件）`
        : '見るだけの手でした（確かめる必要のある書き込みはありません）');

    チームの記録に残す(段, { 済み, 飛ばした, 止まった, 手の結果, 係たち: [...列たち.keys()], 確かめた数 });
    return { 済み, 飛ばした, 止まった, 手の結果, 係たち: [...列たち.keys()], 確かめた数 };
}

/* ---------- 報告 ---------- */

/**
 * 終わったあとの、チームの報告（司令がまとめる）。
 * 「全部できた」と書けるのは、本当にそうなったときだけ。始めなかった手も、そのまま書く。
 */
function チームの報告を足す(箱, 段, 結果) {
    const 行 = document.createElement('div');
    行.className = 'team-report';
    const 題 = document.createElement('b');
    題.textContent = '📋 司令の報告（係ごと）';
    行.appendChild(題);

    const 係ごと = new Map();
    段.steps.forEach((h, i) => {
        const k = h.agent_name || '?';
        if (!係ごと.has(k)) 係ごと.set(k, []);
        係ごと.get(k).push(結果.手の結果[i].状態);
    });
    for (const [係, 状たち] of 係ごと) {
        const 数 = (s) => 状たち.filter((x) => x === s).length;
        const 部分 = [`${数('済')}手済み`];
        if (数('失敗')) 部分.push(`失敗 ${数('失敗')}`);
        if (数('飛ばした')) 部分.push(`飛ばし ${数('飛ばした')}`);
        if (数('始めず')) 部分.push(`始めず ${数('始めず')}`);
        const p = document.createElement('div');
        p.textContent = `・${係}: ${部分.join(' ／ ')}`;
        行.appendChild(p);
    }

    const 始めず = 段.steps.filter((_, i) => 結果.手の結果[i].状態 === '始めず').map((h) => h.why);
    if (始めず.length) {
        const p = document.createElement('div');
        p.textContent = `始めなかった手: ${始めず.join('、')}`;
        行.appendChild(p);
    }

    const 確か = 結果.手の結果.filter((x) => x.確か === true).length;
    const 食い違い = 結果.手の結果.filter((x) => x.確か === false).length;
    const 点 = document.createElement('div');
    点.textContent = `🛡 点検係: 実際に確かめた ${確か + 食い違い}件（確認できた ${確か}／食い違い ${食い違い}）。`
        + `確かめようがない手は、確かめたことにしていません。`;
    行.appendChild(点);

    箱.appendChild(行);
    行.scrollIntoView({ block: 'nearest' });
}

/* ---------- 記録（あとで見返せる／端末間で同期される） ---------- */

function チームの記録に残す(段, 結果) {
    try {
        const 一覧 = 蓄えを読む(チームの記録の鍵);
        一覧.push({
            時刻: new Date().toISOString(),
            題: 段.label || '作業',
            手数: 段.steps.length,
            済: 結果.済み.length,
            飛ばし: 結果.飛ばした.length,
            止まった: 結果.止まった ? { 手: 結果.止まった.手, 訳: 結果.止まった.訳, 係: 結果.止まった.係 } : null,
            係たち: 結果.係たち,
            確かめた: 結果.確かめた数,
        });
        // 多すぎると探すのが仕事になる。外れた分は、永久の記憶へ残る（同期の仕組みが残す）。
        蓄えを書く(チームの記録の鍵, 一覧.slice(-30));
        try { window.dispatchEvent(new CustomEvent('チームの記録が変わった')); } catch { /* 描き直せなくても記録はある */ }
    } catch { /* 記録できなくても、作業は終わっている */ }
}

window.チームで進めるか = チームで進めるか;
window.チームで手分けして進める = チームで手分けして進める;
window.チームの報告を足す = チームの報告を足す;
