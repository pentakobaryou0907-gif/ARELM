/**
 * 欄をたたむ（長い画面を、見出しの一覧にする）
 *
 * 本人の要望（2026-10-08）:「UIを分かりやすくシンプルに」。
 * 測ったところ、設定ページは43の欄が開いたまま並び約2万px、ホームの設定タブは11の欄で約2万px
 * （スマホでは3万6千px）あった。上から下まで眺めないと、どこに何があるか分からない。
 *
 * やっていること:
 *   ・欄の場所は動かさず、中身だけをたたむ（見出しを押すと開く・もう一度押すとたたむ）
 *     以前の「畳む」（画面を整える.js）は欄を別の入れ物へ移す作りで、ホームのタブ分けと混ざるため、ここは移さない
 *   ・開いた欄は、この端末で覚える（スマホとパソコンで別々に）
 *   ・上に「探す」欄と「すべて開く／たたむ」を置く。探すと、当たった欄だけが開いて出る
 *   ・毎日使う画面（エージェント・SNS・開発）は、上の2つを開けておく
 *   ・消さない。どの欄も、見出しから開けば元のまま使える
 */

const 開いた欄の鍵 = 'areglm_open_sections';   // 端末ごと（同期しない）

const たたむ画面 = [
    { 頁: 'settings', 開けておく: 0 },
    { 頁: 'dashboard', タブ: 'config', 開けておく: 0 },
    // 今日は、毎日見るものだけを開けておく。下の並びや別ページと重なるものは、一番下へ下げる
    { 頁: 'dashboard', タブ: 'today', 開けておく題: ['作業の状況', 'タスク'], 下へ: ['機能をひらく', '遠隔操作とタスク', 'クイック操作'] },
    { 頁: 'dashboard', タブ: 'ai', 開けておく: 1 },
    { 頁: 'dashboard', タブ: 'note', 開けておく: 1 },
    { 頁: 'dashboard', タブ: 'plan', 開けておく: 1 },
    { 頁: 'mainai', 開けておく: 2 },
    { 頁: 'sns', 開けておく: 2 },
    { 頁: 'studio', 開けておく: 2 },
];

function 開いた欄を読む() {
    try { return JSON.parse(localStorage.getItem(開いた欄の鍵) || '{}') || {}; } catch { return {}; }
}

function 開いた欄を覚える(鍵, 開いている) {
    try {
        const x = 開いた欄を読む();
        x[鍵] = 開いている;
        localStorage.setItem(開いた欄の鍵, JSON.stringify(x));
    } catch { /* 覚えられなくても、開け閉めはできる */ }
}

/** 欄の見出し（たたんでも見えたままにする部分） */
function 欄の見出し(節) {
    return 節.querySelector(':scope > h3, :scope > h2, :scope > .panel-header-row');
}

function 欄の題(節) {
    const 頭 = 欄の見出し(節);
    const h = 頭 && (頭.matches('h2, h3') ? 頭 : 頭.querySelector('h2, h3'));
    return h ? h.textContent.replace(/[▸▾]/g, '').replace(/\s+/g, ' ').trim() : '';
}

/** その画面で、たたむ対象の欄（入れ子の欄・details は除く） */
function たたむ欄たち(設定) {
    const 頁 = document.getElementById(設定.頁 + '-page');
    if (!頁) return [];
    return [...頁.querySelectorAll('section.panel-card, div.panel-card')]
        .filter((節) => !節.parentElement.closest('.panel-card'))
        .filter((節) => !設定.タブ || 節.dataset.homeGroup === 設定.タブ)
        .filter((節) => 欄の見出し(節));
}

function 欄を開け閉めする(節, 開く, 覚える = true) {
    節.classList.toggle('sec-folded', !開く);
    const 頭 = 節.querySelector(':scope > .sec-head');
    const 印 = 節.querySelector(':scope > .sec-head .sec-chevron');
    if (印) 印.textContent = 開く ? '▾' : '▸';
    if (頭) 頭.setAttribute('aria-expanded', 開く ? 'true' : 'false');
    if (覚える && 節.dataset.欄の鍵) 開いた欄を覚える(節.dataset.欄の鍵, 開く);
    // 開いたときに、見えないあいだ描かれなかった中身を描き直す（画面を整える.js の仕組みを使う）
    if (開く && typeof 中身を描き直す === 'function') {
        try { 中身を描き直す(節); } catch { /* 一つ描けなくても、開くのは止めない */ }
    }
}

