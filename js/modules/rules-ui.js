/**
 * ルールの管理
 *
 * 「指示でルールを変えたり、消したり、増やしたりできるようにしたい」
 * というご要望に応えるための仕組み。
 *
 * 考え方:
 *   ルールには2種類ある。
 *
 *   1. 変えられるルール（自分で決めたもの）
 *      仕事の進め方や、答え方の好み。
 *      いつでも足せるし、変えられるし、消せる。
 *
 *   2. 変えられないルール（土台）
 *      嘘をつかない、外部に送らない、違法なことをしない。
 *      これは、このツールが信用に足るための前提であって、
 *      指示で外せてしまうと意味が無くなる。
 *      なぜ外せないのかも、画面にそのまま書いてある。
 *
 * 消したルールは、消えた記録として残す。
 * 「いつ、なぜ消したか」が分からないと、
 * あとで元に戻すこともできないため。
 *
 * すべてこの端末の中だけで保存する。外部へは一切送らない。
 */

const AREGLM_RULES_KEY = 'areglm_my_rules';
const AREGLM_RULES_LOG_KEY = 'areglm_rules_log';

/**
 * 変えられないルール。
 *
 * ここを指示で外せるようにしないのは、
 * 「嘘をつかない」を外せてしまったら、
 * このツールの言うことが何ひとつ信用できなくなるため。
 */
const 変えられないルール = [
    {
        文: '基本の言語は日本語',
        理由: 'ふだん使う言葉が日本語なので、そこを最も確かにします。'
            + '英語・韓国語なども使えば同じように覚えますが、'
            + 'そのために日本語の精度を落とすことはしません。',
    },
    {
        文: '分からないことは分からないと答える。推測で勝手に実行しない',
        理由: 'これを外すと、知らないことを知っているかのように答えてしまいます',
    },
    {
        文: '推測を述べるときは「推測です」と必ず言う',
        理由: '推測と事実の区別がつかないと、判断を誤ります',
    },
    {
        文: '事実でないことを、事実のように言わない',
        理由: 'このツールの言うことを信じられなくなります',
    },
    {
        文: '外部へは一切送信しない（この端末の中だけで動く）',
        理由: '通信口そのものを塞いでいるため、設定を変えても送れません',
    },
    {
        文: '違法・犯罪・模倣品に関わることはしない',
        理由: 'トラブルに巻き込まれないための線引きです',
    },
    {
        文: '個人情報（カード番号・APIキー等）は覚えない',
        理由: '漏れたときの被害が大きすぎます',
    },
    {
        文: 'ファイルは消さず、「不要」へ移す',
        理由: '消してしまうと取り返しがつきません',
    },
];

/** 自分で決めたルールの初期値。使いながら足していく前提。 */
const ルールの初期値 = [
    { id: 'r_default_1', 文: '報告は、作業がすべて終わってからまとめて1回にする', 作った日: '' },
    { id: 'r_default_2', 文: '同じ商品は作らない。似すぎているものは事前に知らせる', 作った日: '' },
];

function 自分のルールを読む() {
    try {
        const 生 = localStorage.getItem(AREGLM_RULES_KEY);
        if (!生) return ルールの初期値.slice();
        const r = JSON.parse(生);
        return Array.isArray(r) ? r : ルールの初期値.slice();
    } catch {
        return ルールの初期値.slice();
    }
}

function 自分のルールを保存(ルールたち) {
    localStorage.setItem(AREGLM_RULES_KEY, JSON.stringify(ルールたち));
}

/** 何をしたかの記録。消したルールも、ここに残る。 */
function ルールの記録を読む() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_RULES_LOG_KEY) || '[]');
    } catch {
        return [];
    }
}

function ルールの記録に足す(何を, 中身) {
    const 記録 = ルールの記録を読む();
    記録.push({ とき: new Date().toISOString(), 何を, 中身 });
    // 増えすぎないよう、直近200件だけ残す
    localStorage.setItem(AREGLM_RULES_LOG_KEY, JSON.stringify(記録.slice(-200)));
}

/* ---------- 追加・変更・削除 ---------- */

/**
 * ルールを足す。
 *
 * 変えられないルールと真っ向からぶつかる内容は断る。
 * 「嘘をついてもいい」を足せてしまっては、
 * 土台のルールを置いた意味が無いため。
 */
function ルールを足す(文) {
    文 = (文 || '').trim();
    if (!文) return { ok: false, 訳: '中身が空です' };

    const ぶつかる = 土台とぶつかるか(文);
    if (ぶつかる) {
        return {
            ok: false,
            訳: `このルールは、変えられないルール「${ぶつかる}」とぶつかるため足せません。`,
        };
    }

    const ルールたち = 自分のルールを読む();
    if (ルールたち.some((r) => r.文 === 文)) {
        return { ok: false, 訳: '同じルールがすでにあります' };
    }

    ルールたち.push({
        id: 'r_' + Date.now(),
        文,
        作った日: 今日(),
    });
    自分のルールを保存(ルールたち);
    ルールの記録に足す('足した', 文);
    return { ok: true, 訳: 'ルールを足しました' };
}

/** ルールを書き換える */
function ルールを変える(id, 新しい文) {
    新しい文 = (新しい文 || '').trim();
    if (!新しい文) return { ok: false, 訳: '中身が空です' };

    const ぶつかる = 土台とぶつかるか(新しい文);
    if (ぶつかる) {
        return { ok: false, 訳: `変えられないルール「${ぶつかる}」とぶつかります` };
    }

    const ルールたち = 自分のルールを読む();
    const r = ルールたち.find((x) => x.id === id);
    if (!r) return { ok: false, 訳: 'そのルールが見つかりません' };

    ルールの記録に足す('変えた', `${r.文} → ${新しい文}`);
    r.文 = 新しい文;
    自分のルールを保存(ルールたち);
    return { ok: true, 訳: 'ルールを変えました' };
}

