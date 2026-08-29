/**
 * 週次レポート
 *
 * なぜこれが要るのか:
 *   毎日、在庫・SNS・タスク・売上をバラバラに見ていると、
 *   「今週、全体としてどうだったか」が見えにくい。
 *   1週間おきに、実際にある数字だけをまとめて出す。
 *
 * 正直さについて:
 *   「今週の入庫・出庫件数」のように、この端末にタイムスタンプ付きで
 *   記録していないデータは、無理に数えて出さない
 *   （在庫の増減はできるが、いつ動いたかの記録が無いため）。
 *   代わりに「今の状態」であることが分かる書き方にする。
 *   ここは正確な数字だけを載せ、無い数字は載せない。
 */

const 週次レポートの鍵 = 'areglm_weekly_reports';

function 週次レポート一覧を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(週次レポートの鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 週次レポート一覧を保存(一覧) {
    localStorage.setItem(週次レポートの鍵, JSON.stringify(一覧.slice(-52))); // 1年分で十分
}

/** 直近7日ぶんの数字を、この端末にある実データだけから集める */
function 今週の数字を集める() {
    const 今 = Date.now();
    const 一週間前 = 今 - 7 * 24 * 60 * 60 * 1000;
    const 今日文字 = typeof 今日 === 'function' ? 今日() : new Date().toISOString().slice(0, 10);

    const 出す = {};

    // --- 在庫（今の状態のスナップショット。「今週増えた」は記録が無く数えられない） ---
    try {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        出す.在庫 = {
            商品数: products.length,
            要補充: products.filter((p) => (p.quantity ?? 0) <= (p.reorderLevel ?? 5)).length,
        };
    } catch { /* データが読めなければ、この項目ごと出さない */ }

    // --- 売上（sales に日付があるので、今週ぶんを正確に数えられる） ---
    try {
        const sales = JSON.parse(localStorage.getItem('sales') || '[]');
        const 今週の売上 = sales.filter((s) => s.date && new Date(s.date).getTime() >= 一週間前);
        if (sales.length) {
            出す.売上 = {
                件数: 今週の売上.length,
                合計: 今週の売上.reduce((sum, s) => sum + (Number(s.total) || 0), 0),
            };
        }
    } catch { /* 同上 */ }

    // --- タスク（完了した「日」は記録していないため、今の状態だけ） ---
    try {
        const tasks = JSON.parse(localStorage.getItem('areglm_tasks') || '[]');
        if (tasks.length) {
            出す.タスク = {
                未完了: tasks.filter((t) => !t.done).length,
                期限切れか今日まで: tasks.filter((t) => !t.done && t.due && t.due <= 今日文字).length,
            };
        }
    } catch { /* 同上 */ }

    // --- SNS（活動記録に日付があるので、今週作った下書き数は正確に数えられる） ---
    try {
        const logs = JSON.parse(localStorage.getItem('areglm_activity_log') || '[]');
        const queue = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
        // areglm_activity_log の1件ごとの記録には category が付いていない
        // （記録される時点で message だけになる作りのため）。
        // 実際に書かれる文言（「◯◯ 投稿をキューに追加」）で拾う。
        const 今週の下書き = logs.filter((l) =>
            l.message?.includes('投稿をキューに追加')
            && l.at && new Date(l.at).getTime() >= 一週間前);
        出す.SNS = {
            今週作った下書き: 今週の下書き.length,
            まだ出していない下書き: queue.filter((q) => q.status === 'pending').length,
        };
    } catch { /* 同上 */ }

    return 出す;
}

/** 数字を、読みやすい文の並びにする */
function 数字を文にする(数字) {
    const 行 = [];
    if (数字.在庫) 行.push(`在庫：商品${数字.在庫.商品数}件のうち、要補充が${数字.在庫.要補充}件（現在の状態）`);
    if (数字.売上) 行.push(`売上：今週${数字.売上.件数}件、合計¥${数字.売上.合計.toLocaleString('ja-JP')}`);
    if (数字.タスク) 行.push(`タスク：未完了${数字.タスク.未完了}件（うち期限切れ・本日締切が${数字.タスク.期限切れか今日まで}件）`);
    if (数字.SNS) 行.push(`SNS：今週作った下書き${数字.SNS.今週作った下書き}件、まだ出していない下書き${数字.SNS.まだ出していない下書き}件`);
    return 行;
}

/** ローカルAIに、数字を渡して一言だけコメントしてもらう（分類を挟まない専用の入口を使う） */
async function 週次コメントを作る(数字の文) {
    if (!数字の文.length) return '';
    try {
        const r = await fetch('/api/ai-local/code-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: '次はアパレルブランドの、この1週間の実データです。事実として書かれている数字だけを見て、'
                    + '気づいたことを1〜2文で簡潔にコメントしてください。数字に無いことは書かないでください。\n\n'
                    + 数字の文.join('\n'),
            }),
        }).then((y) => y.json());
        return r.ok ? r.answer : '';
    } catch {
        return '';
    }
}

async function 週次レポートを作る() {
    const btn = document.getElementById('weekly-report-make-btn');
    if (btn) { btn.disabled = true; btn.textContent = '作っています…'; }

    try {
        const 数字 = 今週の数字を集める();
        const 文たち = 数字を文にする(数字);
        const コメント = await 週次コメントを作る(文たち);

        const 一覧 = 週次レポート一覧を読む();
        const 次の番号 = (一覧[一覧.length - 1]?.番号 || 0) + 1;
        一覧.push({
            番号: 次の番号,
            作った日: new Date().toISOString(),
            数字,
            コメント,
        });
        週次レポート一覧を保存(一覧);
        レポート一覧を描く();
        showNotification(`週次レポート #${次の番号} を作りました`, 'success');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '今週のレポートを作る'; }
    }
}

function レポート一覧を描く() {
    const 箱 = document.getElementById('weekly-report-list');
    if (!箱) return;

    const 一覧 = 週次レポート一覧を読む().slice().reverse();
    if (!一覧.length) {
        箱.innerHTML = '<div class="empty">まだレポートがありません。「今週のレポートを作る」から作れます。</div>';
        return;
    }

    箱.innerHTML = '';
    一覧.forEach((r) => {
        const 札 = document.createElement('article');
        札.className = 'weekly-report-card';

        const 見出し = document.createElement('h4');
        見出し.textContent = `Weekly Report #${r.番号}`;
        const 日付 = document.createElement('small');
        日付.className = 'hint';
        日付.textContent = new Date(r.作った日).toLocaleString('ja-JP');
        見出し.appendChild(日付);
        札.appendChild(見出し);

        const 行たち = 数字を文にする(r.数字 || {});
        if (行たち.length) {
            const ul = document.createElement('ul');
            ul.className = 'weekly-report-lines';
            行たち.forEach((文) => {
                const li = document.createElement('li');
                li.textContent = 文;
                ul.appendChild(li);
            });
            札.appendChild(ul);
        }

        if (r.コメント) {
            const p = document.createElement('p');
            p.className = 'weekly-report-comment';
            p.textContent = `💬 ${r.コメント}`;
            札.appendChild(p);
        }

        箱.appendChild(札);
    });
}

function init週次レポート() {
    const btn = document.getElementById('weekly-report-make-btn');
    if (!btn || btn.dataset.配線済み) return;
    btn.dataset.配線済み = '1';
    btn.addEventListener('click', 週次レポートを作る);
    レポート一覧を描く();
}

window.init週次レポート = init週次レポート;
