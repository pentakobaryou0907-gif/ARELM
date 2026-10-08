/**
 * 数値計画（月次の損益シミュレーション）
 *
 * なぜこれが要るのか:
 *
 *   在庫の金額を足すだけでは、事業が回るかどうかは分からない。
 *   知りたいのは「何ヶ月目に黒字になるか」「いくら足りないか」。
 *   そのためには、変動費と固定費を分けて、月ごとに追う必要がある。
 *
 * 二つの型を持つ理由:
 *
 *   ・<b>サブスク型</b>（毎月お金が入る商売）
 *     今月の会員数は、先月の会員数から解約が引かれ、新規が足される。
 *     <b>前の月の答えが、次の月の入力になる</b>。
 *     この繰り返しがあるので、ただの掛け算では出せない。
 *
 *   ・<b>売り切り型</b>（作って売る商売。いまのアパレルはこちら）
 *     その月に売れた数だけで決まる。前の月は引きずらない。
 *
 *   型を一つに決めてしまうと、どちらかが必ず歪む。
 *
 * 正直に書いておく:
 *   これは<b>予測であって、約束ではない</b>。
 *   入れた数字がそのまま出てくるだけで、
 *   数字が甘ければ、甘い答えが返る。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const 数値計画の鍵 = 'areglm_numeric_plans';

/** 変数の定義。画面もここから作るので、増やすときはここだけ直す。 */
const 計画の変数 = {
    サブスク: [
        { id: 'startMembers', 名: '初期会員数', 単位: '人', 既定: 0 },
        { id: 'newPerMonth', 名: '新規獲得数（毎月）', 単位: '人/月', 既定: 20 },
        { id: 'unitPrice', 名: '月額単価', 単位: '円', 既定: 8000 },
        { id: 'churnRate', 名: '解約率（毎月）', 単位: '%', 既定: 5 },
    ],
    売り切り: [
        { id: 'firstQty', 名: '初月の販売数', 単位: '点', 既定: 30 },
        { id: 'growthRate', 名: '販売数の伸び（毎月）', 単位: '%', 既定: 3 },
        { id: 'unitPrice', 名: '販売単価', 単位: '円', 既定: 4500 },
    ],
};

const 原価の変数 = [
    { id: 'costRate', 名: '原価率（売上に対して）', 単位: '%', 既定: 40 },
    { id: 'varCostPerUnit', 名: '1件あたりの変動費', 単位: '円', 既定: 0 },
];

const 販管費の変数 = [
    { id: 'salary', 名: '給与', 単位: '円/月', 既定: 0 },
    { id: 'rent', 名: '家賃', 単位: '円/月', 既定: 0 },
    { id: 'otherFixed', 名: 'その他の固定費', 単位: '円/月', 既定: 0 },
    { id: 'promoRate', 名: '販促費（売上に対して）', 単位: '%', 既定: 5 },
];

/* ==========================================================
   計算
   ========================================================== */

function 数(v, 既定 = 0) {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 既定;
}

/**
 * 月ごとの損益を出す。
 *
 * サブスク型のときだけ、前の月の会員数を引き継ぐ。
 * ここが「前月を参照する計算」の実体。
 */
