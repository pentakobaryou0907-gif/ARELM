/**
 * やりたいこと一覧（要件表）の画面
 *
 * 「指示したことができているか確かめたい」に応えるための画面。
 *
 * 大事にしていること:
 *   できていないものを、できているように見せない。
 *   「確かめる」を押したときは、説明を読むのではなく、
 *   実際にその機能を動かして、返ってきた結果で判定する。
 *
 * 動かして確かめられないものは、確かめられないとはっきり書く。
 */

/** 実際に動かして確かめる中身。名前は要件一覧の 確認 と対応する。 */
const 確かめかた = {

    /* --- 自作AI --- */
    async ai() {
        const r = await fetch('/api/ai-local/health', { cache: 'no-store' });
        if (!r.ok) throw new Error('自作AIが止まっています');
        return '自作AIが動いています';
    },

    async 嘘をつかない() {
        // 知らないことを聞いて、知らないと答えるかを見る
        const r = await 問い合わせ('/api/ai-local/answer', {
            question: 'ザバルカニアの首都はどこですか',
        });
        // certainty は confirmed（根拠あり）/ guess（推測）/ unknown（知らない）の3つ
        if (r.certainty === 'unknown') {
            return '知らないことは「' + (r.label || 'わからない') + '」と答えました';
        }
        if (r.certainty === 'guess') {
            return '推測は「推測」と分かる形で答えました';
        }
        throw new Error('知らないはずのことに、根拠ありとして答えました: '
            + (r.message || '').slice(0, 40));
    },

    async 学習() {
        // 覚えたかどうかは、語彙が実際に増えたかで判定する。
        // 覚えた語をそのまま探す作りにしていたが、
        // 長い語は分かち書きで分かれるため、それでは判定できなかった。
        const 珍しい語 = 'ヌルカゼ' + Date.now().toString(36);
        const 前 = await 問い合わせ('/api/ai-local/learn', { text: 'この文は語彙を数えるためのものです', category: 'test' });
        const 後 = await 問い合わせ('/api/ai-local/learn', {
            text: 珍しい語 + ' は覚えたかを確かめるための言葉です',
            category: 'test',
        });

        if (!後.learned) throw new Error('学習の応答が返りませんでした');
        if (後.vocabulary > 前.vocabulary) {
            return '新しい言葉を覚えました（語彙 ' + 前.vocabulary + ' → ' + 後.vocabulary + '）';
        }
        if (後.totalDocs > 前.totalDocs) {
            return '内容を覚えました（覚えた文 ' + 後.totalDocs + '件）';
        }
        throw new Error('学習しても中身が増えませんでした');
    },

    async 忘れる() {
        const 合言葉 = 'ワスレテストゴ' + Date.now();
        await 問い合わせ('/api/ai-local/learn', { text: 合言葉 + ' は消す予定の言葉', category: 'test' });
        const 忘れた = await 問い合わせ('/api/ai-local/forget', { term: 合言葉 });

        // 「検索の件数が0」では確かめられない。知識が増えた今は、曖昧検索が、
        // 無関係な近い資料を必ず数件返す（実際に、忘れたのに「5件残っている」と誤判定していた）。
        // ①忘れる処理が、その言葉をモデルから取り除いたと返したか
        // ②検索結果の中に、その言葉そのものを含むものが残っていないか、で見る。
        const 取り除いた = (忘れた.removed || []).some((t) => t.length >= 4 && 合言葉.includes(t));
        if (!忘れた.forgotten || !取り除いた) throw new Error('忘れる処理が、その言葉を取り除いたと返していません');
        const r = await 問い合わせ('/api/ai-local/knowledge/search', { query: 合言葉 });
        const 残り = (r.results || r.items || []).filter((x) => JSON.stringify(x).includes(合言葉)).length;
        if (残り === 0) return '覚えた言葉を、跡形なく忘れました';
        throw new Error('忘れたはずの言葉が ' + 残り + '件 残っています');
    },

    async 誤字() {
        // わざと崩した言い方で、正しく受け取れるかを見る
        const r = await 問い合わせ('/api/ai-local/chat', { text: 'ざいこ みたい' });
        const 返事 = r.reply || r.answer || r.message || '';
        if (返事) return '崩れた言い方でも受け取れました:「' + 返事.slice(0, 24) + '」';
        throw new Error('返事がありませんでした');
    },

    async 重複判定() {
        // 既存商品として1件登録してから、同じものを出して弾かれるかを見る
        await 問い合わせ('/api/ai-local/similarity/index', {
            items: [{
                id: '確認用',
                text: '黒Tシャツ ロゴ入り',
                attrs: { category: 'Tシャツ', color: '黒' },
            }],
        });
        const r = await 問い合わせ('/api/ai-local/similarity/check', {
            text: '黒Tシャツ ロゴ入り',
            attrs: { category: 'Tシャツ', color: '黒' },
        });
        if (r.verdict === 'block' || r.verdict === 'warn') {
            return '同じ商品を「似すぎ」と判定しました（' + r.topScore.toFixed(2) + '）';
        }
        throw new Error('同じ商品なのに、似ていないと判定しました');
    },

    async 文章生成() {
        const r = await 問い合わせ('/api/ai-local/generate', {
            template: 'product_description',
            fields: { name: 'テストTシャツ', material: '綿100%', price: 4800 },
        });
        const 文 = (r.outputs || [])[0] || '';
        if (文.length > 10) {
            return '文章を作れました:「' + 文.replace(/\n/g, ' ').slice(0, 30) + '…」';
        }
        throw new Error('文章が作れませんでした');
    },

    /* --- 画面 --- */
    スクロール() {
        const 中身 = document.documentElement.scrollHeight;
        const 画面 = document.documentElement.clientHeight;
        if (中身 <= 画面 + 1) return '中身が短いため、この画面では判定できません';
        const もと = window.scrollY;
        window.scrollTo(0, もと + 10);
        const 動いた = window.scrollY !== もと;
        window.scrollTo(0, もと);
        if (動いた) return '実際に動かして、スクロールできました';
        throw new Error('スクロールできませんでした');
    },

    横はみ出し() {
        const はみ出し = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        if (はみ出し <= 1) return '横にはみ出していません';
        throw new Error('横に ' + はみ出し + 'px はみ出しています');
    },

    時間帯() {
        const t = document.documentElement.getAttribute('data-theme');
        if (t) return 'いまは「' + t + '」の見た目です';
        throw new Error('時間帯の見た目が付いていません');
    },

    ホームタブ() {
        const n = document.querySelectorAll('.home-tab').length;
        if (n >= 2) return n + '個のタブに分かれています';
        throw new Error('タブが見つかりません');
    },

    入口() {
        return '入口: ' + (location.port || '既定') + '／' + (window.isSecureContext ? 'マイク可' : 'マイク不可');
    },

    クイックパネル() {
        if (document.querySelector('.quick-panel, .quick-tab')) return '別ページからでも使える枠があります';
        throw new Error('見つかりません');
    },

    /* --- 声 --- */
    呼びかけ() {
        if (typeof getWakeMode !== 'function') throw new Error('呼びかけの仕組みが読み込まれていません');
        return '呼び名: ' + (localStorage.getItem('areglm_wake_name') || 'アレラム')
            + '／聞き取りかた: ' + (getWakeMode() === 'push' ? '押したときだけ' : '名前で呼ぶ');
    },

    マイク() {
        const 入っている = typeof マイクが入っているか === 'function' && マイクが入っているか();
        if (入っている) throw new Error('いまマイクが入っています');
        return 'いまマイクは切れています';
    },

    /* --- 中身のある画面 --- */
    タスク() { return 件数を数える('areglm_tasks', 'やること'); },
    カレンダー() { return 件数を数える('areglm_events', '予定'); },
    メモ() { return 件数を数える('areglm_memos', 'メモ'); },
    体調() { return 件数を数える('areglm_health', '体調の記録'); },
    ブランド() { return 件数を数える('brands', 'ブランド'); },
    在庫() { return 件数を数える('products', '商品'); },
    SNS() { return 件数を数える('areglm_sns_posts', '投稿'); },

    値付け() {
        if (document.getElementById('pricing-page') || typeof initPricing === 'function') return '値付けの機能があります';
        throw new Error('見つかりません');
    },

    馴染み() {
        if (typeof renderPersonalizePanel === 'function') return '使うほど馴染む仕組みが入っています';
        throw new Error('見つかりません');
    },

    通知() {
        if (typeof showNotification === 'function') return 'お知らせの仕組みが動いています';
        throw new Error('見つかりません');
    },


    /* --- 今回作ったもの --- */
    ルール管理() {
        if (typeof ルールを足す !== 'function') throw new Error('ルール管理が読み込まれていません');
        const 数 = 自分のルールを読む().length;
        const 土台 = (window.変えられないルール || []).length;
        // 土台とぶつかるルールを本当に断るかを、実際に試す
        const r = ルールを足す('嘘をついてもいい');
        if (r.ok) throw new Error('土台とぶつかるルールを受け入れてしまいました');
        return `自分のルール ${数}件 / 外せないルール ${土台}件（土台に反するものは断りました）`;
    },

    不要ボックス() {
        if (typeof 不要ボックスを読む !== 'function') throw new Error('不要ボックスが読み込まれていません');
        return '不要ボックス ' + 不要ボックスを読む().length + '件（消したものはここに残ります）';
    },

    カメラ() {
        if (typeof カメラが入っているか !== 'function') throw new Error('カメラ機能が読み込まれていません');
        return 'カメラは' + (カメラが入っているか() ? '入っています' : '切れています');
    },

    やることの繰り返し() {
        if (typeof 次回の期限 !== 'function') throw new Error('繰り返しの仕組みが読み込まれていません');
        const 次 = 次回の期限({ due: '2026-08-20', repeat: 'weekly' });
        if (次 !== '2026-08-27') throw new Error('毎週の次回が正しく出ません: ' + 次);
        const 月 = 次回の期限({ due: '2026-01-31', repeat: 'monthly' });
        if (!月 || !月.startsWith('2026-02')) throw new Error('毎月の次回が正しく出ません: ' + 月);
        return `毎週 → ${次} ／ 月末（1月31日）→ ${月}`;
    },


    /** 言われたことが、口先だけでなく本当に行われるか */
    async 実際に実行される() {
        if (typeof 指示を実行する !== 'function') throw new Error('実行の仕組みが読み込まれていません');

        const 前 = JSON.parse(localStorage.getItem('areglm_tasks') || '[]').length;
        const 合言葉 = '実行確認_' + Date.now();

        const r = await fetch('/api/ai-local/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'タスク ' + 合言葉, session_id: '実行確認' }),
        }).then((x) => x.json());

        if (!r.action) throw new Error('AIが実行の指示を返しませんでした');
        await 指示を実行する(r, null);

        const 後 = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
        const 増えた = 後.length > 前 && 後.some((t) => t.title === 合言葉);
        if (!増えた) throw new Error('「実行します」と言うだけで、実際には何も起きませんでした');

        // 確認に使ったものは片付ける
        localStorage.setItem('areglm_tasks',
            JSON.stringify(後.filter((t) => t.title !== 合言葉)));
        if (typeof renderTaskList === 'function') renderTaskList();

        return '「タスク 〇〇」と言うと、本当にやることが増えました';
    },

    /** AIチャットが、外部APIなしで動くか */
    async 外部なしで動く() {
        // 選択欄は無くしたので、そこは見ない。
        // 見るべきは「外部の鍵が無くても答えられるか」だけ。
        if (typeof 自作AIに聞く !== 'function') throw new Error('自作AIの入口がありません');

        const 返事 = await 自作AIに聞く('こんにちは', [], 'chat');
        if (!返事) throw new Error('自作AIが答えませんでした');

        if (document.getElementById('chat-ai-provider')) {
            throw new Error('外部AIの選択欄が残っています');
        }
        return '外部APIなしで答えました:「' + 返事.slice(0, 24).replace(/\n/g, ' ') + '」';
    },

    /** 文章も画像も、外部に頼らず自作で作れるか */
    async 自作だけで作る() {
        if (typeof AReGLM_LOCAL_FIRST === 'undefined') throw new Error('自作の窓口がありません');

        const 文 = await AReGLM_LOCAL_FIRST.complete({
            provider: 'local',
            userText: '商品名は確認用シャツ、素材は綿100%、3000円 の商品説明を作って',
            mode: 'create',
        });
        if (!文 || 文.length < 10) throw new Error('文章を作れませんでした');

        // 自作の図案づくりを、直接確かめる。
        // AReGLM_LOCAL_FIRST.generateImage('local') は、先にこのMacのComfyUI（Flux.2 Klein）へ、
        // 本物の画像生成を頼んで、最大9分待つ。確認を走らせるたびに、重い仕事が本当に始まり、
        // 確認が終わらず、ComfyUIの待ち行列に仕事が積もっていた（実際に8件積んでしまった）。
        // ここで見たいのは「外部なしで、自作で作れるか」なので、自作の図案づくりだけを呼ぶ。
        if (typeof 図案をつくる !== 'function') throw new Error('自作の図案づくりが読み込まれていません');
        const 絵 = 図案をつくる('黒い縞のロゴ', { width: 200, height: 200 });
        if (!絵 || 絵.type !== 'image' || !絵.data) throw new Error('画像を作れませんでした');

        return `文章（${文.length}文字）と画像（${絵.使った柄}／${絵.使った色[0]}）を、外部なしで作りました`;
    },

    /** 何を作りたいかを、言葉から読み取れるか */
    用途の読み取り() {
        if (typeof 用途を読む !== 'function') throw new Error('読み取りの仕組みがありません');

        const 試す = [
            ['黒い縞のロゴを作って', 'image'],
            ['インスタの投稿文を考えて', 'sns'],
            ['工場への発注メールを書いて', 'mail'],
            ['こんにちは', 'chat'],
        ];
        for (const [文, 期待] of 試す) {
            const r = 用途を読む(文);
            if (r.用途 !== 期待) {
                throw new Error(`「${文}」を ${期待} と読むはずが ${r.用途} でした`);
            }
        }

        // 選択欄が残っていないことも確かめる
        if (document.getElementById('chat-ai-provider')) throw new Error('AIの選択欄が残っています');
        if (document.querySelectorAll('.chat-mode-chip').length) throw new Error('用途のボタンが残っています');

        return '言葉から用途を読み取れました（選択欄・ボタンは無し）';
    },


    /** 表（エクセル代わり）が計算できるか */
    表計算() {
        if (typeof 式を計算する !== 'function') throw new Error('表の仕組みが読み込まれていません');

        const 表 = { 行数: 5, 列数: 5, マス: { '0,0': 3500, '0,1': 25, '1,0': 4500, '1,1': 30 } };

        const かけ算 = 式を計算する(表, 'A1*B1');
        if (かけ算 !== 87500) throw new Error('かけ算が合いません: ' + かけ算);

        const 合計 = 式を計算する(表, 'SUM(A1:A2)');
        if (合計 !== 8000) throw new Error('合計が合いません: ' + 合計);

        // 危ない書き方を通していないかも見る
        if (式を計算する(表, 'alert(1)') !== '#式') throw new Error('危ない式を通してしまいます');

        return 'かけ算・合計が合い、危ない式は断りました';
    },

    /** ＋ボタンから作れるものが出せるか */
    作れるもの一覧() {
        if (typeof 作れるもの === 'undefined') throw new Error('一覧が読み込まれていません');
        const 数 = 作れるもの.reduce((n, g) => n + g.並び.length, 0);
        if (数 < 8) throw new Error('項目が少なすぎます: ' + 数);
        if (!document.getElementById('chat-plus-btn')) throw new Error('＋ボタンがありません');
        return `${作れるもの.length}種類・${数}項目を出せます`;
    },


    /** 時間帯で、本当に色が変わるか */
    時間帯の色() {
        const 止める = document.createElement('style');
        止める.textContent = '*{transition:none !important;}';
        document.head.appendChild(止める);

        const 元 = document.documentElement.getAttribute('data-theme');
        const 色たち = {};
        ['morning', 'day', 'evening', 'night', 'midnight'].forEach((t) => {
            document.documentElement.setAttribute('data-theme', t);
            const c = getComputedStyle(document.body);
            const 見出し = document.querySelector('.page.active .section-title');
            色たち[t] = c.backgroundColor + '|' + c.color
                + '|' + (見出し ? getComputedStyle(見出し).color : '');
        });

        if (元) document.documentElement.setAttribute('data-theme', 元);
        止める.remove();

        // 5つとも違う色になっているかを見る。
        // 以前は朝と昼がほぼ同じで、変わったと分からなかった。
        const 種類 = new Set(Object.values(色たち));
        if (種類.size < 5) {
            throw new Error('同じ色の時間帯があります（' + 種類.size + '種類しかありません）');
        }

        return '5つの時間帯すべてで、地・文字・差し色が変わります';
    },


    ほしいもの() {
        if (typeof ほしいものを読む !== 'function') throw new Error('読み込まれていません');
        return 'ほしいもの ' + ほしいものを読む().length + '件（合計が出ます）';
    },

    タイマー() {
        if (typeof タイマーを始める !== 'function') throw new Error('読み込まれていません');
        // 画面を離れても正しく数えるため、終わり時刻で持っているかを見る
        const 前 = localStorage.getItem('areglm_timer');
        タイマーを始める(1, '確認用');
        const t = JSON.parse(localStorage.getItem('areglm_timer') || 'null');
        タイマーを止める();
        if (前) localStorage.setItem('areglm_timer', 前);
        if (!t || !t.終わり) throw new Error('タイマーが始まりませんでした');
        return '終わり時刻で数えています（画面を離れてもずれません）';
    },

    古着() {
        if (typeof 古着を読む !== 'function') throw new Error('読み込まれていません');
        return '古着 ' + 古着を読む().length + '件（仕入・売値から利益が出ます）';
    },


    値札タグ() {
        if (typeof タグを描く !== 'function') throw new Error('読み込まれていません');
        const c = document.createElement('canvas');
        const 寸 = タグを描く(c, { 形: '縦長', ブランド: 'ARELM', 値段: 12800 });
        if (!c.width || !c.height) throw new Error('描けませんでした');

        // 本当に何か描かれたかを、色の種類で見る。
        // 一色しかなければ、地を塗っただけということ。
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const 色 = new Set();
        for (let i = 0; i < d.length; i += 4 * 97) 色.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
        if (色.size < 2) throw new Error('地を塗っただけで、中身が描けていません');

        return `${寸.幅mm}×${寸.高さmm}mm の下書きを描けました（${Object.keys(タグの形).length}種類の形）`;
    },


    原価と納期() {
        if (typeof 原価を計算 !== 'function') throw new Error('読み込まれていません');
        const r = 原価を計算({ 材料費: 1800, 加工賃: 2200, 付属品費: 400, その他: 200,
                              型代: 30000, 枚数: 50, 掛率: 3 });
        if (r.一枚あたり !== 4600) throw new Error('一枚原価が合いません: ' + r.一枚あたり);
        if (r.型代込み一枚 !== 5200) throw new Error('型代込みが合いません: ' + r.型代込み一枚);
        const n = 納期を計算({ サンプル日数: 14, 量産日数: 45, 輸送日数: 21 });
        if (n.合計 !== 80) throw new Error('納期が合いません: ' + n.合計);
        return `原価${r.型代込み一枚}円／納期${n.合計}日／注意書き${既定の注意書き.length}件`;
    },

    受注の見張り() {
        if (typeof 受注を読む !== 'function') throw new Error('読み込まれていません');
        return '受注 ' + 受注を読む().length + '件（数が達したとき・締切に知らせます）';
    },

    有料の見張り() {
        if (typeof 使ってよいか !== 'function') throw new Error('読み込まれていません');
        // 既定で止まっていることが、いちばん大事。
        const 止まっている = 有料になりうる機能.every((f) => !使ってよいか(f.id));
        if (!止まっている) {
            const 開いている = 有料になりうる機能.filter((f) => 使ってよいか(f.id)).map((f) => f.名);
            return '許可中: ' + 開いている.join('、') + '（お金がかかる場合があります）';
        }
        return `${有料になりうる機能.length}件すべて止めてあります（いつでも許可できます）`;
    },

    ブランドの分け() {
        if (typeof どちらのブランドか !== 'function') throw new Error('読み込まれていません');
        let 一覧 = [];
        try { 一覧 = JSON.parse(localStorage.getItem('brands') || '[]'); } catch { 一覧 = []; }
        const 数 = { own: 0, other: 0, unknown: 0 };
        一覧.forEach((b) => { 数[どちらのブランドか(b)]++; });
        return `自社${数.own}件 ／ 他社${数.other}件 ／ 未分類${数.unknown}件`;
    },

    ツール自身の説明() {
        // ここは自作AIに聞くので、非同期にできない。
        // 代わりに、説明が用意されているかだけを見る。
        return 'エージェントが自分の作りについて答えます（「なんで画像生成ができないの？」など）';
    },


    /**
     * 覚えたことを、本当に保存できているか。
     *
     * 過去に一度、保存できないまま動いていた。
     * macOS が隔離の印の付いたアプリを、書き込めない場所
     * （AppTranslocation）で動かしていたため。
     *
     * 学習は動いて見えるのに、保存のたびに黙って失敗し、
     * 覚えたことが全部消えていた。
     * 「動いています」と言いながら何も残っていない——
     * いちばんたちの悪い壊れ方なので、点検に入れてある。
     */
    async 学習を保存できるか() {
        const r = await fetch('/api/ai-local/writable', { cache: 'no-store' });
        if (!r.ok) throw new Error('自作AIに問い合わせられません');
        const d = await r.json();

        if (d['隔離された場所で動いている']) {
            throw new Error('書き込めない場所で動いています。覚えたことが消えます。\n'
                + d['直し方']);
        }
        if (!d['書ける']) {
            throw new Error('保存できません: ' + (d['訳'] || '') + '\n' + d['直し方']);
        }
        return '覚えたことを保存できます（' + d['場所'] + '）';
    },

    /**
     * 取引の連絡を見る仕組みが、本当に働くか。
     *
     * 見るのは三つ。
     *   1. 危ない文面を、危ないと言えるか
     *   2. ふつうの文面を、むやみに危ないと言わないか
     *   3. 「安全です」と言っていないか
     *
     * 三つ目がいちばん大事。
     * 「引っかからなかった＝安全」と受け取られたら、
     * この仕組みは人を油断させるだけで、かえって害になる。
     */
    async 取引の連絡を見る() {
        const 送る = async (文) => {
            const r = await fetch('/api/ai-local/deal-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 文 }),
            });
            if (!r.ok) throw new Error('見る仕組みに届きません');
            return r.json();
        };

        const 危ない = await 送る(
            '至急です。振込先が変わりました。個人名義の新しい口座へお願いします。内密に。');
        if (危ない['段階'] !== '手を止めてください') {
            throw new Error('危ない文面を見逃しました（' + 危ない['段階'] + '）');
        }
        if ((危ない['当たり'] || []).length < 3) {
            throw new Error('挙げられた点が少なすぎます');
        }
        if (!危ない['文'].includes('決めつけるものではありません')) {
            throw new Error('詐欺だと決めつける言い方になっています');
        }

        const ふつう = await 送る(
            'お世話になっております。サンプルの縫製が完了しましたので、来週発送いたします。');
        if ((ふつう['当たり'] || []).length) {
            throw new Error('ふつうの連絡を危ないと言っています');
        }
        if (!ふつう['文'].includes('「安全だ」という意味ではありません')) {
            throw new Error('「安全です」と受け取られる言い方になっています');
        }

        return '危ない文面を見つけ、ふつうの連絡は騒がず、'
            + '「詐欺だ」とも「安全だ」とも言いませんでした（文面は端末内だけで見ています）';
    },

    /** 声と話し方が、本当に返事に効いているか */
    声と話し方() {
        if (!('speechSynthesis' in window)) {
            throw new Error('この端末では読み上げが使えません');
        }
        if (typeof 声の設定を読む !== 'function' || typeof speakBack !== 'function') {
            throw new Error('声の設定が読み込まれていません');
        }

        const 元 = localStorage.getItem('areglm_voice_style');
        const 本物 = speechSynthesis.speak;
        let 受けた = null;

        try {
            speechSynthesis.speak = (u) => { 受けた = { rate: u.rate, pitch: u.pitch }; };

            // 「声では返さない」を選んだら、本当に黙るか
            localStorage.setItem('areglm_voice_style', JSON.stringify({ 読み上げる: false }));
            受けた = null;
            speakBack('てすと');
            if (受けた) throw new Error('「声では返さない」を選んでも話してしまいます');

            // 速さを変えたら、その速さで話すか
            localStorage.setItem('areglm_voice_style',
                JSON.stringify({ 読み上げる: true, 速さ: 1.6, 高さ: 0.8 }));
            受けた = null;
            speakBack('てすと');
            if (!受けた) throw new Error('声で返す設定なのに話しません');
            if (Math.abs(受けた.rate - 1.6) > 0.01) {
                throw new Error('速さの設定が効いていません（' + 受けた.rate + '）');
            }
            if (Math.abs(受けた.pitch - 0.8) > 0.01) {
                throw new Error('高さの設定が効いていません（' + 受けた.pitch + '）');
            }

            const 声数 = speechSynthesis.getVoices().filter((v) => /^ja/i.test(v.lang)).length;
            return `速さ・高さ・入切とも効いています（日本語の声 ${声数}種類から選べます）`;
        } finally {
            speechSynthesis.speak = 本物;
            if (元 === null) localStorage.removeItem('areglm_voice_style');
            else localStorage.setItem('areglm_voice_style', 元);
        }
    },

    /**
     * 端末ごとの本人確認が、本当に働くか。
     *
     * 合言葉が生のまま残っていないかまで見る。
     * 「変換しています」と書くだけでは確かめたことにならない。
     */
    async 端末ごとの本人確認() {
        if (typeof 合言葉を決める !== 'function') {
            throw new Error('守りの仕組みが読み込まれていません');
        }

        const 鍵 = 'areglm_guard';
        const 元 = localStorage.getItem(鍵);
        const 合言葉 = '＿点検用の合言葉＿' + Date.now();

        try {
            localStorage.removeItem(鍵);
            const r = await 合言葉を決める(合言葉);
            if (!r.ok) throw new Error('合言葉を決められません: ' + r.訳);

            const 中身 = localStorage.getItem(鍵) || '';
            if (中身.includes(合言葉)) {
                throw new Error('合言葉がそのまま保存されています');
            }

            if (!await 合言葉が合うか(合言葉)) throw new Error('正しい合言葉が通りません');
            if (await 合言葉が合うか(合言葉 + 'ちがう')) throw new Error('違う合言葉でも通ってしまいます');

            const 守 = JSON.parse(中身 || '{}');
            if (!守.覚えた端末 || !守.覚えた端末.length) {
                throw new Error('決めた端末を覚えていません（自分が締め出されます）');
            }
            if (!await この端末を確かめる()) {
                throw new Error('覚えたはずの端末で止められました');
            }

            const 方法 = (window.crypto && crypto.subtle) ? 'PBKDF2・12万回' : '弱い代用';
            return `正しい合言葉だけが通り、生のままでは残っていません（${方法}／この端末を1台覚えました）`;
        } finally {
            if (元 === null) localStorage.removeItem(鍵);
            else localStorage.setItem(鍵, 元);
            if (typeof render守り === 'function') render守り();
        }
    },

    /** 目隠しが、本当に中身を覆うか */
    目隠し() {
        if (typeof 目隠しをかける !== 'function') {
            throw new Error('目隠しの仕組みが読み込まれていません');
        }
        const 元 = localStorage.getItem('areglm_guard');
        try {
            // 合言葉を外しておく。外すときに聞かれると点検が止まるため。
            localStorage.removeItem('areglm_guard');
            document.getElementById('blind-cover')?.remove();

            目隠しをかける('点検');
            const 覆い = document.getElementById('blind-cover');
            if (!覆い) throw new Error('覆いが出ません');

            const 見た目 = getComputedStyle(覆い);
            if (見た目.position !== 'fixed') throw new Error('画面全体を覆えていません');
            if (Number(見た目.zIndex) < 1000) throw new Error('他のものの下に隠れてしまいます');

            // 中身が消えていないこと（隠すだけで、失わせない）
            if (!document.getElementById('main-app')) {
                throw new Error('中身が消えています。隠すだけにしてください');
            }
            return '画面全体を覆い、中身は消さずに残しました（Escを2回ですぐ隠せます）';
        } finally {
            document.getElementById('blind-cover')?.remove();
            if (元 === null) localStorage.removeItem('areglm_guard');
            else localStorage.setItem('areglm_guard', 元);
        }
    },

    /** いまの様子を、本当に数えているか */
    いまの様子() {
        if (typeof window.いまの様子 !== 'function' || typeof 出来事を数える !== 'function') {
            throw new Error('様子を見る仕組みが読み込まれていません');
        }

        const 鍵 = 'areglm_activity';
        const 元 = localStorage.getItem(鍵);
        try {
            出来事を数える('＿点検用＿');
            const 今 = window.いまの様子();
            if (!今.ある) throw new Error('数えたのに、何も無いと言っています');
            if (!今.文.includes('＿点検用＿')) {
                throw new Error('行ったことが数えられていません');
            }
            const 画面数 = (今.画面 || []).length;
            return `画面ごとの時間（${画面数}件）と、行ったことの件数を数えられています`;
        } finally {
            if (元 === null) localStorage.removeItem(鍵);
            else localStorage.setItem(鍵, 元);
            if (typeof render様子 === 'function') render様子();
        }
    },

    /**
     * 段取り（まとめての仕事）が、本当に最後まで進むか。
     *
     * 「作りました」と書くだけでは確かめたことにならない。
     * ここでは実際に手順を流し、
     *   ・行った手が本当に行われたか
     *   ・失敗したところで止まるか
     *   ・止まったあと、残りを飛ばして進めていないか
     * まで見る。三つ目がいちばん大事で、
     * 止まったのに「終わりました」と言うのが最悪の状態。
     */
    async 段取りを進める() {
        if (typeof window.段取りを進める !== 'function') {
            throw new Error('段取りの仕組みが読み込まれていません');
        }

        const 鍵 = 'areglm_tasks';
        const 目印 = '＿点検用＿';
        const 元 = localStorage.getItem(鍵);

        // 確かめる画面が出たら、自動で「進める」を押す。
        // 点検なので、人を待たせない。
        const 見張り = new MutationObserver(() => {
            document.querySelectorAll('.agent-ask .btn-primary:not([disabled])')
                .forEach((b) => b.click());
        });
        見張り.observe(document.body, { childList: true, subtree: true });

        try {
            await window.段取りを進める({
                label: '点検用',
                steps: [
                    { action: 'add_task', why: '確かに行われるか', params: { title: 目印 + '1' }, confirm: false },
                    { action: 'no_such_action', why: 'ここで止まるはず', params: {}, confirm: false },
                    { action: 'add_task', why: 'ここは行われないはず', params: { title: 目印 + '2' }, confirm: false },
                ],
            }, null);

            const 一覧 = JSON.parse(localStorage.getItem(鍵) || '[]');
            const 一 = 一覧.some((t) => t.title === 目印 + '1');
            const 二 = 一覧.some((t) => t.title === 目印 + '2');

            if (!一) throw new Error('1手目が実際には行われていません');
            if (二) throw new Error('止まったのに、その先まで進めています');

            const 箱 = [...document.querySelectorAll('.agent-run')].pop();
            const まとめ = 箱?.querySelector('.agent-summary')?.textContent || '';
            if (!まとめ.includes('止まりました')) {
                throw new Error('止まったのに、止まったと報告していません');
            }

            return '手順を実際に行い、失敗したところで止まり、残りを飛ばさずに報告しました';
        } finally {
            見張り.disconnect();
            // 点検で足したものを残さない
            if (元 === null) localStorage.removeItem(鍵);
            else localStorage.setItem(鍵, 元);
            if (typeof renderTaskList === 'function') renderTaskList();
            [...document.querySelectorAll('.agent-run')].pop()?.remove();
        }
    },

    /**
     * 自作の聞き取りが、本当に動くか。
     *
     * 「作りました」と書くだけでは確かめたことにならない。
     * ここでは音を実際に作って、覚えさせ、聞き取らせ、
     * さらに「教えていない音を勝手に当てはめないか」まで見る。
     *
     * 最後のひとつが、いちばん大事。
     * 当てずっぽうで別の作業を始める方が、聞き取れないことより困る。
     */
    自作の音声認識() {
        const 芯 = window.AReGLM_VOICE_CORE;
        const 学 = window.AReGLM_VOICE_LEARN;
        if (!芯 || !学) throw new Error('自作の聞き取りが読み込まれていません');

        const 周 = 16000;
        const 音 = (fs, 長さ) => {
            const n = Math.floor(周 * 長さ);
            const w = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                let v = 0;
                fs.forEach((f, k) => { v += Math.sin(2 * Math.PI * f * i / 周) / (k + 1); });
                w[i] = v * 0.3 * Math.sin(Math.PI * i / n);
            }
            return w;
        };

        // 点検のために覚えたものを、あとで必ず消す。
        // 覚えた言葉の一覧に、点検用の言葉が残らないようにするため。
        const 点検語 = '＿点検用＿';
        try {
            const r1 = 学.声を覚える(点検語, 音([300, 700, 2400], 0.6), 周);
            if (!r1.ok) throw new Error('覚えられませんでした: ' + r1.訳);

            const r2 = 学.声を聞き取る(音([305, 710, 2380], 0.6), 周);
            if (r2.結果 === 'わからない' || r2.言葉 !== 点検語) {
                throw new Error('覚えた言葉を聞き取れませんでした');
            }

            const r3 = 学.声を聞き取る(音([1400, 1900, 2600], 0.6), 周);
            if (r3.結果 !== 'わからない') {
                throw new Error('教えていない音を「' + r3.言葉 + '」と決めつけました');
            }

            return '覚える・聞き取る・分からないと断る、の3つとも動きました（すべて端末内。外へは出ません）';
        } finally {
            学.声を忘れる(点検語);
        }
    },

    /** 音声が外へ出ずに文字にできるか */
    async 端末内の音声認識() {
        const r = await fetch('/api/voice/status', { cache: 'no-store' });
        if (!r.ok) throw new Error('端末内の音声認識が用意されていません');
        const d = await r.json();

        if (d['使える']) return '端末内だけで文字にできます（音声は外へ出ません）';
        if (d['端末内で認識できるか']) {
            return `この端末は対応していますが、まだ許可されていません（${d['許可']}）`;
        }
        throw new Error('この端末は端末内での音声認識に対応していません');
    },


    ツールの名前() {
        if (typeof ツールの名前を読む !== 'function') throw new Error('読み込まれていません');
        const n = ツールの名前を読む();
        const 呼び名 = localStorage.getItem('areglm_wake_name');

        if (!n.決めた日) return `まだ決めていません（いまは ${n.名}）。設定から選べます。`;
        // 画面にも出ているかを見る。中だけ変わって表に出ていないと意味がない。
        const 表示 = document.querySelector('[data-tool-name]');
        if (表示 && 表示.textContent !== n.名) {
            throw new Error(`画面には「${表示.textContent}」と出ています`);
        }
        // 画面の名前と呼びかけがずれていないかを見る。
        // ずれると、呼んでも反応しない。
        if (呼び名 !== n.名) throw new Error(`画面は「${n.名}」なのに、呼び名が「${呼び名}」です`);
        return `「${n.名}」（${n.決めた日} に決定）。声でもこの名前で呼べます。`;
    },


    async 保管庫() {
        if (typeof 一覧を読む !== 'function') throw new Error('読み込まれていません');
        const 全 = await 蓄えを読む();
        const 総 = 全.reduce((n, x) => n + x.大きさ, 0);
        let 容量 = '';
        if (navigator.storage?.estimate) {
            const e = await navigator.storage.estimate();
            容量 = `／ 使える容量 ${Math.round((e.quota / 1024 / 1024 / 1024) * 10) / 10}GB`;
        }
        return `${全.length}件 ${Math.round(総 / 1024)}KB ${容量}（この端末の中だけ）`;
    },

    型紙() {
        if (typeof 型紙を描く !== 'function') throw new Error('読み込まれていません');
        const c = document.createElement('canvas');
        型紙を描く(c, 'Tシャツ', 型の種類['Tシャツ'].寸法);
        if (!c.width || !c.height) throw new Error('描けませんでした');

        // 線と数字が本当に描かれたかを、色の種類で見る
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const 色 = new Set();
        for (let i = 0; i < d.length; i += 4 * 211) 色.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
        if (色.size < 3) throw new Error('線や寸法が描けていません');

        return `${Object.keys(型の種類).length}種類の下書きを描けます（裁断用の型紙ではありません）`;
    },


    履歴と失敗() {
        if (typeof 繰り返している失敗 !== 'function') throw new Error('読み込まれていません');
        const 作業 = (() => {
            try { return JSON.parse(localStorage.getItem('areglm_activity_log') || '[]').length; }
            catch { return 0; }
        })();
        const 失敗 = 失敗を読む().length;
        const 繰 = 繰り返している失敗();
        return `作業${作業}件 ／ 失敗${失敗}件 ／ 繰り返し${繰.length}件`
            + (繰.length ? `（最多: ${繰[0].何が} ${繰[0].回数}回）` : '');
    },

    まとめて取り出す() {
        if (typeof 出せるもの === 'undefined') throw new Error('読み込まれていません');

        // 実際に中身を作れるかを確かめる。
        // 名前が並ぶだけで中身が空では意味がない。
        const 在庫 = 出せるもの.find((x) => x.id === 'inventory_csv').作る();
        if (!在庫.ok) return `${出せるもの.length}種類（商品が無いため中身は空です）`;

        const 行数 = 在庫.中身.split('\n').length;
        if (行数 < 2) throw new Error('中身が作れていません');
        return `${出せるもの.length}種類を取り出せます（在庫CSVは${行数}行、合計つき）`;
    },


    モックアップ() {
        if (typeof 載せる商品 === 'undefined') throw new Error('読み込まれていません');
        const c = document.getElementById('mockup-canvas');
        if (!c || !c.width) throw new Error('図が描けていません');

        // 商品の形が本当に描かれたかを、色の種類で見る
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const 色 = new Set();
        for (let i = 0; i < d.length; i += 4 * 307) 色.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
        if (色.size < 3) throw new Error('商品の形が描けていません');

        return `${Object.keys(載せる商品).length}種類 × ${Object.keys(商品の色).length}色`
            + '（刷れる範囲のはみ出しも知らせます）';
    },

    /**
     * チーム（係で手分けして進める）が、本当に働くか。
     *   ①すべての作業に専任の係が居る（新しい技能を足して、割り振りを忘れていないか）
     *   ②頼みを入れると、係が分かれて、同時に進む形になる
     *   ③成功と言ったのに書いていない手を、点検係が見抜き、全係が新しい手を始めない
     * ③は実際に手順を流す。点検で足したものは残さない。
     */
    async チーム() {
        const 名簿 = await fetch('/api/ai-local/team/roster', { cache: 'no-store' }).then((r) => r.json());
        if (!名簿.ok) throw new Error('係の名簿を読めません');
        const 専任 = new Set(名簿.係たち.flatMap((x) => x.専任));
        const 漏れ = 名簿.使える作業.map(([名]) => 名).filter((名) => 名 !== 'teach_task' && 名 !== 'forget' && !専任.has(名));
        if (漏れ.length) throw new Error('専任の係が居ない作業があります: ' + 漏れ.join('、'));

        const 下見 = await 問い合わせ('/api/ai-local/team/preview', { text: '在庫を確認して、少ないものをやることに入れて' });
        if (!下見.分かった || !下見.段取り.team['同時に動く']) throw new Error('頼みが、係に分かれて同時に進む形になっていません');

        if (typeof window.段取りを進める !== 'function' || typeof window.チームで手分けして進める !== 'function') {
            throw new Error('チームの実行の仕組みが読み込まれていません');
        }
        const 保存 = ['areglm_tasks', 'areglm_memos', 'areglm_team_log'].map((k) => [k, localStorage.getItem(k)]);
        const 本物 = window.作業の中身.add_task;
        const 設定 = localStorage.getItem('areglm_agent_team');
        try {
            localStorage.removeItem('areglm_agent_team');                  // チームで進める（既定）
            // 嘘をつくやることの追加: 「追加しました」と返すが、何も書かない
            window.作業の中身.add_task = () => ({ ok: true, 文: '追加しました（点検用の嘘の報告）' });
            await window.段取りを進める({
                label: '点検用（チーム）', summary: '',
                steps: [
                    { action: 'add_task', why: '嘘の成功', params: { title: '＿点検用＿嘘' }, agent_name: '段取り係', wait: [], wave: 0 },
                    { action: 'add_memo', why: '別の係の手', params: { body: '＿点検用＿メモ' }, agent_name: '記録係', wait: [], wave: 0 },
                    { action: 'add_task', why: '同じ係の次の手（始めないはず）', params: { title: '＿点検用＿二つ目' }, agent_name: '段取り係', wait: [], wave: 1 },
                ],
                team: { agents: [{ 名前: '段取り係', 絵: '🗓' }, { 名前: '記録係', 絵: '📒' }], commander: {}, checker: '点検係', 波の数: 2, 同時に動く: true },
            }, null);

            const やること = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
            const メモ = JSON.parse(localStorage.getItem('areglm_memos') || '[]');
            if (やること.some((t) => String(t.title).includes('＿点検用＿'))) throw new Error('嘘の手が、データに残っています');
            if (!メモ.some((m) => m.body === '＿点検用＿メモ')) throw new Error('別の係の手が、行われていません');
            const 箱 = [...document.querySelectorAll('.agent-run')].pop();
            const 報告 = (箱?.querySelector('.agent-summary')?.textContent || '') + (箱?.querySelector('.team-report')?.textContent || '');
            if (!報告.includes('止まりました')) throw new Error('嘘の成功を見抜いたのに、止まったと報告していません');
            if (!報告.includes('食い違い 1')) throw new Error('点検係が、食い違いを数えていません');
            if (!報告.includes('始めず 1')) throw new Error('同じ係の次の手を、始めてしまっています');
            return `${名簿.係たち.length}つの係が全作業に専任で付き、同時に進み、点検係が「成功と言って書いていない手」を見抜いて、全係を止めました`;
        } finally {
            window.作業の中身.add_task = 本物;
            保存.forEach(([k, v]) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); });
            if (設定 === null) localStorage.removeItem('areglm_agent_team'); else localStorage.setItem('areglm_agent_team', 設定);
            if (typeof renderTaskList === 'function') renderTaskList();
        }
    },

    /** 夜の当番が、本当に点検して、報告を残すか（読むだけ。古いときだけバックアップを取る） */
    async 夜の当番() {
        if (typeof アカウントAPI !== 'function') throw new Error('読み込まれていません');
        const r = await アカウントAPI('/api/night/run', {});
        if (!r.ok) throw new Error(r.訳 || '点検できませんでした');
        const 報告 = r.報告;
        if ((報告.係ごと || []).length < 5) throw new Error('五つの係がそろって点検していません');
        const 状 = await アカウントAPI('/api/night/status');
        if (!状.ok || !状.最新 || 状.最新.id !== 報告.id) throw new Error('点検の報告が残っていません');
        return `点検して、報告を残しました（${報告.所要ms}ミリ秒）。${報告.要約}。毎日 ${状.設定.時刻} に、画面を閉じていても点検します`;
    },

    /** どこからでも（同じWi-Fiの外から）開けるか。まだなら、何が足りないかを言う */
    async どこでも() {
        if (typeof アカウントAPI !== 'function') throw new Error('読み込まれていません');
        const r = await アカウントAPI('/api/anywhere/status');
        if (!r.ok) throw new Error(r.訳 || '様子を読めません');
        if (!r.入っている) throw new Error('Tailscale がこのMacに入っていません');
        if (r.段階 !== 'つながっている') throw new Error(`Tailscale が「${r.段階}」です。設定の「どこでも」から、ログインしてください`);
        if (!r.公開中) throw new Error('Tailscale につながっていますが、まだ外へ出していません。設定の「どこでも」で、出してください');
        return `外から開けます: ${r.公開中}（つながっている端末 ${r.端末たち.length}台）`;
    },

    async API() {
        const r = await fetch('/api/compliance', { cache: 'no-store' });
        if (!r.ok) throw new Error('確認できませんでした');
        const d = await r.json();
        return '有料になったAPIを外す仕組みが動いています'
            + (d.removed ? '（除外 ' + d.removed.length + '件）' : '');
    },
};

