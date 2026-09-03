/**
 * AReGLM 起動・設定・API Gateway
 */
window.loadPageData = function (pageName) {
    AReGLM_PERF?.invalidate(pageName);
    switch (pageName) {
        case 'dashboard':
            if (typeof loadDashboardData === 'function') loadDashboardData();
            break;
        case 'mainai':
            if (typeof refreshMainAiPage === 'function') refreshMainAiPage();
            break;
        case 'chat':
            populateAiSelects();
            if (typeof loadChatHistory === 'function') loadChatHistory();
            break;
        case 'remote':
            // js/main.js の旧 loadPageData にあった処理。この関数の方が
            // あとから読み込まれ window.loadPageData を上書きするため、
            // ここに無いと遠隔操作ページを開き直しても表示が更新されない
            // （実際に消えて不具合になっていたのを見つけて戻した）。
            if (typeof init遠隔とタスク === 'function') init遠隔とタスク();
            if (typeof render遠隔操作 === 'function') render遠隔操作();
            break;
        case 'brands':
            if (typeof loadBrandsData === 'function') loadBrandsData();
            break;
        case 'sns':
            if (typeof loadSnsData === 'function') loadSnsData();
            break;
        case 'inventory':
            if (typeof loadInventoryHub === 'function') loadInventoryHub();
            break;
        case 'studio':
            if (typeof loadProductDev === 'function') loadProductDev();
            break;
        case 'tasks':
            if (typeof タスク管理画面を描く === 'function') タスク管理画面を描く();
            break;
        case 'settings':
            AReGLM_API_SELECTOR?.renderStatusList('settings-api-list');
            break;
    }
};

/**
 * AIの選択欄は無くした。
 *
 * 外部AIを選べるようにしていたが、
 * このツールは自作AIだけで動く方針なので、選ぶ必要がない。
 * 選択欄そのものを画面から消したため、ここも空にしてある。
 */
function populateAiSelects() {
    /* 何もしない */
}

window.checkGatewayStatus = async function checkGatewayStatus() {
    const ok = await AReGLM_API_CLIENT.health();
    const el = document.getElementById('gateway-status');
    if (el) {
        el.className = 'status-banner ' + (ok ? 'ok' : 'warn');
        el.innerHTML = ok
            ? '<strong>API Gateway 稼働中</strong> — AI・SUZURIが利用可能'
            : '<strong>Gateway未起動</strong> — ターミナルで <code>cd server && npm install && npm start</code>';
    }
    return ok;
}

