/**
 * 遠隔操作とタスクの画面
 *
 * 描いていただいた図のとおりに作る:
 *
 *   ┌──────────────────────────────────┐
 *   │ [作業1] [作業2 ●確認待ち] [SUZURI]  ○○○○ │  ← 上のタブ（増えていく）
 *   ├──────────────────────────────────┤
 *   │                                  │
 *   │        Chrome画面など              │  ← 真ん中（映す場所）
 *   │                                  │
 *   ├──────────────────────────────────┤
 *   │ 目的: 新作の図案を決める            │  ← 下の欄
 *   │ いま: 図案をつくっています（2/4手）  │
 *   └──────────────────────────────────┘
 *
 * 気をつけていること:
 *
 *   ・<b>確認待ちは、はっきり分かるようにする。</b>
 *     埋もれると、止まっていることに気づけない。
 *
 *   ・<b>作業が無いときは、一つの画面にする。</b>
 *     空のタブが並んでいても、邪魔なだけ。
 *
 *   ・<b>下の欄に、目的といましていることを書く。</b>
 *     何のためにやっているかを見失うと、
 *     手は動いても、進んでいないことがある。
 */

let いま選んでいるタブ = null;

async function render遠隔とタスク() {
    const 箱 = document.getElementById('remote-work');
    if (!箱) return;

    箱.innerHTML = '';

    const 様子 = (typeof 作業のいまの様子 === 'function') ? 作業のいまの様子() : { 全部: [], 一つにまとめるか: true };
    const ブラウザ = await ブラウザのタブを読む();

    /* --- 上のタブ --- */
    const 上 = document.createElement('div');
    上.className = 'work-tabs';

    const 並べるもの = [
        ...様子.全部.map((x) => ({
            id: x.id,
            名前: x.名前,
            様子: x.様子,
            種類: '頼んだ作業',
            目的: x.目的,
            していること: x.いましていること,
        })),
        ...(ブラウザ.タブ || []).map((t) => ({
            id: 'b' + t.番,
            名前: (t.題 || t.道 || '').slice(0, 22),
            様子: t.いま見ている ? '見ています' : '開いています',
            種類: '開いている画面',
            番: t.番,
            道: t.道,
            触ってよいか: t.触ってよいか,
        })),
    ];

    if (!並べるもの.length) {
        // 作業が無いときは、一つの画面にする。
        // 空のタブが並んでいても、邪魔なだけ。
        const 静か = document.createElement('div');
        静か.className = 'work-quiet';
        静か.textContent = 'いま動いている作業はありません';
        上.appendChild(静か);
    } else {
        並べるもの.forEach((x) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'work-tab'
                + (x.様子 === '確認待ち' ? ' waiting' : '')
                + (x.様子 === '見ています' ? ' now' : '')
                + (x.id === いま選んでいるタブ ? ' chosen' : '')
                + (x.触ってよいか === false ? ' careful' : '');

            const 名 = document.createElement('span');
            名.textContent = x.名前;
            b.appendChild(名);

            if (x.様子 === '確認待ち') {
                const 印 = document.createElement('em');
                印.textContent = '● 確認待ち';
                b.appendChild(印);
            }

            b.addEventListener('click', () => タブを選ぶ(x));
            上.appendChild(b);
        });
    }

    /* --- 右上の丸（図にあったもの＝操作） --- */
    const 丸たち = document.createElement('div');
    丸たち.className = 'work-dots';
    [
        ['↻', '映し直す', () => 一枚映し直す()],
        ['◀', '戻る', () => ブラウザを動かす('戻る')],
        ['▶', '進む', () => ブラウザを動かす('進む')],
        ['⏹', '止める', () => 全部止める()],
    ].forEach(([字, 説, する]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'work-dot';
        b.textContent = 字;
        b.title = 説;
        b.addEventListener('click', する);
        丸たち.appendChild(b);
    });
    上.appendChild(丸たち);
    箱.appendChild(上);

    /* --- 真ん中（映す場所） --- */
    const 真ん中 = document.createElement('div');
    真ん中.className = 'work-screen';
    真ん中.id = 'work-screen';
    箱.appendChild(真ん中);

    /* --- 下の欄 --- */
    const 下 = document.createElement('div');
    下.className = 'work-status';

    const 目的 = document.createElement('div');
    目的.className = 'work-purpose';
    目的.id = 'work-purpose';
    目的.textContent = 様子.目的 ? '目的: ' + 様子.目的 : '目的: （まだありません）';
    下.appendChild(目的);

    const いま = document.createElement('div');
    いま.className = 'work-doing';
    いま.id = 'work-doing';
    いま.textContent = 様子.していること
        ? 'いま: ' + 様子.していること
        : 'いま: 待っています';
    下.appendChild(いま);

    if (様子.確認待ち) {
        const 注 = document.createElement('div');
        注.className = 'work-waiting-note';
        注.textContent = `確認をお待ちしているものが ${様子.確認待ち}件 あります`;
        下.appendChild(注);
    }

    箱.appendChild(下);

    /* --- 映す --- */
    映す場所を用意する(真ん中);
}

