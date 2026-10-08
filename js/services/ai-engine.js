/**
 * 公式無料AI — API Gateway経由で実呼び出し
 */
const AReGLM_AI_ENGINE = {
    async getKey(provider) {
        return AReGLM_SECURITY.loadApiKeySecure('ai', provider);
    },

    buildPrompt(history, userText, mode) {
        const hints = {
            chat: '会話・質問に答えてください。',
            analyze: 'ファッション・アパレル視点で分析。URL・資料の内容を踏まえてください。',
            learn: '学習ノート形式で体系的に説明。',
            create: '商品アイデア・コピー・テックパック要素・モックアップ指示を具体的に。',
            image: '画像生成用の詳細プロンプト（英語）を1段落で出力し、その後に日本語の説明を付けてください。',
            mockup: 'モックアップ仕様（シルエット・素材・カラー・寸法）を箇条書きで。',
            techpack: 'テックパック項目（品番・素材・サイズ・縫製・付属）を表形式で。'
        };
        let p = `${AReGLM_CONTENT_POLICY.systemRules}\n${hints[mode] || hints.chat}\nARELMブランド・SUZURIショップ(suzuri.jp/areglm)向け。\n\n`;

        // 学習エンジンで蓄積した傾向を差し込み、使うほど回答がARELMの実態に沿うようにする
        const learned = window.AReGLM_LEARNING?.getContextSummary?.();
        if (learned) p += `${learned}\n`;

        history.slice(-10).forEach((m) => {
            p += `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text || ''}\n`;
        });
        p += `ユーザー: ${userText}`;
        return p;
    },

    buildGeminiPayload(history, userText, attachments, mode) {
        const parts = [{ text: this.buildPrompt(history, userText, mode) }];
        for (const att of attachments || []) {
            if (att.type === 'image' && att.data?.startsWith('data:image')) {
                parts.push({
                    inline_data: {
                        mime_type: att.data.match(/data:([^;]+)/)?.[1] || 'image/png',
                        data: att.data.split(',')[1]
                    }
                });
            }
            if (att.type === 'url') parts[0].text += `\n\n参照URL: ${att.data}`;
            if (att.type === 'video') parts[0].text += `\n\n動画URL（分析対象）: ${att.data}`;
        }
        return {
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
            safetySettings: [
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' }
            ]
        };
    },

    parseGeminiText(data) {
        const t = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        if (!t) throw new Error('AI応答が空です。安全フィルタまたはクォータを確認してください。');
        return t;
    },

    async callGemini(key, history, userText, attachments, mode) {
        const payload = this.buildGeminiPayload(history, userText, attachments, mode);
        const gateway = await AReGLM_API_CLIENT.health();

        if (gateway) {
            const data = await AReGLM_API_CLIENT.gemini(key, payload);
            return this.parseGeminiText(data);
        }

        // 外へ出る経路は、残さない。
        //
        // ストッパーが見つけた。
        // ゲートウェイが動いていないときに、ここから直接出ようとしていた。
        // 関所が止めるとはいえ、経路が無いほうが確かで、
        // 誰かが関所を外したときにも漏れない。
        //
        // お金の確認も、ゲートウェイ側にしかない。
        // ここを通ると、確認なしで課金される。
        throw new Error(
            'ゲートウェイが動いていないため、外部AIにつなげません。'
            + '直接つなぐことはしません（外へ出る経路を残さず、'
            + 'お金の確認を飛ばさないため）。自作AIで答えます。');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Gemini ${res.status}`);
        return this.parseGeminiText(data);
    },

    /**
     * Claude（Anthropic）に聞く。
     *
     * 会話の中身が外部（Anthropic）へ送られる。従量課金。
     * 本人が明示的に許可した場合だけここへ来る（paid-guardが関所）。
     * 画像の添付にも対応する。
     */
    async callClaude(key, history, userText, attachments, mode) {
        const content = [];
        for (const att of attachments || []) {
            if (att.type === 'image' && att.data?.startsWith('data:image')) {
                content.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: att.data.match(/data:([^;]+)/)?.[1] || 'image/png',
                        data: att.data.split(',')[1],
                    },
                });
            }
            if (att.type === 'url') userText += `\n\n参照URL: ${att.data}`;
            if (att.type === 'video') userText += `\n\n動画URL（分析対象）: ${att.data}`;
        }
        content.push({ text: this.buildPrompt([], userText, mode), type: 'text' });

        const messages = [
            ...history.slice(-10)
                .filter((m) => m.text)
                .map((m) => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.text,
                })),
            { role: 'user', content },
        ];

        const payload = {
            model: 'claude-sonnet-5',
            max_tokens: 4096,
            system: AReGLM_CONTENT_POLICY.systemRules,
            messages,
        };

        const data = await AReGLM_API_CLIENT.claude(key, payload);
        const text = (data.content || [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');
        if (!text) throw new Error('Claudeの応答が空でした。');
        return text;
    },

    async callGroq(key, history, userText, mode) {
        const messages = [
            { role: 'system', content: AReGLM_CONTENT_POLICY.systemRules },
            ...history.slice(-10).map((m) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.text || ''
            })),
            { role: 'user', content: userText }
        ];
        const payload = { model: 'llama-3.3-70b-versatile', messages, max_tokens: 4096, temperature: 0.7 };

        if (await AReGLM_API_CLIENT.health()) {
            const data = await AReGLM_API_CLIENT.groq(key, payload);
            return data.choices?.[0]?.message?.content || '';
        }

        // 外へ出る経路は、残さない。
        //
        // 審査員が見つけた。
        // 「関所が止めているから大丈夫」では足りない。
        // 経路そのものが無いほうが確かで、
        // 誰かが関所を外したときにも、ここから漏れない。
        //
        // 外部AIが要るなら、ゲートウェイ（この端末内）を通す。
        // そこには許可リストと、お金の確認がある。
        throw new Error(
            'このツールは外部AIへ直接つなぎません。'
            + '自作AIで答えます（設定 → お金がかかる機能 から、'
            + 'ゲートウェイ経由で外部を使うことは選べます）。');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Groq ${res.status}`);
        return data.choices?.[0]?.message?.content || '';
    },

    /**
     * 画像生成
     * options で拡散モデルのパラメータを指定できる。
     * - steps: デノイズの反復回数。多いほど破綻が減るが生成時間が伸びる
     * - guidance: プロンプトへの忠実度。高すぎると不自然になる
     * - negativePrompt: 出したくない要素（手の破綻・低画質など）
     */
    async generateImage(provider, prompt, options = {}) {
        const policy = AReGLM_CONTENT_POLICY.validate(prompt);
        if (!policy.ok) throw new Error(policy.message);

        if (provider === 'huggingface') {
            const key = await this.getKey('huggingface');
            if (!key) throw new Error('Hugging Face APIキーを設定してください');

            const parameters = {};
            if (options.negativePrompt) parameters.negative_prompt = options.negativePrompt;
            if (options.steps) parameters.num_inference_steps = Number(options.steps);
            if (options.guidance) parameters.guidance_scale = Number(options.guidance);

            const payload = { inputs: prompt };
            if (Object.keys(parameters).length) payload.parameters = parameters;

            const data = await AReGLM_API_CLIENT.huggingface(key, 'stabilityai/stable-diffusion-xl-base-1.0', payload);
            return data.image;
        }

        if (provider === 'cloudflare') {
            const accountId = localStorage.getItem('areglm_cloudflare_account_id') || '';
            const token = await this.getKey('cloudflare');
            if (!accountId || !token) throw new Error('CloudflareのAccount ID・APIトークンを設定してください');

            const data = await AReGLM_API_CLIENT.cloudflare(
                accountId, token, '@cf/stabilityai/stable-diffusion-xl-base-1.0', { prompt });
            return data.image;
        }

        // この端末の中のComfyUIは無料・外部送信なしだが、この端末のメモリでは
        // モデルの読み込みだけで容量ぎりぎりになり、1枚に十分〜数十分かかることがある
        // （2026-09-07、本人からの「遅すぎて画像が作れない」との指摘で確認）。
        // Hugging Face の鍵が設定・許可済みなら、そちらを先に試して速く済ませる
        // （無料枠あり・外部へ送る。設定と「お金がかかる機能」の両方の許可が要る＝
        // 既存の二重の関門はそのまま）。無ければ、これまでどおりComfyUIへ進む。
        if (typeof 使ってよいか === 'function' && 使ってよいか('huggingface')) {
            const hfKey = await this.getKey('huggingface');
            if (hfKey) {
                try {
                    return await this.generateImage('huggingface', prompt, options);
                } catch (e) {
                    // 失敗しても諦めない。次の道（Cloudflare→ComfyUI）へ回す。
                    console.warn('[画像生成] Hugging Faceで失敗、次を試します:', e.message);
                }
            }
        }
        if (typeof 使ってよいか === 'function' && 使ってよいか('cloudflare')) {
            const cfAccountId = localStorage.getItem('areglm_cloudflare_account_id') || '';
            const cfToken = await this.getKey('cloudflare');
            if (cfAccountId && cfToken) {
                try {
                    return await this.generateImage('cloudflare', prompt, options);
                } catch (e) {
                    console.warn('[画像生成] Cloudflareで失敗、ComfyUIへ切り替えます:', e.message);
                }
            }
        }

        // この端末の中の ComfyUI（無料・完全ローカル）で作る。外部のAPIキーは要らない。
        // ComfyUIが動いていなければ null が返るので、その下の道へ続ける。
        const 絵 = await this.generateImageLocally(prompt);
        if (絵) return 絵;

        const geminiKey = await this.getKey('gemini');
        if (!geminiKey) {
            // 外部の鍵が無くても止まらないよう、自作の図案づくりへ回す。
            // 「キーが必要です」で終わらせると、何もできなくなるため。
            if (typeof 図案をつくる === 'function') return 図案をつくる(prompt, options || {});
            throw new Error('画像を作る仕組みが読み込まれていません');
        }

        const text = await this.callGemini(geminiKey, [], `以下のファッション商品画像を生成するための詳細ビジュアル説明:\n${prompt}`, [], 'image');
        return { type: 'description', text, note: 'Imagen APIはGeminiキーで有効な場合、今後の更新で画像バイナリを返します。説明を元に制作してください。' };
    },

    /**
     * ComfyUI（この端末の中だけ）に絵を頼み、できるまで様子を見る。
     *
     * 数分かかる。ComfyUIが動いていない・失敗したときは null を返し、
     * 呼び出し側が別の道（自作の図案づくり等）に回せるようにする。
     */
    async generateImageLocally(prompt, タイムアウトms = 9 * 60 * 1000) {
        try {
            const 開始 = await fetch('/api/image/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ プロンプト: prompt }),
            }).then((r) => r.json());

            if (!開始 || !開始['仕事id']) return null;
            const 仕事id = 開始['仕事id'];

            const 締切 = Date.now() + タイムアウトms;
            while (Date.now() < 締切) {
                await new Promise((r) => setTimeout(r, 5000));
                const 状態 = await fetch(`/api/image/status?id=${encodeURIComponent(仕事id)}`)
                    .then((r) => r.json()).catch(() => null);
                if (!状態) continue;

                if (状態['終わったか']) {
                    if (状態.ok && 状態['ファイル名']) {
                        const q = new URLSearchParams({
                            filename: 状態['ファイル名'],
                            subfolder: 状態['サブフォルダ'] || '',
                            type: 状態['種類'] || 'output',
                        });
                        return {
                            type: 'image',
                            data: `/api/image/view?${q}`,
                            note: 'この端末の中のComfyUI（Flux.2 Klein）で作りました。',
                        };
                    }
                    return { type: 'description', text: 状態['訳'] || '画像を作れませんでした。' };
                }
            }
            return { type: 'description', text: '時間がかかりすぎたため、いったん諦めました。' };
        } catch {
            return null;   // ComfyUIに繋がらない等。呼び出し側で別の道へ。
        }
    },

    async complete({ provider, history, userText, attachments, mode }) {
        const policy = AReGLM_CONTENT_POLICY.validate(userText);
        if (!policy.ok) throw new Error(policy.message);

        if (mode === 'image' && provider === 'huggingface') {
            const img = await this.generateImage('huggingface', userText);
            return typeof img === 'string' ? `画像を生成しました。` : JSON.stringify(img);
        }

        // Claudeは明示的に選ばれたときだけ。鍵が無ければ他へは回さず、
        // 何が要るかをはっきり伝える（黙って別のAIに送らない）。
        if (provider === 'claude') {
            const claudeKey = await this.getKey('claude');
            if (!claudeKey) {
                throw new Error('Claude APIキーが未設定です。設定 → 外部AI（Claude）から登録してください。');
            }
            return this.callClaude(claudeKey, history, userText, attachments, mode);
        }

        let key = await this.getKey(provider);
        if (!key) {
            key = await this.getKey('gemini');
            provider = 'gemini';
        }
        if (!key) {
            key = await this.getKey('groq');
            provider = 'groq';
        }
        if (!key) {
            const gw = await AReGLM_API_CLIENT.health();
            throw new Error(
                gw
                    ? '設定（⚙）で Gemini / Groq / Hugging Face の無料APIキーを登録してください。'
                    : 'サーバーを起動してください: cd server && npm install && npm start'
            );
        }

        if (provider === 'groq') return this.callGroq(key, history, userText, mode);
        return this.callGemini(key, history, userText, attachments, mode);
    }
};

window.AReGLM_AI_ENGINE = AReGLM_AI_ENGINE;
