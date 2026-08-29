/**
 * 声と話し方を選ぶ
 *
 * なぜこれが要るのか:
 *   返事はいつも同じ声、同じ速さだった。
 *   人によって聞き取りやすい速さは違うし、
 *   長く使うものだから、声が合わないと疲れる。
 *
 * どこの声を使っているのか（はっきりさせておきます）:
 *   読み上げは、この端末（Mac）に元から入っている声を使っています。
 *   声を作る処理も端末の中で行われ、外部へは一切送りません。
 *   ネットが切れていても読み上げられます。
 *
 *   ただし、声そのものは Apple が用意したものです。
 *   声を一から合成する仕組みは作っていません。
 *   「声もゼロから作りました」とは言いません。
 *
 * 覚えた設定はこの端末の中だけに残ります。
 */

const 声の設定の鍵 = 'areglm_voice_style';

/** 初期値。速さは少しだけ速め（待たされる感じを減らすため） */
const はじめの設定 = {
    声: '',        // 空なら端末のおすすめに任せる
    速さ: 1.05,
    高さ: 1.0,
    大きさ: 1.0,
    読み上げる: true,
};

function 声の設定を読む() {
    try {
        return Object.assign({}, はじめの設定,
            JSON.parse(localStorage.getItem(声の設定の鍵) || '{}'));
    } catch {
        return Object.assign({}, はじめの設定);
    }
}

function 声の設定を書く(設定) {
    localStorage.setItem(声の設定の鍵, JSON.stringify(設定));
}

/**
 * 使える声を集める。
 *
 * 日本語の声を先に出す。
 * 端末によっては読み込みが遅れるので、
 * 揃ってから呼ばれるようにしてある。
 */
function 使える声たち() {
    if (!('speechSynthesis' in window)) return [];
    const 全部 = speechSynthesis.getVoices() || [];
    const 日本語 = 全部.filter((v) => /^ja/i.test(v.lang));
    const その他 = 全部.filter((v) => !/^ja/i.test(v.lang));
    return 日本語.concat(その他);
}

/**
 * 選ばれた声を返す。
 *
 * 選んだ声が見つからないことがある。
 * （端末の設定から消された、別のMacで開いた、など）
 * そのときは黙って端末のおすすめに戻す。
 * 声が出ないより、違う声でも出るほうがよい。
 */
function 選ばれた声() {
    const 設定 = 声の設定を読む();
    if (!設定.声) return null;
    return 使える声たち().find((v) => v.voiceURI === 設定.声) || null;
}

/* ---------- 画面 ---------- */

