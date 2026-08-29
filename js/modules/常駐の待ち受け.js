/**
 * アプリを開いていなくても、呼びかけに応じる
 *
 * なぜこれが要るのか:
 *   これまでの待ち受けは、画面が開いている間だけ動いた。
 *   閉じてしまえば、何を言っても反応しない。
 *   それでは「話しかけたら応じる」道具にならない。
 *
 * どうやっているのか:
 *   マイクの音を拾って呼び名を探す、小さなプログラムを常駐させる。
 *   聞き分けには、このツールが自作した仕組み（MFCC + DTW）を使う。
 *   呼ばれたと分かったら、アプリを開く。
 *
 * はっきりさせておくこと:
 *
 *   ・<b>音はこの端末の中だけを流れます。どこへも送りません。</b>
 *   ・<b>録音は残りません。</b>直近2秒だけを持ち、次の音で上書きされます。
 *   ・<b>聞き分けられるのは、教えた呼び名だけです。</b>
 *     会話の中身は聞き取りませんし、聞き取れません。
 *     Apple の文字起こしは、有料の開発者証明書がないと動かないためです。
 *   ・マイクは常に入ったままになります。それが嫌なら、使わない選択ができます。
 */

async function 待ち受けの状態を読む() {
    try {
        const r = await fetch('/api/voice-listener', { cache: 'no-store' });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

/** 覚えた声を、常駐のプログラムが読める場所へ渡す */
async function 覚えた声を渡す() {
    if (typeof AReGLM_VOICE_LEARN === 'undefined') {
        return { ok: false, 訳: '聞き取りの仕組みが読み込まれていません' };
    }
    const 一覧 = AReGLM_VOICE_LEARN.覚えた声を読む();
    if (!一覧.length) {
        return { ok: false, 訳: 'まだ何も覚えていません' };
    }
    try {
        const r = await fetch('/api/voice-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templates: 一覧 }),
        });
        return await r.json();
    } catch (e) {
        return { ok: false, 訳: e.message };
    }
}

async function render常駐の待ち受け() {
    const 箱 = document.getElementById('always-listen');
    if (!箱) return;

    const d = await 待ち受けの状態を読む();

    // 画面側の待ち受けと取り合わないよう、状態を知らせておく。
    // 両方が掴むと、一度の呼びかけに二度返事をする。
    window.__常駐が待ち受け中 = !!(d && d.動いているか);
    if (window.__常駐が待ち受け中 && typeof stopWakeListening === 'function') {
        stopWakeListening();
    }

    箱.innerHTML = '';

    if (!d) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '状態を読めませんでした。';
        箱.appendChild(p);
        return;
    }

    const 呼び名 = localStorage.getItem('areglm_wake_name') || 'アレラム';
    // 覚えた声は、ブラウザの保存領域とファイルの二か所にありうる。
    // ブラウザ側しか見ていないと、常駐で録ったものが見えず、
    // 「覚えました」と言われた直後に「覚えていません」と出る。
    const 覚えた一覧 = (typeof 覚えた声を両方から読む === 'function')
        ? await 覚えた声を両方から読む()
        : ((typeof AReGLM_VOICE_LEARN !== 'undefined')
            ? AReGLM_VOICE_LEARN.覚えた言葉たち() : []);
    const 覚えている = 覚えた一覧.some((x) => x.言葉 === 呼び名);

    /* --- いまの状態 --- */
    const 状態 = document.createElement('p');
    状態.className = d.動いているか ? 'guard-on' : 'guard-off';
    状態.textContent = d.動いているか
        ? `待ち受けています。画面を開かなくても「${呼び名}」と呼べば応じます。`
        : '待ち受けていません（アプリを開いている間だけ反応します）';
    箱.appendChild(状態);

    /* --- 正直に伝える --- */
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML =
        '<b>使い方</b>: 「' + 呼び名 + '」と呼ぶと「はい」と答えます。'
        + 'そのまま用件を言うと、声で返します。<b>画面は開きません。</b><br>'
        + 'アプリを開いていても、閉じていても、同じように応じます。<br><br>'

        + '<b>ふだんの会話について、実際に確かめたこと</b><br>'
        + '・<b>音は保存されません。</b>持っているのは直近2秒だけで、'
        + '次の音で上書きされます。書き出す処理は、覚えるとき以外にありません（コードを確認済み）。<br>'
        + '・<b>会話を文字にすることはできません。</b>'
        + 'この仕組みは、覚えた呼び名の音の形と「どれだけ似ているか」を測っているだけです。'
        + '言葉の意味は分かりませんし、分かる仕組みを持っていません。<br>'
        + '・<b>呼ばれるまで、外へは何も出ません。</b>'
        + '通信するのは、呼ばれた後にこのMacの中のAI（127.0.0.1）へ渡すときだけです。<br>'
        + '・待ち受けている間に比べているのは、<b>呼び名の型だけ</b>です。<br><br>'

        + '<b>それでも、マイクは聞き続けています。</b>'
        + '呼び名を聞き取るには、そうするしかありません（Siriも同じです）。'
        + '聞かれたくないときは、上の「止める」で<b>本当に止まります</b>。'
        + '動いたまま使わないふりはしません。<br><br>'

        + '<b>お金は一切かかりません。</b>すべて自作で、外部のサービスも有料の証明書も使っていません。';
    箱.appendChild(断り);

    /* --- いま聞かれたくないとき --- */
    //
    // 呼び名を聞き取るには、マイクは聞き続けるしかない。
    // だから「いまは聞かれたくない」ときの手段が要る。
    // 「聞いているが使っていません」では安心できないので、本当に止める。
    let 停止 = null;
    try {
        const pr = await fetch('/api/voice-pause', { cache: 'no-store' });
        if (pr.ok) 停止 = await pr.json();
    } catch { /* 読めなくても続ける */ }

    if (停止 && 停止.止めているか) {
        const 札 = document.createElement('p');
        札.className = 'guard-on';
        札.textContent = 停止.まで === '解除するまで'
            ? 'いまマイクを止めています。解除するまで、一切聞きません。'
            : `いまマイクを止めています（${new Date(停止.まで).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} まで）`;
        箱.appendChild(札);

        const 解除 = document.createElement('button');
        解除.type = 'button';
        解除.className = 'btn btn-sm btn-primary';
        解除.textContent = 'また聞くようにする';
        解除.addEventListener('click', async () => {
            const r = await fetch('/api/voice-pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 分: 0 }),
            });
            showNotification((await r.json()).訳, 'success');
            setTimeout(render常駐の待ち受け, 1200);
        });
        箱.appendChild(解除);
    } else if (d.動いているか) {
        const 見出し = document.createElement('p');
        見出し.className = 'hint';
        見出し.innerHTML = '<b>いま聞かれたくないとき</b>（人と大事な話をするとき、打ち合わせのとき）';
        箱.appendChild(見出し);

        const 止め列 = document.createElement('div');
        止め列.className = 'guard-row';
        [['30分', 30], ['1時間', 60], ['解除するまで', '解除するまで']].forEach(([文, 分]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-sm btn-secondary';
            b.textContent = 文 + ' 止める';
            b.addEventListener('click', async () => {
                const r = await fetch('/api/voice-pause', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 分 }),
                });
                showNotification((await r.json()).訳, 'success');
                setTimeout(render常駐の待ち受け, 1200);
            });
            止め列.appendChild(b);
        });
        箱.appendChild(止め列);
    }

    const 行 = document.createElement('div');
    行.className = 'guard-row';

    if (!覚えている) {
        const p = document.createElement('p');
        p.className = 'hint';
        // 呼び名をつなげて入れていた。ストッパーが見つけた。
        // 呼び名は本人が決めるので、何が入るか決まっていない。
        p.textContent = '先に「';
        const 名 = document.createElement('b');
        名.textContent = 呼び名;
        p.appendChild(名);
        p.appendChild(document.createTextNode(
            '」の声を覚えさせてください。'
            + '下の「言葉を教える」で2回ほど録ると、聞き分けられるようになります。'));
        p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(
            '続けて、よく使う用件（「在庫を見せて」「点検して」など）も覚えさせると、'
            + 'その言葉で応じられるようになります。'));
        箱.appendChild(p);
    } else if (!d.動いているか) {
        const 始める = document.createElement('button');
        始める.type = 'button';
        始める.className = 'btn btn-sm btn-primary';
        始める.textContent = '🎤 画面を開かずに話せるようにする';
        始める.addEventListener('click', async () => {
            始める.disabled = true;
            始める.textContent = '用意しています…';

            // まず覚えた声を渡す。渡さないと聞き分けられない。
            const 渡し = await 覚えた声を渡す();
            if (!渡し.ok) {
                showNotification(渡し.訳, 'error');
                render常駐の待ち受け();
                return;
            }

            const r = await fetch('/api/voice-listener', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 使う: true, 呼び名 }),
            });
            const 返 = await r.json();
            showNotification(返.訳, 返.ok ? 'success' : 'error');
            setTimeout(render常駐の待ち受け, 1500);
        });
        行.appendChild(始める);
    } else {
        const 止める = document.createElement('button');
        止める.type = 'button';
        止める.className = 'btn btn-sm btn-secondary';
        止める.textContent = '待ち受けを止める';
        止める.addEventListener('click', async () => {
            const r = await fetch('/api/voice-listener', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 使う: false }),
            });
            const 返 = await r.json();
            showNotification(返.訳, 'success');
            setTimeout(render常駐の待ち受け, 800);
        });
        行.appendChild(止める);

        const 更新 = document.createElement('button');
        更新.type = 'button';
        更新.className = 'btn btn-sm btn-secondary';
        更新.textContent = '覚えた声を渡し直す';
        更新.addEventListener('click', async () => {
            const 渡し = await 覚えた声を渡す();
            showNotification(渡し.ok ? `${渡し.件数}件を渡しました` : 渡し.訳,
                渡し.ok ? 'success' : 'error');
            render常駐の待ち受け();
        });
        行.appendChild(更新);
    }
    箱.appendChild(行);

    const 覚えた語 = 覚えた一覧.map((x) => x.言葉).filter((w) => w !== 呼び名);

    if (覚えた語.length) {
        const 用件 = document.createElement('p');
        用件.className = 'hint';
        用件.textContent = '声で頼めること: ' + 覚えた語.join('、');
        箱.appendChild(用件);
    }

    const 注 = document.createElement('p');
    注.className = 'hint';
    注.textContent = `渡してある声: ${d.渡した声の数}件`
        + (d.用意できているか ? '' : '　※待ち受けのプログラムが見つかりません');
    箱.appendChild(注);
}

function init常駐の待ち受け() {
    if (document.getElementById('always-listen')) render常駐の待ち受け();
}

window.init常駐の待ち受け = init常駐の待ち受け;
window.render常駐の待ち受け = render常駐の待ち受け;
window.覚えた声を渡す = 覚えた声を渡す;
