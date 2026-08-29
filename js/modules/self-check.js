/**
 * 自己点検と修復
 *
 * これまで、不具合が起きるたびに別の診断ページを開いて調べていた。
 * ツールを一つにまとめたいという方針に合わせ、
 * 点検も修復もこのツールの中だけで完結するようにする。
 *
 * ここで見るのは、実際に困ったことが起きた項目だけにしてある。
 * 項目を増やしすぎると、本当に見るべきものが埋もれるため。
 *
 * すべてこの端末の中だけで調べる。外部へは一切問い合わせない。
 */

/** 点検の結果をためる場所（画面に出すため） */
let 点検結果 = [];

/**
 * 点検を一つ実行する。
 *
 * @param {string} 名前 何を調べたか
 * @param {Function} 調べる {状態, 詳細, 直す?} を返す関数
 *        状態: 'ok' | 'warn' | 'ng'
 *        直す: あれば「直す」ボタンが出る
 */
function 点検する(名前, 調べる) {
    try {
        const r = 調べる();
        点検結果.push(Object.assign({ 名前 }, r));
    } catch (e) {
        点検結果.push({ 名前, 状態: 'ng', 詳細: '調べる途中で失敗しました: ' + e.message });
    }
}

/* ---------- 個々の点検 ---------- */

/**
 * 画面がスクロールできるか。
 * 指定を見るだけでは分からないので、実際に少し動かして確かめる。
 */
function スクロールを調べる() {
    const 中身 = document.documentElement.scrollHeight;
    const 画面 = document.documentElement.clientHeight;

    if (中身 <= 画面 + 1) {
        return { 状態: 'warn', 詳細: '中身が画面に収まっているため、判定できません' };
    }

    const もと = window.scrollY;
    window.scrollTo(0, もと + 10);
    const 動いた = window.scrollY !== もと;
    window.scrollTo(0, もと);

    if (動いた) return { 状態: 'ok', 詳細: '正常に動きます' };

    return {
        状態: 'ng',
        詳細: '動きません',
        直す: () => {
            document.documentElement.style.setProperty('overflow-y', 'auto', 'important');
            document.body.style.setProperty('overflow-y', 'visible', 'important');
            document.body.style.setProperty('position', 'static', 'important');
            document.body.style.setProperty('height', 'auto', 'important');
        },
    };
}

/**
 * どの入口で開いているか。
 * 8080 には古いキャッシュが残っていることがあり、
 * 「直したのに変わらない」の原因になっていた。
 */
function 入口を調べる() {
    const port = location.port;
    if (port === '8090') return { 状態: 'ok', 詳細: 'アプリ用（8090）' };
    if (port === '8443') return { 状態: 'ok', 詳細: '安全な接続（8443）' };
    if (port === '8080') {
        return {
            状態: 'warn',
            詳細: '通常（8080）— 古い画面が残っている場合があります',
            直す: () => {
                location.href = 'http://127.0.0.1:8090' + location.pathname;
            },
        };
    }
    return { 状態: 'ok', 詳細: port || '不明' };
}

/**
 * 古い画面をため込む仕組み（Service Worker）が残っていないか。
 * これが残っていると、直しても画面に反映されない。
 */
function 古い画面の残りを調べる() {
    if (!('serviceWorker' in navigator)) {
        return { 状態: 'ok', 詳細: 'この端末には仕組み自体がありません' };
    }
    // 調べるのに時間がかかるため、結果はあとから書き換える
    navigator.serviceWorker.getRegistrations().then((rs) => {
        書き換える('古い画面の残り', rs.length
            ? { 状態: 'ng', 詳細: rs.length + '件 残っています', 直す: 古い画面を消す }
            : { 状態: 'ok', 詳細: 'ありません' });
    });
    return { 状態: 'warn', 詳細: '調べています…' };
}

/** 古い画面のため込みを、根こそぎ消して開き直す */
async function 古い画面を消す() {
    if ('serviceWorker' in navigator) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map((r) => r.unregister()));
    }
    if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
    }
    location.reload();
}

/**
 * マイクが使える接続かどうか。
 * ブラウザは「安全な接続」でしかマイクを許さない。
 */
function マイクを調べる() {
    if (window.isSecureContext) return { 状態: 'ok', 詳細: '使えます' };
    return {
        状態: 'warn',
        詳細: 'この接続では使えません（127.0.0.1 か https:// が必要です）',
        直す: () => {
            location.href = 'http://127.0.0.1:8090' + location.pathname;
        },
    };
}

/**
 * いまマイクが入っていないか。
 * 「勝手に録音していない」ことを、自分の目で確かめられるようにする。
 */
