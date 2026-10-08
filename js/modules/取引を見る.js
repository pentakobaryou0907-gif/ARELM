/**
 * 取引の連絡に、危ない点がないかを見る画面
 *
 * なぜこれが要るのか:
 *   海外の工場に服を作ってもらう以上、
 *   請求書と振込先のやりとりは必ず通る。
 *
 *   そこを狙う手口が実際にあり、
 *   やりとりの途中に割り込んで「振込先が変わりました」と伝えてくる。
 *   文面はそれまでの相手そっくりで来る。
 *
 *   払ってしまってからでは、まず戻らない。
 *   払う前に一度立ち止まれるかどうかが、すべて。
 *
 * ここでの決まり:
 *   ・「詐欺です」とは言わない。決めつける材料がこちらに無い。
 *   ・「安全です」とも言わない。当てはまらなかっただけ。
 *   ・貼られた文面は端末の中だけで見る。外へは出さない。
 *   ・見た文面は保存しない。残すと、そこから漏れる道ができる。
 */

let 見ている最中 = false;

async function 取引を見る() {
    if (見ている最中) return;

    const 入力 = document.getElementById('deal-check-text');
    const 相手 = document.getElementById('deal-check-from');
    const 出す = document.getElementById('deal-check-result');
    const 押す = document.getElementById('deal-check-run');
    if (!入力 || !出す) return;

    const 文 = 入力.value.trim();
    if (!文) {
        showNotification('メールの中身を貼り付けてください', 'error');
        入力.focus();
        return;
    }

    見ている最中 = true;
    if (押す) { 押す.disabled = true; 押す.textContent = '見ています…'; }

    try {
        const r = await fetch('/api/ai-local/deal-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 文, 相手: (相手?.value || '').trim() }),
        });
        if (!r.ok) throw new Error('見る仕組みに届きませんでした');
        const d = await r.json();
        結果を並べる(出す, d);
    } catch (e) {
        出す.className = 'deal-result failed';
        出す.textContent = '見られませんでした: ' + e.message;
    } finally {
        見ている最中 = false;
        if (押す) { 押す.disabled = false; 押す.textContent = '🔍 この連絡を見る'; }
    }
}

const 段階の見た目 = {
    '手を止めてください': 'stop',
    '気をつけてください': 'warn',
    '念のため確かめてください': 'note',
    '引っかかる点はありませんでした': 'none',
};

function 結果を並べる(箱, d) {
    箱.className = 'deal-result ' + (段階の見た目[d['段階']] || 'note');
    箱.innerHTML = '';

    const 頭 = document.createElement('div');
    頭.className = 'deal-level';
    頭.textContent = d['段階'];
    箱.appendChild(頭);

    const 当たり = d['当たり'] || [];

    if (!当たり.length) {
        const p = document.createElement('p');
        p.textContent = 'こちらの見方に当てはまる点は、見つかりませんでした。';
        箱.appendChild(p);

        // ここを弱く書いたら、この機能は害になる。
        // 「見つからなかった＝安全」と受け取られるのがいちばん困る。
        const 念 = document.createElement('p');
        念.className = 'deal-caveat';
        念.innerHTML = '<b>これは「安全だ」という意味ではありません。</b>'
            + 'こちらが知っている手口に当てはまらなかった、というだけです。'
            + 'お金が動く話であれば、いつもの連絡先で一度確かめてください。';
        箱.appendChild(念);
        return;
    }

    const 印 = { 3: '●', 2: '▲', 1: '・' };
    当たり.forEach((x) => {
        const 行 = document.createElement('div');
        行.className = 'deal-hit w' + x['重さ'];

        const 名 = document.createElement('b');
        名.textContent = `${印[x['重さ']] || '・'} ${x['名']}`;
        行.appendChild(名);

        const 訳 = document.createElement('p');
        訳.textContent = x['訳'];
        行.appendChild(訳);

        const 語 = document.createElement('p');
        語.className = 'deal-words';
        語.textContent = '見つけた言葉: ' + (x['見つけた言葉'] || []).join('、');
        行.appendChild(語);

        const 確 = document.createElement('p');
        確.className = 'deal-how';
        確.textContent = '→ ' + x['確かめ方'];
        行.appendChild(確);

        箱.appendChild(行);
    });

    const 締め = document.createElement('div');
    締め.className = 'deal-caveat';
    締め.innerHTML = '<b>これは「詐欺だ」と決めつけるものではありません。</b>'
        + '引っかかる点を並べただけで、本物のこともあります。<br><br>'
        + 'お金が動く話なら、次だけは守ってください。<br>'
        + '　・<b>そのメールに書かれた連絡先は使わない</b><br>'
        + '　・前から知っている電話番号にかけて、担当者本人に口頭で確かめる<br>'
        + '　・確かめるまでは払わない';
    箱.appendChild(締め);
}

/** 貼った文面を消す。残しておく理由がないため。 */
function 取引の文を消す() {
    const 入力 = document.getElementById('deal-check-text');
    const 出す = document.getElementById('deal-check-result');
    if (入力) 入力.value = '';
    if (出す) { 出す.className = 'deal-result'; 出す.innerHTML = ''; }
}

function init取引を見る() {
    document.getElementById('deal-check-run')?.addEventListener('click', 取引を見る);
    document.getElementById('deal-check-clear')?.addEventListener('click', 取引の文を消す);
}

window.init取引を見る = init取引を見る;
window.取引を見る = 取引を見る;
window.取引の文を消す = 取引の文を消す;
