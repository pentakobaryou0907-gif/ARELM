/**
 * 決めておけば、勝手に動く
 *
 * なぜこれが要るのか:
 *   ここまでで「代わりに作業する」までは出来た。
 *   だが、毎回こちらから言わないと動かない。
 *   それでは「全自動」ではない。
 *
 *   いつ動くかを決めておけば、言わなくても動く。
 *   朝になったら、在庫が減ったら、期限が近づいたら——
 *   きっかけを教えておくだけでよい。
 *
 * きっかけは三種類:
 *   時刻   … 毎日8時に、など
 *   曜日   … 毎週月曜に、など
 *   出来事 … 在庫が減ったら、期限が過ぎたら、原価を割ったら
 *
 * 守ること:
 *
 *   ・<b>取り消しにくいものは、勝手にやらない。</b>
 *     確認が要る手順は、確認のまま残す。
 *     自動だからといって、確認を飛ばしてはいけない。
 *
 *   ・<b>外へ出るもの、お金がかかるものは動かさない。</b>
 *     覚えられない作業は、自動でも動かない。
 *
 *   ・<b>動いたことは必ず残す。</b>
 *     知らないうちに何かが起きているのが、いちばん怖い。
 *     いつ・何が・どうなったかを、後から見られるようにする。
 *
 *   ・<b>同じことを何度も繰り返さない。</b>
 *     一度動いたら、次のきっかけまで動かない。
 *
 * すべてこの端末の中だけで動きます。外部へは一切送りません。
 */

const 自動の決まりの鍵 = 'areglm_auto_rules';
const 自動の記録の鍵 = 'areglm_auto_log';

/** 何分ごとに、きっかけが来ていないか見るか */
const 見に行く間隔 = 60 * 1000;

/* ==========================================================
   きっかけの種類
   ========================================================== */

const きっかけたち = [
    {
        値: 'daily',
        題: '毎日この時刻に',
        説: '決めた時刻を過ぎたら、その日一度だけ動きます。',
        中身: '時刻',
    },
    {
        値: 'weekly',
        題: '毎週この曜日に',
        説: '決めた曜日の朝、一度だけ動きます。',
        中身: '曜日',
    },
    {
        値: 'low-stock',
        題: '在庫が少なくなったら',
        説: '残りが決めた数を下回った商品が出たときに動きます。',
        中身: '数',
    },
    {
        値: 'overdue',
        題: '期限を過ぎたやることが出たら',
        説: '締切を過ぎたものが見つかったときに動きます。',
        中身: 'なし',
    },
    {
        値: 'under-cost',
        題: '原価を割った商品が出たら',
        説: '売値が原価以下の商品が見つかったときに動きます。',
        中身: 'なし',
    },
];

/* ==========================================================
   決まりの読み書き
   ========================================================== */