function マイクの状態を調べる() {
    const 入っている = typeof マイクが入っているか === 'function' && マイクが入っているか();
    return 入っている
        ? {
            状態: 'warn',
            詳細: 'いま入っています',
            直す: () => {
                if (typeof 押して聞くのをやめる === 'function') 押して聞くのをやめる();
                if (typeof stopWakeListening === 'function') stopWakeListening();
            },
        }
        : { 状態: 'ok', 詳細: '切れています' };
}

/** 自作AIが動いているか */
function 自作AIを調べる() {
    fetch('/api/ai-local/health', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(() => 書き換える('自作AI', { 状態: 'ok', 詳細: '動いています' }))
        .catch(() => 書き換える('自作AI', {
            状態: 'ng',
            詳細: '止まっています（文字での作業はできますが、AIの返答はできません）',
        }));
    return { 状態: 'warn', 詳細: '調べています…' };
}

/** 画面の見た目が最新かどうか */
function 画面の版を調べる() {
    const 版 = window.AReGLM画面の版 || '不明';
    return { 状態: 版 === '不明' ? 'warn' : 'ok', 詳細: 版 };
}

/* ---------- 画面に出す ---------- */

/** あとから届いた結果で、既に出した行を書き換える */
function 書き換える(名前, 結果) {
    const i = 点検結果.findIndex((r) => r.名前 === 名前);
    if (i < 0) return;
    点検結果[i] = Object.assign({ 名前 }, 結果);
    描く();
}

function 描く() {
    const box = document.getElementById('self-check-list');
    if (!box) return;

    const 印 = { ok: '✓', warn: '△', ng: '✗' };

    box.innerHTML = '';
    点検結果.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'check-row check-' + r.状態;
        row.innerHTML =
            '<span class="check-mark">' + 印[r.状態] + '</span>'
            + '<span class="check-name"></span>'
            + '<span class="check-detail"></span>';
        row.querySelector('.check-name').textContent = r.名前;
        row.querySelector('.check-detail').textContent = r.詳細;

        if (typeof r.直す === 'function') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-secondary';
            btn.textContent = '直す';
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = '直しています…';
                await r.直す();
                selfCheckRun();
            });
            row.appendChild(btn);
        }
        box.appendChild(row);
        void i;
    });

    const ng = 点検結果.filter((r) => r.状態 === 'ng').length;
    const warn = 点検結果.filter((r) => r.状態 === 'warn').length;
    const sum = document.getElementById('self-check-summary');
    if (sum) {
        sum.className = 'status-banner ' + (ng ? 'error' : warn ? 'warn' : 'ok');
        sum.textContent = ng
            ? ng + '件、直したほうがよい項目があります'
            : warn
                ? warn + '件、確認中または注意の項目があります'
                : 'すべて正常です';
    }
}

/** 点検を最初から実行する */
function selfCheckRun() {
    点検結果 = [];
    点検する('画面のスクロール', スクロールを調べる);
    点検する('入口', 入口を調べる);
    点検する('古い画面の残り', 古い画面の残りを調べる);
    点検する('マイクが使えるか', マイクを調べる);
    点検する('いまマイクは', マイクの状態を調べる);
    点検する('自作AI', 自作AIを調べる);
    点検する('画面の版', 画面の版を調べる);
    描く();
}

/** 結果を文字にして写す。困ったときにそのまま貼れるようにするため。 */
async function selfCheckCopy() {
    const text = [
        'AReGLM 自己点検 ' + new Date().toLocaleString('ja-JP'),
        'アドレス: ' + location.href,
        'ブラウザ: ' + navigator.userAgent,
        '',
    ].concat(点検結果.map((r) => `[${r.状態}] ${r.名前}: ${r.詳細}`)).join('\n');

    try {
        await navigator.clipboard.writeText(text);
        showNotification('点検結果を写しました', 'success');
    } catch {
        prompt('この内容を写してください', text);
    }
}

/** 直せるものを、まとめて全部直す */
async function selfCheckFixAll() {
    const 直すもの = 点検結果.filter((r) => typeof r.直す === 'function');
    if (!直すもの.length) {
        showNotification('直す項目はありません', 'success');
        return;
    }
    // 画面が切り替わる修復は最後に回す（途中で止まらないように）
    for (const r of 直すもの) {
        await r.直す();
    }
    selfCheckRun();
}

function initSelfCheck() {
    document.getElementById('self-check-run')?.addEventListener('click', selfCheckRun);
    document.getElementById('self-check-copy')?.addEventListener('click', selfCheckCopy);
    document.getElementById('self-check-fix')?.addEventListener('click', selfCheckFixAll);
}

window.initSelfCheck = initSelfCheck;
window.selfCheckRun = selfCheckRun;

/**
 * 点検の結果を、外から読めるようにする。
 *
 * 「まとめて更新」から結果を数えたいが、
 * 画面の中身を数えるのは当てにならない。
 * 描き方を変えたとたんに数え方が壊れる。
 * 元の結果を直接渡すほうが確かで、壊れにくい。
 */
window.点検結果を読む = () => 点検結果;
