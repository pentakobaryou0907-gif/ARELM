/**
 * ページ内目次（UI/UX指摘 1-1 対応）
 *
 * 在庫・開発など、縦に長いページで「今どこにいるか分からない」
 * 「目的の節まで飛びたい」という指摘への対応。
 *
 * ページごとに個別実装せず、今アクティブな .page の中から見出し
 * （h2/h3）を都度スキャンして一覧を作る、汎用の仕組みにする。
 * hub-tabs/home-tabs のように一部だけ隠す作りのページでも、
 * 実際に画面へ見えている見出しだけを拾う（offsetParent で判定）。
 */

const ページ内目次_ボタンID = 'page-toc-btn';
const ページ内目次_ポップアップID = 'page-toc-popup';

function 目次用の見出しを集める() {
    const page = document.querySelector('.page.active');
    if (!page) return [];
    return Array.from(page.querySelectorAll('h2, h3')).filter(
        (el) => el.offsetParent !== null && el.textContent.trim()
    );
}

function 目次用に見出しへIDを振る(el, idx) {
    if (el.id) return el.id;
    const 元 = el.textContent
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    const id = `toc-${元 || 'h'}-${idx}`;
    el.id = id;
    return id;
}

function ページ内目次を閉じる() {
    document.getElementById(ページ内目次_ポップアップID)?.remove();
    document.removeEventListener('click', 目次の外側クリックで閉じる);
}

function 目次の外側クリックで閉じる(e) {
    const popup = document.getElementById(ページ内目次_ポップアップID);
    if (!popup) return;
    if (popup.contains(e.target) || e.target.closest(`#${ページ内目次_ボタンID}`)) return;
    ページ内目次を閉じる();
}

function ページ内目次を開閉する() {
    if (document.getElementById(ページ内目次_ポップアップID)) {
        ページ内目次を閉じる();
        return;
    }

    const list = 目次用の見出しを集める();
    const popup = document.createElement('div');
    popup.id = ページ内目次_ポップアップID;
    popup.className = 'page-toc-popup';

    if (!list.length) {
        popup.innerHTML = '<p class="page-toc-empty">この画面には目次に出せる見出しがありません</p>';
    } else {
        popup.innerHTML = list
            .map((el, i) => {
                const id = 目次用に見出しへIDを振る(el, i);
                const 字下げ = el.tagName === 'H3' ? '　' : '';
                const 文字 = AReGLM_SECURITY.sanitizeHtml(el.textContent.trim());
                return `<button type="button" class="page-toc-item" data-toc-target="${id}">${字下げ}${文字}</button>`;
            })
            .join('');
    }

    document.body.appendChild(popup);

    popup.querySelectorAll('[data-toc-target]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.tocTarget);
            ページ内目次を閉じる();
            if (!target) return;
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // どこへ飛んだか、はっきり分かるように一瞬光らせる
            // （home-tabs.js の home-group-flash と同じ仕組みを流用）。
            target.classList.remove('home-group-flash');
            void target.offsetWidth;
            target.classList.add('home-group-flash');
        });
    });

    // 少し遅らせて外側クリック監視を付ける（開いた瞬間のクリックで
    // 即座に閉じてしまわないように）。
    setTimeout(() => document.addEventListener('click', 目次の外側クリックで閉じる), 0);
}

function initページ内目次() {
    const btn = document.getElementById(ページ内目次_ボタンID);
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ページ内目次を開閉する();
    });
}

window.initページ内目次 = initページ内目次;
