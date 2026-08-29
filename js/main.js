// DOM読み込み完了後に実行
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM読み込み完了');
    
    try {
        // 初期化
        initLoginSystem();
        initNavigation();
        initBrandSystem();
        initInventorySystem();
        
        // データの読み込み
        loadInitialData();
        
        console.log('初期化完了');
    } catch (error) {
        console.error('初期化エラー:', error);
        showNotification('初期化中にエラーが発生しました', 'error');
    }
});

// ログインシステムの初期化
function initLoginSystem() {
    console.log('ログインシステム初期化開始');
    
    const loginForm = document.getElementById('login-form');
    const initDbBtn = document.getElementById('init-db-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (loginForm) {
        console.log('ログインフォームが見つかりました');
        loginForm.addEventListener('submit', handleLogin);
    } else {
        console.error('ログインフォームが見つかりません');
    }
    
    if (initDbBtn) {
        console.log('データベース初期化ボタンが見つかりました');
        initDbBtn.addEventListener('click', initDatabase);
    } else {
        console.error('データベース初期化ボタンが見つかりません');
    }
    
    if (logoutBtn) {
        console.log('ログアウトボタンが見つかりました');
        logoutBtn.addEventListener('click', handleLogout);
    } else {
        console.error('ログアウトボタンが見つかりません');
    }
    
    // 既存のセッションをチェック
    checkExistingSession();
}

// ナビゲーション機能
function initNavigation() {
    const navLinks = document.querySelectorAll('.bottom-nav-item, .nav-link[data-page], .header-actions .nav-link[data-page]');

    const goTo = (page) => {
        document.querySelectorAll('.bottom-nav-item, .nav-link[data-page]').forEach((l) => {
            l.classList.toggle('active', l.getAttribute('data-page') === page);
        });
        switchPage(page);
    };

    navLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.getAttribute('data-page');
            if (targetPage) goTo(targetPage);
        });
    });

    window.areglmNavigate = goTo;
    // 初めから、エージェント（JARVISモード）と話せる状態で開く。
    // 本人の指示による変更（以前はホーム画面が既定だった）。
    switchPage('mainai');
}

