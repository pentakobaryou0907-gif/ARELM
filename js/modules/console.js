/**
 * エージェント機能（コマンドコンソール）
 *
 * 話しかけるか打ち込むだけで、ツール内の操作を代わりに実行する。
 * 完全にこの端末内で完結し、外部サービスへは一切送信しない。
 * 音声認識はブラウザ標準の Web Speech API（無料・追加インストール不要）を使う。
 *
 * ルール（このコンソールが必ず守るもの）:
 *  - 外部への公開・送信は行わない
 *  - データを削除する操作は必ず確認を取る
 *  - 解釈できない指示は実行せず、候補を提示する
 */

const AREGLM_CONSOLE_RULES = [
    '外部への公開・送信は行いません',
    'データを削除する操作は必ず確認します',
    '解釈できない指示は実行せず候補を出します'
];

let consoleRecognition = null;
let consoleListening = false;

/** 実行できるコマンド定義。keywords のいずれかを含めば発火する。 */
const AREGLM_COMMANDS = [
    {
        id: 'goto-home',
        keywords: ['ホーム', 'ダッシュボード', 'トップ'],
        label: 'ホームを開く',
        run: () => goToPageByName('dashboard')
    },
    {
        id: 'goto-chat',
        keywords: ['チャット', 'AI', 'えーあい'],
        label: 'AIチャットを開く',
        run: () => goToPageByName('chat')
    },
    {
        id: 'goto-brands',
        keywords: ['ブランド'],
        label: 'ブランドを開く',
        run: () => goToPageByName('brands')
    },
    {
        id: 'goto-sns',
        keywords: ['SNS', 'エスエヌエス', '投稿', 'とうこう'],
        label: 'SNSを開く',
        run: () => goToPageByName('sns')
    },
    {
        id: 'goto-inventory',
        keywords: ['在庫', 'ざいこ', '売上', 'うりあげ', '商品一覧'],
        label: '在庫・売上を開く',
        run: () => goToPageByName('inventory')
    },
    {
        id: 'goto-studio',
        keywords: ['開発', 'かいはつ', '商品開発', 'デザイン'],
        label: '商品開発を開く',
        run: () => goToPageByName('studio')
    },
    {
        id: 'create-product',
        keywords: ['商品を作って', '新商品を作って'],
        label: '商品を自動で作る（商品名・デザイン画像・SUZURI登録まで）',
        needsArg: true,
        run: (arg, target) => {
            if (typeof 商品を自動で作る !== 'function') {
                return '商品の自動作成の仕組みが読み込まれていません。';
            }
            // 非同期の途中経過（appendConsoleLine）は関数の中で自分で出す。
            // ここでは Promise をそのまま返し、呼び出し元に最後の一言だけ待たせる。
            return 商品を自動で作る(arg, target);
        }
    },
    {
        id: 'remote-task',
        keywords: ['パソコンを操作して', 'パソコンで', '代わりにやって', 'かわりにやって', '自動で作業して'],
        label: 'パソコンを自動で操作する（遠隔操作画面の「自動操作」で実行・安全な操作だけに限定）',
        needsArg: true,
        // JARVISモード（#mainai-form）を含む、この会話コマンド経由のどこからでも
        // 呼べるようにする。実際にどこまで安全か・座標を当てずっぽうに押さないか、
        // といった線引きは server/ai/リモート作業.py 側にすでにあるので、
        // ここでは「遠隔操作画面を開いて、その仕組みに目的を渡す」だけをする
        // （新しい実行経路を作らず、既にある1本の道にそのまま乗せる）。
        run: (arg) => {
            if (!arg) return '何をしてほしいか教えてください（例:「パソコンを操作してChromeでSUZURIを開いて」）';
            if (typeof switchPage !== 'function') return '画面の切り替えの仕組みが読み込まれていません。';
            switchPage('remote');
            setTimeout(() => {
                document.querySelector('[data-remote-tab="auto"]')?.click();
                const 入力 = document.getElementById('remote-auto-goal');
                const form = document.getElementById('remote-auto-form');
                if (入力) 入力.value = arg;
                if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }, 100);
            return `パソコンの操作を始めます。遠隔操作画面で進み具合を見られます: ${arg}`;
        }
    },
    {
        id: 'advisor-today',
        keywords: ['大事なことを教えて', '今日の優先順位', '今日やるべきこと', '優先順位を教えて', '今日は何からやればいい'],
        label: '今の状況（在庫・SNS・タスク等）から、今日いちばん大事なことを3つだけ選んでもらう',
        run: async () => {
            // 新しく数字を作らず、既にある「今日の状況」（reportTodayStatus）を
            // そのままAIへ渡す。ここで判断材料を作り替えることはしない。
            const 状況 = typeof reportTodayStatus === 'function' ? reportTodayStatus() : '';
            if (!状況) return '今の状況を読み取れませんでした。';
            try {
                const r = await fetch('/api/advisor/today', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 状況 }),
                }).then((y) => y.json());
                if (!r.ok) return r.訳 || '選べませんでした。';
                return `今日、大事なことを選びました:\n${r['答え']}`;
            } catch (e) {
                return 'つながりませんでした: ' + e.message;
            }
        }
    },
    {
        id: 'gmail-unread',
        keywords: ['メールを確認して', '受信箱を見せて', 'メールをチェック', '未読メール'],
        label: 'Gmailの未読メール（差出人・件名だけ）を確認する',
        run: async () => {
            if (!window.AReGLM_GOOGLE_OAUTH || !window.AReGLM_GMAIL) {
                return 'Gmail連携の仕組みが読み込まれていません。';
            }
            if (!(await AReGLM_GOOGLE_OAUTH.isConnected())) {
                return 'Googleと連携していません。設定（⚙）の「Google連携」からログインしてください。';
            }
            try {
                const 一覧 = await AReGLM_GMAIL.未読を読む(8);
                if (!一覧.length) return '未読メールはありません。';
                const 行たち = 一覧.map((m, i) => `${i + 1}. ${m.差出人.replace(/<.*>/, '').trim()}／${m.件名}`);
                return `未読メールが${一覧.length}件あります:\n${行たち.join('\n')}`;
            } catch (e) {
                return 'メールを取れませんでした: ' + e.message;
            }
        }
    },
    {
        id: 'add-memo',
        keywords: ['メモ'],
        label: 'メモを追加',
        needsArg: true,
        // 「メモ ○○」という言い方は曖昧さが無いので、ローカルLLMの判定
        // （数秒〜十数秒）を待たずに即実行してよい（ステップ1.5で使う）。
        高速一致: true,
        run: (arg) => {
            if (!arg) return 'メモの内容を教えてください（例:「メモ 新作の生地を探す」）';
            const memos = JSON.parse(localStorage.getItem('areglm_memos') || '[]');
            memos.unshift({ id: 'memo_' + Date.now(), title: '', body: arg, pinned: false, createdAt: new Date().toISOString() });
            localStorage.setItem('areglm_memos', JSON.stringify(memos));
            if (typeof renderMemoList === 'function') renderMemoList();
            return `メモに追加しました:「${arg}」`;
        }
    },
    {
        id: 'add-task',
        keywords: ['タスク', 'やること', '予定', 'よてい'],
        label: 'タスクを追加',
        needsArg: true,
        // 「タスク ○○」という言い方は曖昧さが無いので、ローカルLLMの判定
        // （数秒〜十数秒）を待たずに即実行してよい（ステップ1.5で使う）。
        高速一致: true,
        run: (arg) => {
            if (!arg) return 'タスクの内容を教えてください（例:「タスク サンプル発注」）';
            const tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
            tasks.push({
                id: 'task_' + Date.now(),
                title: arg,
                due: '',
                priority: 'normal',
                done: false,
                createdAt: new Date().toISOString()
            });
            localStorage.setItem('areglm_tasks', JSON.stringify(tasks));
            if (typeof renderTaskList === 'function') renderTaskList();
            return `タスクに追加しました:「${arg}」`;
        }
    },
    {
        id: 'today',
        keywords: ['今日', 'きょう', '状況', 'じょうきょう', 'いまの', 'おはよう', 'おはようございます'],
        label: '今日の状況を報告',
        run: () => reportTodayStatus()
    },
    {
        id: 'refresh',
        keywords: ['更新', 'こうしん', 'リフレッシュ', '同期', 'どうき'],
        label: '全データを更新',
        run: () => {
            if (typeof refreshAllData === 'function') refreshAllData();
            return '全データを更新しました';
        }
    },
    {
        id: 'backup',
        keywords: ['バックアップ', '保存', 'ほぞん', '書き出し'],
        label: 'バックアップを書き出す',
        run: () => {
            if (typeof exportBackup === 'function') {
                exportBackup();
                return 'バックアップを書き出しました';
            }
            return 'バックアップ機能を読み込めませんでした';
        }
    },
    {
        id: 'ask',
        keywords: ['これは何', 'なにこれ', '判定', 'はんてい', '分類', '調べて'],
        label: '内容を判定する（確実か推測かを明示）',
        needsArg: true,
        run: async (arg) => {
            if (!window.AReGLM_LOCAL_AI) return '自作AIエンジンが読み込まれていません';
            if (!arg) return '判定したい内容を教えてください（例:「判定 デニムの新作を作る」）';

            const a = await AReGLM_LOCAL_AI.answer(arg);
            if (!a) return '判定できませんでした（エンジンが停止している可能性があります）';

            let out = `【${a.label}】${a.message}`;
            if (a.basis?.length) {
                out += '\n根拠: ' + a.basis.map((b) => `${b.term}(${b.count}回)`).join('、');
            }
            return out;
        }
    },
    {
        id: 'forget',
        keywords: ['忘れて', 'わすれて', '忘れろ', '削除して学習'],
        label: '学習内容を忘れる',
        needsArg: true,
        run: async (arg) => {
            if (!window.AReGLM_LOCAL_AI) return '自作AIエンジンが読み込まれていません';
            if (!arg) {
                return '何を忘れればよいか教えてください（例:「忘れて ヒミツブランド」）。' +
                    '\n※「忘れて 全部」と言うとすべての学習内容を消します。';
            }

            const all = /^(全部|すべて|全て|ぜんぶ)$/.test(arg);
            if (all && !confirm('学習した内容をすべて消します。元に戻せません。よろしいですか？')) {
                return '取り消しました';
            }

            const result = await AReGLM_LOCAL_AI.forget(all ? { all: true } : { term: arg });
            if (!result) return '忘却に失敗しました（エンジンが停止している可能性があります）';
            if (result.forgotten === false) return result.reason || '該当する学習内容がありませんでした';

            if (all) return 'すべての学習内容を消しました。';
            const removed = (result.removed || []).length;
            return `「${arg}」を学習内容から消しました（関連する${removed}語を削除）。`;
        }
    },
    {
        id: 'help',
        keywords: ['ヘルプ', 'できること', '使い方', '何ができる'],
        label: 'できることを表示',
        run: () => showConsoleHelp()
    }
];

