/**
 * 自分を見て、良くしていく（画面側）
 *
 * なぜこれが要るのか:
 *   ここまでの仕組みは、良くなるのが「私が手を入れたとき」だけだった。
 *   それでは、手を入れる人がいなくなれば止まる。
 *
 *   自分で自分を見て、気づいたことを言い、
 *   直せるものは自分で直す——そこまで作る。
 *
 * やらないこと:
 *   <b>自分のコードを書き換えて実行することは、しません。</b>
 *   誰も見ていないところで自分を書き換える仕組みは、
 *   一度おかしくなったら止められません。
 *
 *   直せるのは「覚えたこと」と「決めた数字」まで。
 *   仕組みそのものには手を出しません。
 *
 * いつ見るか:
 *   一日一回。使い始めたときに、静かに見る。
 *   何度も見ても、結果は大きく変わらない。
 */

const 見立ての鍵 = 'areglm_self_review';
const 使われ方の鍵 = 'areglm_skill_use';

/** 作業が使われたことを数える（executor から呼ばれる） */
function 作業が使われた(作業) {
    if (!作業) return;
    let 数え = {};
    let 履歴 = [];
    try {
        const r = JSON.parse(localStorage.getItem(使われ方の鍵) || '{}');
        数え = r.数え || {};
        履歴 = r.履歴 || [];
    } catch { /* 初回 */ }

    数え[作業] = (数え[作業] || 0) + 1;
    履歴.push(作業);

    localStorage.setItem(使われ方の鍵, JSON.stringify({
        数え,
        履歴: 履歴.slice(-60),
    }));
}

function 使われ方を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(使われ方の鍵) || '{}');
        return { 数え: r.数え || {}, 履歴: r.履歴 || [] };
    } catch {
        return { 数え: {}, 履歴: [] };
    }
}

/** 今日もう見たか */
function 今日もう見たか() {
    const 日 = (typeof 日付文字 === 'function')
        ? 日付文字(new Date()) : new Date().toISOString().slice(0, 10);
    try {
        return JSON.parse(localStorage.getItem(見立ての鍵) || '{}').日 === 日;
    } catch {
        return false;
    }
}

function 見立てを残す(結果) {
    const 日 = (typeof 日付文字 === 'function')
        ? 日付文字(new Date()) : new Date().toISOString().slice(0, 10);
    localStorage.setItem(見立ての鍵, JSON.stringify({ 日, 結果 }));
}

function 前の見立てを読む() {
    try {
        return JSON.parse(localStorage.getItem(見立ての鍵) || '{}').結果 || null;
    } catch {
        return null;
    }
}

/**
 * 自分を見る。
 *
 * 端末の中だけで完結する。外へは何も送らない。
 */
async function 自分を見る(強制) {
    if (!強制 && 今日もう見たか()) return 前の見立てを読む();

    const { 数え, 履歴 } = 使われ方を読む();

    try {
        const r = await fetch('/api/ai-local/self-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 使われ方: 数え, 履歴 }),
        });
        if (!r.ok) return null;
        const d = await r.json();
        見立てを残す(d);
        return d;
    } catch {
        return null;
    }
}

async function render自分を良くする() {
    const 箱 = document.getElementById('self-review');
    if (!箱) return;

    箱.innerHTML = '<p class="hint">自分を見ています…</p>';
    const d = await 自分を見る(true);
    箱.innerHTML = '';

    // 自作AIがエラーの形（{error} など）で返すと 気づき が無く、.filter で落ちて画面が止まっていた。
    if (!d || !Array.isArray(d.気づき)) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '見られませんでした（自作AIが止まっているかもしれません）。';
        箱.appendChild(p);
        return;
    }

    const 頭 = document.createElement('p');
    const 直す = d.気づき.filter((x) => x.重さ >= 2).length;
    頭.className = 直す ? 'guard-off' : 'guard-on';
    頭.textContent = d.まとめ;
    箱.appendChild(頭);

    d.気づき.forEach((x) => {
        const 行 = document.createElement('div');
        行.className = 'review-item w' + x.重さ;

        const 件 = document.createElement('b');
        件.textContent = (x.重さ >= 2 ? '● ' : x.重さ === 1 ? '・ ' : '✓ ') + x.件;
        行.appendChild(件);

        if (x.訳) {
            const 訳 = document.createElement('p');
            訳.textContent = x.訳;
            行.appendChild(訳);
        }
        if (x.直し方) {
            const 手 = document.createElement('p');
            手.className = 'review-how';
            手.textContent = '→ ' + x.直し方;
            行.appendChild(手);
        }

        // 繰り返しを見つけたときは、その場で覚えさせられるようにする。
        // 「〜で並べられます」と言うだけでは、結局こちらが手を動かすことになる。
        if (x.手順の案 && x.手順の案.length) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-sm btn-primary';
            b.textContent = 'この順を、一つの作業として覚えさせる';
            b.addEventListener('click', () => 提案を覚えさせる(x.手順の案, b));
            行.appendChild(b);
        }

        箱.appendChild(行);
    });

    const 並び = document.createElement('div');
    並び.className = 'guard-row';
    const 再 = document.createElement('button');
    再.type = 'button';
    再.className = 'btn btn-sm btn-secondary';
    再.textContent = '↻ もう一度見る';
    再.addEventListener('click', render自分を良くする);
    並び.appendChild(再);
    箱.appendChild(並び);

    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>自分のコードを書き換えることはしません。</b>'
        + '誰も見ていないところで自分を書き換える仕組みは、'
        + '一度おかしくなったら止められないからです。<br>'
        + '直せるのは「覚えたこと」と「決めた数字」まで。'
        + '仕組みそのものには手を出しません。<br>'
        + '<b>見るのは一日一回、この端末の中だけです。</b>外へは何も送りません。';
    箱.appendChild(断り);
}

/** 見つけた繰り返しを、そのまま覚えさせる */
async function 提案を覚えさせる(手順の案, ボタン) {
    const 名 = prompt('この作業に名前を付けてください', 'いつもの流れ');
    if (!名) return;

    ボタン.disabled = true;
    ボタン.textContent = '覚えさせています…';

    const r = await fetch('/api/ai-local/learned-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            名前: 名,
            手順: 手順の案.map((a) => ({ action: a, why: a })),
            呼び方: [名],
        }),
    });
    const d = await r.json();
    showNotification(d.訳, d.ok ? 'success' : 'error');

    ボタン.disabled = false;
    ボタン.textContent = 'この順を、一つの作業として覚えさせる';
    if (typeof render作業を教える === 'function') render作業を教える();
}

function init自分を良くする() {
    if (document.getElementById('self-review')) render自分を良くする();

    // 一日一回、静かに見ておく。
    // 気づいたことは、次に画面を開いたときに出る。
    setTimeout(() => 自分を見る(false), 20000);
}

window.init自分を良くする = init自分を良くする;
window.render自分を良くする = render自分を良くする;
window.作業が使われた = 作業が使われた;
window.自分を見る = 自分を見る;