document.addEventListener('DOMContentLoaded', async function () {
    await checkGatewayStatus();

    if (typeof initDashboard === 'function') initDashboard();
    if (typeof initChat === 'function') initChat();
    if (typeof initSns === 'function') initSns();
    if (typeof initSnsPlatformManage === 'function') initSnsPlatformManage();
    if (typeof initInventoryHub === 'function') initInventoryHub();
    if (typeof initProductDev === 'function') initProductDev();
    if (typeof initBackup === 'function') initBackup();
    if (typeof initDesignStudio === 'function') initDesignStudio();
    if (typeof initCustomers === 'function') initCustomers();
    if (typeof initBrandManual === 'function') initBrandManual();
    if (typeof initMandala === 'function') initMandala();
    if (typeof initImageGen === 'function') initImageGen();
    if (typeof initPricing === 'function') initPricing();
    if (typeof initConsole === 'function') initConsole();
    if (typeof initMediaStudio === 'function') initMediaStudio();
    if (typeof initCompliance === 'function') initCompliance();
    if (typeof initLocalAiPanel === 'function') initLocalAiPanel();
    if (typeof initCalendar === 'function') initCalendar();
    if (typeof initSeries === 'function') initSeries();
    if (typeof initNotify === 'function') initNotify();
    if (typeof initImageEditor === 'function') initImageEditor();
    if (typeof initPersonalize === 'function') initPersonalize();
    if (typeof initMainAi === 'function') initMainAi();
    if (typeof initTextGen === 'function') initTextGen();
    if (typeof initQuickPanel === 'function') initQuickPanel();
    if (typeof initTheme === 'function') initTheme();
    if (typeof initWakeWord === 'function') initWakeWord();
    if (typeof initHealth === 'function') initHealth();
    if (typeof initWishlist === 'function') initWishlist();
    if (typeof initTimer === 'function') initTimer();
    if (typeof initVintage === 'function') initVintage();
    if (typeof initHistory === 'function') initHistory();
    if (typeof initExportAll === 'function') initExportAll();
    if (typeof initMockup === 'function') initMockup();
    if (typeof initPattern === 'function') initPattern();
    if (typeof initLibrary === 'function') initLibrary();
    if (typeof initToolName === 'function') initToolName();
    if (typeof init毎日の自動チェック === 'function') init毎日の自動チェック();
    if (typeof initAutomationIntervalSetting === 'function') initAutomationIntervalSetting();
    if (typeof init真贋照合 === 'function') init真贋照合();
    if (typeof init商品マスター取込 === 'function') init商品マスター取込();
    if (typeof init数値計画 === 'function') init数値計画();
    if (typeof init統計画面 === 'function') init統計画面();
    if (typeof initコード安全点検 === 'function') initコード安全点検();
    if (typeof initFloatingAgent === 'function') initFloatingAgent();
    if (typeof initJarvisMode === 'function') initJarvisMode();
    initGoogleCalendarSettings();
    if (typeof init週次レポート === 'function') init週次レポート();
    if (typeof init自己修正の安全装置 === 'function') init自己修正の安全装置();
    if (typeof init拍手検知 === 'function') init拍手検知();
    if (typeof init音声のやり取り記録 === 'function') init音声のやり取り記録();
    if (typeof initページ内目次 === 'function') initページ内目次();
    if (typeof init背景作業 === 'function') init背景作業();
    if (typeof init外部ノート連携設定 === 'function') init外部ノート連携設定();
    if (typeof initVoiceUI === 'function') initVoiceUI();
    if (typeof init常駐の待ち受け === 'function') init常駐の待ち受け();
    if (typeof init声の診断 === 'function') init声の診断();
    if (typeof init声を覚える === 'function') init声を覚える();
    if (typeof init声の使い方 === 'function') init声の使い方();
    if (typeof init育ち具合 === 'function') init育ち具合();
    if (typeof init声を録り直す === 'function') init声を録り直す();
    if (typeof init作業を教える === 'function') init作業を教える();
    if (typeof init自動の決まり === 'function') init自動の決まり();
    if (typeof init遠隔操作 === 'function') init遠隔操作();
    if (typeof initブラウザ操作 === 'function') initブラウザ操作();
    if (typeof initホームからChrome === 'function') initホームからChrome();
    if (typeof init自分を良くする === 'function') init自分を良くする();
    if (typeof init分析画面 === 'function') init分析画面();
    if (typeof init引き継ぎ === 'function') init引き継ぎ();
    if (typeof initSNS分析 === 'function') initSNS分析();
    if (typeof init遠隔投稿 === 'function') init遠隔投稿();
    if (typeof initまとめて更新 === 'function') initまとめて更新();
    if (typeof init遠隔とタスク === 'function') init遠隔とタスク();

    // 画面を整えるのは、いちばん最後。
    // 他の仕組みが節を足し終わってから畳まないと、
    // あとから足された節が畳みの外に取り残される。
    setTimeout(() => {
        if (typeof init画面を整える === 'function') init画面を整える();
    }, 1200);
    if (typeof initLocalVoice === 'function') initLocalVoice();
    if (typeof initBrandSplit === 'function') initBrandSplit();
    if (typeof initPaidGuard === 'function') initPaidGuard();
    if (typeof initPreorder === 'function') initPreorder();
    if (typeof initTechpackCost === 'function') initTechpackCost();
    if (typeof initTagDesign === 'function') initTagDesign();
    if (typeof initSheet === 'function') initSheet();
    if (typeof initChatPlus === 'function') initChatPlus();
    if (typeof initTrash === 'function') initTrash();
    if (typeof initCamera === 'function') initCamera();
    if (typeof initRules === 'function') initRules();
    if (typeof initTaskReminder === 'function') initTaskReminder();
    if (typeof initSelfCheck === 'function') initSelfCheck();
    if (typeof initRequirements === 'function') initRequirements();
    if (typeof initVoiceStyle === 'function') initVoiceStyle();
    if (typeof init取引を見る === 'function') init取引を見る();
    if (typeof init話題 === 'function') init話題();
    // 参考ブランドの読み込みボタン
    document.getElementById('import-reference-brands-btn')
        ?.addEventListener('click', () => {
            if (typeof 参考ブランドを取り込む === 'function') 参考ブランドを取り込む();
        });
    if (typeof initブランド整理 === 'function') initブランド整理();
    if (typeof init店のページ === 'function') init店のページ();
    if (typeof init先回り === 'function') init先回り();
    if (typeof init置き換え計画 === 'function') init置き換え計画();
    if (typeof init他の端末 === 'function') init他の端末();
    if (typeof init守り === 'function') init守り();
    if (typeof initHomeTabs === 'function') initHomeTabs();
    document.getElementById('import-product-seed-btn')?.addEventListener('click', importProductSeed);
    document.getElementById('seed-import-banner-btn')?.addEventListener('click', importProductSeed);

    // APIキーの保存（この端末の中に暗号化保存。外部には送らない）
    initClaudeKeyInput();
    initSuzuriKeyInput();
    initGeminiKeyInput();
    initGroqKeyInput();
    initHuggingfaceKeyInput();
    if (typeof init様子 === 'function') init様子();
    initQuickLinks();

    // 追加した絞り込みと「すべて表示」を有効にする
    document.getElementById('brand-price-filter')?.addEventListener('change', () => {
        if (typeof filterBrands === 'function') filterBrands();
    });
    document.getElementById('brand-category-filter')?.addEventListener('change', () => {
        if (typeof filterBrands === 'function') filterBrands();
    });
    document.getElementById('brand-country-filter')?.addEventListener('change', () => {
        if (typeof filterBrands === 'function') filterBrands();
    });
    document.getElementById('brand-show-all')?.addEventListener('click', () => {
        if (typeof showAllBrands === 'function') showAllBrands();
    });

    const brandSearch = document.getElementById('brand-search');
    if (brandSearch && typeof filterBrands === 'function') {
        brandSearch.addEventListener('input', AReGLM_PERF.debounce(filterBrands, 300));
    }

    document.getElementById('brand-research-btn')?.addEventListener('click', async () => {
        const q = document.getElementById('brand-search')?.value?.trim() || 'AReGLM ファッション';
        try {
            const text = await AReGLM_LOCAL_FIRST.complete({
                provider: 'local',
                history: [],
                userText: `「${q}」のブランド調査・ニュース分析`,
                attachments: [],
                mode: 'learn'
            });
            const feed = document.getElementById('fashion-news-feed');
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
            // provider: 'local' 固定＝常にこの端末の中の資料だけを見ている。
            // 「AI調査完了」だけでは、外部の最新情報まで調べたように
            // 誤解されることがあった。実際にやったことをそのまま言う。
            showNotification('この端末の資料から調べました（外部APIは使っていないため、最新のWeb情報は含みません）', 'success');
        } catch (e) {
            showNotification(e.message, 'error');
        }
    });

    seedAreglmBrand();
});

