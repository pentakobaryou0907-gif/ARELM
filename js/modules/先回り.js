/**
 * 開いた瞬間に、こちらから声をかける
 *
 * なぜこれが要るのか:
 *   道具は、開いても黙っていた。
 *   知っていることがあっても、こちらから言わなかった。
 *
 *   本当に助けるなら、開いた時点で
 *   「いま見るべきことはこれです」と言えるはず。
 *   探させるのではなく、差し出す。
 *
 * 出し方の決まり:
 *
 *   ・何も無ければ出さない。
 *     毎回何かを出す道具は、そのうち読まれなくなる。
 *
 *   ・急ぐものだけを大きく出す。
 *     全部を同じ大きさで並べたら、探すのと変わらない。
 *
 *   ・押せば、その場所へ連れて行く。
 *     読んで終わりでは、結局こちらが動くことになる。
 *
 *   ・一度閉じたら、その日はもう出さない。
 *     同じことを何度も言うのは、助けではなく邪魔になる。
 */

const 先回りの鍵 = 'areglm_briefing_closed';

/** 今日はもう閉じられたか */
function 今日は閉じられたか() {
    const 日 = typeof 日付文字 === 'function'
        ? 日付文字(new Date())
        : new Date().toISOString().slice(0, 10);
    return localStorage.getItem(先回りの鍵) === 日;
}

function 今日は閉じたことにする() {
    const 日 = typeof 日付文字 === 'function'
        ? 日付文字(new Date())
        : new Date().toISOString().slice(0, 10);
    localStorage.setItem(先回りの鍵, 日);
}

/** 時間帯に合わせた呼びかけ */
function 呼びかけ() {
    const 時 = new Date().getHours();
    const 名 = typeof ツールの名前を読む === 'function' ? ツールの名前を読む().名 : 'アレラム';
    if (時 < 5) return `${名}です。まだ起きていらっしゃいますか。`;
    if (時 < 11) return `おはようございます。${名}です。`;
    if (時 < 18) return `${名}です。`;
    return `お疲れさまです。${名}です。`;
}

async function 先回りして知らせる(強制) {
    if (!強制 && 今日は閉じられたか()) return;
    if (typeof 気づきを集める !== 'function') return;

    const 結果 = await 気づきを集める();

    // 何も無ければ、黙っている。
    // 「特にありません」と毎回出すのは、邪魔でしかない。
    if (!結果.気づき.length && !強制) return;

    古いものを片づける();

    const 幕 = document.createElement('div');
    幕.id = 'briefing';
    幕.className = 'briefing';

    /* --- 頭 --- */
    const 頭 = document.createElement('div');
    頭.className = 'briefing-head';

    const 挨拶 = document.createElement('b');
    挨拶.textContent = 呼びかけ();
    頭.appendChild(挨拶);

    const 閉 = document.createElement('button');
    閉.type = 'button';
    閉.className = 'briefing-close';
    閉.textContent = '×';
    閉.title = '閉じる（今日はもう出しません）';
    閉.addEventListener('click', () => {
        今日は閉じたことにする();
        幕.remove();
    });
    頭.appendChild(閉);
    幕.appendChild(頭);

    /* --- 中身 --- */
    if (!結果.気づき.length) {
        const p = document.createElement('p');
        p.className = 'briefing-none';
        p.textContent = 'いま、お伝えすることはありません。';
        幕.appendChild(p);
    } else {
        const まとめ = document.createElement('p');
        まとめ.className = 'briefing-lead';
        const 部 = [];
        if (結果.数.急ぎ) 部.push(`<b>いま手を打つもの ${結果.数.急ぎ}件</b>`);
        if (結果.数.今日) 部.push(`今日中に見るもの ${結果.数.今日}件`);
        if (結果.数.参考) 部.push(`知っておくもの ${結果.数.参考}件`);
        まとめ.innerHTML = 部.join(' / ');
        幕.appendChild(まとめ);

        結果.気づき.slice(0, 6).forEach((x) => {
            const 行 = document.createElement('div');
            行.className = 'briefing-item w' + x.重さ;

            const 件 = document.createElement('b');
            件.textContent = (x.重さ >= 3 ? '● ' : x.重さ === 2 ? '▲ ' : '・ ') + x.件;
            行.appendChild(件);

            if (x.訳) {
                const 訳 = document.createElement('p');
                訳.textContent = x.訳;
                行.appendChild(訳);
            }
            if (x.手) {
                const 手 = document.createElement('p');
                手.className = 'briefing-how';
                手.textContent = '→ ' + x.手;
                行.appendChild(手);
            }

            // 読んで終わりにしない。押せばその場所へ行く。
            if (x.行き先) {
                const 行く = document.createElement('button');
                行く.type = 'button';
                行く.className = 'btn-link';
                行く.textContent = 'そこへ行く';
                行く.addEventListener('click', () => {
                    if (typeof switchPage === 'function') switchPage(x.行き先);
                    今日は閉じたことにする();
                    幕.remove();
                });
                行.appendChild(行く);
            }

            幕.appendChild(行);
        });

        if (結果.気づき.length > 6) {
            const 残 = document.createElement('p');
            残.className = 'hint';
            残.textContent = `ほかに ${結果.気づき.length - 6}件 あります。`
                + '「いま何かある？」と聞けば全部お伝えします。';
            幕.appendChild(残);
        }
    }

    document.body.appendChild(幕);
}

function 古いものを片づける() {
    document.getElementById('briefing')?.remove();
}

function init先回り() {
    // 立ち上げの直後は、まだデータが揃っていないことがある。
    // 少し待ってから見る。
    setTimeout(() => 先回りして知らせる(false), 2500);

    // 聞かれたら、いつでも出す
    document.getElementById('briefing-open-btn')
        ?.addEventListener('click', () => 先回りして知らせる(true));
}

window.init先回り = init先回り;
window.先回りして知らせる = 先回りして知らせる;
