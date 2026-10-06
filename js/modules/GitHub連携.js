/**
 * GitHub連携 — 作業ログ・バックアップの控えを GitHub に残す
 *
 * 使うもの: GitHub 公式 REST API のみ。
 * トークンはブラウザ内で暗号化保存し、送るときはこの端末のサーバー経由。
 *
 * やること:
 *   ・データバックアップ（APIキーは含めない）をリポジトリへ書き込む
 *   ・進捗ログのテキストを日付フォルダに残す
 *
 * やらないこと:
 *   ・秘密の鍵をリポジトリへ上げる
 *   ・勝手に公開リポジトリを作る
 *   ・他人のリポジトリを触る
 */

const GITHUB_設定キー = 'areglm_github_settings';

function GitHub設定を読む() {
    try {
        return JSON.parse(localStorage.getItem(GITHUB_設定キー) || '{}');
    } catch {
        return {};
    }
}

function GitHub設定を書く(obj) {
    localStorage.setItem(GITHUB_設定キー, JSON.stringify(obj || {}));
}

function initGitHub連携() {
    const 保存 = document.getElementById('github-save-btn');
    const 控え = document.getElementById('github-backup-btn');
    const ログ = document.getElementById('github-log-btn');
    if (!保存 && !控え) return;

    const 設定 = GitHub設定を読む();
    const owner = document.getElementById('github-owner');
    const repo = document.getElementById('github-repo');
    const branch = document.getElementById('github-branch');
    if (owner) owner.value = 設定.owner || '';
    if (repo) repo.value = 設定.repo || '';
    if (branch) branch.value = 設定.branch || 'main';

    AReGLM_SECURITY.loadApiKeySecure('github', 'token').then((t) => {
        const st = document.getElementById('github-token-status');
        if (st) st.textContent = t ? 'トークン: 保存済み' : 'トークン: 未設定';
    });

    保存?.addEventListener('click', async () => {
        const token入力 = document.getElementById('github-token');
        const token = (token入力?.value || '').trim();
        const next = {
            owner: (owner?.value || '').trim(),
            repo: (repo?.value || '').trim(),
            branch: (branch?.value || 'main').trim() || 'main',
        };
        if (!next.owner || !next.repo) {
            showNotification('オーナー名とリポジトリ名を入れてください', 'error');
            return;
        }
        GitHub設定を書く(next);
        if (token) {
            await AReGLM_SECURITY.saveApiKeySecure('github', 'token', token);
            if (token入力) token入力.value = '';
        }
        const 有無 = !!(await AReGLM_SECURITY.loadApiKeySecure('github', 'token'));
        const st = document.getElementById('github-token-status');
        if (st) st.textContent = 有無 ? 'トークン: 保存済み' : 'トークン: 未設定';
        showNotification(
            有無 ? 'GitHubの設定を保存しました' : '場所は保存しました。トークンも入れてください',
            有無 ? 'success' : 'warn');
    });

    控え?.addEventListener('click', () => GitHubへ控えを上げる('backup'));
    ログ?.addEventListener('click', () => GitHubへ控えを上げる('log'));
}

async function GitHubへ控えを上げる(種類) {
    const 設定 = GitHub設定を読む();
    if (!設定.owner || !設定.repo) {
        showNotification('設定 → GitHub でオーナーとリポジトリを入れてください', 'warn');
        return;
    }
    const token = await AReGLM_SECURITY.loadApiKeySecure('github', 'token');
    if (!token) {
        showNotification('GitHubのトークンが未設定です（設定 → GitHub）', 'warn');
        return;
    }

    const 日付 = new Date().toISOString().slice(0, 10);
    const 時刻 = new Date().toISOString().replace(/[:.]/g, '-');
    let path;
    let content;
    let message;

    if (種類 === 'log') {
        const 活動 = localStorage.getItem('areglm_activity_log') || '[]';
        const タスク = localStorage.getItem('areglm_tasks') || '[]';
        const メモ = localStorage.getItem('areglm_memos') || '[]';
        const 読む = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
        content = JSON.stringify({
            app: 'ARELM',
            種類: '進捗ログ',
            とき: new Date().toISOString(),
            活動: JSON.parse(活動),
            タスク: JSON.parse(タスク),
            メモ: JSON.parse(メモ),
            現在地: 読む('areglm_progress_log'),
            投稿ログ: 読む('areglm_post_log'),
            更新記録: 読む('areglm_update_log'),
        }, null, 2);
        path = `areglm-logs/${日付}/progress_${時刻}.json`;
        message = `ARELM: 進捗ログ ${日付}`;
    } else {
        if (typeof collectBackupData !== 'function') {
            showNotification('バックアップの部品を読み込めませんでした', 'error');
            return;
        }
        const data = collectBackupData();
        content = JSON.stringify({
            app: 'ARELM',
            種類: 'バックアップ',
            とき: new Date().toISOString(),
            注: 'APIキー等の秘密は含めていません',
            data,
        }, null, 2);
        path = `areglm-backups/${日付}/backup_${時刻}.json`;
        message = `ARELM: バックアップ ${日付}`;
    }

    const btn = document.getElementById(種類 === 'log' ? 'github-log-btn' : 'github-backup-btn');
    if (btn) { btn.disabled = true; btn.textContent = '送っています…'; }

    try {
        const r = await fetch('/api/github/put-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                owner: 設定.owner,
                repo: 設定.repo,
                branch: 設定.branch || 'main',
                path,
                content,
                message,
            }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) {
            showNotification(d.訳 || 'GitHubへ送れませんでした', 'error');
            return;
        }
        showNotification(`GitHubへ残しました: ${path}`, 'success');
        const st = document.getElementById('github-last-status');
        if (st) st.textContent = `直近: ${path}（${new Date().toLocaleString('ja-JP')}）`;
    } catch (e) {
        showNotification('GitHubへ送れませんでした: ' + (e.message || e), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 種類 === 'log' ? '進捗ログを上げる' : 'バックアップを上げる';
        }
    }
}

window.initGitHub連携 = initGitHub連携;
window.GitHubへ控えを上げる = GitHubへ控えを上げる;
