/**
 * 画面を整える ― 詰め込みすぎを畳む
 *
 * なぜこれが要るのか:
 *
 *   ダッシュボードが21節・14万ピクセルになっていた。
 *   画面にすると100枚分。上から下まで見るだけで疲れる。
 *
 *   足すたびに一つずつ長くなり、
 *   いつのまにか「探すのが仕事」の画面になっていた。
 *
 * どうするか:
 *
 *   <b>消さない。</b>
 *   どれも誰かが要ると思って足したもの。
 *   消すと、要るときに無い。
 *
 *   代わりに<b>まとめて畳む</b>。
 *   よく使うものだけ開けておき、あとは見出しの下に隠す。
 *   要るときに開けばよい。
 *
 *   開け閉めは覚えておく。
 *   毎回開き直させるのは、畳んでいないのと同じ。
 *
 * 決め方:
 *   ・開けておくのは4つまで。それ以上は「よく使う」ではない。
 *   ・畳んだ中身は、何が入っているか見出しに書く。
 *     開けてみないと分からないのでは、探せない。
 */

const 畳みの記憶の鍵 = 'areglm_folded';

/** 畳むかどうかの設定 */
const 畳むかの鍵 = 'areglm_fold_on';

/**
 * いま畳む設定になっているか
 *
 * <b>はじめは畳まない。</b>
 *
 * ダッシュボードが14万ピクセルあったので畳んだが、
 * それで<b>見慣れた画面が変わってしまった</b>。
 *
 * 長いのは私が見た問題であって、
 * 使う人にとっては「いつもの場所にいつものものがある」ほうが大事。
 * 見た目を勝手に変えるのは、良くしたつもりでも押しつけになる。
 *
 * 畳みたい人だけが入りにする形にする。
 */
function 畳む設定か() {
    return localStorage.getItem(畳むかの鍵) === 'はい';
}

function 畳む設定を変える(入りか) {
    localStorage.setItem(畳むかの鍵, 入りか ? 'はい' : 'いいえ');
}

/** どの画面で、何を開けておくか */
const 開けておくもの = {
    dashboard: ['まとめて更新', 'エージェントに指示', '今日の提案', 'タスク'],
    mainai: ['指示する', '自動で動く決まり'],
    settings: ['守り', 'いまの様子'],
    sns: ['投稿作成', '出先から投稿する', '成績を見る'],
};

/** 畳むときのまとめ方（画面ごと） */
const まとめ方 = {
    dashboard: [
        { 題: '今日の記録', 中: ['最近の活動', 'メモ', '体調', 'カレンダー'] },
        { 題: '道具', 中: ['タイマー', 'ほしいものリスト', '機能をひらく', 'クイック操作'] },
        { 題: '目標と計画', 中: ['やりたいこと一覧', '目標を分ける', 'ブランドマニュアル'] },
        { 題: 'ツールの様子', 中: ['学習状況', '自己点検', '不要ボックス', 'お知らせ'] },
        { 題: '見た目', 中: ['ツールの馴染み', '画面の見た目'] },
    ],
    mainai: [
        { 題: '育てる', 中: ['新しい作業を覚えさせる', '自分を見て、良くする', '覚えた言い方'] },
        { 題: '調べる', 中: ['分析', '覚えていること'] },
        { 題: '守り', 中: ['引き継ぎと暴走の歯止め', '守っているルール', 'できること'] },
    ],
    settings: [
        { 題: 'データ', 中: ['履歴', 'まとめて取り出す', 'データのバックアップ'] },
        { 題: '外とのやりとり', 中: ['他の端末から使う', '通信先', '外部の道具を置き換える計画',
            'お金がかかる機能'] },
        { 題: '中の仕組み', 中: ['自作AIエンジン', 'セキュリティ', '取引の連絡を見る'] },
        { 題: '見た目と声', 中: ['声と話し方', 'このツールの名前'] },
    ],
    sns: [
        { 題: '参考にする', 中: ['トレンド分析', '投稿戦略ガイド', 'SNS別特性データ'] },
        { 題: '下書き', 中: ['投稿キュー'] },
    ],
};

function 畳みを読む() {
    try {
        const r = JSON.parse(localStorage.getItem(畳みの記憶の鍵) || '{}');
        return (r && typeof r === 'object') ? r : {};
    } catch {
        return {};
    }
}

function 畳みを覚える(鍵, 開いているか) {
    const 記憶 = 畳みを読む();
    記憶[鍵] = 開いているか;
    localStorage.setItem(畳みの記憶の鍵, JSON.stringify(記憶));
}

