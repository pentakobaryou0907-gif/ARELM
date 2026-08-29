/**
 * 「いつ動くか」を決める画面
 *
 * ここで決めておけば、あとは言わなくても動く。
 *
 * 画面で気をつけていること:
 *   ・何が起きたかを必ず残し、いつでも見られるようにする。
 *     知らないうちに何かが動いているのが、いちばん怖い。
 *   ・止めたいときに、すぐ止められるようにする。
 *   ・「次にいつ動くか」を書く。分からないまま待たせない。
 */

let 組み立て中の決まり = { きっかけ: '', 中身: '', 作業: '', 作業の種類: '段取り' };

async function 選べる作業を集める() {
    const 出 = { 段取り: [], 覚えた作業: [] };
    try {
        const r = await fetch('/api/ai-local/plans', { cache: 'no-store' });
        if (r.ok) 出.段取り = (await r.json()).plans || [];
    } catch { /* 続ける */ }
    try {
        const r = await fetch('/api/ai-local/learned-tasks', { cache: 'no-store' });
        if (r.ok) 出.覚えた作業 = (await r.json()).覚えた作業 || [];
    } catch { /* 続ける */ }
    return 出;
}

function 次はいつ(決まり) {
    const 今日 = (typeof 日付文字 === 'function')
        ? 日付文字(new Date()) : new Date().toISOString().slice(0, 10);

    if (決まり.最後に動いた日 === 今日) return '今日はもう動きました。次は明日以降です。';

    switch (決まり.きっかけ) {
        case 'daily': return `今日の ${決まり.中身} を過ぎたら動きます。`;
        case 'weekly': return `次の${決まり.中身}曜日の朝に動きます。`;
        case 'low-stock': return `残り${決まり.中身}以下の商品が出たら動きます。`;
        case 'overdue': return '期限を過ぎたやることが出たら動きます。';
        case 'under-cost': return '原価を割った商品が出たら動きます。';
        default: return '';
    }
}