function initConsole() {
    document.getElementById('console-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('console-input');
        const text = input?.value?.trim();
        if (!text) return;
        runConsoleCommand(text);
        if (input) input.value = '';
    });

    document.getElementById('console-mic-btn')?.addEventListener('click', toggleConsoleMic);

    renderConsoleRules();
    appendConsoleLine('assistant', 'こんにちは。指示を入力するか、マイクで話しかけてください。「できること」と入力すると一覧を出します。');
}

/**
 * どの画面を開いていても話しかけられる、常駐のエージェント。
 *
 * 「エージェント」画面（◈アイコン）を開いているときしか
 * 指示を受け付けなかったのが、「他の画面を開いていても反応しない」の原因だった。
 * #main-app 直下（.page-content の外）に置いてあるので、
 * どのページに切り替えても消えずに残る。
 */
function initFloatingAgent() {
    const 根 = document.getElementById('floating-agent');
    if (!根 || 根.dataset.配線済み) return;
    根.dataset.配線済み = '1';

    const 開く = () => {
        根.classList.remove('collapsed');
        document.getElementById('floating-agent-input')?.focus();
    };
    const 閉じる = () => {
        根.classList.add('collapsed');
        // マイクが入ったまま閉じられたら、そのまま打ち切る。
        // 続けていると、あとで拾った物音が指示として処理されてしまう。
        録音中ならすべて打ち切る();
    };

    document.getElementById('floating-agent-toggle')?.addEventListener('click', 開く);
    document.getElementById('floating-agent-close')?.addEventListener('click', 閉じる);

    document.getElementById('floating-agent-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('floating-agent-input');
        const text = input?.value?.trim();
        if (!text) return;
        runConsoleCommand(text, 'floating');
        if (input) input.value = '';
    });

    document.getElementById('floating-agent-mic-btn')?.addEventListener('click', () => toggleConsoleMic('floating'));

    appendConsoleLine('assistant', 'どの画面からでも話しかけられます。', 'floating');
}

