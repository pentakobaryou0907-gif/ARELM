/**
 * 声が使えるかを、先に調べて伝える
 *
 * なぜこれが要るのか:
 *   「反応しない」と言われて調べたら、マイクが拒否されていた。
 *   コードは正しく動いていて、許可が無いだけだった。
 *
 *   ところが画面は何も言わなかった。
 *   押しても黙っているだけなので、
 *   壊れているのか、許可が無いのか、
 *   そもそも覚えていないのか——区別がつかない。
 *
 *   黙って動かないのが、いちばん困る。
 *   だから、押す前に状態を出す。
 *   駄目なところがあれば、直し方まで書く。
 *
 * 見るもの:
 *   ・この接続でマイクが使えるか
 *   ・マイクが許可されているか
 *   ・呼び名を覚えているか
 *   ・用件の言葉を覚えているか
 *   ・常駐の待ち受けが動いているか
 */

/**
 * 覚えた声を、二か所から読んで合わせる。
 *
 * 同じ言葉が両方にあれば、多いほうの回数を採る。
 * 足し合わせると、実際より多く覚えているように見えてしまう。
 */
async function 覚えた声を両方から読む() {
    const 合計 = new Map();

    // ブラウザの保存領域（押して話すで覚えたもの）
    if (typeof AReGLM_VOICE_LEARN !== 'undefined') {
        AReGLM_VOICE_LEARN.覚えた言葉たち().forEach((x) => {
            合計.set(x.言葉, x.回数);
        });
    }

    // ファイル（常駐のプログラムで覚えたもの）
    try {
        const r = await fetch('/api/voice-teach', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            (d.言葉たち || []).forEach((x) => {
                合計.set(x.言葉, Math.max(合計.get(x.言葉) || 0, x.回数));
            });
        }
    } catch {
        // 読めなくても、ブラウザ側の分は返す
    }

    return [...合計.entries()]
        .map(([言葉, 回数]) => ({ 言葉, 回数 }))
        .sort((a, b) => b.回数 - a.回数);
}

async function 声の状態を調べる() {
    const 出 = [];
    const 呼び名 = localStorage.getItem('areglm_wake_name') || 'アレラム';

    /* --- 1. 接続 --- */
    if (!window.isSecureContext) {
        出.push({
            重さ: 3,
            件: 'この開き方ではマイクを使えません',
            訳: `いまの入口は ${location.origin} です。`
                + 'ブラウザは、安全な接続でしかマイクを許しません。',
            手: (typeof マイクの開き方 === 'function'
                ? マイクの開き方()
                : 'このMacでは http://127.0.0.1:8090、他の端末では設定の「どこでも」の https から開き直してください。'),
        });
        return { 項目: 出, 使えるか: false };
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        出.push({
            重さ: 3,
            件: 'このブラウザではマイクを扱えません',
            訳: '',
            手: 'Chrome か Safari で開いてください。',
        });
        return { 項目: 出, 使えるか: false };
    }

    /* --- 2. マイクの許可 --- */
    //
    // 「開いていなくても」を選んでいるなら、
    // ブラウザのマイクは一度も使わない。
    // 使わないものの許可を確かめて騒ぐのは、意味がないどころか害になる。
    const 使い方 = (typeof 使い方を読む === 'function') ? 使い方を読む() : '';
    if (使い方 === 'wake-always') {
        出.push({
            重さ: 0,
            件: 'ブラウザのマイクは使いません',
            訳: '録るときだけ、常駐のプログラムが短く使います。',
            手: '',
        });
        return await 覚えているかを見る(出, 呼び名);
    }

    let 許可 = '不明';
    try {
        許可 = (await navigator.permissions.query({ name: 'microphone' })).state;
    } catch {
        許可 = '不明';
    }

    if (許可 === 'denied') {
        // ブラウザのマイクが断られている。
        //
        // ここで「設定から許可してください」と言うのは、
        // こちら側の都合を押しつけているだけ。
        // ブラウザのマイクが要らない道があるのだから、そちらへ回す。
        //
        // 常駐の待ち受けは、macOS に一度だけ許可を聞くだけで済み、
        // ブラウザの設定を触る必要がない。
        出.push({
            重さ: 3,
            件: 'ブラウザのマイクは使えません',
            訳: 'ブラウザ側で断られています。'
                + 'ただ、ブラウザのマイクを使わない方法があるので、そちらに切り替えます。',
            手: 'ブラウザの設定を触る必要はありません。',
            こちらで直す: 'ブラウザを使わない方式へ',
        });
    } else if (許可 === 'prompt' || 許可 === '不明') {
        出.push({
            重さ: 1,
            件: 'マイクの許可は、まだ聞かれていません',
            訳: '初めて「押して話す」を押したときに、ブラウザが聞いてきます。',
            手: 'そこで「許可」を選んでください。',
        });
    } else {
        出.push({
            重さ: 0,
            件: 'マイクは許可されています',
            訳: '',
            手: '',
        });
    }

    return await 覚えているかを見る(出, 呼び名);
}

