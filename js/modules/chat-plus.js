/**
 * ＋ボタンの中身（作れるものの一覧）
 *
 * なぜこれが要るのか:
 *   会話だけで作れるようにしたが、
 *   「何が作れるのか」が画面から分からなくなった。
 *   ChatGPT や Claude の＋ボタンのように、
 *   ここを開けば作れるものが並ぶようにする。
 *
 * 考え方:
 *   選ぶと、入力欄に言い方が入る。すぐには送らない。
 *   足りない情報を足してから送れるようにするため。
 *   いきなり送ると、毎回「〇〇を教えてください」から始まってしまう。
 *
 *   ここに並べるのは、本当に作れるものだけにしてある。
 *   作れないものを並べると、それが嘘になる。
 *
 * すべてこの端末の中だけで動く。外部へは一切送らない。
 */

/**
 * 作れるもの。
 *
 * 印   … 一覧に出す記号
 * 名   … 何が作れるか
 * 説明 … どんなときに使うか
 * 例文 … 入力欄に入れる言い方。〇〇のところを直して送ってもらう
 */
const 作れるもの = [
    {
        分類: '文章',
        並び: [
            {
                印: '📝', 名: '商品説明',
                説明: '商品名・素材・価格から、販売ページ用の文を作ります',
                例文: '商品名は〇〇、素材は〇〇、〇〇円 の商品説明を書いて',
            },
            {
                印: '📣', 名: 'SNS投稿文',
                説明: 'Instagram向けの投稿文を作ります',
                例文: 'インスタの投稿文を考えて 商品名は〇〇',
            },
            {
                印: '✉️', 名: '発注メール',
                説明: '工場への発注メールの下書きを作ります',
                例文: '会社名は〇〇、品名は〇〇、〇〇枚 で発注メールを書いて',
            },
            {
                印: '📐', 名: 'テックパックの注記',
                説明: '仕様書に添える注意書きを作ります',
                例文: 'テックパックの注記を書いて 品名は〇〇',
            },
        ],
    },
    {
        分類: '画像',
        並び: [
            {
                印: '🅰️', 名: '文字のロゴ',
                説明: '文字を主役にした図案を作ります',
                例文: '「ARELM」の黒いロゴを作って',
            },
            {
                印: '🎽', 名: 'プリント柄',
                説明: '縞・格子・水玉・迷彩・幾何から選んで作ります',
                例文: '黒い縞のプリント柄を作って',
            },
        ],
    },
    {
        // ひとまとまりの仕事。
        //
        // 一手ずつしか頼めないと思われていると、
        // せっかく代わりに進められるのに使ってもらえない。
        // 選ぶと順番を見せるので、見てから「実行して」と言えばよい。
        分類: 'まとめて任せる（順番を見せてから進みます）',
        並び: [
            {
                印: '🆕', 名: '新しい商品を出す準備',
                説明: '似ていないか調べ、登録し、説明文と投稿文を作り、撮影を予定に入れます',
                例文: '新商品「〇〇」を出す準備をして',
            },
            {
                印: '🏭', 名: '工場へ発注する準備',
                説明: '注記と発注メールの下書きを作り、送ることをやることに入れます',
                例文: '「〇〇」の発注の準備をして',
            },
            {
                印: '🌅', 名: '一日を始める',
                説明: '予定とやることを出し、次にやることを考え、在庫を確かめます',
                例文: '今日の仕事を始めて',
            },
            {
                印: '🌙', 名: '一日を終える',
                説明: '残りを出し、今日のことを書き留め、ツールを点検します',
                例文: '一日を終えて',
            },
            {
                印: '📦', 名: '在庫を整える',
                説明: '残りを出し、値段を見直し、補充をやることに入れます',
                例文: '在庫を整えて',
            },
        ],
    },
    {
        分類: '調べる・実行する',
        並び: [
            {
                印: '🔍', 名: '似ている商品を調べる',
                説明: '過去の商品と似すぎていないかを判定します',
                例文: '〇〇 は似てる？',
            },
            {
                印: '📦', 名: '在庫を見る',
                説明: '登録した商品の残りを出します',
                例文: '在庫を見せて',
            },
            {
                印: '✅', 名: 'やることを追加',
                説明: '思いついた作業をその場で書き留めます',
                例文: 'タスク 〇〇',
            },
            {
                印: '🗒', 名: 'メモを残す',
                説明: '書いた内容を覚え、次から答えに使います',
                例文: 'メモ 〇〇',
            },
            {
                印: '🩺', 名: 'ツールを点検する',
                説明: '異常を調べ、直せるものはその場で直します',
                例文: '点検して',
            },
        ],
    },
];

/** ＋の一覧が開いているか */
let プラスが開いている = false;

