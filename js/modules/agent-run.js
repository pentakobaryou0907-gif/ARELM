/**
 * 段取りを、一手ずつ実際に進める
 *
 * なぜこれが要るのか:
 *   「エージェント」と名前を付けた以上、
 *   代わりに作業ができないと、名前だけになる。
 *
 *   これまでは、一度に一つの作業しか行えなかった。
 *   「新商品を出す準備をして」と言われても、
 *   そのうち一つだけやって終わっていた。
 *
 *   AI側が段取り（順序のある手順の並び）を返せるようになったので、
 *   ここでそれを受け取り、一手ずつ実際に進める。
 *
 * ここでの決まり:
 *
 *   1. 一手ごとに、何をしたかを画面に書く。
 *      「終わりました」だけで済ませない。
 *      本当にやったのか分からなくなるため。
 *
 *   2. 失敗したらそこで止める。
 *      残りを飛ばして「全部終わりました」とは言わない。
 *      止まった理由と、残っている手順を必ず出す。
 *
 *   3. 戻しにくい手順の前には、必ず確かめる。
 *      まとめて動くものほど、間違えたときの戻しが大変なため。
 *
 *   4. 足りない中身は、その場で聞く。
 *      分からない値を埋めると、それが嘘になる。
 *
 * すべてこの端末の中だけで動く。外部へは一切送らない。
 */

/** いま進めている段取り（進行中は一つだけ） */
let 進行中 = null;

/** 途中でやめてほしいと言われたか */
let 中断された = false;

function 進行中か() {
    return !!進行中;
}

/* ---------- 画面に出す ---------- */

function 段取りの箱(出力先) {
    // 会話の流れの中に置く。別の場所に出すと、
    // どの発言に対する作業なのか分からなくなる。
    const 箱 = document.createElement('div');
    箱.className = 'agent-run';
    if (typeof appendConsoleNode === 'function') {
        appendConsoleNode(箱, 出力先);
    } else {
        const 流れ = document.getElementById(出力先 === 'mainai' ? 'mainai-log' : 'chat-log')
            || document.querySelector('.console-log, .chat-log');
        流れ?.appendChild(箱);
        流れ?.scrollTo({ top: 流れ.scrollHeight, behavior: 'smooth' });
    }
    return 箱;
}

function 見出しを作る(箱, 段) {
    const h = document.createElement('div');
    h.className = 'agent-run-head';
    h.innerHTML = '';

    const 題 = document.createElement('b');
    題.textContent = `▶ ${段.label}`;
    h.appendChild(題);

    const 数 = document.createElement('span');
    数.className = 'agent-run-count';
    数.textContent = `全${段.steps.length}手`;
    h.appendChild(数);

    const やめる = document.createElement('button');
    やめる.type = 'button';
    やめる.className = 'btn btn-sm btn-secondary agent-stop';
    やめる.textContent = 'ここでやめる';
    やめる.addEventListener('click', () => {
        中断された = true;
        やめる.disabled = true;
        やめる.textContent = 'やめています…';
    });
    h.appendChild(やめる);

    箱.appendChild(h);
    return h;
}

function 手を出す(箱, 番号, 全体, 説明) {
    const 行 = document.createElement('div');
    行.className = 'agent-step running';

    const 印 = document.createElement('span');
    印.className = 'agent-step-mark';
    印.textContent = '…';

    const 中 = document.createElement('span');
    中.className = 'agent-step-body';
    const 上 = document.createElement('b');
    上.textContent = `${番号}/${全体}　${説明}`;
    中.appendChild(上);

    行.appendChild(印);
    行.appendChild(中);
    箱.appendChild(行);
    行.scrollIntoView({ block: 'nearest' });
    return { 行, 印, 中 };
}

function 手を終える(部品, ok, 文) {
    部品.行.className = 'agent-step ' + (ok ? 'done' : 'failed');
    部品.印.textContent = ok ? '✓' : '✗';

    const 結果 = document.createElement('small');
    結果.textContent = 文;
    部品.中.appendChild(結果);
}

/* ---------- 足りない中身を、その場で聞く ---------- */

/**
 * 手順に要る中身が空のとき、その場で入力してもらう。
 *
 * ここを飛ばして空のまま進めると、
 * 中身のない商品や、題のないやることが出来上がる。
 * それを後から直すほうが、いま一言聞くより面倒になる。
 */