/**
 * 覚えているか、待ち受けているかを見る。
 *
 * マイクの経路が二通りあるので、
 * どちらから来ても同じ確認ができるよう、切り出してある。
 */
async function 覚えているかを見る(出, 呼び名) {
    /* --- 3. 覚えているか --- */
    //
    // 覚えた声は、二か所にありうる。
    //   ・ブラウザの保存領域 … 「押して話す」で覚えたもの
    //   ・ファイル           … 常駐のプログラムで覚えたもの
    //
    // ここはブラウザ側しか見ていなかった。
    // そのため、録って「覚えました」と言われた直後に、
    // 画面では「覚えていません」と出ていた。
    // 録った先と、確かめる先が違っていた。
    //
    // 両方を見て、合わせて数える。
    const 覚えた = await 覚えた声を両方から読む();
    const 呼び名の回数 = (覚えた.find((x) => x.言葉 === 呼び名) || {}).回数 || 0;
    const 用件 = 覚えた.filter((x) => x.言葉 !== 呼び名);

    if (!呼び名の回数) {
        出.push({
            重さ: 3,
            件: `「${呼び名}」の声を覚えていません`,
            訳: '覚えていない声には反応できません。'
                + 'この仕組みは、あなたの声と突き合わせて聞き分けています。',
            手: `下の「言葉を教える」に「${呼び名}」と入れて、`
                + '「この言葉を録る」を2回押してください。',
        });
    } else if (呼び名の回数 < 2) {
        出.push({
            重さ: 2,
            件: `「${呼び名}」は1回だけ覚えています`,
            訳: '1回だけだと、そのときの言い方に縛られます。'
                + '早口のとき、疲れているときに通らないことがあります。',
            手: 'もう一度録ると、確かになります。',
        });
    } else {
        出.push({
            重さ: 0,
            件: `「${呼び名}」を ${呼び名の回数}通りの言い方で覚えています`,
            訳: '',
            手: '',
        });
    }

    if (!用件.length) {
        出.push({
            重さ: 2,
            件: '用件の言葉を、まだ覚えていません',
            訳: `「${呼び名}」と呼んでも、そのあと何を頼まれたか分かりません。`,
            手: '「在庫を見せて」「点検して」など、よく使う言葉を録ってください。',
        });
    } else {
        出.push({
            重さ: 0,
            件: `声で頼めること: ${用件.map((x) => x.言葉).join('、')}`,
            訳: '',
            手: '',
        });
    }

    /* --- 4. 常駐 --- */
    try {
        const r = await fetch('/api/voice-listener', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            if (d.動いているか) {
                出.push({
                    重さ: 0,
                    件: '画面を開かなくても待ち受けています',
                    訳: `渡してある声 ${d.渡した声の数}件`,
                    手: '',
                });
            } else if (呼び名の回数 >= 1) {
                出.push({
                    重さ: 1,
                    件: '画面を閉じると反応しません',
                    訳: '常駐の待ち受けが動いていません。',
                    手: '上の「画面を開かずに話せるようにする」で入れられます。',
                });
            }
        }
    } catch {
        // 常駐の状態が読めなくても、ここでは騒がない
    }

    出.sort((a, b) => b.重さ - a.重さ);
    return { 項目: 出, 使えるか: !出.some((x) => x.重さ >= 3) };
}

