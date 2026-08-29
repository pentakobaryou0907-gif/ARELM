/**
 * 真贋の照合画面
 *
 * 台帳（真贋台帳.js）に控えた指紋と、持ってきた画像を突き合わせる。
 *
 * 気をつけていること:
 *   ・<b>選んだ画像は、どこへも送らない。</b>
 *     この画面の中で読み、指紋を取って、その場で比べるだけ。
 *   ・<b>言い切らない。</b>
 *     「ほぼ同じ」「似ている」は、目で見て確かめる材料であって、
 *     証拠ではない。そう書いておく。
 */

function 台帳の数を出す() {
    const 欄 = document.getElementById('shinngan-count');
    if (!欄 || !window.AReGLM_真贋) return;
    const 数 = AReGLM_真贋.台帳を読む().length;
    欄.textContent = 数
        ? `いま ${数}件を控えています`
        : 'まだ何も控えていません（何か作ると、そこから始まります）';
}

function 照合の結果を出す(結果) {
    const 箱 = document.getElementById('shinngan-result');
    if (!箱) return;

    箱.innerHTML = '';

    const 札 = document.createElement('p');
    // 「同一」「ほぼ同じ」は身内、「別のもの」は外。色を分けて一目で分かるようにする。
    const 身内か = ['同一', 'ほぼ同じ'].includes(結果.判定);
    札.className = 身内か ? 'guard-on' : (結果.判定 === '似ている' ? 'guard-off' : 'hint');

    const 見出し = document.createElement('b');
    見出し.textContent = `判定: ${結果.判定}`;
    札.appendChild(見出し);
    札.appendChild(document.createElement('br'));
    札.appendChild(document.createTextNode(結果.訳));
    箱.appendChild(札);

    if (結果.元) {
        const 詳 = document.createElement('ul');
        詳.className = 'cost-notes';
        [
            ['控えた日', new Date(結果.元.控えた日).toLocaleString('ja-JP')],
            ['種類', 結果.元.種類],
            ['名前', 結果.元.名前 || '（なし）'],
            ['作ったときの言葉', 結果.元.作った言葉 || '（なし）'],
            ['大きさ', 結果.元.大きさ || '（不明）'],
        ].forEach(([名, 値]) => {
            const li = document.createElement('li');
            const b = document.createElement('b');
            b.textContent = 名;
            const s = document.createElement('span');
            s.textContent = 値;
            li.appendChild(b);
            li.appendChild(s);
            詳.appendChild(li);
        });
        箱.appendChild(詳);
    }

    if (結果.判定 === '似ている' || 結果.判定 === 'ほぼ同じ') {
        const 断り = document.createElement('p');
        断り.className = 'notice-strict';
        断り.innerHTML = '<b>これは目安です。</b>'
            + '見た目の指紋が近いというだけで、<b>盗用の証拠にはなりません</b>。'
            + '実際に問題にする前に、必ず元の画像と見比べて、'
            + '相手にいつどこで公開されたものかも確かめてください。';
        箱.appendChild(断り);
    }
}

function init真贋照合() {
    const 入力 = document.getElementById('shinngan-file');
    if (!入力 || 入力.dataset.配線済み) return;
    入力.dataset.配線済み = '1';

    台帳の数を出す();

    入力.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';   // 同じ画像をもう一度選べるようにする
        if (!f) return;

        const 箱 = document.getElementById('shinngan-result');
        if (箱) 箱.innerHTML = '<p class="hint">調べています…</p>';

        const fr = new FileReader();
        fr.onload = async () => {
            if (!window.AReGLM_真贋) {
                if (箱) 箱.innerHTML = '<p class="hint">照合の仕組みが読み込まれていません。</p>';
                return;
            }
            const 結果 = await AReGLM_真贋.これはうちのものか(fr.result);
            照合の結果を出す(結果);
            台帳の数を出す();
            if (window.logActivity) {
                logActivity(`真贋の照合: ${結果.判定}`, { category: 'security' });
            }
        };
        fr.onerror = () => {
            if (箱) 箱.innerHTML = '<p class="hint">画像を読めませんでした。</p>';
        };
        fr.readAsDataURL(f);
    });
}

window.init真贋照合 = init真贋照合;
window.台帳の数を出す = 台帳の数を出す;
