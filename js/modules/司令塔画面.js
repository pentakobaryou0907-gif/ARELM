/**
 * 司令塔の画面 ― 席を外しても進む係の仕事を見て、確認の門を開く
 *
 * チーム画面.js（開いているあいだの同時作業）とは別。混ぜない。
 * 進み具合はサーバーの列が持つので、どの端末から見ても同じ。
 * 送る・公開する・消すの門は、本人が「よい」「見送り」を押す。
 * SUZURIの公開ボタンは、よいでも押さない。
 *
 * すべてこの端末の中だけで動く。外部へは一切送らない。
 */

function 司令の行(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

async function 司令へ送る(道, 本文) {
    if (typeof アカウントAPI === 'function') {
        const r = await アカウントAPI(道, 本文);
        if (r) return r;
    }
    try {
        const r = await fetch(道.startsWith('/api/hq') ? '/api/ai-local' + 道.replace('/api/hq', '/hq') : 道, {
            method: 本文 ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' },
            body: 本文 ? JSON.stringify(本文) : undefined,
        });
        return await r.json();
    } catch {
        return { ok: false, 訳: '司令塔に繋がりません（Macのサーバーを確かめてください）' };
    }
}

async function 司令の様子を読む() {
    return 司令へ送る('/api/hq/status');
}

async function 司令に頼む(本文) {
    return 司令へ送る('/api/hq/submit', { text: 本文 });
}

function 司令の状態の題(状態) {
    return ({
        進行中: '進めています',
        承認待ち: '確認待ち',
        画面待ち: '画面が開いたら',
        完了: '終わりました',
        失敗: '止まりました',
        取り消し: '取り消しました',
        待ち: '待ち',
        実行中: '実行中',
        見送り: '見送り',
    })[状態] || 状態 || '';
}

function 司令の仕事カード(仕事, 描き直す) {
    const 札 = document.createElement('article');
    札.className = 'hq-job hq-job-' + (仕事.状態 || '');
    札.appendChild(司令の行('div', `${仕事.名前 || 仕事.頼み || '仕事'}　${司令の状態の題(仕事.状態)}`, 'hq-job-head'));
    if (仕事.頼み) 札.appendChild(司令の行('p', 仕事.頼み, 'hint'));

    const 門 = 仕事.門;
    if (門 && 門.状態 === '待ち') {
        const 枠 = document.createElement('div');
        枠.className = 'hq-gate';
        枠.appendChild(司令の行('p', '確認が要ります: ' + (門.訳 || '')));
        const よい = 司令の行('button', 'よい', 'btn btn-sm btn-primary');
        よい.type = 'button';
        const 見送り = 司令の行('button', '見送り', 'btn btn-sm btn-secondary');
        見送り.type = 'button';
        よい.addEventListener('click', async () => {
            const r = await 司令へ送る('/api/hq/approve', { id: 仕事.id, よい: true });
            showNotification?.(r.訳 || (r.ok ? '受け取りました' : 'できませんでした'), r.ok ? 'info' : 'error');
            描き直す();
        });
        見送り.addEventListener('click', async () => {
            const r = await 司令へ送る('/api/hq/approve', { id: 仕事.id, よい: false });
            showNotification?.(r.訳 || '見送りにしました', r.ok ? 'info' : 'error');
            描き直す();
        });
        枠.append(よい, 見送り);
        札.appendChild(枠);
    }

    (仕事.steps || []).forEach((h) => {
        const 行 = 司令の行('p', `${h.agent_name || '係'}　${司令の状態の題(h.状態)}　${h.why || h.action}`);
        行.className = 'hq-step hq-step-' + (h.状態 || '');
        const 結 = h.結果 && h.結果.文;
        if (結) 行.appendChild(司令の行('small', '　' + String(結).slice(0, 80)));
        if (h.状態 === '承認待ち') {
            const よい = 司令の行('button', 'よい', 'btn btn-sm btn-primary');
            よい.type = 'button';
            よい.addEventListener('click', async () => {
                const r = await 司令へ送る('/api/hq/approve', { id: 仕事.id, よい: true, 番号: h.番号 });
                showNotification?.(r.訳 || '受け取りました', r.ok ? 'info' : 'error');
                描き直す();
            });
            const 見送り = 司令の行('button', '見送り', 'btn btn-sm btn-secondary');
            見送り.type = 'button';
            見送り.addEventListener('click', async () => {
                await 司令へ送る('/api/hq/approve', { id: 仕事.id, よい: false, 番号: h.番号 });
                描き直す();
            });
            行.append(よい, 見送り);
        }
        札.appendChild(行);
    });

    if (仕事.報告) 札.appendChild(司令の行('pre', 仕事.報告, 'hq-report'));

    if (仕事.状態 === '進行中' || 仕事.状態 === '承認待ち' || 仕事.状態 === '画面待ち') {
        const やめる = 司令の行('button', 'この仕事をやめる', 'btn btn-sm btn-secondary');
        やめる.type = 'button';
        やめる.addEventListener('click', async () => {
            const r = await 司令へ送る('/api/hq/cancel', { id: 仕事.id });
            showNotification?.(r.訳 || (r.ok ? 'やめました' : 'やめられませんでした'), r.ok ? 'info' : 'error');
            描き直す();
        });
        札.appendChild(やめる);
    }
    return 札;
}

function 司令の決まりの枠(決まり, 描き直す) {
    const 枠 = document.createElement('div');
    枠.className = 'hq-rules';
    枠.appendChild(司令の行('h4', '決まった時刻に、裏で進める'));
    枠.appendChild(司令の行('p', '画面を閉じていても、Macが起きていれば進みます。送る・公開する・消す、は入れません。', 'hint'));
    (決まり || []).forEach((x) => {
        const 行 = document.createElement('label');
        行.className = 'checkbox-label';
        const 箱 = document.createElement('input');
        箱.type = 'checkbox';
        箱.checked = x.使う !== false;
        箱.addEventListener('change', async () => {
            x.使う = 箱.checked;
            const r = await 司令へ送る('/api/hq/config', { 決まり });
            showNotification?.(r.ok ? (箱.checked ? `「${x.名前}」を使います` : `「${x.名前}」を止めました`) : '保存できませんでした', r.ok ? 'success' : 'error');
            描き直す();
        });
        行.append(箱, document.createTextNode(` ${x.名前}（${x.時刻 || ''}${x.曜日 ? '・' + x.曜日 : ''}）`));
        枠.appendChild(行);
        if (x.説) 枠.appendChild(司令の行('p', x.説, 'hint'));
    });
    return 枠;
}

async function render司令塔() {
    const 様子 = await 司令の様子を読む();
    const 描き直す = () => render司令塔();
    ['hq-panel', 'hq-mainai-panel'].forEach((id) => {
        const 箱 = document.getElementById(id);
        if (箱) 司令の箱を埋める(箱, 様子, 描き直す);
    });
}

function 司令の箱を埋める(箱, 様子, 描き直す) {
    箱.textContent = '';

    if (!様子 || 様子.ok === false) {
        箱.appendChild(司令の行('p', (様子 && 様子.訳) || '司令塔に繋がりません。Macのサーバーが動いているときだけ、席を外しても進みます。', 'hint'));
        return;
    }

    const 形 = document.createElement('form');
    形.className = 'console-form';
    const 欄 = document.createElement('input');
    欄.type = 'text';
    欄.placeholder = '例: 席を外して在庫を見て、少ないものをやることに入れて';
    欄.autocomplete = 'off';
    const 送 = 司令の行('button', '裏で進める', 'btn btn-primary btn-sm');
    送.type = 'submit';
    形.append(欄, 送);
    形.addEventListener('submit', async (e) => {
        e.preventDefault();
        const 文 = 欄.value.trim();
        if (!文) return;
        const r = await 司令に頼む(文);
        showNotification?.(r.訳 || (r.分かった ? '列に積みました' : '読み取れませんでした'), r.分かった ? 'success' : 'error');
        if (r.分かった) 欄.value = '';
        描き直す();
    });
    箱.appendChild(形);

    const 待ち = (様子.一覧 || []).filter((x) => x.状態 === '承認待ち' || (x.門 && x.門.状態 === '待ち'));
    const 動き = (様子.一覧 || []).filter((x) => x.状態 === '進行中' || x.状態 === '画面待ち');
    const 終わった = (様子.一覧 || []).filter((x) => x.状態 === '完了' || x.状態 === '失敗' || x.状態 === '取り消し').slice(0, 8);

    if (待ち.length) {
        箱.appendChild(司令の行('h4', '確認待ち（よい／見送り）'));
        待ち.forEach((x) => 箱.appendChild(司令の仕事カード(x, 描き直す)));
    }
    if (動き.length) {
        箱.appendChild(司令の行('h4', '進めています'));
        動き.forEach((x) => 箱.appendChild(司令の仕事カード(x, 描き直す)));
    }
    if (!待ち.length && !動き.length) {
        箱.appendChild(司令の行('p', 'いま動いている仕事はありません。「席を外して在庫を見て」のように頼むか、下の時刻の決まりを使ってください。', 'hint'));
    }
    if (終わった.length) {
        箱.appendChild(司令の行('h4', '最近の報告'));
        終わった.forEach((x) => 箱.appendChild(司令の仕事カード(x, 描き直す)));
    }

    箱.appendChild(司令の決まりの枠(様子.決まり || [], 描き直す));
}

async function render司令のホーム() {
    const 箱 = document.getElementById('hq-home-panel');
    if (!箱) return;
    箱.textContent = '';
    const 様子 = await 司令の様子を読む();
    if (!様子 || 様子.ok === false) {
        箱.appendChild(司令の行('p', 'Macのサーバーが動いているときだけ、席を外しても進みます。', 'hint'));
        return;
    }
    const 待ち = (様子.一覧 || []).filter((x) => x.状態 === '承認待ち' || (x.門 && x.門.状態 === '待ち'));
    const 動き = (様子.一覧 || []).filter((x) => x.状態 === '進行中' || x.状態 === '画面待ち');
    if (待ち.length) {
        箱.appendChild(司令の行('p', `確認待ちが ${待ち.length}件 あります。「作業」でよい／見送りを選んでください。`, 'hq-home-alert'));
    } else if (動き.length) {
        箱.appendChild(司令の行('p', `いま ${動き.length}件、裏で進めています。`, 'hint'));
    } else {
        箱.appendChild(司令の行('p', '動いている仕事はありません。「席を外して〜して」と頼むと、画面を閉じても進みます。', 'hint'));
    }
}

const 司令の画面の最中 = new Set();

async function 司令の画面待ちを進める() {
    if (typeof 指示を実行して結果を返す !== 'function') return;
    const 様子 = await 司令の様子を読む();
    if (!様子 || !様子.ok) return;
    for (const 仕事 of 様子.一覧 || []) {
        for (const 手 of 仕事.steps || []) {
            if (手.状態 !== '画面待ち') continue;
            const 鍵 = 仕事.id + ':' + 手.番号;
            if (司令の画面の最中.has(鍵)) continue;
            司令の画面の最中.add(鍵);
            try {
                const 結果 = await 指示を実行して結果を返す({ action: 手.action, params: 手.params || {} }, 'mainai');
                await 司令へ送る('/api/hq/screen-done', { id: 仕事.id, 番号: 手.番号, 結果: { ok: 結果.ok, 文: 結果.文 } });
            } finally {
                司令の画面の最中.delete(鍵);
            }
        }
    }
}

function init司令塔() {
    render司令塔();
    render司令のホーム();
    司令の画面待ちを進める();
    const 間隔 = window.AReGLM_PERF
        ? AReGLM_PERF.smartInterval(() => { render司令塔(); render司令のホーム(); 司令の画面待ちを進める(); }, 20 * 1000)
        : { id: setInterval(() => { render司令塔(); render司令のホーム(); 司令の画面待ちを進める(); }, 20 * 1000) };
    return 間隔;
}

window.init司令塔 = init司令塔;
window.render司令塔 = render司令塔;
window.render司令のホーム = render司令のホーム;
window.司令に頼む = 司令に頼む;
window.司令の様子を読む = 司令の様子を読む;
