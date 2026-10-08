/**
 * 言葉を覚える（ブラウザのマイクは使わない）
 *
 * なぜこの形なのか:
 *   ブラウザにマイクを許すと、そのページを開いている間ずっと
 *   マイクを使える状態になる。
 *   人と話しているときに勝手に反応されたくない、という話だったので、
 *   ブラウザには一度も許さずに済ませたい。
 *
 *   そこで、覚えるときだけ小さなプログラムを短く動かす。
 *   マイクを許す先は、その一つだけになる。
 *   macOS が一度だけ聞いてきて、以後は聞かれない。
 *
 * 正直に書いておきます:
 *   <b>呼び名を聞き取るには、マイクは聞き続ける必要があります。</b>
 *   聞いていないものは聞き取れません。これは仕組みではなく物理の話です。
 *
 *   代わりに、<b>人と話している最中には反応しない</b>ようにしてあります。
 *   ・覚えた呼び名と、はっきり近いときだけ
 *   ・呼びかけの前が静かなときだけ（会話が続いている最中は応じない）
 *   ・一度反応したら5秒は反応しない
 */

/** 覚えておくとよい言葉。押すだけで録れるようにする。 */
const 覚えておくとよい言葉 = [
    '在庫を見せて',
    '今日の状況',
    '点検して',
    '次は何をすればいい',
];

async function 覚えている言葉を読む() {
    try {
        const r = await fetch('/api/voice-teach', { cache: 'no-store' });
        return r.ok ? (await r.json()).言葉たち : [];
    } catch {
        return [];
    }
}

/** 一つの言葉を録る */
async function 声を録る(言葉, 押したボタン) {
    if (!言葉) return;

    const 元の字 = 押したボタン ? 押したボタン.textContent : '';
    if (押したボタン) {
        押したボタン.disabled = true;
        押したボタン.textContent = '「どうぞ」の後に話してください…';
    }
    showNotification(`「${言葉}」と言ってください（「どうぞ」の合図が鳴ります）`, 'info');

    try {
        const r = await fetch('/api/voice-teach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 言葉, 秒: 2.5 }),
        });
        const d = await r.json();
        showNotification(d.訳 || (d.ok ? '覚えました' : '覚えられませんでした'),
            d.ok ? 'success' : 'error');

        // 待ち受けが始まったら、はっきり知らせる。
        // 「あとは何をすればいいのか」を残さないため。
        if (d.待ち受けを始めた) {
            showNotification('準備ができました。呼びかけてみてください。', 'success');
        }
    } catch (e) {
        showNotification('録れませんでした: ' + e.message, 'error');
    }

    if (押したボタン) {
        押したボタン.disabled = false;
        押したボタン.textContent = 元の字;
    }
    render声を覚える();
    if (typeof render声の診断 === 'function') render声の診断();
    if (typeof render常駐の待ち受け === 'function') render常駐の待ち受け();
}