function 足りないものを聞く(箱, 聞き方, 初期値) {
    return new Promise((応える) => {
        const 行 = document.createElement('div');
        行.className = 'agent-ask';

        const 文 = document.createElement('div');
        文.textContent = 聞き方;
        行.appendChild(文);

        const 入力 = document.createElement('input');
        入力.type = 'text';
        入力.value = 初期値 || '';
        入力.className = 'agent-ask-input';
        行.appendChild(入力);

        const 決める = (値) => {
            入力.disabled = true;
            決定.disabled = true;
            飛ばす.disabled = true;
            応える(値);
        };

        const 決定 = document.createElement('button');
        決定.type = 'button';
        決定.className = 'btn btn-sm btn-primary';
        決定.textContent = '決定';
        決定.addEventListener('click', () => 決める(入力.value.trim()));

        const 飛ばす = document.createElement('button');
        飛ばす.type = 'button';
        飛ばす.className = 'btn btn-sm btn-secondary';
        飛ばす.textContent = 'この手は飛ばす';
        飛ばす.addEventListener('click', () => 決める(null));

        入力.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); 決定.click(); }
        });

        行.appendChild(決定);
        行.appendChild(飛ばす);
        箱.appendChild(行);
        行.scrollIntoView({ block: 'nearest' });
        入力.focus();
    });
}

/** 戻しにくい手の前に、確かめる */
function 確かめる(箱, 文) {
    return new Promise((応える) => {
        const 行 = document.createElement('div');
        行.className = 'agent-ask';

        const 文の箱 = document.createElement('div');
        文の箱.textContent = 文;
        行.appendChild(文の箱);

        const 押したら = (答え) => {
            はい.disabled = true;
            いいえ.disabled = true;
            応える(答え);
        };

        const はい = document.createElement('button');
        はい.type = 'button';
        はい.className = 'btn btn-sm btn-primary';
        はい.textContent = '進める';
        はい.addEventListener('click', () => 押したら(true));

        const いいえ = document.createElement('button');
        いいえ.type = 'button';
        いいえ.className = 'btn btn-sm btn-secondary';
        いいえ.textContent = 'この手は飛ばす';
        いいえ.addEventListener('click', () => 押したら(false));

        行.appendChild(はい);
        行.appendChild(いいえ);
        箱.appendChild(行);
        行.scrollIntoView({ block: 'nearest' });
    });
}

/* ---------- 手順ごとに、要る中身 ---------- */

/**
 * その作業に何が要るか。
 *
 * 中身が空のまま実行すると失敗する作業だけ、ここに書く。
 * 見るだけの作業（在庫を見る等）は要らないので載せない。
 */
const 要る中身 = {
    add_task: [['title', '何をやることとして残しますか']],
    add_memo: [['body', '何を書き留めますか']],
    add_product: [['name', '商品の名前を教えてください']],
    check_duplicate: [['text', 'どんな商品か、言葉にしてください']],
    write_text: [['name', '何についての文章ですか（商品名など）']],
};

/**
 * 文章を作る手は、作る種類によって渡し先が変わる。
 * ここを取り違えると、値はあるのに「足りません」と言われる。
 */
function 文章の頼み方(材料) {
    const 種 = 材料.template || '商品説明';
    const 名 = 材料.name || 材料.item || '';
    if (種.includes('SNS') || 種.includes('Instagram')) return `インスタの投稿文を考えて 商品名は${名}`;
    if (種.includes('発注')) return `品名は${名} で発注メールを書いて`;
    if (種.includes('テックパック') || 種.includes('注記')) return `テックパックの注記を書いて 品名は${名}`;
    return `商品名は${名} の商品説明を書いて`;
}

/* ---------- 実際に進める ---------- */

/**
 * 段取りを進める。
 *
 * @param {{label:string, steps:Array}} 段
 * @param {string} 出力先
 */