/** 見出しの文字を、比べやすい形にする */
function 見出しを読む(節) {
    const h = 節.querySelector('h3, h2');
    if (!h) return '';
    return h.innerText.replace(/[\n\s]/g, '').replace(/^[^\wぁ-んァ-ヶ一-龠]+/, '');
}

/**
 * 一つの画面を整える。
 *
 * 何度呼ばれても、同じ結果になるようにしてある。
 * 画面を切り替えるたびに呼ばれるため。
 */
function 画面を整える(画面名) {
    const 頁 = document.getElementById(画面名 + '-page');
    if (!頁) return;

    // すでに整えてあるなら、何もしない
    if (頁.dataset.整えた === 'はい') return;

    // 畳まない設定なら、何もしない。
    // 見慣れた並びのままにしておく。
    if (!畳む設定か()) {
        頁.dataset.整えた = 'はい';
        return;
    }

    // 節の置かれている深さは、画面によって違う。
    //
    // はじめ「直下か一段下」だけを見ていたので、
    // 二段下にある画面（mainai・sns）が畳めていなかった。
    //
    // 深さで決めず、<b>畳みの外にある節を全部</b>拾う。
    // すでに畳んだ中のものは、二重に畳まない。
    const 節たち = [...頁.querySelectorAll('.panel-card')]
        .filter((節) => !節.closest('.page-fold'));
    // 畳むかどうかは、数ではなく<b>まとめ方を決めてあるか</b>で見る。
    //
    // はじめ「8節未満は畳まない」にしていた。
    // だがSNS画面は7節で、そのうち3つは資料。
    // 数が少なくても、毎日見るものと時々見るものは分けたほうがよい。
    //
    // まとめ方を書いていない画面は、そのままにする。
    // 決めていないものを勝手に畳むと、どこへ行ったか分からなくなる。
    if (!まとめ方[画面名] || 節たち.length < 4) {
        頁.dataset.整えた = 'はい';
        return;
    }

    const 開ける = 開けておくもの[画面名] || [];
    const 組たち = まとめ方[画面名] || [];
    const 記憶 = 畳みを読む();

    組たち.forEach((組) => {
        // この組に入る節を集める
        const 入る = 節たち.filter((節) => {
            const 見 = 見出しを読む(節);
            return 見 && 組.中.some((名) => 見.includes(名));
        });
        if (!入る.length) return;

        // 畳む入れ物を作る
        const 畳み = document.createElement('details');
        畳み.className = 'page-fold';
        const 鍵 = 画面名 + ':' + 組.題;
        畳み.open = 記憶[鍵] === true;

        const 頭 = document.createElement('summary');

        const 題 = document.createElement('b');
        題.textContent = 組.題;
        頭.appendChild(題);

        // 中に何があるかを見出しに書く。
        // 開けてみないと分からないのでは、探せない。
        const 中身 = document.createElement('small');
        中身.textContent = 入る.map((節) => 見出しを読む(節)).join(' / ');
        頭.appendChild(中身);

        畳み.appendChild(頭);

        // 最初の節があった場所に置く
        入る[0].parentNode.insertBefore(畳み, 入る[0]);
        入る.forEach((節) => 畳み.appendChild(節));

        畳み.addEventListener('toggle', () => {
            畳みを覚える(鍵, 畳み.open);

            // 開いたときに、中身を描き直す。
            //
            // <b>畳んだせいで中身が空になっていた。</b>
            //
            // 描く仕組みの多くは「画面が見えているか」を見て働くので、
            // 畳んだ中にあると、一度も描かれないまま終わっていた。
            // 整えたつもりが、機能を止めていたことになる。
            if (畳み.open) 中身を描き直す(畳み);
        });
    });

    // 開けておくものを、上へ持ち上げる。
    //
    // それぞれの節が入っている入れ物の中で持ち上げる。
    // 別の入れ物へ動かすと、並びが崩れる画面がある。
    if (開ける.length) {
        [...開ける].reverse().forEach((名) => {
            const 節 = 節たち.find((x) => 見出しを読む(x).includes(名));
            if (節 && 節.parentNode && !節.closest('.page-fold')) {
                節.parentNode.insertBefore(節, 節.parentNode.firstChild);
            }
        });
    }

    頁.dataset.整えた = 'はい';
}

/**
 * 畳みの中の、描く仕組みを呼ぶ。
 *
 * どの箱を誰が描くかは、名前で決まっている。
 * 一覧にして持っておき、開いたときに呼ぶ。
 *
 * 一つ失敗しても、他は描く。
 * 一つのために全部が空になるほうが困る。
 */
