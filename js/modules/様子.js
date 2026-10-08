/**
 * いま何をしているかを、ツール自身が把握する
 *
 * なぜこれが要るのか:
 *   「次は何をすればいい」と聞かれても、
 *   このツールは、あなたがいま何に取り組んでいるかを
 *   何も知らないまま答えていた。
 *
 *   どの画面をどれだけ使っているか、
 *   今日どこまで進んだかが分かれば、
 *   もっと当たりのいい返事ができる。
 *
 * 何を見ているのか（はっきり書きます）:
 *   ・いまどの画面を開いているか
 *   ・その画面をどれだけ開いていたか
 *   ・今日、何を作ったり足したりしたか（件数だけ）
 *
 * 何を見ていないのか:
 *   ・打ち込んだ中身そのもの
 *   ・このツールの外で何をしているか
 *   ・カメラ・マイク（この仕組みでは一切使いません）
 *
 * 記録はこの端末の中だけに残り、外部へは一切送りません。
 * 「忘れて」と言われたら、その場で消します。
 */

const 様子の鍵 = 'areglm_activity';

/** 何日ぶん残すか。古いものは落とす。 */
const 残す日数 = 30;

/** これより短い滞在は、通りすがりとみなして数えない（秒） */
const 数える最短秒 = 3;

let いまの画面 = null;
let 入った時刻 = 0;

function 様子を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(様子の鍵) || '{}');
        return (r && typeof r === 'object') ? r : {};
    } catch {
        return {};
    }
}

function 様子を書く(中身) {
    // 古い日を落とす。増え続けると、そのうち保存できなくなる。
    const 日々 = Object.keys(中身).sort();
    while (日々.length > 残す日数) delete 中身[日々.shift()];
    localStorage.setItem(様子の鍵, JSON.stringify(中身));
}

function 今日の鍵() {
    return typeof 日付文字 === 'function' ? 日付文字(new Date()) : new Date().toISOString().slice(0, 10);
}

/** 画面の名前を、人に見せる言い方にする */
const 画面の呼び名 = {
    dashboard: 'ホーム',
    mainai: 'エージェント',
    chat: 'AIチャット',
    brand: 'ブランド',
    sns: 'SNS',
    inventory: '在庫',
    develop: '開発',
    settings: '設定',
};

/* ---------- 記録する ---------- */

/**
 * 画面が変わったことを記録する。
 *
 * 前の画面にどれだけ居たかを、そこで確定させる。
 * 開きっぱなしのまま閉じられることがあるので、
 * 閉じるときにも同じ処理を呼んでいる。
 */
function 画面が変わった(名) {
    締める();
    いまの画面 = 名;
    入った時刻 = Date.now();
}

function 締める() {
    if (!いまの画面 || !入った時刻) return;

    const 秒 = Math.round((Date.now() - 入った時刻) / 1000);
    入った時刻 = 0;
    if (秒 < 数える最短秒) return;

    // 開きっぱなしで寝てしまうことがある。
    // そのまま足すと「12時間 在庫を見ていた」ことになってしまうので、
    // 一度の滞在は30分までとして数える。
    const 数える秒 = Math.min(秒, 30 * 60);

    const 全 = 様子を読む();
    const 日 = 今日の鍵();
    全[日] = 全[日] || { 画面: {}, 出来事: {} };
    全[日].画面[いまの画面] = (全[日].画面[いまの画面] || 0) + 数える秒;
    様子を書く(全);
}

/**
 * 何かを作った・足したことを記録する。
 *
 * 中身は残さない。件数だけ数える。
 * 中身まで持つと、消したはずのものが
 * ここに残ってしまうため。
 */
function 出来事を数える(種類) {
    const 全 = 様子を読む();
    const 日 = 今日の鍵();
    全[日] = 全[日] || { 画面: {}, 出来事: {} };
    全[日].出来事[種類] = (全[日].出来事[種類] || 0) + 1;
    様子を書く(全);
}

/* ---------- 読み解く ---------- */