async function render自動の決まり() {
    const 箱 = document.getElementById('auto-rules');
    if (!箱) return;

    const 決まりたち = 自動の決まりを読む();
    const 作業たち = await 選べる作業を集める();
    箱.innerHTML = '';

    /* --- いま決めてあるもの --- */
    if (決まりたち.length) {
        const 見出し = document.createElement('p');
        見出し.className = 'guard-on';
        見出し.textContent = `${決まりたち.filter((x) => x.使う !== false).length}件が自動で動きます`;
        箱.appendChild(見出し);

        決まりたち.forEach((x) => {
            const 札 = document.createElement('div');
            札.className = 'auto-rule' + (x.使う === false ? ' off' : '');

            const 上 = document.createElement('div');
            上.className = 'auto-rule-head';

            const 名 = document.createElement('b');
            名.textContent = x.名前;
            上.appendChild(名);

            const 切 = document.createElement('label');
            切.className = 'auto-switch';
            const 印 = document.createElement('input');
            印.type = 'checkbox';
            印.checked = x.使う !== false;
            印.addEventListener('change', () => {
                const 一覧 = 自動の決まりを読む();
                const i = 一覧.findIndex((y) => y.id === x.id);
                if (i >= 0) 一覧[i].使う = 印.checked;
                自動の決まりを書く(一覧);
                showNotification(印.checked ? '動くようにしました' : '止めました', 'success');
                render自動の決まり();
            });
            切.appendChild(印);
            const 切文 = document.createElement('span');
            切文.textContent = x.使う === false ? '止めています' : '動きます';
            切.appendChild(切文);
            上.appendChild(切);

            札.appendChild(上);

            const 次 = document.createElement('p');
            次.className = 'auto-when';
            次.textContent = 次はいつ(x);
            札.appendChild(次);

            if (x.最後に動いた日) {
                const 最後 = document.createElement('small');
                最後.textContent = `最後に動いたのは ${x.最後に動いた日}`
                    + (x.最後の訳 ? `（${x.最後の訳}）` : '');
                札.appendChild(最後);
            }

            const 消 = document.createElement('button');
            消.type = 'button';
            消.className = 'btn-link';
            消.textContent = 'この決まりを消す';
            消.addEventListener('click', () => {
                if (!confirm(`「${x.名前}」の決まりを消しますか。`)) return;
                自動の決まりを書く(自動の決まりを読む().filter((y) => y.id !== x.id));
                showNotification('消しました', 'success');
                render自動の決まり();
            });
            札.appendChild(消);

            箱.appendChild(札);
        });
    } else {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'まだ何も決まっていません。下から決めれば、言わなくても動くようになります。';
        箱.appendChild(p);
    }

    /* --- 新しく決める --- */
    const 見出し2 = document.createElement('h5');
    見出し2.className = 'rule-head';
    見出し2.textContent = '新しく決める';
    箱.appendChild(見出し2);

    // ① いつ
    const 行1 = document.createElement('div');
    行1.className = 'guard-row';
    const ラベル1 = document.createElement('label');
    ラベル1.textContent = 'いつ';
    行1.appendChild(ラベル1);

    const いつ選択 = document.createElement('select');
    いつ選択.innerHTML = '<option value="">選ぶ…</option>';
    きっかけたち.forEach((k) => {
        const o = document.createElement('option');
        o.value = k.値;
        o.textContent = k.題;
        o.title = k.説;
        いつ選択.appendChild(o);
    });
    行1.appendChild(いつ選択);

    const 中身入力 = document.createElement('input');
    中身入力.type = 'text';
    中身入力.hidden = true;
    行1.appendChild(中身入力);
    箱.appendChild(行1);

    const いつ説明 = document.createElement('p');
    いつ説明.className = 'hint';
    箱.appendChild(いつ説明);

    いつ選択.addEventListener('change', () => {
        const k = きっかけたち.find((x) => x.値 === いつ選択.value);
        いつ説明.textContent = k ? k.説 : '';
        if (!k || k.中身 === 'なし') {
            中身入力.hidden = true;
            中身入力.value = '';
            return;
        }
        中身入力.hidden = false;
        if (k.中身 === '時刻') { 中身入力.type = 'time'; 中身入力.value = '08:00'; }
        else if (k.中身 === '曜日') { 中身入力.type = 'text'; 中身入力.value = '月'; 中身入力.placeholder = '月・火…'; }
        else { 中身入力.type = 'number'; 中身入力.value = '3'; 中身入力.placeholder = '残りの数'; }
    });

    // ② 何を
    const 行2 = document.createElement('div');
    行2.className = 'guard-row';
    const ラベル2 = document.createElement('label');
    ラベル2.textContent = '何を';
    行2.appendChild(ラベル2);

    const 何選択 = document.createElement('select');
    何選択.innerHTML = '<option value="">選ぶ…</option>';
    作業たち.段取り.forEach((p) => {
        const o = document.createElement('option');
        o.value = '段取り:' + p.name;
        o.textContent = p.label;
        何選択.appendChild(o);
    });
    作業たち.覚えた作業.forEach((p) => {
        const o = document.createElement('option');
        o.value = '覚えた作業:' + p.名前;
        o.textContent = `${p.名前}（教わったもの）`;
        何選択.appendChild(o);
    });
    行2.appendChild(何選択);
    箱.appendChild(行2);

    // ③ 決める
    const 行3 = document.createElement('div');
    行3.className = 'guard-row';
    const 決める = document.createElement('button');
    決める.type = 'button';
    決める.className = 'btn btn-primary';
    決める.textContent = 'この決まりを作る';
    決める.addEventListener('click', () => {
        if (!いつ選択.value || !何選択.value) {
            showNotification('「いつ」と「何を」を選んでください', 'error');
            return;
        }
        const [種類, 作業] = 何選択.value.split(':');
        const k = きっかけたち.find((x) => x.値 === いつ選択.value);
        const 作業名 = 何選択.options[何選択.selectedIndex].textContent.replace('（教わったもの）', '');

        const 一覧 = 自動の決まりを読む();
        一覧.push({
            id: 'r_' + Date.now(),
            名前: `${k.題}「${作業名}」`,
            きっかけ: いつ選択.value,
            中身: 中身入力.hidden ? '' : 中身入力.value,
            作業の種類: 種類,
            作業,
            使う: true,
            作った日: (typeof 日付文字 === 'function')
                ? 日付文字(new Date()) : new Date().toISOString().slice(0, 10),
        });
        自動の決まりを書く(一覧);
        showNotification('決めました。これから自動で動きます。', 'success');
        render自動の決まり();
    });
    行3.appendChild(決める);

    const 試す = document.createElement('button');
    試す.type = 'button';
    試す.className = 'btn btn-sm btn-secondary';
    試す.textContent = 'いま動くか試す';
    試す.addEventListener('click', async () => {
        試す.disabled = true;
        試す.textContent = '見ています…';
        const r = await 自動で動かす();
        showNotification(r.動いた
            ? `${r.動いた}件 動きました`
            : 'いま動くものはありませんでした（きっかけが来ていません）', 'info');
        試す.disabled = false;
        試す.textContent = 'いま動くか試す';
        render自動の決まり();
    });
    行3.appendChild(試す);
    箱.appendChild(行3);

    /* --- 動いた記録 --- */
    const 記録 = 自動の記録を読む();
    const 見出し3 = document.createElement('h5');
    見出し3.className = 'rule-head';
    見出し3.textContent = '自動で動いた記録';
    箱.appendChild(見出し3);

    if (!記録.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'まだありません。動いたときは、ここに必ず残ります。';
        箱.appendChild(p);
    } else {
        const 並び = document.createElement('ul');
        並び.className = 'growth-log';
        記録.slice(-10).reverse().forEach((x) => {
            const li = document.createElement('li');
            const t = new Date(x.とき);
            li.textContent = `${t.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                + `　${x.名前}：${x.様子}${x.訳 ? `（${x.訳}）` : ''}`;
            並び.appendChild(li);
        });
        箱.appendChild(並び);
    }

    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>取り消しにくい手順は、自動でも確認します。</b>'
        + '自動だからといって、確認を飛ばすことはしません。<br>'
        + '<b>外へ出るもの、お金がかかるものは動かしません。</b>'
        + 'そもそも選べないようにしてあります。<br>'
        + '<b>動いたことは必ず上に残ります。</b>'
        + '知らないうちに何かが起きている、という状態を作りません。<br>'
        + '<b>同じ日に二度は動きません。</b>やることが重複して増えないようにするためです。';
    箱.appendChild(断り);
}

function init自動の決まり() {
    if (!document.getElementById('auto-rules')) return;
    render自動の決まり();
    if (typeof 自動を見張り始める === 'function') 自動を見張り始める();
}

window.init自動の決まり = init自動の決まり;
window.render自動の決まり = render自動の決まり;