function renderConsoleRules() {
    const box = document.getElementById('console-rules');
    if (!box) return;
    box.innerHTML = AREGLM_CONSOLE_RULES.map((r) => `<li>${AReGLM_SECURITY.sanitizeHtml(r)}</li>`).join('');
}

/**
 * 表記ゆれを吸収するゆるい正規化。
 * ひらがな→カタカナ、長音・促音・小書き文字・濁点を落として比較する。
 * 「ざいこ」「ザイコ」「在庫」の打ち間違いを同じものとして扱うため。
 */
function looseNormalize(s) {
    if (!s) return '';
    let t = s.normalize('NFKC').toLowerCase();
    // ひらがな → カタカナ
    t = t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
    // 濁点・半濁点を除去
    t = t.normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC');
    // 揺れやすい文字を除去
    return t.replace(/[ーッャュョァィゥェォヮ・･\s\-_]/g, '');
}

/** 編集距離（動的計画法・2行のみ保持） */
function editDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
    for (let i = 1; i <= b.length; i++) {
        const cur = [i];
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[a.length];
}

/** 0〜1 の一致度。表記ゆれを吸収した比較も行い、高い方を採用する。 */
function fuzzyRatio(a, b) {
    const direct = a && b ? 1 - editDistance(a, b) / Math.max(a.length, b.length) : 0;
    const na = looseNormalize(a);
    const nb = looseNormalize(b);
    const loose = na && nb ? 1 - editDistance(na, nb) / Math.max(na.length, nb.length) : 0;
    return Math.max(direct, loose);
}

/**
 * 指示文からコマンドを判定して実行する。
 * まず語がそのまま含まれるかを見て、無ければ誤字を考慮して探す。
 */
/**
 * AIが聞き返している最中かどうか。
 *
 * 「商品を登録したい」→「名前は？」→「黒パーカー」と答えたとき、
 * 「黒パーカー」を操作命令として解釈しようとして、
 * 会話が途切れていた。
 * 聞き返しの最中は、迷わず会話へ回す。
 */
let 会話の続き待ち = false;

/**
 * 直前の入力が、声によるものだったか。
 *
 * 打ち込んだ指示にまで声で返していたため、
 * 黙っているべき場面でしゃべり出していた。
 * 声で話しかけられたときだけ、声で返す。
 */
let 声で聞かれた = false;


/**
 * まとめての仕事の見分け方（AI側から受け取る）
 *
 * なぜ受け取るのか:
 *   ここでは「在庫」などの言葉を見て、先に画面操作へ振り分けている。
 *   そのせいで「在庫を整えて」が、ただ在庫画面を開くだけになり、
 *   段取り（残りを出し、値段を見直し、補充をやることに入れる）まで
 *   届いていなかった。
 *
 *   同じ言葉の並びをここにも書き写すと、
 *   片方を直したときにもう片方が古いまま残る。
 *   だから、AI側にあるものをそのまま受け取って使う。
 */
let 段取りの見分け = null;

async function 段取りの見分けを読む() {
    if (段取りの見分け) return 段取りの見分け;
    try {
        const r = await fetch('/api/ai-local/plans', { cache: 'no-store' });
        if (r.ok) 段取りの見分け = await r.json();
    } catch {
        // 読めなくても、ふつうの操作は動く。ここで止めない。
    }
    return 段取りの見分け;
}

/**
 * この文は、まとめての仕事として頼まれているか。
 *
 * 読めていないときは false を返す。
 * 判断がつかないのに段取りへ回すと、
 * ただ画面を開きたいだけのときに手順が並んでしまう。
 */
function まとめての仕事か(text) {
    const 見 = 段取りの見分け;
    if (!見 || !見.plans) return false;

    const t = (text || '').trim().replace(/[。 　]+$/, '');
    if (!t) return false;

    // 問いかけには反応しない。
    // 「在庫を整えますか」に手順が並んだら、押しつけになる。
    if (見.questionEndings.some((e) => t.endsWith(e))) return false;

    const 頼まれている = 見.requestWords.some((w) => t.includes(w))
        || 見.requestEndings.some((e) => t.endsWith(e));
    if (!頼まれている) return false;

    const 低 = t.toLowerCase();
    return 見.plans.some((p) => p.words.some((w) => 低.includes(w)));
}

/**
 * 直近のやり取り（LLMに文脈として渡す用）。
 * target（console / mainai / floating）ごとに分けて持つ。長話で肥大しないよう直近だけ残す。
 */
const 会話の記憶 = { console: [], mainai: [], floating: [] };

function 会話の記憶に足す(target, role, text) {
    const key = CONSOLE_TARGET_IDS[target] ? target : 'console';
    会話の記憶[key].push({ role, text });
    会話の記憶[key] = 会話の記憶[key].slice(-8);
}

/**
 * ありふれた挨拶なら、決まった返事を返す（LLMには渡さない）。
 * 一致しなければ null を返し、通常の判定に進ませる。
 */
function 挨拶を拾う(text) {
    const 文 = text.trim().replace(/[！!。、,.\s]+$/g, '');
    const 対応 = [
        [/^(こんにちは|こんにちわ)$/, 'こんにちは。ご用件をどうぞ。'],
        [/^(おはよう(ございます)?)$/, 'おはようございます。'],
        [/^(こんばんは|こんばんわ)$/, 'こんばんは。ご用件をどうぞ。'],
        [/^(やあ|よう|はじめまして)$/, 'こんにちは。よろしくお願いします。'],
        [/^(お疲れ(さま|様)(です)?|おつかれ(さま)?)$/, 'お疲れさまです。'],
        [/^(ありがとう(ございます)?|ありがと)$/, 'いえいえ、どういたしまして。'],
    ];
    for (const [正規, 返事] of 対応) {
        if (正規.test(文)) return 返事;
    }
    return null;
}

