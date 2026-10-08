/**
 * 声の使い方を、一つの画面で選ぶ
 *
 * なぜこれが要るのか:
 *   声まわりの部品が増えるたび、画面に足していった。
 *   その結果、「押して話す」が二か所、「言葉を教える」も二か所に並び、
 *   どれを押せばよいのか分からない画面になっていた。
 *
 *   道具が増えたのではなく、使いにくくなっただけ。
 *
 *   やりたいことは一つ——「声で使いたい」。
 *   なら、選ぶのは「どう使うか」の一つだけでよい。
 *   選んだら、それに要るものだけを出す。
 *
 * 選べる四つ:
 *   使わない        … マイクを一切使わない
 *   押したときだけ  … 押した瞬間だけ聞く（前からある方式）
 *   名前で呼ぶ（開いている間）… 画面を開いている間だけ待ち受ける
 *   名前で呼ぶ（開いていなくても）… いつでも待ち受ける
 *
 * 前からある方式も、そのまま選べるようにしてある。
 * 新しいほうが良いとは限らないため。
 */

const 声の使い方の鍵 = 'areglm_voice_mode';

const 使い方たち = [
    {
        値: 'off',
        題: '声は使わない',
        説: 'マイクを一切使いません。文字で打つだけになります。',
        印: '🔇',
    },
    {
        値: 'push',
        題: '押したときだけ聞く',
        説: 'ボタンを押した瞬間だけマイクが入ります。'
            + '押していない間は完全に切れています。いちばん確実です。',
        印: '👆',
    },
    {
        値: 'wake-open',
        題: '名前で呼ぶ（画面を開いている間）',
        説: 'このツールを開いている間だけ待ち受けます。'
            + '閉じれば止まります。ブラウザにマイクの許可が要ります。',
        印: '🗣',
    },
    {
        値: 'wake-always',
        題: '名前で呼ぶ（開いていなくても）',
        説: 'デスクトップでも、別の作業中でも、呼べば応じます。'
            + 'ブラウザにマイクの許可は要りません。'
            + '聞かれたくないときは、その場で止められます。',
        印: '✨',
        すすめ: true,
    },
];

function 使い方を読む() {
    return localStorage.getItem(声の使い方の鍵) || '';
}

/**
 * 選ばれた使い方に合わせて、要るものだけを出す。
 *
 * 出しっぱなしにしないのが肝心。
 * 使わないものが並んでいると、それだけで迷う。
 */
async function 使い方を決める(値) {
    localStorage.setItem(声の使い方の鍵, 値);

    // それぞれの方式を、実際に入れたり切ったりする
    try {
        if (値 === 'wake-always') {
            // 常駐に任せる。画面側の待ち受けは下がる。
            if (typeof stopWakeListening === 'function') stopWakeListening();
        } else {
            // 常駐は止める（動いていれば）
            await fetch('/api/voice-listener', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 使う: false }),
            });
        }

        if (値 === 'wake-open') {
            localStorage.setItem('areglm_wake_mode', 'always');
            if (typeof startWakeListening === 'function') startWakeListening();
        } else if (値 !== 'wake-always') {
            localStorage.setItem('areglm_wake_mode', 'push');
            if (typeof stopWakeListening === 'function') stopWakeListening();
        }
    } catch (e) {
        console.warn('声の使い方を切り替える途中で:', e.message);
    }

    render声の使い方();
}

function render声の使い方() {
    const 箱 = document.getElementById('voice-mode');
    if (!箱) return;

    const いま = 使い方を読む();
    箱.innerHTML = '';

    /* --- 選ぶところ --- */
    const 並び = document.createElement('div');
    並び.className = 'vmode-list';

    使い方たち.forEach((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vmode' + (いま === x.値 ? ' on' : '');

        const 頭 = document.createElement('b');
        頭.textContent = `${x.印} ${x.題}`;
        b.appendChild(頭);

        if (x.すすめ && いま !== x.値) {
            const 札 = document.createElement('span');
            札.className = 'vmode-tag';
            札.textContent = 'おすすめ';
            頭.appendChild(札);
        }

        const 説 = document.createElement('small');
        説.textContent = x.説;
        b.appendChild(説);

        b.addEventListener('click', () => 使い方を決める(x.値));
        並び.appendChild(b);
    });
    箱.appendChild(並び);

    if (!いま) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'どれか一つ選んでください。選ぶと、それに要るものだけを下に出します。';
        箱.appendChild(p);
    }

    /* --- 選んだものに要るものだけを出す --- */
    出し分ける(いま);
}

/**
 * 使い方に合わせて、画面の各部を出し入れする。
 *
 * 使わないものを隠すのが目的。
 * 全部並べておくと、どれを押せばよいのか分からなくなる。
 */
function 出し分ける(いま) {
    const 出す = (id, かどうか) => {
        const e = document.getElementById(id);
        const 枠 = e && (e.closest('.voice-block') || e);
        if (枠) 枠.hidden = !かどうか;

        // 見出しも一緒に出し入れする
        const 見出し = 枠 && 枠.previousElementSibling;
        if (見出し && 見出し.classList.contains('rule-head')) 見出し.hidden = !かどうか;
    };

    const 声を使う = いま && いま !== 'off';
    const 呼ぶ = いま === 'wake-open' || いま === 'wake-always';

    出す('voice-check', 声を使う);            // いま声が使えるか
    出す('voice-teach2', 呼ぶ);               // 声を覚えさせる（常駐で録る）
    出す('always-listen', いま === 'wake-always');
    出す('voice-push-block', いま === 'push');   // 押して話す

    // 前からある「声で指示する」の切り替えは、この画面に置き換わったので隠す
    const 前の切替 = document.querySelector('.wake-mode');
    if (前の切替) 前の切替.hidden = true;
    const 前の外部 = document.querySelector('.wake-browser-opt');
    if (前の外部) 前の外部.hidden = いま !== 'wake-open';
    const 押す行 = document.querySelector('.wake-push-row');
    if (押す行) 押す行.hidden = いま !== 'push';
}

function init声の使い方() {
    if (document.getElementById('voice-mode')) render声の使い方();
}

window.init声の使い方 = init声の使い方;
window.render声の使い方 = render声の使い方;
window.使い方を読む 	= 使い方を読む;
