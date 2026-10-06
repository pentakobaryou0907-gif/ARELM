/**
 * エージェント能力板 — 「何が自動で、何で止まるか」を隠さない
 *
 * 貼られた要望（Cursor風の全自動）に対して、このツールが本当にできる範囲を
 * 画面に出す。できないことをできると言わない。
 */

function initエージェント能力板() {
    const 箱 = document.getElementById('agent-capability-board');
    if (!箱) return;
    能力板を描く();
    document.getElementById('agent-capability-refresh')?.addEventListener('click', 能力板を描く);
}

async function 能力板を描く() {
    const 箱 = document.getElementById('agent-capability-board');
    if (!箱) return;

    const gemini = !!(await AReGLM_SECURITY.loadApiKeySecure('ai', 'gemini'));
    const claude = !!(await AReGLM_SECURITY.loadApiKeySecure('ai', 'claude'));
    const github = !!(await AReGLM_SECURITY.loadApiKeySecure('github', 'token'));
    const suzuri = !!(await AReGLM_SECURITY.loadApiKeySecure('suzuri', 'api'));
    const ig = !!(await AReGLM_SECURITY.loadApiKeySecure('instagram', 'access_token'));
    const 脳 = typeof 現在の脳 === 'function' ? 現在の脳() : 'local';

    let AI稼働 = false;
    try {
        const r = await fetch('/api/ai-local/health', { cache: 'no-store' });
        AI稼働 = r.ok;
    } catch { /* 停止中 */ }

    const 行 = (状態, 見出し, 訳) =>
        `<div class="cap-row cap-${状態}"><strong>${見出し}</strong><span>${訳}</span></div>`;

    箱.innerHTML = `
        <p class="hint">いまの設定で、自動で進むものと、必ず止まるものです。嘘を書きません。</p>
        <h4 class="rule-head">自動で進めてよい</h4>
        ${行(AI稼働 ? 'ok' : 'warn', '裏での作業・自己修復',
            AI稼働
                ? '「裏で〜して」と頼むとキューに積み、失敗時は最大2回まで静かにやり直します'
                : '自作AIが止まっているため、裏作業は使えません（start_ai.sh）')}
        ${行('ok', '下書き・分析・記録', '投稿文・商品説明・在庫集計・メモ整理は、確認前まで自動で作れます')}
        ${行(gemini || claude ? 'ok' : 'standby', '脳の自動切替',
            脳 === 'auto'
                ? `自動ON（Gemini鍵:${gemini ? 'あり' : 'なし'} / Claude鍵:${claude ? 'あり' : 'なし'}）`
                : `いまは固定「${脳}」。チャットの「脳」ボタンで「自動」にできます`)}
        ${行(github ? 'ok' : 'standby', 'GitHubへの控え',
            github ? '設定済み。設定画面からバックアップ／進捗ログを上げられます' : '未設定（設定 → GitHub）')}

        <h4 class="rule-head">必ず止まる（あなたが押す）</h4>
        ${行('stop', 'SNS投稿・公開・販売開始', '最終ボタンはあなたが押します。ツールは確認待ちまで用意します')}
        ${行('stop', 'お金がかかる操作', '無料と確定していない操作は、許可が出るまで実行しません')}
        ${行(ig ? 'ok' : 'standby', 'Instagram公式投稿',
            ig ? 'トークンあり。投稿前に確認画面を出します' : '未設定。非公式の自動ログイン投稿は作りません')}

        <h4 class="rule-head">やらない</h4>
        ${行('no', 'ハッキング・規約違反の自動操作', '他人のアカウント操作、不正API、丸パクリは拒否します')}
        ${行('no', 'Cursorそのものの埋め込み', '開発エディタの機能は、この作業ツールの中には入れません。同等の「裏で進める／自己修復／脳の切替」だけを運びに載せます')}
        ${行(suzuri ? 'ok' : 'standby', 'SUZURI', suzuri ? '公式APIトークンあり' : '未設定（在庫・商品は設定後）')}
    `;
}

window.initエージェント能力板 = initエージェント能力板;
window.能力板を描く = 能力板を描く;
