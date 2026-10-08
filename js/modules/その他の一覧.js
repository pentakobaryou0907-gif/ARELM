/**
 * スマホの下の並びの「その他」
 *
 * 本人の要望（2026-10-08）:「UIとUXをもっとシンプルに」。
 * スマホの下の並びに8つのボタンが詰まり、字が小さく押し間違えやすかった。
 * よく使う5つだけを並べ、残り（ブランド・遠隔操作・作業・設定）は「その他」から開く。消さない。
 */

function その他の一覧を閉じる() {
    const 一覧 = document.getElementById('nav-more-sheet');
    const 押す所 = document.getElementById('bottom-nav-more');
    if (一覧) 一覧.hidden = true;
    if (押す所) 押す所.setAttribute('aria-expanded', 'false');
}

document.addEventListener('DOMContentLoaded', () => {
    const 一覧 = document.getElementById('nav-more-sheet');
    const 押す所 = document.getElementById('bottom-nav-more');
    if (!一覧 || !押す所) return;

    押す所.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const 開く = 一覧.hidden;
        一覧.hidden = !開く;
        押す所.setAttribute('aria-expanded', 開く ? 'true' : 'false');
    });

    一覧.addEventListener('click', (e) => {
        const ボタン = e.target.closest('[data-more-page]');
        if (!ボタン) return;
        const 頁 = ボタン.dataset.morePage;
        その他の一覧を閉じる();
        if (typeof window.areglmNavigate === 'function') window.areglmNavigate(頁);
        else if (typeof window.switchPage === 'function') window.switchPage(頁);
        押す所.classList.add('active');   // 並びに無い画面にいることを、「その他」の色で示す
    });

    // 外を押す・Escで閉じる。並びの別のボタンを押したら、「その他」の色を外す
    document.addEventListener('click', (e) => {
        if (!一覧.hidden && !e.target.closest('#nav-more-sheet, #bottom-nav-more')) その他の一覧を閉じる();
        if (e.target.closest('.bottom-nav-item[data-page], .nav-link[data-page]')) 押す所.classList.remove('active');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') その他の一覧を閉じる(); });
});
