/**
 * 分析を、画面に出す
 *
 * 出し方の決まり:
 *   ・数を並べて終わりにしない。
 *     数のあとに「それが何を意味するか」「次に何をするか」を必ず書く。
 *     数だけ見せられても、次にすることは分からない。
 *
 *   ・手を打つべきものを先に出す。
 *     良い知らせに埋もれさせない。
 *
 *   ・材料が無いときは、無いと言う。
 *     無理に何か言うと、それが当てずっぽうになる。
 */

async function render分析() {
    const 箱 = document.getElementById('analysis');
    if (!箱) return;

    箱.innerHTML = '<p class="hint">分析しています…</p>';
    const d = すべて分析する();
    箱.innerHTML = '';

    /* --- まとめ --- */
    const 頭 = document.createElement('p');
    頭.className = d.手を打つ.length ? 'guard-off' : 'guard-on';
    頭.textContent = d.まとめ;
    箱.appendChild(頭);

    /* --- 手を打つべきもの（先に出す） --- */
    if (d.手を打つ.length) {
        d.手を打つ.forEach((x) => 気づきを出す(箱, x, true));
    }

    /* --- 区分ごと --- */
    d.区分.forEach((r) => {
        const 見出し = document.createElement('h5');
        見出し.className = 'rule-head';
        見出し.textContent = r.見出し + (r.数 ? `（${r.数}）` : '');
        箱.appendChild(見出し);

        if (!r.ある) {
            const p = document.createElement('p');
            p.className = 'hint';
            p.textContent = r.訳;
            箱.appendChild(p);
            return;
        }

        (r.気づき || []).filter((x) => x.重さ < 2).forEach((x) => 気づきを出す(箱, x, false));
    });

    /* --- 正直に書く --- */
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>世の中の流行は分かりません。</b>'
        + '外を見に行かない決まりだからです。'
        + '分かるのは「あなたのデータが何を言っているか」だけです。<br>'
        + 'ただ、それは弱い材料ではありません。'
        + 'よそのブランドが何をしていようと、'
        + '<b>あなたの商品がどう売れたか</b>のほうが、あなたには効きます。<br>'
        + '外の情報が要るときは、調べたものを「リサーチノート」に貼れば、'
        + 'こちらで整理して、あなたのデータと突き合わせます。';
    箱.appendChild(断り);

    const 再 = document.createElement('button');
    再.type = 'button';
    再.className = 'btn btn-sm btn-secondary';
    再.textContent = '↻ もう一度分析する';
    再.addEventListener('click', render分析);
    箱.appendChild(再);
}

function 気づきを出す(箱, x, 目立たせる) {
    const 行 = document.createElement('div');
    行.className = 'analysis-item w' + x.重さ + (目立たせる ? ' top' : '');

    const 件 = document.createElement('b');
    件.textContent = (x.重さ >= 2 ? '● ' : x.重さ === 1 ? '・ ' : '✓ ')
        + (x.どこ && 目立たせる ? `[${x.どこ}] ` : '') + x.件;
    行.appendChild(件);

    if (x.数) {
        const 数 = document.createElement('small');
        数.className = 'analysis-num';
        数.textContent = x.数;
        行.appendChild(数);
    }
    if (x.意味) {
        const 意 = document.createElement('p');
        意.textContent = x.意味;
        行.appendChild(意);
    }
    if (x.次に) {
        const 次 = document.createElement('p');
        次.className = 'analysis-next';
        次.textContent = '→ ' + x.次に;
        行.appendChild(次);
    }

    箱.appendChild(行);
}

function init分析画面() {
    if (document.getElementById('analysis')) render分析();
}

window.init分析画面 = init分析画面;
window.render分析 = render分析;
