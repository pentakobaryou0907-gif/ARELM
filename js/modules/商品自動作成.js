/**
 * エージェントへの指示から、商品を自動で作る
 *
 * これまでは「Tシャツを作って」と話しかけても、商品開発ページを
 * 開くだけで、実際には何も作られなかった（操作の一覧に
 * 「商品を作る」という項目自体が無かったため）。
 *
 * ここでは、指示だけで
 *   1. 商品名・デザインの説明をLLMで読み取る
 *   2. デザイン画像をこの端末の中（ComfyUI）で生成する
 *   3. SUZURIへ素材をアップロード・商品として登録する（js/modules/product-dev.js の共通処理）
 * まで自動で行う。
 *
 * 正直に書いておくこと:
 *   ・SUZURIのAPIトークンが未設定なら、画像生成に時間をかける前に止めて伝える。
 *   ・画像生成はこの端末のComfyUIが動いていないと失敗する。失敗したときは
 *     作り話の画像を使わず、正直に「作れなかった」と止める。
 *   ・既存商品と似すぎている場合は、人の目視確認なしには進めない
 *     （自動作成では confirm() のダイアログが使えないため、似すぎなら必ず止める）。
 */

const 商品自動作成_アイテム候補 = [
    { id: 1, name: 'Tシャツ', words: ['tシャツ', 'ティーシャツ', 'シャツ'] },
    { id: 2, name: 'トートバッグ', words: ['トートバッグ', 'バッグ', '鞄'] },
    { id: 3, name: 'スマホケース', words: ['スマホケース', 'iphoneケース', 'ケース'] },
    { id: 4, name: 'タオル', words: ['タオル'] },
    { id: 5, name: 'ポスター', words: ['ポスター'] },
    { id: 8, name: 'ロングスリーブT', words: ['ロングスリーブ', 'ロンt', '長袖'] },
    { id: 9, name: 'タンブラー', words: ['タンブラー'] },
];

function 商品自動作成_アイテムを推定(text) {
    const t = (text || '').toLowerCase();
    for (const c of 商品自動作成_アイテム候補) {
        if (c.words.some((w) => t.includes(w))) return c;
    }
    return 商品自動作成_アイテム候補[0]; // 既定はTシャツ
}

/** 指示文から、商品名・デザインの説明をLLMに読み取ってもらう（JSON形式） */
async function 商品自動作成_情報を読み取る(指示文) {
    try {
        const r = await fetch('/api/ai-local/code-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: '次はアパレル商品を作ってほしいという指示です。商品名（15文字以内・日本語）と、'
                    + 'デザイン画像を生成するための説明（英語・見た目の具体的な特徴のみ、40語程度）を、'
                    + '次のJSON形式だけで答えてください。前置きや説明文、コードの囲みは書かないでください。\n'
                    + '{"商品名": "...", "デザイン説明": "..."}\n\n'
                    + `【指示】\n${指示文}`,
            }),
        }).then((y) => y.json());
        if (!r.ok || !r.answer) return null;
        const m = r.answer.match(/\{[\s\S]*\}/);
        if (!m) return null;
        const j = JSON.parse(m[0]);
        return { name: (j.商品名 || '').trim(), designPrompt: (j.デザイン説明 || '').trim() };
    } catch {
        return null;
    }
}

async function 商品を自動で作る(指示文, target) {
    const 出す = (text) => {
        if (typeof appendConsoleLine === 'function') appendConsoleLine('assistant', text, target);
    };

    // このコマンドの run() の戻り値は、呼び出し元（判定した操作を実行する）が
    // 最後に1行だけ表示する。途中経過は 出す() で直接足していき、
    // 最後のひと言だけを return する（両方で最後の一言を出すと二重になるため）。

    if (!指示文 || !指示文.trim()) {
        return '何を作るか、もう少し具体的に教えてください（例:「デニムジャケットを作って」）。';
    }

    // SUZURIトークンが無いなら、画像生成に時間をかける前に止めて伝える。
    const token = await AReGLM_SUZURI.getToken();
    if (!token) {
        return 'SUZURIのAPIトークンが未設定のため、商品として登録できません。'
            + '設定（⚙）→ SUZURI連携 から、トークンを入れてください。';
    }

    出す(`「${指示文}」ですね。商品名とデザインを考えています…`);
    const 情報 = await 商品自動作成_情報を読み取る(指示文);
    const name = (情報?.name || 指示文.slice(0, 15)).trim();
    const designPrompt = 情報?.designPrompt || 指示文;
    const アイテム = 商品自動作成_アイテムを推定(指示文);

    出す(`商品名: ${name} / アイテム: ${アイテム.name}\nデザイン画像を作っています…`
        + '（この端末の中で作るため、数分かかることがあります）');

    let 画像;
    try {
        画像 = await AReGLM_LOCAL_FIRST.generateImage(
            'local',
            `${designPrompt}, high quality apparel product photography, sharp focus, detailed fabric texture`,
            { negativePrompt: typeof AREGLM_NEGATIVE_PROMPT !== 'undefined' ? AREGLM_NEGATIVE_PROMPT : undefined }
        );
    } catch (err) {
        return `デザイン画像を作れませんでした: ${err.message}`;
    }

    if (!画像 || 画像.type !== 'image' || !画像.data) {
        return 'デザイン画像を自動で作れませんでした（この端末のComfyUIが動いていないか、時間切れになりました）。'
            + '「開発」タブの「AI 服デザイン生成」で試すか、画像を手元で用意して「商品開発」から作成してください。';
    }

    // 画像URL（/api/image/view?...）を、SUZURIへ送れる形（dataURL）に変換する。
    let dataUrl;
    try {
        const blob = await fetch(画像.data).then((r) => r.blob());
        dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('読み込みに失敗しました'));
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        return `作った画像を読み込めませんでした: ${err.message}`;
    }

    出す('SUZURIへ登録しています…');
    const 結果 = await SUZURI商品を作る({
        name, itemType: アイテム.id, description: 指示文, materialDataUrl: dataUrl,
    });

    if (typeof showNotification === 'function') {
        showNotification(結果.message, 結果.ok ? 'success' : 'error');
    }
    return 結果.message;
}

window.商品を自動で作る = 商品を自動で作る;
