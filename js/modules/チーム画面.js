/**
 * チーム（エージェントのページ）
 *
 * いくつもの頼みを、係ごとに手分けして、同時に進める。その係の顔ぶれと、動きを見られるようにする。
 *
 *   ・係の一覧 … 誰が、どの作業を専任で受け持つか
 *   ・下見     … 頼みを入れると、誰がやるかを見せる（動かさない）
 *   ・係を足す … 「相談」で、別の見方を出してもらう係を足せる（専任の作業は、はじめの係だけ）
 *   ・最近の動き … 手分けして進めた記録（点検係が確かめた件数つき）
 *
 * 実際に動かすのは チーム実行.js。ここは、見る・選ぶ・足すだけ。
 * すべてこの端末の中だけで動く。外部へは一切送らない。
 */

function チーム画面の行(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

async function チームの名簿を読む() {
    try {
        const r = await fetch('/api/ai-local/team/roster', { cache: 'no-store' });
        return r.ok ? await r.json() : null;
    } catch { return null; }
}

async function チームへ送る(道, 本文) {
    try {
        const r = await fetch('/api/ai-local' + 道, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(本文),
        });
        return await r.json();
    } catch { return { ok: false, 訳: '送れませんでした（AIエンジンに繋がりません）' }; }
}

function チームの名簿の枠(名簿, 作業の題, 描き直す) {
    const 箱 = document.createElement('div');
    箱.className = 'team-roster';

    const 司令 = document.createElement('div');
    司令.className = 'team-card commander';
    司令.append(チーム画面の行('b', `${名簿.司令.絵} ${名簿.司令.名前}`), チーム画面の行('small', 名簿.司令.役目));
    箱.appendChild(司令);

    名簿.係たち.forEach((x) => {
        const c = document.createElement('div');
        c.className = 'team-card idle';
        c.appendChild(チーム画面の行('b', `${x.絵} ${x.名前}`));
        c.appendChild(チーム画面の行('small', x.得意 || ''));
        if (x.専任.length) {
            c.appendChild(チーム画面の行('small', '専任: ' + x.専任.map((a) => 作業の題[a] || a).join('、'), 'team-own'));
        } else {
            c.appendChild(チーム画面の行('small', '相談役（見方を出す。専任の作業は持たない）', 'team-own'));
        }
        if (x.見方) c.title = x.見方;
        if (x.足した) {
            const 外す = チーム画面の行('button', '外す', 'btn btn-sm btn-secondary');
            外す.type = 'button';
            外す.addEventListener('click', async () => {
                if (!confirm(`「${x.名前}」を外しますか？（足した係だけが外せます）`)) return;
                const r = await チームへ送る('/team/agent/remove', { 名前: x.名前 });
                showNotification?.(r.訳 || (r.ok ? '外しました' : '外せませんでした'), r.ok ? 'success' : 'error');
                描き直す();
            });
            c.appendChild(外す);
        }
        箱.appendChild(c);
    });
    return 箱;
}

function チームの下見の枠() {
    const 枠 = document.createElement('div');
    枠.className = 'team-preview';
    枠.appendChild(チーム画面の行('h4', '誰がやるか、下見する（動かしません）'));

    const 形 = document.createElement('form');
    形.className = 'console-form';
    const 入力 = document.createElement('input');
    入力.type = 'text';
    入力.placeholder = '例: 在庫を確認して、少ないものをやることに入れて、バックアップも取って';
    入力.autocomplete = 'off';
    const ボタン = チーム画面の行('button', '下見', 'btn btn-secondary btn-sm');
    ボタン.type = 'submit';
    形.append(入力, ボタン);
    枠.appendChild(形);

    const 結果 = document.createElement('div');
    結果.className = 'team-preview-out';
    枠.appendChild(結果);

    形.addEventListener('submit', async (e) => {
        e.preventDefault();
        const 文 = 入力.value.trim();
        if (!文) return;
        結果.textContent = '調べています…';
        const r = await チームへ送る('/team/preview', { text: 文 });
        結果.textContent = '';
        if (!r.ok || !r.分かった) {
            結果.appendChild(チーム画面の行('p', r.訳 || '読み取れませんでした', 'hint'));
            return;
        }
        const ol = document.createElement('ol');
        r.段取り.steps.forEach((h) => {
            const 待ち = (h.wait || []).length ? `（${h.wait.map((w) => w + 1).join('・')}手目を待つ）` : '';
            ol.appendChild(チーム画面の行('li', `${h.agent_name}　${h.why}${待ち}`));
        });
        結果.appendChild(ol);
        結果.appendChild(チーム画面の行('p',
            r.段取り.team['同時に動く']
                ? `${r.段取り.team.agents.length}つの係が、同時に進みます。`
                : '前の結果に頼る手が続くので、順に進みます。', 'hint'));
        if ((r.分からなかった || []).length) {
            結果.appendChild(チーム画面の行('p', `分からなかった部分（行いません）: ${r.分からなかった.join('、')}`, 'hint'));
        }
        結果.appendChild(チーム画面の行('p', 'この頼みを、実際に任せるときは、上の「指示する」に、そのまま書いてください。', 'hint'));
    });
    return 枠;
}