function プラス一覧を作る() {
    const 既存 = document.getElementById('chat-plus-menu');
    if (既存) return 既存;

    const 箱 = document.createElement('div');
    箱.id = 'chat-plus-menu';
    箱.className = 'plus-menu';
    箱.hidden = true;

    // --- 添付（もともとの＋の役目） ---
    const 添付 = document.createElement('button');
    添付.type = 'button';
    添付.className = 'plus-item plus-attach';
    添付.innerHTML = '<span class="plus-mark">📎</span>'
        + '<span class="plus-body"><b>画像・資料を添える</b>'
        + '<small>手元のファイルを会話に付けます</small></span>';
    添付.addEventListener('click', () => {
        プラス一覧を閉じる();
        document.getElementById('chat-file-input')?.click();
    });
    箱.appendChild(添付);

    // --- 作れるもの ---
    作れるもの.forEach((組) => {
        const 見出し = document.createElement('div');
        見出し.className = 'plus-head';
        見出し.textContent = 組.分類;
        箱.appendChild(見出し);

        組.並び.forEach((x) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'plus-item';

            const 印 = document.createElement('span');
            印.className = 'plus-mark';
            印.textContent = x.印;

            const 中 = document.createElement('span');
            中.className = 'plus-body';
            const 名 = document.createElement('b');
            名.textContent = x.名;
            const 説 = document.createElement('small');
            説.textContent = x.説明;
            中.appendChild(名);
            中.appendChild(説);

            b.appendChild(印);
            b.appendChild(中);
            b.addEventListener('click', () => 例文を入れる(x.例文));
            箱.appendChild(b);
        });
    });

    const 断り = document.createElement('p');
    断り.className = 'plus-note';
    断り.textContent = 'ここにあるものは、すべて自作で作ります。外部へは一切送りません。'
        + '〇〇の部分を書き換えて送ってください。';
    箱.appendChild(断り);

    document.querySelector('.chat-composer')?.appendChild(箱);
    return 箱;
}

/**
 * 例文を入力欄に入れる。
 *
 * すぐには送らない。
 * 〇〇のところを直してもらう必要があるため、
 * 送ってしまうと毎回「〇〇を教えてください」から始まる。
 *
 * 最初の〇〇を選んだ状態にして、そのまま打ち込めるようにする。
 */
function 例文を入れる(例文) {
    プラス一覧を閉じる();

    const 入力 = document.getElementById('chat-input');
    if (!入力) return;

    入力.value = 例文;
    入力.focus();
    if (typeof autoGrowChatInput === 'function') autoGrowChatInput(入力);

    // 最初の〇〇を選んでおく。そのまま上書きできる。
    const 位置 = 例文.indexOf('〇〇');
    if (位置 >= 0) {
        入力.setSelectionRange(位置, 位置 + 2);
    }
}

function プラス一覧を開く() {
    const 箱 = プラス一覧を作る();
    箱.hidden = false;
    プラスが開いている = true;
    document.querySelector('.composer-icon')?.classList.add('on');
}

function プラス一覧を閉じる() {
    const 箱 = document.getElementById('chat-plus-menu');
    if (箱) 箱.hidden = true;
    プラスが開いている = false;
    document.querySelector('.composer-icon')?.classList.remove('on');
}

function initChatPlus() {
    const 入口 = document.querySelector('label.composer-icon');
    if (!入口) return;

    // もともとは押すとファイル選択が開くだけだった。
    // 一覧を出すため、その動きを止めて置き換える。
    const 新 = document.createElement('button');
    新.type = 'button';
    新.className = 'composer-icon';
    新.id = 'chat-plus-btn';
    新.title = '作れるものを見る';
    新.textContent = '＋';
    入口.replaceWith(新);

    // ファイル選択の入口は、一覧の中から使うので残しておく
    if (!document.getElementById('chat-file-input')) {
        const f = document.createElement('input');
        f.type = 'file';
        f.id = 'chat-file-input';
        f.accept = 'image/*,.pdf,video/*';
        f.multiple = true;
        f.hidden = true;
        新.after(f);
    }

    新.addEventListener('click', (e) => {
        e.stopPropagation();
        プラスが開いている ? プラス一覧を閉じる() : プラス一覧を開く();
    });

    // 外を押したら閉じる
    document.addEventListener('click', (e) => {
        if (!プラスが開いている) return;
        const 箱 = document.getElementById('chat-plus-menu');
        if (箱 && !箱.contains(e.target)) プラス一覧を閉じる();
    });

    // Escでも閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && プラスが開いている) プラス一覧を閉じる();
    });
}

window.initChatPlus = initChatPlus;
window.作れるもの = 作れるもの;
window.プラス一覧を開く = プラス一覧を開く;
window.プラス一覧を閉じる = プラス一覧を閉じる;