async function runConsoleCommand(text, target) {
    appendConsoleLine('user', text, target);
    会話の記憶に足す(target, 'user', text);

    // 聞き返しへの返事は、命令として解釈しない。
    // ここを飛ばすと「パーカー」が操作名に化けてしまう。
    if (会話の続き待ち) {
        const 続いた = await tryConversation(text, target);
        if (続いた) return;
        // 会話として受け取れなければ、続き待ちを解いて通常の扱いに戻す
        会話の続き待ち = false;
    }

    // マルチエージェント化 第2段: 「バックグラウンドで／裏で」と言われたら、
    // その場では答えず、キューに積んで裏で進める（並行実行）。
    // 聞き返しの継続応答を横取りしないよう、上のチェックより後に置く。
    if (typeof 背景実行の指示を拾う === 'function') {
        const 背景内容 = 背景実行の指示を拾う(text);
        if (背景内容 && typeof 作業を頼む === 'function') {
            const agentId = typeof 現在のページからエージェントを推定 === 'function'
                ? 現在のページからエージェントを推定() : null;
            const task = await 作業を頼む(背景内容, agentId);
            const 返事 = task
                ? '承知しました。裏で進めます。進み具合は🔄マークから確認できます。'
                : '裏での作業を受け付けられませんでした。もう一度お試しください。';
            appendConsoleLine('assistant', 返事, target);
            会話の記憶に足す(target, 'assistant', 返事);
            if (声で聞かれた && typeof speakBack === 'function') speakBack(返事);
            声で聞かれた = false;
            return;
        }
    }

    // 0) まとめての仕事として頼まれていないか。
    //
    // 画面操作の振り分けより先に見る。
    // あとに置いたところ、「在庫を整えて」が「在庫」に引っかかって
    // ただ在庫画面を開くだけで終わり、段取りまで届かなかった。
    await 段取りの見分けを読む();
    if (まとめての仕事か(text)) {
        const 受けた = await tryConversation(text, target);
        if (受けた) return;
        // 会話として受け取れなければ、ふつうの振り分けに戻す
    }

    // 1) 打ち込んだ文が、キーワードとぴったり同じか。
    //
    // 以前は「文の中にキーワードが含まれているか」で見ていたが、
    // 「今日」のようなありふれた言葉がキーワードにあると、
    // 「疲れたなあ、今日は寒いね」のような世間話まで
    // 「今日の状況」コマンドとして誤発火していた。
    //
    // ぴったり同じ言葉を打った・ボタンを押したときだけ即座に動かし、
    // 文になっているものはローカルLLMの判定（ステップ3）に任せる。
    const 入力そのまま = text.trim();
    let matched = AREGLM_COMMANDS.find((c) => c.keywords.some((k) => 入力そのまま === k));
    let corrected = null;

    // 1.5) 「キーワード ＋ 空白 ＋ 続き」の形も、曖昧さが無いものだけ
    // （高速一致: true を付けたコマンドだけ）即座に拾う。
    //
    // なぜ要るのか: ステップ1の「ぴったり同じ」判定は、キーワード単体で
    // 打ったとき（「メモ」だけ）にしか当たらない。「メモ 生地を注文する」の
    // ような最も多い言い方は、これまで全部ステップ3のローカルLLM判定
    // （ローカルLLMの起動状況によっては数秒〜数十秒）に回っていて、
    // 「指示したのに何も起きない」ように感じられていた。
    //
    // 「今日」のような一般的な単語で誤発火した過去の不具合（コメント参照）を
    // 繰り返さないよう、対象は明示的に「高速一致: true」を付けた、
    // 動詞的で紛れの無いコマンドだけに絞ってある。
    if (!matched) {
        for (const c of AREGLM_COMMANDS) {
            if (!c.高速一致) continue;
            const 当たり = c.keywords.find((k) => {
                if (!入力そのまま.startsWith(k)) return false;
                const 続き = 入力そのまま.slice(k.length);
                return 続き.length > 0 && /^[\s　:：、,]/.test(続き);
            });
            if (当たり) { matched = c; break; }
        }
    }

    // 2) 以前「これはこの操作だ」と教えてもらった言い方なら、それを使う
    if (!matched) {
        const learned = lookupLearnedPhrase(text);
        if (learned) {
            matched = AREGLM_COMMANDS.find((c) => c.id === learned.commandId);
            if (matched) corrected = `覚えた言い方（${learned.phrase}）`;
        }
    }

    // 2.5) 簡単な挨拶は、LLMに判定させずここで即座に返す。
    //
    // 実際に「こんにちは」と話しかけたら、LLMが「ホームを開く」という
    // 操作だと誤って判定し、無言でダッシュボードへ飛んでしまう不具合が
    // 見つかった（挨拶をLLMに渡すと、たまに見当違いの操作に化ける）。
    // 挨拶は種類も言い方も限られているので、判定に迷う必要が無い。
    if (!matched) {
        const 挨拶 = 挨拶を拾う(text);
        if (挨拶) {
            appendConsoleLine('assistant', 挨拶, target);
            会話の記憶に足す(target, 'assistant', 挨拶);
            if (声で聞かれた && typeof speakBack === 'function') speakBack(挨拶);
            声で聞かれた = false;
            return;
        }
    }

    // 3) ここまでで決まらなければ、ローカルLLMに意図を判定してもらう。
    //
    // 以前はここで「誤字を編集距離で拾う」処理をしていたが、
    // 短いキーワードほど無関係な長文の中の部分にも高いスコアで
    // 引っかかりやすく、見当違いの操作に化けることがあった。
    // 文字のあいまい一致ではなく、文の意味を読ませたほうが確か。
    if (!matched) {
        const 考え中 = document.createElement('div');
        考え中.className = 'console-thinking';
        考え中.textContent = '（考えています…）';
        const box = document.getElementById((CONSOLE_TARGET_IDS[target] || CONSOLE_TARGET_IDS.console).log);
        if (box) { box.appendChild(考え中); box.scrollTop = box.scrollHeight; }

        const 判定 = await AIで意図を判定する(text, target);
        考え中.remove();

        if (判定 && 判定.ok) {
            if (判定.操作id) {
                matched = AREGLM_COMMANDS.find((c) => c.id === 判定.操作id);
                if (matched) {
                    await 判定した操作を実行する(matched, 判定.材料 || '', text, target);
                    return;
                }
            } else if (判定.会話の返事) {
                appendConsoleLine('assistant', 判定.会話の返事, target, 判定.agent);
                会話の記憶に足す(target, 'assistant', 判定.会話の返事);
                if (声で聞かれた && typeof speakBack === 'function') {
                    speakBack(判定.会話の返事.split('\n')[0]);
                }
                声で聞かれた = false;
                if (window.AReGLM_LOCAL_AI) AReGLM_LOCAL_AI.learn(text, 'chat:user');
                return;
            }
        }

        // ローカルLLMが止まっている等で判定できなかったときは、
        // 従来の会話エンジン（chat_engine）を最後の手段として試す。
        const answered = await tryConversation(text, target);
        if (answered) return;
        askWhatYouMeant(text, target);
        return;
    }

    if (corrected) {
        appendConsoleLine('assistant', `「${corrected}」のことだと解釈しました。`, target);
    }

    // キーワードを取り除いた残りを引数として渡す。
    // 本文中の助詞は消さない（「生地を探す」が壊れるため）。
    // 取り除くのは先頭・末尾に残った助詞や記号だけにする。
    let arg = text;
    matched.keywords.forEach((k) => {
        arg = arg.split(k).join(' ');
    });
    arg = arg
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[はがをにへとで、。・･:：]+\s*/, '')
        // 「メモを追加 〜」「タスクに登録 〜」のような動詞が先頭に残った場合も落とす
        .replace(/^(追加|登録|作成|作って|入れて|して)\s*/, '')
        .replace(/^[はがをにへとで、。・･:：]+\s*/, '')
        .replace(/\s*[、。・･]+$/, '')
        .trim();

    await 判定した操作を実行する(matched, arg, text, target);
}

