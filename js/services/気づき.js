/**
 * 気づいたことを、こちらから言う
 *
 * なぜこれが要るのか:
 *   これまでは、聞かれてから答える道具だった。
 *   在庫が切れかけていても、締切が来ていても、
 *   原価を割っていても、こちらからは何も言わなかった。
 *
 *   知っているのに黙っているのは、
 *   知らないのと同じか、それより悪い。
 *
 *   だから、持っているデータを見て、
 *   いま言うべきことがあれば、自分から言う。
 *
 * 見る決まり:
 *
 *   ・数えられることだけを言う。
 *     「そろそろ売れそうです」のような当てずっぽうは言わない。
 *     言えるのは「残り2点です」「3日過ぎています」まで。
 *
 *   ・急ぐものから並べる。
 *     全部を同じ重さで並べると、大事なものが埋もれる。
 *
 *   ・何も無ければ「何もありません」と言う。
 *     無理に見つけると、毎回何かを言う道具になり、
 *     そのうち読まれなくなる。
 *
 *   ・言うだけで終わらせない。
 *     直せるものには、その場で直す手を添える。
 *
 * すべてこの端末の中だけで見ます。外部へは一切送りません。
 */

/** 在庫がこれを下回ったら知らせる */
const 少ない在庫 = 3;

/** 何日先の予定まで見るか */
const 先を見る日数 = 3;

/** 何日ぶん記録が無かったら、途切れたとみなすか */
const 記録が途切れる日数 = 7;