/** Claude APIキーの入力欄。鍵は端末内に暗号化保存し、画面には出さない。 */
function initClaudeKeyInput() {
    const 入力 = document.getElementById('claude-api-key-input');
    const 保存 = document.getElementById('claude-api-key-save');
    const 状態 = document.getElementById('claude-api-key-status');
    if (!入力 || !保存) return;

    // 設定済みかどうかだけを見せる（鍵そのものは出さない）
    AReGLM_SECURITY.loadApiKeySecure('ai', 'claude').then((k) => {
        if (k && 状態) 状態.textContent = '設定済みです（変更する場合は新しい鍵を入れて保存）';
        if (k) 入力.placeholder = '•••• 設定済み';
    });

    保存.addEventListener('click', async () => {
        const 鍵 = 入力.value.trim();
        if (!鍵) { showNotification('APIキーを入れてください', 'error'); return; }
        if (!鍵.startsWith('sk-ant-')) {
            showNotification('Claude のAPIキーは sk-ant- で始まります。もう一度確かめてください', 'error');
            return;
        }
        await AReGLM_SECURITY.saveApiKeySecure('ai', 'claude', 鍵);
        入力.value = '';
        入力.placeholder = '•••• 設定済み';
        if (状態) 状態.textContent = '設定済みです（変更する場合は新しい鍵を入れて保存）';
        showNotification('Claude APIキーを暗号化して保存しました', 'success');
    });
}

