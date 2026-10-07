/**
 * エージェント（JARVIS・コンソール）の「脳」として、Grok（xAI）を使えるようにする
 *
 * Claude連携.js / Gemini連携.js と同じ役目。
 * 使うのは「脳: Grok」に切り替え、かつ Grok APIキーを設定し、
 * 「お金がかかる機能」で Grok を許可した人だけ。既定は自作AIのまま。
 */

async function Grokでエージェントの意図を判定する(発言, 操作たち, 直近の会話, persona, page) {
    発言 = (発言 || '').trim();
    if (!発言) return { ok: false, 訳: '発言が空です' };

    const policy = AReGLM_CONTENT_POLICY.validate(発言);
    if (!policy.ok) {
        return { ok: true, 操作id: null, 材料: '', 会話の返事: policy.message };
    }

    if (typeof 使ってよいか === 'function' && !使ってよいか('grok')) {
        return { ok: false, 訳: '設定 → お金がかかる機能 で Grok を許可してください' };
    }

    const key = await AReGLM_SECURITY.loadApiKeySecure('ai', 'grok');
    if (!key) return { ok: false, 訳: 'Grok APIキーが未設定です' };

    const 操作の説明 = (typeof _操作の説明JS === 'function')
        ? _操作の説明JS(操作たち)
        : (操作たち || []).map((a) => `・${a.id}`).join('\n');

    const 担当選択 = (typeof エージェントを選ぶ詳細JS === 'function')
        ? エージェントを選ぶ詳細JS(page, 発言) : { id: null, 引き継ぎ元: null };
    const 担当指示 = 担当選択.id && typeof エージェントの指示文JS === 'function'
        ? エージェントの指示文JS(担当選択.id, 担当選択.引き継ぎ元) : '';

    let 会話文 = '';
    if (直近の会話 && 直近の会話.length) {
        会話文 = 直近の会話.slice(-6)
            .map((m) => `${m.role === 'user' ? 'ユーザー' : 'あなた'}: ${(m.text || '').slice(0, 200)}`)
            .join('\n');
    }

    const 指示 = 'あなたは「アレラム」という名前の、ARELMというアパレルブランド運営ツールの'
        + '中で動くエージェントです。ユーザーの発言を読み、'
        + '次の「実行できる操作」の中から最も合うものを一つだけ選ぶか、'
        + 'どれにも当てはまらなければ、あなた自身が自然に会話で返事をしてください。\n\n'
        + (担当指示 ? `【担当】\n${担当指示}\n\n` : '')
        + (persona ? `【話し方】\n${persona}\n\n` : '')
        + `【実行できる操作】\n${操作の説明}\n`
        + (会話文 ? `\n【直前までの会話】\n${会話文}\n` : '')
        + '\n必ず次のJSON形式だけで答えてください。前置きやコード囲みは書かないでください。\n'
        + '{"操作id": "一覧の識別子またはnull", "材料": "", "会話の返事": "..."}\n';

    let 答え;
    try {
        const data = await AReGLM_API_CLIENT.grok(key, {
            model: 'grok-4.7',
            max_tokens: 400,
            temperature: 0.2,
            messages: [
                { role: 'system', content: 指示 },
                { role: 'user', content: `【ユーザーの発言】\n${発言}` },
            ],
        });
        答え = data.choices?.[0]?.message?.content || '';
    } catch (err) {
        return { ok: false, 訳: `Grokから答えが得られませんでした: ${err.message}` };
    }
    if (!答え) return { ok: false, 訳: 'Grokから答えが得られませんでした' };

    const 担当情報 = 担当選択.id && typeof エージェント情報JS === 'function'
        ? エージェント情報JS(担当選択.id, 担当選択.引き継ぎ元) : null;

    const 取り出す = (typeof _JSONを取り出すJS === 'function')
        ? _JSONを取り出すJS
        : (文) => {
            const 始 = 文.indexOf('{');
            const 終 = 文.lastIndexOf('}');
            if (始 < 0 || 終 <= 始) return null;
            try { return JSON.parse(文.slice(始, 終 + 1)); } catch { return null; }
        };

    const 決めた = 取り出す(答え);
    if (!決めた || typeof 決めた !== 'object') {
        return { ok: true, 操作id: null, 材料: '', 会話の返事: 答え.trim(), agent: 担当情報 };
    }

    const 操作id一覧 = new Set((操作たち || []).map((a) => a.id));
    let 操作id = 決めた['操作id'];
    if (typeof 操作id === 'string') {
        操作id = 操作id.trim().replace(/^[「」]+|[「」]+$/g, '');
        if (操作id.toLowerCase().startsWith('id=')) 操作id = 操作id.slice(3).trim();
        操作id = 操作id || null;
    }
    const 会話の返事 = (決めた['会話の返事'] || '').trim();
    const 材料 = typeof 決めた['材料'] === 'string' ? 決めた['材料'] : '';

    if (操作id !== null && !操作id一覧.has(操作id)) {
        return {
            ok: true, 操作id: null, 材料: '',
            会話の返事: 会話の返事 || `「${操作id}」という操作は無いようです。言い方を変えてもらえますか。`,
            agent: 担当情報,
        };
    }

    return {
        ok: true,
        操作id,
        材料,
        会話の返事: 会話の返事 || (操作id ? '' : 答え.trim()),
        agent: 担当情報,
    };
}

// Grokを使うか() は chat.js 側で定義する（二重定義するとページ全体が止まる）。
window.Grokでエージェントの意図を判定する = Grokでエージェントの意図を判定する;
