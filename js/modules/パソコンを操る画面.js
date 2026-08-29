/**
 * パソコン操作の画面
 *
 * ここで気をつけていること:
 *
 *   ・<b>止めるボタンを、いちばん上に置く。</b>
 *     暴れ出してから探すのでは遅い。
 *     普段は使わないものでも、要るときに一秒で押せる場所に置く。
 *
 *   ・<b>重い操作は、押す前に確かめる。</b>
 *     文字を打つ・クリックは、間違えると別のところに入る。
 *
 *   ・<b>何をしたかを、その場で見せる。</b>
 *     画面を触るものが、黙って動いてはいけない。
 */

async function 操作の様子を読む() {
    try {
        const r = await fetch('/api/computer', { cache: 'no-store' });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

async function 操る(操作, 材料) {
    try {
        const r = await fetch('/api/computer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 操作, 材料: 材料 || {} }),
        });
        return await r.json();
    } catch (e) {
        return { ok: false, 訳: 'つながりませんでした: ' + e.message };
    }
}

async function renderパソコン操作() {
    const 箱 = document.getElementById('computer-control');
    if (!箱) return;

    const d = await 操作の様子を読む();
    箱.innerHTML = '';

    if (!d) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '様子を読めませんでした。';
        箱.appendChild(p);
        return;
    }

    /* --- 止めるボタン（いちばん上） --- */
    const 止め枠 = document.createElement('div');
    止め枠.className = d.止まっているか ? 'stop-box stopped' : 'stop-box';

    const 状態 = document.createElement('b');
    状態.textContent = d.止まっているか
        ? '⏹ いま止まっています（画面には一切触りません）'
        : '▶ いま動けます';
    止め枠.appendChild(状態);

    const 切替 = document.createElement('button');
    切替.type = 'button';
    切替.className = d.止まっているか ? 'btn btn-primary' : 'btn btn-danger';
    切替.textContent = d.止まっているか ? '動かす' : '⏹ 全部止める';
    切替.addEventListener('click', async () => {
        切替.disabled = true;
        await fetch('/api/computer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d.止まっているか ? { 動かす: true } : { 止める: true }),
        });
        showNotification(d.止まっているか ? '動かしました' : '全部止めました', 'success');
        renderパソコン操作();
    });
    止め枠.appendChild(切替);
    箱.appendChild(止め枠);

    /* --- 合言葉の画面のとき --- */
    if (d.合言葉の画面) {
        const 注 = document.createElement('p');
        注.className = 'guard-off';
        注.textContent = 'いま合言葉を打ち込む画面が開いています。'
            + 'ここでは文字を打ちません（打つと合言葉の欄に入るため）。';
        箱.appendChild(注);
    }

    /* --- 部屋の様子（まとめて変わるもの） --- */
    const まとめ = d.できる操作.filter((x) => /に入る$/.test(x.名));
    if (まとめ.length) {
        const 見出し = document.createElement('h5');
        見出し.className = 'rule-head';
        見出し.textContent = '部屋の様子を整える';
        箱.appendChild(見出し);

        const 並び = document.createElement('div');
        並び.className = 'remote-sns-row';
        まとめ.forEach((x) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-primary';
            b.textContent = x.名;
            b.title = x.説;
            b.addEventListener('click', () => 押した(x, b));
            並び.appendChild(b);
        });
        箱.appendChild(並び);
    }

    /* --- 軽い操作 --- */
    const 軽い = d.できる操作.filter((x) => x.重さ === '軽い' && !/に入る$/.test(x.名));
    const 見出し2 = document.createElement('h5');
    見出し2.className = 'rule-head';
    見出し2.textContent = `取り返しがつく操作（${軽い.length}種類）`;
    箱.appendChild(見出し2);

    const 並び2 = document.createElement('div');
    並び2.className = 'remote-sns-row';
    軽い.forEach((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-secondary';
        b.textContent = x.名;
        b.title = x.説;
        b.addEventListener('click', () => 押した(x, b));
        並び2.appendChild(b);
    });
    箱.appendChild(並び2);

    /* --- 重い操作 --- */
    const 重い = d.できる操作.filter((x) => x.重さ === '重い');
    const 見出し3 = document.createElement('h5');
    見出し3.className = 'rule-head';
    見出し3.textContent = `気をつける操作（${重い.length}種類）`;
    箱.appendChild(見出し3);

    const 注意 = document.createElement('p');
    注意.className = 'hint';
    注意.textContent = 'これらは押す前に確かめます。'
        + '打つ場所を間違えると、別のところに文字が入るためです。';
    箱.appendChild(注意);

    const 並び3 = document.createElement('div');
    並び3.className = 'remote-sns-row';
    重い.forEach((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-warn';
        b.textContent = x.名;
        b.title = x.説;
        b.addEventListener('click', () => 押した(x, b, true));
        並び3.appendChild(b);
    });
    箱.appendChild(並び3);

    /* --- したことの記録 --- */
    const 見出し4 = document.createElement('h5');
    見出し4.className = 'rule-head';
    見出し4.textContent = 'したことの記録';
    箱.appendChild(見出し4);

    if (!d.記録.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'まだありません。何かするたび、ここに必ず残ります。';
        箱.appendChild(p);
    } else {
        const 並び = document.createElement('ul');
        並び.className = 'growth-log';
        d.記録.slice(-8).reverse().forEach((x) => {
            const li = document.createElement('li');
            const t = new Date(x.とき);
            li.textContent = `${t.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                + `　${x.操作}：${x.結果}`;
            並び.appendChild(li);
        });
        箱.appendChild(並び);
    }

    /* --- 正直に書く --- */
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>決めた操作しかできません。</b>'
        + '好きな命令を書いて動かす道は、作っていません。'
        + '紛れ込んだ文字がそのまま命令になるのを防ぐためです。<br>'
        + '<b>いつでも止められます。</b>上の「全部止める」を押せば、その瞬間から画面に触りません。<br>'
        + '<b>合言葉の画面では、絶対に打ちません。</b>'
        + 'macOSが教えてくれるので、それを見ています。'
        + '見られないときは、打たない側に倒しています。<br>'
        + '<b>1分に20回までです。</b>止まらなくなったとき、被害がそこで頭打ちになります。';
    箱.appendChild(断り);
}

/** 押されたときの動き */
async function 押した(操作, ボタン, 確かめる) {
    const 材料 = {};

    // 要るものを聞く
    for (const 要る of (操作.要る || [])) {
        const 答え = prompt(`${操作.説}\n\n「${要る}」を入れてください`, 既定値(操作.名, 要る));
        if (答え === null) return;
        材料[要る] = 答え;
    }

    if (確かめる) {
        const 中身 = Object.keys(材料).length
            ? '\n\n' + Object.entries(材料).map(([k, v]) => `${k}: ${v}`).join('\n')
            : '';
        if (!confirm(`「${操作.名}」を行います。${中身}\n\nよろしいですか。`)) return;
    }

    const 元 = ボタン.textContent;
    ボタン.disabled = true;
    ボタン.textContent = '…';

    const r = await 操る(操作.名, 材料);
    showNotification(r.訳, r.ok ? 'success' : 'error');

    ボタン.disabled = false;
    ボタン.textContent = 元;
    renderパソコン操作();
}

function 既定値(操作名, 要る) {
    if (操作名 === 'アプリを開く') return 'Finder';
    if (操作名 === 'ページを開く') return 'https://';
    if (要る === '大きさ') return '50';
    if (要る === 'キー') return '保存';
    return '';
}

function initパソコン操作() {
    if (document.getElementById('computer-control')) renderパソコン操作();
}

window.initパソコン操作 = initパソコン操作;
window.renderパソコン操作 = renderパソコン操作;
