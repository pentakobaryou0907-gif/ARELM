/**
 * 不要ボックス（このツールの中のゴミ箱）
 *
 * なぜこれが要るのか:
 *   「消さないで、不要フォルダーへ移して」というのが、
 *   このツールの一貫した決まりごと。
 *   ところがツールの中では、メモも商品もタスクも
 *   「削除」で即座に消えていた。
 *   決まりごとがファイルにだけ適用されていて、
 *   中のデータには効いていなかった。
 *
 *   PCのゴミ箱と同じように、
 *   ここへ入るだけで、消えたわけではない状態にする。
 *
 * 決めごと:
 *   ・「消す」と押しても、まずここへ入る
 *   ・戻せる（元の場所へそのまま返る）
 *   ・本当に消すのは、ここで改めて選んだときだけ
 *   ・何を、いつ、どこから入れたかを必ず残す
 *
 * すべてこの端末の中だけで保存する。外部へは一切送らない。
 */

const AREGLM_TRASH_KEY = 'areglm_trash';

/** 入れられるものの種類。戻すときに、どこへ返すかを決める。 */
const 戻し先 = {
    memo:    { 名: 'メモ',   鍵: 'areglm_memos',    描く: 'renderMemoList' },
    task:    { 名: 'やること', 鍵: 'areglm_tasks',    描く: 'renderTaskList' },
    product: { 名: '商品',   鍵: 'products',        描く: 'renderInventory' },
    brand:   { 名: 'ブランド', 鍵: 'brands',          描く: 'renderBrands' },
    event:   { 名: '予定',   鍵: 'areglm_events',   描く: 'renderCalendar' },
    sns:     { 名: 'SNS投稿', 鍵: 'areglm_sns_posts', 描く: 'renderSnsPosts' },
    rule:    { 名: 'ルール',  鍵: 'areglm_my_rules',  描く: 'renderRules' },
    sale:    { 名: '売上',   鍵: 'areglm_sales',     描く: 'お金の帳面を描く' },
    expense: { 名: '支出',   鍵: 'areglm_expenses',  描く: 'お金の帳面を描く' },
    postlog: { 名: '投稿ログ', 鍵: 'areglm_post_log',  描く: '投稿ログを描く' },
    other:   { 名: 'その他',  鍵: '',                描く: '' },
};

function 不要ボックスを読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_TRASH_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 不要ボックスを保存(中身) {
    localStorage.setItem(AREGLM_TRASH_KEY, JSON.stringify(中身));
}

/**
 * 不要ボックスへ入れる。
 *
 * 中身をそのまま丸ごと持っていく。
 * 一部だけ残すと、戻したときに欠けるため。
 *
 * @param {string} 種類  戻し先 の鍵（memo / task / product ...）
 * @param {object} もの  入れる中身そのもの
 * @param {string} 見出し 一覧に出す名前
 */
function 不要ボックスへ入れる(種類, もの, 見出し) {
    const 箱 = 不要ボックスを読む();
    箱.push({
        id: 'trash_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        種類: 戻し先[種類] ? 種類 : 'other',
        見出し: 見出し || もの?.title || もの?.name || もの?.文 || '（名前なし）',
        中身: もの,
        入れた日: new Date().toISOString(),
    });
    不要ボックスを保存(箱);
    renderTrash();

    if (typeof showNotification === 'function') {
        showNotification('不要ボックスへ移しました（消えていません）', 'success');
    }
    return true;
}

/**
 * 元の場所へ戻す。
 *
 * 同じものが既にある場合は足さない。
 * 戻すたびに増えていくと、かえって混乱するため。
 */