async function render声を覚える() {
    const 箱 = document.getElementById('voice-teach2');
    if (!箱) return;

    const 覚えた = await 覚えている言葉を読む();
    const 呼び名 = localStorage.getItem('areglm_wake_name') || 'アレラム';

    // 呼び名を、待ち受け側にも伝えておく。
    // 画面だけが知っていると、常駐は別の名前を待つことになる。
    try {
        await fetch('/api/voice-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 名: 呼び名 }),
        });
    } catch { /* 伝えられなくても、覚えること自体はできる */ }
    const 呼び名の回数 = (覚えた.find((x) => x.言葉 === 呼び名) || {}).回数 || 0;

    箱.innerHTML = '';

    /* --- 何をすればよいか --- */
    const 手順 = document.createElement('p');
    手順.className = 'hint';
    手順.innerHTML = 呼び名の回数 >= 2
        ? '準備はできています。呼びかけてみてください。'
        : `<b>押して、鳴った合図のあとに話すだけです。</b>`
          + `まず「${呼び名}」を2回。`
          + '2回目が終わると、こちらで待ち受けを始めます（設定は要りません）。';
    箱.appendChild(手順);

    /* --- 呼び名 --- */
    const 見出し1 = document.createElement('p');
    見出し1.className = 呼び名の回数 >= 2 ? 'guard-on' : 'guard-off';
    見出し1.textContent = 呼び名の回数 >= 2
        ? `「${呼び名}」を ${呼び名の回数}通りの言い方で覚えています`
        : 呼び名の回数 === 1
            ? `「${呼び名}」を1回だけ覚えています（もう一度録ると確かになります）`
            : `まず「${呼び名}」を覚えさせてください`;
    箱.appendChild(見出し1);

    const 行1 = document.createElement('div');
    行1.className = 'guard-row';
    const 呼ぶ = document.createElement('button');
    呼ぶ.type = 'button';
    呼ぶ.className = 'btn btn-primary';
    呼ぶ.textContent = `🎤 「${呼び名}」と言って録る`;
    呼ぶ.addEventListener('click', () => 声を録る(呼び名, 呼ぶ));
    行1.appendChild(呼ぶ);
    箱.appendChild(行1);

    /* --- 用件 --- */
    const 見出し2 = document.createElement('h5');
    見出し2.className = 'rule-head';
    見出し2.textContent = '声で頼めるようにする言葉';
    箱.appendChild(見出し2);

    const 並び = document.createElement('div');
    並び.className = 'teach-chips';
    覚えておくとよい言葉.forEach((w) => {
        const 済 = 覚えた.find((x) => x.言葉 === w);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'teach-chip' + (済 ? ' done' : '');
        // 文をつなげて入れていた。ストッパーが見つけた。
        // 言葉は覚えさせるときに本人が入れるので、何が入るか決まっていない。
        b.textContent = '';
        const 名 = document.createElement('b');
        名.textContent = (済 ? '✓ ' : '🎤 ') + w;
        b.appendChild(名);
        const 注 = document.createElement('small');
        注.textContent = 済 ? `${済.回数}回 覚えています` : '押すと録れます';
        b.appendChild(注);
        b.addEventListener('click', () => 声を録る(w, b));
        並び.appendChild(b);
    });
    箱.appendChild(並び);

    /* --- 自分で決めた言葉 --- */
    const 行2 = document.createElement('div');
    行2.className = 'guard-row';
    const 入力 = document.createElement('input');
    入力.type = 'text';
    入力.placeholder = '自分で決めた言い方（例: 今日の売上）';
    入力.autocomplete = 'off';
    const 録る = document.createElement('button');
    録る.type = 'button';
    録る.className = 'btn btn-sm btn-secondary';
    録る.textContent = '🎤 これを録る';
    録る.addEventListener('click', () => {
        const w = 入力.value.trim();
        if (!w) return;
        入力.value = '';
        声を録る(w, 録る);
    });
    入力.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); 録る.click(); }
    });
    行2.appendChild(入力);
    行2.appendChild(録る);
    箱.appendChild(行2);

    /* --- 覚えた一覧 --- */
    if (覚えた.length) {
        const 一覧 = document.createElement('ul');
        一覧.className = 'guard-devices';
        覚えた.forEach((x) => {
            const li = document.createElement('li');
            const 名 = document.createElement('span');
            名.textContent = `${x.言葉}（${x.回数}回）`;
            li.appendChild(名);

            const 忘 = document.createElement('button');
            忘.type = 'button';
            忘.className = 'btn btn-sm btn-secondary';
            忘.textContent = '忘れる';
            忘.addEventListener('click', async () => {
                await fetch('/api/voice-teach/forget', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 言葉: x.言葉 }),
                });
                showNotification(`「${x.言葉}」を忘れました`, 'success');
                render声を覚える();
                if (typeof render声の診断 === 'function') render声の診断();
            });
            li.appendChild(忘);
            一覧.appendChild(li);
        });
        箱.appendChild(一覧);
    }

    /* --- 正直に書く --- */
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>ブラウザにマイクを許す必要はありません。</b>'
        + '録るときだけ、小さなプログラムが短くマイクを使います。'
        + 'macOS が一度だけ許可を聞いてきて、以後は聞かれません。<br><br>'
        + '<b>呼び名を聞き取るには、マイクは聞き続ける必要があります。</b>'
        + '聞いていないものは聞き取れません。これは仕組みではなく物理の話です。<br>'
        + '代わりに、<b>人と話している最中には反応しません</b>。'
        + '覚えた呼び名にはっきり近いこと、'
        + '<b>呼びかけの前が静かなこと</b>（会話が続いている最中は応じない）、'
        + '一度反応したら5秒は反応しないこと——この三つを全部満たしたときだけ応じます。';
    箱.appendChild(断り);
}

function init声を覚える() {
    if (document.getElementById('voice-teach2')) render声を覚える();
}

window.init声を覚える = init声を覚える;
window.render声を覚える = render声を覚える;
