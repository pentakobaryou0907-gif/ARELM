/**
 * ARELM ホーム（ダッシュボード）— 情報管理ハブ
 */
function initDashboard() {
    const refreshBtn = document.getElementById('global-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshAllData);

    // ホーム上部の現在時刻。
    // 「自動で動いています（最終 18:15:02）」は更新済みの記録時刻であって、
    // 今の時刻ではない。今が何時かが分かる表示が別に無かった。
    現在時刻の表示を始める();

    // 「アプリのように開く」専用ウィンドウ（--app=）だと、拡張機能や
    // 複数タブなど、ふつうのChromeの機能が使えない。ボタン一つで
    // 同じ場所をふつうのタブとしても開けるようにする。
    const chromeBtn = document.getElementById('open-in-chrome-btn');
    if (chromeBtn) {
        chromeBtn.addEventListener('click', async () => {
            chromeBtn.disabled = true;
            try {
                const r = await fetch('/api/open-in-chrome', { method: 'POST' })
                    .then((y) => y.json());
                showNotification(r.訳, r.ok ? 'success' : 'error');
            } catch (e) {
                showNotification('つながりませんでした: ' + e.message, 'error');
            } finally {
                chromeBtn.disabled = false;
            }
        });
    }

    // 起動時にサーバー側の学習データと同期（ブラウザデータが消えても引き継げるように）
    if (window.AReGLM_LEARNING) {
        AReGLM_LEARNING.pullFromServer().then(() => renderLearningStatus());
    }

    if (typeof initMemo === 'function') initMemo();
    if (typeof initTasks === 'function') initTasks();

    // 全自動の切り替えは廃止。指示したことは常に自動で実行する。
    scheduleAutomationLoop();
}

/**
 * 全自動モード有効時、手動でリフレッシュを押さなくても
 * 一定間隔でバックグラウンド実行する「アシスタント」ループ。
 *
 * 既定は15分ごとだったが、1日90回近く動いてしまい
 * 「エラーが繰り返している」ように見えるとの指摘があった。
 * 設定画面（automation-interval-min）から変えられるようにする。
 */
const AREGLM_AUTOMATION_INTERVAL_KEY = 'areglm_automation_interval_min';
const AREGLM_AUTOMATION_INTERVAL_DEFAULT_MIN = 15;

function 自動実行間隔を分で読む() {
    const n = Number(localStorage.getItem(AREGLM_AUTOMATION_INTERVAL_KEY));
    return Number.isFinite(n) && n >= 5 ? n : AREGLM_AUTOMATION_INTERVAL_DEFAULT_MIN;
}

function scheduleAutomationLoop() {
    // 二重に走らないよう、既存のタイマーは止めてから張り直す
    if (window.__areglmAutomationTimer) {
        clearInterval(window.__areglmAutomationTimer);
        window.__areglmAutomationTimer = null;
    }
    const 間隔ms = 自動実行間隔を分で読む() * 60 * 1000;
    window.__areglmAutomationTimer = setInterval(() => {
        if (typeof runFullAutomation === 'function') runFullAutomation();
    }, 間隔ms);
}

function initAutomationIntervalSetting() {
    const sel = document.getElementById('automation-interval-min');
    if (!sel) return;

    sel.value = String(自動実行間隔を分で読む());

    sel.addEventListener('change', () => {
        localStorage.setItem(AREGLM_AUTOMATION_INTERVAL_KEY, sel.value);
        scheduleAutomationLoop();
        showNotification?.(`全自動モードの実行間隔を${sel.value}分ごとに変更しました`, 'success');
        logActivity?.(`全自動モードの実行間隔を${sel.value}分に変更`, { category: 'settings' });
    });

    const last = document.getElementById('automation-interval-last');
    if (last) {
        const 直近 = localStorage.getItem('areglm_automation_last');
        last.textContent = 直近 ? `最後に自動実行したのは ${new Date(直近).toLocaleString('ja-JP')}` : '';
    }

    const 目標sel = document.getElementById('auto-promo-daily-target');
    if (目標sel) {
        目標sel.value = localStorage.getItem('areglm_auto_promo_daily_target') || '1';
        目標sel.addEventListener('change', () => {
            localStorage.setItem('areglm_auto_promo_daily_target', 目標sel.value);
            showNotification?.(`SNS自動作成の1日の上限を${目標sel.value}件に変更しました`, 'success');
        });
    }
}

function loadDashboardData() {
    const brands = JSON.parse(localStorage.getItem('brands') || '[]');
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const sales = JSON.parse(localStorage.getItem('sales') || '[]');
    const snsQueue = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
    const ecSync = JSON.parse(localStorage.getItem('areglm_ec_sync_log') || '[]');

    const totalStock = products.reduce((s, p) => s + (p.quantity || 0), 0);
    const totalSales = sales.reduce((s, x) => s + (x.total || 0), 0);
    const lowStock = products.filter((p) => p.quantity <= (p.reorderLevel || 5)).length;

    setText('total-brands', brands.length);
    setText('total-products', products.length);
    setText('total-stock', totalStock);
    setText('total-sales', `¥${totalSales.toLocaleString('ja-JP')}`);
    setText('low-stock-count', lowStock);
    setText('sns-queue-count', snsQueue.filter((q) => q.status === 'pending').length);
    setText('ec-sync-count', ecSync.length);

    // 商品が1件も無いと、数字が全部ゼロに並び、
    // 「壊れているツール」に見えてしまう。
    // 数字の代わりに、次にすることをはっきり案内する。
    const emptyCta = document.getElementById('products-empty-cta');
    if (emptyCta) emptyCta.hidden = products.length > 0;

    renderHomeActivity();
    updateAutomationStatus();
    renderApiStatusSummary();
    renderLearningStatus();
    if (typeof renderMemoList === 'function') renderMemoList();
    if (typeof renderTaskList === 'function') renderTaskList();
    renderAssistantSuggestions({ lowStock, snsQueue, brands, products });
    if (typeof renderHomeTabBadges === 'function') renderHomeTabBadges();
}

/**
 * ルールベースの簡易アシスタント。
 * 外部AIには送信せず、この端末内のデータだけから「次にやること」を提案する。
 */
function renderAssistantSuggestions(ctx = {}) {
    const box = document.getElementById('assistant-suggestions');
    if (!box) return;

    const suggestions = [];
    const today = 今日();

    // ブランドはあるのに商品が1件も無いと、指標が全部ゼロに見え、
    // 「動いていないツール」に見えてしまう。
    // 何を押せば数字が動き出すのかを、いちばん先に案内する。
    if ((ctx.brands?.length || 0) > 0 && (ctx.products?.length || 0) === 0) {
        suggestions.push('📦 ブランドは登録済みですが、商品がまだ1件もありません。'
            + '在庫ページから商品を登録すると、この画面の数字が動き始めます');
    }

    const tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
    const overdue = tasks.filter((t) => !t.done && t.due && t.due < today);
    const dueToday = tasks.filter((t) => !t.done && t.due === today);
    if (overdue.length) {
        suggestions.push(`⚠️ 期限切れのタスクが${overdue.length}件あります: ${overdue.map((t) => t.title).slice(0, 3).join('、')}`);
    }
    if (dueToday.length) {
        suggestions.push(`📅 今日が期限のタスクが${dueToday.length}件あります`);
    }

    if ((ctx.lowStock || 0) > 0) {
        suggestions.push(`📦 在庫が少ない商品が${ctx.lowStock}件あります。在庫ページで確認してください`);
    }

    const pendingSns = (ctx.snsQueue || []).filter((q) => q.status === 'pending').length;
    if (pendingSns > 0) {
        suggestions.push(`📣 SNS投稿キューに未投稿が${pendingSns}件あります`);
    }

    if (window.AReGLM_LEARNING) {
        const s = AReGLM_LEARNING.summary();
        if (s.topCategories?.[0]) {
            const [cat] = s.topCategories[0];
            suggestions.push(`💡 最近よく使っている機能は「${cat.replace(/^mode:/, '')}」です。関連機能も試してみましょう`);
        }
    }


    if (!suggestions.length) {
        box.innerHTML = '<li class="hint">今のところ提案はありません。順調です。</li>';
        return;
    }

    box.innerHTML = suggestions.map((s) => `<li>${AReGLM_SECURITY.sanitizeHtml(s)}</li>`).join('');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function updateAutomationStatus() {
    // 常に自動で動くので、状態表示は最終実行時刻を出すだけにする
    const last = localStorage.getItem('areglm_automation_last');
    const text = last
        ? `自動で動いています（最終 ${new Date(last).toLocaleTimeString('ja-JP')}）`
        : '自動で動いています';
    document.querySelectorAll('[data-automation-status]').forEach((el) => {
        el.textContent = text;
        el.classList.add('status-on');
        el.classList.remove('status-off');
    });
}

function renderApiStatusSummary() {
    if (window.AReGLM_API_SELECTOR) {
        AReGLM_API_SELECTOR.renderStatusList('api-status-summary');
        const status = AReGLM_API_SELECTOR.getCatalogStatus();
        const active = status.filter((s) => s.status === 'active').length;
        const total = status.filter((s) => s.meta.freeTier).length;
        setText('api-connected-count', `${active}/${total}`);
        return;
    }
}

function renderHomeActivity() {
    const list = document.getElementById('home-activity-list');
    if (!list) return;

    const logs = JSON.parse(localStorage.getItem('areglm_activity_log') || '[]').slice(-10).reverse();
    if (!logs.length) {
        list.innerHTML = '<li class="empty-activity">まだ活動履歴がありません。各機能を利用するとここに表示されます。</li>';
        return;
    }
    list.innerHTML = logs
        .map(
            (l) =>
                `<li><time>${new Date(l.at).toLocaleString('ja-JP')}</time><span>${AReGLM_SECURITY.sanitizeHtml(l.message)}</span></li>`
        )
        .join('');
}

function logActivity(message, meta = {}) {
    const logs = JSON.parse(localStorage.getItem('areglm_activity_log') || '[]');
    logs.push({ at: new Date().toISOString(), message });
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    localStorage.setItem('areglm_activity_log', JSON.stringify(logs));

    // 作業のたびに学習エンジンへ記録（このツール専用・外部送信なし）
    if (window.AReGLM_LEARNING) {
        AReGLM_LEARNING.record({
            category: meta.category || 'general',
            message,
            mode: meta.mode || '',
            provider: meta.provider || '',
            text: meta.text || message
        });
        if (typeof renderLearningStatus === 'function') renderLearningStatus();
    }

    // 自作AIエンジン（Python）にも同じ内容を1件学習させる。
    // 使えば使うほどこの端末の中でモデルが育つ。エンジン停止中でも操作は妨げない。
    if (window.AReGLM_LOCAL_AI) {
        AReGLM_LOCAL_AI.learn(meta.text || message, meta.category || 'general');
    }
}

function renderLearningStatus() {
    const box = document.getElementById('learning-status');
    if (!box || !window.AReGLM_LEARNING) return;
    const s = AReGLM_LEARNING.summary();
    if (!s.totalEvents) {
        box.innerHTML = '<p class="hint">ツールを使うほど、ここに傾向が蓄積されていきます。</p>';
        return;
    }
    const cats = s.topCategories.map(([k, v]) => `${k.replace(/^mode:/, '')}(${v})`).join(' / ');
    const tags = s.topTags.map(([k]) => k).join('、');
    box.innerHTML = `
        <p><strong>学習済み作業数:</strong> ${s.totalEvents}件</p>
        <p><strong>よく使う機能:</strong> ${AReGLM_SECURITY.sanitizeHtml(cats || '—')}</p>
        <p><strong>頻出キーワード:</strong> ${AReGLM_SECURITY.sanitizeHtml(tags || '—')}</p>
        <p class="hint">最終更新: ${new Date(s.updatedAt).toLocaleString('ja-JP')}</p>
    `;
}

/**
 * ツール本体（HTML・CSS・JS）が更新されているかを調べる。
 *
 * 更新ボタンは画面のデータを描き直すだけで、
 * ツールそのものの変更は取り込めない（だからリロードが必要だった）。
 * ここで変更を見つけたら、そのまま読み直して反映する。
 */
/**
 * ツールが新しくなっているかを確かめる。
 *
 * これまで index.html だけを見ていた。
 * ところが見た目や動きを直したときは、
 * CSS や JavaScript だけが変わり、index.html は変わらない。
 * そのため「更新を押しても何も変わらない」ことがあった。
 *
 * 中身が変わりうるファイルを、まとめて見る。
 */
async function hasAppUpdate() {
    const 見るファイル = [
        'index.html',
        'css/style.css',
        'js/app-bootstrap.js',
        'js/main.js',
    ];

    try {
        const 印たち = [];
        for (const f of 見るファイル) {
            const res = await fetch(f, { method: 'HEAD', cache: 'no-store' });
            if (!res.ok) continue;
            印たち.push(res.headers.get('last-modified') || res.headers.get('etag') || '');
        }

        const 印 = 印たち.join('|');
        if (!印.replace(/\|/g, '')) return false;

        const 覚えていた印 = sessionStorage.getItem('areglm_app_stamp');
        if (!覚えていた印) {
            // 初回は今の状態を覚えるだけ。いきなり読み直さない。
            sessionStorage.setItem('areglm_app_stamp', 印);
            return false;
        }
        if (覚えていた印 !== 印) {
            sessionStorage.setItem('areglm_app_stamp', 印);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

async function refreshAllData() {
    const btn = document.getElementById('global-refresh-btn');
    if (btn) {
        btn.disabled = true;
        // ボタンは40×40の丸なので、文字を入れると縦に潰れてしまう。
        // 表示は記号のままにして、進行中は回して知らせる。
        btn.classList.add('spinning');
    }

    // ツール自体が新しくなっていれば、読み直して確実に反映する
    if (await hasAppUpdate()) {
        showNotification('新しい内容を読み込みます…', 'info');
        setTimeout(() => location.reload(), 400);
        return;
    }

    loadDashboardData();
    if (typeof loadBrandsData === 'function') loadBrandsData();
    if (typeof loadInventoryHub === 'function') loadInventoryHub();
    if (typeof loadSnsData === 'function') loadSnsData();
    if (typeof loadChatHistory === 'function') loadChatHistory();
    if (typeof loadProductDev === 'function') loadProductDev();
    if (typeof renderTechpackTable === 'function') renderTechpackTable();
    if (typeof renderSeriesList === 'function') renderSeriesList();
    if (typeof populateProductPicker === 'function') populateProductPicker();
    if (typeof renderMemoList === 'function') renderMemoList();
    if (typeof renderTaskList === 'function') renderTaskList();
    if (typeof populateAiSelects === 'function') populateAiSelects();
    // あとから足した機能も、必ずここに書く。
    // 書き忘れると「更新しても変わらない」ように見える。
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof renderExportAll === 'function') renderExportAll();
    if (typeof renderLibrary === 'function') renderLibrary();
    if (typeof renderPattern === 'function') renderPattern();
    if (typeof renderMockup === 'function') renderMockup();
    if (typeof renderToolName === 'function') renderToolName();
    if (typeof renderVoiceStatus === 'function') renderVoiceStatus();
    if (typeof renderBrandSplit === 'function') renderBrandSplit();
    if (typeof renderPaidGuard === 'function') renderPaidGuard();
    if (typeof renderWishlist === 'function') renderWishlist();
    if (typeof renderTimer === 'function') renderTimer();
    if (typeof renderVintage === 'function') renderVintage();
    if (typeof renderSheet === 'function') renderSheet();
    if (typeof renderPreorders === 'function') renderPreorders();
    if (typeof renderTrash === 'function') renderTrash();
    if (typeof renderRules === 'function') renderRules();
    if (typeof renderTagPreview === 'function') renderTagPreview();
    if (typeof renderCost === 'function') renderCost();
    if (typeof renderChatHistoryList === 'function') renderChatHistoryList();
    if (typeof renderRequirements === 'function') renderRequirements();
    if (typeof renderHealth === 'function') renderHealth();
    if (typeof renderCalendar === 'function') renderCalendar();
    // 更新のたびに、その時点の使い方へ少しずつ馴染ませる。
    // 変化前の姿は保存されるので、いつでも戻せる。
    if (typeof adaptNow === 'function') adaptNow(true);
    AReGLM_API_SELECTOR?.getActiveForCategory('ai');
    AReGLM_API_SELECTOR?.getActiveForCategory('suzuri');
    // 更新のたびに自動処理をひととおり実行する（切り替えは廃止）
    if (typeof runFullAutomation === 'function') {
        await runFullAutomation();
    } else if (typeof syncSuzuriInventory === 'function') {
        await syncSuzuriInventory();
    }

    await checkGatewayStatus?.();

    logActivity('全データを更新しました');
    showNotification('全データの更新が完了しました', 'success');

    if (btn) {
        btn.disabled = false;
        // 中身は書き換えない。書き換えると狭い幅で文字が縦に潰れる。
        btn.classList.remove('spinning');
    }
}

/** ホーム上部に、今の時刻を出し続ける（1分ごとに更新）。 */
function 現在時刻の表示を始める() {
    const 枠 = document.getElementById('live-clock');
    if (!枠) return;

    const 書く = () => {
        const 今 = new Date();
        枠.textContent = 今.toLocaleString('ja-JP', {
            month: 'numeric', day: 'numeric', weekday: 'short',
            hour: '2-digit', minute: '2-digit',
        });
    };
    書く();
    // タブを見ていない間は時計を進めても誰も見ないので、省電力インターバルで休ませる。
    (window.AReGLM_PERF ? AReGLM_PERF.smartInterval(書く, 60 * 1000) : setInterval(書く, 60 * 1000));
}

window.initDashboard = initDashboard;
window.loadDashboardData = loadDashboardData;
window.refreshAllData = refreshAllData;
window.logActivity = logActivity;
window.renderLearningStatus = renderLearningStatus;
window.scheduleAutomationLoop = scheduleAutomationLoop;
window.renderAssistantSuggestions = renderAssistantSuggestions;