function _読む(鍵) {
    try {
        const r = JSON.parse(localStorage.getItem(鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function _今日() {
    return typeof 今日 === 'function' ? 今日() : new Date().toISOString().slice(0, 10);
}

/**
 * 日数の差。
 *
 * 引数の順に気をつけること。**a から b を引く**。
 *   _日数の差('2026-08-17', '2026-08-21') → -4
 *
 * つまり「期限 − 今日」を渡すと、
 * 過ぎているときに負、これからのときに正になる。
 *
 * ここを逆に思い込んで、期限切れのタスクが
 * まったく出てこなかった。
 * 代わりの実装（下の行）も逆向きに書いていて、
 * 本体と代わりで答えが食い違っていた。
 */
function _日数の差(a, b) {
    if (typeof 日数の差 === 'function') return 日数の差(a, b);
    return Math.round((new Date(a) - new Date(b)) / 86400000);
}

/* ==========================================================
   見るところ

   それぞれ「気づき」を返す。
   重さ: 3=いま手を打つ 2=今日中に見る 1=知っておく
   ========================================================== */

const 見張るもの = [

    /** やることの締切 */
    function 締切(いま) {
        const 出 = [];
        const 今 = _今日();

        _読む('areglm_tasks').forEach((t) => {
            if (t.done || !t.due) return;
            const 差 = _日数の差(t.due, 今);   // 期限 − 今日

            if (差 < 0) {
                出.push({
                    重さ: 3,
                    件: `「${t.title}」が ${-差}日 過ぎています`,
                    訳: `期限は ${t.due} でした。`,
                    手: 'いま終わらせるか、期限を引き直してください。',
                    行き先: 'dashboard',
                });
            } else if (差 === 0) {
                出.push({
                    重さ: 3,
                    件: `「${t.title}」は今日までです`,
                    訳: '',
                    手: '',
                    行き先: 'dashboard',
                });
            } else if (差 <= 先を見る日数) {
                出.push({
                    重さ: 1,
                    件: `「${t.title}」まであと${差}日`,
                    訳: `${t.due} が期限です。`,
                    手: '',
                    行き先: 'dashboard',
                });
            }
        });
        return 出;
    },

    /** 在庫の残り */
    function 在庫(いま) {
        const 出 = [];
        const 品 = _読む('products');

        const 切れた = 品.filter((p) => Number(p.quantity) === 0);
        const 少ない = 品.filter((p) => {
            const n = Number(p.quantity);
            return n > 0 && n <= 少ない在庫;
        });

        if (切れた.length) {
            出.push({
                重さ: 3,
                件: `${切れた.length}点が在庫切れです`,
                訳: 切れた.slice(0, 3).map((p) => p.name).join('、')
                    + (切れた.length > 3 ? ' ほか' : ''),
                手: '補充するか、販売を止めてください。切れたまま出していると、注文が入ってから困ります。',
                行き先: 'inventory',
            });
        }
        if (少ない.length) {
            出.push({
                重さ: 2,
                件: `${少ない.length}点が残りわずかです`,
                訳: 少ない.slice(0, 3).map((p) => `${p.name}（残り${p.quantity}）`).join('、'),
                手: '発注の準備をしておくと、切らさずに済みます。',
                行き先: 'inventory',
            });
        }
        return 出;
    },

    /** 原価を割っていないか */
    function 原価(いま) {
        const 出 = [];
        const 割れ = _読む('products').filter((p) => {
            const 値 = Number(p.price);
            const 原 = Number(p.cost);
            return 値 > 0 && 原 > 0 && 値 <= 原;
        });

        if (割れ.length) {
            出.push({
                重さ: 3,
                件: `${割れ.length}点が原価を下回っています`,
                訳: 割れ.slice(0, 3)
                    .map((p) => `${p.name}（原価¥${p.cost} → 売値¥${p.price}）`).join('、'),
                手: '売るほど赤字になります。値段を見直してください。',
                行き先: 'inventory',
            });
        }
        return 出;
    },

    /** 今日と明日の予定 */
    function 予定(いま) {
        const 出 = [];
        const 今 = _今日();

        _読む('areglm_events').forEach((e) => {
            const 日 = e.date || e.日;
            if (!日) return;
            const 差 = _日数の差(日, 今);   // 予定日 − 今日
            if (差 === 0) {
                出.push({
                    重さ: 2,
                    件: `今日: ${e.title || e.題 || '予定'}`,
                    訳: e.time ? `${e.time} から` : '',
                    手: '',
                    行き先: 'dashboard',
                });
            } else if (差 === 1) {
                出.push({
                    重さ: 1,
                    件: `明日: ${e.title || e.題 || '予定'}`,
                    訳: '',
                    手: '',
                    行き先: 'dashboard',
                });
            }
        });
        return 出;
    },

    /** 溜まったままの投稿 */
    function 投稿(いま) {
        const 出 = [];
        const 待ち = _読む('areglm_sns_queue').filter((x) => !x.posted && !x.出した);

        if (待ち.length >= 3) {
            出.push({
                重さ: 1,
                件: `投稿の下書きが ${待ち.length}件 溜まっています`,
                訳: '作ったまま出していないものがあります。',
                手: '出すか、要らないものは消してください。',
                行き先: 'sns',
            });
        }
        return 出;
    },

    /** 記録が途切れていないか */
    function 記録(いま) {
        const 出 = [];
        const 売 = _読む('areglm_sales').concat(_読む('sales'));
        if (!売.length) return 出;

        const 最後 = 売
            .map((s) => s.date || s.日 || '')
            .filter(Boolean)
            .sort()
            .pop();
        if (!最後) return 出;

        const 差 = _日数の差(_今日(), 最後);   // 今日 − 最後（空いた日数）
        if (差 >= 記録が途切れる日数) {
            出.push({
                重さ: 1,
                件: `売上の記録が ${差}日 空いています`,
                訳: `最後は ${最後} でした。`,
                手: '売れていないのか、記録し忘れているのか、どちらかです。',
                行き先: 'inventory',
            });
        }
        return 出;
    },

    /** 外へ出ようとしたものが止められていないか */
    function 外への通信(いま) {
        const 出 = [];
        let 記録 = [];
        try { 記録 = JSON.parse(localStorage.getItem('areglm_blocked_out') || '[]'); } catch { 記録 = []; }
        if (!記録.length) return 出;

        // 今日止めたものだけを見る。古いものは毎回言っても仕方がない。
        const 今日の = 記録.filter((x) => (x.とき || '').slice(0, 10) === _今日());
        if (今日の.length) {
            const 先 = [...new Set(今日の.map((x) => {
                try { return new URL(x.行き先).hostname; } catch { return x.行き先; }
            }))];
            出.push({
                重さ: 2,
                件: `外へ出ようとした通信を ${今日の.length}件 止めました`,
                訳: `行き先: ${先.slice(0, 3).join('、')}`,
                手: '心当たりがなければ、そのままで問題ありません。止めてあります。',
                行き先: 'settings',
            });
        }
        return 出;
    },

    /** 覚えたことが保存できているか */
    function 学習の保存(いま) {
        // ここは非同期で確かめるので、別に扱う（下の 気づきを集める で行う）
        return [];
    },
];

/**
 * いま言うべきことを集める。
 *
 * @returns {Promise<{気づき: Array, 数: object}>}
 */
async function 気づきを集める() {
    const いま = new Date();
    let 全部 = [];

    見張るもの.forEach((見る) => {
        try {
            全部 = 全部.concat(見る(いま) || []);
        } catch (e) {
            // 一つが失敗しても、他は出す。
            // ここで止まると、何も言えなくなる。
            console.warn('気づきを見る途中で失敗:', e.message);
        }
    });

    // 覚えたことが保存できているか（これは外に聞く）
    try {
        const r = await fetch('/api/ai-local/writable', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            if (!d['書ける']) {
                全部.push({
                    重さ: 3,
                    件: '覚えたことが保存できていません',
                    訳: d['隔離された場所で動いている']
                        ? '書き込めない場所でアプリが動いています。学習が消えます。'
                        : (d['訳'] || ''),
                    手: d['直し方'] || '',
                    行き先: 'settings',
                });
            }
        }
    } catch {
        // 自作AIが止まっているだけかもしれない。ここでは騒がない。
    }

    全部.sort((a, b) => b.重さ - a.重さ);

    const 数 = { 急ぎ: 0, 今日: 0, 参考: 0 };
    全部.forEach((x) => {
        if (x.重さ >= 3) 数.急ぎ += 1;
        else if (x.重さ === 2) 数.今日 += 1;
        else 数.参考 += 1;
    });

    return { 気づき: 全部, 数 };
}

/**
 * 気づきを、話し言葉にする。
 *
 * エージェントが声で返すときや、
 * 「いま何かある？」と聞かれたときに使う。
 */
function 気づきを言葉に(結果) {
    const 気 = 結果.気づき;
    if (!気.length) {
        return 'いま、お伝えすることはありません。';
    }

    const 行 = [];
    const 急 = 気.filter((x) => x.重さ >= 3);
    const 今 = 気.filter((x) => x.重さ === 2);
    const 参 = 気.filter((x) => x.重さ === 1);

    if (急.length) {
        行.push(`いま手を打ったほうがよいものが ${急.length}件 あります。`);
        急.forEach((x) => {
            行.push(`・${x.件}`);
            if (x.手) 行.push(`　→ ${x.手}`);
        });
    }
    if (今.length) {
        if (行.length) 行.push('');
        行.push(`今日中に見ておくもの: ${今.length}件`);
        今.forEach((x) => 行.push(`・${x.件}`));
    }
    if (参.length) {
        if (行.length) 行.push('');
        行.push(`知っておくだけでよいもの: ${参.length}件`);
        参.forEach((x) => 行.push(`・${x.件}`));
    }

    return 行.join('\n');
}

window.気づきを集める = 気づきを集める;
window.気づきを言葉に = 気づきを言葉に;
