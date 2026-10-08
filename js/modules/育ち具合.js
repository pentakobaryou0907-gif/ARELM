/**
 * いま何がどこまで動いているかを、目に見える形で出す
 *
 * なぜこれが要るのか:
 *   「実際に動いているのか、本当に実行できているのかが全く分からない」
 *   と言われた。もっともな指摘だった。
 *
 *   こちらは作ったつもりでも、
 *   画面に出ていなければ、動いていないのと同じ。
 *   数字が動かなければ、育っているかも分からない。
 *
 *   だから、実際の数を出す。
 *   作り話ではなく、いま保存されているものを数えて出す。
 *
 * 出すもの:
 *   ・覚えた言葉の数（実際の保存から数える）
 *   ・覚えた拍の数と、目安に対する割合
 *   ・待ち受けが動いているか
 *   ・最後にいつ反応したか
 *
 * 数えられないことは出しません。
 */

/** 実際に動いた記録（呼ばれた・聞き取れた・覚えた） */
const 動いた記録の鍵 = 'areglm_voice_events';

function 動いたことを残す(種類, 中身) {
    let 記録 = [];
    try { 記録 = JSON.parse(localStorage.getItem(動いた記録の鍵) || '[]'); } catch { 記録 = []; }
    記録.push({ 種類, 中身: String(中身 || '').slice(0, 60), とき: new Date().toISOString() });
    localStorage.setItem(動いた記録の鍵, JSON.stringify(記録.slice(-50)));
}

function 動いた記録を読む() {
    try { return JSON.parse(localStorage.getItem(動いた記録の鍵) || '[]'); } catch { return []; }
}

function いつ(とき) {
    const 差 = Date.now() - new Date(とき).getTime();
    const 分 = Math.round(差 / 60000);
    if (分 < 1) return 'たった今';
    if (分 < 60) return `${分}分前`;
    const 時 = Math.round(分 / 60);
    if (時 < 24) return `${時}時間前`;
    return `${Math.round(時 / 24)}日前`;
}

async function render育ち具合() {
    const 箱 = document.getElementById('voice-growth');
    if (!箱) return;

    箱.innerHTML = '';

    /* --- 覚えた言葉（実際の保存から数える） --- */
    const 言葉たち = (typeof 覚えた声を両方から読む === 'function')
        ? await 覚えた声を両方から読む()
        : [];

    /* --- 覚えた拍 --- */
    const 拍 = (typeof 拍の育ち具合 === 'function')
        ? 拍の育ち具合()
        : { 使える拍: 0, 覚えた拍: 0, 割合: 0, 中身: [] };

    /* --- 待ち受け --- */
    let 待ち = null;
    try {
        const r = await fetch('/api/voice-listener', { cache: 'no-store' });
        if (r.ok) 待ち = await r.json();
    } catch { /* 読めなければ出さない */ }

    /* --- 並べる --- */
    const 表 = document.createElement('div');
    表.className = 'growth-list';

    const 一行 = (名, 値, 説, 良い) => {
        const 行 = document.createElement('div');
        行.className = 'growth-row' + (良い ? ' ok' : '');
        const n = document.createElement('span');
        n.className = 'growth-name';
        n.textContent = 名;
        const v = document.createElement('b');
        v.textContent = 値;
        const s = document.createElement('small');
        s.textContent = 説 || '';
        行.appendChild(n);
        行.appendChild(v);
        行.appendChild(s);
        表.appendChild(行);
    };

    一行('覚えた言葉', `${言葉たち.length}語`,
        言葉たち.length ? 言葉たち.slice(0, 4).map((x) => x.言葉).join('、') : 'まだありません',
        言葉たち.length > 0);

    一行('覚えた拍（日本語）', `${拍.使える拍} / ${拍.目安 || 100}`,
        拍.使える拍 >= 10
            ? '教えていない言葉も組み立てられます'
            : `あと${Math.max(0, 10 - 拍.使える拍)}種類で組み立てを試せます`,
        拍.使える拍 >= 10);

    // 他の言語も使っていれば、そのぶんだけ出す。
    // 使っていない言語まで並べても、読むものが増えるだけ。
    if (typeof 言語ごとの育ち === 'function') {
        const 語 = 言語ごとの育ち();
        const 他 = Object.entries(語)
            .filter(([名, n]) => 名 !== '日本語' && n > 0);
        if (他.length) {
            一行('ほかの言語', 他.map(([名, n]) => `${名} ${n}`).join(' / '),
                '使えば、同じように覚えます', true);
        }
    }

    if (待ち) {
        一行('待ち受け', 待ち.動いているか ? '動いています' : '止まっています',
            待ち.動いているか ? '画面を閉じていても応じます' : '画面を開いている間だけ',
            待ち.動いているか);
    }

    箱.appendChild(表);

    /* --- 拍の育ち具合を、棒で見せる --- */
    if (拍.使える拍 > 0) {
        const 溝 = document.createElement('div');
        溝.className = 'growth-bar';
        const 中 = document.createElement('span');
        中.style.width = Math.min(100, 拍.割合) + '%';
        溝.appendChild(中);
        箱.appendChild(溝);

        const 説 = document.createElement('p');
        説.className = 'hint';
        説.textContent = `使うほど増えます。覚えた拍: ${拍.中身.slice(0, 30).join('・')}`
            + (拍.中身.length > 30 ? ` ほか${拍.中身.length - 30}種類` : '');
        箱.appendChild(説);
    }

    /* --- 実際に動いた記録 --- */
    const 記録 = 動いた記録を読む();
    const 見出し = document.createElement('h5');
    見出し.className = 'rule-head';
    見出し.textContent = '実際に動いた記録';
    箱.appendChild(見出し);

    if (!記録.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'まだ記録がありません。'
            + '呼びかけたり、言葉を覚えさせたりすると、ここに残ります。';
        箱.appendChild(p);
    } else {
        const 並び = document.createElement('ul');
        並び.className = 'growth-log';
        記録.slice(-8).reverse().forEach((x) => {
            const li = document.createElement('li');
            li.textContent = `${いつ(x.とき)}　${x.種類}${x.中身 ? '：' + x.中身 : ''}`;
            並び.appendChild(li);
        });
        箱.appendChild(並び);
    }

    const 再 = document.createElement('button');
    再.type = 'button';
    再.className = 'btn btn-sm btn-secondary';
    再.textContent = '↻ いまの数を見る';
    再.addEventListener('click', render育ち具合);
    箱.appendChild(再);
}

function init育ち具合() {
    if (document.getElementById('voice-growth')) render育ち具合();
}

window.init育ち具合 = init育ち具合;
window.render育ち具合 = render育ち具合;
window.動いたことを残す = 動いたことを残す;