/** ブラウザのタブを読む */
async function ブラウザのタブを読む() {
    try {
        const r = await fetch('/api/browser', { cache: 'no-store' });
        if (!r.ok) return { タブ: [] };
        const d = await r.json();
        return d.タブ && d.タブ.ok ? d.タブ : { タブ: [] };
    } catch {
        return { タブ: [] };
    }
}

/** タブを選んだとき */
async function タブを選ぶ(x) {
    いま選んでいるタブ = x.id;

    if (x.種類 === '開いている画面' && x.番) {
        const r = await fetch('/api/browser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 操作: 'タブを選ぶ', 番: x.番 }),
        }).then((y) => y.json()).catch(() => ({ ok: false, 訳: 'つながりません' }));
        if (!r.ok) showNotification(r.訳, 'error');
    }

    // 下の欄を、選んだものに合わせる
    const 目的 = document.getElementById('work-purpose');
    const いま = document.getElementById('work-doing');
    if (目的) 目的.textContent = '目的: ' + (x.目的 || '（この画面には目的が付いていません）');
    if (いま) {
        いま.textContent = 'いま: '
            + (x.していること || (x.道 ? x.道.slice(0, 60) : x.名前));
    }

    setTimeout(一枚映し直す, 600);
}

/** 映す場所を用意する */
function 映す場所を用意する(枠) {
    枠.innerHTML = '';

    const 絵 = document.createElement('img');
    絵.className = 'work-img';
    絵.alt = 'いまの画面';
    絵.hidden = true;
    絵.addEventListener('click', 映った場所を押す);
    枠.appendChild(絵);

    const 案内 = document.createElement('div');
    案内.className = 'work-hint';
    案内.id = 'work-hint';
    案内.textContent = '「↻」を押すと、いまの画面がここに映ります。'
        + '映った場所を押すと、実際のその場所が押されます。';
    枠.appendChild(案内);
}

/** 一枚映し直す */
async function 一枚映し直す() {
    const 枠 = document.getElementById('work-screen');
    if (!枠) return;
    const 絵 = 枠.querySelector('img');
    const 案内 = document.getElementById('work-hint');

    try {
        const r = await fetch('/api/remote/screen', { cache: 'no-store' });
        const d = await r.json();

        if (!d.ok) {
            // hidden だけだと、CSS側の display:block に負けて
            // 空のsrcのまま画像枠が表示され、壊れたアイコンに見えていた。
            // src も一緒に外し、二重に確実にする。
            if (絵) { 絵.hidden = true; 絵.removeAttribute('src'); }
            if (案内) {
                案内.textContent = d.訳
                    + (d.許可が要る
                        ? '　開いた設定で「＋」→ ⌘⇧G で貼り付け → node を入りにしてください。'
                        : '');
            }
            return;
        }

        if (絵) {
            絵.src = d.絵;
            絵.hidden = false;
            絵.dataset.元の幅 = d.元の幅;
            絵.dataset.元の高さ = d.元の高さ;
        }
        if (案内) {
            案内.textContent = `${new Date().toLocaleTimeString('ja-JP')} の画面`
                + '　押すと、実際のその場所が押されます';
        }
    } catch (e) {
        if (案内) 案内.textContent = 'つながりませんでした: ' + e.message;
    }
}