function seedAreglmBrand() {
    const brands = JSON.parse(localStorage.getItem('brands') || '[]');
    if (brands.some((b) => b.name === 'AReGLM')) return;
    brands.unshift({
        id: Date.now(),
        name: 'AReGLM',
        description: '社内ファッションブランド。SUZURIショップで展開。',
        category: 'アパレル',
        country: '日本',
        price: 'ミドル',
        url: AREGLM_PROFILE.suzuriShop,
        philosophy: '過去の制作・学習・販売をこのツールで一元管理',
        createdAt: new Date().toISOString()
    });
    localStorage.setItem('brands', JSON.stringify(brands));
}

/**
 * Googleカレンダー連携（N-19）の設定欄。
 *
 * ここでできるのは、クライアントIDの保存と、連携の有効・無効の切り替えの
 * 「土台」まで。実際にGoogleへログインして予定を追加・削除する部分
 * （OAuth認証・カレンダーAPIの呼び出し）は、本物のクライアントIDが無いと
 * 作っても試せず、動くふりをするコードは書かない方針のため、
 * オーナー様がGoogle Cloud ConsoleでクライアントIDを取得したあとの
 * 次の作業として残してある。
 */
function initGoogleCalendarSettings() {
    const idInput = document.getElementById('gcal-client-id');
    const saveBtn = document.getElementById('gcal-client-id-save');
    const enableBox = document.getElementById('gcal-sync-enabled');
    const status = document.getElementById('gcal-status');
    if (!idInput || !saveBtn) return;

    const 表示を直す = () => {
        const 保存済み = localStorage.getItem('areglm_gcal_client_id') || '';
        idInput.value = 保存済み;
        if (enableBox) {
            enableBox.disabled = !保存済み;
            enableBox.checked = 保存済み ? localStorage.getItem('areglm_gcal_sync_enabled') === 'true' : false;
        }
        if (status) {
            status.textContent = 保存済み
                ? 'クライアントIDを保存済みです。ただし、実際にGoogleへ接続してタスクを同期する処理はまだ実装されていません（土台の設定欄のみです）。'
                : '';
        }
    };

    saveBtn.addEventListener('click', () => {
        const v = (idInput.value || '').trim();
        if (v) localStorage.setItem('areglm_gcal_client_id', v);
        else localStorage.removeItem('areglm_gcal_client_id');
        表示を直す();
        showNotification(v ? 'クライアントIDを保存しました' : 'クライアントIDを消しました', 'success');
    });

    enableBox?.addEventListener('change', (e) => {
        localStorage.setItem('areglm_gcal_sync_enabled', e.target.checked ? 'true' : 'false');
    });

    表示を直す();
}

/**
 * SUZURI連携（公式API）のトークン入力欄。
 *
 * 汎用の #api-settings-form（旧 initSettingsPage）はHTML側に対応する要素が無く
 * 常に何もしなかったため削除し、Claude APIキー・Googleカレンダー・Notion・Obsidianと
 * 同様に、SUZURI専用の保存ボタンで直接 AReGLM_SECURITY に暗号化保存する方式に揃えた。
 * 下の Gemini・Groq・Hugging Face（js/services/ai-engine.js から
 * getKey('gemini' / 'groq' / 'huggingface') で実際に呼ばれているのに、
 * 保存する入力欄がどこにも無かった）も同じ方式で揃えてある。
 */