/**
 * 見つかった操作を、実際に動かす。
 *
 * 「そのまま一致」と「ローカルLLMが選んだ」の両方の経路から
 * 同じ形で呼べるよう、実行部分だけをここにまとめてある。
 */
async function 判定した操作を実行する(matched, arg, 元の発言, target) {
    try {
        // run() は同期・非同期どちらもありうるので、Promise なら待ってから表示する。
        // target も渡しておく（進行中の経過を、話しかけた場所に自分で足したい
        // コマンド向け。使わないコマンドは第2引数を無視するだけでよい）。
        const raw = matched.run(matched.needsArg ? arg : undefined, target);
        const result = raw && typeof raw.then === 'function' ? await raw : raw;
        const 文 = result || `${matched.label}を実行しました`;
        appendConsoleLine('assistant', 文, target);
        会話の記憶に足す(target, 'assistant', 文);

        // 指示の言い回しそのものを学習させる。
        // 使い続けるほど、その人の言い方に合うようになる。
        if (window.AReGLM_LOCAL_AI) {
            AReGLM_LOCAL_AI.learn(元の発言, `console:${matched.id}`);
        }

        if (window.logActivity) {
            logActivity(`コンソール: ${matched.label}`, { category: 'console', text: 元の発言 });
        }
    } catch (err) {
        appendConsoleLine('assistant', `実行できませんでした: ${err.message}`, target);
    }
}

/**
 * ローカルLLMに、発言の意図を判定してもらう。
 *
 * 渡すのは実行できる操作の一覧（id・説明・言い方の例）と、
 * 直近の会話だけ。外部へは一切送らない。
 */
async function AIで意図を判定する(text, target) {
    try {
        const 操作たち = AREGLM_COMMANDS.map((c) => ({
            id: c.id, label: c.label, examples: c.keywords, needsArg: !!c.needsArg,
        }));
        const 直近の会話 = 会話の記憶[CONSOLE_TARGET_IDS[target] ? target : 'console'];
        const persona = localStorage.getItem('areglm_ai_persona') || '';
        // マルチエージェント化: 今見ている画面から、専門の担当を選んでもらう。
        const page = document.querySelector('.page.active')?.id?.replace('-page', '') || '';

        // 「脳: Claude」「脳: Gemini」に切り替えているときは、エージェントの
        // 判定そのものをそちらへ頼む（AIチャットの会話だけでなく、指示の
        // 実行判定にも同じ「脳」を使う、という以前からの決定をここにも
        // 反映する）。
        if (typeof Claudeを使うか === 'function' && Claudeを使うか()
            && typeof Claudeでエージェントの意図を判定する === 'function') {
            const 判定 = await Claudeでエージェントの意図を判定する(text, 操作たち, 直近の会話, persona, page);
            if (判定 && 判定.ok) return 判定;
            // 判定できなかったときは、黙って終わらせず自作AIへ回す
            // （エージェントが無言になることを避けるため）。
        }
        if (typeof Geminiを使うか === 'function' && Geminiを使うか()
            && typeof Geminiでエージェントの意図を判定する === 'function') {
            const 判定 = await Geminiでエージェントの意図を判定する(text, 操作たち, 直近の会話, persona, page);
            if (判定 && 判定.ok) return 判定;
            // 判定できなかったときは、黙って終わらせず自作AIへ回す
            // （エージェントが無言になることを避けるため）。
        }

        const r = await fetch('/api/ai-local/agent-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                操作たち,
                直近の会話,
                persona,
                page,
            }),
        });
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    }
}

/**
 * 会話として答えられるか試す。
 *
 * 決まったコマンド以外は聞き返すだけだったので、
 * 「Tシャツの在庫は？」のような普通の言い方に答えられなかった。
 * ここで会話エンジンに渡し、答えられたらそのまま返す。
 *
 * 答えられたときだけ true を返す。
 * 分からないときは false を返し、呼び出し側で操作候補を聞き返す。
 */