function 計画を計算する(設定) {
    const 月数 = Math.max(1, Math.min(240, 数(設定.月数, 60)));
    const 型 = 設定.型 === 'サブスク' ? 'サブスク' : '売り切り';
    const v = 設定.変数 || {};

    const 原価率 = 数(v.costRate) / 100;
    const 変動費単価 = 数(v.varCostPerUnit);
    const 固定費 = 数(v.salary) + 数(v.rent) + 数(v.otherFixed);
    const 販促率 = 数(v.promoRate) / 100;

    const 単価 = 数(v.unitPrice);

    // サブスク型で引き継ぐ値。ここだけが月をまたぐ。
    let 会員数 = 数(v.startMembers);
    const 新規 = 数(v.newPerMonth);
    const 解約率 = 数(v.churnRate) / 100;

    // 売り切り型で引き継ぐ値
    let 販売数 = 数(v.firstQty);
    const 伸び = 数(v.growthRate) / 100;

    const 行たち = [];
    let 累計営業利益 = 0;
    let 黒字になる月 = null;      // その月だけで黒字
    let 回収できる月 = null;      // 累計でも黒字

    for (let 月 = 1; 月 <= 月数; 月++) {
        let 件数;

        if (型 === 'サブスク') {
            // 先月の会員から解約を引き、新規を足す。
            // 1ヶ月目は初期会員＋新規から始める。
            会員数 = 月 === 1
                ? 会員数 + 新規
                : 会員数 * (1 - 解約率) + 新規;
            件数 = 会員数;
        } else {
            // 1ヶ月目はそのまま。2ヶ月目からは伸び率をかける。
            if (月 > 1) 販売数 = 販売数 * (1 + 伸び);
            件数 = 販売数;
        }

        const 売上 = 件数 * 単価;
        const 原価 = 売上 * 原価率 + 件数 * 変動費単価;
        const 粗利 = 売上 - 原価;
        const 販管費 = 固定費 + 売上 * 販促率;
        const 営業利益 = 粗利 - 販管費;

        累計営業利益 += 営業利益;

        if (黒字になる月 === null && 営業利益 > 0) 黒字になる月 = 月;
        if (回収できる月 === null && 累計営業利益 > 0) 回収できる月 = 月;

        行たち.push({
            月,
            // 整数に丸めると、売上（丸める前の件数×単価）と表示上の
            // 「件数×単価」が合わなくなっていた
            // （例: 実際は30.9人ぶんの売上なのに、表示は「31」）。
            // 小数第1位までは残し、表示と計算の根拠を一致させる。
            件数: Math.round(件数 * 10) / 10,
            売上: Math.round(売上),
            原価: Math.round(原価),
            粗利: Math.round(粗利),
            販管費: Math.round(販管費),
            営業利益: Math.round(営業利益),
            累計営業利益: Math.round(累計営業利益),
        });
    }

    // いちばん深く沈んだところ＝いくら用意しておく必要があるか
    const 最大赤字 = Math.min(0, ...行たち.map((r) => r.累計営業利益));

    return {
        型,
        行たち,
        黒字になる月,
        回収できる月,
        必要な資金: Math.abs(Math.round(最大赤字)),
        最終累計: 行たち.length ? 行たち[行たち.length - 1].累計営業利益 : 0,
    };
}

/* ==========================================================
   保存
   ========================================================== */

