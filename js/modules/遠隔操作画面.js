/**
 * 遠隔操作 ― この道具の中に、画面を映して操る
 *
 * なぜこの形にするのか:
 *
 *   ページの中に他所のサイトは埋め込めない。
 *   ほとんどのサイトが断るため。
 *
 *   だが<b>画面そのものを写せば、何でも映る</b>。
 *   Chromeも、他のアプリも、映った通りに押せる。
 *
 *   映った場所を押すと、実際の画面のそこが押される。
 *   遠くの機械を触るのと同じ仕組み。
 *
 * 画面の決まり:
 *
 *   ・<b>止めるボタンを、いちばん上に置く。</b>
 *     暴れ出してから探すのでは遅い。
 *
 *   ・<b>いま映っているのがいつのものかを出す。</b>
 *     古い絵を押すと、思ったところと違う場所が押される。
 *
 *   ・<b>合言葉の画面は映さない。</b>
 *     写り込めば、それは漏れたのと同じ。
 *
 *   ・<b>押す前に、どこを押すかを見せる。</b>
 */

/** 何秒ごとに映し直すか */
const 映し直す間隔 = 2500;

let 映す札 = null;
let いまの絵 = null;

async function 画面を写す() {
    try {
        const r = await fetch('/api/remote/screen', { cache: 'no-store' });
        return await r.json();
    } catch (e) {
        return { ok: false, 訳: 'つながりませんでした: ' + e.message };
    }
}

async function そこを押す(よこ, たて) {
    try {
        const r = await fetch('/api/remote/click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ よこ, たて }),
        });
        return await r.json();
    } catch (e) {
        return { ok: false, 訳: 'つながりませんでした: ' + e.message };
    }
}

async function 文字を送る(中身) {
    try {
        const r = await fetch('/api/remote/type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(中身),
        });
        return await r.json();
    } catch (e) {
        return { ok: false, 訳: 'つながりませんでした: ' + e.message };
    }
}

async function render遠隔操作() {
    const 箱 = document.getElementById('remote-screen');
    if (!箱) return;

    箱.innerHTML = '';

    /* --- 止めるボタン（いちばん上） --- */
    const 止め = document.createElement('div');
    止め.className = 'stop-box';
    const 状態 = document.createElement('b');
    状態.id = 'remote-state';
    状態.textContent = '映していません';
    止め.appendChild(状態);

    const 切替 = document.createElement('button');
    切替.type = 'button';
    切替.className = 'btn btn-primary';
    切替.textContent = '▶ 映し始める';
    切替.addEventListener('click', () => {
        if (映す札) 映すのをやめる(切替, 状態);
        else 映し始める(切替, 状態);
    });
    止め.appendChild(切替);
    箱.appendChild(止め);

    /* --- 映す場所 --- */
    const 枠 = document.createElement('div');
    枠.className = 'remote-view';
    枠.id = 'remote-view';

    const 案内 = document.createElement('p');
    案内.className = 'hint';
    案内.textContent = '「映し始める」を押すと、ここに画面が出ます。'
        + '出た画面を押すと、実際のその場所が押されます。';
    枠.appendChild(案内);
    箱.appendChild(枠);

    /* --- 文字を打つ ---
       画面の分割（J-3）により、ここは「画面を見る」タブではなく
       「文字入力・操作」タブの #remote-type-tools に出す。
       無ければ（古いレイアウトのままなら）これまで通り箱に出す。 */
    const 打つ箱 = document.getElementById('remote-type-tools') || 箱;
    打つ箱.innerHTML = '';
    const 行 = document.createElement('div');
    行.className = 'guard-row';

    const 入力 = document.createElement('input');
    入力.type = 'text';
    入力.id = 'remote-type';
    入力.placeholder = 'ここに書いて「打つ」を押すと、映っている画面に入ります';
    入力.autocomplete = 'off';
    行.appendChild(入力);

    const 打つ = document.createElement('button');
    打つ.type = 'button';
    打つ.className = 'btn btn-sm btn-warn';
    打つ.textContent = '打つ';
    打つ.addEventListener('click', async () => {
        const 文 = 入力.value;
        if (!文) { showNotification('打つ文字を入れてください', 'error'); return; }
        if (!confirm(`いま映っている画面に「${文}」と打ちます。よろしいですか。`)) return;
        const r = await 文字を送る({ 文 });
        showNotification(r.訳, r.ok ? 'success' : 'error');
        if (r.ok) 入力.value = '';
        setTimeout(一枚映す, 600);
    });
    行.appendChild(打つ);

    const 改行 = document.createElement('button');
    改行.type = 'button';
    改行.className = 'btn btn-sm btn-secondary';
    改行.textContent = '⏎ 改行';
    改行.addEventListener('click', async () => {
        const r = await 文字を送る({ 文: '改行' });
        showNotification(r.訳, r.ok ? 'success' : 'error');
        setTimeout(一枚映す, 600);
    });
    行.appendChild(改行);

    ['保存', 'コピー', '貼る', '全部選ぶ', '戻す'].forEach((キー) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-secondary';
        b.textContent = '⌘' + キー;
        b.addEventListener('click', async () => {
            const r = await 文字を送る({ キー });
            showNotification(r.訳, r.ok ? 'success' : 'error');
            setTimeout(一枚映す, 600);
        });
        行.appendChild(b);
    });

    const 取消 = document.createElement('button');
    取消.type = 'button';
    取消.className = 'btn btn-sm btn-secondary';
    取消.textContent = 'esc';
    取消.addEventListener('click', async () => {
        const r = await 文字を送る({ 取り消し: true });
        showNotification(r.訳, r.ok ? 'success' : 'error');
        setTimeout(一枚映す, 600);
    });
    行.appendChild(取消);
    打つ箱.appendChild(行);

    // クリックと文字入力しかできず、ページを下まで読み進められなかった
    // ため、スクロールの行を別に用意する（連打しやすいよう、文字入力の
    // 行とは分ける）。
    const スクロール行 = document.createElement('div');
    スクロール行.className = 'guard-row';
    [['▲ 上へ', '上'], ['▼ 下へ', '下']].forEach(([表示, 向き]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-secondary';
        b.textContent = 表示;
        b.addEventListener('click', async () => {
            const r = await 文字を送る({ スクロール: 向き });
            if (!r.ok) showNotification(r.訳, 'error');
            setTimeout(一枚映す, 600);
        });
        スクロール行.appendChild(b);
    });
    打つ箱.appendChild(スクロール行);

    /* --- 正直に書く --- */
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>ページの中に他所のサイトは埋め込めません。</b>'
        + 'ほとんどのサイトが断るためです。'
        + '代わりに<b>画面そのものを写しています</b>。'
        + 'Chromeも、他のアプリも、映った通りに押せます。<br>'
        + '<b>合言葉を打ち込む画面は映しません。</b>'
        + '写り込めば、それは漏れたのと同じだからです。<br>'
        + '<b>写した画面は、どこにも送りません。</b>'
        + 'ファイルにも残さず、映すたびに捨てています。<br>'
        + '<b>いつでも止められます。</b>上の「止める」を押せば、その瞬間から映しません。';
    箱.appendChild(断り);
}

