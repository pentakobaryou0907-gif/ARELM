/**
 * マルチエージェント化 — 領域ごとの専門エージェント（クライアント側の写し）
 *
 * server/ai/エージェント定義.py と同じ内容を、クライアント側にも持つ。
 * 「脳」をClaudeに切り替えたときは、エージェントの意図判定そのものを
 * この端末からAnthropicのAPIへ直接呼ぶ（Python側は外部通信を遮断して
 * いるため、Pythonの中からはClaudeを呼べない）。担当（在庫番・SNS担当…）の
 * 名乗り・引き継ぎの見え方が、自作AIのときと変わらないよう、
 * 判定ロジックだけをこちらにも複製している。
 * 内容を変えるときは、Python側（server/ai/エージェント定義.py）も
 * 忘れずに直すこと。
 */

const AGENT_一覧 = {
    inventory: {
        名: '在庫番', 絵: '📦',
        専門: '在庫・商品管理、入出庫、売上集計の担当です。数字は在庫データにある事実だけを答え、'
            + '分からない数字は「分かりません」と正直に言います。誇張はしません。',
    },
    sns: {
        名: 'SNS担当', 絵: '📣',
        専門: 'SNS運用・投稿文づくりの担当です。事実に基づいた、誇張しすぎない投稿文を意識します。'
            + '公式APIとは繋がず、実際の投稿は遠隔操作で行う前提で案内します。',
    },
    brands: {
        名: 'ブランド番頭', 絵: '◆',
        専門: '自社・他社ブランドの調査・比較、ブランドづくりの担当です。他社の情報は'
            + '「参考にできる点」として整理し、真似ではなく自社らしさに落とし込む視点で答えます。',
    },
    studio: {
        名: '開発職人', 絵: '✎',
        専門: '商品開発・型紙・原価計算・モックアップ制作の担当です。数字（原価・掛率など）を'
            + '扱うときは、根拠にした値を明示します。',
    },
    remote: { 名: '遠隔操作員', 絵: '🖥', 専門: '外部サイトの遠隔操作・タスク管理の担当です。' },
    dashboard: { 名: '記録係', 絵: '📋', 専門: '日々の記録・計画・体調管理・週次レポートの担当です。' },
};

const AGENT_キーワード = {
    inventory: ['在庫', '入庫', '出庫', '売上', 'sku', '商品数'],
    sns: ['sns', 'インスタ', 'instagram', 'ツイート', '投稿文', 'ハッシュタグ'],
    brands: ['ブランド', '競合', '他社'],
    studio: ['原価', '型紙', 'モックアップ', '掛率', '技術パック'],
    remote: ['遠隔操作', 'スクリーンショット', '画面共有'],
    dashboard: ['週次レポート', 'タスク', '体調', 'メモ'],
};

function _AGENT_ページから選ぶ(page) {
    page = (page || '').trim();
    return AGENT_一覧[page] ? page : null;
}

function _AGENT_キーワードから選ぶ(発言) {
    const text = (発言 || '').toLowerCase();
    if (!text) return null;
    for (const [id, words] of Object.entries(AGENT_キーワード)) {
        if (words.some((w) => text.includes(w.toLowerCase()))) return id;
    }
    return null;
}

function _AGENT_名指しで選ぶ(発言) {
    const text = 発言 || '';
    if (!text) return null;
    for (const [id, a] of Object.entries(AGENT_一覧)) {
        if (text.includes(a.名)) return id;
    }
    return null;
}

function エージェントを選ぶ詳細JS(page, 発言) {
    const 名指し = _AGENT_名指しで選ぶ(発言);
    if (名指し) return { id: 名指し, 経緯: 'name', 引き継ぎ元: null };

    const ページの担当 = _AGENT_ページから選ぶ(page);
    const キーワードの担当 = _AGENT_キーワードから選ぶ(発言);

    if (キーワードの担当 && ページの担当 && キーワードの担当 !== ページの担当) {
        return { id: キーワードの担当, 経緯: 'handoff', 引き継ぎ元: ページの担当 };
    }
    if (ページの担当) return { id: ページの担当, 経緯: 'page', 引き継ぎ元: null };
    if (キーワードの担当) return { id: キーワードの担当, 経緯: 'keyword', 引き継ぎ元: null };
    return { id: null, 経緯: null, 引き継ぎ元: null };
}

function エージェントの指示文JS(agentId, 引き継ぎ元) {
    const a = AGENT_一覧[agentId];
    if (!a) return '';
    let 文 = `あなたは「${a.名}」という、${a.専門}この担当としての立場で答えてください`
        + '（他の話題を聞かれたら、素直に自分の専門外だと伝えて構いません）。';
    const 元 = AGENT_一覧[引き継ぎ元];
    if (元) {
        文 += `\n（この質問は「${元.名}」の画面から来ましたが、話題があなたの専門のため、`
            + 'あなたが代わりに引き継いで答えます。そのことに軽く触れてから答えてください。）';
    }
    return 文;
}

function エージェント情報JS(agentId, 引き継ぎ元) {
    const a = AGENT_一覧[agentId];
    if (!a) return null;
    const 出す = { id: agentId, 名: a.名, 絵: a.絵 };
    const 元 = AGENT_一覧[引き継ぎ元];
    if (元) 出す.引き継ぎ元 = { id: 引き継ぎ元, 名: 元.名, 絵: 元.絵 };
    return 出す;
}

window.エージェントを選ぶ詳細JS = エージェントを選ぶ詳細JS;
window.エージェントの指示文JS = エージェントの指示文JS;
window.エージェント情報JS = エージェント情報JS;
