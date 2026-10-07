/**
 * バックアップ／復元
 * ツール内の全データを1ファイルに書き出し・読み戻しする。
 * 方針: 復元は「消さない」— 既存データは残し、IDが重複しないものだけ追加する。
 * APIキー等のシークレットはバックアップに含めない。
 */
const AREGLM_BACKUP_KEYS = [
    'brands',
    'products',
    'sales',
    'areglm_chat',
    'areglm_activity_log',
    'areglm_sns_queue',
    'areglm_ec_sync_log',
    'areglm_learning_data',
    'areglm_box_category_rules',
    'areglm_box_sort_result',
    'areglm_suzuri_products',
    'areglm_memos',
    'areglm_tasks',
    'areglm_techpack',
    'areglm_customers',
    'areglm_barcodes',
    'areglm_brand_manual',
    'areglm_mandala',
    'areglm_events',
    'areglm_series',
    'areglm_personalize',
    'areglm_personalize_history',
    'areglm_console_phrases',
    'areglm_health',
    'areglm_sales',
    'areglm_expenses',
    'areglm_ledger_settings',
    'areglm_post_log',
    'areglm_progress_log',
    'areglm_update_log'
];

function initBackup() {
    document.getElementById('backup-export-btn')?.addEventListener('click', exportBackup);
    document.getElementById('backup-import-file')?.addEventListener('change', importBackup);
    document.getElementById('backup-restore-drill-btn')?.addEventListener('click', () => 復元訓練を走らせる(true));

    // 起動直後と以降30分ごとに、この端末内へ自動スナップショットを保存
    setTimeout(saveSnapshotToServer, 5000);
    setInterval(saveSnapshotToServer, 30 * 60 * 1000);
    refreshSnapshotInfo();
    復元訓練の様子を出す();
    容量とホーム画面の注意を出す();
}

function collectBackupData() {
    const data = {};
    AREGLM_BACKUP_KEYS.forEach((k) => {
        const raw = localStorage.getItem(k);
        if (raw !== null) data[k] = raw;
    });
    return data;
}

/** サーバー（この端末内のファイル）へ自動保存。失敗しても操作は妨げない。 */
async function saveSnapshotToServer() {
    try {
        const res = await fetch('/api/snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                app: 'ARELM',
                version: 1,
                exportedAt: new Date().toISOString(),
                data: collectBackupData()
            })
        });
        if (res.ok) refreshSnapshotInfo();
    } catch {
        /* サーバー未起動時は何もしない */
    }
}

async function refreshSnapshotInfo() {
    try {
        const res = await fetch('/api/snapshot');
        if (!res.ok) return;
        const info = await res.json();
        const el = document.getElementById('snapshot-info');
        if (el) {
            el.textContent = info.count
                ? `自動保存: ${info.count}件（最新 ${info.latest}）— server/data/snapshots に保存されています`
                : '自動保存: まだありません';
        }
    } catch {
        /* 表示のみの機能なので失敗は無視 */
    }
}

async function 復元訓練の様子を出す() {
    const el = document.getElementById('restore-drill-info');
    if (!el) return;
    try {
        const res = await fetch('/api/snapshot/restore-drill');
        if (!res.ok) return;
        const d = await res.json();
        const 様子 = d.様子;
        if (!様子) {
            el.textContent = '復元訓練: まだ一度も走っていません（控えが溜まると自動で月1回走ります）';
            return;
        }
        const いつ = 様子.時刻 ? new Date(様子.時刻).toLocaleString('ja-JP') : '';
        el.textContent = `復元訓練: ${様子.ok ? '成功' : '失敗'}（${いつ}）— ${様子.訳 || ''}`;
    } catch {
        /* 表示のみ */
    }
}

async function 復元訓練を走らせる(強制) {
    try {
        const res = await fetch('/api/snapshot/restore-drill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 強制: !!強制 }),
        });
        const d = await res.json();
        setBackupStatus(d.訳 || (d.ok ? '復元訓練に成功しました' : '復元訓練に失敗しました'));
        if (typeof showNotification === 'function') {
            showNotification(d.訳 || '', d.ok ? 'success' : 'error');
        }
        復元訓練の様子を出す();
    } catch (e) {
        setBackupStatus('復元訓練に失敗しました: ' + e.message);
    }
}

