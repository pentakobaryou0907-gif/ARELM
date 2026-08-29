/**
 * 受注の管理（先に集めて、数が集まったら作る）
 *
 * この売り方のために作ってある:
 *   ・先に受注を集める
 *   ・決めた人数を超えたら、そこで初めて作る
 *   ・超えなかったら販売しないし、お金も取らない
 *
 * なぜ数を見張るのか:
 *   達したことに気づかないと、いつまでも待つことになる。
 *   締切を過ぎたことに気づかないと、集まらなかったのに
 *   作り始めてしまう。どちらも損が出る。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const AREGLM_PREORDER_KEY = 'areglm_preorders';

function 受注を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_PREORDER_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 受注を保存(一覧) {
    localStorage.setItem(AREGLM_PREORDER_KEY, JSON.stringify(一覧));
}

function 受注を足す(中身) {
    const 名 = (中身.商品名 || '').trim();
    if (!名) return false;

    const 一覧 = 受注を読む();
    一覧.push({
        id: 'pre_' + Date.now(),
        商品名: 名,
        必要数: Math.max(1, Number(中身.必要数) || 50),
        いまの数: Number(中身.いまの数) || 0,
        値段: Number(String(中身.値段 || '').replace(/[^\d.]/g, '')) || 0,
        締切: 中身.締切 || '',
        知らせた: false,
        締切を知らせた: false,
        状態: '受付中',
        作った日: typeof 今日 === 'function' ? 今日() : '',
    });
    受注を保存(一覧);
    renderPreorders();
    return true;
}

/** 数を増やす・減らす */
function 受注数を変える(id, 差) {
    const 一覧 = 受注を読む();
    const p = 一覧.find((x) => x.id === id);
    if (!p) return;

    p.いまの数 = Math.max(0, p.いまの数 + 差);

    // 減って足りなくなったら、また知らせられるようにする
    if (p.いまの数 < p.必要数) p.知らせた = false;

    受注を保存(一覧);
    見張る();
    renderPreorders();
}

/**
 * 達したか、締切が過ぎたかを見る。
 *
 * 同じことを何度も知らせないよう、
 * 知らせたかどうかを覚えておく。
 */
function 見張る() {
    const 一覧 = 受注を読む();
    let 変わった = false;
    const きょう = typeof 今日 === 'function' ? 今日() : '';

    一覧.forEach((p) => {
        if (p.状態 !== '受付中') return;

        // --- 数が達した ---
        if (p.いまの数 >= p.必要数 && !p.知らせた) {
            p.知らせた = true;
            変わった = true;
            if (typeof showNotification === 'function') {
                showNotification(
                    `受注数に達しました: ${p.商品名}（${p.いまの数}/${p.必要数}件）製作に入れます`,
                    'success'
                );
            }
        }

        // --- 締切が過ぎた ---
        if (p.締切 && きょう && きょう > p.締切 && !p.締切を知らせた) {
            p.締切を知らせた = true;
            変わった = true;
            const 足りた = p.いまの数 >= p.必要数;
            if (typeof showNotification === 'function') {
                showNotification(
                    足りた
                        ? `締切です: ${p.商品名}（${p.いまの数}件・達成）製作に入れます`
                        : `締切です: ${p.商品名}（${p.いまの数}/${p.必要数}件・未達）お金は取らずに見送ります`,
                    足りた ? 'success' : 'warn'
                );
            }
        }
    });

    if (変わった) 受注を保存(一覧);
}

function renderPreorders() {
    const 箱 = document.getElementById('preorder-list');
    if (!箱) return;

    const 一覧 = 受注を読む();
    箱.innerHTML = '';

    if (!一覧.length) {
        箱.innerHTML = '<li class="hint">まだありません</li>';
        return;
    }

    一覧.forEach((p) => {
        const li = document.createElement('li');
        const 達した = p.いまの数 >= p.必要数;
        li.className = 'preorder-item' + (達した ? ' reached' : '')
            + (p.状態 !== '受付中' ? ' closed' : '');

        const 名 = document.createElement('div');
        名.className = 'pre-name';
        名.textContent = p.商品名;

        const 数 = document.createElement('div');
        数.className = 'pre-count';
        数.textContent = `${p.いまの数} / ${p.必要数}件`;

        // 進み具合の帯。数字だけより、あとどれくらいかが掴みやすい。
        const 帯 = document.createElement('div');
        帯.className = 'pre-bar';
        const 中 = document.createElement('span');
        中.style.width = Math.min(100, (p.いまの数 / p.必要数) * 100) + '%';
        帯.appendChild(中);

        const 情報 = document.createElement('div');
        情報.className = 'pre-info';
        const 部品 = [];
        if (p.値段) 部品.push('¥' + p.値段.toLocaleString('ja-JP'));
        if (p.値段) 部品.push('見込み ¥' + (p.値段 * p.いまの数).toLocaleString('ja-JP'));
        if (p.締切) 部品.push('締切 ' + p.締切);
        部品.push(達した ? '達成' : `あと${p.必要数 - p.いまの数}件`);
        情報.textContent = 部品.join(' ／ ');

        const 操作 = document.createElement('div');
        操作.className = 'pre-actions';
        [['−1', -1], ['+1', 1], ['+5', 5]].forEach(([文, 差]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-sm btn-secondary';
            b.textContent = 文;
            b.addEventListener('click', () => 受注数を変える(p.id, 差));
            操作.appendChild(b);
        });

        const 外 = document.createElement('button');
        外.type = 'button';
        外.className = 'btn-link danger';
        外.textContent = '外す';
        外.addEventListener('click', () => {
            if (typeof 不要ボックスへ入れる === 'function') {
                不要ボックスへ入れる('other', p, '受注: ' + p.商品名);
            }
            受注を保存(受注を読む().filter((x) => x.id !== p.id));
            renderPreorders();
        });
        操作.appendChild(外);

        li.appendChild(名);
        li.appendChild(数);
        li.appendChild(帯);
        li.appendChild(情報);
        li.appendChild(操作);
        箱.appendChild(li);
    });
}

function initPreorder() {
    document.getElementById('preorder-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const 取 = (id) => document.getElementById(id)?.value;
        if (!受注を足す({
            商品名: 取('pre-product'),
            必要数: 取('pre-target'),
            値段: 取('pre-price'),
            締切: 取('pre-deadline'),
        })) return;
        ['pre-product', 'pre-price'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    });

    見張る();
    renderPreorders();

    // 締切をまたいだときに気づけるよう、5分ごとに見る。
    // 数を数えるだけなので、端末に負担はかからない。
    setInterval(見張る, 5 * 60 * 1000);
}

window.initPreorder = initPreorder;
window.renderPreorders = renderPreorders;
window.受注を読む = 受注を読む;
window.受注を足す = 受注を足す;
window.受注数を変える = 受注数を変える;
