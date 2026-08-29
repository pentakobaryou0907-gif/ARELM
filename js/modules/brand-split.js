/**
 * ブランドを「自社」と「他社」に分ける
 *
 * なぜこれが要るのか:
 *   自分のブランドと、調べるために入れた他社のブランドが
 *   同じ一覧に混ざっていた。
 *
 *   この二つは、見る目的がまったく違う。
 *   自社は「育てるもの」、他社は「参考にするもの」。
 *   混ざっていると、どちらの用でも探しにくい。
 *
 * 分け方:
 *   ・はっきり自社と分かるもの（AReGLM とそのシリーズ）
 *   ・「競合調査」の印が付いているもの → 他社
 *   ・どちらとも言えないもの → 「未分類」に置き、手で決められるようにする
 *
 *   決めつけて振り分けると、間違ったほうに入って気づけない。
 *   分からないものは分からないままにしておく。
 *
 * すべてこの端末の中だけで判断する。外部へは一切問い合わせない。
 */

/** 自社と分かる名前。シリーズが増えたらここに足す。 */
const 自社の名前 = ['AReGLM', 'TUDURI', 'TUZURI', 'INTGLM'];

/**
 * どちら側かを決める。
 *
 * @returns {'own'|'other'|'unknown'}
 */
function どちらのブランドか(b) {
    // 手で決めたものが最優先。あとから直せることが大事。
    if (b.side === 'own' || b.side === 'other') return b.side;

    const 名 = (b.name || '').toUpperCase();
    if (自社の名前.some((n) => 名.includes(n.toUpperCase()))) return 'own';

    const 印 = (b.tags || []).join(' ');
    // 「参考」も他社として扱う。
    // 参考ブランド集を入れたとき、印が「参考ブランド」だったため
    // どちらでもない扱いになり、自社と混ざって並んでいた。
    // 自分のブランドでない以上、他社側に置くのが正しい。
    if (印.includes('競合') || 印.includes('調査') || 印.includes('参考')) return 'other';

    return 'unknown';
}

/** 側を手で決める */
function ブランドの側を決める(id, 側) {
    let 一覧 = [];
    try {
        一覧 = JSON.parse(localStorage.getItem('brands') || '[]');
    } catch {
        return;
    }
    const b = 一覧.find((x) => String(x.id) === String(id));
    if (!b) return;

    b.side = 側;
    b.updatedAt = new Date().toISOString();
    localStorage.setItem('brands', JSON.stringify(一覧));
    renderBrandSplit();
}

/** いま選ばれている側 */
let 見ている側 = 'own';

