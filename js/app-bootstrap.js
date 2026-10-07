/**
 * ARELM 起動・設定・API Gateway
 */
window.loadPageData = function (pageName) {
    AReGLM_PERF?.invalidate(pageName);
    switch (pageName) {
        case 'dashboard':
            if (typeof loadDashboardData === 'function') loadDashboardData();
            break;
        case 'mainai':
            if (typeof refreshMainAiPage === 'function') refreshMainAiPage();
            // 「歯止めを確かめる」（外部通信が止まっているかの実チェック）は
            // このページを実際に開いたときだけ行う（引き継ぎ.js 参照）。
            if (typeof render引き継ぎ === 'function') render引き継ぎ();
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

// 想定外の例外で画面が無言にならないようにする（通知できるときだけ知らせる）
window.addEventListener('error', (e) => {
    try {
        if (typeof showNotification === 'function') {
            showNotification('画面でエラーが起きました: ' + (e.message || '不明'), 'error');
        }
    } catch { /* 通知すら失敗したら何もしない */ }
});
window.addEventListener('unhandledrejection', (e) => {
    try {
        const msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason || '不明');
        if (typeof showNotification === 'function') {
            showNotification('処理に失敗しました: ' + msg.slice(0, 200), 'error');
        }
    } catch { /* 同上 */ }
});

document.addEventListener('DOMContentLoaded', async function () {
    // 他の何かがlocalStorageを読む前に、まずサーバーにある最新のデータを
    // この端末へ取り込む（js/core/sync.js 参照。端末同士のデータ連携）。
    if (window.AReGLM_SYNC) await AReGLM_SYNC.起動時に取り込む();

    await checkGatewayStatus();

    if (typeof initDashboard === 'function') initDashboard();
    if (typeof initChat === 'function') initChat();
    if (typeof initSns === 'function') initSns();
    if (typeof initSnsPlatformManage === 'function') initSnsPlatformManage();
    if (typeof initInventoryHub === 'function') initInventoryHub();
    if (typeof initProductDev === 'function') initProductDev();
    if (typeof initOemDeck === 'function') initOemDeck();
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
    // 機能自体は前からあったが、開く画面（#knowledge-form 等）が無く、
    // 呼び出し元も無かった（knowledge-ui.js 参照）。
    if (typeof initKnowledgeUi === 'function') initKnowledgeUi();
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
    if (typeof initGoogle連携設定 === 'function') initGoogle連携設定();
    if (typeof init週次レポート === 'function') init週次レポート();
    if (typeof init自己修正の安全装置 === 'function') init自己修正の安全装置();
    if (typeof init拍手検知 === 'function') init拍手検知();
    if (typeof init音声のやり取り記録 === 'function') init音声のやり取り記録();
    if (typeof initページ内目次 === 'function') initページ内目次();
    if (typeof init背景作業 === 'function') init背景作業();
    if (typeof init監視ダッシュボード === 'function') init監視ダッシュボード();
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
    // 以前は導線（設置場所）が無く、開けなくなっていた
    // （遠隔操作の機能を一つにまとめた際に、遠隔操作ページの
    // 「パソコン操作」タブへ設置し直した）。
    if (typeof initパソコン操作 === 'function') initパソコン操作();
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
    initGrokKeyInput();
    initSuzuriKeyInput();
    initInstagramKeyInput();
    initFacebookKeyInput();
    initTiktokKeyInput();
    initIcloudCalendarKeyInput();
    initElevenLabsKeyInput();
    initGeminiKeyInput();
    initGroqKeyInput();
    initHuggingfaceKeyInput();
    initCloudflareKeyInput();
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
        const q = document.getElementById('brand-search')?.value?.trim() || 'ARELM ファッション';
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

/** Grok（xAI）APIキー。従量課金のため、お金がかかる機能の許可も別途必要。 */
function initGrokKeyInput() {
    const 入力 = document.getElementById('grok-api-key-input');
    const 保存 = document.getElementById('grok-api-key-save');
    const 状態 = document.getElementById('grok-api-key-status');
    if (!入力 || !保存) return;

    AReGLM_SECURITY.loadApiKeySecure('ai', 'grok').then((k) => {
        if (k && 状態) 状態.textContent = '設定済みです（変更する場合は新しい鍵を入れて保存）';
        if (k) 入力.placeholder = '•••• 設定済み';
    });

    保存.addEventListener('click', async () => {
        const 鍵 = 入力.value.trim();
        if (!鍵) { showNotification('APIキーを入れてください', 'error'); return; }
        if (!鍵.startsWith('xai-')) {
            showNotification('Grok のAPIキーは xai- で始まります（console.x.ai）。Groq（gsk_）とは別です', 'error');
            return;
        }
        if (鍵.length < 20) {
            showNotification('キーが短すぎます。console.x.ai で発行した API キーを入れてください', 'error');
            return;
        }
        await AReGLM_SECURITY.saveApiKeySecure('ai', 'grok', 鍵);
        入力.value = '';
        入力.placeholder = '•••• 設定済み';
        if (状態) 状態.textContent = '設定済みです（変更する場合は新しい鍵を入れて保存）';
        showNotification('Grok APIキーを暗号化して保存しました。設定 → お金がかかる機能 で Grok も許可してください', 'success');
    });
}

function seedAreglmBrand() {
    const brands = JSON.parse(localStorage.getItem('brands') || '[]');
    if (brands.some((b) => b.name === 'ARELM')) return;
    brands.unshift({
        id: Date.now(),
        name: 'ARELM',
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
 * Instagram連携（公式Graph API）のトークン・ユーザーID入力欄。
 *
 * SUZURIと同じ、専用の保存ボタンで直接暗号化保存する方式。
 * 非公式の自動操作は使わない方針のため、この2つが揃わない限り
 * js/services/instagram-api.js は何もできない（意図的な二重の関門）。
 */
function initInstagramKeyInput() {
    const トークン欄 = document.getElementById('instagram-api-token');
    const id欄 = document.getElementById('instagram-ig-user-id');
    const 保存 = document.getElementById('instagram-api-token-save');
    const 状態 = document.getElementById('instagram-api-token-status');
    if (!トークン欄 || !id欄 || !保存) return;

    const 表示を直す = async () => {
        const 設定済み = await AReGLM_INSTAGRAM?.isConnected();
        トークン欄.placeholder = 設定済み ? '•••• 設定済み' : 'アクセストークン';
        id欄.value = localStorage.getItem('areglm_instagram_ig_user_id') || '';
        if (状態) {
            状態.textContent = 設定済み
                ? '設定済みです（変更する場合は新しいトークンを入れて保存）'
                : 'まだ設定されていません。';
        }
    };

    保存.addEventListener('click', async () => {
        const トークン = トークン欄.value.trim();
        const igUserId = id欄.value.trim();
        if (!トークン || !igUserId) {
            showNotification('アクセストークンとInstagramユーザーIDの両方を入れてください', 'error');
            return;
        }

        await AReGLM_SECURITY.saveApiKeySecure('instagram', 'access_token', トークン);
        localStorage.setItem('areglm_instagram_ig_user_id', igUserId);

        const cfg = getApiConfig();
        if (!cfg.instagram) cfg.instagram = {};
        cfg.instagram.api = { connected: true, updatedAt: new Date().toISOString() };
        saveApiConfig(cfg);

        トークン欄.value = '';
        await 表示を直す();
        showNotification('Instagram連携の情報を暗号化して保存しました', 'success');
        AReGLM_API_SELECTOR?.renderStatusList('settings-api-list');
        AReGLM_API_SELECTOR?.renderStatusList('api-status-summary');
    });

    表示を直す();
}

/**
 * Facebook連携（公式Graph API）のページアクセストークン・ページID入力欄。
 * Instagramと同じ2つの値が要る形。
 */
function initFacebookKeyInput() {
    const トークン欄 = document.getElementById('facebook-page-token');
    const id欄 = document.getElementById('facebook-page-id');
    const 保存 = document.getElementById('facebook-page-token-save');
    const 状態 = document.getElementById('facebook-page-token-status');
    if (!トークン欄 || !id欄 || !保存) return;

    const 表示を直す = async () => {
        const 設定済み = await AReGLM_FACEBOOK?.isConnected();
        トークン欄.placeholder = 設定済み ? '•••• 設定済み' : 'ページアクセストークン';
        id欄.value = localStorage.getItem('areglm_facebook_page_id') || '';
        if (状態) {
            状態.textContent = 設定済み
                ? '設定済みです（変更する場合は新しいトークンを入れて保存）'
                : 'まだ設定されていません。';
        }
    };

    保存.addEventListener('click', async () => {
        const トークン = トークン欄.value.trim();
        const pageId = id欄.value.trim();
        if (!トークン || !pageId) {
            showNotification('ページアクセストークンとページIDの両方を入れてください', 'error');
            return;
        }

        await AReGLM_SECURITY.saveApiKeySecure('facebook', 'page_access_token', トークン);
        localStorage.setItem('areglm_facebook_page_id', pageId);

        const cfg = getApiConfig();
        if (!cfg.facebook) cfg.facebook = {};
        cfg.facebook.api = { connected: true, updatedAt: new Date().toISOString() };
        saveApiConfig(cfg);

        トークン欄.value = '';
        await 表示を直す();
        showNotification('Facebook連携の情報を暗号化して保存しました', 'success');
        AReGLM_API_SELECTOR?.renderStatusList('settings-api-list');
        AReGLM_API_SELECTOR?.renderStatusList('api-status-summary');
    });

    表示を直す();
}

/**
 * TikTok連携。Googleと違い、この端末への自動の折り返しが使えないため、
 * 「認可画面を開く」→「表示されたURL・codeを貼り付ける」の2段階にしてある。
 */
function initTiktokKeyInput() {
    const keyInput = document.getElementById('tiktok-client-key');
    const secretInput = document.getElementById('tiktok-client-secret');
    const redirectInput = document.getElementById('tiktok-redirect-uri');
    const saveBtn = document.getElementById('tiktok-client-save-btn');
    const authorizeBtn = document.getElementById('tiktok-authorize-btn');
    const disconnectBtn = document.getElementById('tiktok-disconnect-btn');
    const codeInput = document.getElementById('tiktok-code-input');
    const codeSubmitBtn = document.getElementById('tiktok-code-submit-btn');
    const status = document.getElementById('tiktok-status');
    if (!keyInput || !saveBtn) return;

    const 表示を直す = async () => {
        keyInput.value = AReGLM_TIKTOK_OAUTH?.getClientKey() || '';
        redirectInput.value = AReGLM_TIKTOK_OAUTH?.getRedirectUri() || '';
        const secretあり = !!(await AReGLM_SECURITY.loadApiKeySecure('tiktok', 'client_secret'));
        secretInput.placeholder = secretあり ? '•••• 設定済み' : 'Client Secret';
        const 連携済み = await AReGLM_TIKTOK_OAUTH?.isConnected();
        if (disconnectBtn) disconnectBtn.hidden = !連携済み;
        if (status) {
            status.textContent = 連携済み
                ? '連携済みです。'
                : (secretあり ? 'キーは保存済みです。「TikTokで認可する」に進んでください。' : 'まだ設定されていません。');
        }
    };

    saveBtn.addEventListener('click', async () => {
        const clientKey = keyInput.value.trim();
        const clientSecret = secretInput.value.trim();
        const redirectUri = redirectInput.value.trim();
        if (!clientKey || !redirectUri) {
            showNotification('Client KeyとリダイレクトURIは必須です', 'error');
            return;
        }
        await AReGLM_TIKTOK_OAUTH.saveClientCredentials(clientKey, clientSecret, redirectUri);
        secretInput.value = '';
        await 表示を直す();
        showNotification('TikTok連携の情報を暗号化して保存しました', 'success');
    });

    authorizeBtn?.addEventListener('click', async () => {
        try {
            const url = await AReGLM_TIKTOK_OAUTH.認可URLを作る();
            window.open(url, '_blank', 'noopener');
            showNotification('別タブでTikTokの認可画面を開きました。認可後に表示されるページのURLを、下の欄に貼り付けてください。', 'success');
        } catch (e) {
            showNotification(e.message, 'error');
        }
    });

    codeSubmitBtn?.addEventListener('click', async () => {
        const 値 = codeInput.value.trim();
        if (!値) { showNotification('認可後のURLかcodeを貼り付けてください', 'error'); return; }
        codeSubmitBtn.disabled = true;
        try {
            await AReGLM_TIKTOK_OAUTH.認可コードで連携する(値);
            codeInput.value = '';
            await 表示を直す();
            showNotification('TikTokと連携しました', 'success');
        } catch (e) {
            showNotification('連携できませんでした: ' + e.message, 'error');
        } finally {
            codeSubmitBtn.disabled = false;
        }
    });

    disconnectBtn?.addEventListener('click', async () => {
        if (!confirm('TikTok連携を解除しますか？')) return;
        await AReGLM_TIKTOK_OAUTH.disconnect();
        await 表示を直す();
        showNotification('TikTok連携を解除しました', 'success');
    });

    表示を直す();
}

/**
 * ElevenLabs（高品質な声の読み上げ・任意）のAPIキー・声のID入力欄。
 *
 * SUZURI/Instagramと同じ、専用の保存ボタンで直接暗号化保存する方式。
 * 「高品質な声を使う」トグル・APIキー・声のIDの3つが揃い、さらに
 * paid-guard.js側の許可もONでない限り、js/services/elevenlabs-api.js
 * は何もしない（読み上げは常にMac内蔵の声にフォールバックする）。
 */
function initElevenLabsKeyInput() {
    const 鍵欄 = document.getElementById('elevenlabs-api-key');
    const voice欄 = document.getElementById('elevenlabs-voice-id');
    const 有効トグル = document.getElementById('elevenlabs-enabled');
    const 保存 = document.getElementById('elevenlabs-key-save');
    const 状態 = document.getElementById('elevenlabs-key-status');
    if (!鍵欄 || !voice欄 || !保存) return;

    const 表示を直す = async () => {
        const 設定済み = await AReGLM_ELEVENLABS?.isReady();
        鍵欄.placeholder = 設定済み ? '•••• 設定済み' : 'APIキー';
        voice欄.value = AReGLM_ELEVENLABS?.getVoiceId() || '';
        if (有効トグル) 有効トグル.checked = AReGLM_ELEVENLABS?.isEnabled() || false;
        if (状態) {
            状態.textContent = 設定済み
                ? '設定済みです（変更する場合は新しいAPIキーを入れて保存）'
                : 'まだ設定されていません。';
        }
    };

    保存.addEventListener('click', async () => {
        const 鍵 = 鍵欄.value.trim();
        const voiceId = voice欄.value.trim();
        if (!鍵 || !voiceId) {
            showNotification('APIキーと声のIDの両方を入れてください', 'error');
            return;
        }
        await AReGLM_SECURITY.saveApiKeySecure('elevenlabs', 'api_key', 鍵);
        localStorage.setItem('areglm_elevenlabs_voice_id', voiceId);
        鍵欄.value = '';
        await 表示を直す();
        showNotification('ElevenLabsの情報を暗号化して保存しました', 'success');
    });

    有効トグル?.addEventListener('change', (e) => {
        localStorage.setItem('areglm_elevenlabs_enabled', e.target.checked ? 'true' : 'false');
        // ここでお金がかかる操作の許可までは出さない（許可は「お金がかかる
        // 機能」の画面で本人が一つずつ能動的に押すのが決まりごと）。
        // トグルをONにしただけでは、まだ実際には呼ばれない。
        if (e.target.checked && typeof 使ってよいか === 'function' && !使ってよいか('elevenlabs')) {
            showNotification('設定の「お金がかかる機能」からも、ElevenLabsの利用を許可してください（二重の確認）', 'info');
        }
    });

    表示を直す();
}

/**
 * iCloudカレンダー連携（公式CalDAV）のApple ID・Appサイト固有パスワード入力欄。
 *
 * SUZURI/Instagramと同じ、専用の保存ボタンで直接暗号化保存する方式。
 * ここでは保存だけでなく「接続する」でその場に discover() を呼び、
 * 見つかったカレンダー名を表示する（つながっているかその場で分かるように）。
 */
function initIcloudCalendarKeyInput() {
    const idField = document.getElementById('icloud-cal-apple-id');
    const pwField = document.getElementById('icloud-cal-app-password');
    const connectBtn = document.getElementById('icloud-cal-connect');
    const disconnectBtn = document.getElementById('icloud-cal-disconnect');
    const 状態 = document.getElementById('icloud-cal-status');
    const 一覧 = document.getElementById('icloud-cal-list');
    if (!idField || !pwField || !connectBtn) return;

    const 表示を直す = async () => {
        const 設定済み = await AReGLM_ICLOUD_CAL?.isConnected();
        idField.value = AReGLM_ICLOUD_CAL?.getAppleId() || '';
        pwField.placeholder = 設定済み ? '•••• 設定済み' : 'xxxx-xxxx-xxxx-xxxx';
        if (状態) {
            状態.textContent = 設定済み
                ? '設定済みです（変更する場合は新しいAppサイト固有パスワードを入れて接続し直す）'
                : 'まだ設定されていません。';
        }
        const カレンダー = AReGLM_ICLOUD_CAL?.getKnownCalendars() || [];
        if (一覧) {
            一覧.textContent = カレンダー.length
                ? '見つかったカレンダー: ' + カレンダー.map((c) => c.name).join('、')
                : '';
        }
    };

    connectBtn.addEventListener('click', async () => {
        const appleId = idField.value.trim();
        const appPassword = pwField.value.trim();
        if (!appleId || !appPassword) {
            showNotification('Apple IDとAppサイト固有パスワードの両方を入れてください', 'error');
            return;
        }
        localStorage.setItem(AReGLM_ICLOUD_CAL.APPLE_ID_KEY, appleId);
        await AReGLM_SECURITY.saveApiKeySecure('icloud_calendar', 'app_password', appPassword);

        connectBtn.disabled = true;
        connectBtn.textContent = '接続を確認しています…';
        try {
            const カレンダー = await AReGLM_ICLOUD_CAL.discover();
            pwField.value = '';
            await 表示を直す();
            showNotification(`iCloudに接続しました（カレンダー ${カレンダー.length}件を検出）`, 'success');
            if (typeof renderCalendar === 'function') renderCalendar();
        } catch (e) {
            showNotification('接続できませんでした: ' + e.message, 'error');
        } finally {
            connectBtn.disabled = false;
            connectBtn.textContent = '接続する（カレンダーを検出）';
        }
    });

    disconnectBtn?.addEventListener('click', async () => {
        if (!confirm('iCloudカレンダー連携を解除しますか？')) return;
        await AReGLM_ICLOUD_CAL.disconnect();
        idField.value = '';
        pwField.value = '';
        await 表示を直す();
        showNotification('iCloudカレンダー連携を解除しました', 'success');
        if (typeof renderCalendar === 'function') renderCalendar();
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

/**
 * Cloudflare Workers AI の Account ID・APIトークン入力欄。
 * account_id は秘密ではないが localStorage に、APIトークンだけ暗号化して保存する
 * （Instagram/iCloud等、2つの値が要る連携と同じ形）。
 */
function initCloudflareKeyInput() {
    const accountInput = document.getElementById('cloudflare-account-id-input');
    const keyInput = document.getElementById('cloudflare-api-key-input');
    const saveBtn = document.getElementById('cloudflare-api-key-save');
    const status = document.getElementById('cloudflare-api-key-status');
    if (!accountInput || !keyInput || !saveBtn) return;

    const 表示を直す = async () => {
        accountInput.value = localStorage.getItem('areglm_cloudflare_account_id') || '';
        const 設定済み = !!(await AReGLM_SECURITY.loadApiKeySecure('ai', 'cloudflare'));
        keyInput.placeholder = 設定済み ? '•••• 設定済み' : 'APIトークン';
        if (status) {
            status.textContent = 設定済み
                ? '設定済みです（変更する場合は新しいトークンを入れて保存）'
                : 'まだ設定されていません。';
        }
    };

    saveBtn.addEventListener('click', async () => {
        const accountId = accountInput.value.trim();
        const token = keyInput.value.trim();
        if (!accountId || !token) {
            showNotification('Account ID とAPIトークンの両方を入れてください', 'error');
            return;
        }
        localStorage.setItem('areglm_cloudflare_account_id', accountId);
        await AReGLM_SECURITY.saveApiKeySecure('ai', 'cloudflare', token);

        const cfg = getApiConfig();
        if (!cfg.ai) cfg.ai = {};
        cfg.ai.cloudflare = { connected: true, updatedAt: new Date().toISOString() };
        saveApiConfig(cfg);

        keyInput.value = '';
        await 表示を直す();
        showNotification('Cloudflare Workers AI の情報を暗号化して保存しました', 'success');
        AReGLM_API_SELECTOR?.renderStatusList('settings-api-list');
        AReGLM_API_SELECTOR?.renderStatusList('api-status-summary');
    });

    表示を直す();
}

function initQuickLinks() {
    document.querySelectorAll('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (window.areglmNavigate) window.areglmNavigate(btn.dataset.goto);
            // 特定の場所（保管庫など、ページの奥に埋もれている節）まで
            // そのまま連れて行きたいときのための、任意の追加ジャンプ先。
            const 先 = btn.dataset.gotoScroll;
            if (先) {
                setTimeout(() => {
                    document.getElementById(先)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
            }
        });
    });
}