/** 映った場所を押したとき */
async function 映った場所を押す(e) {
    const 絵 = e.target;
    const 枠 = 絵.getBoundingClientRect();

    const 横の割合 = (e.clientX - 枠.left) / 枠.width;
    const 縦の割合 = (e.clientY - 枠.top) / 枠.height;

    const よこ = Math.round(横の割合 * window.screen.width);
    const たて = Math.round(縦の割合 * window.screen.height);

    if (!confirm(`画面の（${よこ}, ${たて}）を押します。よろしいですか。`)) return;

    const r = await fetch('/api/remote/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ よこ, たて }),
    }).then((y) => y.json()).catch(() => ({ ok: false, 訳: 'つながりません' }));

    showNotification(r.訳, r.ok ? 'success' : 'error');
    setTimeout(一枚映し直す, 800);
}

async function ブラウザを動かす(何を) {
    const r = await fetch('/api/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 操作: 何を }),
    }).then((y) => y.json()).catch(() => ({ ok: false, 訳: 'つながりません' }));
    showNotification(r.訳, r.ok ? 'success' : 'error');
    setTimeout(一枚映し直す, 800);
}

function 全部止める() {
    if (typeof 終わったものを片づける === 'function') {
        const 残り = 終わったものを片づける();
        showNotification(`片づけました（残り${残り}件）`, 'success');
    }
    render遠隔とタスク();
}

/** 描き直しを重ねない */
let 描き直しの札 = null;

/* --- 自動で作業する（エージェントの指示で、一手ずつ自動に進める） --- */

let 自動作業を止めるか = false;
let 自動作業が進行中か = false;

function 自動作業ログに足す(文) {
    const ログ = document.getElementById('remote-auto-log');
    if (!ログ) return;
    const li = document.createElement('li');
    li.textContent = 文;
    ログ.appendChild(li);
    li.scrollIntoView({ block: 'nearest' });
}

async function 自動作業を始める(目的) {
    if (自動作業が進行中か) return;
    自動作業が進行中か = true;
    自動作業を止めるか = false;

    const ログ = document.getElementById('remote-auto-log');
    const 止めるボタン = document.getElementById('remote-auto-stop');
    const 始めるボタン = document.querySelector('#remote-auto-form button[type="submit"]');
    if (ログ) ログ.innerHTML = '';
    if (止めるボタン) 止めるボタン.hidden = false;
    if (始めるボタン) 始めるボタン.disabled = true;

    自動作業ログに足す(`目的: ${目的}`);

    const 目的欄 = document.getElementById('work-purpose');
    if (目的欄) 目的欄.textContent = '目的: ' + 目的;

    let これまで = [];
    const 上限 = 8;

    // 何が起きたかを、最後にはっきり言うために覚えておく。
    // 「終わりました」だけだと、全部失敗していても成功したように見える。
    let 何かに成功したか = false;
    let 直前と同じ失敗が続いた回数 = 0;
    let 最後の理由 = '';
    let 途中で諦めたか = false;

    for (let i = 0; i < 上限; i++) {
        if (自動作業を止めるか) {
            自動作業ログに足す('（止めました）');
            break;
        }

        let 決めた;
        try {
            決めた = await fetch('/api/remote-task/step', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 目的, これまで }),
            }).then((r) => r.json());
        } catch (e) {
            最後の理由 = 'つながりませんでした: ' + e.message;
            自動作業ログに足す(最後の理由);
            途中で諦めたか = true;
            break;
        }

        if (!決めた || !決めた['する']) {
            最後の理由 = (決めた && 決めた['訳']) || '決められませんでした';
            自動作業ログに足す(最後の理由);
            break;
        }

        const 材料文 = 決めた['材料'] && Object.keys(決めた['材料']).length
            ? '（' + JSON.stringify(決めた['材料']) + '）' : '';
        const 結果 = 決めた['結果'] || {};
        const 結果訳 = 結果['訳'] || '';
        自動作業ログに足す(`${i + 1}. ${決めた['作業']}${材料文} → ${結果訳}`);

        if (結果.ok) {
            何かに成功したか = true;
            直前と同じ失敗が続いた回数 = 0;
        } else {
            最後の理由 = 結果訳 || '失敗しました';
            // 同じ作業・同じ材料で、同じ失敗を繰り返していないか。
            // 直せない失敗をAIが繰り返すだけの状態を、
            // 上限まで黙って回すのはやめる。
            const 直前 = これまで[これまで.length - 1];
            const 同じ失敗か = 直前
                && 直前.作業 === 決めた['作業']
                && JSON.stringify(直前.材料) === JSON.stringify(決めた['材料']);
            直前と同じ失敗が続いた回数 = 同じ失敗か ? 直前と同じ失敗が続いた回数 + 1 : 1;
            if (直前と同じ失敗が続いた回数 >= 2) {
                自動作業ログに足す(`同じ失敗が続いたため、ここで止めます: ${最後の理由}`);
                途中で諦めたか = true;
                これまで.push({ 作業: 決めた['作業'], 材料: 決めた['材料'], 結果 });
                break;
            }
        }

        これまで.push({ 作業: 決めた['作業'], 材料: 決めた['材料'], 結果 });

        const いま欄 = document.getElementById('work-doing');
        if (いま欄) いま欄.textContent = 'いま: ' + 決めた['作業'];

        if (typeof 一枚映し直す === 'function') await 一枚映し直す();
        await new Promise((r) => setTimeout(r, 900));

        if (i === 上限 - 1) 途中で諦めたか = true;
    }

    const いま欄 = document.getElementById('work-doing');
    if (いま欄 && !自動作業を止めるか) {
        if (何かに成功したか && !途中で諦めたか) {
            いま欄.textContent = 'いま: 終わりました';
        } else if (何かに成功したか) {
            いま欄.textContent = `いま: 途中までできました（続き: ${最後の理由}）`;
        } else {
            いま欄.textContent = `いま: できませんでした（${最後の理由 || '理由不明'}）`;
        }
    }

    if (止めるボタン) 止めるボタン.hidden = true;
    if (始めるボタン) 始めるボタン.disabled = false;
    自動作業が進行中か = false;
}