// ページ切り替え
function switchPage(pageName) {
    console.log('ページ切り替え:', pageName);

    // マイクを押したまま別の画面へ移ったら、そこで打ち切る。
    // 押しっぱなしを忘れて後で拾った物音が、指示として処理されて
    // 「話しかけていないのに勝手に反応した」ように見える不具合の一因だった。
    if (typeof 録音中ならすべて打ち切る === 'function') 録音中ならすべて打ち切る();

    // 全ページを非表示
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    // 対象ページを表示
    const targetPage = document.getElementById(`${pageName}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
        console.log(`${pageName}ページを表示しました`);
        
        // ページ固有のデータ読み込み
        loadPageData(pageName);
    } else {
        console.error(`${pageName}ページが見つかりません`);
    }
}

// ページ固有のデータ読み込み
function loadPageData(pageName) {
    console.log('ページデータ読み込み:', pageName);
    
    switch (pageName) {
        case 'dashboard':
            if (typeof loadDashboardData === 'function') loadDashboardData();
            break;
        case 'remote':
            if (typeof init遠隔とタスク === 'function') init遠隔とタスク();
            if (typeof render遠隔操作 === 'function') render遠隔操作();
            break;
        case 'brands':
            loadBrandsData();
            break;
        case 'inventory':
            if (typeof loadInventoryHub === 'function') loadInventoryHub();
            else loadInventoryData();
            break;
        case 'chat':
        case 'sns':
        case 'settings':
            break;
        default:
            console.log('ページ:', pageName);
    }
}

// ブランド管理システムの初期化
function initBrandSystem() {
    console.log('ブランド管理システム初期化開始');
    
    // ブランド追加ボタン
    const addBrandBtn = document.getElementById('add-brand-btn');
    if (addBrandBtn) {
        console.log('ブランド追加ボタンが見つかりました');
        addBrandBtn.addEventListener('click', () => openBrandModal());
    } else {
        console.error('ブランド追加ボタンが見つかりません');
    }
    
    // ブランド更新ボタン
    const refreshBrandsBtn = document.getElementById('refresh-brands-btn');
    if (refreshBrandsBtn) {
        console.log('ブランド更新ボタンが見つかりました');
        refreshBrandsBtn.addEventListener('click', refreshBrands);
    } else {
        console.error('ブランド更新ボタンが見つかりません');
    }

    // 競合ブランド一括読み込みボタン
    document.getElementById('import-competitor-brands-btn')?.addEventListener('click', importCompetitorBrands);

    // AIでブランドヒストリーを生成
    document.getElementById('brand-ai-generate-btn')?.addEventListener('click', generateBrandHistoryWithAi);
    
    // ブランド検索
    const brandSearch = document.getElementById('brand-search');
    if (brandSearch) {
        console.log('ブランド検索が見つかりました');
        brandSearch.addEventListener('input', filterBrands);
    } else {
        console.error('ブランド検索が見つかりません');
    }
    
    // ブランドモーダルの閉じるボタン
    const closeBrandModal = document.getElementById('close-brand-modal');
    if (closeBrandModal) {
        console.log('ブランドモーダル閉じるボタンが見つかりました');
        closeBrandModal.addEventListener('click', () => closeModal('brand-modal'));
    } else {
        console.error('ブランドモーダル閉じるボタンが見つかりません');
    }
    
    // ブランドモーダルのキャンセルボタン
    const cancelBrand = document.getElementById('cancel-brand');
    if (cancelBrand) {
        console.log('ブランドモーダルキャンセルボタンが見つかりました');
        cancelBrand.addEventListener('click', () => closeModal('brand-modal'));
    } else {
        console.error('ブランドモーダルキャンセルボタンが見つかりません');
    }
    
    // ブランドモーダルフォーム
    const brandModalForm = document.getElementById('brand-modal-form');
    if (brandModalForm) {
        console.log('ブランドモーダルフォームが見つかりました');
        brandModalForm.addEventListener('submit', handleBrandModalSubmit);
    } else {
        console.error('ブランドモーダルフォームが見つかりません');
    }
    
    // 画像アップロード機能の初期化
    initImageUpload();
    
    // ブランド詳細モーダルの初期化
    initBrandDetailModal();
}

// 在庫管理システムの初期化
function initInventorySystem() {
    console.log('在庫管理システム初期化開始');
    
    // 商品追加ボタン
    const addProductBtn = document.getElementById('add-product-btn');
    if (addProductBtn) {
        console.log('商品追加ボタンが見つかりました');
        addProductBtn.addEventListener('click', () => openProductModal());
    } else {
        console.error('商品追加ボタンが見つかりません');
    }
    
    // 入庫処理ボタン
    const inboundBtn = document.getElementById('inbound-btn');
    if (inboundBtn) {
        console.log('入庫処理ボタンが見つかりました');
        inboundBtn.addEventListener('click', () => openInventoryModal('inbound'));
    } else {
        console.error('入庫処理ボタンが見つかりません');
    }
    
    // 出庫処理ボタン
    const outboundBtn = document.getElementById('outbound-btn');
    if (outboundBtn) {
        console.log('出庫処理ボタンが見つかりました');
        outboundBtn.addEventListener('click', () => openInventoryModal('outbound'));
    } else {
        console.error('出庫処理ボタンが見つかりません');
    }
    
    const refreshBtn = document.getElementById('refresh-inventory-hub-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshInventory);
    
    // 商品フォーム（'product-form'）は、いまの画面には無い。
    //
    // 旧サイトには画面に直に置かれたフォームがあったが、
    // いまは「商品追加」を押すと出るモーダルに変わっていて、
    // その中の 'product-modal-form' が下で受け持っている。
    //
    // ここを 'product-modal-form' に付け替えかけたが、それは誤り。
    // 下ですでに handleProductModalSubmit を繋いでいるので、
    // 二重に繋がって、一度の保存で商品が2つ登録されるところだった。
    //
    // 無いものは無いままでよい。エラーとして騒ぐ必要もない。
    
    // 売上フォーム
    const saleForm = document.getElementById('sale-form');
    if (saleForm) {
        console.log('売上フォームが見つかりました');
        saleForm.addEventListener('submit', handleSaleSubmit);
    } else {
        console.error('売上フォームが見つかりません');
    }
    
    // レポート生成・データエクスポートのボタンは、いまの画面には無い。
    //
    // どちらも旧サイトの部品で、役目は別のところへ移っている。
    //   ・レポート  → ホームの「今日の状況」「最近の活動」
    //   ・取り出し  → 設定の「まとめて取り出す」（export-all）
    //
    // 無いものを探しては毎回エラーを出していたので、
    // 本当の異常がその中に埋もれていた。
    // 移した先があるものは、そう書いて終わりにする。
    const generateReportBtn = document.getElementById('generate-report-btn');
    if (generateReportBtn) generateReportBtn.addEventListener('click', generateReport);

    const exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) exportDataBtn.addEventListener('click', exportData);
    
    // モーダルの閉じるボタン
    const closeProductModal = document.getElementById('close-product-modal');
    if (closeProductModal) {
        console.log('商品モーダル閉じるボタンが見つかりました');
        closeProductModal.addEventListener('click', () => closeModal('product-modal'));
    } else {
        console.error('商品モーダル閉じるボタンが見つかりません');
    }
    
    const closeInventoryModal = document.getElementById('close-inventory-modal');
    if (closeInventoryModal) {
        console.log('在庫モーダル閉じるボタンが見つかりました');
        closeInventoryModal.addEventListener('click', () => closeModal('inventory-modal'));
    } else {
        console.error('在庫モーダル閉じるボタンが見つかりません');
    }
    
    // モーダルのキャンセルボタン
    const cancelProduct = document.getElementById('cancel-product');
    if (cancelProduct) {
        console.log('商品モーダルキャンセルボタンが見つかりました');
        cancelProduct.addEventListener('click', () => closeModal('product-modal'));
    } else {
        console.error('商品モーダルキャンセルボタンが見つかりません');
    }
    
    // 商品編集モーダル →「開発」タブのモックアップ・型紙ツールへの入り口
    const 商品名を控える = () => document.getElementById('modal-name')?.value?.trim() || '';
    document.getElementById('modal-dev-jump-mock')?.addEventListener('click', () => {
        const 名 = 商品名を控える();
        closeModal('product-modal');
        switchPage('studio');
        document.querySelector('.mock-editor')?.scrollIntoView({ block: 'start' });
        showNotification(
            名 ? `「${名}」のモックアップ作成画面です。上の「商品」欄で種類を選んでください。`
               : 'モックアップ作成画面です。上の「商品」欄で種類を選んでください。',
            'info'
        );
    });
    document.getElementById('modal-dev-jump-pattern')?.addEventListener('click', () => {
        const 名 = 商品名を控える();
        closeModal('product-modal');
        switchPage('studio');
        document.querySelector('.pattern-editor')?.scrollIntoView({ block: 'start' });
        showNotification(
            名 ? `「${名}」の型紙下書き画面です。` : '型紙下書き画面です。',
            'info'
        );
    });

    const cancelInventory = document.getElementById('cancel-inventory');
    if (cancelInventory) {
        console.log('在庫モーダルキャンセルボタンが見つかりました');
        cancelInventory.addEventListener('click', () => closeModal('inventory-modal'));
    } else {
        console.error('在庫モーダルキャンセルボタンが見つかりません');
    }
    
    // モーダルフォーム
    const productModalForm = document.getElementById('product-modal-form');
    if (productModalForm) {
        console.log('商品モーダルフォームが見つかりました');
        productModalForm.addEventListener('submit', handleProductModalSubmit);
    } else {
        console.error('商品モーダルフォームが見つかりません');
    }
    
    const inventoryModalForm = document.getElementById('inventory-modal-form');
    if (inventoryModalForm) {
        console.log('在庫モーダルフォームが見つかりました');
        inventoryModalForm.addEventListener('submit', handleInventoryModalSubmit);
    } else {
        console.error('在庫モーダルフォームが見つかりません');
    }
}

// 既存セッションのチェック
function checkExistingSession() {
    console.log('セッション確認開始');
    
    try {
        // 簡易的なセッションチェック（ローカルストレージベース）
        if (window.AReGLM_SECURITY && AReGLM_SECURITY.validateSession()) {
            showMainApp();
            const u = localStorage.getItem('username');
            if (u) updateUsernameDisplay(u);
            return;
        }
        
        console.log('有効なセッションが見つかりません');
    } catch (error) {
        console.error('セッション確認エラー:', error);
        showNotification('セッション確認中にエラーが発生しました', 'error');
    }
}

// セッションのクリア
function clearSession(wipeSecrets) {
    if (window.AReGLM_SECURITY) AReGLM_SECURITY.clearSession(!!wipeSecrets);
    else {
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('sessionExpiry');
        localStorage.removeItem('username');
    }
}

// ログイン処理
function handleLogin(e) {
    e.preventDefault();
    console.log('ログイン処理開始');
    
    try {
        const usernameElement = document.getElementById('username');
        const passwordElement = document.getElementById('password');
        
        if (!usernameElement || !passwordElement) {
            console.error('ログインフォームの要素が見つかりません');
            showNotification('ログインフォームの読み込みに失敗しました', 'error');
            return;
        }
        
        const username = usernameElement.value.trim();
        const password = passwordElement.value;
        
        console.log('ログイン情報:', { username, password: password ? '***' : 'empty' });
        
        if (!username || !password) {
            showNotification('ユーザー名とパスワードを入力してください。', 'error');
            return;
        }
        
        // 簡易的な認証（本番環境ではサーバーサイド認証が必要）
        if (username === 'admin' && password === 'Admin@2024!') {
            console.log('認証成功');
            if (window.AReGLM_SECURITY) AReGLM_SECURITY.createSession(username);
            else createSession(username);
            updateUsernameDisplay(username);
            showMainApp();
            showNotification('ログインに成功しました！', 'success');
        } else {
            console.log('認証失敗');
            showNotification('ユーザー名またはパスワードが正しくありません。', 'error');
        }
    } catch (error) {
        console.error('ログイン処理エラー:', error);
        showNotification('ログイン処理中にエラーが発生しました', 'error');
    }
}

// セッション作成
function createSession(username) {
    const sessionToken = generateToken();
    const sessionExpiry = Date.now() + (2 * 60 * 60 * 1000); // 2時間
    
    localStorage.setItem('sessionToken', sessionToken);
    localStorage.setItem('sessionExpiry', sessionExpiry.toString());
    localStorage.setItem('username', username);
    
    console.log('セッション作成完了');
}

// トークン生成
function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ログアウト処理
function handleLogout() {
    clearSession(true);
    hideMainApp();
    showNotification('ログアウトしました。', 'success');
}

// データベース初期化
function initDatabase() {
    console.log('データベース初期化開始');
    
    // 簡易的な初期化処理（実際のAPIがない場合）
    showNotification('データベース初期化が完了しました。', 'success');
    
    // サンプルデータの作成
    createSampleData();
}

/**
 * 中身を空にする
 *
 * ここは、問答無用で空にしていた。
 * ストッパーが見つけた。
 *
 * 商品も売上も、貯めたものが一度で消える。
 * しかも消える前に何も聞かない。
 * これは「消さない」という決まりに正面から反していた。
 *
 * いまは、
 *   1. 中身があるなら、控えを取る
 *   2. 本人に確かめる
 *   3. それから空にする
 * の順にしてある。
 */
function createSampleData() {
    const 消えるもの = ['products', 'sales', 'areglm_suzuri_products'];

    // いま何件あるかを数える。空なら、聞く必要もない。
    let 件数 = 0;
    消えるもの.forEach((鍵) => {
        try {
            const r = JSON.parse(localStorage.getItem(鍵) || '[]');
            if (Array.isArray(r)) 件数 += r.length;
        } catch { 件数 += 0; }
    });

    if (件数 > 0) {
        if (!confirm(`商品・売上あわせて ${件数}件 あります。\n\n`
            + 'これを空にします。よろしいですか。\n'
            + '（消す前に、控えをこの端末内に取ります）')) {
            showNotification('やめました。何も消していません。', 'info');
            return;
        }

        // 控えを取る。消してから「戻したい」と言われても遅い。
        const 控え = {};
        消えるもの.forEach((鍵) => { 控え[鍵] = localStorage.getItem(鍵); });
        localStorage.setItem(
            'areglm_初期化前の控え_' + new Date().toISOString().slice(0, 19),
            JSON.stringify(控え));
    }

    消えるもの.forEach((鍵) => localStorage.setItem(鍵, JSON.stringify([])));

    showNotification(
        件数 > 0
            ? `空にしました。控えは端末内に残してあります（${件数}件ぶん）。`
            : '空にしました。',
        'success');
    refreshInventory();
}

// メインアプリの表示
function showMainApp() {
    console.log('メインアプリ表示開始');
    
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    
    if (loginScreen) {
        loginScreen.style.display = 'none';
        console.log('ログイン画面を非表示にしました');
    } else {
        console.error('ログイン画面が見つかりません');
    }
    
    if (mainApp) {
        mainApp.style.display = 'block';
        console.log('メインアプリを表示しました');
    } else {
        console.error('メインアプリが見つかりません');
    }
    
    const u = localStorage.getItem('username');
    if (u) updateUsernameDisplay(u);
    if (typeof loadDashboardData === 'function') loadDashboardData();

    // 初めから、エージェント（JARVISモード）と話せる状態で開く。
    // ここが実際に画面が見え始める場所なので、ここで開く
    // （ログイン直後・セッションが残っていた場合のどちらも通る）。
    //
    // セッションが残っていた場合、この関数は initNavigation()（switchPage
    // で mainai を選ぶところ）より先に呼ばれてしまい、まだ mainai-page に
    // active が付いていない状態で確かめてしまっていた。
    // setTimeout(0) で、同期処理（initNavigation含む）が全部終わった
    // 直後まで確認を遅らせる。
    setTimeout(() => {
        if (document.getElementById('mainai-page')?.classList.contains('active')
            && localStorage.getItem('areglm_jarvis_default') !== 'false'
            && typeof JARVISモードを開く === 'function') {
            JARVISモードを開く();
        }
    }, 0);
}

// メインアプリの非表示
function hideMainApp() {
    console.log('メインアプリ非表示開始');
    
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    
    if (loginScreen) {
        loginScreen.style.display = 'flex';
        console.log('ログイン画面を表示しました');
    }
    
    if (mainApp) {
        mainApp.style.display = 'none';
        console.log('メインアプリを非表示にしました');
    }
}

// ユーザー名表示の更新
//
// 画面から #username-display 自体が無くなっており、
// 毎回ログイン時にエラーが2回出ていた。
// 表示する場所が無いのは今の画面構成として正常な状態なので、
// エラー扱いはやめる（要素があれば従来通り表示する）。
function updateUsernameDisplay(username) {
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) {
        usernameDisplay.textContent = `ようこそ、${username}さん`;
        console.log('ユーザー名表示を更新しました');
    }
}

// 初期データの読み込み
function loadInitialData() {
    console.log('初期データ読み込み開始');
    // 初期化時に必要なデータがあれば読み込み
}

// loadDashboardData は js/modules/dashboard.js で定義

// 在庫データの読み込み
function loadInventoryData() {
    console.log('在庫データ読み込み開始');
    
    try {
        // 在庫には、登録した商品をすべて出す。
        //
        // ここは SUZURI から来た商品だけに絞っていた。
        // そのため「商品を追加」で手で入れたものは、
        // 保存されていても一覧に出てこなかった。
        //
        // 自分で入れた商品が自分の在庫に出ないのでは、
        // 在庫表として使えない。絞らずに全部出す。
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        displayInventoryTable(products);
        updateProductSelects(products);
        console.log('在庫データ読み込み完了');
    } catch (error) {
        console.error('在庫データ読み込みエラー:', error);
        showNotification('在庫データの読み込みに失敗しました', 'error');
    }
}

// 在庫テーブルの表示
function displayInventoryTable(products) {
    console.log('在庫テーブル表示開始:', products);
    
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) {
        console.error('在庫テーブルのtbodyが見つかりません');
        return;
    }
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">商品が登録されていません。</td></tr>';
        return;
    }

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    tbody.innerHTML = '';
    products.forEach((product) => {
        const row = document.createElement('tr');
        const shopLink = product.shopUrl
            ? `<a href="${AReGLM_SECURITY.escapeAttr(product.shopUrl)}" target="_blank" rel="noopener">ショップ</a>`
            : '';

        // 見本のデータと自分のデータが混ざると、どれが本物か分からなくなる。
        // 見本には印を付けて、一目で見分けられるようにする。
        const 見本か = product.source === 'seed';
        const 印 = 見本か ? '<span class="badge-seed">見本</span>' : '';

        // 値段を変えたことがあるものは、その跡が分かるようにする
        const 改定数 = Array.isArray(product.価格改定履歴) ? product.価格改定履歴.length : 0;
        const 改定印 = 改定数 ? `<small class="hint">（${改定数}回改定）</small>` : '';

        row.innerHTML = `
            <td>${s(product.sku)}${印}</td>
            <td><small>${s(product.code || '—')}</small></td>
            <td>${s(product.name)} ${shopLink}</td>
            <td>¥${(product.price || 0).toLocaleString('ja-JP')} ${改定印}</td>
            <td>${product.quantity ?? 0}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editProduct('${AReGLM_SECURITY.escapeAttr(product.sku)}')">編集</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${AReGLM_SECURITY.escapeAttr(product.sku)}')">削除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 商品セレクトの更新
function updateProductSelects(products) {
    console.log('商品セレクト更新開始:', products);
    
    const saleProductSelect = document.getElementById('sale-product');
    const inventoryProductSelect = document.getElementById('inventory-product');
    
    if (saleProductSelect) {
        saleProductSelect.innerHTML = '<option value="">商品を選択してください</option>';
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.sku;
            option.textContent = `${product.name} (¥${product.price.toLocaleString('ja-JP')})`;
            saleProductSelect.appendChild(option);
        });
        console.log('売上商品セレクト更新完了');
    }
    
    if (inventoryProductSelect) {
        inventoryProductSelect.innerHTML = '<option value="">商品を選択してください</option>';
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.sku;
            option.textContent = `${product.name} (¥${product.price.toLocaleString('ja-JP')})`;
            inventoryProductSelect.appendChild(option);
        });
        console.log('在庫調整商品セレクト更新完了');
    }
}