async function render声の診断() {
    const 箱 = document.getElementById('voice-check');
    if (!箱) return;

    箱.innerHTML = '<p class="hint">調べています…</p>';
    const 結果 = await 声の状態を調べる();
    箱.innerHTML = '';

    /* ------------------------------------------------------------
       いちばん大事なのは「次に何をすればよいか」を一つだけ示すこと。

       これまでは、駄目なところを全部並べていた。
       赤い行が三つ並んでいると、どれから手を付けるのか分からず、
       押しても文字が変わらないので、動いているのかも分からなかった。

       直すべきものを一つに絞って、大きく出す。
       それが済めば、次の一つが出る。
       ------------------------------------------------------------ */
    const 直すもの = 結果.項目.filter((x) => x.重さ >= 2);
    const 済んだもの = 結果.項目.filter((x) => x.重さ === 0);

    if (直すもの.length) {
        const 次 = 直すもの[0];

        const 札 = document.createElement('div');
        札.className = 'voice-next';

        const 印 = document.createElement('div');
        印.className = 'voice-next-tag';
        印.textContent = '次にすること';
        札.appendChild(印);

        const 件 = document.createElement('b');
        件.textContent = 次.件;
        札.appendChild(件);

        if (次.訳) {
            const 訳 = document.createElement('p');
            訳.textContent = 次.訳;
            札.appendChild(訳);
        }
        if (次.手) {
            const 手 = document.createElement('p');
            手.className = 'voice-next-how';
            手.textContent = 次.手;
            札.appendChild(手);
        }

        // その場で押せる手当てを添える。
        // 「〜してください」で終わらせると、結局こちらが探すことになる。
        // こちらで直せるものは、こちらで直す。
        // 使う人にブラウザの設定を触らせない。
        if (次.こちらで直す === 'ブラウザを使わない方式へ') {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-primary';
            b.textContent = '✨ ブラウザを使わない方式に切り替える';
            b.addEventListener('click', async () => {
                b.disabled = true;
                b.textContent = '切り替えています…';
                if (typeof 使い方を決める === 'function') {
                    await 使い方を決める('wake-always');
                }
                showNotification(
                    'ブラウザのマイクを使わない方式にしました。'
                    + '録るときだけ、macOS が一度許可を聞いてきます。', 'success');
                render声の診断();
            });
            札.appendChild(b);
        }

        if (次.件.includes('マイクが許可されて')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-primary';
            b.textContent = '🎤 いま許可を求める';
            b.addEventListener('click', async () => {
                b.disabled = true;
                b.textContent = '聞いています…';
                try {
                    const st = await navigator.mediaDevices.getUserMedia({ audio: true });
                    st.getTracks().forEach((t) => t.stop());
                    showNotification('マイクが使えるようになりました', 'success');
                } catch (e) {
                    showNotification(
                        e.name === 'NotAllowedError'
                            ? 'まだ許可されていません。アドレス欄の左のしるしから許可してください。'
                            : 'マイクを使えませんでした: ' + e.message, 'error');
                }
                render声の診断();
            });
            札.appendChild(b);
        }

        if (次.件.includes('の声を覚えていません') || 次.件.includes('1回だけ')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-primary';
            const 名 = localStorage.getItem('areglm_wake_name') || 'アレラム';
            b.textContent = `🎤 いま「${名}」と言って録る`;
            b.addEventListener('click', async () => {
                if (typeof 声を録る === 'function') {
                    await 声を録る(名, b);
                    render声の診断();
                }
            });
            札.appendChild(b);
        }

        if (次.件.includes('用件の言葉')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-primary';
            b.textContent = '🎤 「在庫を見せて」を録る';
            b.addEventListener('click', async () => {
                if (typeof 声を録る === 'function') {
                    await 声を録る('在庫を見せて', b);
                    render声の診断();
                }
            });
            札.appendChild(b);
        }

        箱.appendChild(札);

        // 残りは「あと何件」とだけ伝える。並べない。
        if (直すもの.length > 1) {
            const 残 = document.createElement('p');
            残.className = 'hint';
            残.textContent = `これが済むと、あと ${直すもの.length - 1}件 です。`;
            箱.appendChild(残);
        }
    } else {
        const 札 = document.createElement('div');
        札.className = 'voice-next done';
        const b = document.createElement('b');
        b.textContent = '声で使える状態です';
        札.appendChild(b);
        const p = document.createElement('p');
        p.textContent = '呼びかけてみてください。';
        札.appendChild(p);
        箱.appendChild(札);
    }

    /* --- 済んだものは、畳んでおく --- */
    if (済んだもの.length) {
        const 畳 = document.createElement('details');
        畳.className = 'voice-done-fold';
        const 見 = document.createElement('summary');
        見.textContent = `済んでいること ${済んだもの.length}件`;
        畳.appendChild(見);
        済んだもの.forEach((x) => {
            const p = document.createElement('p');
            p.className = 'hint';
            p.textContent = '✓ ' + x.件;
            畳.appendChild(p);
        });
        箱.appendChild(畳);
    }

    const 再 = document.createElement('button');
    再.type = 'button';
    再.className = 'btn btn-sm btn-secondary';
    再.textContent = '↻ もう一度調べる';
    再.addEventListener('click', render声の診断);
    箱.appendChild(再);
}

function init声の診断() {
    if (document.getElementById('voice-check')) render声の診断();
}

window.init声の診断 = init声の診断;
window.render声の診断 = render声の診断;
window.声の状態を調べる = 声の状態を調べる;
