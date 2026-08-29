/**
 * 外部の道具を置き換える計画を、画面に出す
 *
 * なぜ画面に出すのか:
 *   「全部この道具でやれるようにしたい」は、長く続く話。
 *   会話の中に置いておくと消えるし、
 *   何が済んで何が残っているかも分からなくなる。
 *
 *   だから道具自身に持たせて、いつでも見られるようにする。
 *
 * 見せ方の決まり:
 *   「不可」を隠さない。
 *   できないものを一覧の下の方に埋めると、
 *   いつかできると思ったまま待つことになる。
 *   理由まで含めて、同じ大きさで見せる。
 */

// 名前は「置き換えの見た目」にしてある。
// 「状態の見た目」だと requirements-ui.js と衝突し、
// const の二重宣言でページ全体が止まる。検査で見つけた。
const 置き換えの見た目 = {
    '済':   { 印: '✓', 級: 'done',    名: 'この道具でできる' },
    '一部': { 印: '◐', 級: 'partial', 名: '途中までできる' },
    '未':   { 印: '−', 級: 'todo',    名: 'まだ作っていない' },
    '不可': { 印: '✕', 級: 'blocked', 名: '作れない（理由あり）' },
};

/** いま選ばれている絞り込み */
let 置き換えの絞り = '';

function render置き換え計画() {
    const 箱 = document.getElementById('replace-plan');
    if (!箱 || typeof AReGLM_置き換え計画 === 'undefined') return;

    箱.innerHTML = '';

    /* --- 数のまとめ --- */
    const 数 = 置き換えの数();
    const 全 = AReGLM_置き換え計画.length;

    const まとめ = document.createElement('div');
    まとめ.className = 'replace-summary';
    [['済', 数.済], ['一部', 数.一部], ['未', 数.未], ['不可', 数.不可]].forEach(([状, n]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'replace-chip ' + 置き換えの見た目[状].級
            + (置き換えの絞り === 状 ? ' on' : '');
        b.textContent = '';
        const 頭 = document.createElement('b');
        頭.textContent = `${置き換えの見た目[状].印} ${n}`;
        b.appendChild(頭);
        const 注 = document.createElement('small');
        注.textContent = 置き換えの見た目[状].名;
        b.appendChild(注);
        b.addEventListener('click', () => {
            置き換えの絞り = (置き換えの絞り === 状) ? '' : 状;
            render置き換え計画();
        });
        まとめ.appendChild(b);
    });
    箱.appendChild(まとめ);

    const 進み = document.createElement('p');
    進み.className = 'hint';
    進み.textContent = `全${全}件のうち、${数.済}件はこの道具だけで完結しています。`
        + `${数.一部}件は途中まで。${数.不可}件は作れない理由があります（下に書いてあります）。`;
    箱.appendChild(進み);

    /* --- 一覧 --- */
    const 分類ごと = {};
    AReGLM_置き換え計画.forEach((x) => {
        if (置き換えの絞り && x.状態 !== 置き換えの絞り) return;
        (分類ごと[x.分類] = 分類ごと[x.分類] || []).push(x);
    });

    if (!Object.keys(分類ごと).length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'その状態のものはありません。';
        箱.appendChild(p);
        return;
    }

    Object.entries(分類ごと).forEach(([分類, 並び]) => {
        const 見出し = document.createElement('h4');
        見出し.className = 'rule-head';
        見出し.textContent = 分類;
        箱.appendChild(見出し);

        並び.forEach((x) => {
            const 見た = 置き換えの見た目[x.状態];

            const 札 = document.createElement('div');
            札.className = 'replace-item ' + 見た.級;

            const 上 = document.createElement('div');
            上.className = 'replace-head';

            const 印 = document.createElement('span');
            印.className = 'replace-mark';
            印.textContent = 見た.印;

            const 名 = document.createElement('b');
            名.textContent = x.外部;

            const 用 = document.createElement('small');
            用.textContent = x.用途;

            上.appendChild(印);
            上.appendChild(名);
            上.appendChild(用);
            札.appendChild(上);

            const 代 = document.createElement('p');
            代.className = 'replace-alt';
            代.textContent = (x.状態 === '不可' ? 'この道具が受け持つ範囲: ' : 'この道具では: ') + x.代わり;
            札.appendChild(代);

            const 補 = document.createElement('p');
            補.className = 'replace-note';
            補.innerHTML = x.補足;
            札.appendChild(補);

            箱.appendChild(札);
        });
    });

    /* --- 一旦外したもの --- */
    //
    // 外したことを、黙って無かったことにしない。
    // 数だけでも見えるようにしておく。
    if (typeof AReGLM_一旦外した !== 'undefined' && AReGLM_一旦外した.length) {
        const 外 = document.createElement('details');
        外.className = 'replace-hidden';

        const 見出し = document.createElement('summary');
        見出し.textContent = `一旦外したもの ${AReGLM_一旦外した.length}件（販売まわり）`;
        外.appendChild(見出し);

        const 説 = document.createElement('p');
        説.className = 'hint';
        説.textContent = '「いまは見なくてよい」として外したものです。消してはいません。'
            + 'どれも置き換えられないと分かっているので、毎回見ても判断は変わりません。';
        外.appendChild(説);

        AReGLM_一旦外した.forEach((x) => {
            const 行 = document.createElement('p');
            行.className = 'hint';
            行.textContent = `・${x.外部}（${x.用途}）— この道具が受け持つ範囲: ${x.代わり}`;
            外.appendChild(行);
        });
        箱.appendChild(外);
    }

    /* --- いちばん大事な断り --- */
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>「不可」は、時間が経てばできるようになるものではありません。</b>'
        + '販売・決済は法律（資金決済法、カード情報の規格）の話、'
        + '製造と発送は設備の話、SNSへの投稿は各社の規約の話です。'
        + 'そこを曖昧にすると、いつかできると思ったまま待つことになります。'
        + '<br>できない部分は外部を使い、<b>その手前までをこの道具で固める</b>——'
        + 'それが現実に届く形です。';
    箱.appendChild(断り);
}

function init置き換え計画() {
    if (document.getElementById('replace-plan')) render置き換え計画();
}

window.init置き換え計画 = init置き換え計画;
window.render置き換え計画 = render置き換え計画;
