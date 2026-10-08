/**
 * 覚えた資料から、ファッションの話題を拾って出す
 *
 * なぜこの形なのか:
 *   ここは元々「ファッション・ニュース（学習用）」という枠で、
 *   外のニュースを取ってきて並べる作りだった。
 *   中身は空のまま、「Gemini / ニュースRSS連携後、
 *   自動で最新トピックを表示します」とだけ書かれていた。
 *
 *   このツールは外へ一切出ない決まりなので、
 *   その枠は永久に埋まらない。
 *   埋まらない枠を置いておくのは、嘘をついているのと同じ。
 *
 *   そこで向きを変えて、すでに覚えている資料の中から拾う。
 *
 * はっきり書いておくこと:
 *   これは世の中の最新の流行ではありません。
 *   あなたがこのツールに入れた資料の中の話です。
 *   ここを曖昧にすると、外を見ていると誤解される。
 */

async function 話題を出す() {
    const 箱 = document.getElementById('fashion-news-feed');
    if (!箱) return;

    箱.innerHTML = '<p class="hint">覚えた資料から拾っています…</p>';

    let d;
    try {
        const r = await fetch('/api/ai-local/topics', { cache: 'no-store' });
        if (!r.ok) throw new Error('自作AIに届きませんでした');
        d = await r.json();
    } catch (e) {
        箱.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '拾えませんでした: ' + e.message;
        箱.appendChild(p);
        return;
    }

    箱.innerHTML = '';

    if (!d['ある']) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = d['訳'] || '覚えた資料の中に、ファッションに近い話題が見つかりませんでした。';
        箱.appendChild(p);
        話題の断りを添える(箱);
        return;
    }

    const 並び = document.createElement('div');
    並び.className = 'topic-list';

    d['話題'].forEach((x) => {
        const 札 = document.createElement('button');
        札.type = 'button';
        札.className = 'topic-chip';

        const 語 = document.createElement('b');
        語.textContent = x['語'];
        札.appendChild(語);

        const 数 = document.createElement('small');
        数.textContent = `${x['件数']}件`;
        札.appendChild(数);

        札.title = `「${(x['どこから'] || []).join('」「')}」から近い言葉としてたどりました`;

        // 押したら、その話題について覚えていることを引く。
        // 並べるだけだと、そこから先へ進めない。
        札.addEventListener('click', () => 話題を調べる(x['語']));

        並び.appendChild(札);
    });

    箱.appendChild(並び);

    const 出し先 = document.createElement('div');
    出し先.id = 'topic-detail';
    出し先.className = 'topic-detail';
    箱.appendChild(出し先);

    話題の断りを添える(箱);
}

/** その話題について、覚えていることを引く */
async function 話題を調べる(語) {
    const 先 = document.getElementById('topic-detail');
    if (!先) return;

    先.className = 'topic-detail busy';
    先.textContent = `「${語}」について覚えていることを探しています…`;

    try {
        const r = await fetch('/api/ai-local/knowledge/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 語, topN: 5 }),
        });
        const d = r.ok ? await r.json() : null;
        const 見つけた = (d && (d.results || d.items)) || [];

        先.className = 'topic-detail';
        先.innerHTML = '';

        const 題 = document.createElement('b');
        題.textContent = `「${語}」について覚えていること`;
        先.appendChild(題);

        if (!見つけた.length) {
            const p = document.createElement('p');
            p.className = 'hint';
            p.textContent = 'この言葉そのもので覚えている記録はありませんでした。'
                + '資料の中には出てきますが、まとまった形では持っていません。';
            先.appendChild(p);
            return;
        }

        見つけた.slice(0, 5).forEach((x) => {
            const p = document.createElement('p');
            p.className = 'topic-hit';
            p.textContent = (x.text || x.content || x.body || '').slice(0, 180);
            先.appendChild(p);
        });
    } catch (e) {
        先.className = 'topic-detail';
        先.textContent = '探せませんでした: ' + e.message;
    }
}

function 話題の断りを添える(箱) {
    const 断り = document.createElement('p');
    断り.className = 'hint topic-caveat';
    断り.innerHTML = '<b>これは世の中の最新の流行ではありません。</b>'
        + 'あなたがこのツールに入れた資料の中から、'
        + '「服」「生地」「素材」などに意味の近い言葉をたどって拾ったものです。'
        + '外は見に行っていません（外部へは一切送りません）。';
    箱.appendChild(断り);
}

function init話題() {
    const 箱 = document.getElementById('fashion-news-feed');
    if (!箱) return;

    // 立ち上げのときに一度だけ拾っておく。
    //
    // はじめは「その画面を開いたら拾う」ようにしていたが、
    // 開いたことを見分ける仕掛けがクリック待ちだったため、
    // 画面を切り替えただけでは動かず、枠が空のままだった。
    //
    // 拾うのは一度きりで、待たされるほど重くもない。
    // 素直に最初に拾って、開いたときには出来ている形にする。
    話題を出す();

    // 資料を読み込ませたあとは、拾い直せるようにしておく
    document.getElementById('topic-refresh')?.addEventListener('click', 話題を出す);
}

window.init話題 = init話題;
window.話題を出す = 話題を出す;