function 不要ボックスから戻す(id) {
    const 箱 = 不要ボックスを読む();
    const もの = 箱.find((x) => x.id === id);
    if (!もの) return false;

    const 先 = 戻し先[もの.種類];
    if (!先 || !先.鍵) {
        if (typeof showNotification === 'function') {
            showNotification('戻し先が分からないため、戻せませんでした', 'error');
        }
        return false;
    }

    let 一覧 = [];
    try {
        一覧 = JSON.parse(localStorage.getItem(先.鍵) || '[]');
        if (!Array.isArray(一覧)) 一覧 = [];
    } catch {
        一覧 = [];
    }

    const 中身 = もの.中身;
    const ある = 中身 && 中身.id && 一覧.some((x) => x.id === 中身.id);
    if (!ある) 一覧.push(中身);

    localStorage.setItem(先.鍵, JSON.stringify(一覧));
    不要ボックスを保存(箱.filter((x) => x.id !== id));

    // 戻した先の画面を描き直す
    if (先.描く && typeof window[先.描く] === 'function') window[先.描く]();
    renderTrash();

    if (typeof showNotification === 'function') {
        showNotification(`${先.名}へ戻しました`, 'success');
    }
    return true;
}

/**
 * 本当に消す。
 *
 * ここだけが、実際に消える唯一の場所。
 * 押し間違いで消えないよう、必ず確認する。
 */
function 本当に消す(id) {
    const 箱 = 不要ボックスを読む();
    const もの = 箱.find((x) => x.id === id);
    if (!もの) return false;

    const よいか = confirm(
        `これを完全に消します。元には戻せません。\n\n`
        + `「${もの.見出し}」（${戻し先[もの.種類]?.名 || 'その他'}）\n\n`
        + `よろしいですか。`
    );
    if (!よいか) return false;

    不要ボックスを保存(箱.filter((x) => x.id !== id));
    renderTrash();
    if (typeof showNotification === 'function') {
        showNotification('完全に消しました', 'warn');
    }
    return true;
}

/** 不要ボックスを空にする。まとめて消すため、より強く確認する。 */
function 不要ボックスを空にする() {
    const 箱 = 不要ボックスを読む();
    if (!箱.length) {
        showNotification('不要ボックスは空です', 'success');
        return;
    }
    if (!confirm(`不要ボックスの${箱.length}件を、すべて完全に消します。\n元には戻せません。よろしいですか。`)) return;

    不要ボックスを保存([]);
    renderTrash();
    showNotification(`${箱.length}件を完全に消しました`, 'warn');
}

/* ---------- 画面 ---------- */

function renderTrash() {
    const 箱の場所 = document.getElementById('trash-list');
    if (!箱の場所) return;

    const 箱 = 不要ボックスを読む().slice().reverse();
    const 数 = document.getElementById('trash-count');
    if (数) 数.textContent = 箱.length ? `${箱.length}件` : '空';

    箱の場所.innerHTML = '';
    if (!箱.length) {
        箱の場所.innerHTML = '<li class="hint">不要ボックスは空です。ここに入れたものは、消すまで残ります。</li>';
        return;
    }

    箱.forEach((もの) => {
        const li = document.createElement('li');
        li.className = 'trash-item';

        const 種 = document.createElement('span');
        種.className = 'trash-kind';
        種.textContent = 戻し先[もの.種類]?.名 || 'その他';

        const 名 = document.createElement('span');
        名.className = 'trash-title';
        名.textContent = もの.見出し;

        const 日 = document.createElement('span');
        日.className = 'trash-date';
        日.textContent = new Date(もの.入れた日).toLocaleString('ja-JP');

        const 戻す = document.createElement('button');
        戻す.type = 'button';
        戻す.className = 'btn-link';
        戻す.textContent = '戻す';
        戻す.addEventListener('click', () => 不要ボックスから戻す(もの.id));

        const 消す = document.createElement('button');
        消す.type = 'button';
        消す.className = 'btn-link danger';
        消す.textContent = '完全に消す';
        消す.addEventListener('click', () => 本当に消す(もの.id));

        li.appendChild(種);
        li.appendChild(名);
        li.appendChild(日);
        li.appendChild(戻す);
        li.appendChild(消す);
        箱の場所.appendChild(li);
    });
}

function initTrash() {
    document.getElementById('trash-empty')?.addEventListener('click', 不要ボックスを空にする);
    renderTrash();
}

window.initTrash = initTrash;
window.renderTrash = renderTrash;
window.不要ボックスへ入れる = 不要ボックスへ入れる;
window.不要ボックスから戻す = 不要ボックスから戻す;
window.不要ボックスを読む = 不要ボックスを読む;