// 売上データの読み込み
function loadSalesData() {
    console.log('売上データ読み込み開始');
    
    try {
        const sales = JSON.parse(localStorage.getItem('sales') || '[]');
        displaySalesHistory(sales);
        console.log('売上データ読み込み完了');
    } catch (error) {
        console.error('売上データ読み込みエラー:', error);
        showNotification('売上データの読み込みに失敗しました', 'error');
    }
}

// 売上履歴の表示
function displaySalesHistory(salesHistory) {
    console.log('売上履歴表示開始:', salesHistory);
    
    const tbody = document.getElementById('sales-tbody');
    if (!tbody) {
        console.error('売上履歴のtbodyが見つかりません');
        return;
    }
    
    if (!salesHistory || salesHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">売上履歴がありません。</td></tr>';
        console.log('売上履歴がありません');
        return;
    }
    
    tbody.innerHTML = '';
    salesHistory.forEach(sale => {
        const row = document.createElement('tr');
        const date = new Date(sale.date).toLocaleDateString('ja-JP');
        row.innerHTML = `
            <td>${date}</td>
            <td>${sale.product_name}</td>
            <td>${sale.quantity}</td>
            <td>¥${sale.price.toLocaleString('ja-JP')}</td>
            <td>¥${sale.total.toLocaleString('ja-JP')}</td>
        `;
        tbody.appendChild(row);
    });
    
    console.log('売上履歴表示完了');
}