function renderBrandSplit() {
    let 一覧 = [];
    try {
        一覧 = JSON.parse(localStorage.getItem('brands') || '[]');
    } catch {
        一覧 = [];
    }

    const 組 = { own: [], other: [], unknown: [] };
    一覧.forEach((b) => 組[どちらのブランドか(b)].push(b));

    // タブの数字を出す。どちらに何件あるか、開く前に分かるようにする。
    const 数を出す = (側, n) => {
        const b = document.querySelector(`[data-brand-side="${側}"] .side-count`);
        if (b) b.textContent = n ? String(n) : '';
    };
    数を出す('own', 組.own.length);
    数を出す('other', 組.other.length);
    数を出す('unknown', 組.unknown.length);

    // 未分類が無いときは、そのタブを出さない。
    // 空のタブがあると、押しても何もなくて戸惑うため。
    const 未タブ = document.querySelector('[data-brand-side="unknown"]');
    if (未タブ) 未タブ.hidden = 組.unknown.length === 0;

    document.querySelectorAll('[data-brand-side]').forEach((b) => {
        b.classList.toggle('active', b.dataset.brandSide === 見ている側);
    });

    const 箱 = document.getElementById('brand-split-list');
    if (!箱) return;

    const 出す = 組[見ている側] || [];
    箱.innerHTML = '';

    if (!出す.length) {
        const 文 = {
            own: '自分のブランドがまだありません。「ブランド追加」から登録できます。',
            other: '他社のブランドがまだありません。「競合ブランドを読み込む」で入ります。',
            unknown: 'どちらとも決めていないものはありません。',
        }[見ている側];
        箱.textContent = '';
        {
            const 枠 = document.createElement('div');
            枠.className = 'hint';
            枠.textContent = 文;
            箱.appendChild(枠);
        }
        return;
    }

    出す.forEach((b) => {
        const c = document.createElement('div');
        c.className = 'bsplit-card';

        const 上 = document.createElement('div');
        上.className = 'bsplit-head';

        const 名 = document.createElement('b');
        名.textContent = b.name || '（名前なし）';

        const 印 = document.createElement('span');
        印.className = 'bsplit-side side-' + どちらのブランドか(b);
        印.textContent = { own: '自社', other: '他社', unknown: '未分類' }[どちらのブランドか(b)];

        上.appendChild(名);
        上.appendChild(印);

        const 中 = document.createElement('div');
        中.className = 'bsplit-info';
        const 部品 = [];
        if (b.country) 部品.push(b.country);
        if (b.category) 部品.push(b.category);
        if (b.website) 部品.push(b.website.replace(/^https?:\/\//, '').split('/')[0]);
        中.textContent = 部品.join(' ／ ') || '—';

        c.appendChild(上);
        c.appendChild(中);

        if (b.description) {
            const 説 = document.createElement('p');
            説.className = 'bsplit-desc';
            説.textContent = b.description;
            c.appendChild(説);
        }

        // 側を付け替えられるようにする。
        // 見分けを間違えたときに、その場で直せることが大事。
        //
        // ただし「自社にする」は、他社と分かっているものには出さない。
        // よそのブランドを自分のものとして登録できてしまうと、
        // 在庫や売上の集計に他人のブランドが混ざる。
        // そこは間違えようがない方がよい。
        const いまの側 = どちらのブランドか(b);
        const 選べる側 = (いまの側 === 'other')
            ? [['他社にする', 'other']]              // 実質、何も出ない
            : [['自社にする', 'own'], ['他社にする', 'other']];

        // 詳細・編集・削除。
        //
        // 前は「これまでの一覧（写真つき）」という古い一覧にしかこの
        // 3つのボタンが無く、このタブ（自分のブランド／他社のブランド）
        // には自社・他社の切り替えリンクしか出ていなかった。
        // 古い一覧は既定で折りたたまれているため、探している本人には
        // ボタンが「無い」ように見えていた。
        // このカードの操作はこのカードの中で完結させる。
        const 本操作 = document.createElement('div');
        本操作.className = 'bsplit-actions';

        const 詳細btn = document.createElement('button');
        詳細btn.type = 'button';
        詳細btn.className = 'btn-link';
        詳細btn.textContent = '詳細';
        詳細btn.addEventListener('click', () => { if (typeof showBrandDetail === 'function') showBrandDetail(b.id); });
        本操作.appendChild(詳細btn);

        const 編集btn = document.createElement('button');
        編集btn.type = 'button';
        編集btn.className = 'btn-link';
        編集btn.textContent = '編集';
        編集btn.addEventListener('click', () => { if (typeof editBrand === 'function') editBrand(b.id); });
        本操作.appendChild(編集btn);

        const 削除btn = document.createElement('button');
        削除btn.type = 'button';
        削除btn.className = 'btn-link danger';
        削除btn.textContent = '削除';
        削除btn.addEventListener('click', () => { if (typeof deleteBrand === 'function') deleteBrand(b.id); });
        本操作.appendChild(削除btn);

        c.appendChild(本操作);

        const 操作 = document.createElement('div');
        操作.className = 'bsplit-actions bsplit-side-actions';
        選べる側.forEach(([文, 側]) => {
            if (いまの側 === 側) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-link';
            btn.textContent = 文;
            btn.addEventListener('click', () => ブランドの側を決める(b.id, 側));
            操作.appendChild(btn);
        });
        c.appendChild(操作);

        箱.appendChild(c);
    });
}

function initBrandSplit() {
    document.querySelectorAll('[data-brand-side]').forEach((b) => {
        b.addEventListener('click', () => {
            見ている側 = b.dataset.brandSide;
            renderBrandSplit();
        });
    });
    renderBrandSplit();
}

window.initBrandSplit = initBrandSplit;
window.renderBrandSplit = renderBrandSplit;
window.どちらのブランドか = どちらのブランドか;
window.ブランドの側を決める = ブランドの側を決める;