function 自動の決まりを読む() {
    try {
        const r = JSON.parse(localStorage.getItem(自動の決まりの鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 自動の決まりを書く(一覧) {
    localStorage.setItem(自動の決まりの鍵, JSON.stringify(一覧));
}

function 自動の記録を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(自動の記録の鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 自動の記録を残す(中身) {
    const 記録 = 自動の記録を読む();
    記録.push(Object.assign({ とき: new Date().toISOString() }, 中身));
    localStorage.setItem(自動の記録の鍵, JSON.stringify(記録.slice(-100)));
}

/* ==========================================================
   きっかけが来ているか
   ========================================================== */

// 名前は「自動の」を付けてある。
// 「_今日」「_読む」だと 気づき.js とぶつかり、
// const の二重宣言でページ全体が止まる。検査で見つけた。
function 自動の今日() {
    return typeof 日付文字 === 'function'
        ? 日付文字(new Date())
        : new Date().toISOString().slice(0, 10);
}

function 自動で読む(鍵) {
    try {
        const r = JSON.parse(localStorage.getItem(鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

/**
 * この決まりの、きっかけが来ているか。
 *
 * 来ていれば、なぜ来たのかも返す。
 * 「なぜ動いたか」が分からないと、後から確かめようがない。
 */
function きっかけが来ているか(決まり) {
    const いま = new Date();
    const 今日 = 自動の今日();

    // 同じ日に一度動いたものは、もう動かさない。
    // 何度も繰り返すと、やることが重複して増える。
    if (決まり.最後に動いた日 === 今日) return { 来た: false };

    switch (決まり.きっかけ) {
        case 'daily': {
            const [時, 分] = String(決まり.中身 || '08:00').split(':').map(Number);
            const 過ぎた = いま.getHours() > 時
                || (いま.getHours() === 時 && いま.getMinutes() >= (分 || 0));
            return 過ぎた
                ? { 来た: true, 訳: `${決まり.中身} を過ぎました` }
                : { 来た: false };
        }

        case 'weekly': {
            const 曜日たち = ['日', '月', '火', '水', '木', '金', '土'];
            const 今日の曜日 = 曜日たち[いま.getDay()];
            if (今日の曜日 !== 決まり.中身) return { 来た: false };
            // 朝のうちに動かす
            if (いま.getHours() < 7) return { 来た: false };
            return { 来た: true, 訳: `${決まり.中身}曜日になりました` };
        }

        case 'low-stock': {
            const 下限 = Number(決まり.中身) || 3;
            const 少ない = 自動で読む('products').filter((p) => {
                const n = Number(p.quantity);
                return !Number.isNaN(n) && n <= 下限;
            });
            return 少ない.length
                ? {
                    来た: true,
                    訳: `残り${下限}以下の商品が ${少ない.length}点あります`
                        + `（${少ない.slice(0, 3).map((p) => p.name).join('、')}）`,
                }
                : { 来た: false };
        }

        case 'overdue': {
            const 過ぎた = 自動で読む('areglm_tasks').filter((t) => {
                if (t.done || !t.due) return false;
                const 差 = (typeof 日数の差 === 'function')
                    ? 日数の差(t.due, 今日)
                    : Math.round((new Date(t.due) - new Date(今日)) / 86400000);
                return 差 < 0;
            });
            return 過ぎた.length
                ? { 来た: true, 訳: `期限を過ぎたやることが ${過ぎた.length}件あります` }
                : { 来た: false };
        }

        case 'under-cost': {
            const 割れ = 自動で読む('products').filter((p) => {
                const 値 = Number(p.price);
                const 原 = Number(p.cost);
                return 値 > 0 && 原 > 0 && 値 <= 原;
            });
            return 割れ.length
                ? { 来た: true, 訳: `原価を割った商品が ${割れ.length}点あります` }
                : { 来た: false };
        }

        default:
            return { 来た: false };
    }
}

/* ==========================================================
   動かす
   ========================================================== */

/**
 * きっかけの来ている決まりを、順に動かす。
 *
 * 一度に全部動かさない。
 * まとめて動くと、何が起きたのか分からなくなる。
 */
async function 自動で動かす() {
    const 決まりたち = 自動の決まりを読む().filter((x) => x.使う !== false);
    if (!決まりたち.length) return { 動いた: 0 };

    let 動いた = 0;

    for (const 決まり of 決まりたち) {
        const 判定 = きっかけが来ているか(決まり);
        if (!判定.来た) continue;

        // 動いた印を先に付ける。
        // 途中で失敗しても、繰り返し動き続けないようにするため。
        決まり.最後に動いた日 = 自動の今日();
        決まり.最後の訳 = 判定.訳;
        自動の決まりを書き換える(決まり);

        自動の記録を残す({
            名前: 決まり.名前,
            訳: 判定.訳,
            様子: '始めました',
        });

        try {
            await 決まりを実行する(決まり, 判定.訳);
            動いた += 1;
        } catch (e) {
            自動の記録を残す({
                名前: 決まり.名前,
                訳: 判定.訳,
                様子: '途中で止まりました: ' + e.message,
            });
        }

        // 一つずつ。続けて動かすと、画面が追いつかない。
        await new Promise((r) => setTimeout(r, 1500));
    }

    return { 動いた };
}

function 自動の決まりを書き換える(決まり) {
    const 一覧 = 自動の決まりを読む();
    const i = 一覧.findIndex((x) => x.id === 決まり.id);
    if (i >= 0) 一覧[i] = 決まり;
    自動の決まりを書く(一覧);
}

/**
 * 決まりに書かれた作業を実行する。
 *
 * 段取りの仕組みをそのまま使う。
 * 別の実行の仕組みを作ると、
 * 片方だけ直したときに食い違う。
 */
async function 決まりを実行する(決まり, 訳) {
    // まず知らせる。黙って始めない。
    if (typeof showNotification === 'function') {
        showNotification(`自動で「${決まり.名前}」を始めます（${訳}）`, 'info');
    }

    // 何をするかを取ってくる
    let 段 = null;

    if (決まり.作業の種類 === '覚えた作業') {
        const r = await fetch('/api/ai-local/learned-tasks', { cache: 'no-store' });
        const d = r.ok ? await r.json() : { 覚えた作業: [] };
        const 見つけた = (d.覚えた作業 || []).find((x) => x.名前 === 決まり.作業);
        if (!見つけた) throw new Error(`「${決まり.作業}」が見つかりません（忘れられたようです）`);
        段 = {
            label: 見つけた.名前,
            steps: 見つけた.手順.map((h) => ({
                action: h.action,
                why: h.why || h.action,
                params: h.params || {},
                confirm: !!h.confirm,
            })),
        };
    } else {
        const r = await fetch('/api/ai-local/plans', { cache: 'no-store' });
        const d = r.ok ? await r.json() : { plans: [] };
        const 見つけた = (d.plans || []).find((x) => x.name === 決まり.作業);
        if (!見つけた) throw new Error(`「${決まり.作業}」が見つかりません`);

        // 段取りの中身は、会話の仕組みから取る
        const c = await fetch('/api/ai-local/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: 見つけた.label + 'をして',
                session_id: 'auto-' + 決まり.id,
            }),
        });
        const cd = await c.json();
        if (!cd.plan) throw new Error('手順を組み立てられませんでした');
        段 = cd.plan;
    }

    if (typeof 段取りを進める !== 'function') {
        throw new Error('実行の仕組みが読み込まれていません');
    }

    await 段取りを進める(段, 'mainai');

    自動の記録を残す({
        名前: 決まり.名前,
        訳: 訳,
        様子: `${段.steps.length}手を進めました`,
    });
}

/* ==========================================================
   見張り
   ========================================================== */

let 見張りの札 = null;

function 自動を見張り始める() {
    if (見張りの札) return;

    // 立ち上げ直後に一度見る。
    // ただし少し待つ。データが揃う前に見ても、正しく判断できない。
    setTimeout(() => 自動で動かす(), 8000);

    見張りの札 = setInterval(() => 自動で動かす(), 見に行く間隔);
}

function 自動の見張りを止める() {
    clearInterval(見張りの札);
    見張りの札 = null;
}

window.きっかけたち = きっかけたち;
window.自動の決まりを読む = 自動の決まりを読む;
window.自動の決まりを書く = 自動の決まりを書く;
window.自動の記録を読む = 自動の記録を読む;
window.きっかけが来ているか = きっかけが来ているか;
window.自動で動かす = 自動で動かす;
window.自動を見張り始める = 自動を見張り始める;
window.自動の見張りを止める = 自動の見張りを止める;