// 商品追加・編集モーダルを開く
function openProductModal(productId = null) {
    console.log('商品モーダルを開く:', productId);
    
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('product-modal-title');
    const form = document.getElementById('product-modal-form');
    
    if (!modal || !title || !form) {
        console.error('商品モーダルの要素が見つかりません');
        return;
    }
    
    if (productId) {
        title.textContent = '商品編集';
        // 既存データでフォームを埋める
        loadProductData(productId);
    } else {
        // 追加のときは、前に編集したときの跡（隠しSKU・履歴・理由欄）まで消す。
        // form.reset() だけだと隠し項目が残り、
        // 追加のつもりが前の商品の上書きになってしまう。
        商品フォームを新規にする();
    }

    modal.style.display = 'block';
}

/** モーダルを開く（editProduct から使う。中身は既に埋めてある） */
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
}
window.openModal = openModal;

// 在庫調整モーダルを開く
function openInventoryModal(type) {
    console.log('在庫調整モーダルを開く:', type);
    
    const modal = document.getElementById('inventory-modal');
    const title = document.getElementById('inventory-modal-title');
    const form = document.getElementById('inventory-modal-form');
    
    if (!modal || !title || !form) {
        console.error('在庫調整モーダルの要素が見つかりません');
        return;
    }
    
    if (type === 'inbound') {
        title.textContent = '入庫処理';
    } else {
        title.textContent = '出庫処理';
    }
    
    form.setAttribute('data-type', type);
    form.reset();
    modal.style.display = 'block';
    console.log('在庫調整モーダルを表示しました');
}

// モーダルを閉じる
function closeModal(modalId) {
    console.log('モーダルを閉じる:', modalId);
    
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log('モーダルを閉じました');
    } else {
        console.error('モーダルが見つかりません:', modalId);
    }
}

// 商品フォームの送信処理
function handleProductSubmit(e) {
    e.preventDefault();
    console.log('商品フォーム送信処理開始');
    
    const formData = new FormData(e.target);
    const data = {
        sku: formData.get('sku'),
        name: formData.get('name'),
        price: parseInt(formData.get('price'), 10),
        quantity: parseInt(formData.get('quantity'), 10),
        source: document.getElementById('product-from-studio')?.checked ? 'studio' : 'manual',
        ecSync: {}
    };
    
    console.log('商品データ:', data);
    
    try {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        
        // SKUの重複チェック
        if (products.find(p => p.sku === data.sku)) {
            showNotification('SKUが既に存在します', 'error');
            return;
        }
        
        // 商品を追加
        products.push(data);
        localStorage.setItem('products', JSON.stringify(products));
        
        showNotification('商品が追加されました', 'success');
        e.target.reset();
        refreshInventory();
        
        console.log('商品追加完了');
    } catch (error) {
        console.error('商品追加エラー:', error);
        showNotification('商品の追加に失敗しました', 'error');
    }
}

// 商品モーダルフォームの送信処理
function handleProductModalSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const 元SKU = (formData.get('editSku') || '').trim();   // 空なら新規追加
    const 入力 = {
        sku: (formData.get('sku') || '').trim(),
        name: (formData.get('name') || '').trim(),
        code: (formData.get('code') || '').trim(),
        category: (formData.get('category') || '').trim(),
        colors: (formData.get('colors') || '').trim(),
        origin: (formData.get('origin') || '').trim(),
        madeBy: (formData.get('madeBy') || '').trim(),
        dataLink: (formData.get('dataLink') || '').trim(),
        note: (formData.get('note') || '').trim(),
        price: parseInt(formData.get('price'), 10) || 0,
        quantity: parseInt(formData.get('quantity'), 10) || 0,
    };

    try {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const 対象の位置 = 元SKU ? products.findIndex((p) => p.sku === 元SKU) : -1;

        // SKUの重複は、自分自身を除いて見る。
        // 編集で名前だけ直したいときにも弾かれていては使えない。
        const ぶつかる = products.some((p, i) => p.sku === 入力.sku && i !== 対象の位置);
        if (ぶつかる) {
            showNotification('そのSKUは既に使われています', 'error');
            return;
        }

        if (対象の位置 < 0) {
            products.push({
                ...入力,
                価格改定履歴: [],
                createdAt: new Date().toISOString(),
            });
            showNotification('商品を追加しました', 'success');
        } else {
            const 元 = products[対象の位置];
            const 履歴 = Array.isArray(元.価格改定履歴) ? [...元.価格改定履歴] : [];

            // 値段が変わったときだけ、前の値段を残す。
            // 上書きしてしまうと「いくらから変えたのか」が分からなくなる。
            const 旧価格 = Number(元.price) || 0;
            if (旧価格 !== 入力.price) {
                履歴.push({
                    旧価格,
                    新価格: 入力.price,
                    訳: (formData.get('priceReason') || '').trim(),
                    変えた日: new Date().toISOString(),
                });
            }

            products[対象の位置] = { ...元, ...入力, 価格改定履歴: 履歴 };
            showNotification(
                旧価格 !== 入力.price
                    ? `商品を更新しました（¥${旧価格.toLocaleString('ja-JP')} → ¥${入力.price.toLocaleString('ja-JP')} を履歴に残しました）`
                    : '商品を更新しました',
                'success');
        }

        localStorage.setItem('products', JSON.stringify(products));
        closeModal('product-modal');
        refreshInventory();
        if (typeof loadDashboardData === 'function') loadDashboardData();
    } catch (error) {
        console.error('商品の保存エラー:', error);
        showNotification('商品の保存に失敗しました', 'error');
    }
}

/**
 * 商品を編集する。
 *
 * 追加しかできないままだと、値段を直すのに一度消して入れ直すことになり、
 * そのたびに履歴も消えてしまう。編集できて初めて履歴が意味を持つ。
 */
function editProduct(sku) {
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const p = products.find((x) => x.sku === sku);
    if (!p) { showNotification('その商品が見つかりません', 'error'); return; }

    const 入れる = (id, 値) => {
        const el = document.getElementById(id);
        if (el) el.value = 値 ?? '';
    };
    入れる('modal-edit-sku', p.sku);
    入れる('modal-sku', p.sku);
    入れる('modal-name', p.name);
    入れる('modal-code', p.code);
    入れる('modal-category', p.category);
    入れる('modal-colors', p.colors);
    入れる('modal-origin', p.origin);
    入れる('modal-madeby', p.madeBy);
    入れる('modal-price', p.price);
    入れる('modal-quantity', p.quantity);
    入れる('modal-datalink', p.dataLink);
    入れる('modal-note', p.note);
    入れる('modal-price-reason', '');

    // 編集のときだけ、値段を変える理由を書けるようにする
    const 理由枠 = document.getElementById('modal-price-reason-wrap');
    if (理由枠) 理由枠.hidden = false;

    // 編集のときだけ、この商品のモックアップ・型紙づくりへの入り口を出す。
    // 「開発」タブに機能はあるのに、商品編集画面からたどり着けなかった。
    const 開発枠 = document.getElementById('modal-dev-links');
    if (開発枠) 開発枠.hidden = false;

    価格履歴を出す(p);

    const 題 = document.getElementById('product-modal-title');
    if (題) 題.textContent = `商品を編集: ${p.name || p.sku}`;
    openModal('product-modal');
}

/** これまでの値段の変わり方を出す */
function 価格履歴を出す(p) {
    const 箱 = document.getElementById('modal-price-history');
    if (!箱) return;
    箱.innerHTML = '';

    const 履歴 = Array.isArray(p?.価格改定履歴) ? p.価格改定履歴 : [];
    if (!履歴.length) return;

    const 見出し = document.createElement('h4');
    見出し.className = 'rule-head';
    見出し.textContent = '値段の変わり方';
    箱.appendChild(見出し);

    const ul = document.createElement('ul');
    ul.className = 'rule-log';
    履歴.slice().reverse().forEach((h) => {
        const li = document.createElement('li');
        li.className = 'rule-log-item';
        li.textContent = `${new Date(h.変えた日).toLocaleDateString('ja-JP')}  `
            + `¥${Number(h.旧価格).toLocaleString('ja-JP')} → ¥${Number(h.新価格).toLocaleString('ja-JP')}`
            + (h.訳 ? `（${h.訳}）` : '');
        ul.appendChild(li);
    });
    箱.appendChild(ul);
}