function initSuzuriKeyInput() {
    const 入力 = document.getElementById('suzuri-api-token');
    const 保存 = document.getElementById('suzuri-api-token-save');
    const 状態 = document.getElementById('suzuri-api-token-status');
    if (!入力 || !保存) return;

    const 表示を直す = async () => {
        const 設定済み = !!(await AReGLM_SUZURI.getToken());
        入力.placeholder = 設定済み ? '•••• 設定済み' : 'SUZURI APIトークン';
        if (状態) {
            状態.textContent = 設定済み
                ? '設定済みです（変更する場合は新しいトークンを入れて保存）'
                : 'まだ設定されていません。';
        }
    };

    保存.addEventListener('click', async () => {
        const トークン = 入力.value.trim();
        if (!トークン) { showNotification('APIトークンを入れてください', 'error'); return; }

        await AReGLM_SECURITY.saveApiKeySecure('suzuri', 'api', トークン);

        const cfg = getApiConfig();
        if (!cfg.suzuri) cfg.suzuri = {};
        cfg.suzuri.api = { connected: true, updatedAt: new Date().toISOString() };
        saveApiConfig(cfg);

        入力.value = '';
        await 表示を直す();
        showNotification('SUZURI APIトークンを暗号化して保存しました', 'success');
        if (typeof renderSuzuriStatus === 'function') renderSuzuriStatus();
        AReGLM_API_SELECTOR?.renderStatusList('settings-api-list');
        AReGLM_API_SELECTOR?.renderStatusList('api-status-summary');
    });

    表示を直す();
}

/**
 * ai カテゴリの無料枠APIキー入力欄（Gemini / Groq / Hugging Face 共通処理）。
 * cat/id は js/config/apis.js の AReGLM_API_REGISTRY と js/services/ai-engine.js の
 * getKey(provider) 呼び出しに合わせてあるので、ここで保存した鍵がそのままAI呼び出しで使われる。
 */
function initAiKeyInput(id, label, prefix) {
    const 入力 = document.getElementById(`${id}-api-key-input`);
    const 保存 = document.getElementById(`${id}-api-key-save`);
    const 状態 = document.getElementById(`${id}-api-key-status`);
    if (!入力 || !保存) return;

    AReGLM_SECURITY.loadApiKeySecure('ai', id).then((k) => {
        if (k) {
            入力.placeholder = '•••• 設定済み';
            if (状態) 状態.textContent = '設定済みです（変更する場合は新しい鍵を入れて保存）';
        }
    });

    保存.addEventListener('click', async () => {
        const 鍵 = 入力.value.trim();
        if (!鍵) { showNotification('APIキーを入れてください', 'error'); return; }
        if (prefix && !鍵.startsWith(prefix)) {
            showNotification(`${label} のAPIキーは ${prefix} で始まります。もう一度確かめてください`, 'error');
            return;
        }

        await AReGLM_SECURITY.saveApiKeySecure('ai', id, 鍵);

        const cfg = getApiConfig();
        if (!cfg.ai) cfg.ai = {};
        cfg.ai[id] = { connected: true, updatedAt: new Date().toISOString() };
        saveApiConfig(cfg);

        入力.value = '';
        入力.placeholder = '•••• 設定済み';
        if (状態) 状態.textContent = '設定済みです（変更する場合は新しい鍵を入れて保存）';
        showNotification(`${label} APIキーを暗号化して保存しました`, 'success');
        AReGLM_API_SELECTOR?.renderStatusList('settings-api-list');
        AReGLM_API_SELECTOR?.renderStatusList('api-status-summary');
    });
}

function initGeminiKeyInput() { initAiKeyInput('gemini', 'Gemini', 'AIza'); }
function initGroqKeyInput() { initAiKeyInput('groq', 'Groq', 'gsk_'); }
function initHuggingfaceKeyInput() { initAiKeyInput('huggingface', 'Hugging Face', 'hf_'); }

function initQuickLinks() {
    document.querySelectorAll('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (window.areglmNavigate) window.areglmNavigate(btn.dataset.goto);
        });
    });
}