function 映し始める(ボタン, 状態) {
    ボタン.className = 'btn btn-danger';
    ボタン.textContent = '⏹ 止める';
    状態.textContent = '映しています';
    一枚映す();
    // タブを裏に回している間は誰も見ていない画面を撮り続けるだけになるので、
    // 省電力インターバルで休ませる（表に戻った瞬間に一枚撮り直す）。
    映す札 = window.AReGLM_PERF
        ? AReGLM_PERF.smartInterval(一枚映す, 映し直す間隔)
        : { id: setInterval(一枚映す, 映し直す間隔), stop: () => clearInterval(映す札.id) };
}

function 映すのをやめる(ボタン, 状態) {
    映す札?.stop();
    映す札 = null;
    ボタン.className = 'btn btn-primary';
    ボタン.textContent = '▶ 映し始める';
    状態.textContent = '止めました';
}

async function 一枚映す() {
    const 枠 = document.getElementById('remote-view');
    if (!枠) return;

    const d = await 画面を写す();

    if (!d.ok) {
        枠.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'guard-off';
        p.textContent = d.訳;
        枠.appendChild(p);

        if (d.許可が要る) {
            const 手順 = document.createElement('ol');
            手順.className = 'remote-steps';
            [
                '開いた設定の画面で「＋」を押す',
                '⌘⇧G を押して貼り付ける（道はもう写してあります）',
                'node を選んで、入りにする',
                'この画面で「映し始める」をもう一度押す',
            ].forEach((文) => {
                const li = document.createElement('li');
                li.textContent = 文;
                手順.appendChild(li);
            });
            枠.appendChild(手順);

            if (d.道) {
                const 道 = document.createElement('code');
                道.className = 'remote-path';
                道.textContent = d.道;
                枠.appendChild(道);
            }

            // 許可が要るなら、映し続けても意味がない
            const ボタン = document.querySelector('#remote-screen .stop-box button');
            const 状態 = document.getElementById('remote-state');
            if (映す札 && ボタン && 状態) 映すのをやめる(ボタン, 状態);
        }
        return;
    }

    いまの絵 = d;

    let 絵 = 枠.querySelector('img');
    if (!絵) {
        枠.innerHTML = '';
        絵 = document.createElement('img');
        絵.className = 'remote-img';
        絵.alt = 'いまの画面';
        絵.addEventListener('click', 押された);
        枠.appendChild(絵);

        const 注 = document.createElement('small');
        注.id = 'remote-when';
        注.className = 'remote-when';
        枠.appendChild(注);
    }

    絵.src = d.絵;
    const 注 = document.getElementById('remote-when');
    if (注) {
        注.textContent = `${new Date().toLocaleTimeString('ja-JP')} の画面`
            + `（${d.元の幅}×${d.元の高さ}）　押すと、実際のその場所が押されます`;
    }
}

/**
 * 映った絵の上で押されたとき。
 *
 * <b>縮めて映しているので、元の座標に戻す。</b>
 * 戻さないと、まるで違うところが押される。
 */
async function 押された(e) {
    if (!いまの絵 || !いまの絵.元の幅) return;

    const 絵 = e.target;
    const 枠 = 絵.getBoundingClientRect();

    // 映っている絵の中での位置（0〜1）
    const 横の割合 = (e.clientX - 枠.left) / 枠.width;
    const 縦の割合 = (e.clientY - 枠.top) / 枠.height;

    // 元の画面での位置に戻す。
    //
    // macOS の座標は、画面の点ではなく「論理の点」で数える。
    // Retina では、写した絵の点数は論理の2倍になる。
    const 見えている幅 = window.screen.width;
    const 見えている高さ = window.screen.height;

    const よこ = Math.round(横の割合 * 見えている幅);
    const たて = Math.round(縦の割合 * 見えている高さ);

    if (!confirm(`画面の（${よこ}, ${たて}）を押します。よろしいですか。`)) return;

    const r = await そこを押す(よこ, たて);
    showNotification(r.訳, r.ok ? 'success' : 'error');
    setTimeout(一枚映す, 800);
}

function init遠隔操作() {
    if (document.getElementById('remote-screen')) render遠隔操作();
}

window.init遠隔操作 = init遠隔操作;
window.render遠隔操作 = render遠隔操作;
