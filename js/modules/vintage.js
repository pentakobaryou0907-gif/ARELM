/**
 * 古着ブランドの管理
 *
 * まだECサイトを持っていないため、
 * 「どこで、いくらで、いつ出したか」を追えることを主眼にしてある。
 * 売れたときの利益がその場で分かるようにもしてある。
 * 古着は仕入れ値がまちまちで、
 * 売値だけ見ても儲かったか分からないため。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const AREGLM_VINTAGE_KEY = 'areglm_vintage';

/** 出品先。増えることを見込んで、ここにまとめてある。 */
const 出品先 = ['メルカリ', 'ヤフオク', 'ラクマ', '2nd STREET', '店頭', 'その他'];

/** 状態。古着は状態で値段が大きく変わるため、必ず持たせる。 */
const 品の状態 = ['新品同様', '美品', '良好', '使用感あり', '難あり'];

function 古着を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_VINTAGE_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 古着を保存(一覧) {
    localStorage.setItem(AREGLM_VINTAGE_KEY, JSON.stringify(一覧));
}

function 古着を足す(中身) {
    const 名 = (中身.名前 || '').trim();
    if (!名) return false;

    const 一覧 = 古着を読む();
    一覧.push({
        id: 'vin_' + Date.now(),
        名前: 名,
        ブランド: (中身.ブランド || '').trim(),
        状態: 中身.状態 || '良好',
        仕入値: Number(String(中身.仕入値 || '').replace(/[^\d.]/g, '')) || 0,
        売値: Number(String(中身.売値 || '').replace(/[^\d.]/g, '')) || 0,
        出品先: 中身.出品先 || 'メルカリ',
        売れた: false,
        出した日: typeof 今日 === 'function' ? 今日() : '',
        覚え書き: (中身.覚え書き || '').trim(),
    });
    古着を保存(一覧);
    renderVintage();
    return true;
}

/** 一点あたりの利益。手数料は出品先ごとに違うので、いまは引かずに出す。 */
function 利益(v) {
    return (v.売値 || 0) - (v.仕入値 || 0);
}

function renderVintage() {
    const 箱 = document.getElementById('vintage-list');
    if (!箱) return;

    const 一覧 = 古着を読む();

    // 売れていないものを上に。手を打つ必要があるのはそちらのため。
    一覧.sort((a, b) => (a.売れた === b.売れた ? 0 : a.売れた ? 1 : -1));

    箱.innerHTML = '';
    if (!一覧.length) {
        箱.innerHTML = '<tr><td colspan="7" class="hint">まだありません</td></tr>';
    }

    一覧.forEach((v) => {
        const tr = document.createElement('tr');
        if (v.売れた) tr.className = 'vintage-sold';

        const 作 = (中身, クラス) => {
            const td = document.createElement('td');
            if (クラス) td.className = クラス;
            td.textContent = 中身;
            return td;
        };

        tr.appendChild(作(v.名前));
        tr.appendChild(作(v.ブランド || '—'));
        tr.appendChild(作(v.状態));
        tr.appendChild(作(v.仕入値 ? '¥' + v.仕入値.toLocaleString('ja-JP') : '—'));
        tr.appendChild(作(v.売値 ? '¥' + v.売値.toLocaleString('ja-JP') : '—'));

        const り = 利益(v);
        tr.appendChild(作(
            v.売値 ? (り >= 0 ? '+¥' : '−¥') + Math.abs(り).toLocaleString('ja-JP') : '—',
            り >= 0 ? 'profit-plus' : 'profit-minus'
        ));

        const 操作 = document.createElement('td');

        const 売 = document.createElement('button');
        売.type = 'button';
        売.className = 'btn-link';
        売.textContent = v.売れた ? '戻す' : '売れた';
        売.addEventListener('click', () => {
            const 全 = 古着を読む();
            const t = 全.find((x) => x.id === v.id);
            if (t) t.売れた = !t.売れた;
            古着を保存(全);
            renderVintage();
        });

        const 消 = document.createElement('button');
        消.type = 'button';
        消.className = 'btn-link danger';
        消.textContent = '外す';
        消.addEventListener('click', () => {
            if (typeof 不要ボックスへ入れる === 'function') {
                不要ボックスへ入れる('other', v, '古着: ' + v.名前);
            }
            古着を保存(古着を読む().filter((x) => x.id !== v.id));
            renderVintage();
        });

        操作.appendChild(売);
        操作.appendChild(消);
        tr.appendChild(操作);
        箱.appendChild(tr);
    });

    const 出品中 = 一覧.filter((v) => !v.売れた);
    const 売れた = 一覧.filter((v) => v.売れた);
    const 利 = 売れた.reduce((n, v) => n + 利益(v), 0);

    const 合 = document.getElementById('vintage-summary');
    if (合) {
        const 寝ている = 出品中.reduce((n, v) => n + (v.仕入値 || 0), 0);
        合.textContent = `出品中 ${出品中.length}点（仕入 ¥${寝ている.toLocaleString('ja-JP')}）`
            + ` ／ 売れた ${売れた.length}点（利益 ¥${利.toLocaleString('ja-JP')}）`;
    }

    // ブランドページ上部のミニ統計カード（3-1）
    if (typeof setText === 'function') {
        setText('brand-stat-vintage-active', 出品中.length);
        setText('brand-stat-vintage-profit', `¥${利.toLocaleString('ja-JP')}`);
    }
}

function initVintage() {
    // 選べる中身を作る
    const 先 = document.getElementById('vintage-place');
    if (先 && !先.options.length) {
        // 選択肢を文字でつなげていた。ストッパーが見つけた。部品で作る。
        先.textContent = '';
        出品先.forEach((x) => {
            const o = document.createElement('option');
            o.value = x;
            o.textContent = x;
            先.appendChild(o);
        });
    }
    const 状 = document.getElementById('vintage-cond');
    if (状 && !状.options.length) {
        状.textContent = '';
        品の状態.forEach((x) => {
            const o = document.createElement('option');
            o.value = x;
            o.textContent = x;
            if (x === '良好') o.selected = true;
            状.appendChild(o);
        });
    }

    document.getElementById('vintage-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const 取 = (id) => document.getElementById(id)?.value;
        if (!古着を足す({
            名前: 取('vintage-name'),
            ブランド: 取('vintage-brand'),
            状態: 取('vintage-cond'),
            仕入値: 取('vintage-cost'),
            売値: 取('vintage-price'),
            出品先: 取('vintage-place'),
        })) return;
        ['vintage-name', 'vintage-brand', 'vintage-cost', 'vintage-price'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    });

    renderVintage();
}

window.initVintage = initVintage;
window.renderVintage = renderVintage;
window.古着を読む = 古着を読む;
window.古着を足す = 古着を足す;