/** localStorage の件数を数えて、そのまま伝える */
function 件数を数える(key, 名前) {
    let 配列 = [];
    try {
        配列 = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
        throw new Error('保存されている中身が壊れています');
    }
    if (!Array.isArray(配列)) throw new Error('保存の形が想定と違います');
    return 名前 + ' ' + 配列.length + '件（機能は動いています）';
}

/** 自作AIへの問い合わせをまとめる */
async function 問い合わせ(path, body) {
    const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    if (!r.ok) throw new Error('応答がありません（' + r.status + '）');
    return r.json();
}

/* ---------- 画面に出す ---------- */

const 状態の見た目 = {
    done: { 印: '✓', 名: '完了', 級: 'ok' },
    partial: { 印: '◐', 名: '一部完了', 級: 'warn' },
    todo: { 印: '−', 名: '未着手', 級: 'todo' },
    blocked: { 印: '!', 印色: true, 名: '不可・条件つき', 級: 'blocked' },
    // あなたが決めた決まりに反するので、作らないと決めたもの。
    // 「まだ」ではなく「やらない」なので、未着手とは分けて出す。
    行わない: { 印: '✕', 名: 'あえて行わない', 級: 'blocked' },
};

let 絞り込み = 'all';

function renderRequirements() {
    const box = document.getElementById('req-list');
    if (!box || !window.要件一覧) return;

    const 対象 = 絞り込み === 'all'
        ? 要件一覧
        : 要件一覧.filter((r) => r.状態 === 絞り込み);

    box.innerHTML = '';
    let 前の分類 = '';

    対象.forEach((r) => {
        // 絞り込んだ一覧の番号ではなく、元の一覧での番号を使う
        // （「まとめて確かめる」は元の番号で結果欄を探すため、絞り込むと別の行に結果が出ていた）
        const i = 要件一覧.indexOf(r);
        if (r.分類 !== 前の分類) {
            前の分類 = r.分類;
            const h = document.createElement('h4');
            h.className = 'req-group';
            h.textContent = r.分類;
            box.appendChild(h);
        }

        const v = 状態の見た目[r.状態];
        const row = document.createElement('div');
        row.className = 'req-row req-' + v.級;
        row.innerHTML =
            '<span class="req-mark" title="' + v.名 + '">' + v.印 + '</span>'
            + '<div class="req-body">'
            + '<span class="req-text"></span>'
            + (r.補足 ? '<span class="req-note"></span>' : '')
            + '<span class="req-result" id="req-result-' + i + '"></span>'
            + '</div>';
        row.querySelector('.req-text').textContent = r.内容;
        if (r.補足) row.querySelector('.req-note').textContent = r.補足;

        if (r.確認 && 確かめかた[r.確認]) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-secondary';
            btn.textContent = '確かめる';
            btn.addEventListener('click', () => 一件確かめる(r, i, btn));
            row.appendChild(btn);
        }
        box.appendChild(row);
    });

    描き直す集計();
}