function 秒を言葉に(秒) {
    if (秒 < 60) return `${秒}秒`;
    const 分 = Math.round(秒 / 60);
    if (分 < 60) return `${分}分`;
    const 時 = Math.floor(分 / 60);
    const 残 = 分 % 60;
    return 残 ? `${時}時間${残}分` : `${時}時間`;
}

/**
 * いまの様子を、文章にして返す。
 *
 * 何も記録が無いときは、無いと言う。
 * 適当に埋めると、それが嘘になる。
 */
function いまの様子() {
    締める();      // まだ数えていないぶんを確定させてから見る

    const 全 = 様子を読む();
    const 今日 = 全[今日の鍵()];

    if (!今日 || (!Object.keys(今日.画面).length && !Object.keys(今日.出来事).length)) {
        return {
            ある: false,
            文: '今日はまだ、記録するほど使われていません。',
        };
    }

    const 画面順 = Object.entries(今日.画面).sort((a, b) => b[1] - a[1]);
    const 合計 = 画面順.reduce((a, [, s]) => a + s, 0);

    const 文 = [];
    文.push(`今日はここまで、${秒を言葉に(合計)}ほど使われています。`);

    if (画面順.length) {
        const 上位 = 画面順.slice(0, 3)
            .map(([名, 秒]) => `${画面の呼び名[名] || 名}（${秒を言葉に(秒)}）`);
        文.push(`長く開いていたのは ${上位.join('、')} です。`);
    }

    const 出来事 = Object.entries(今日.出来事).sort((a, b) => b[1] - a[1]);
    if (出来事.length) {
        文.push('今日行ったこと: '
            + 出来事.map(([名, 数]) => `${名} ${数}件`).join('、'));
    } else {
        文.push('今日は、まだ何も足されていません。');
    }

    if (いまの画面) {
        文.push(`いま開いているのは「${画面の呼び名[いまの画面] || いまの画面}」です。`);
    }

    return {
        ある: true,
        文: 文.join('\n'),
        画面: 画面順,
        出来事,
        合計秒: 合計,
        いまの画面,
    };
}

/**
 * 何日ぶんかを振り返る。
 *
 * 「今週どうだった」に答えるためのもの。
 */
function 振り返り(日数) {
    締める();
    const 全 = 様子を読む();
    const 日々 = Object.keys(全).sort().slice(-(日数 || 7));

    if (!日々.length) return { ある: false, 文: 'まだ記録がありません。' };

    const 画面 = {};
    const 出来事 = {};
    let 合計 = 0;

    日々.forEach((d) => {
        Object.entries(全[d].画面 || {}).forEach(([k, v]) => {
            画面[k] = (画面[k] || 0) + v;
            合計 += v;
        });
        Object.entries(全[d].出来事 || {}).forEach(([k, v]) => {
            出来事[k] = (出来事[k] || 0) + v;
        });
    });

    const 並び = Object.entries(画面).sort((a, b) => b[1] - a[1]);
    const 文 = [`この${日々.length}日で、${秒を言葉に(合計)}ほど使われています。`];
    if (並び.length) {
        文.push('よく開いていた順: '
            + 並び.slice(0, 4).map(([n, s]) => `${画面の呼び名[n] || n}（${秒を言葉に(s)}）`).join('、'));
    }
    const 出 = Object.entries(出来事).sort((a, b) => b[1] - a[1]);
    if (出.length) 文.push('行ったこと: ' + 出.map(([n, c]) => `${n} ${c}件`).join('、'));

    return { ある: true, 文: 文.join('\n'), 日数: 日々.length, 画面: 並び, 出来事: 出 };
}

/** 記録を消す。「忘れて」と言われたときのため。 */
function 様子を忘れる() {
    localStorage.removeItem(様子の鍵);
    いまの画面 = null;
    入った時刻 = 0;
    render様子();
}

/* ---------- 画面 ---------- */