async function tryConversation(text, target) {
    if (!window.AReGLM_LOCAL_AI) return false;

    try {
        const res = await fetch('/api/ai-local/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            // 会話の目印。これが無いと毎回「初対面」になり、話が続かない。
            session_id: getSessionId(),
                text,
                context: {
                    today: 今日(),
                    products: JSON.parse(localStorage.getItem('products') || '[]'),
                    tasks: JSON.parse(localStorage.getItem('areglm_tasks') || '[]'),
                    events: JSON.parse(localStorage.getItem('areglm_events') || '[]')
                }
            })
        });
        if (!res.ok) return false;

        const d = await res.json();
        if (!d.answer) return false;

        // 聞き返されている間は、次の入力も会話として送る。
        会話の続き待ち = Boolean(d.waiting);

        // 答えが見つかったときだけ会話として返す。
        // 「分かりません」の場合は、操作候補を聞いたほうが役に立つ。
        if (!d.ok) return false;

        let out = d.answer;
        if (d.sources?.length) out += `\n（根拠: ${d.sources.join('、')}）`;
        appendConsoleLine('assistant', out, target);

        // AIが「これを実行します」と返したときは、実際に行う。
        // ここが無かったため、聞き取れているのに何も起きていなかった。
        // ひとまとまりの仕事として返ってきたときは、一手ずつ進める。
        // run が付いているときだけ動かす。
        // 段取りを見せた段階では動かさない（見てから決めてもらうため）。
        if (d.plan && d.run && typeof 段取りを進める === 'function') {
            await 段取りを進める(d.plan, target);
            return true;
        }

        if (d.action && typeof 指示を実行する === 'function') {
            await 指示を実行する(d, target);
        }

        // 声で話しかけられたときだけ、声で返す。
        //
        // これまでは打ち込んだときにも声を出していたため、
        // 「勝手に話し始める」ように感じられていた。
        // こちらから話し出すのは、呼ばれたときだけにする。
        if (声で聞かれた && typeof speakBack === 'function') {
            speakBack(d.answer.split('\n')[0]);
        }
        声で聞かれた = false;

        if (window.AReGLM_LOCAL_AI) AReGLM_LOCAL_AI.learn(text, 'chat:user');
        return true;
    } catch {
        return false;
    }
}

/* ---------- 覚えた言い方 ---------- */

const AREGLM_PHRASE_KEY = 'areglm_console_phrases';