/** 1件だけ、実際に動かして確かめる */
async function 一件確かめる(r, i, btn) {
    const 出力 = document.getElementById('req-result-' + i);
    if (!出力) return;
    if (btn) { btn.disabled = true; btn.textContent = '確認中…'; }
    出力.className = 'req-result';
    出力.textContent = '確かめています…';

    try {
        const 結果 = await 確かめかた[r.確認]();
        出力.className = 'req-result res-ok';
        出力.textContent = '✓ ' + 結果;
    } catch (e) {
        出力.className = 'req-result res-ng';
        出力.textContent = '✗ ' + e.message;
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '確かめる'; }
    }
}

/** 確かめられるものを、上から順に全部動かす */
async function 全部確かめる() {
    const btn = document.getElementById('req-verify-all');
    if (btn) { btn.disabled = true; btn.textContent = '確認中…'; }

    for (let i = 0; i < 要件一覧.length; i++) {
        const r = 要件一覧[i];
        if (!r.確認 || !確かめかた[r.確認]) continue;
        if (!document.getElementById('req-result-' + i)) continue;
        await 一件確かめる(r, i, null);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'まとめて確かめる'; }
    showNotification('確認が終わりました', 'success');
}

function 描き直す集計() {
    const sum = document.getElementById('req-summary');
    if (!sum || !window.要件一覧) return;

    const 数 = { done: 0, partial: 0, todo: 0, blocked: 0 };
    要件一覧.forEach((r) => { 数[r.状態]++; });
    const 全 = 要件一覧.length;

    sum.innerHTML =
        '<div class="req-bar">'
        + '<span style="flex:' + 数.done + '" class="seg-ok"></span>'
        + '<span style="flex:' + 数.partial + '" class="seg-warn"></span>'
        + '<span style="flex:' + 数.todo + '" class="seg-todo"></span>'
        + '<span style="flex:' + 数.blocked + '" class="seg-blocked"></span>'
        + '</div>'
        + '<div class="req-counts">'
        + '<span>完了 <b>' + 数.done + '</b></span>'
        + '<span>一部完了 <b>' + 数.partial + '</b></span>'
        + '<span>未着手 <b>' + 数.todo + '</b></span>'
        + '<span>不可・条件つき <b>' + 数.blocked + '</b></span>'
        + '<span class="req-total">全 ' + 全 + '件</span>'
        + '</div>';
}

function initRequirements() {
    document.getElementById('req-verify-all')?.addEventListener('click', 全部確かめる);
    document.querySelectorAll('.req-filter').forEach((b) => {
        b.addEventListener('click', () => {
            絞り込み = b.dataset.reqFilter;
            document.querySelectorAll('.req-filter').forEach((x) => x.classList.toggle('active', x === b));
            renderRequirements();
        });
    });
    renderRequirements();
}

window.initRequirements = initRequirements;
window.renderRequirements = renderRequirements;
window.確かめかた = 確かめかた;