function renderVoiceStyle() {
    const 箱 = document.getElementById('voice-style');
    if (!箱) return;

    if (!('speechSynthesis' in window)) {
        箱.innerHTML = '<p class="hint">この端末では読み上げが使えません。'
            + '画面の文字はそのまま使えます。</p>';
        return;
    }

    const 設定 = 声の設定を読む();
    const 声たち = 使える声たち();

    箱.innerHTML = '';

    // --- 読み上げるかどうか ---
    const 入切 = document.createElement('label');
    入切.className = 'voice-style-toggle';
    const 印 = document.createElement('input');
    印.type = 'checkbox';
    印.checked = 設定.読み上げる;
    印.addEventListener('change', () => {
        const s = 声の設定を読む();
        s.読み上げる = 印.checked;
        声の設定を書く(s);
        showNotification(印.checked ? '声で返します' : '声では返しません（画面には出ます）', 'success');
    });
    入切.appendChild(印);
    const 入切の文 = document.createElement('span');
    入切の文.innerHTML = '<b>声で返す</b><small>声で聞かれたときだけ返します。'
        + '打ち込んだときは黙っています。</small>';
    入切.appendChild(入切の文);
    箱.appendChild(入切);

    // --- 声を選ぶ ---
    const 選び = document.createElement('div');
    選び.className = 'voice-style-row';
    const 名 = document.createElement('label');
    名.textContent = '声';
    名.htmlFor = 'voice-style-select';
    const 選択 = document.createElement('select');
    選択.id = 'voice-style-select';

    const 任せる = document.createElement('option');
    任せる.value = '';
    任せる.textContent = 'この端末のおすすめに任せる';
    選択.appendChild(任せる);

    声たち.forEach((v) => {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        o.textContent = `${v.name}（${v.lang}）`;
        if (v.voiceURI === 設定.声) o.selected = true;
        選択.appendChild(o);
    });

    選択.addEventListener('change', () => {
        const s = 声の設定を読む();
        s.声 = 選択.value;
        声の設定を書く(s);
        試しに話す();
    });

    選び.appendChild(名);
    選び.appendChild(選択);
    箱.appendChild(選び);

    if (!声たち.length) {
        const 待ち = document.createElement('p');
        待ち.className = 'hint';
        待ち.textContent = '声の一覧を読み込んでいます。少し待ってから開き直してください。';
        箱.appendChild(待ち);
    }

    // --- 速さ・高さ・大きさ ---
    [
        ['速さ', '速さ', 0.5, 2.0, 0.05, 'ゆっくり', '速い'],
        ['高さ', '高さ', 0.5, 1.5, 0.05, '低い', '高い'],
        ['大きさ', '大きさ', 0.2, 1.0, 0.05, '小さい', '大きい'],
    ].forEach(([鍵, 名前, 下, 上, 刻み, 左, 右]) => {
        const 行 = document.createElement('div');
        行.className = 'voice-style-row';

        const ラベル = document.createElement('label');
        ラベル.textContent = 名前;
        行.appendChild(ラベル);

        const つまみ = document.createElement('input');
        つまみ.type = 'range';
        つまみ.min = 下;
        つまみ.max = 上;
        つまみ.step = 刻み;
        つまみ.value = 設定[鍵];

        const 数 = document.createElement('span');
        数.className = 'voice-style-value';
        数.textContent = Number(設定[鍵]).toFixed(2);

        つまみ.addEventListener('input', () => {
            数.textContent = Number(つまみ.value).toFixed(2);
        });
        // 動かしている間ずっと話すとうるさいので、離したときだけ試す
        つまみ.addEventListener('change', () => {
            const s = 声の設定を読む();
            s[鍵] = Number(つまみ.value);
            声の設定を書く(s);
            試しに話す();
        });

        行.appendChild(つまみ);
        行.appendChild(数);

        const 端 = document.createElement('small');
        端.className = 'voice-style-ends';
        端.textContent = `${左} ← → ${右}`;
        行.appendChild(端);

        箱.appendChild(行);
    });

    // --- 試す・戻す ---
    const 並び = document.createElement('div');
    並び.className = 'voice-style-row';

    const 試す = document.createElement('button');
    試す.type = 'button';
    試す.className = 'btn btn-sm btn-primary';
    試す.textContent = '🔊 試しに話す';
    試す.addEventListener('click', () => 試しに話す());

    const 戻す = document.createElement('button');
    戻す.type = 'button';
    戻す.className = 'btn btn-sm btn-secondary';
    戻す.textContent = 'はじめの設定に戻す';
    戻す.addEventListener('click', () => {
        声の設定を書く(Object.assign({}, はじめの設定));
        renderVoiceStyle();
        showNotification('はじめの設定に戻しました', 'success');
    });

    並び.appendChild(試す);
    並び.appendChild(戻す);
    箱.appendChild(並び);

    const 断り = document.createElement('p');
    断り.className = 'hint';
    断り.textContent = '読み上げには、この端末に元から入っている声を使っています。'
        + '音声は外へ一切出ません。ただし声そのものはこの端末のもので、'
        + '声を一から合成する仕組みは作っていません。';
    箱.appendChild(断り);
}

function 試しに話す() {
    if (typeof speakBack === 'function') {
        speakBack('この声と話し方で返します。');
    }
}

function initVoiceStyle() {
    if (!document.getElementById('voice-style')) return;
    renderVoiceStyle();

    // 声の一覧は遅れて届くことがある。届いたら描き直す。
    if ('speechSynthesis' in window && 'onvoiceschanged' in speechSynthesis) {
        speechSynthesis.addEventListener('voiceschanged', () => renderVoiceStyle());
    }
}

window.initVoiceStyle = initVoiceStyle;
window.renderVoiceStyle = renderVoiceStyle;
window.声の設定を読む = 声の設定を読む;
window.選ばれた声 = 選ばれた声;
