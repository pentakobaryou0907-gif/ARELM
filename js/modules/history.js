/**
 * 履歴（これまでの作業を見返す）
 *
 * なぜこれが要るのか:
 *   何をしたかが記録されていても、見返せなければ意味がない。
 *   とくに大事なのは「同じ失敗を繰り返さないこと」で、
 *   そのためには過去の失敗を、探せる形で残す必要がある。
 *
 * ここでやること:
 *   1. これまでの作業を、日ごと・種類ごとに見返せるようにする
 *   2. うまくいかなかったことに印を付けて、あとで探せるようにする
 *   3. 同じことが何度も起きていないかを数える
 *
 * 3つ目がいちばん大事。
 * 一度きりの失敗は忘れてよいが、
 * 繰り返している失敗は、仕組みの問題であることが多い。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const AREGLM_TROUBLE_KEY = 'areglm_troubles';

/** 記録を読む */
function 履歴を読む() {
    try {
        const r = JSON.parse(localStorage.getItem('areglm_activity_log') || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

/** うまくいかなかったことの記録 */
function 失敗を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_TROUBLE_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 失敗を保存(一覧) {
    localStorage.setItem(AREGLM_TROUBLE_KEY, JSON.stringify(一覧.slice(-200)));
}

/**
 * うまくいかなかったことを残す。
 *
 * 「何が起きたか」だけでなく「どうしたか」も一緒に残す。
 * 対処が分からないと、次に同じことが起きても役に立たないため。
 */
function 失敗を残す(何が, どうした, 種類) {
    何が = (何が || '').trim();
    if (!何が) return false;

    const 一覧 = 失敗を読む();

    // 同じことが前にもあったかを見る。
    // 繰り返しているかどうかが、いちばん大事な情報。
    const 同じもの = 一覧.filter((x) => x.何が === 何が);

    一覧.push({
        id: 'tr_' + Date.now(),
        何が,
        どうした: (どうした || '').trim(),
        種類: 種類 || 'その他',
        回数: 同じもの.length + 1,
        とき: new Date().toISOString(),
        日: typeof 今日 === 'function' ? 今日() : '',
    });

    失敗を保存(一覧);
    renderHistory();

    if (同じもの.length >= 1 && typeof showNotification === 'function') {
        showNotification(
            `これは${同じもの.length + 1}回目です:「${何が}」`
            + ' 同じことが繰り返されています。仕組みを見直したほうがよいかもしれません。',
            'warn'
        );
    }
    return true;
}

/**
 * 繰り返している失敗を数える。
 *
 * 一度きりのものは出さない。
 * 全部出すと、本当に手を打つべきものが埋もれるため。
 */
function 繰り返している失敗() {
    const 一覧 = 失敗を読む();
    const 数え = {};

    一覧.forEach((x) => {
        if (!数え[x.何が]) 数え[x.何が] = { 何が: x.何が, 回数: 0, 最後: x.とき, どうした: [] };
        数え[x.何が].回数++;
        数え[x.何が].最後 = x.とき;
        if (x.どうした) 数え[x.何が].どうした.push(x.どうした);
    });

    return Object.values(数え)
        .filter((x) => x.回数 >= 2)
        .sort((a, b) => b.回数 - a.回数);
}

/* ---------- 画面 ---------- */

/** いま見ている種類 */
let 履歴の絞り = '作業';

function renderHistory() {
    document.querySelectorAll('[data-hist-tab]').forEach((b) => {
        b.classList.toggle('active', b.dataset.histTab === 履歴の絞り);
    });

    const 箱 = document.getElementById('history-list');
    if (!箱) return;
    箱.innerHTML = '';

    if (履歴の絞り === '作業') 作業を出す(箱);
    else if (履歴の絞り === '失敗') 失敗を出す(箱);
    else 繰り返しを出す(箱);
}

/** これまでの作業を、日ごとにまとめて出す */
function 作業を出す(箱) {
    const 一覧 = 履歴を読む().slice().reverse();

    if (!一覧.length) {
        箱.innerHTML = '<div class="hint">まだ記録がありません</div>';
        return;
    }

    // 日ごとにまとめる。ずらっと並べても、いつのことか分からないため。
    const 日ごと = {};
    一覧.forEach((x) => {
        const 日 = (x.at || '').slice(0, 10);
        (日ごと[日] = 日ごと[日] || []).push(x);
    });

    Object.entries(日ごと).forEach(([日, たち]) => {
        const h = document.createElement('h4');
        h.className = 'hist-day';
        h.textContent = `${日}（${たち.length}件）`;
        箱.appendChild(h);

        たち.forEach((x) => {
            const d = document.createElement('div');
            d.className = 'hist-row';
            const 時 = document.createElement('span');
            時.className = 'hist-time';
            時.textContent = new Date(x.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            const 文 = document.createElement('span');
            文.className = 'hist-text';
            文.textContent = x.message;
            d.appendChild(時);
            d.appendChild(文);
            箱.appendChild(d);
        });
    });
}

/** うまくいかなかったことを出す */
function 失敗を出す(箱) {
    const 一覧 = 失敗を読む().slice().reverse();

    if (!一覧.length) {
        箱.innerHTML = '<div class="hint">記録された失敗はありません。'
            + '下から残せます。次に同じことが起きたとき、すぐ気づけるようになります。</div>';
        return;
    }

    一覧.forEach((x) => {
        const d = document.createElement('div');
        d.className = 'hist-trouble' + (x.回数 >= 2 ? ' repeated' : '');

        const 上 = document.createElement('div');
        上.className = 'hist-t-head';
        const 何 = document.createElement('b');
        何.textContent = x.何が;
        上.appendChild(何);

        if (x.回数 >= 2) {
            const 印 = document.createElement('span');
            印.className = 'hist-count';
            印.textContent = `${x.回数}回目`;
            上.appendChild(印);
        }

        const 日 = document.createElement('span');
        日.className = 'hist-time';
        日.textContent = x.日 || (x.とき || '').slice(0, 10);
        上.appendChild(日);

        d.appendChild(上);

        if (x.どうした) {
            const 対 = document.createElement('div');
            対.className = 'hist-fix';
            対.textContent = '対処: ' + x.どうした;
            d.appendChild(対);
        }

        箱.appendChild(d);
    });
}

/** 繰り返している失敗だけを出す */
function 繰り返しを出す(箱) {
    const 一覧 = 繰り返している失敗();

    if (!一覧.length) {
        箱.innerHTML = '<div class="hint">同じことを繰り返した記録はありません。</div>';
        return;
    }

    const 頭 = document.createElement('p');
    頭.className = 'hint';
    頭.textContent = '2回以上起きたものだけを出しています。'
        + '繰り返しているものは、その場の対処ではなく、仕組みを見直したほうがよいことが多いです。';
    箱.appendChild(頭);

    一覧.forEach((x) => {
        const d = document.createElement('div');
        d.className = 'hist-trouble repeated';

        const 上 = document.createElement('div');
        上.className = 'hist-t-head';
        const 何 = document.createElement('b');
        何.textContent = x.何が;
        const 印 = document.createElement('span');
        印.className = 'hist-count';
        印.textContent = `${x.回数}回`;
        上.appendChild(何);
        上.appendChild(印);
        d.appendChild(上);

        // これまでの対処を並べる。効かなかったことが分かる。
        if (x.どうした.length) {
            const 対 = document.createElement('div');
            対.className = 'hist-fix';
            対.textContent = 'これまでの対処: ' + [...new Set(x.どうした)].join(' ／ ');
            d.appendChild(対);
        }

        箱.appendChild(d);
    });
}

function initHistory() {
    document.querySelectorAll('[data-hist-tab]').forEach((b) => {
        b.addEventListener('click', () => {
            履歴の絞り = b.dataset.histTab;
            renderHistory();
        });
    });

    document.getElementById('trouble-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const 何 = document.getElementById('trouble-what');
        const ど = document.getElementById('trouble-fix');
        if (!失敗を残す(何?.value, ど?.value)) return;
        if (何) 何.value = '';
        if (ど) ど.value = '';
    });

    renderHistory();
}

window.initHistory = initHistory;
window.renderHistory = renderHistory;
window.失敗を残す = 失敗を残す;
window.失敗を読む = 失敗を読む;
window.繰り返している失敗 = 繰り返している失敗;
