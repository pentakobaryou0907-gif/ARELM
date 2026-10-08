/**
 * 監視ダッシュボード（作業の状況を一か所で見る）
 *
 * 仕様書13章「全作業の状態を可視化（どの工程で止まっているか）」への対応。
 *
 * 既にある各画面（裏で進める作業＝バックグラウンド作業.js、SNS投稿の下書き＝
 * 遠隔投稿.js、自己修正の変更点＝自己修正の安全装置.js）は、それぞれの持ち場では
 * 状況を表示している。だが「今なにが止まっていて、確認待ちなのは何件あるか」を
 * 一目で見られる場所が、ホーム画面には無かった。ここでは新しく作らず、
 * 既にある情報源を読みに行って、3つの箱（進行中・確認待ち・止まっている）に
 * まとめて出すだけにする（二重管理・情報のズレを避けるため）。
 *
 * すべてこの端末の中の情報だけを見る。外部へは一切送らない。
 */

async function 監視ダッシュボードを描く() {
    const 進行中箱 = document.getElementById('monitor-progress-list');
    if (!進行中箱) return; // このページを開いていなければ何もしない

    const 待機中箱 = document.getElementById('monitor-waiting-list');
    const 止箱 = document.getElementById('monitor-stuck-list');
    const クラウド箱 = document.getElementById('monitor-cloud-list');
    const 進行中数 = document.getElementById('monitor-progress-count');
    const 待機中数 = document.getElementById('monitor-waiting-count');
    const 止数 = document.getElementById('monitor-stuck-count');
    const クラウド数 = document.getElementById('monitor-cloud-count');

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    const 空なら = (list, 文) => list.length ? '' : `<li class="monitor-empty">${文}</li>`;

    /* ---- 進行中・止まっている：裏で進める作業（バックグラウンド作業.js） ---- */
    let タスク一覧 = [];
    try {
        タスク一覧 = (typeof 背景作業一覧を読む === 'function') ? await 背景作業一覧を読む() : [];
    } catch { タスク一覧 = []; }

    const 進行中タスク = タスク一覧.filter((t) => t.状態 === '待機中' || t.状態 === '実行中');
    const 止タスク = タスク一覧.filter((t) => t.状態 === '失敗');

    /* ---- 確認待ち：SNS投稿の下書き（まだ出していないもの） ---- */
    let SNS下書き = [];
    try {
        const 全部 = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
        SNS下書き = (Array.isArray(全部) ? 全部 : []).filter((x) => x.caption || x.text || x.本文);
    } catch { SNS下書き = []; }

    /* ---- 確認待ち：この端末に、まだ記録していない大きな変更があるか（自己修正） ---- */
    let 自己修正の確認待ち = null;
    try {
        const r = await fetch('/api/self-heal/status');
        if (r.ok) {
            const d = await r.json();
            if (d.ok && d.大きな変更か) 自己修正の確認待ち = d;
        }
    } catch { /* サーバーが無ければ、この項目は出さないだけでよい */ }

    /* ---- ☁️ 自動化：クラウド定期レビューが実際に作ったPR一覧 ----
     * 「自動化できていると言われても、本当か分からない」への対応。
     * クラウド側の報告を鵜呑みにせず、GitHubの公開PR一覧を直接見に行く。 */
    let クラウド自動化 = null;
    try {
        const r = await fetch('/api/automation-status');
        if (r.ok) {
            const d = await r.json();
            if (d.ok) クラウド自動化 = d;
        }
    } catch { /* サーバーやネットが無ければ、この項目は出さないだけでよい */ }

    /* ---- 描く：進行中 ---- */
    if (進行中数) 進行中数.textContent = 進行中タスク.length ? String(進行中タスク.length) : '';
    進行中箱.innerHTML = 空なら(進行中タスク, '今、裏で進めている作業はありません。') || 進行中タスク.slice(0, 8).map((t) => {
        const 名 = t.agent?.名 ? `${t.agent.絵 || ''}${t.agent.名} ／ ` : '';
        return `<li class="monitor-item">${名}${s((t.内容 || t.目的 || '').slice(0, 40))}</li>`;
    }).join('');

    /* ---- 描く：確認待ち ---- */
    const 確認待ち件数 = SNS下書き.length + (自己修正の確認待ち ? 1 : 0);
    if (待機中数) 待機中数.textContent = 確認待ち件数 ? String(確認待ち件数) : '';
    const 確認待ちHTML = [
        ...SNS下書き.slice(0, 6).map((x) => `<li class="monitor-item" data-goto-hint="sns">📣 SNS下書き: ${s((x.caption || x.text || x.本文 || '').slice(0, 30))}</li>`),
        ...(自己修正の確認待ち ? [`<li class="monitor-item" data-goto-hint="jarvis">🛠 未記録の変更が${自己修正の確認待ち.変更ファイル数}ファイル分あります（設定の「自己修正」から確認）</li>`] : []),
    ].join('');
    待機中箱.innerHTML = 確認待ち件数 ? 確認待ちHTML : 空なら([], '確認待ちのものはありません。');

    /* ---- 描く：止まっている ---- */
    if (止数) 止数.textContent = 止タスク.length ? String(止タスク.length) : '';
    止箱.innerHTML = 空なら(止タスク, '止まっている作業はありません。') || 止タスク.slice(0, 8).map((t) => {
        const 名 = t.agent?.名 ? `${t.agent.絵 || ''}${t.agent.名} ／ ` : '';
        return `<li class="monitor-item stuck">${名}${s((t.内容 || t.目的 || '').slice(0, 30))} — ${s((t.エラー || '').slice(0, 40))}</li>`;
    }).join('');

    /* ---- 描く：☁️ 自動化 ---- */
    if (クラウド箱) {
        if (!クラウド自動化) {
            if (クラウド数) クラウド数.textContent = '';
            クラウド箱.innerHTML = '<li class="monitor-empty">確認できませんでした（ネットに繋がっていない可能性があります）。</li>';
        } else {
            const 一覧 = クラウド自動化.一覧 || [];
            if (クラウド数) クラウド数.textContent = 一覧.length ? String(一覧.length) : '';
            const 状態文字 = { open: '未対応', merged: '採用済み', closed: '見送り' };
            クラウド箱.innerHTML = 空なら(一覧, 'まだ自動レビューがPRを作ったことはありません（次回は週3回のスケジュールで実行されます）。')
                || 一覧.map((p) => {
                    const 状態 = 状態文字[p.状態] || s(p.状態);
                    const 日付 = p.作成日時 ? new Date(p.作成日時).toLocaleDateString('ja-JP') : '';
                    return `<li class="monitor-item"><a href="${s(p.url)}" target="_blank" rel="noopener">#${p.番号} ${s((p.題名 || '').slice(0, 30))}</a> — ${状態}（${日付}）</li>`;
                }).join('');
        }
    }
}

function init監視ダッシュボード() {
    document.getElementById('monitor-dashboard-refresh')?.addEventListener('click', 監視ダッシュボードを描く);
    // 進行中・止まっている作業はバックグラウンド作業.js が8秒おきに確認しているので、
    // それに便乗する形で少し間隔をあけて更新する（通信を二重にしないため）
    // タブを見ていない間は誰も見ていない表示なので、省電力インターバルで休ませる。
    (window.AReGLM_PERF ? AReGLM_PERF.smartInterval(監視ダッシュボードを描く, 15000) : { id: setInterval(監視ダッシュボードを描く, 15000) });
    監視ダッシュボードを描く();
}

window.init監視ダッシュボード = init監視ダッシュボード;
window.監視ダッシュボードを描く = 監視ダッシュボードを描く;
