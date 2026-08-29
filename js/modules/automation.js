/**
 * 全自動モード — ブランド・AI・SNS・SUZURI在庫
 */
async function runFullAutomation() {
    // 切り替えは廃止。常に自動で実行する。
    localStorage.setItem('areglm_automation_last', new Date().toISOString());
    logActivity('自動実行を開始');

    if (typeof syncSuzuriInventory === 'function') {
        let r = await AReGLM_SUZURI.syncToInventory();
        if (!r.ok && r.fallback) r = AReGLM_SUZURI.syncFallback();
    }

    if (typeof runAutoPromo === 'function') await runAutoPromo(true);

    const cfg = getApiConfig();
    if (cfg.ai?.gemini?.connected) {
        try {
            const feed = document.getElementById('fashion-news-feed');
            const text = await AReGLM_LOCAL_FIRST.complete({
                // 自作AIで行う。外部の鍵が無くても動くようにするため。
                provider: 'local',
                history: [],
                userText: '本日のファッション・アパレルニュース3件をAReGLM向けに要約',
                attachments: [],
                mode: 'learn'
            });
            if (feed) {
                // AIの答えをそのまま入れていた。ストッパーが見つけた。
                // 何が返ってくるか分からないものを、そのまま画面に入れない。
                feed.textContent = '';
                const 枠 = document.createElement('div');
                枠.className = 'bubble-text';
                枠.textContent = text;
                枠.style.whiteSpace = 'pre-wrap';
                feed.appendChild(枠);
            }
        } catch {
            /* skip */
        }
    }

    localStorage.setItem('areglm_automation_last', new Date().toISOString());
    if (typeof updateAutomationStatus === 'function') updateAutomationStatus();
    logActivity('自動実行が完了');
}

window.runFullAutomation = runFullAutomation;