/** 「＋ 商品を追加」から開くときは、編集の跡を消してから開く */
function 商品フォームを新規にする() {
    const form = document.getElementById('product-modal-form');
    if (form) form.reset();
    const 隠し = document.getElementById('modal-edit-sku');
    if (隠し) 隠し.value = '';
    const 理由枠 = document.getElementById('modal-price-reason-wrap');
    if (理由枠) 理由枠.hidden = true;
    const 開発枠 = document.getElementById('modal-dev-links');
    if (開発枠) 開発枠.hidden = true;
    const 履歴箱 = document.getElementById('modal-price-history');
    if (履歴箱) 履歴箱.innerHTML = '';
    const 題 = document.getElementById('product-modal-title');
    if (題) 題.textContent = '商品追加';
}

window.editProduct = editProduct;
window.商品フォームを新規にする = 商品フォームを新規にする;

// 在庫調整モーダルフォームの送信処理
function handleInventoryModalSubmit(e) {
    e.preventDefault();
    console.log('在庫調整モーダルフォーム送信処理開始');
    
    const formData = new FormData(e.target);
    const type = e.target.getAttribute('data-type');
    const data = {
        product_sku: formData.get('product_id'),
        quantity: parseInt(formData.get('quantity'))
    };
    
    console.log('在庫調整データ:', { type, data });
    
    try {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const product = products.find(p => p.sku === data.product_sku);
        
        if (!product) {
            showNotification('商品が見つかりません', 'error');
            return;
        }
        
        if (type === 'outbound' && product.quantity < data.quantity) {
            showNotification('在庫が不足しています', 'error');
            return;
        }
        
        // 在庫を更新
        if (type === 'inbound') {
            product.quantity += data.quantity;
        } else {
            product.quantity -= data.quantity;
        }
        
        localStorage.setItem('products', JSON.stringify(products));
        
        const message = type === 'inbound' ? '入庫処理が完了しました' : '出庫処理が完了しました';
        showNotification(message, 'success');
        closeModal('inventory-modal');
        refreshInventory();
        
        console.log('在庫調整完了');
    } catch (error) {
        console.error('在庫調整エラー:', error);
        showNotification('在庫調整に失敗しました', 'error');
    }
}

// 売上フォームの送信処理
function handleSaleSubmit(e) {
    e.preventDefault();
    console.log('売上フォーム送信処理開始');
    
    const formData = new FormData(e.target);
    const data = {
        product_sku: formData.get('product_id'),
        quantity: parseInt(formData.get('quantity')),
        price: parseInt(formData.get('price'))
    };
    
    console.log('売上データ:', data);
    
    try {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const product = products.find(p => p.sku === data.product_sku);
        
        if (!product) {
            showNotification('商品が見つかりません', 'error');
            return;
        }
        
        if (product.quantity < data.quantity) {
            showNotification('在庫が不足しています', 'error');
            return;
        }
        
        // 売上を記録
        const sales = JSON.parse(localStorage.getItem('sales') || '[]');
        const sale = {
            date: new Date().toISOString(),
            product_name: product.name,
            quantity: data.quantity,
            price: data.price,
            total: data.quantity * data.price
        };
        
        sales.push(sale);
        localStorage.setItem('sales', JSON.stringify(sales));
        
        // 在庫を更新
        product.quantity -= data.quantity;
        localStorage.setItem('products', JSON.stringify(products));
        
        showNotification('売上が登録されました', 'success');
        e.target.reset();
        refreshInventory();
        loadSalesData();
        
        console.log('売上登録完了');
    } catch (error) {
        console.error('売上登録エラー:', error);
        showNotification('売上の登録に失敗しました', 'error');
    }
}

// 在庫データの更新
function refreshInventory() {
    console.log('在庫データ更新開始');
    loadInventoryData();
    if (typeof loadInventoryHub === 'function') loadInventoryHub();
    if (typeof loadDashboardData === 'function') loadDashboardData();
    console.log('在庫データ更新完了');
}


// 商品の削除
function deleteProduct(productSku) {
    console.log('商品削除開始:', productSku);
    
    if (confirm('この商品を削除してもよろしいですか？')) {
        try {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const filteredProducts = products.filter(p => p.sku !== productSku);
            
            localStorage.setItem('products', JSON.stringify(filteredProducts));
            
            showNotification('商品を削除しました', 'success');
            refreshInventory();
            
            console.log('商品削除完了');
        } catch (error) {
            console.error('商品削除エラー:', error);
            showNotification('商品の削除に失敗しました', 'error');
        }
    }
}

// レポートの生成
function generateReport() {
    console.log('レポート生成開始');
    // レポート生成機能の実装
    showNotification('レポート生成機能は開発中です', 'info');
}

// データのエクスポート
function exportData() {
    console.log('データエクスポート開始');
    // データエクスポート機能の実装
    showNotification('データエクスポート機能は開発中です', 'info');
}

// 商品データの読み込み
function loadProductData(productId) {
    console.log('商品データ読み込み開始:', productId);
    // 商品データ読み込み機能の実装
    showNotification('商品データ読み込み機能は開発中です', 'info');
}

// ブランドモーダルを開く
function openBrandModal(brandId = null) {
    console.log('ブランドモーダルを開く:', brandId);
    
    const modal = document.getElementById('brand-modal');
    const title = document.getElementById('brand-modal-title');
    const form = document.getElementById('brand-modal-form');
    
    if (!modal || !title || !form) {
        console.error('ブランドモーダルの要素が見つかりません');
        return;
    }
    
    if (brandId) {
        title.textContent = 'ブランド編集';
        // 既存データでフォームを埋める
        loadBrandData(brandId);
    } else {
        title.textContent = 'ブランド追加';
        form.reset();
        // フォームのブランドID属性をクリア
        form.removeAttribute('data-brand-id');
        // ロゴ入力フィールドとプレビューをリセット
        const logoInput = document.getElementById('modal-brand-logo');
        const logoPreview = document.getElementById('brand-logo-preview');
        if (logoInput) {
            logoInput.value = '';
        }
        if (logoPreview) {
            logoPreview.innerHTML = `
                <div class="upload-placeholder">
                    <i class="upload-icon">🏷️</i>
                    <p>ロゴURLを入力してください</p>
                    <p style="font-size: 0.8rem; opacity: 0.7;">例: https://example.com/logo.png</p>
                </div>
            `;
            logoPreview.classList.remove('error');
        }
        
        // 写真入力フィールドとプレビューをリセット
        const photoInput = document.getElementById('modal-brand-photo');
        const photoPreview = document.getElementById('brand-photo-preview');
        if (photoInput) {
            photoInput.value = '';
        }
        if (photoPreview) {
            photoPreview.innerHTML = `
                <div class="upload-placeholder">
                    <i class="upload-icon">📸</i>
                    <p>写真URLを入力してください</p>
                    <p style="font-size: 0.7rem; opacity: 0.7;">例: https://example.com/photo.jpg</p>
                </div>
            `;
            photoPreview.classList.remove('error');
        }
    }
    
    modal.style.display = 'block';
    console.log('ブランドモーダルを表示しました');
}

/**
 * ロゴ画像＋ブランド基本情報をもとに、AIでブランドヒストリー・理念の下書きを生成。
 * ロゴURLの取得に失敗した場合（CORS等）はテキスト情報のみで生成する。
 * 生成結果は各フィールドに自動入力するが、必ず内容を確認・編集してから保存すること。
 */
/**
 * ブランドの理念と歴史を、資料から調べる
 *
 * <b>作りません。調べます。</b>
 *
 * 前は「説得力のあるブランドヒストリーを考えて」と頼み、
 * 創業年まで推定させていた。
 * それは、ありもしない歴史を作ることになる。
 *
 * 「事実でないことを、事実のように言わない」という決まりに、
 * 真正面から反していた。
 *
 * さらに、ロゴの絵を外から取ってきていた。
 * 「外へ送らない」という決まりにも反していた。
 *
 * いまは、あなたが入れた資料の中だけを調べる。
 * 見つからなければ「見つかりません」と言う。埋めない。
 */
