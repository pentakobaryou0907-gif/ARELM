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

    // 起動直後と以降30分ごとに、この端末内へ自動スナップショットを保存
    setTimeout(saveSnapshotToServer, 5000);
    setInterval(saveSnapshotToServer, 30 * 60 * 1000);
    refreshSnapshotInfo();
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

            Object.entries(payload.data).forEach(([key, rawValue]) => {
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

            setBackupStatus(`復元しました: 新規${added}件のデータ種別 / 既存に${merged}件を追加（既存データは削除していません）`);
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
