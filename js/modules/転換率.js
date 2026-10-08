/**
 * エンゲージメント→購買転換率の可視化
 *
 * なぜこれが要るのか:
 *
 *   「いいねは来るが売上に繋がらない」を、感覚ではなく数値で見たい。
 *
 *   最初から自動連携は狙わない。
 *   InstagramのAPIは、個人アカウントとビジネスアカウントで取れるデータが違い、
 *   申請や認証の手間もかかる。
 *
 *   まずは、週1回・手入力で「いいね・保存・プロフィールアクセス・売上」を
 *   並べて記録するだけにする。1〜2ヶ月続けて、
 *   どの数字が売上と連動していそうかを、自分の目で見る。
 *   傾向が見えてから、自動取得に置き換えればよい。
 *
 * 保存先:
 *   この端末のブラウザ（localStorage）だけ。外部には一切送らない。
 */

const 転換率キー = 'areglm_engagement';

function 記録一覧を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(転換率キー) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 記録一覧を書く(一覧) {
    localStorage.setItem(転換率キー, JSON.stringify(一覧));
}

/** エンゲージメント1件あたりの売上（円）。無理に「転換率」と呼ばず、分かりやすい形で出す。 */
function 一件あたりの売上を計算(r) {
    const エンゲージメント = (r.いいね || 0) + (r.保存 || 0) + (r.プロフィールアクセス || 0);
    if (!エンゲージメント) return null;
    return Math.round((r.売上 || 0) / エンゲージメント);
}

function 記録を追加(週開始日, いいね, 保存, プロフィールアクセス, 売上) {
    if (!週開始日) return { ok: false, 訳: '週の開始日が要ります' };
    const 一覧 = 記録一覧を読む();
    一覧.push({
        id: 'eng_' + Date.now(),
        週開始日,
        いいね: Number(いいね) || 0,
        保存: Number(保存) || 0,
        プロフィールアクセス: Number(プロフィールアクセス) || 0,
        売上: Number(売上) || 0,
        とき: new Date().toISOString(),
    });
    // 週開始日の新しい順に並べる
    一覧.sort((a, b) => (a.週開始日 < b.週開始日 ? 1 : -1));
    記録一覧を書く(一覧);
    return { ok: true };
}

function 記録を消す(id) {
    記録一覧を書く(記録一覧を読む().filter((r) => r.id !== id));
}

function render転換率() {
    const 箱 = document.getElementById('engagement-table');
    if (!箱) return;

    const 一覧 = 記録一覧を読む();
    if (!一覧.length) {
        箱.innerHTML = '<p class="hint">まだ記録がありません。週1回、下のフォームから入力してください。</p>';
        return;
    }

    const 行たち = 一覧.map((r) => {
        const 単価 = 一件あたりの売上を計算(r);
        return `<tr>
            <td>${AReGLM_SECURITY.sanitizeHtml(r.週開始日)}〜</td>
            <td>${r.いいね}</td>
            <td>${r.保存}</td>
            <td>${r.プロフィールアクセス}</td>
            <td>¥${(r.売上 || 0).toLocaleString()}</td>
            <td>${単価 != null ? `¥${単価.toLocaleString()} / 件` : '－'}</td>
            <td><button type="button" class="btn btn-sm btn-secondary" data-eng-del="${r.id}">消す</button></td>
        </tr>`;
    }).join('');

    箱.innerHTML = `
        <div class="table-wrap">
        <table class="data-table">
            <thead><tr>
                <th>週</th><th>いいね</th><th>保存</th><th>プロフィールアクセス</th>
                <th>売上</th><th>エンゲージメント1件あたり</th><th></th>
            </tr></thead>
            <tbody>${行たち}</tbody>
        </table>
        </div>
        <p class="hint">
            「エンゲージメント1件あたり」の額が高い週ほど、少ない反応で売上につながっています。
            数週間並べて、どんな投稿の週に高くなるかを見てみてください。
        </p>
    `;

    箱.querySelectorAll('[data-eng-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
            記録を消す(btn.dataset.engDel);
            render転換率();
        });
    });
}

function handle転換率Form(e) {
    e.preventDefault();
    const 週 = document.getElementById('eng-week')?.value;
    const いいね = document.getElementById('eng-likes')?.value;
    const 保存 = document.getElementById('eng-saves')?.value;
    const アクセス = document.getElementById('eng-profile')?.value;
    const 売上 = document.getElementById('eng-sales')?.value;

    const 結果 = 記録を追加(週, いいね, 保存, アクセス, 売上);
    if (!結果.ok) {
        showNotification?.(結果.訳, 'error');
        return;
    }
    e.target.reset();
    render転換率();
    showNotification?.('記録しました', 'success');
}

function init転換率() {
    document.getElementById('engagement-form')?.addEventListener('submit', handle転換率Form);
    render転換率();
}

window.init転換率 = init転換率;
window.render転換率 = render転換率;
