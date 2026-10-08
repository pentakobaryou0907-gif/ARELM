/**
 * テックパックの原価・期間・注意書き
 *
 * なぜこれが要るのか:
 *   寸法だけの仕様書だと、工場とのやり取りで
 *   「いくらかかるのか」「いつできるのか」が後出しになり、
 *   あとから値段を上げられることがある。
 *
 *   先にこちらで数字を出し、注意書きとして書面に載せておけば、
 *   その話をした証拠が残る。
 *
 * 計算の考え方:
 *   一枚あたりの原価 = 材料費 + 加工賃 + 付属品費 + その他
 *   小計 × 枚数 に、型代（何枚作っても一度きり）を足す。
 *   型代を枚数で割ると、少ない枚数ほど一枚が高くなる。
 *   その事実がそのまま見えるようにしてある。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const AREGLM_COST_KEY = 'areglm_techpack_cost';

/**
 * 工場に必ず伝えておくこと。
 *
 * ここは思いつきで書き換えず、
 * 「後から値段や納期を変えられた」ときに効く文だけを載せている。
 */
const 既定の注意書き = [
    'この見積は本書に記載の仕様・数量・納期を前提とします。変更が生じる場合は、着手前に書面でご連絡ください。',
    '着手後の単価変更は受け付けません。変更が必要な場合は、作業を止めてご相談ください。',
    '型代は初回のみとし、同一仕様の再生産では請求しないものとします。',
    '納期に遅れが見込まれる場合は、判明した時点で速やかにご連絡ください。',
    '本書のデザイン・型紙・仕様の著作権は当方に帰属します。他社への転用はご遠慮ください。',
    '不良品が出た場合の取り扱い（再製作・返金のいずれか）を、着手前に取り決めます。',
];

function 原価表を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_COST_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 原価表を保存(一覧) {
    localStorage.setItem(AREGLM_COST_KEY, JSON.stringify(一覧));
}

/**
 * 原価を計算する。
 *
 * @returns {{一枚あたり:number, 小計:number, 型代:number, 総額:number,
 *            型代込み一枚:number, 売値の目安:number, 粗利:number, 粗利率:number}}
 */
function 原価を計算(中身) {
    const 数 = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0;

    const 材料 = 数(中身.材料費);
    const 加工 = 数(中身.加工賃);
    const 付属 = 数(中身.付属品費);
    const その他 = 数(中身.その他);
    const 型代 = 数(中身.型代);
    const 枚数 = Math.max(1, 数(中身.枚数));
    const 掛率 = 数(中身.掛率) || 3;

    const 一枚あたり = 材料 + 加工 + 付属 + その他;
    const 小計 = 一枚あたり * 枚数;
    const 総額 = 小計 + 型代;

    // 型代を枚数で割ると、少ない枚数ほど一枚が高くなる。
    // その事実を隠さず出す。
    const 型代込み一枚 = 総額 / 枚数;

    const 売値の目安 = Math.ceil((型代込み一枚 * 掛率) / 100) * 100;
    const 粗利 = 売値の目安 - 型代込み一枚;
    const 粗利率 = 売値の目安 ? (粗利 / 売値の目安) * 100 : 0;

    return {
        一枚あたり, 小計, 型代, 総額,
        型代込み一枚: Math.round(型代込み一枚),
        売値の目安,
        粗利: Math.round(粗利),
        粗利率: Math.round(粗利率 * 10) / 10,
    };
}

/**
 * 納期を出す。
 *
 * サンプル → 量産 → 輸送 を足す。
 * 一つの数字で「〇日」と言われると、
 * どこで遅れたのか分からなくなるため、分けて持つ。
 */
function 納期を計算(中身) {
    const 数 = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0;
    const サンプル = 数(中身.サンプル日数);
    const 量産 = 数(中身.量産日数);
    const 輸送 = 数(中身.輸送日数);
    const 合計 = サンプル + 量産 + 輸送;

    let 仕上がり = '';
    if (合計 > 0) {
        const d = new Date();
        d.setDate(d.getDate() + 合計);
        仕上がり = typeof 日付文字 === 'function' ? 日付文字(d) : d.toLocaleDateString('ja-JP');
    }

    return { サンプル, 量産, 輸送, 合計, 仕上がり };
}

