/**
 * まず自作AIで、が既定
 *
 * なぜこれが要るのか:
 *   文章を作る場所が7つあり、そのすべてが外部AI（Gemini等）を
 *   呼んでいた。キーが無いと、どこも動かなかった。
 *
 *   「外部に頼らない」が前提のツールで、
 *   外部が無いと何もできないのでは、話が逆になっている。
 *
 * ここでやること:
 *   外部AIを呼んでいた入口をそのまま受け取り、
 *   自作AIで答えられるものは自作AIで答える。
 *
 *   一つひとつの呼び出し元を書き換えると、
 *   直し漏れが必ず出るため、ここで一本化する。
 *
 * 外部AIを使いたいときは、明示的に選んだときだけ通す。
 * 黙って外へ出さないための決まり。
 */

const AReGLM_LOCAL_FIRST = {

    /**
     * 文章を作る。
     *
     * 用途（mode）ごとに、自作AIの型に振り分ける。
     * 型に当てはまらないものは、会話として答える。
     */
    async complete({ provider, history, userText, attachments, mode, prompt } = {}) {
        const 文 = userText || prompt || '';

        // 外部AIを自分で選んだときだけ、外へ出す。
        // ただし、お金がかかるものは許可されていなければ止める。
        if (provider && provider !== 'local') {
            if (typeof 使う前に確かめる === 'function' && !使う前に確かめる(provider)) {
                // 止めるだけで終わらせず、自作で答える。
                // 「使えません」で行き止まりにしないため。
                return this.complete({ provider: 'local', history, userText: 文, attachments, mode });
            }
            return AReGLM_AI_ENGINE.complete({ provider, history, userText: 文, attachments, mode });
        }

        // --- 型に当てはまるものは、型で作る ---
        const 型 = this._用途から型(mode, 文);
        if (型) {
            const r = await this._送る('/api/ai-local/generate', {
                template: 型,
                fields: this._文から材料(文, 型),
            });

            const 出 = r && r.outputs && r.outputs[0];
            if (出) return 出;

            // 足りない項目があるときは、それを聞き返す。
            //
            // 以前はここで空の返事になり、
            // 何も出ないまま終わっていた。
            // 何が足りないかを言えば、続けて答えてもらえる。
            if (r && r.missingLabels && r.missingLabels.length) {
                return `${r.missingLabels.join('、')}を教えてください。\n\n`
                    + `例:「${r.missingLabels.map((x) => x + 'は〇〇').join('、')}」`;
            }

            // 型で作れなかったときは、会話に回す。
        }

        // --- 会話として答える ---
        const r = await this._送る('/api/ai-local/chat', {
            text: 文,
            session_id: typeof getSessionId === 'function' ? getSessionId() : 'local-first',
            context: {
                today: typeof 今日 === 'function' ? 今日() : '',
                products: this._読む('products'),
                tasks: this._読む('areglm_tasks'),
                events: this._読む('areglm_events'),
                mode,
            },
        });

        if (!r) throw new Error('自作AIが応答しません。設定 → 自己点検で状態を確かめてください。');

        let 返事 = r.answer || '';
        if (r.sources?.length) 返事 += `\n\n（根拠: ${r.sources.join('、')}）`;
        return 返事 || '（答えが空でした）';
    },

    /**
     * 画像を作る。
     *
     * 以前はここで provider:'local' のとき、いきなり SVG の簡易図案
     * （図案をつくる）へ回していた。この端末には ComfyUI（Flux.2 Klein、
     * js/services/ai-engine.js の generateImageLocally）が既にあり、
     * 商品自動作成・AI服デザイン生成の両方が「ComfyUIで作る」つもりで
     * 呼んでいたのに、実際には一度もComfyUIへ届いていなかった
     * （SVGの簡易図案止まりで、写真的な画像は作れていなかった）。
     *
     * まずこの端末のComfyUIを試し、動いていない・失敗したときだけ
     * SVGの簡易図案にフォールバックする。
     */
    async generateImage(provider, prompt, options = {}) {
        if (provider && provider !== 'local') {
            if (typeof 使う前に確かめる === 'function' && !使う前に確かめる(provider)) {
                return this.generateImage('local', prompt, options);
            }
            return AReGLM_AI_ENGINE.generateImage(provider, prompt, options);
        }

        if (typeof AReGLM_AI_ENGINE !== 'undefined' && typeof AReGLM_AI_ENGINE.generateImageLocally === 'function') {
            try {
                const 絵 = await AReGLM_AI_ENGINE.generateImageLocally(prompt);
                if (絵 && 絵.type === 'image' && 絵.data) return 絵;
            } catch {
                // ComfyUIに繋がらない等。下のSVGの簡易図案へ回す。
            }
        }

        if (typeof 図案をつくる !== 'function') {
            return {
                type: 'description',
                text: '画像を作る仕組みが読み込まれていません。',
                note: '',
            };
        }
        return 図案をつくる(prompt, options);
    },

    /* ---------- 中で使う道具 ---------- */

    /**
     * 用途と文から、どの型で作るかを決める。
     *
     * 決められないときは null を返し、会話に回す。
     * 無理に型へ当てはめると、見当違いの文章が出るため。
     */
    _用途から型(mode, 文) {
        const 低 = (文 || '').toLowerCase();

        if (mode === 'techpack' || 低.includes('テックパック')) return 'techpack_note';
        if (mode === 'mockup') return 'product_description';
        if (低.includes('商品説明') || 低.includes('説明文')) return 'product_description';
        if (低.includes('sns') || 低.includes('投稿文') || 低.includes('インスタ')) return 'sns_post';
        if (低.includes('発注') && 低.includes('メール')) return 'order_mail';
        return null;
    },

    /**
     * 文から、型に流し込む材料を拾う。
     *
     * 拾えないものは空のままにする。
     * 分からない値を埋めると、それが嘘になるため。
     */
    _文から材料(文, 型) {
        const 材料 = {};

        // 型ごとに、名前を入れる場所が違う。
        // 発注メールは「品名」、商品説明は「商品名」のように。
        // ここを取り違えると、値はあるのに足りないと言われてしまう。
        const 名前の入れ場所 = {
            order_mail: 'item',
            techpack_note: 'item',
        }[型] || 'name';

        const 名 = 文.match(/(?:商品名|品名|名前)[はが:：]\s*([^\s、。]+)/);
        if (名) 材料[名前の入れ場所] = 名[1];

        const 会社 = 文.match(/(?:会社名|工場名|取引先)[はが:：]\s*([^\s、。]+)/);
        if (会社) 材料.company = 会社[1];

        const 数 = 文.match(/(\d+)\s*(?:枚|個|点|着|本)/);
        if (数) 材料.quantity = Number(数[1]);

        const 素 = 文.match(/(?:素材|生地)[はが:：]?\s*([^\s、。]+)/);
        if (素) 材料.material = 素[1];

        const 値 = 文.match(/(\d[\d,]*)\s*円/);
        if (値) 材料.price = Number(値[1].replace(/,/g, ''));

        // 名前が拾えないときは、文そのものを名前として渡す。
        // 空で渡すと型が組み立てられないため。
        if (!材料[名前の入れ場所]) 材料[名前の入れ場所] = 文.slice(0, 40);

        return 材料;
    },

    _読む(鍵) {
        try {
            const r = JSON.parse(localStorage.getItem(鍵) || '[]');
            return Array.isArray(r) ? r : [];
        } catch {
            return [];
        }
    },

    async _送る(道, 中身) {
        try {
            const r = await fetch(道, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(中身),
            });
            return r.ok ? r.json() : null;
        } catch {
            return null;
        }
    },
};

window.AReGLM_LOCAL_FIRST = AReGLM_LOCAL_FIRST;