function 容量とホーム画面の注意を出す() {
    const el = document.getElementById('storage-home-hint');
    if (!el) return;
    const 行 = [];
    if (window.AReGLM_物置) {
        const s = AReGLM_物置.様子();
        行.push(`ブラウザ内の保存: 約 ${Math.round(s.量 / 1024)} KB / ${Math.round(s.上限 / 1024 / 1024)} MB`
            + (s.物置の数 ? `（大きいもの ${s.物置の数} 件は IndexedDB）` : ''));
    }
    // iPhone / iPad の Safari は、7日使わないとブラウザ内のデータを消すことがある。
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (iOS) {
        const ホームから = navigator.standalone === true
            || window.matchMedia('(display-mode: standalone)').matches;
        行.push(ホームから
            ? 'ホーム画面から開いています（ブラウザ内のデータが消えにくい使い方です）。消えてもサーバーから戻ります。'
            : 'iPhone / iPad では「ホーム画面に追加」してから開いてください。Safari のまま7日使わないと、ブラウザ内のデータが消えることがあります。消えてもサーバーが正なので、次に開くと戻ります。');
    }
    if (window.AReGLM_SYNC && AReGLM_SYNC.まだ送れていない数() > 0) {
        行.push(`サーバーへまだ送れていない変更が ${AReGLM_SYNC.まだ送れていない数()} 件あります（繋がり次第送り直します）`);
    }
    el.textContent = 行.join(' ');
}

function exportBackup() {
    const data = collectBackupData();

    const payload = {
        app: 'ARELM',
        version: 1,
        exportedAt: new Date().toISOString(),
        data
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `areglm_backup_${今日()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setBackupStatus(`${Object.keys(data).length}種類のデータを書き出しました（${new Date().toLocaleString('ja-JP')}）`);
    if (window.logActivity) logActivity('バックアップを書き出し', { category: 'backup' });
}

function importBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const payload = JSON.parse(ev.target.result);
            // 'AReGLM' は改名前（〜2026-09-19）に作られたバックアップとの互換のため。
            if ((payload.app !== 'ARELM' && payload.app !== 'AReGLM') || !payload.data) {
                throw new Error('ARELMのバックアップファイルではありません');
            }

            let added = 0;
            let merged = 0;
            let skipped = 0;

            Object.entries(payload.data).forEach(([key, rawValue]) => {
                // 以前はファイルにある鍵をすべて書き込んでいたため、手を加えたファイルで
                // ログインの印（sessionToken）や設定まで入れられた。書き出す鍵だけを戻す。
                if (!AREGLM_BACKUP_KEYS.includes(key) || typeof rawValue !== 'string') { skipped += 1; return; }
                try { JSON.parse(rawValue); } catch { skipped += 1; return; }
                const existingRaw = localStorage.getItem(key);

                // 既存データが無ければそのまま復元
                if (existingRaw === null) {
                    localStorage.setItem(key, rawValue);
                    added += 1;
                    return;
                }

                // 既存データがある場合は消さずに統合を試みる
                try {
                    const incoming = JSON.parse(rawValue);
                    const existing = JSON.parse(existingRaw);
                    if (Array.isArray(incoming) && Array.isArray(existing)) {
                        const seen = new Set(existing.map((x) => x?.id).filter(Boolean));
                        const additions = incoming.filter((x) => x?.id && !seen.has(x.id));
                        if (additions.length) {
                            localStorage.setItem(key, JSON.stringify(existing.concat(additions)));
                            merged += additions.length;
                        }
                    }
                    // 配列でないもの（設定値など）は既存を優先して上書きしない
                } catch {
                    /* パースできないものは既存を保持 */
                }
            });

            setBackupStatus(`復元しました: 新規${added}件のデータ種別 / 既存に${merged}件を追加（既存データは削除していません）`
                + (skipped ? ` / バックアップの対象ではない・読めない${skipped}件は戻していません` : ''));
            showNotification('バックアップから復元しました', 'success');
            if (window.logActivity) logActivity('バックアップから復元', { category: 'backup' });
            if (typeof refreshAllData === 'function') refreshAllData();
        } catch (err) {
            setBackupStatus('復元に失敗しました: ' + err.message);
            showNotification('復元に失敗しました: ' + err.message, 'error');
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

function setBackupStatus(msg) {
    const el = document.getElementById('backup-status');
    if (el) el.textContent = msg;
}

window.initBackup = initBackup;
window.exportBackup = exportBackup;
window.saveSnapshotToServer = saveSnapshotToServer;
window.復元訓練を走らせる = 復元訓練を走らせる;