function loadLearnedPhrases() {
    try {
        return JSON.parse(localStorage.getItem(AREGLM_PHRASE_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveLearnedPhrases(list) {
    localStorage.setItem(AREGLM_PHRASE_KEY, JSON.stringify(list));
}

/**
 * 教えてもらった言い方の中から、近いものを探す。
 * 完全一致でなくても、表記ゆれや多少の違いは吸収する。
 */
function lookupLearnedPhrase(text) {
    const phrases = loadLearnedPhrases();
    if (!phrases.length) return null;

    let best = null;
    let bestScore = 0;
    phrases.forEach((p) => {
        // 覚えた言い方が入力に含まれていれば、それだけで十分な手がかり
        const contains = text.includes(p.phrase) || p.phrase.includes(text);
        const score = contains ? 1 : fuzzyRatio(text, p.phrase);
        if (score > bestScore) {
            bestScore = score;
            best = p;
        }
    });

    return bestScore >= 0.75 ? best : null;
}

/**
 * 分からないときに聞き返す。
 * 勝手に推測して実行すると、間違った操作をしてしまうため。
 * 選んでもらった内容はその場で覚え、次からは短い言葉でも通るようになる。
 */
function askWhatYouMeant(text, target) {
    // 少しでも近いものを候補として出す（当てずっぽうではなく候補提示）
    const nt = looseNormalize(text);
    const scored = AREGLM_COMMANDS.map((c) => {
        let best = 0;
        c.keywords.forEach((k) => {
            const s = fuzzyRatio(nt, looseNormalize(k));
            if (s > best) best = s;
        });
        return { cmd: c, score: best };
    }).sort((a, b) => b.score - a.score);

    // 上位3件を候補にする。加えて「一覧を見る」も出す。
    const candidates = scored.slice(0, 3);

    appendConsoleLine(
        'assistant',
        `「${text}」がどの操作か分かりませんでした。近いものを選んでいただければ、次からこの言い方でも動くように覚えます。`,
        target
    );

    const box = document.getElementById((CONSOLE_TARGET_IDS[target] || CONSOLE_TARGET_IDS.console).log);
    if (!box) return;

    const div = document.createElement('div');
    div.className = 'console-ask';
    div.innerHTML = `<span>もしかして、こちらでしょうか？</span>
        <div class="console-ask-options">
            ${candidates
                .map(
                    (c) =>
                        `<button type="button" data-cmd="${AReGLM_SECURITY.escapeAttr(c.cmd.id)}">${AReGLM_SECURITY.sanitizeHtml(c.cmd.label)}</button>`
                )
                .join('')}
            <button type="button" data-cmd="__help">実行できる操作の一覧を見る</button>
            <button type="button" data-cmd="__none">どれでもない</button>
        </div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;

    div.querySelectorAll('button[data-cmd]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.cmd;
            div.remove();

            if (id === '__none') {
                appendConsoleLine('assistant', '分かりました。覚えずにおきます。別の言い方で教えてください。', target);
                return;
            }
            if (id === '__help') {
                appendConsoleLine('assistant', showConsoleHelp(), target);
                return;
            }

            rememberPhrase(text, id);
            const cmd = AREGLM_COMMANDS.find((c) => c.id === id);
            appendConsoleLine('assistant', `覚えました。次から「${text}」で「${cmd.label}」を実行します。`, target);
            // その場で実行まで済ませる
            runConsoleCommand(text, target);
        });
    });
}

/** 言い方と操作の対応を覚える */
function rememberPhrase(phrase, commandId) {
    const list = loadLearnedPhrases();
    const existing = list.find((p) => p.phrase === phrase);
    if (existing) {
        existing.commandId = commandId;
        existing.count = (existing.count || 1) + 1;
    } else {
        list.push({ phrase, commandId, count: 1, learnedAt: new Date().toISOString() });
    }
    saveLearnedPhrases(list);

    // 自作AIにも「この言い方はこの操作」として学習させる
    if (window.AReGLM_LOCAL_AI) {
        AReGLM_LOCAL_AI.learn(phrase, `console:${commandId}`);
    }
}

function goToPageByName(page) {
    if (typeof window.areglmNavigate === 'function') {
        window.areglmNavigate(page);
        return `${page} を開きました`;
    }
    document.querySelector(`.bottom-nav-item[data-page="${page}"]`)?.click();
    return `${page} を開きました`;
}

/** 今日やるべきことを、ツール内のデータだけからまとめて返す */
function reportTodayStatus() {
    const today = 今日();
    const tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const snsQueue = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
    const memos = JSON.parse(localStorage.getItem('areglm_memos') || '[]');

    const overdue = tasks.filter((t) => !t.done && t.due && t.due < today);
    const dueToday = tasks.filter((t) => !t.done && t.due === today);
    const open = tasks.filter((t) => !t.done);
    const lowStock = products.filter((p) => p.quantity <= (p.reorderLevel || 5));
    const pendingSns = snsQueue.filter((q) => q.status === 'pending');
    // 直近24時間に書いたメモ。「けさ・ゆうべ書いたこと」を朝の報告に含めるため。
    const 一日前 = Date.now() - 24 * 60 * 60 * 1000;
    const 直近メモ = memos.filter((m) => m.createdAt && new Date(m.createdAt).getTime() >= 一日前);

    const lines = [`今日は${new Date().toLocaleDateString('ja-JP')}です。`];
    if (overdue.length) lines.push(`期限切れのタスクが${overdue.length}件あります: ${overdue.slice(0, 3).map((t) => t.title).join('、')}`);
    if (dueToday.length) lines.push(`今日が期限のタスクが${dueToday.length}件あります`);
    lines.push(`未完了のタスクは全部で${open.length}件です`);
    if (lowStock.length) lines.push(`在庫が少ない商品が${lowStock.length}件あります`);
    // 「お客様からの問い合わせの未対応件数」は、貼り付けた質問にその場で
    // 下書きを返すだけの道具（SNSページ「AI受付」）で、溜まった件数を
    // 数えられるデータが無い。無いものを数えたふりはしない。
    if (pendingSns.length) lines.push(`SNSの投稿キューに、まだ出していないものが${pendingSns.length}件あります`);
    if (直近メモ.length) lines.push(`この24時間で書いたメモが${直近メモ.length}件あります`);
    if (!overdue.length && !dueToday.length && !lowStock.length && !pendingSns.length && !直近メモ.length) {
        lines.push('急ぎの用件はありません。');
    }
    return lines.join('\n');
}

function showConsoleHelp() {
    return '実行できる操作:\n' + AREGLM_COMMANDS.map((c) => `・${c.label}（例:「${c.keywords[0]}」）`).join('\n');
}

/** target名 → ログ・マイクボタンのDOM要素id */
const CONSOLE_TARGET_IDS = {
    mainai: { log: 'mainai-log', mic: 'mainai-mic-btn' },
    floating: { log: 'floating-agent-log', mic: 'floating-agent-mic-btn' },
    console: { log: 'console-log', mic: 'console-mic-btn' },
};

function appendConsoleLine(role, text, target, agent) {
    // target を渡すと、その場所のログに出す。省略時はホームのコンソール。
    const ids = CONSOLE_TARGET_IDS[target] || CONSOLE_TARGET_IDS.console;
    const box = document.getElementById(ids.log);
    if (!box) return;
    const div = document.createElement('div');
    div.className = `console-line console-${role}`;
    let html = '';
    // マルチエージェント化: どの担当が答えたか分かるよう、小さく表示する。
    // 画面と話題が食い違って引き継いだときは、引き継ぎ元も添える。
    if (agent?.名) {
        const 引き継ぎ = agent.引き継ぎ元
            ? `<span class="agent-tag-handoff">（${AReGLM_SECURITY.sanitizeHtml(agent.引き継ぎ元.絵 || '')}${AReGLM_SECURITY.sanitizeHtml(agent.引き継ぎ元.名)}から引き継ぎ）</span>`
            : '';
        html += `<div class="agent-tag">${AReGLM_SECURITY.sanitizeHtml(agent.絵 || '')} ${AReGLM_SECURITY.sanitizeHtml(agent.名)}${引き継ぎ}</div>`;
    }
    html += AReGLM_SECURITY.sanitizeHtml(text).replace(/\n/g, '<br>');
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

/* ---------- 音声入力 ---------- */

/**
 * マイクの入口。
 *
 * 端末内だけで完結するWhisper（local-voice.js）が使えるなら、必ずそちらを使う。
 * 外部（Google）へ送るブラウザ標準の音声認識は、使えないときの最後の手段。
 *
 * 以前は、この端末内Whisperの仕組み（端末内で録音を始める・文字にする）が
 * 出来上がっていたのに、実際のマイクボタンからは一度も呼ばれていなかった。
 * ボタンを押すと常にブラウザ標準（外部）の経路だけが動く状態になっていた。
 */
let 録音中のtarget = new Set();

async function toggleConsoleMic(target) {
    if (typeof 端末内認識が使えるか !== 'function') {
        return ブラウザ音声で切り替える(target);
    }

    const btn = document.getElementById((CONSOLE_TARGET_IDS[target] || CONSOLE_TARGET_IDS.console).mic);
    // 元のラベル（「🎤 話す」等、ボタンごとに違う）を、消す前に覚えておく。
    if (btn && !btn.dataset.元のラベル) btn.dataset.元のラベル = btn.textContent;

    // すでに端末内録音の最中なら、止めて文字にする。
    if (録音中のtarget.has(target)) {
        録音中のtarget.delete(target);
        if (btn) { btn.classList.remove('listening'); btn.disabled = true; btn.textContent = '…'; }
        const text = await 端末内で文字にする();
        録音を終えて後始末する(target, btn, text);
        return;
    }

    const 状態 = await 端末内認識が使えるか();
    if (!状態?.使える) {
        // 端末内で認識できないときだけ、外部（ブラウザ標準）を使うかを尋ねる。
        return ブラウザ音声で切り替える(target);
    }

    // 押しっぱなしを忘れたときは、local-voice.js 側が自動で止めて、
    // ここへ結果を返してくる。その場合もボタンの見た目を元に戻す。
    const 始まったか = await 端末内で録音を始める((自動text) => {
        if (録音中のtarget.has(target)) {
            録音中のtarget.delete(target);
            録音を終えて後始末する(target, btn, 自動text);
        }
    });
    if (!始まったか) return;

    録音中のtarget.add(target);
    if (btn) { btn.classList.add('listening'); btn.textContent = '● 聞いています'; }
    appendConsoleLine('assistant', '話してください。もう一度マイクを押すと、そこまでを文字にします（しばらく話さないと自動で止まります）。', target);
}

/** 録音が終わった（自分で止めた・自動で止まった、どちらでも）あとの後始末 */
function 録音を終えて後始末する(target, btn, text) {
    if (btn) {
        btn.disabled = false;
        btn.classList.remove('listening');
        btn.textContent = btn.dataset.元のラベル || btn.textContent;
    }
    if (text) {
        声で聞かれた = true;
        if (typeof 音声のやり取りを記録する === 'function') 音声のやり取りを記録する(text, target);
        runConsoleCommand(text, target);
    }
}

/**
 * 画面を閉じる・離れるときに、録音が続いたままにしない。
 *
 * マイクを押したまま忘れて、ずっと後になって
 * そのとき拾った物音が指示として処理される
 * ＝「話しかけていないのに勝手に反応した」ように見える不具合の一因だった。
 * ここでは文字にせず、そのまま打ち切る（後始末はするが実行はしない）。
 */
function 録音中ならすべて打ち切る() {
    if (!録音中のtarget.size) return;
    if (typeof 端末内の録音を打ち切る === 'function') 端末内の録音を打ち切る();
    録音中のtarget.forEach((target) => {
        const btn = document.getElementById((CONSOLE_TARGET_IDS[target] || CONSOLE_TARGET_IDS.console).mic);
        if (btn) {
            btn.classList.remove('listening');
            btn.textContent = btn.dataset.元のラベル || btn.textContent;
        }
    });
    録音中のtarget.clear();
}

/** ブラウザ標準（Web Speech API）での音声入力。Chromeでは音声がGoogleへ送られる。 */
function ブラウザ音声で切り替える(target) {
    const btn = document.getElementById((CONSOLE_TARGET_IDS[target] || CONSOLE_TARGET_IDS.console).mic);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    // ブラウザ内蔵の音声認識は、Chromeでは音声がGoogleのサーバーへ送られる。
    // 「外部へは一切送信しない」がこのツールの前提のため、
    // 明示的にオンにした場合だけ使う（既定はオフ）。
    // このチェックが漏れていたため、マイクを押すと黙って外部の
    // 音声認識が動く状態になっていた。
    if (localStorage.getItem('areglm_wake_use_browser') !== 'true') {
        const msg = 'マイクでの自由な話しかけには、いまブラウザ内蔵の音声認識（Chromeでは音声がGoogleへ送られます）'
            + 'が必要ですが、既定でオフにしてあります。\n\n'
            + '・使ってよい場合は、設定 →「声で指示する」の「ブラウザの音声認識を使う」を'
            + 'オンにしてください。\n'
            + '・外部に送りたくない場合は、文字で打ち込んでください（この場合は完全に端末内で完結します）。';
        showNotification('マイクでの音声入力は既定でオフです（外部送信のため）', 'warn');
        appendConsoleLine('assistant', msg, target);
        return;
    }

    // ブラウザはマイクを「安全な接続」でしか許可しない。
    // localhost / 127.0.0.1 は例外だが、arinoMacBook-Pro.local のような
    // URLで開いていると、無言で使えないままになってしまう。
    // 何が起きているか分かるように、はっきり伝える。
    if (!window.isSecureContext) {
        const msg = `今のURL（${location.host}）ではマイクを使えません。`
            + '\nブラウザの決まりで、マイクは 127.0.0.1 か localhost でしか許可されません。'
            + '\n\nこのMacで使う場合は http://127.0.0.1:8080 で開いてください。'
            + '\n（デスクトップの AReGLM.app から開くと、このURLになります）';
        showNotification('このURLではマイクを使えません', 'error');
        appendConsoleLine('assistant', msg, target);
        return;
    }

    if (!SR) {
        showNotification('このブラウザは音声入力に対応していません（Chrome推奨）', 'error');
        appendConsoleLine('assistant',
            'このブラウザは音声入力に対応していません。Chromeでお試しください。', target);
        return;
    }

    if (consoleListening) {
        consoleRecognition?.stop();
        return;
    }

    consoleRecognition = new SR();
    consoleRecognition.lang = 'ja-JP';
    consoleRecognition.interimResults = false;
    consoleRecognition.continuous = false;

    consoleRecognition.onstart = () => {
        consoleListening = true;
        if (btn) {
            btn.classList.add('listening');
            btn.textContent = '● 聞いています';
        }
    };

    consoleRecognition.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript?.trim();
        if (!text) return;
        // 声で話しかけられた場合だけ、声で返す
        声で聞かれた = true;
        runConsoleCommand(text, target);
    };

    consoleRecognition.onerror = (e) => {
        // エラーコードのままでは何をすればよいか分からないので、対処を添える
        const guide = {
            'not-allowed': 'マイクの使用が許可されていません。ブラウザのアドレス欄左のアイコンから許可してください。',
            'service-not-allowed': 'ブラウザの設定でマイクがブロックされています。設定から許可してください。',
            'no-speech': '声が聞き取れませんでした。もう一度お試しください。',
            'audio-capture': 'マイクが見つかりません。接続を確認してください。',
            network: 'ネットワークに接続できず、音声認識できませんでした。'
        };
        appendConsoleLine(
            'assistant',
            guide[e.error] || `音声を認識できませんでした（${e.error}）`,
            target
        );
    };

    consoleRecognition.onend = () => {
        consoleListening = false;
        if (btn) {
            btn.classList.remove('listening');
            btn.textContent = btn.dataset.元のラベル || '🎤 話す';
        }
    };

    consoleRecognition.start();
}

window.initConsole = initConsole;
window.録音中ならすべて打ち切る = 録音中ならすべて打ち切る;
window.initFloatingAgent = initFloatingAgent;
window.runConsoleCommand = runConsoleCommand;
window.appendConsoleLine = appendConsoleLine;
window.toggleConsoleMic = toggleConsoleMic;
window.showConsoleHelp = showConsoleHelp;
window.AREGLM_COMMANDS = AREGLM_COMMANDS;
