/**
 * 押せば全部が新しくなるボタン
 *
 * なぜこれが要るのか:
 *
 *   新しくしたいものが、あちこちに散らばっている。
 *   学習の取り込み、在庫の同期、点検、控え——
 *   どれも別の画面にあって、順に押して回ることになる。
 *
 *   一つずつ押して回るのは、道具のやることではない。
 *   押せば全部やる。それだけでよい。
 *
 * 気をつけていること:
 *
 *   ・<b>一つ失敗しても、残りは続ける。</b>
 *     途中で止まると、どこまで進んだか分からなくなる。
 *
 *   ・<b>何がどうなったかを、必ず出す。</b>
 *     「更新しました」だけでは、本当に何かしたのか分からない。
 *
 *   ・<b>時間のかかるものは、後に回す。</b>
 *     早く終わるものから片づけて、進んでいるのが見えるようにする。
 *
 *   ・<b>お金がかかることはしない。</b>
 *     押しただけで課金されるボタンは作らない。
 */

/** 更新する中身。上から順に行う。 */
const 更新する中身 = [
    {
        名: '控えを取る',
        説: 'いまのデータを、この端末の中に写しておく',
        重さ: '軽い',
        行う: async () => {
            if (typeof saveSnapshotToServer === 'function') {
                await saveSnapshotToServer();
                return '控えを取りました';
            }
            // 仕組みが無ければ、ここで自分で取る。
            // 「できません」と言うだけでは、控えが残らない。
            const 中身 = {};
            Object.keys(localStorage).forEach((k) => {
                if (!k.startsWith('areglm_控え_')) 中身[k] = localStorage.getItem(k);
            });
            const 名 = 'areglm_控え_' + new Date().toISOString().slice(0, 19);
            localStorage.setItem(名, JSON.stringify(中身));
            return `控えを取りました（${Object.keys(中身).length}項目）`;
        },
    },
    {
        名: 'ツールを点検する',
        説: '壊れているところがないかを見る',
        重さ: '軽い',
        行う: async () => {
            // 点検は画面側の仕組み。サーバーの口は無い。
            //
            // はじめ /api/self-check を呼んでいて、
            // 「つながりませんでした」とだけ出ていた。
            // 無いものを呼んでいたので、当然つながらない。
            if (typeof selfCheckRun !== 'function') {
                return '点検の仕組みが読み込まれていません';
            }
            selfCheckRun();

            // 少し待つ。描き終わる前に数えると、まだ0件になる。
            await new Promise((r) => setTimeout(r, 800));

            // 画面の中身を数えるのはやめる。
            // 描き方を変えたとたんに数え方が壊れる。
            // 元の結果を直接読むほうが確か。
            const 結果 = (typeof 点検結果を読む === 'function') ? 点検結果を読む() : [];
            if (!結果.length) return '点検しました';

            const 悪い = 結果.filter((x) => x.状態 === 'ng' || x.state === 'ng').length;
            const 気になる = 結果.filter((x) => x.状態 === 'warn' || x.state === 'warn').length;

            if (悪い) return `${結果.length}件中 ${悪い}件に問題があります`;
            if (気になる) return `${結果.length}件中 ${気になる}件が気になります`;
            return `${結果.length}件すべて問題ありません`;
        },
    },
    {
        名: '自動で動くものを見る',
        説: 'きっかけが来ているものがあれば、いま動かす',
        重さ: '軽い',
        行う: async () => {
            if (typeof 自動で動かす !== 'function') return '自動の仕組みがありません';
            const r = await 自動で動かす();
            return r.動いた ? `${r.動いた}件 動きました` : 'いま動くものはありません';
        },
    },
    {
        名: '自分を見直す',
        説: '覚えたことの質や、繰り返している手順を見る',
        重さ: '重い',
        行う: async () => {
            if (typeof 自分を見る !== 'function') return '見直しの仕組みがありません';
            const d = await 自分を見る(true);
            if (!d) return '見直せませんでした';
            const 直す = (d.気づき || []).filter((x) => x.重さ >= 2).length;
            return 直す ? `${直す}件、見直したほうがよい点があります` : '大きな問題はありません';
        },
    },
    {
        名: '分析をやり直す',
        説: '商品・SNS・売上を見直す',
        重さ: '軽い',
        行う: async () => {
            if (typeof すべて分析する !== 'function') return '分析の仕組みがありません';
            const d = すべて分析する();
            return d.まとめ;
        },
    },
    {
        名: '記録を片づける',
        説: '古い記録を削り、かぎや連絡先が混ざっていたら伏せる',
        重さ: '軽い',
        行う: async () => {
            const r = await fetch('/api/tidy-logs', { method: 'POST' }).catch(() => null);
            if (!r || !r.ok) return '片づけの仕組みにつながりませんでした';
            const d = await r.json();
            return d.訳 || '片づけました';
        },
    },
    {
        名: '画面を描き直す',
        説: '新しくなった中身を、画面に反映する',
        重さ: '軽い',
        行う: async () => {
            const 描き直す = [
                'refreshInventory', 'renderTaskList', 'loadBrandsData',
                'render自動の決まり', 'render作業を教える', 'renderSNS分析',
                'render分析', 'render育ち具合',
            ];
            let 数 = 0;
            描き直す.forEach((名) => {
                if (typeof window[名] === 'function') {
                    try { window[名](); 数 += 1; } catch (e) {
                        // 一つ描き直せなくても、他は描き直す。
                        console.warn(名, e.message);
                    }
                }
            });
            return `${数}か所を描き直しました`;
        },
    },
];