function renderCost() {
    const 取 = (id) => document.getElementById(id)?.value;
    const 中身 = {
        材料費: 取('cost-material'), 加工賃: 取('cost-work'),
        付属品費: 取('cost-parts'), その他: 取('cost-other'),
        型代: 取('cost-mold'), 枚数: 取('cost-qty'), 掛率: 取('cost-rate'),
        サンプル日数: 取('lead-sample'), 量産日数: 取('lead-mass'), 輸送日数: 取('lead-ship'),
    };

    const 原 = 原価を計算(中身);
    const 納 = 納期を計算(中身);

    const 円 = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
    const 箱 = document.getElementById('cost-result');
    if (!箱) return;

    箱.innerHTML = '';

    // 材料費・加工賃・型代が空だと総額は静かに¥0のままになり、
    // 「壊れている」と誤解されるため、原因をその場で示す。
    const 未入力 = ['材料費', '加工賃', '型代'].filter((k) => !String(中身[k] || '').trim());
    if (原.総額 === 0 && 未入力.length > 0) {
        const 案内 = document.createElement('div');
        案内.className = 'cost-hint';
        案内.textContent = `${未入力.join('・')}を入力すると、金額が表示されます。`;
        箱.appendChild(案内);
    }

    const 行 = (名, 値, 強い) => {
        const d = document.createElement('div');
        d.className = 'cost-row' + (強い ? ' strong' : '');
        d.innerHTML = '<span class="cost-name"></span><span class="cost-val"></span>';
        d.querySelector('.cost-name').textContent = 名;
        d.querySelector('.cost-val').textContent = 値;
        箱.appendChild(d);
    };

    行('一枚あたりの原価', 円(原.一枚あたり));
    行('小計（原価 × 枚数）', 円(原.小計));
    行('型代（初回のみ）', 円(原.型代));
    行('総額', 円(原.総額), true);
    行('型代込みの一枚', 円(原.型代込み一枚), true);
    行('売値の目安', 円(原.売値の目安), true);
    行('粗利（一枚）', `${円(原.粗利)}（${原.粗利率}%）`);

    if (納.合計 > 0) {
        行('納期', `サンプル${納.サンプル}日 ＋ 量産${納.量産}日 ＋ 輸送${納.輸送}日 ＝ ${納.合計}日`);
        行('仕上がりの目安', 納.仕上がり, true);
    }

    // 少ない枚数ほど一枚が高くなることを、数字で見せる。
    // 「どれくらい作ればいいか」の判断に、いちばん効くため。
    if (原.型代 > 0) {
        const 比較 = document.getElementById('cost-compare');
        if (比較) {
            const 枚たち = [10, 30, 50, 100, 300];
            比較.innerHTML = '<div class="cost-compare-head">枚数を変えたときの、型代込みの一枚</div>'
                + 枚たち.map((n) => {
                    const 額 = Math.round((原.一枚あたり * n + 原.型代) / n);
                    return `<div class="cost-row"><span class="cost-name">${n}枚</span>`
                        + `<span class="cost-val">${円(額)}</span></div>`;
                }).join('');
        }
    } else {
        const 比較 = document.getElementById('cost-compare');
        if (比較) 比較.innerHTML = '';
    }
}

/** 注意書きを画面に出す */
function renderNotes() {
    const 箱 = document.getElementById('cost-notes');
    if (!箱) return;
    箱.innerHTML = '';
    既定の注意書き.forEach((文, i) => {
        const li = document.createElement('li');
        const ち = document.createElement('input');
        ち.type = 'checkbox';
        ち.checked = true;
        ち.dataset.i = i;
        const s = document.createElement('span');
        s.textContent = 文;
        li.appendChild(ち);
        li.appendChild(s);
        箱.appendChild(li);
    });
}

