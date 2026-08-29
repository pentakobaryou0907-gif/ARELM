/**
 * ほしいものリスト
 *
 * やることリストとは分けてある。
 * 「やること」は自分が動くもの、「ほしいもの」は買うか決めるもので、
 * 混ぜると、どちらも探しにくくなるため。
 *
 * 値段と優先度を持たせて、合計がすぐ分かるようにしてある。
 * 買うかどうかは、たいてい合計を見て決めるため。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const AREGLM_WISH_KEY = 'areglm_wishlist';

function ほしいものを読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_WISH_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function ほしいものを保存(一覧) {
    localStorage.setItem(AREGLM_WISH_KEY, JSON.stringify(一覧));
}

function ほしいものを足す(名前, 値段, 優先, 覚え書き) {
    名前 = (名前 || '').trim();
    if (!名前) return false;

    const 一覧 = ほしいものを読む();
    一覧.push({
        id: 'wish_' + Date.now(),
        名前,
        値段: Number(String(値段 || '').replace(/[^\d.]/g, '')) || 0,
        優先: 優先 || 'normal',
        覚え書き: (覚え書き || '').trim(),
        買った: false,
        作った日: typeof 今日 === 'function' ? 今日() : '',
    });
    ほしいものを保存(一覧);
    renderWishlist();
    return true;
}

function renderWishlist() {
    const 箱 = document.getElementById('wish-list');
    if (!箱) return;

    const 一覧 = ほしいものを読む();

    // 優先度が高いものを上に。同じなら値段の高い順。
    // 迷うのはたいてい高いものなので、目に付く場所に置く。
    const 順 = { high: 0, normal: 1, low: 2 };
    一覧.sort((a, b) => {
        if (a.買った !== b.買った) return a.買った ? 1 : -1;
        if (順[a.優先] !== 順[b.優先]) return 順[a.優先] - 順[b.優先];
        return b.値段 - a.値段;
    });

    箱.innerHTML = '';
    if (!一覧.length) {
        箱.innerHTML = '<li class="hint">まだありません</li>';
    }

    一覧.forEach((w) => {
        const li = document.createElement('li');
        li.className = 'wish-item' + (w.買った ? ' bought' : '');

        const ちぇ = document.createElement('input');
        ちぇ.type = 'checkbox';
        ちぇ.checked = w.買った;
        ちぇ.addEventListener('change', () => {
            const 全 = ほしいものを読む();
            const t = 全.find((x) => x.id === w.id);
            if (t) t.買った = ちぇ.checked;
            ほしいものを保存(全);
            renderWishlist();
        });

        const 名 = document.createElement('span');
        名.className = 'wish-name';
        名.textContent = w.名前;

        const 値 = document.createElement('span');
        値.className = 'wish-price';
        値.textContent = w.値段 ? '¥' + w.値段.toLocaleString('ja-JP') : '—';

        const 優 = document.createElement('span');
        優.className = 'wish-pri pri-' + w.優先;
        優.textContent = { high: '要', normal: '', low: '後' }[w.優先] || '';

        const 消 = document.createElement('button');
        消.type = 'button';
        消.className = 'btn-link danger';
        消.textContent = '外す';
        消.addEventListener('click', () => {
            if (typeof 不要ボックスへ入れる === 'function') {
                不要ボックスへ入れる('other', w, 'ほしいもの: ' + w.名前);
            }
            ほしいものを保存(ほしいものを読む().filter((x) => x.id !== w.id));
            renderWishlist();
        });

        li.appendChild(ちぇ);
        li.appendChild(名);
        if (w.優先 !== 'normal') li.appendChild(優);
        li.appendChild(値);
        li.appendChild(消);
        箱.appendChild(li);
    });

    // 合計を出す。買うかどうかは、たいてい合計を見て決めるため。
    const 合 = document.getElementById('wish-total');
    if (合) {
        const まだ = 一覧.filter((w) => !w.買った);
        const 額 = まだ.reduce((n, w) => n + w.値段, 0);
        合.textContent = `まだ買っていないもの ${まだ.length}件 ／ 合計 ¥${額.toLocaleString('ja-JP')}`;
    }
}

function initWishlist() {
    document.getElementById('wish-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const 名 = document.getElementById('wish-name');
        const 値 = document.getElementById('wish-price');
        const 優 = document.getElementById('wish-priority');
        if (!ほしいものを足す(名?.value, 値?.value, 優?.value)) return;
        if (名) 名.value = '';
        if (値) 値.value = '';
    });
    renderWishlist();
}

window.initWishlist = initWishlist;
window.renderWishlist = renderWishlist;
window.ほしいものを足す = ほしいものを足す;
window.ほしいものを読む = ほしいものを読む;