async function まとめて更新する(ボタン) {
    const 箱 = document.getElementById('update-all-result');
    if (箱) 箱.innerHTML = '';

    const 元 = ボタン ? ボタン.textContent : '';
    if (ボタン) { ボタン.disabled = true; }

    const 結果 = [];

    // 軽いものから先に。進んでいるのが見えるように。
    const 順 = [...更新する中身].sort((a, b) => (a.重さ === '重い' ? 1 : 0) - (b.重さ === '重い' ? 1 : 0));

    for (let i = 0; i < 順.length; i++) {
        const 一つ = 順[i];
        if (ボタン) ボタン.textContent = `${i + 1}/${順.length} ${一つ.名}…`;

        const 行 = document.createElement('div');
        行.className = 'update-row doing';
        行.textContent = `⋯ ${一つ.名}`;
        if (箱) 箱.appendChild(行);

        try {
            const 訳 = await 一つ.行う();
            行.className = 'update-row done';
            行.textContent = `✓ ${一つ.名}：${訳}`;
            結果.push({ 名: 一つ.名, ok: true, 訳 });
        } catch (e) {
            // 一つ失敗しても、残りは続ける。
            // 途中で止まると、どこまで進んだか分からなくなる。
            行.className = 'update-row failed';
            行.textContent = `✗ ${一つ.名}：${e.message}`;
            結果.push({ 名: 一つ.名, ok: false, 訳: e.message });
        }
    }

    if (ボタン) { ボタン.disabled = false; ボタン.textContent = 元; }

    const 失敗 = 結果.filter((x) => !x.ok).length;
    showNotification(
        失敗 ? `${結果.length}件中 ${失敗}件が失敗しました` : `${結果.length}件すべて終わりました`,
        失敗 ? 'warning' : 'success');

    if (箱) {
        const しめ = document.createElement('p');
        しめ.className = 失敗 ? 'guard-off' : 'guard-on';
        しめ.textContent = `${new Date().toLocaleTimeString('ja-JP')} に更新しました`
            + (失敗 ? `（${失敗}件は失敗）` : '');
        箱.appendChild(しめ);
    }

    const いま = new Date();
    localStorage.setItem('areglm_last_update_all', いま.toISOString());

    // 実行のたびに更新される表示が、更新後もそのままだった。
    // 「最後に更新したのは」の表示を、その場で今の時刻に直す。
    const 最後欄 = document.getElementById('update-all-last');
    if (最後欄) 最後欄.textContent = `最後に更新したのは ${いま.toLocaleString('ja-JP')}`;

    return 結果;
}

function renderまとめて更新() {
    const 箱 = document.getElementById('update-all');
    if (!箱) return;

    箱.innerHTML = '';

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-primary btn-lg';
    b.textContent = '↻ まとめて更新する';
    b.addEventListener('click', () => まとめて更新する(b));
    箱.appendChild(b);

    const 中身 = document.createElement('p');
    中身.className = 'hint';
    中身.textContent = '押すと、次を順に行います: '
        + 更新する中身.map((x) => x.名).join(' → ');
    箱.appendChild(中身);

    const 最後 = localStorage.getItem('areglm_last_update_all');
    const s = document.createElement('small');
    s.id = 'update-all-last';
    s.className = 'hint';
    s.textContent = 最後 ? `最後に更新したのは ${new Date(最後).toLocaleString('ja-JP')}` : '';
    箱.appendChild(s);

    const 結果 = document.createElement('div');
    結果.id = 'update-all-result';
    結果.className = 'update-result';
    箱.appendChild(結果);

    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>お金がかかることはしません。</b>'
        + '押しただけで課金されるボタンは作りません。<br>'
        + '<b>一つ失敗しても、残りは続けます。</b>'
        + '途中で止まると、どこまで進んだか分からなくなるためです。<br>'
        + '<b>何がどうなったかを、その場に全部出します。</b>';
    箱.appendChild(断り);
}

function initまとめて更新() {
    if (document.getElementById('update-all')) renderまとめて更新();
}

window.initまとめて更新 = initまとめて更新;
window.まとめて更新する = まとめて更新する;
