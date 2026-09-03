/**
 * エージェント（JARVIS・コンソール）の「脳」として、Claudeを使えるようにする
 *
 * これまで「脳: Claude」の切り替え（js/modules/chat.js）は、AIチャットの
 * 会話にしか効かなかった。指示を実行するエージェント（在庫を開く・
 * 商品を作って等の判定）は、常にこの端末のローカルLLM（Ollama・7B）が
 * 判定していた。7Bモデルは取り違えることがあり（実際に見つかった不具合の
 * いくつもの原因）、本人がすでに「今の脳はClaudeでいい」と決めているのに、
 * エージェント側にはその決定が反映されていなかった。
 *
 * ここでは、server/ai/エージェントの意図判定.py と同じ役目を、
 * Claudeへ直接（この端末のGateway経由・許可リスト付き）頼む形で用意する。
 * Python側は起動直後に外部通信そのものを遮断しているため、
 * Claudeを呼ぶならクライアント（この端末のブラウザ）側からになる。
 *
 * 使うのは「脳: Claude」に切り替え、かつClaude APIキーを設定した人だけ。
 * 既定は自作AI（ローカルLLM）のまま変わらない。
 */

function _操作の説明JS(操作たち) {
    return (操作たち || [])
        .map((a) => {
            const 例文 = (a.examples || []).slice(0, 4).join('、');
            const 材料要る = a.needsArg ? 'あり（残りの言葉を渡す）' : 'なし';
            return `・${a.id}（${a.label || ''}／言い方の例:「${例文}」／引数:${材料要る}）`;
        })
        .join('\n');
}

function _JSONを取り出すJS(文) {
    const 始 = 文.indexOf('{');
    const 終 = 文.lastIndexOf('}');
    if (始 < 0 || 終 < 0 || 終 <= 始) return null;
    try {
        return JSON.parse(文.slice(始, 終 + 1));
    } catch {
        return null;
    }
}

/**
 * Claudeに、発言→操作（または会話の返事）を判定してもらう。
 * server/ai/エージェントの意図判定.py の 意図を選ぶ() とできる限り同じ形で返す。
 */
async function Claudeでエージェントの意図を判定する(発言, 操作たち, 直近の会話, persona, page) {
    発言 = (発言 || '').trim();
    if (!発言) return { ok: false, 訳: '発言が空です' };

    const policy = AReGLM_CONTENT_POLICY.validate(発言);
    if (!policy.ok) {
        return { ok: true, 操作id: null, 材料: '', 会話の返事: policy.message };
    }

    const key = await AReGLM_SECURITY.loadApiKeySecure('ai', 'claude');
    if (!key) return { ok: false, 訳: 'Claude APIキーが未設定です' };

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

    const 指示 = 'あなたは「アレラム」という名前の、AReGLMというアパレルブランド運営ツールの'
        + '中で動くエージェントです。ユーザーの発言を読み、'
        + '次の「実行できる操作」の中から最も合うものを一つだけ選ぶか、'
        + 'どれにも当てはまらなければ、あなた自身が自然に会話で返事をしてください。\n\n'
        + (担当指示 ? `【担当（"会話の返事"を書くときだけ、この立場で。操作idの選び方には影響させないでください）】\n${担当指示}\n\n` : '')
        + (persona ? `【話し方の指示（本人が設定した口調。"会話の返事"を書くときだけ守り、操作idの選び方には影響させないでください）】\n${persona}\n\n` : '')
        + `【実行できる操作】\n${_操作の説明JS(操作たち)}\n`
        + (会話文 ? `\n【直前までの会話】\n${会話文}\n` : '')
        + '\n必ず、次のJSON形式だけで答えてください。前置きや説明文、コードの囲みは書かないでください。\n'
        + '・操作に当てはまる場合: {"操作id": "上の一覧の先頭にある識別子そのもの（例: goto-inventory）", "材料": "操作に渡す残りの言葉（無ければ空文字）", "会話の返事": ""}\n'
        + '・操作に当てはまらず、あなたが会話で答える場合: {"操作id": null, "材料": "", "会話の返事": "ユーザーへの自然な日本語の返事をここに書く"}\n'
        + '・"操作id" と "会話の返事" は別々の項目です。混ぜて一つにまとめないでください。\n'
        + '・操作idには、一覧にある識別子をそのまま書いてください。「id=」やかっこなど、余計な文字を付け足さないでください。\n'
        + '・一覧に無いidは、絶対に作らないでください。\n'
        + '・分からないことは、知ったかぶりせず正直に「分かりません」と会話の返事に書いてください。\n'
        + '・会話の返事を空文字のままにしないでください。必ず何か書いてください。';

    let 答え;
    try {
        const data = await AReGLM_API_CLIENT.claude(key, {
            model: 'claude-sonnet-5',
            max_tokens: 300,
            system: 指示,
            messages: [{ role: 'user', content: `【ユーザーの発言】\n${発言}` }],
        });
        答え = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    } catch (err) {
        return { ok: false, 訳: `Claudeから答えが得られませんでした: ${err.message}` };
    }
    if (!答え) return { ok: false, 訳: 'Claudeから答えが得られませんでした' };

    const 担当情報 = 担当選択.id && typeof エージェント情報JS === 'function'
        ? エージェント情報JS(担当選択.id, 担当選択.引き継ぎ元) : null;

    const 決めた = _JSONを取り出すJS(答え);
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
        材料: (決めた['材料'] || '').trim(),
        会話の返事: 操作id === null && !会話の返事
            ? 'うまく言葉にできませんでした。もう一度、違う言い方で伝えてもらえますか。'
            : 会話の返事,
        agent: 担当情報,
    };
}

window.Claudeでエージェントの意図を判定する = Claudeでエージェントの意図を判定する;