/**
 * ルールを消す。
 *
 * 消した中身は記録に残す。
 * 何を消したか分からないと、戻すこともできないため。
 */
function ルールを消す(id) {
    const ルールたち = 自分のルールを読む();
    const r = ルールたち.find((x) => x.id === id);
    if (!r) return { ok: false, 訳: 'そのルールが見つかりません' };

    自分のルールを保存(ルールたち.filter((x) => x.id !== id));
    ルールの記録に足す('消した', r.文);
    return { ok: true, 訳: 'ルールを消しました（記録には残しています）' };
}

/**
 * 土台のルールとぶつかっていないかを見る。
 *
 * 言い回しは無数にあるので、完全には見分けられない。
 * ここで止めるのは、はっきり反しているものだけにしてある。
 * 見分けられないものを通すのは、
 * 「疑わしきは全部止める」にすると、
 * 普通のルールまで足せなくなるため。
 */
function 土台とぶつかるか(文) {
    const 低 = 文.toLowerCase();

    const 危ない組み合わせ = [
        { 語: ['嘘', 'ついて'], 相手: '事実でないことを、事実のように言わない' },
        { 語: ['嘘', 'ok'], 相手: '事実でないことを、事実のように言わない' },
        { 語: ['推測', '言わなくて'], 相手: '推測を述べるときは「推測です」と必ず言う' },
        { 語: ['外部', '送', 'いい'], 相手: '外部へは一切送信しない（この端末の中だけで動く）' },
        { 語: ['外部', '送信', '許可'], 相手: '外部へは一切送信しない（この端末の中だけで動く）' },
        { 語: ['違法'], 相手: '違法・犯罪・模倣品に関わることはしない' },
        { 語: ['模倣品'], 相手: '違法・犯罪・模倣品に関わることはしない' },
        { 語: ['完全に削除'], 相手: 'ファイルは消さず、「不要」へ移す' },
        { 語: ['永久', '削除'], 相手: 'ファイルは消さず、「不要」へ移す' },
    ];

    for (const c of 危ない組み合わせ) {
        if (c.語.every((w) => 低.includes(w))) return c.相手;
    }
    return null;
}

/* ---------- 画面 ---------- */

function renderRules() {
    const 自分の箱 = document.getElementById('rules-mine');
    const 土台の箱 = document.getElementById('rules-fixed');
    if (!自分の箱 || !土台の箱) return;

    // --- 自分で決めたルール ---
    const ルールたち = 自分のルールを読む();
    自分の箱.innerHTML = '';

    if (!ルールたち.length) {
        自分の箱.innerHTML = '<li class="hint">まだありません。下から足せます。</li>';
    }

    ルールたち.forEach((r) => {
        const li = document.createElement('li');
        li.className = 'rule-item';

        const 文 = document.createElement('span');
        文.className = 'rule-text';
        文.textContent = r.文;

        const 直す = document.createElement('button');
        直す.type = 'button';
        直す.className = 'btn-link';
        直す.textContent = '直す';
        直す.addEventListener('click', () => {
            const 新 = prompt('ルールを書き直してください', r.文);
            if (新 === null) return;
            const 結果 = ルールを変える(r.id, 新);
            showNotification(結果.訳, 結果.ok ? 'success' : 'error');
            renderRules();
        });

        const 消す = document.createElement('button');
        消す.type = 'button';
        消す.className = 'btn-link danger';
        消す.textContent = '消す';
        消す.addEventListener('click', () => {
            if (!confirm(`このルールを消しますか。\n\n「${r.文}」\n\n消した記録は残ります。`)) return;
            const 結果 = ルールを消す(r.id);
            showNotification(結果.訳, 結果.ok ? 'success' : 'error');
            renderRules();
        });

        li.appendChild(文);
        li.appendChild(直す);
        li.appendChild(消す);
        自分の箱.appendChild(li);
    });

    // --- 変えられないルール ---
    土台の箱.innerHTML = '';
    変えられないルール.forEach((r) => {
        const li = document.createElement('li');
        li.className = 'rule-item rule-fixed';
        const 文 = document.createElement('span');
        文.className = 'rule-text';
        文.textContent = r.文;
        const 理由 = document.createElement('small');
        理由.className = 'rule-why';
        理由.textContent = r.理由;
        li.appendChild(文);
        li.appendChild(理由);
        土台の箱.appendChild(li);
    });

    // --- 変えた記録 ---
    const 記録箱 = document.getElementById('rules-log');
    if (記録箱) {
        const 記録 = ルールの記録を読む().slice(-8).reverse();
        記録箱.innerHTML = 記録.length
            ? ''
            : '<li class="hint">まだ変更はありません</li>';
        記録.forEach((r) => {
            const li = document.createElement('li');
            li.className = 'rule-log-item';
            li.textContent = `${new Date(r.とき).toLocaleString('ja-JP')}  ${r.何を}: ${r.中身}`;
            記録箱.appendChild(li);
        });
    }
}

function initRules() {
    document.getElementById('rule-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const 入力 = document.getElementById('rule-input');
        const 結果 = ルールを足す(入力?.value);
        showNotification(結果.訳, 結果.ok ? 'success' : 'error');
        if (結果.ok && 入力) 入力.value = '';
        renderRules();
    });

    renderRules();
}

window.initRules = initRules;
window.renderRules = renderRules;
window.ルールを足す = ルールを足す;
window.ルールを変える = ルールを変える;
window.ルールを消す = ルールを消す;
window.自分のルールを読む = 自分のルールを読む;
window.変えられないルール = 変えられないルール;