function 計画たちを読む() {
    try {
        const r = JSON.parse(localStorage.getItem(数値計画の鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 計画たちを保存(一覧) {
    try {
        localStorage.setItem(数値計画の鍵, JSON.stringify(一覧));
        return true;
    } catch (e) {
        console.error('数値計画を保存できませんでした:', e);
        return false;
    }
}

/** いまの画面の入力を、一つの設定にまとめる */
function 画面から設定を取る() {
    const 型 = document.querySelector('input[name="plan-model"]:checked')?.value || '売り切り';
    const 変数 = {};
    [...計画の変数.サブスク, ...計画の変数.売り切り, ...原価の変数, ...販管費の変数]
        .forEach((x) => {
            const el = document.getElementById(`plan-v-${x.id}`);
            if (el && el.value !== '') 変数[x.id] = 数(el.value, x.既定);
        });
    return {
        名前: document.getElementById('plan-name')?.value?.trim() || '',
        型,
        月数: 数(document.getElementById('plan-months')?.value, 60),
        変数,
    };
}

/* ==========================================================
   画面
   ========================================================== */

const 円 = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');

/** 変数の入力欄を作る */
function 変数欄を作る(箱id, 変数たち) {
    const 箱 = document.getElementById(箱id);
    if (!箱) return;
    箱.innerHTML = '';

    変数たち.forEach((x) => {
        const 組 = document.createElement('div');
        組.className = 'form-group';

        const 名札 = document.createElement('label');
        名札.htmlFor = `plan-v-${x.id}`;
        名札.textContent = `${x.名}（${x.単位}）`;

        const 入力 = document.createElement('input');
        入力.type = 'number';
        入力.id = `plan-v-${x.id}`;
        入力.value = x.既定;
        入力.step = 'any';
        入力.addEventListener('input', render計画の結果);

        組.appendChild(名札);
        組.appendChild(入力);
        箱.appendChild(組);
    });
}

/** 型を切り替えたら、売上の変数欄を入れ替える */
function 型に合わせて欄を出す() {
    const 型 = document.querySelector('input[name="plan-model"]:checked')?.value || '売り切り';
    変数欄を作る('plan-vars-sales', 計画の変数[型]);
    render計画の結果();
}

function render計画の結果() {
    const 箱 = document.getElementById('plan-result');
    if (!箱) return;

    const 設定 = 画面から設定を取る();
    const 出 = 計画を計算する(設定);
    箱.innerHTML = '';

    /* --- 要点。表を読む前に、知りたいことを先に出す --- */
    const 要点 = document.createElement('div');
    要点.className = 'stats-grid compact';
    [
        ['単月で黒字になる月', 出.黒字になる月 ? `${出.黒字になる月}ヶ月目` : '期間中はならない'],
        ['累計で回収できる月', 出.回収できる月 ? `${出.回収できる月}ヶ月目` : '期間中はできない'],
        ['用意しておく資金', 円(出.必要な資金)],
        [`${設定.月数}ヶ月後の累計利益`, 円(出.最終累計)],
    ].forEach(([名, 値]) => {
        const c = document.createElement('div');
        c.className = 'stat-card';
        const s = document.createElement('span');
        s.textContent = 名;
        const p = document.createElement('p');
        p.textContent = 値;
        c.appendChild(s);
        c.appendChild(p);
        要点.appendChild(c);
    });
    箱.appendChild(要点);

    if (!出.黒字になる月) {
        const 断り = document.createElement('p');
        断り.className = 'guard-off';
        断り.textContent = 'この条件では、期間中に一度も黒字になりません。'
            + '単価・販売数を上げるか、固定費を下げる必要があります。';
        箱.appendChild(断り);
    }

    /* --- 月ごとの表 --- */
    // 8列（月・件数・売上・原価など）に金額の桁の多い数字が並ぶため、
    // .inventory-table の幅100%指定のままだと、スマホ幅では
    // 1列あたり50px弱まで押しつぶされ、「¥686,090」のような数字が
    // 1桁ずつ縦に折り返されて読めなくなっていた。
    // 横スクロールで見せる専用のクラスを足す。
    const 枠 = document.createElement('div');
    枠.className = 'inventory-table plan-table-wrap';
    const 表 = document.createElement('table');

    const thead = document.createElement('thead');
    const 見出し行 = document.createElement('tr');
    const 件数の名 = 出.型 === 'サブスク' ? '会員数' : '販売数';
    ['月', 件数の名, '売上', '原価', '粗利', '販管費', '営業利益', '累計'].forEach((t) => {
        const th = document.createElement('th');
        th.textContent = t;
        見出し行.appendChild(th);
    });
    thead.appendChild(見出し行);
    表.appendChild(thead);

    const tbody = document.createElement('tbody');
    出.行たち.forEach((r) => {
        const tr = document.createElement('tr');
        // 赤字の月は目に入るようにする
        if (r.営業利益 < 0) tr.className = 'plan-row-loss';
        [
            `${r.月}`,
            r.件数.toLocaleString('ja-JP'),
            円(r.売上), 円(r.原価), 円(r.粗利), 円(r.販管費), 円(r.営業利益), 円(r.累計営業利益),
        ].forEach((v) => {
            const td = document.createElement('td');
            td.textContent = v;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    表.appendChild(tbody);
    枠.appendChild(表);
    箱.appendChild(枠);

    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>これは予測であって、約束ではありません。</b>'
        + '入れた数字がそのまま出るだけなので、'
        + '見込みが甘ければ、答えも甘くなります。';
    箱.appendChild(断り);

    return 出;
}

/* ==========================================================
   保存・呼び出し
   ========================================================== */

function 計画を保存する() {
    const 設定 = 画面から設定を取る();
    if (!設定.名前) {
        showNotification?.('この計画の名前を入れてください（例: TUZURI 2026）', 'error');
        return;
    }

    const 一覧 = 計画たちを読む();
    const 位置 = 一覧.findIndex((x) => x.名前 === 設定.名前);
    const 中身 = { ...設定, 保存した日: new Date().toISOString() };

    if (位置 < 0) 一覧.push(中身);
    else 一覧[位置] = 中身;

    計画たちを保存(一覧);
    計画の一覧を出す();
    showNotification?.(`「${設定.名前}」を保存しました`, 'success');
    if (window.logActivity) logActivity(`数値計画を保存: ${設定.名前}`, { category: 'inventory' });
}

function 計画を呼び出す(名前) {
    const 中身 = 計画たちを読む().find((x) => x.名前 === 名前);
    if (!中身) return;

    const 名欄 = document.getElementById('plan-name');
    if (名欄) 名欄.value = 中身.名前;
    const 月欄 = document.getElementById('plan-months');
    if (月欄) 月欄.value = 中身.月数;

    const 型の丸 = document.querySelector(`input[name="plan-model"][value="${中身.型}"]`);
    if (型の丸) 型の丸.checked = true;
    型に合わせて欄を出す();   // 欄を入れ替えてから値を入れる

    Object.entries(中身.変数 || {}).forEach(([id, v]) => {
        const el = document.getElementById(`plan-v-${id}`);
        if (el) el.value = v;
    });

    render計画の結果();
    showNotification?.(`「${名前}」を読み込みました`, 'info');
}

function 計画の一覧を出す() {
    const 選 = document.getElementById('plan-saved');
    if (!選) return;
    const 一覧 = 計画たちを読む();
    選.innerHTML = '<option value="">保存した計画を開く…</option>';
    一覧.forEach((x) => {
        const o = document.createElement('option');
        o.value = x.名前;
        o.textContent = `${x.名前}（${x.型}・${x.月数}ヶ月）`;
        選.appendChild(o);
    });
}

/* ==========================================================
   AIに見てもらう
   ========================================================== */

/**
 * 計画をAIに見てもらう。
 *
 * 数字をそのまま渡さず、要点だけを文にして渡す。
 * 60行の表を丸ごと渡しても、返ってくる話は良くならない。
 */
async function 計画をAIに見てもらう(ボタン) {
    const 設定 = 画面から設定を取る();
    const 出 = 計画を計算する(設定);
    const 箱 = document.getElementById('plan-review');
    if (箱) 箱.innerHTML = '<p class="hint">見てもらっています…</p>';
    if (ボタン) ボタン.disabled = true;

    const 変数の文 = Object.entries(設定.変数)
        .map(([id, v]) => {
            const 定義 = [...計画の変数.サブスク, ...計画の変数.売り切り, ...原価の変数, ...販管費の変数]
                .find((x) => x.id === id);
            return 定義 ? `${定義.名}: ${v}${定義.単位}` : null;
        })
        .filter(Boolean)
        .join('、');

    const 頼み = `次の事業計画を見て、危ういところと、直すとよいところを挙げてください。\n\n`
        + `型: ${設定.型}\n期間: ${設定.月数}ヶ月\n条件: ${変数の文}\n\n`
        + `結果:\n`
        + `・単月で黒字になるのは ${出.黒字になる月 ? 出.黒字になる月 + 'ヶ月目' : '期間中にならない'}\n`
        + `・累計で回収できるのは ${出.回収できる月 ? 出.回収できる月 + 'ヶ月目' : '期間中にできない'}\n`
        + `・いちばん沈むときで ${円(出.必要な資金)} の資金が要る\n`
        + `・${設定.月数}ヶ月後の累計利益は ${円(出.最終累計)}\n\n`
        + `特に、見込みが甘い変数があれば指摘してください。`;

    try {
        const 答え = await AReGLM_LOCAL_FIRST.complete({
            provider: (typeof 現在の脳 === 'function') ? 現在の脳() : 'local',
            history: [],
            userText: 頼み,
            attachments: [],
            mode: 'analyze',
        });

        if (箱) {
            箱.innerHTML = '';
            const 見出し = document.createElement('h4');
            見出し.className = 'rule-head';
            見出し.textContent = 'AIから見た、この計画';
            const 本文 = document.createElement('div');
            本文.className = 'bubble-text';
            本文.style.whiteSpace = 'pre-wrap';
            本文.textContent = 答え;      // 何が返るか分からないので、文字として入れる
            箱.appendChild(見出し);
            箱.appendChild(本文);
        }
    } catch (e) {
        if (箱) {
            箱.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'guard-off';
            p.textContent = `見てもらえませんでした: ${e.message}`;
            箱.appendChild(p);
        }
    } finally {
        if (ボタン) ボタン.disabled = false;
    }
}

/* ==========================================================
   組み立て
   ========================================================== */

function init数値計画() {
    if (!document.getElementById('plan-result')) return;
    if (document.getElementById('plan-result').dataset.配線済み) return;
    document.getElementById('plan-result').dataset.配線済み = '1';

    変数欄を作る('plan-vars-cost', 原価の変数);
    変数欄を作る('plan-vars-sga', 販管費の変数);
    型に合わせて欄を出す();

    document.querySelectorAll('input[name="plan-model"]').forEach((r) => {
        r.addEventListener('change', 型に合わせて欄を出す);
    });
    document.getElementById('plan-months')?.addEventListener('input', render計画の結果);
    document.getElementById('plan-save')?.addEventListener('click', 計画を保存する);
    document.getElementById('plan-saved')?.addEventListener('change', (e) => {
        if (e.target.value) 計画を呼び出す(e.target.value);
    });
    document.getElementById('plan-review-btn')?.addEventListener('click', (e) => {
        計画をAIに見てもらう(e.target);
    });

    計画の一覧を出す();
}

window.init数値計画 = init数値計画;
window.計画を計算する = 計画を計算する;
window.render計画の結果 = render計画の結果;
