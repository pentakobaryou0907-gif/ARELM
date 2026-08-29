/**
 * 自己修正の安全装置（設定ページ側）
 *
 * サーバー側（server/index.js の /api/self-heal/*）で実際の
 * Git記録・テスト・ロールバックを行う。ここは画面の配線だけ。
 */

async function 状態を描く() {
    const 箱 = document.getElementById('self-heal-status');
    if (!箱) return;
    try {
        const r = await fetch('/api/self-heal/status').then((y) => y.json());
        if (!r.ok) { 箱.textContent = '状態を確かめられませんでした: ' + (r.訳 || ''); return; }
        箱.textContent = r.変更ファイル数
            ? `未記録の変更が ${r.変更ファイル数} ファイル（差分 約${r.変更行数}行）あります。`
            : '未記録の変更はありません。';
    } catch (e) {
        箱.textContent = 'つながりませんでした: ' + e.message;
    }
}

async function 記録する() {
    const btn = document.getElementById('self-heal-checkpoint-btn');
    if (btn) { btn.disabled = true; btn.textContent = '検査しています…'; }
    try {
        const r = await fetch('/api/self-heal/checkpoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '設定ページから手動で記録' }),
        }).then((y) => y.json());

        if (!r.ok) {
            const 詳細 = r.段階 === '構文検査'
                ? r.検査.失敗.map((f) => `${f.ファイル}: ${f.訳}`).join('\n')
                : (r.テスト?.出 || '');
            showNotification(`記録できませんでした（${r.段階}で失敗）。コードに誤りがあります。`, 'error');
            console.error('自己修正の安全装置:', 詳細);
            return;
        }
        if (!r.記録した) {
            if (!confirm(`${r.訳}\n\nこのまま記録しますか？\n\n${r.差分 || ''}`)) return;
            const r2 = await fetch('/api/self-heal/checkpoint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: '設定ページから手動で記録（大きな変更・確認済み）', 強制的に記録する: true }),
            }).then((y) => y.json());
            showNotification(r2.記録した ? '記録しました' : '記録できませんでした', r2.記録した ? 'success' : 'error');
        } else {
            showNotification('記録しました（テスト・構文検査に合格）', 'success');
        }
        状態を描く();
    } catch (e) {
        showNotification('つながりませんでした: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '今の状態を記録する'; }
    }
}

async function 履歴を描く() {
    const 箱 = document.getElementById('self-heal-history');
    if (!箱) return;
    箱.hidden = !箱.hidden;
    if (箱.hidden) return;

    箱.innerHTML = '読み込んでいます…';
    try {
        const r = await fetch('/api/self-heal/history').then((y) => y.json());
        if (!r.ok || !r.一覧?.length) { 箱.textContent = '記録がありません。'; return; }

        箱.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'rule-log';
        r.一覧.forEach((item, i) => {
            const li = document.createElement('li');
            li.className = 'rule-log-item';
            const 文 = document.createElement('span');
            文.textContent = `${item.日付}　${item.件名}`;
            li.appendChild(文);
            if (i > 0) { // 一番新しい記録には「戻す」は不要
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-link danger';
                btn.textContent = 'ここまで戻す';
                btn.addEventListener('click', () => 戻す(item.hash, item.件名));
                li.appendChild(btn);
            }
            ul.appendChild(li);
        });
        箱.appendChild(ul);
    } catch (e) {
        箱.textContent = 'つながりませんでした: ' + e.message;
    }
}

async function 戻す(hash, 件名) {
    if (!confirm(
        `本当に「${件名}」の状態まで戻しますか？\n\n`
        + 'これより後に加えた変更は消えます（元に戻せません）。\n'
        + '学習データ・記録は対象外なので、そのまま残ります。'
    )) return;
    if (!confirm('もう一度確認します。本当に戻してよいですか？')) return;

    try {
        const r = await fetch('/api/self-heal/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash }),
        }).then((y) => y.json());
        showNotification(r.ok ? r.訳 + '（ページの再読み込みが必要です）' : (r.訳 || '戻せませんでした'), r.ok ? 'warning' : 'error');
        if (r.ok) setTimeout(() => location.reload(), 1500);
    } catch (e) {
        showNotification('つながりませんでした: ' + e.message, 'error');
    }
}

function init自己修正の安全装置() {
    const btn = document.getElementById('self-heal-checkpoint-btn');
    if (!btn || btn.dataset.配線済み) return;
    btn.dataset.配線済み = '1';
    btn.addEventListener('click', 記録する);
    document.getElementById('self-heal-history-btn')?.addEventListener('click', 履歴を描く);
    状態を描く();
}

window.init自己修正の安全装置 = init自己修正の安全装置;