const 描く仕組み = {
    // 名前は、実際にあるものだけを書く。
    //
    // はじめ、ありそうな名前を推測で書いていた。
    // 12個が実在せず、呼ばれないまま空で残っていた。
    // しかも呼んでも何も起きないので、間違いに気づけない。
    //
    // 推測で書くくらいなら、書かないほうがよい。
    'learning-status': ['renderLearningStatus'],
    'memo-list': ['renderMemoList'],
    'calendar-grid': ['renderCalendar'],
    'self-check-summary': ['selfCheckRun'],
    'health-status': ['renderHealth'],
    'local-ai-status': ['renderLocalAiStatus'],
    'snapshot-info': ['initBackup'],
    'backup-status': ['initBackup'],
    'sns-strategy-guide': ['renderSnsStrategyGuide'],
    'sns-platform-data': ['renderSnsPlatformData'],
    'voice-growth': ['render育ち具合'],
    'voice-check': ['render声の診断'],
    'brand-list': ['renderブランド整理', 'loadBrandsData'],
    'history-list': ['renderHistory'],
    'replace-plan': ['render置き換え計画'],
};

function 中身を描き直す(畳み) {
    畳み.querySelectorAll('[id]').forEach((箱) => {
        const 名たち = 描く仕組み[箱.id];
        if (!名たち) return;
        if (箱.innerText.trim()) return;      // すでに描けている

        for (const 名 of 名たち) {
            if (typeof window[名] === 'function') {
                try {
                    window[名]();
                    break;
                } catch (e) {
                    // 一つ失敗しても、他の箱は描く。
                    console.warn(`${名} が描けませんでした:`, e.message);
                }
            }
        }
    });
}

/** 全部の画面を整える */
function 画面を全部整える() {
    ['dashboard', 'mainai', 'settings', 'sns'].forEach(画面を整える);
}

/**
 * 畳むかどうかを選ぶ欄
 *
 * 勝手に変えず、選べるようにしておく。
 */
function render画面の並べ方() {
    const 箱 = document.getElementById('page-layout');
    if (!箱) return;

    箱.innerHTML = '';

    const 説 = document.createElement('p');
    説.className = 'hint';
    説.textContent = 'ホーム・エージェント・設定・SNSの画面で、'
        + 'あまり使わない節をまとめて畳めます。'
        + '畳むと短くなりますが、見慣れた並びは変わります。';
    箱.appendChild(説);

    const 行 = document.createElement('label');
    行.className = 'auto-switch';
    const 印 = document.createElement('input');
    印.type = 'checkbox';
    印.checked = 畳む設定か();
    印.addEventListener('change', () => {
        畳む設定を変える(印.checked);
        showNotification(
            印.checked
                ? '畳むようにしました。画面を読み込み直します。'
                : '畳まないようにしました。元の並びに戻します。',
            'success');
        // 畳みを入れたり外したりは、描き直さないと反映されない
        setTimeout(() => location.reload(), 900);
    });
    行.appendChild(印);
    const 文 = document.createElement('span');
    文.textContent = '使わない節をまとめて畳む';
    行.appendChild(文);
    箱.appendChild(行);

    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>はじめは畳みません。</b>'
        + 'ホームが14万ピクセルあったので一度畳みましたが、'
        + 'それで見慣れた画面が変わってしまいました。<br>'
        + '長いのはこちらが見た問題であって、'
        + '使う人にとっては<b>いつもの場所にいつものものがある</b>ほうが大事です。'
        + '見た目を勝手に変えるのは、良くしたつもりでも押しつけになります。';
    箱.appendChild(断り);
}

function init画面を整える() {
    if (document.getElementById('page-layout')) render画面の並べ方();

    画面を全部整える();

    // 画面を切り替えたときも整える。
    // あとから中身が増える画面があるため。
    if (typeof switchPage === 'function' && !window._整える割り込み済み) {
        const 元 = window.switchPage;
        window.switchPage = function (...引数) {
            const r = 元.apply(this, 引数);
            setTimeout(() => 画面を整える(引数[0]), 300);
            return r;
        };
        window._整える割り込み済み = true;
    }
}

window.init画面を整える = init画面を整える;
window.畳む設定か = 畳む設定か;
window.畳む設定を変える = 畳む設定を変える;
window.render画面の並べ方 = render画面の並べ方;
window.画面を整える = 画面を整える;
window.画面を全部整える = 画面を全部整える;
