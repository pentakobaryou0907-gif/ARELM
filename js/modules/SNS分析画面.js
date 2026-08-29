/**
 * SNSの成績を入れて、グラフで見る画面
 *
 * 画面の決まり:
 *   ・入れる手間を最小にする。投稿1件につき数字は3つだけ。
 *   ・数を見せて終わりにしない。「次に何をするか」まで出す。
 *   ・記録が足りないときは、足りないと言う。
 *     少ない材料で言い切ると、それは当てずっぽうになる。
 */

async function renderSNS分析() {
    const 箱 = document.getElementById('sns-analytics');
    if (!箱) return;

    箱.innerHTML = '';

    /* --- 分析（先に見て、件数を知る） --- */
    const d = SNS成績を分析する(現在の場所());

    /* --- 数字を入れる --- */
    箱.appendChild(成績を入れる欄(!d.足りる));

    const 頭 = document.createElement('p');
    頭.className = d.足りる ? 'guard-on' : 'hint';
    頭.textContent = d.足りる
        ? `${d.件数}件の記録から分析しました`
        : d.訳;
    箱.appendChild(頭);

    if (!d.足りる) {
        // 何が出るようになるのかを、先に見せる。
        //
        // 「たまれば分かります」だけでは、何がどう分かるのか伝わらない。
        // 入れる手間に見合うかどうかを、判断できない。
        const 見出し = document.createElement('h5');
        見出し.className = 'rule-head';
        見出し.textContent = 'たまると、こういうことが分かります';
        箱.appendChild(見出し);

        const 並び = document.createElement('ul');
        並び.className = 'growth-log';
        [
            'どの時間に出すと効くか（朝・昼・夕・夜のどれか）',
            'どの曜日が効くか',
            'どの型が効くか（写真・動画・複数枚）',
            '長い文と短い文、どちらが読まれるか',
            '見られる数が伸びているか、落ちているか',
            'いちばん効いた投稿と、効かなかった投稿',
        ].forEach((文) => {
            const li = document.createElement('li');
            li.textContent = 文;
            並び.appendChild(li);
        });
        箱.appendChild(並び);

        箱.appendChild(正直な断り());
        return;
    }

    /* --- 気づき（先に出す） --- */
    d.気づき.forEach((x) => {
        const 行 = document.createElement('div');
        行.className = 'analysis-item w' + (x.重さ || 0) + ((x.重さ || 0) >= 2 ? ' top' : '');

        const b = document.createElement('b');
        b.textContent = ((x.重さ || 0) >= 2 ? '● ' : (x.重さ === 1 ? '・ ' : '✓ ')) + x.件;
        行.appendChild(b);

        if (x.数) {
            const s = document.createElement('small');
            s.className = 'analysis-num';
            s.textContent = x.数;
            行.appendChild(s);
        }
        if (x.意味) {
            const p = document.createElement('p');
            p.textContent = x.意味;
            行.appendChild(p);
        }
        if (x.次に) {
            const p = document.createElement('p');
            p.className = 'analysis-next';
            p.textContent = '→ ' + x.次に;
            行.appendChild(p);
        }
        箱.appendChild(行);
    });

    /* --- 推移のグラフ --- */
    if (d.推移.length >= 2) {
        const 見出し = document.createElement('h5');
        見出し.className = 'rule-head';
        見出し.textContent = '見られた数の推移';
        箱.appendChild(見出し);

        const 枠 = document.createElement('div');
        枠.className = 'chart-box';
        枠.innerHTML = 折れ線を描く(
            d.推移.map((x) => ({ ラベル: x.日, 値: x.表示 })), { 題: '見られた数' });
        箱.appendChild(枠);

        const 見出し2 = document.createElement('h5');
        見出し2.className = 'rule-head';
        見出し2.textContent = '反応の推移';
        箱.appendChild(見出し2);

        const 枠2 = document.createElement('div');
        枠2.className = 'chart-box';
        枠2.innerHTML = 折れ線を描く(
            d.推移.map((x) => ({ ラベル: x.日, 値: x.反応 })), { 題: '反応' });
        箱.appendChild(枠2);
    }

    /* --- 時間帯 --- */
    if (d.時間帯 && d.時間帯.並び.length >= 2) {
        グラフを足す(箱, 'どの時間に出すと効くか', d.時間帯.並び.map((x, i) => ({
            名: x.名,
            値: x.反応率,
            表示: (x.反応率 * 100).toFixed(1) + '%',
            目立たせる: i === 0,
        })));
    }

    /* --- 曜日 --- */
    if (d.曜日 && d.曜日.並び.length >= 3) {
        const 一番 = Math.max(...d.曜日.並び.map((x) => x.反応率));
        グラフを足す(箱, 'どの曜日が効くか', d.曜日.並び.map((x) => ({
            名: x.名 + '曜',
            値: x.反応率,
            表示: (x.反応率 * 100).toFixed(1) + '%',
            目立たせる: x.反応率 === 一番,
        })));
    }

    /* --- 型 --- */
    if (d.型 && d.型.並び.length >= 2) {
        グラフを足す(箱, 'どの型が効くか', d.型.並び.map((x, i) => ({
            名: x.名,
            値: x.反応率,
            表示: (x.反応率 * 100).toFixed(1) + '%',
            目立たせる: i === 0,
        })));
    }

    /* --- 効いた投稿・効かなかった投稿 --- */
    if (d.良し悪し) {
        const 見出し = document.createElement('h5');
        見出し.className = 'rule-head';
        見出し.textContent = '効いた投稿と、効かなかった投稿';
        箱.appendChild(見出し);

        const 出す = (題, 一覧, 良い) => {
            一覧.forEach((x) => {
                const 行 = document.createElement('div');
                行.className = 'post-item' + (良い ? ' good' : ' bad');
                const b = document.createElement('b');
                b.textContent = (良い ? '◎ ' : '△ ')
                    + `反応率 ${(SNS反応率(x) * 100).toFixed(1)}%`;
                行.appendChild(b);
                const s = document.createElement('small');
                s.textContent = `${x.日} ${x.時}時 / ${x.型} / ${x.場所}`;
                行.appendChild(s);
                if (x.本文) {
                    const p = document.createElement('p');
                    p.textContent = x.本文.slice(0, 70) + (x.本文.length > 70 ? '…' : '');
                    行.appendChild(p);
                }
                箱.appendChild(行);
            });
        };
        出す('効いた', d.良し悪し.良, true);
        出す('効かなかった', d.良し悪し.悪, false);
    }

    箱.appendChild(正直な断り());
}