/**
 * 工場に渡す書面として書き出す。
 *
 * 数字だけでなく注意書きも一緒に出す。
 * 別々にすると、注意書きだけ渡し忘れるため。
 */
function 見積書を書き出す() {
    const 取 = (id) => document.getElementById(id)?.value || '';
    const 中身 = {
        材料費: 取('cost-material'), 加工賃: 取('cost-work'),
        付属品費: 取('cost-parts'), その他: 取('cost-other'),
        型代: 取('cost-mold'), 枚数: 取('cost-qty'), 掛率: 取('cost-rate'),
        サンプル日数: 取('lead-sample'), 量産日数: 取('lead-mass'), 輸送日数: 取('lead-ship'),
    };
    const 原 = 原価を計算(中身);
    const 納 = 納期を計算(中身);
    const 円 = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');

    const 選ばれた注意 = [...document.querySelectorAll('#cost-notes input:checked')]
        .map((c) => 既定の注意書き[Number(c.dataset.i)]);

    const 行 = [
        `【製作費・納期の確認書】`,
        ``,
        `品名: ${取('cost-product') || '（未記入）'}`,
        `作成日: ${typeof 今日 === 'function' ? 今日() : ''}`,
        ``,
        `■ 費用`,
        `  材料費      ${円(Number(中身.材料費) || 0)}`,
        `  加工賃      ${円(Number(中身.加工賃) || 0)}`,
        `  付属品費    ${円(Number(中身.付属品費) || 0)}`,
        `  その他      ${円(Number(中身.その他) || 0)}`,
        `  ── 一枚あたりの原価  ${円(原.一枚あたり)}`,
        ``,
        `  数量        ${Math.max(1, Number(中身.枚数) || 1)}枚`,
        `  小計        ${円(原.小計)}`,
        `  型代        ${円(原.型代)}（初回のみ）`,
        `  総額        ${円(原.総額)}`,
        `  型代込みの一枚  ${円(原.型代込み一枚)}`,
        ``,
        `■ 納期`,
        `  サンプル    ${納.サンプル}日`,
        `  量産        ${納.量産}日`,
        `  輸送        ${納.輸送}日`,
        `  合計        ${納.合計}日${納.仕上がり ? `（目安 ${納.仕上がり}）` : ''}`,
        ``,
        `■ お取り決め`,
    ].concat(選ばれた注意.map((n, i) => `  ${i + 1}. ${n}`));

    const blob = new Blob([行.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `製作費確認書_${取('cost-product') || '無題'}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);

    showNotification('確認書を書き出しました', 'success');
}

function 原価を保存する() {
    const 取 = (id) => document.getElementById(id)?.value || '';
    const 一覧 = 原価表を読む();
    一覧.push({
        id: 'cost_' + Date.now(),
        品名: 取('cost-product'),
        材料費: 取('cost-material'), 加工賃: 取('cost-work'),
        付属品費: 取('cost-parts'), その他: 取('cost-other'),
        型代: 取('cost-mold'), 枚数: 取('cost-qty'), 掛率: 取('cost-rate'),
        サンプル日数: 取('lead-sample'), 量産日数: 取('lead-mass'), 輸送日数: 取('lead-ship'),
        作った日: typeof 今日 === 'function' ? 今日() : '',
    });
    原価表を保存(一覧);
    showNotification(`原価を保存しました（全${一覧.length}件）`, 'success');
}

function initTechpackCost() {
    ['cost-product', 'cost-material', 'cost-work', 'cost-parts', 'cost-other',
     'cost-mold', 'cost-qty', 'cost-rate',
     'lead-sample', 'lead-mass', 'lead-ship'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', renderCost);
    });

    document.getElementById('cost-export')?.addEventListener('click', 見積書を書き出す);
    document.getElementById('cost-save')?.addEventListener('click', 原価を保存する);

    renderNotes();
    renderCost();
}

window.initTechpackCost = initTechpackCost;
window.原価を計算 = 原価を計算;
window.納期を計算 = 納期を計算;
window.既定の注意書き = 既定の注意書き;