async function 段取りを進める(段, 出力先) {
    if (進行中) {
        showNotification('いま別の段取りを進めています。終わってからにしてください。', 'warning');
        return;
    }
    if (!段 || !Array.isArray(段.steps) || !段.steps.length) return;

    進行中 = 段;
    中断された = false;

    // 上のタブに、この作業を並べる。
    //
    // 何が動いているかが上に出ていれば、
    // 画面を行き来して探さずに済む。
    let 作業の目印 = null;
    if (typeof 作業を始める === 'function') {
        作業の目印 = 作業を始める(段.label || '作業', {
            目的: 段.summary || '',
            全周手: 段.steps.length,
            種類: '頼んだ作業',
        });
    }

    const 箱 = 段取りの箱(出力先);
    見出しを作る(箱, 段);

    const 済み = [];
    const 飛ばした = [];
    let 止まった = null;

    try {
        for (let i = 0; i < 段.steps.length; i++) {
            if (中断された) break;

            const 手 = 段.steps[i];
            const 材料 = Object.assign({}, 手.params || {});

            // 上のタブに、いま何手目かを伝える
            if (作業の目印 && typeof 作業を進める === 'function') {
                作業を進める(作業の目印, i + 1, 手.why || 手.action);
            }

            // --- 足りない中身を、先に埋める ---
            let 飛ばす = false;
            for (const [鍵, 聞き方] of (要る中身[手.action] || [])) {
                if (材料[鍵]) continue;
                // 人の手が要ることを、上のタブにも出す。
                // 埋もれると、止まっていることに気づけない。
                if (作業の目印 && typeof 確認を待つ === 'function') {
                    確認を待つ(作業の目印, `${i + 1}手目: ${聞き方}`);
                }
                const 値 = await 足りないものを聞く(箱, `${i + 1}手目: ${聞き方}`, '');
                if (作業の目印 && typeof 作業を進める === 'function') {
                    作業を進める(作業の目印, i + 1, 手.why || 手.action);
                }
                if (値 === null || 値 === '') { 飛ばす = true; break; }
                材料[鍵] = 値;
            }
            if (飛ばす) {
                飛ばした.push(手.why);
                const 部品 = 手を出す(箱, i + 1, 段.steps.length, 手.why);
                手を終える(部品, false, '飛ばしました');
                continue;
            }

            // --- 戻しにくい手は、確かめてから ---
            if (手.confirm) {
                const 進む = await 確かめる(箱, `${i + 1}手目「${手.why}」を進めますか`);
                if (!進む) {
                    飛ばした.push(手.why);
                    const 部品 = 手を出す(箱, i + 1, 段.steps.length, 手.why);
                    手を終える(部品, false, '飛ばしました');
                    continue;
                }
            }

            const 部品 = 手を出す(箱, i + 1, 段.steps.length, 手.why);

            try {
                const 結果 = await 一手を行う(手, 材料, 出力先);
                手を終える(部品, 結果.ok, 結果.文);
                if (結果.ok) {
                    済み.push(手.why);
                } else {
                    止まった = { 手: 手.why, 訳: 結果.文 };
                    break;
                }
            } catch (e) {
                手を終える(部品, false, '失敗しました: ' + e.message);
                止まった = { 手: 手.why, 訳: e.message };
                break;
            }

            // 続けざまに動かすと、画面の書き換えが追いつかない
            await new Promise((r) => setTimeout(r, 250));
        }
    } finally {
        進行中 = null;
        箱.querySelector('.agent-stop')?.remove();

        // 上のタブから片づける。
        // 終わったものが並び続けると、探すのが仕事になる。
        if (作業の目印 && typeof 作業を終える === 'function') {
            作業を終える(作業の目印, 中断された ? '止まった' : '終わった');
        }
    }

    まとめを出す(箱, 段, 済み, 飛ばした, 止まった, 中断された);
}

/**
 * 一手を実際に行う。
 *
 * 文章を作る手だけは、会話の入口へ流す。
 * 文章はAIに作らせるもので、ここで作れるものではないため。
 * 他の手は、すでにある実行の仕組みに任せる。
 */
async function 一手を行う(手, 材料, 出力先) {
    if (手.action === 'write_text') {
        const 頼み = 文章の頼み方(材料);
        if (typeof runConsoleCommand !== 'function') {
            return { ok: false, 文: '会話の入口が読み込まれていません' };
        }
        await runConsoleCommand(頼み, 出力先 || 'mainai');
        return { ok: true, 文: `作りました（${材料.template || '文章'}）` };
    }

    if (typeof 指示を実行する !== 'function') {
        return { ok: false, 文: '実行の仕組みが読み込まれていません' };
    }

    // 画面へ移るだけの手も、指示を実行する が受け持っている
    const 行った = await 指示を実行する({ action: 手.action, params: 材料 }, 出力先);
    return 行った
        ? { ok: true, 文: '行いました' }
        : { ok: false, 文: `「${手.action}」の行い方が作られていません` };
}

/**
 * 終わったあとの報告。
 *
 * ここで「全部終わりました」と書けるのは、
 * 本当に全部終わったときだけにしてある。
 * 途中で止まったのに終わったと言うのが、いちばんたちが悪い。
 */
function まとめを出す(箱, 段, 済み, 飛ばした, 止まった, 中断) {
    const 行 = document.createElement('div');
    行.className = 'agent-summary';

    const 全体 = 段.steps.length;
    const 文 = [];

    if (止まった) {
        行.classList.add('failed');
        文.push(`${全体}手のうち${済み.length}手まで進めて、そこで止まりました。`);
        文.push(`止まったところ: ${止まった.手}`);
        文.push(`理由: ${止まった.訳}`);
        文.push('残りは行っていません。直してから、もう一度言ってください。');
    } else if (中断) {
        行.classList.add('stopped');
        文.push(`${全体}手のうち${済み.length}手まで進めて、やめました。`);
    } else if (飛ばした.length) {
        行.classList.add('partial');
        文.push(`${全体}手のうち${済み.length}手を行いました。`);
        文.push(`飛ばしたもの: ${飛ばした.join('、')}`);
    } else {
        行.classList.add('done');
        文.push(`${全体}手すべて行いました。`);
    }

    文.forEach((t) => {
        const p = document.createElement('div');
        p.textContent = t;
        行.appendChild(p);
    });

    箱.appendChild(行);
    行.scrollIntoView({ block: 'nearest' });

    showNotification(文[0], 止まった ? 'error' : (飛ばした.length || 中断 ? 'warning' : 'success'));
}

window.段取りを進める = 段取りを進める;
window.段取りが進行中か = 進行中か;