function チームの係を足す枠(作業たち, 描き直す) {
    const d = document.createElement('details');
    d.className = 'team-add';
    d.appendChild(チーム画面の行('summary', '＋ 係を足す（相談で、別の見方を出す係）'));
    d.appendChild(チーム画面の行('p',
        '足した係は、「この値段でいいか迷ってる」のような相談のとき、自分の見方を出します。'
        + '作業を専任で受け持つのは、はじめの係だけです（同じ作業が二人に当たらないようにするため）。', 'hint'));

    const 形 = document.createElement('form');
    形.className = 'login-form';
    const 欄 = (ラベル, id, 例) => {
        const g = document.createElement('div');
        g.className = 'form-group';
        const l = チーム画面の行('label', ラベル);
        l.htmlFor = id;
        const i = document.createElement('input');
        i.type = 'text'; i.id = id; i.placeholder = 例 || ''; i.autocomplete = 'off';
        g.append(l, i);
        return g;
    };
    形.append(
        欄('名前', 'team-add-name', '例: 法務係'),
        欄('得意なこと', 'team-add-skill', '例: 契約・商標・著作権'),
        欄('呼ばれる言葉（、で区切る）', 'team-add-words', '例: 契約、商標、著作権、ライセンス'),
        欄('見方（この係は、何を見るか）', 'team-add-view', '例: 売れる前に、権利に引っかからないかを先に見ます'),
    );

    const 作業の箱 = document.createElement('fieldset');
    作業の箱.appendChild(チーム画面の行('legend', '知っている作業（相談のとき、この係が詳しい作業。任意）'));
    作業たち.forEach(([名, 題]) => {
        const l = document.createElement('label');
        l.className = 'checkbox-label';
        const c = document.createElement('input');
        c.type = 'checkbox'; c.value = 名;
        l.append(c, document.createTextNode(` ${題}`));
        作業の箱.appendChild(l);
    });
    形.appendChild(作業の箱);

    const ボタン = チーム画面の行('button', '足す', 'btn btn-secondary');
    ボタン.type = 'submit';
    形.appendChild(ボタン);
    形.addEventListener('submit', async (e) => {
        e.preventDefault();
        const 語 = document.getElementById('team-add-words').value.split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean);
        const r = await チームへ送る('/team/agent/add', {
            名前: document.getElementById('team-add-name').value.trim(),
            得意: document.getElementById('team-add-skill').value.trim(),
            呼ばれる言葉: 語,
            見方: document.getElementById('team-add-view').value.trim(),
            受け持つ作業: [...形.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value),
        });
        showNotification?.(r.訳 || (r.ok ? '足しました' : '足せませんでした'), r.ok ? 'success' : 'error');
        if (r.ok) 描き直す();
    });
    d.appendChild(形);
    return d;
}

function チームの最近の動きの枠() {
    const 枠 = document.createElement('div');
    枠.className = 'team-log';
    枠.appendChild(チーム画面の行('h4', '最近の動き'));
    const 一覧 = (typeof 蓄えを読む === 'function' ? 蓄えを読む('areglm_team_log') : []).slice(-5).reverse();
    if (!一覧.length) {
        枠.appendChild(チーム画面の行('p', 'まだ、手分けして進めたことはありません。「在庫を確認して、少ないものをやることに入れて」のように、いくつか頼んでみてください。', 'hint'));
        return 枠;
    }
    一覧.forEach((x) => {
        const 時 = new Date(x.時刻).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const 状 = x.止まった ? `止まりました（${x.止まった.係 || ''} ${x.止まった.手}）` : (x.飛ばし ? `${x.済}手済み・飛ばし${x.飛ばし}` : `${x.手数}手、すべて終わりました`);
        枠.appendChild(チーム画面の行('p', `${時}　${x.題}　${状}　［${(x.係たち || []).join('・')}／点検 ${x.確かめた || 0}件］`));
    });
    return 枠;
}

async function renderチーム画面() {
    const 箱 = document.getElementById('team-panel');
    if (!箱) return;
    箱.textContent = '';

    const 名簿 = await チームの名簿を読む();
    if (!名簿 || !名簿.ok) {
        箱.appendChild(チーム画面の行('p', '自作AIエンジンに繋がっていないため、チームの顔ぶれを読めません。', 'hint'));
        return;
    }
    const 作業の題 = Object.fromEntries(名簿.使える作業);
    const 描き直す = () => renderチーム画面();

    const いま = typeof チームで進めるか === 'function' ? チームで進めるか() : true;
    箱.appendChild(チーム画面の行('p', いま
        ? '現在: いくつもの頼みを、係ごとに手分けして、同時に進めます。'
        : '現在: これまでどおり、一人で順番に進めます。', いま ? 'guard-off' : 'guard-on'));
    const 切替 = チーム画面の行('button', いま ? '一人で順に進めるようにする' : 'チームで手分けして進める', 'btn btn-secondary btn-sm');
    切替.type = 'button';
    切替.addEventListener('click', () => {
        localStorage.setItem('areglm_agent_team', いま ? '0' : '1');
        showNotification?.(いま ? '一人で順に進めるようにしました' : 'チームで手分けして進めるようにしました', 'success');
        描き直す();
    });
    箱.appendChild(切替);
    箱.appendChild(チーム画面の行('p',
        'どちらでも、足りない中身は聞きます。失敗が出たら、どの係も新しい手を始めません。'
        + '消す・外へ送る・公開する、は、チームでも行いません。', 'hint'));

    箱.appendChild(チームの名簿の枠(名簿, 作業の題, 描き直す));
    箱.appendChild(チームの下見の枠());
    箱.appendChild(チームの係を足す枠(名簿.使える作業, 描き直す));
    箱.appendChild(チームの最近の動きの枠());
}

window.addEventListener('チームの記録が変わった', () => {
    // 描き直すのは、ページを開いているときだけ（読み込みの無駄を避ける）
    if (document.getElementById('team-panel')?.offsetParent) renderチーム画面();
});

window.renderチーム画面 = renderチーム画面;