function init自動作業() {
    const form = document.getElementById('remote-auto-form');
    if (!form || form.dataset.配線済み) return;
    form.dataset.配線済み = '1';

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const 入力 = document.getElementById('remote-auto-goal');
        const 目的 = ((入力 && 入力.value) || '').trim();
        if (!目的) return;
        自動作業を始める(目的);
    });

    const 止めるボタン = document.getElementById('remote-auto-stop');
    if (止めるボタン) {
        止めるボタン.addEventListener('click', () => { 自動作業を止めるか = true; });
    }
}

/**
 * 遠隔操作ページのタブ切り替え（自動操作／画面を見る／文字入力・操作）。
 *
 * 作業ごとに画面を分けてほしいという要望に応えたもの。
 * ただし中身のDOMは消さず hidden を付け外しするだけなので、
 * 自動操作の実行中状態やライブ画面のタイマーはタブを切り替えても
 * 裏側で動き続ける（要望の「バックグラウンドで維持」を満たす）。
 */
function init遠隔操作タブ() {
    const タブ列 = document.getElementById('remote-tabs');
    if (!タブ列 || タブ列.dataset.配線済み) return;
    タブ列.dataset.配線済み = '1';

    タブ列.querySelectorAll('[data-remote-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const 選んだ = btn.dataset.remoteTab;
            タブ列.querySelectorAll('[data-remote-tab]').forEach((b) => {
                b.classList.toggle('active', b === btn);
            });
            document.querySelectorAll('[data-remote-group]').forEach((枠) => {
                枠.hidden = 枠.dataset.remoteGroup !== 選んだ;
                枠.classList.toggle('active', 枠.dataset.remoteGroup === 選んだ);
            });
        });
    });
}
window.init遠隔操作タブ = init遠隔操作タブ;

function init遠隔とタスク() {
    if (!document.getElementById('remote-work')) return;
    init遠隔操作タブ();
    render遠隔とタスク();
    init自動作業();

    // 作業が変わったら、上のタブを描き直す。
    //
    // ただし、まとめて描き直す。
    // 作業を足すたびに描いていたら、
    // 描いている途中でまた呼ばれて、タブが重なって出ていた。
    if (!window._作業タブを見張り中) {
        window.addEventListener('作業タブが変わった', () => {
            clearTimeout(描き直しの札);
            描き直しの札 = setTimeout(() => render遠隔とタスク(), 200);
        });
        window._作業タブを見張り中 = true;
    }
}

window.init遠隔とタスク = init遠隔とタスク;
window.render遠隔とタスク = render遠隔とタスク;