function グラフを足す(箱, 題, 棒たち) {
    const 見出し = document.createElement('h5');
    見出し.className = 'rule-head';
    見出し.textContent = 題;
    箱.appendChild(見出し);

    const 枠 = document.createElement('div');
    枠.className = 'chart-box';
    枠.innerHTML = 棒を描く(棒たち, { 題 });
    箱.appendChild(枠);
}

function 現在の場所() {
    const 選 = document.getElementById('sns-metrics-filter');
    return 選 ? 選.value : 'すべて';
}

/** 数字を入れる欄 */
function 成績を入れる欄(まだ無い) {
    const 枠 = document.createElement('details');
    枠.className = 'voice-fold';

    // まだ一件も無いときは、開いておく。
    //
    // 畳んだままにしていたら、「グラフを作るところがない」と言われた。
    // そのとおりで、入れる場所が見えなければ、無いのと同じ。
    // 何もないときこそ、入口を開けておく。
    枠.open = !!まだ無い;

    const 頭 = document.createElement('summary');
    頭.textContent = まだ無い
        ? '▼ ここから成績を入れます（まだ0件です）'
        : '＋ 投稿の成績を入れる';
    枠.appendChild(頭);

    const 中 = document.createElement('div');
    中.className = 'voice-block';

    const 説 = document.createElement('p');
    説.className = 'hint';
    説.textContent = '投稿1件につき、数字は3つだけです。'
        + '各SNSの画面で見えている数を、そのまま入れてください。';
    中.appendChild(説);

    const 作る = (種, 名, 値, 型) => {
        const 行 = document.createElement('div');
        行.className = 'guard-row';
        const l = document.createElement('label');
        l.textContent = 名;
        行.appendChild(l);
        const i = document.createElement(種);
        i.id = 'm-' + 型;
        if (種 === 'input') { i.type = 型 === '日' ? 'date' : (型 === '本文' ? 'text' : 'number'); i.value = 値; }
        行.appendChild(i);
        中.appendChild(行);
        return i;
    };

    const 場所 = document.createElement('select');
    場所.id = 'm-場所';
    ['Instagram', 'TikTok', 'X', 'Threads', 'YouTube'].forEach((p) => {
        const o = document.createElement('option'); o.value = p; o.textContent = p; 場所.appendChild(o);
    });
    const 行0 = document.createElement('div');
    行0.className = 'guard-row';
    const l0 = document.createElement('label'); l0.textContent = 'どこに';
    行0.appendChild(l0); 行0.appendChild(場所);
    中.appendChild(行0);

    const 日 = 作る('input', 'いつ', (typeof 日付文字 === 'function'
        ? 日付文字(new Date()) : new Date().toISOString().slice(0, 10)), '日');
    const 時 = 作る('input', '何時に', String(new Date().getHours()), '時');

    const 型 = document.createElement('select');
    型.id = 'm-型';
    ['写真', '動画', '複数枚', '文章のみ', 'ストーリー'].forEach((p) => {
        const o = document.createElement('option'); o.value = p; o.textContent = p; 型.appendChild(o);
    });
    const 行1 = document.createElement('div');
    行1.className = 'guard-row';
    const l1 = document.createElement('label'); l1.textContent = 'どんな型';
    行1.appendChild(l1); 行1.appendChild(型);
    中.appendChild(行1);

    const 本文 = 作る('input', '本文（一部でよい）', '', '本文');

    const 数入力 = {};
    数字の種類.forEach((n) => {
        const 行 = document.createElement('div');
        行.className = 'guard-row';
        const l = document.createElement('label');
        l.textContent = n.題;
        l.title = n.説;
        行.appendChild(l);
        const i = document.createElement('input');
        i.type = 'number';
        i.min = '0';
        i.placeholder = n.説;
        行.appendChild(i);
        中.appendChild(行);
        数入力[n.鍵] = i;
    });

    /* --- 下書きから持ってくる --- */
    //
    // 投稿キューにある下書きは、
    // どこに・いつ・何を出したかを既に持っている。
    // それを打ち直させるのは、こちらの手抜き。
    let 下書き = [];
    try {
        下書き = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
    } catch { 下書き = []; }

    if (下書き.length) {
        const 行 = document.createElement('div');
        行.className = 'guard-row';
        const l = document.createElement('label');
        l.textContent = '下書きから';
        行.appendChild(l);

        const 選 = document.createElement('select');
        選.innerHTML = '<option value="">選ぶと、上の欄が埋まります…</option>';
        下書き.forEach((x, i) => {
            const 文 = x.caption || x.text || x.本文 || '';
            if (!文) return;
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = `[${x.platform || 'Instagram'}] ${文.slice(0, 28)}`;
            選.appendChild(o);
        });
        選.addEventListener('change', () => {
            const x = 下書き[Number(選.value)];
            if (!x) return;
            場所.value = x.platform || x.場所 || 'Instagram';
            if (x.date || x.日) 日.value = (x.date || x.日).slice(0, 10);
            本文.value = x.caption || x.text || x.本文 || '';
            showNotification('埋めました。数字だけ入れてください。', 'success');
        });
        行.appendChild(選);
        中.appendChild(行);
    }

    const 行2 = document.createElement('div');
    行2.className = 'guard-row';
    const 残す = document.createElement('button');
    残す.type = 'button';
    残す.className = 'btn btn-primary';
    残す.textContent = 'この成績を残す';
    残す.addEventListener('click', () => {
        if (!数入力.表示.value) {
            showNotification('「見られた数」だけは入れてください（それが基準になります）', 'error');
            return;
        }
        成績を残す({
            場所: 場所.value,
            日: 日.value,
            時: 時.value,
            型: 型.value,
            本文: 本文.value,
            表示: 数入力.表示.value,
            反応: 数入力.反応.value,
            流入: 数入力.流入.value,
        });
        数字の種類.forEach((n) => { 数入力[n.鍵].value = ''; });
        本文.value = '';
        showNotification('残しました。たまるほど、何が効くか分かります。', 'success');
        renderSNS分析();
    });
    行2.appendChild(残す);
    中.appendChild(行2);

    枠.appendChild(中);
    return 枠;
}

function 正直な断り() {
    const p = document.createElement('p');
    p.className = 'notice-strict';
    p.innerHTML = '<b>数字は自分で入れる必要があります。</b>'
        + '各SNSから自動で取ってくるには公式APIにつなぐ必要があり、'
        + 'それは「外へ送らない」という決まりに反するためです。<br>'
        + '入れるのは投稿1件につき3つの数字だけです。'
        + 'その手間で、<b>どの時間・どの型・どの曜日が効くか</b>が分かるようになります。<br>'
        + '<b>よそのトレンドは分かりません。</b>'
        + 'ただ、同じ服を同じ人たちに売っているのですから、'
        + '<b>自分の投稿がどう効いたか</b>のほうが、あなたには効きます。';
    return p;
}

function initSNS分析() {
    if (document.getElementById('sns-analytics')) renderSNS分析();
}

window.initSNS分析 = initSNS分析;
window.renderSNS分析 = renderSNS分析;