async function generateBrandHistoryWithAi() {
    const name = document.getElementById('modal-brand-name')?.value?.trim();
    if (!name) {
        showNotification('先にブランド名を入力してください', 'error');
        return;
    }
    if (typeof ブランドの下書きをまとめる !== 'function') {
        showNotification('調べる仕組みが読み込まれていません', 'error');
        return;
    }

    const btn = document.getElementById('brand-ai-generate-btn');
    const 元 = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = '調べています…';
    }

    try {
        const r = await ブランドの下書きをまとめる(name);

        if (!r.ok) {
            // 見つからないことを、はっきり伝える。
            // 曖昧にすると、作り話で埋めたくなる。
            const 枠 = document.getElementById('brand-ai-result');
            if (枠) {
                枠.hidden = false;
                枠.className = 'notice-strict';
                枠.textContent = r.訳;
            } else {
                alert(r.訳);
            }
            showNotification('資料に見つかりませんでした', 'warning');
            return;
        }

        // 見つかったものだけを入れる。
        // 空のところは空のままにする。
        if (r.理念) {
            const el = document.getElementById('modal-brand-philosophy');
            if (el && !el.value.trim()) el.value = r.理念;
        }
        if (r.歴史) {
            const el = document.getElementById('modal-brand-description');
            if (el && !el.value.trim()) el.value = r.歴史;
        }
        if (r.創業年) {
            const el = document.getElementById('modal-brand-established');
            if (el && !el.value.trim()) el.value = r.創業年;
        }
        if (r.代表者) {
            const el = document.getElementById('modal-brand-ceo');
            if (el && !el.value.trim()) el.value = r.代表者;
        }

        // どこから取ったかを見せる。
        // 出どころが分からない文は、あとで信じられなくなる。
        const 枠 = document.getElementById('brand-ai-result');
        if (枠) {
            枠.hidden = false;
            枠.className = 'hint';
            枠.textContent = r.訳
                + (r.出どころ && r.出どころ.length
                    ? `　（出どころ: ${r.出どころ.slice(0, 2).join('、')}）`
                    : '');
        }

        showNotification(r.訳, 'success');
        if (window.logActivity) {
            logActivity(`ブランドを資料から調べた: ${name}`,
                { category: 'brand-research', text: name });
        }
    } catch (err) {
        showNotification('調べられませんでした: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 元 || '🔍 資料から調べる';
        }
    }
}

// ブランドデータの読み込み
function loadBrandData(brandId) {
    console.log('ブランドデータ読み込み開始:', brandId);
    
    try {
        const brands = JSON.parse(localStorage.getItem('brands') || '[]');
        const brand = brands.find(b => b.id == brandId);
        
        if (!brand) {
            showNotification('ブランドが見つかりません', 'error');
            return;
        }
        
        // フォームに既存データを設定
        document.getElementById('modal-brand-name').value = brand.name || '';
        document.getElementById('modal-brand-description').value = brand.description || '';
        document.getElementById('modal-brand-category').value = brand.category || '';
        document.getElementById('modal-brand-country').value = brand.country || '';
        document.getElementById('modal-brand-price').value = brand.price || '';
        document.getElementById('modal-brand-url').value = brand.url || '';
        document.getElementById('modal-brand-established').value = brand.established || '';
        document.getElementById('modal-brand-ceo').value = brand.ceo || '';
        document.getElementById('modal-brand-philosophy').value = brand.philosophy || '';
        document.getElementById('modal-brand-collections').value = brand.collections || '';
        document.getElementById('modal-brand-stores').value = brand.stores || '';
        
        // ロゴ画像の設定
        const logoPreview = document.getElementById('brand-logo-preview');
        if (brand.logo) {
            {
                // URLをそのまま入れていた。ストッパーが見つけた。
                logoPreview.textContent = '';
                const 絵 = document.createElement('img');
                絵.src = brand.logo;
                絵.alt = 'ロゴ';
                logoPreview.appendChild(絵);
            }
            logoPreview.classList.remove('error');
        } else {
            logoPreview.innerHTML = `
                <div class="upload-placeholder">
                    <i class="upload-icon">🏷️</i>
                    <p>ロゴURLを入力してください</p>
                    <p style="font-size: 0.8rem; opacity: 0.7;">例: https://example.com/logo.png</p>
                </div>
            `;
            logoPreview.classList.remove('error');
        }
        
        // 写真画像の設定
        const photoPreview = document.getElementById('brand-photo-preview');
        if (brand.photo) {
            {
                photoPreview.textContent = '';
                const 絵 = document.createElement('img');
                絵.src = brand.photo;
                絵.alt = '写真';
                photoPreview.appendChild(絵);
            }
            photoPreview.classList.remove('error');
        } else {
            photoPreview.innerHTML = `
                <div class="upload-placeholder">
                    <i class="upload-icon">📸</i>
                    <p>写真URLを入力してください</p>
                    <p style="font-size: 0.8rem; opacity: 0.7;">例: https://example.com/photo.jpg</p>
                </div>
            `;
            photoPreview.classList.remove('error');
        }
        
        // フォームにブランドIDを設定（更新時に使用）
        const form = document.getElementById('brand-modal-form');
        form.setAttribute('data-brand-id', brand.id);
        
        console.log('ブランドデータ読み込み完了');
    } catch (error) {
        console.error('ブランドデータ読み込みエラー:', error);
        showNotification('ブランドデータの読み込みに失敗しました', 'error');
    }
}

// ブランドモーダルフォームの送信処理
function handleBrandModalSubmit(e) {
    e.preventDefault();
    console.log('ブランドモーダルフォーム送信処理開始');
    
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        description: formData.get('description'),
        category: formData.get('category'),
        country: formData.get('country'),
        price: formData.get('price'),
        url: formData.get('url'),
        established: formData.get('established'),
        ceo: formData.get('ceo'),
        philosophy: formData.get('philosophy'),
        collections: formData.get('collections'),
        stores: formData.get('stores'),
        // 「参考になる点」は、この一覧のいちばん大事な中身。
        // ここを保存し忘れると、書いても消える。
        '参考になる点': formData.get('参考になる点') || ''
    };
    
    // ロゴ画像URLの処理
    const logoInput = document.getElementById('modal-brand-logo');
    const logoUrl = logoInput.value.trim();
    if (logoUrl) {
        data.logo = logoUrl;
    }
    
    // 写真画像URLの処理
    const photoInput = document.getElementById('modal-brand-photo');
    const photoUrl = photoInput.value.trim();
    if (photoUrl) {
        data.photo = photoUrl;
    }
    
    // データを保存
    saveBrandData(data);
}

