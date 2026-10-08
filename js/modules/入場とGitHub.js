/**
 * 入場の記録とGitHubの様子（ホームの「設定」タブ）
 *
 * 入場の記録:
 *   本人の要望（2026-10-08）「勝手にログインしていたり、知らないものがあったら、すぐに知らせて」。
 *   Macで開いたときは、サーバーの記録（server/入場の記録.js）を見せる。
 *   公開先で開いたときは、この端末の合言葉の記録を見せる（打ち込んだ中身は、どちらも残していない）。
 *   気をつけることがあれば、上に赤く出し、夜の当番の朝の報告にも載る。
 *
 * GitHubの様子:
 *   本人の要望「GitHubの機能もこのツールの中に」。このツール自身の公開リポジトリの、
 *   最近の変更・取り込み待ち・自動処理（公開）の結果を、読むだけで見せる。
 *   外へ出るので、本人が「見る」を押したときだけ（関所は、その3つの道だけを通す）。鍵は付けない。
 */

const GitHubの倉庫 = 'pentakobaryou0907-gif/ARELM';

function 入場の部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function 入場の時刻(iso) {
    try { return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
}

async function render入場の記録() {
    const 箱 = document.getElementById('entry-log-panel');
    if (!箱) return;
    箱.textContent = '';
    const 公開先か = typeof サーバーの無い公開先か === 'function' && サーバーの無い公開先か();
    let 直近 = [];
    let 知らせ = [];
    if (公開先か) {
        try { 直近 = JSON.parse(localStorage.getItem('areglm_local_entries') || '[]').slice(-20).reverse().map((r) => ({ とき: r.とき, 何: r.何, どこから: 'この端末' })); } catch { 直近 = []; }
        const 一日前 = Date.now() - 86400000;
        const 間違い = 直近.filter((r) => /間違い/.test(r.何) && new Date(r.とき).getTime() >= 一日前).length;
        if (間違い >= 3) 知らせ.push(`この24時間に、この端末で合言葉の間違いが${間違い}回ありました`);
        箱.append(入場の部品('p', '公開先で開いています。この端末の合言葉の記録です（Macのログインの記録は、Macで開くと見られます）。', 'hint'));
    } else {
        const r = typeof アカウントAPI === 'function' ? await アカウントAPI('/api/security/entries') : null;
        if (!r || !r.ok) { 箱.append(入場の部品('p', (r && r.訳) || '記録を読めませんでした', 'hint')); return; }
        直近 = r.直近;
        知らせ = r.知らせ || [];
    }
    箱.append(入場の部品('p', 知らせ.length ? '⚠ ' + 知らせ.join('。') + '。心当たりが無ければ、パスワードと合言葉を決め直してください。' : '気になる記録はありません（この24時間）。',
        'status-banner ' + (知らせ.length ? 'warn' : 'ok')));
    if (!直近.length) { 箱.append(入場の部品('p', 'まだ記録はありません。', 'hint')); return; }
    const 表 = 入場の部品('ul');
    直近.forEach((r) => 表.append(入場の部品('li', `${入場の時刻(r.とき)}　${r.何}　${r.どこから}`)));
    箱.append(表);
}

async function renderGitHubの様子(見る) {
    const 箱 = document.getElementById('github-panel');
    if (!箱) return;
    箱.textContent = '';
    if (!見る) {
        箱.append(入場の部品('p', `このツールの倉庫（${GitHubの倉庫}）の、最近の変更・取り込み待ち・公開の処理の結果を見ます。押したときだけ GitHub に問い合わせます（読むだけ・鍵は送りません）。`, 'hint'));
        const b = 入場の部品('button', 'GitHubの様子を見る', 'btn btn-sm btn-primary');
        b.type = 'button';
        b.addEventListener('click', () => {
            // 本人が押した印。関所は、この印があるときだけ、決まった3つの道を通す
            localStorage.setItem('areglm_ext_github_view', 'true');
            renderGitHubの様子(true);
        });
        箱.append(b);
        return;
    }
    箱.append(入場の部品('p', '読み込んでいます…', 'hint'));
    const 取る = async (道) => {
        const r = await 選んだ置き場へ送る(`https://api.github.com/repos/${GitHubの倉庫}/${道}`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        if (r.status === 403 || r.status === 429) throw new Error('GitHubへの問い合わせが多すぎます。1時間ほどしてから、もう一度どうぞ');
        if (!r.ok) throw new Error('GitHubから読めませんでした（' + r.status + '）');
        return r.json();
    };
    try {
        const [変更, 待ち, 処理] = await Promise.all([取る('commits').then((x) => x.slice(0, 5)), 取る('pulls'), 取る('actions/runs').then((x) => (x.workflow_runs || []).slice(0, 5))]);
        箱.textContent = '';
        const 節 = (題, 行たち, 空) => {
            箱.append(入場の部品('h4', 題));
            if (!行たち.length) { 箱.append(入場の部品('p', 空, 'hint')); return; }
            const ul = 入場の部品('ul');
            行たち.forEach(([文, url]) => {
                const li = 入場の部品('li');
                const a = 入場の部品('a', 文);
                a.href = url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                li.append(a);
                ul.append(li);
            });
            箱.append(ul);
        };
        節('最近の変更', 変更.map((c) => [`${入場の時刻(c.commit.author.date)}　${String(c.commit.message).split('\n')[0]}`, c.html_url]), 'ありません');
        節('取り込み待ち（プルリクエスト）', 待ち.map((p) => [`#${p.number}　${p.title}`, p.html_url]), '取り込み待ちはありません');
        節('自動の処理（公開など）', 処理.map((w) => [`${入場の時刻(w.created_at)}　${w.name}　${w.status === 'completed' ? (w.conclusion === 'success' ? '✓ 成功' : '✗ ' + w.conclusion) : '… ' + w.status}`, w.html_url]), 'ありません');
        const やめる = 入場の部品('button', '見るのをやめる（GitHubに問い合わせない）', 'btn btn-sm btn-secondary');
        やめる.type = 'button';
        やめる.addEventListener('click', () => { localStorage.removeItem('areglm_ext_github_view'); renderGitHubの様子(false); });
        箱.append(やめる);
    } catch (e) {
        箱.textContent = '';
        箱.append(入場の部品('p', e.message, 'hint'));
    }
}

function render入場とGitHub() {
    render入場の記録();
    renderGitHubの様子(localStorage.getItem('areglm_ext_github_view') === 'true');
}

window.render入場とGitHub = render入場とGitHub;
