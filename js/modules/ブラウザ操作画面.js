/**
 * ツールの中から、Chromeを開いて操る画面
 *
 * なぜこの形にするのか:
 *
 *   ページの中に他所のサイトを埋め込むことはできない。
 *   ほとんどのサイトが、埋め込みを断るため。
 *
 *   代わりに<b>本物のChromeを操る</b>。
 *   あなたのChromeにはもうログインしてあるので、
 *   base44 も SNS も、そのまま開ける。
 *
 * 画面の決まり:
 *
 *   ・<b>いま何が開いているかを、常に見せる。</b>
 *     操っている先が見えないまま押させない。
 *
 *   ・<b>合言葉やお金の画面には、印を付ける。</b>
 *     そこでは触らない。間違えると取り返しがつかない。
 *
 *   ・<b>何をしたかを、その場に出す。</b>
 */

async function ブラウザの様子を読む() {
    try {
        const r = await fetch('/api/browser', { cache: 'no-store' });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

async function ブラウザを操る(操作, 中身) {
    try {
        const r = await fetch('/api/browser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ 操作 }, 中身 || {})),
        });
        return await r.json();
    } catch (e) {
        return { ok: false, 訳: 'つながりませんでした: ' + e.message };
    }
}

/** よく開く先。押すだけで開けるようにしておく。 */
const よく開く先 = [
    { 名: 'SUZURI（自分の店）', 道: 'https://suzuri.jp/areglm' },
    { 名: 'SUZURI（商品管理）', 道: 'https://suzuri.jp/dashboard' },
    { 名: 'Instagram', 道: 'https://www.instagram.com/' },
    { 名: 'X', 道: 'https://x.com/' },
    { 名: 'base44', 道: 'https://app.base44.com/' },
];

async function renderブラウザ操作() {
    const 箱 = document.getElementById('browser-control');
    if (!箱) return;

    const d = await ブラウザの様子を読む();
    箱.innerHTML = '';

    if (!d) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '様子を読めませんでした。';
        箱.appendChild(p);
        return;
    }

    /* --- 許可が要るとき --- */
    if (d.タブ && d.タブ.許可が要る) {
        const 注 = document.createElement('p');
        注.className = 'guard-off';
        注.textContent = d.タブ.訳;
        箱.appendChild(注);

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-primary';
        b.textContent = '設定を開く';
        b.addEventListener('click', async () => {
            await fetch('/api/computer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    操作: 'ページを開く',
                    材料: { 場所: 'https://support.apple.com/ja-jp/guide/mac-help/mchlp3162/mac' },
                }),
            });
        });
        箱.appendChild(b);
        return;
    }

    /* --- 場所を入れて開く --- */
    const 行1 = document.createElement('div');
    行1.className = 'guard-row';

    const 場所 = document.createElement('input');
    場所.type = 'text';
    場所.id = 'browser-url';
    場所.placeholder = 'https://…';
    場所.autocomplete = 'off';
    場所.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') 開く(場所.value, false);
    });
    行1.appendChild(場所);

    const 開くボタン = document.createElement('button');
    開くボタン.type = 'button';
    開くボタン.className = 'btn btn-primary';
    開くボタン.textContent = '開く';
    開くボタン.addEventListener('click', () => 開く(場所.value, false));
    行1.appendChild(開くボタン);
    箱.appendChild(行1);

    /* --- よく開く先 --- */
    const 並び0 = document.createElement('div');
    並び0.className = 'remote-sns-row';
    よく開く先.forEach((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-secondary';
        b.textContent = x.名;
        b.addEventListener('click', () => 開く(x.道, true));
        並び0.appendChild(b);
    });
    箱.appendChild(並び0);

    /* --- いま開いているタブ --- */
    const 見出し = document.createElement('h5');
    見出し.className = 'rule-head';
    見出し.textContent = `いま開いているタブ（${d.タブ.数 || 0}個）`;
    箱.appendChild(見出し);

    if (!d.タブ.ok || !d.タブ.数) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = d.タブ.ok
            ? 'Chromeがまだ開いていません。上から開いてください。'
            : d.タブ.訳;
        箱.appendChild(p);
    } else {
        d.タブ.タブ.forEach((t) => 一つのタブを出す(箱, t));
    }

    /* --- 進む・戻る --- */
    const 並び = document.createElement('div');
    並び.className = 'remote-sns-row';
    ['戻る', '進む', '読み直す'].forEach((名) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-secondary';
        b.textContent = 名;
        b.addEventListener('click', async () => {
            const r = await ブラウザを操る(名);
            showNotification(r.訳, r.ok ? 'success' : 'error');
            setTimeout(renderブラウザ操作, 700);
        });
        並び.appendChild(b);
    });

    const 更新 = document.createElement('button');
    更新.type = 'button';
    更新.className = 'btn btn-sm btn-secondary';
    更新.textContent = '↻ いまの様子を見る';
    更新.addEventListener('click', renderブラウザ操作);
    並び.appendChild(更新);
    箱.appendChild(並び);

    /* --- したことの記録 --- */
    if (d.記録 && d.記録.length) {
        const 見出し2 = document.createElement('h5');
        見出し2.className = 'rule-head';
        見出し2.textContent = 'したことの記録';
        箱.appendChild(見出し2);

        const 並び2 = document.createElement('ul');
        並び2.className = 'growth-log';
        d.記録.slice(-6).reverse().forEach((x) => {
            const li = document.createElement('li');
            const t = new Date(x.とき);
            li.textContent = `${t.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                + `　${x.操作}${x.中身 ? '：' + x.中身 : ''}`;
            並び2.appendChild(li);
        });
        箱.appendChild(並び2);
    }

    /* --- 正直に書く --- */
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>ページの中に他所のサイトを埋め込むことはできません。</b>'
        + 'ほとんどのサイトが埋め込みを断るためです。'
        + '代わりに、<b>本物のChromeを開いて操ります</b>。<br>'
        + 'あなたのChromeにはログインしてあるので、'
        + 'base44 も SNS も、そのまま開けます。<br>'
        + '<b>合言葉やお金の画面には印を付け、そこでは触りません。</b>'
        + '間違って押すと、取り返しがつかないためです。<br>'
        + '<b>見たページの中身を、どこかへ送ることはしません。</b>';
    箱.appendChild(断り);
}

function 一つのタブを出す(箱, t) {
    const 札 = document.createElement('div');
    札.className = 'browser-tab' + (t.いま見ている ? ' now' : '')
        + (t.触ってよいか ? '' : ' careful');

    const 上 = document.createElement('div');
    上.className = 'browser-tab-head';

    const 番 = document.createElement('b');
    番.textContent = (t.いま見ている ? '▶ ' : '') + t.番 + '. ' + (t.題 || '（題なし）');
    上.appendChild(番);
    札.appendChild(上);

    const 道 = document.createElement('small');
    道.textContent = t.道;
    札.appendChild(道);

    if (!t.触ってよいか) {
        const 注 = document.createElement('small');
        注.className = 'browser-careful';
        注.textContent = '合言葉かお金の画面のようです。ここでは触りません。';
        札.appendChild(注);
    }

    const 並び = document.createElement('div');
    並び.className = 'remote-sns-row';

    if (!t.いま見ている) {
        const 選 = document.createElement('button');
        選.type = 'button';
        選.className = 'btn btn-sm btn-primary';
        選.textContent = 'ここを開く';
        選.addEventListener('click', async () => {
            const r = await ブラウザを操る('タブを選ぶ', { 番: t.番 });
            showNotification(r.訳, r.ok ? 'success' : 'error');
            setTimeout(renderブラウザ操作, 700);
        });
        並び.appendChild(選);
    }

    const 閉 = document.createElement('button');
    閉.type = 'button';
    閉.className = 'btn-link';
    閉.textContent = '閉じる';
    閉.addEventListener('click', async () => {
        if (!confirm(`「${t.題}」を閉じますか。`)) return;
        const r = await ブラウザを操る('タブを閉じる', { 番: t.番 });
        showNotification(r.訳, r.ok ? 'success' : 'error');
        setTimeout(renderブラウザ操作, 700);
    });
    並び.appendChild(閉);

    札.appendChild(並び);
    箱.appendChild(札);
}

async function 開く(道, 新しいタブ) {
    const u = String(道 || '').trim();
    if (!u) { showNotification('場所を入れてください', 'error'); return; }
    const r = await ブラウザを操る('開く', { 道: u, 新しいタブ });
    showNotification(r.訳, r.ok ? 'success' : 'error');
    setTimeout(renderブラウザ操作, 1500);
}

function initブラウザ操作() {
    if (document.getElementById('browser-control')) renderブラウザ操作();
}

window.initブラウザ操作 = initブラウザ操作;
window.renderブラウザ操作 = renderブラウザ操作;