// ブランドデータの保存
function saveBrandData(data) {
    console.log('ブランドデータ保存開始:', data);
    
    try {
        const brands = JSON.parse(localStorage.getItem('brands') || '[]');
        const form = document.getElementById('brand-modal-form');
        const brandId = form.getAttribute('data-brand-id');
        
        // 新規ブランドか既存ブランドかの判定
        const existingBrandIndex = brands.findIndex(b => b.id == brandId);
        
        if (existingBrandIndex >= 0) {
            // 既存ブランドの更新
            brands[existingBrandIndex] = {
                ...brands[existingBrandIndex],
                ...data,
                id: parseInt(brandId),
                updatedAt: new Date().toISOString()
            };
            showNotification('ブランドが更新されました', 'success');
        } else {
            // 新規ブランドの追加
            const newBrand = {
                ...data,
                id: Date.now(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            brands.push(newBrand);
            showNotification('ブランドが追加されました', 'success');
        }
        
        localStorage.setItem('brands', JSON.stringify(brands));
        closeModal('brand-modal');
        refreshBrands();
        
        console.log('ブランドデータ保存完了');
    } catch (error) {
        console.error('ブランドデータ保存エラー:', error);
        showNotification('ブランドの保存に失敗しました', 'error');
    }
}

// ブランド一覧の更新
function refreshBrands() {
    console.log('ブランド一覧更新開始');
    loadBrandsData();
    // 「自分のブランド／他社のブランド」タブ側は別のデータ描画なので、
    // ここを呼ばないと追加・編集・削除をしてもタブの表示だけ古いままになる。
    if (typeof renderBrandSplit === 'function') renderBrandSplit();
    if (typeof loadDashboardData === 'function') loadDashboardData();
    console.log('ブランド一覧更新完了');
}

// ブランドデータの読み込み
function loadBrandsData() {
    // 一覧を開いた時点でも件数表示を合わせる
    setTimeout(() => {
        try {
            const all = JSON.parse(localStorage.getItem('brands') || '[]');
            if (typeof updateBrandCount === 'function') updateBrandCount(all.length, all.length);
        } catch { /* 表示だけの処理なので失敗しても無視 */ }
    }, 0);
    console.log('ブランドデータ読み込み開始');
    
    try {
        const brands = JSON.parse(localStorage.getItem('brands') || '[]');
        displayBrandsList(brands);
        console.log('ブランドデータ読み込み完了');
    } catch (error) {
        console.error('ブランドデータ読み込みエラー:', error);
        showNotification('ブランドデータの読み込みに失敗しました', 'error');
    }
}

// ブランド一覧の表示
function displayBrandsList(brands) {
    console.log('ブランド一覧表示開始:', brands);
    
    const brandList = document.getElementById('brand-list');
    if (!brandList) {
        console.error('ブランド一覧の要素が見つかりません');
        return;
    }
    
    if (brands.length === 0) {
        brandList.innerHTML = '<div class="empty">ブランドが登録されていません。</div>';
        console.log('ブランドが登録されていません');
        return;
    }
    
    brandList.innerHTML = '';
    brands.forEach(brand => {
        const card = document.createElement('div');
        card.className = 'brand-card';
        
        // ロゴ・写真・ブランド名・説明・価格帯などは、参考ブランドの取り込みや
        // AI調査の結果、あるいは外部AIとのやり取り経由で入ってくることがある。
        // 中身を確かめずに innerHTML へそのまま差し込んでいたため、
        // HTMLタグが混ざっていると実行される恐れがあった（コードの安全点検の
        // 対象外だったが、chat.js で見つかったのと同種の穴）。
        // 表示用の文字列は、まとめて安全にしてから使う。
        const 安全 = (s) => (typeof AReGLM_SECURITY !== 'undefined' ? AReGLM_SECURITY.sanitizeHtml(String(s ?? '')) : String(s ?? ''));
        const 属性安全 = (s) => (typeof AReGLM_SECURITY !== 'undefined' ? AReGLM_SECURITY.escapeAttr(String(s ?? '')) : String(s ?? ''));

        // ロゴ画像の表示
        const logoHtml = brand.logo ?
            `<div class="brand-logo-small"><img src="${属性安全(brand.logo)}" alt="${属性安全(brand.name)}ロゴ"></div>` :
            '<div class="brand-logo-small no-logo">🏷️</div>';

        // 写真画像の表示
        const photoHtml = brand.photo ?
            `<div class="brand-photo-small"><img src="${属性安全(brand.photo)}" alt="${属性安全(brand.name)}写真"></div>` :
            '<div class="brand-photo-small no-photo">📸</div>';

        card.innerHTML = `
            <div class="brand-card-header">
                <div class="brand-images-small">
                    ${logoHtml}
                    ${photoHtml}
                </div>
                <div class="brand-card-info">
                    <h3>${安全(brand.name)}</h3>
                    <p>${安全(brand.description)}</p>
                </div>
            </div>
            <div class="brand-meta">
                <span class="brand-tag category">${安全(brand.category)}</span>
                <span class="brand-tag country">${安全(brand.country)}</span>
                <span class="brand-tag price">${安全(brand.price)}</span>
            </div>
            ${brand.url ? `<a href="${属性安全(brand.url)}" target="_blank" class="brand-website">公式サイト</a>` : ''}
            <div class="brand-actions">
                <button class="btn btn-sm btn-primary" onclick="showBrandDetail(${brand.id})">詳細</button>
                <button class="btn btn-sm btn-secondary" onclick="editBrand(${brand.id})">編集</button>
                <button class="btn btn-sm btn-danger" onclick="deleteBrand(${brand.id})">削除</button>
            </div>
        `;

        brandList.appendChild(card);
    });
    
    console.log('ブランド一覧表示完了');
}

// ブランドの編集
function editBrand(brandId) {
    console.log('ブランド編集開始:', brandId);
    openBrandModal(brandId);
}

// ブランドの削除
function deleteBrand(brandId) {
    console.log('ブランド削除開始:', brandId);
    
    if (confirm('このブランドを削除してもよろしいですか？')) {
        try {
            const brands = JSON.parse(localStorage.getItem('brands') || '[]');
            const filteredBrands = brands.filter(b => b.id !== brandId);
            
            localStorage.setItem('brands', JSON.stringify(filteredBrands));
            
            showNotification('ブランドを削除しました', 'success');
            refreshBrands();
            
            console.log('ブランド削除完了');
        } catch (error) {
            console.error('ブランド削除エラー:', error);
            showNotification('ブランドの削除に失敗しました', 'error');
        }
    }
}

// 画像URL入力機能の初期化
function initImageUpload() {
    console.log('画像URL入力機能初期化開始');
    
    // ロゴ画像の初期化
    initImageField('modal-brand-logo', 'brand-logo-preview', '🏷️', 'ロゴURLを入力してください', '例: https://example.com/logo.png');
    
    // 写真画像の初期化
    initImageField('modal-brand-photo', 'brand-photo-preview', '📸', '写真URLを入力してください', '例: https://example.com/photo.jpg');
    
    console.log('画像URL入力機能初期化完了');
}

// 個別の画像フィールド初期化
function initImageField(inputId, previewId, icon, mainText, subText) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    if (input && preview) {
        // URL入力時の処理
        input.addEventListener('input', function(e) {
            const imageUrl = e.target.value.trim();
            if (imageUrl) {
                handleImageUrlInput(imageUrl, preview);
            } else {
                // URLが空の場合はプレースホルダーを表示
                preview.innerHTML = `
                    <div class="upload-placeholder">
                        <i class="upload-icon">${icon}</i>
                        <p>${mainText}</p>
                        <p style="font-size: 0.8rem; opacity: 0.7;">${subText}</p>
                    </div>
                `;
                preview.classList.remove('error');
            }
        });
        
        // Enterキーでの処理
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const imageUrl = e.target.value.trim();
                if (imageUrl) {
                    handleImageUrlInput(imageUrl, preview);
                }
            }
        });
    } else {
        console.error(`画像フィールド要素が見つかりません: ${inputId}`);
    }
}

// 画像URL入力処理
function handleImageUrlInput(imageUrl, previewElement) {
    console.log('画像URL入力処理開始:', imageUrl);
    
    // URLの形式チェック
    if (!isValidImageUrl(imageUrl)) {
        showNotification('有効な画像URLを入力してください', 'error');
        previewElement.classList.add('error');
        previewElement.innerHTML = `
            <div class="upload-placeholder">
                <i class="upload-icon">❌</i>
                <p>無効な画像URLです</p>
            </div>
        `;
        return;
    }
    
    // 画像の読み込みテスト
    const img = new Image();
    img.onload = function() {
        // 画像のサイズをチェックして適切に表示
        const aspectRatio = img.width / img.height;
        let displayStyle = '';
        
        if (aspectRatio > 1) {
            // 横長の画像
            displayStyle = 'max-width: 100%; max-height: 150px; object-fit: contain;';
        } else {
            // 縦長の画像
            displayStyle = 'max-width: 100%; max-height: 150px; object-fit: contain;';
        }
        
        {
            // URLと見た目をそのまま入れていた。ストッパーが見つけた。
            previewElement.textContent = '';
            const 絵 = document.createElement('img');
            絵.src = imageUrl;
            絵.alt = 'プレビュー';
            絵.setAttribute('style', displayStyle);
            previewElement.appendChild(絵);
        }
        previewElement.classList.remove('error');
        console.log('画像プレビュー表示完了');
    };
    
    img.onerror = function() {
        showNotification('画像の読み込みに失敗しました。URLを確認してください。', 'error');
        previewElement.classList.add('error');
        previewElement.innerHTML = `
            <div class="upload-placeholder">
                <i class="upload-icon">❌</i>
                <p>画像の読み込みに失敗しました</p>
            </div>
        `;
    };
    
    img.src = imageUrl;
}