/** 一つの画面の欄を、たためる形にする（何度呼んでも同じ結果） */
function 画面の欄をたためるようにする(設定) {
    const 記憶 = 開いた欄を読む();
    // 他の場所と重なる欄は、同じ入れ物の一番下へ下げる（消さない。開けば使える）
    (設定.下へ || []).forEach((名) => {
        const 節 = たたむ欄たち(設定).find((x) => 欄の題(x).includes(名));
        if (節 && 節.dataset.下げた !== 'はい') { 節.dataset.下げた = 'はい'; 節.parentNode.appendChild(節); }
    });
    const 欄たち = たたむ欄たち(設定);
    欄たち.forEach((節, i) => {
        if (節.dataset.たためる === 'はい') return;
        const 頭 = 欄の見出し(節);
        const 題 = 欄の題(節);
        if (!題) return;
        節.dataset.たためる = 'はい';
        節.dataset.欄の鍵 = `${設定.頁}:${節.id || 題}`;
        節.classList.add('sec-foldable');
        頭.classList.add('sec-head');
        const 押す所 = 頭.matches('h2, h3') ? 頭 : 頭.querySelector('h2, h3');
        押す所.classList.add('sec-toggle');
        押す所.setAttribute('role', 'button');
        押す所.tabIndex = 0;
        const 印 = document.createElement('span');
        印.className = 'sec-chevron';
        印.setAttribute('aria-hidden', 'true');
        押す所.appendChild(印);
        const 切り替える = () => 欄を開け閉めする(節, 節.classList.contains('sec-folded'));
        押す所.addEventListener('click', 切り替える);
        押す所.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); 切り替える(); } });
        const 覚えている = 記憶[節.dataset.欄の鍵];
        const 既定で開く = 設定.開けておく題 ? 設定.開けておく題.some((名) => 題.includes(名)) : i < (設定.開けておく || 0);
        const 開く = 覚えている != null ? 覚えている : 既定で開く;
        欄を開け閉めする(節, 開く, false);
    });
    if (欄たち.length >= 4) 道具の帯を置く(設定, 欄たち);
}

/** 画面の上に「探す」と「すべて開く／たたむ」を置く */
function 道具の帯を置く(設定, 欄たち) {
    const 印 = `fold-tools-${設定.頁}${設定.タブ ? '-' + 設定.タブ : ''}`;
    if (document.getElementById(印)) return;
    const 最初 = 欄たち[0];
    const 帯 = document.createElement('div');
    帯.id = 印;
    帯.className = 'fold-tools';
    if (設定.タブ) {
        帯.dataset.homeGroup = 設定.タブ;   // ホームのタブ分けに乗る（そのタブのときだけ出る）
        帯.hidden = !document.querySelector(`.home-tab.active[data-home-tab="${設定.タブ}"]`);
    }
    const 探す = document.createElement('input');
    探す.type = 'search';
    探す.placeholder = '探す（例: 合言葉）';
    探す.setAttribute('aria-label', 'この画面の欄を探す');
    const 開く = document.createElement('button');
    開く.type = 'button';
    開く.className = 'btn btn-sm btn-secondary';
    開く.textContent = 'すべて開く';
    const 閉じる = document.createElement('button');
    閉じる.type = 'button';
    閉じる.className = 'btn btn-sm btn-secondary';
    閉じる.textContent = 'すべてたたむ';
    const 結果 = document.createElement('span');
    結果.className = 'hint';
    帯.append(探す, 開く, 閉じる, 結果);
    最初.parentNode.insertBefore(帯, 最初);

    const 今の欄 = () => たたむ欄たち(設定);
    開く.addEventListener('click', () => 今の欄().forEach((節) => 欄を開け閉めする(節, true)));
    閉じる.addEventListener('click', () => 今の欄().forEach((節) => 欄を開け閉めする(節, false)));
    探す.addEventListener('input', () => {
        const 語 = 探す.value.trim().toLowerCase();
        let 当たり = 0;
        今の欄().forEach((節) => {
            if (!語) {
                節.style.removeProperty('display');
                const 記憶 = 開いた欄を読む()[節.dataset.欄の鍵];
                欄を開け閉めする(節, 記憶 != null ? 記憶 : false, false);
                return;
            }
            const 当たる = (節.textContent || '').toLowerCase().includes(語);
            節.style.display = 当たる ? '' : 'none';
            if (当たる) { 当たり++; 欄を開け閉めする(節, true, false); }
        });
        結果.textContent = 語 ? `${当たり}件` : '';
    });
}

function 欄を全部たためるようにする() {
    たたむ画面.forEach((設定) => {
        try { 画面の欄をたためるようにする(設定); } catch (e) { console.warn('[欄をたたむ]', 設定.頁, e.message); }
    });
}

// 他の部品が欄を描き終えてから整える。画面やタブを切り替えたときにも（新しく足された欄のため）
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(欄を全部たためるようにする, 1200);
    document.addEventListener('click', (e) => {
        if (e.target.closest('.nav-link, .bottom-nav-item, .home-tab, [data-page]')) setTimeout(欄を全部たためるようにする, 60);
    });
});

window.欄を全部たためるようにする = 欄を全部たためるようにする;