function render様子() {
    const 箱 = document.getElementById('activity-ui');
    if (!箱) return;

    const 今 = いまの様子();
    箱.innerHTML = '';

    const 文 = document.createElement('div');
    文.className = 'activity-now';
    今.文.split('\n').forEach((t) => {
        const p = document.createElement('div');
        p.textContent = t;
        文.appendChild(p);
    });
    箱.appendChild(文);

    if (今.ある && 今.画面?.length) {
        const 棒 = document.createElement('div');
        棒.className = 'activity-bars';
        const 最大 = 今.画面[0][1] || 1;
        今.画面.forEach(([名, 秒]) => {
            const 行 = document.createElement('div');
            行.className = 'activity-bar-row';

            const ラベル = document.createElement('span');
            ラベル.className = 'activity-bar-label';
            ラベル.textContent = 画面の呼び名[名] || 名;

            const 溝 = document.createElement('span');
            溝.className = 'activity-bar-track';
            const 中 = document.createElement('span');
            中.className = 'activity-bar-fill';
            中.style.width = Math.round((秒 / 最大) * 100) + '%';
            溝.appendChild(中);

            const 値 = document.createElement('small');
            値.textContent = 秒を言葉に(秒);

            行.appendChild(ラベル);
            行.appendChild(溝);
            行.appendChild(値);
            棒.appendChild(行);
        });
        箱.appendChild(棒);
    }

    const 週 = 振り返り(7);
    if (週.ある) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 週の文(週);
        箱.appendChild(p);
    }

    const 並び = document.createElement('div');
    並び.className = 'guard-row';

    const 更新 = document.createElement('button');
    更新.type = 'button';
    更新.className = 'btn btn-sm btn-secondary';
    更新.textContent = '↻ いまの様子を見る';
    更新.addEventListener('click', () => render様子());

    const 忘れる = document.createElement('button');
    忘れる.type = 'button';
    忘れる.className = 'btn btn-sm btn-secondary';
    忘れる.textContent = 'この記録を忘れる';
    忘れる.addEventListener('click', () => {
        if (!confirm('使った時間の記録を消します。よろしいですか。')) return;
        様子を忘れる();
        showNotification('忘れました', 'success');
    });

    並び.appendChild(更新);
    並び.appendChild(忘れる);
    箱.appendChild(並び);

    const 断り = document.createElement('p');
    断り.className = 'hint';
    断り.textContent = '見ているのは「どの画面を、どれだけ開いたか」と「何件足したか」だけです。'
        + '打ち込んだ中身や、このツールの外でしていることは見ていません。'
        + 'カメラもマイクも使いません。記録はこの端末の中だけに残ります。';
    箱.appendChild(断り);
}

function 週の文(週) {
    return 週.文.split('\n')[0];
}

/* ---------- 立ち上げ ---------- */

function init様子() {
    // 画面が切り替わったら記録する。
    // switchPage をそのまま包む。呼び出し元を全部直すと、
    // 直し漏れが必ず出るため、ここで一本化する。
    if (typeof window.switchPage === 'function' && !window.switchPage.__様子つき) {
        const 元 = window.switchPage;
        const 包み = function (名, ...残り) {
            画面が変わった(名);
            return 元.apply(this, [名, ...残り]);
        };
        包み.__様子つき = true;
        window.switchPage = 包み;
    }

    // 閉じるとき・隠れるときにも締める。
    // ここが無いと、最後に開いていた画面のぶんが丸ごと落ちる。
    window.addEventListener('beforeunload', 締める);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) 締める();
        else 入った時刻 = Date.now();
    });

    // いま開いている画面から数え始める
    const 開いている = [...document.querySelectorAll('.page')]
        .find((p) => getComputedStyle(p).display !== 'none');
    if (開いている) 画面が変わった(開いている.id.replace(/-page$/, ''));

    render様子();
}

window.init様子 = init様子;
window.render様子 = render様子;
window.いまの様子 = いまの様子;
window.振り返り = 振り返り;
window.出来事を数える = 出来事を数える;
window.様子を忘れる = 様子を忘れる;