// 画像URLの妥当性チェック
function isValidImageUrl(url) {
    try {
        const urlObj = new URL(url);
        const validProtocols = ['http:', 'https:'];
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        
        // プロトコルチェック
        if (!validProtocols.includes(urlObj.protocol)) {
            return false;
        }
        
        // 拡張子チェック（オプション）
        const pathname = urlObj.pathname.toLowerCase();
        const hasValidExtension = validExtensions.some(ext => pathname.endsWith(ext));
        
        return hasValidExtension;
    } catch (error) {
        return false;
    }
}

// ブランド詳細モーダルの初期化
function initBrandDetailModal() {
    console.log('ブランド詳細モーダル初期化開始');
    
    const closeDetailBtn = document.getElementById('close-brand-detail');
    const editDetailBtn = document.getElementById('edit-brand-detail');
    const deleteDetailBtn = document.getElementById('delete-brand-detail');
    
    if (closeDetailBtn) {
        closeDetailBtn.addEventListener('click', () => closeModal('brand-detail-modal'));
    }
    
    if (editDetailBtn) {
        editDetailBtn.addEventListener('click', function() {
            const brandId = this.getAttribute('data-brand-id');
            if (brandId) {
                closeModal('brand-detail-modal');
                openBrandModal(brandId);
            }
        });
    }
    
    if (deleteDetailBtn) {
        deleteDetailBtn.addEventListener('click', function() {
            const brandId = this.getAttribute('data-brand-id');
            if (brandId) {
                closeModal('brand-detail-modal');
                deleteBrand(brandId);
            }
        });
    }
    
    console.log('ブランド詳細モーダル初期化完了');
}

// ブランド詳細表示
function showBrandDetail(brandId) {
    console.log('ブランド詳細表示開始:', brandId);
    
    try {
        const brands = JSON.parse(localStorage.getItem('brands') || '[]');
        const brand = brands.find(b => b.id == brandId);
        
        if (!brand) {
            showNotification('ブランドが見つかりません', 'error');
            return;
        }
        
        // 詳細情報を設定
        document.getElementById('brand-detail-title').textContent = brand.name;
        document.getElementById('brand-detail-name').textContent = brand.name;
        document.getElementById('brand-detail-description').textContent = brand.description;
        document.getElementById('brand-detail-established').textContent = brand.established || '未設定';
        document.getElementById('brand-detail-ceo').textContent = brand.ceo || '未設定';
        document.getElementById('brand-detail-country').textContent = brand.country;
        document.getElementById('brand-detail-price').textContent = brand.price;
        // 参考ブランドには「このブランドから何を学べるか」が入っている。
        // ただ並べるだけでは意味がないので、そこを必ず見せる。
        const 学び = document.getElementById('brand-detail-learn');
        const 学びの枠 = 学び && 学び.closest('.detail-section');
        if (学び) {
            学び.textContent = brand['参考になる点'] || '';
            if (学びの枠) 学びの枠.style.display = brand['参考になる点'] ? '' : 'none';
        }

        document.getElementById('brand-detail-philosophy').textContent = brand.philosophy || '未設定';
        document.getElementById('brand-detail-collections').textContent = brand.collections || '未設定';
        document.getElementById('brand-detail-stores').textContent = brand.stores || '未設定';
        
        // ロゴ画像の設定
        const logoImg = document.getElementById('brand-detail-logo-img');
        if (brand.logo) {
            logoImg.src = brand.logo;
            logoImg.style.display = 'block';
        } else {
            logoImg.style.display = 'none';
        }
        
        // 写真画像の設定
        const photoImg = document.getElementById('brand-detail-photo-img');
        if (brand.photo) {
            photoImg.src = brand.photo;
            photoImg.style.display = 'block';
        } else {
            photoImg.style.display = 'none';
        }
        
        // タグの設定
        const tagsContainer = document.getElementById('brand-detail-tags');
        tagsContainer.innerHTML = `
            <span class="brand-tag category">${brand.category}</span>
            <span class="brand-tag country">${brand.country}</span>
            <span class="brand-tag price">${brand.price}</span>
        `;
        
        // 公式サイトURLの設定
        const urlLink = document.getElementById('brand-detail-url');
        if (brand.url) {
            urlLink.href = brand.url;
            urlLink.textContent = brand.url;
            urlLink.style.display = 'inline';
        } else {
            urlLink.style.display = 'none';
        }
        
        // 編集・削除ボタンにブランドIDを設定
        document.getElementById('edit-brand-detail').setAttribute('data-brand-id', brand.id);
        document.getElementById('delete-brand-detail').setAttribute('data-brand-id', brand.id);
        
        // モーダルを表示
        const modal = document.getElementById('brand-detail-modal');
        modal.style.display = 'block';
        
        console.log('ブランド詳細表示完了');
    } catch (error) {
        console.error('ブランド詳細表示エラー:', error);
        showNotification('ブランド詳細の表示に失敗しました', 'error');
    }
}

// ブランドのフィルタリング
function filterBrands() {
    console.log('ブランドフィルタリング開始');
    
    try {
        const searchTerm = document.getElementById('brand-search').value.toLowerCase();
        const categoryFilter = document.getElementById('brand-category-filter').value;
        const countryFilter = document.getElementById('brand-country-filter').value;
        const priceFilter = document.getElementById('brand-price-filter')?.value || '';

        const brands = JSON.parse(localStorage.getItem('brands') || '[]');

        const filteredBrands = brands.filter(brand => {
            // 説明が未入力のブランドでも落ちないようにする
            const name = (brand.name || '').toLowerCase();
            const desc = (brand.description || '').toLowerCase();
            const matchesSearch = !searchTerm || name.includes(searchTerm) || desc.includes(searchTerm);
            const matchesCategory = !categoryFilter || brand.category === categoryFilter;
            const matchesCountry = !countryFilter || brand.country === countryFilter;
            const matchesPrice = !priceFilter || brand.price === priceFilter;

            return matchesSearch && matchesCategory && matchesCountry && matchesPrice;
        });

        displayBrandsList(filteredBrands);
        updateBrandCount(filteredBrands.length, brands.length);
        console.log('ブランドフィルタリング完了:', filteredBrands.length);
    } catch (error) {
        console.error('ブランドフィルタリングエラー:', error);
        showNotification('ブランドのフィルタリングに失敗しました', 'error');
    }
}

/** 「◯件中◯件を表示中」を出す。絞り込みで見落としが起きないようにするため。 */
function updateBrandCount(shown, total) {
    const el = document.getElementById('brand-count');
    if (!el) return;
    el.textContent = shown === total
        ? `全${total}件を表示中`
        : `${total}件中 ${shown}件を表示中（絞り込み中）`;
}

/** すべての絞り込みを解除して全件表示する */
function showAllBrands() {
    const search = document.getElementById('brand-search');
    if (search) search.value = '';
    ['brand-category-filter', 'brand-country-filter', 'brand-price-filter'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    filterBrands();
    showNotification('すべてのブランドを表示しました', 'info');
}

// 通知の表示
function showNotification(message, type = 'info') {
    try {
        console.log('通知表示:', { message, type });
        
        const notificationArea = document.getElementById('notification-area');
        if (!notificationArea) {
            console.error('通知エリアが見つかりません');
            // フォールバック: アラートで表示
            alert(`${type.toUpperCase()}: ${message}`);
            return;
        }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        notificationArea.appendChild(notification);
        
        // 3秒後に自動削除
        setTimeout(() => {
            try {
                if (notification && notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            } catch (error) {
                console.error('通知削除エラー:', error);
            }
        }, 3000);
        
        console.log('通知を表示しました');
    } catch (error) {
        console.error('通知表示エラー:', error);
        // フォールバック: アラートで表示
        alert(`ERROR: ${message}`);
    }
} 

// AIからの指示で画面を切り替えられるようにする
window.switchPage = switchPage;
