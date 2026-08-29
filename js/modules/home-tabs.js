/**
 * ホームのタブ分け
 *
 * ホームに機能が増えすぎて、縦に長く並ぶと目的のものを探しにくい。
 * 目的ごとにまとめ、タブで切り替えられるようにする。
 *
 *   きょう   … 今日やること・お知らせ・カレンダー・タスク
 *   AI       … エージェントへの指示・呼びかけ・学習状況
 *   きろく   … メモ・体調
 *   けいかく … 目標・ブランドマニュアル
 *   せってい … API・活動履歴・ツールの馴染み
 *
 * 開いていたタブは覚えておき、次に来たときも同じ場所から始められるようにする。
 */

const HOME_TAB_KEY = 'areglm_home_tab';

function initHomeTabs() {
    const tabs = document.querySelectorAll('.home-tab');
    if (!tabs.length) return;

    tabs.forEach((btn) => {
        btn.addEventListener('click', () => switchHomeTab(btn.dataset.homeTab));
    });

    // 前に開いていたタブから始める
    switchHomeTab(localStorage.getItem(HOME_TAB_KEY) || 'today');
}

function switchHomeTab(group) {
    if (!group) return;

    document.querySelectorAll('.home-tab').forEach((b) => {
        b.classList.toggle('active', b.dataset.homeTab === group);
    });

    document.querySelectorAll('#dashboard-page [data-home-group]').forEach((sec) => {
        sec.hidden = sec.dataset.homeGroup !== group;
    });

    // 切り替わったことが、はっきり分かるようにする。
    //
    // 「アンカースクロールのようで、押しても動いた様子が見えない」
    // という指摘があった。中身は正しく切り替わっているが、
    // 見た目の変化が弱く、反応していないように見えていた。
    // 表示された節を、一瞬だけ光らせる。
    document.querySelectorAll(`#dashboard-page [data-home-group="${group}"]`).forEach((sec) => {
        sec.classList.remove('home-group-flash');
        // 同じクラスを連続で付けても再生されないため、一度剥がしてから付け直す。
        void sec.offsetWidth;
        sec.classList.add('home-group-flash');
    });

    localStorage.setItem(HOME_TAB_KEY, group);

    // 切り替えた先の中身を最新にする
    if (group === 'today' && typeof renderCalendar === 'function') renderCalendar();
    if (group === 'note' && typeof renderHealth === 'function') renderHealth();
    if (group === 'ai' && typeof renderLearningStatus === 'function') renderLearningStatus();
    if (group === 'config' && typeof renderPersonalizePanel === 'function') renderPersonalizePanel();

    // 上に戻して、切り替えた内容が最初から見えるようにする
    document.getElementById('dashboard-page')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** 各タブに未処理があるかを示す（見なくても気づけるように） */
function renderHomeTabBadges() {
    const today = 今日();
    const pick = (k) => {
        try {
            return JSON.parse(localStorage.getItem(k) || '[]');
        } catch {
            return [];
        }
    };

    const tasks = pick('areglm_tasks').filter((t) => !t.done);
    const overdue = tasks.filter((t) => t.due && t.due < today).length;
    const products = pick('products');
    const low = products.filter((p) => (p.quantity || 0) <= (p.reorderLevel || 5)).length;

    setTabBadge('today', overdue + low);

    // 体調を今日まだ記録していなければ印を付ける
    const health = pick('areglm_health');
    const recordedToday = health.some((h) => h.date === today);
    setTabBadge('note', recordedToday ? 0 : 0); // 数字は出さず、印だけにする
    const noteTab = document.querySelector('.home-tab[data-home-tab="note"]');
    noteTab?.classList.toggle('has-dot', !recordedToday);
}

function setTabBadge(group, count) {
    const tab = document.querySelector(`.home-tab[data-home-tab="${group}"]`);
    if (!tab) return;

    let badge = tab.querySelector('.tab-badge');
    if (!count) {
        badge?.remove();
        return;
    }
    if (!badge) {
        badge = document.createElement('em');
        badge.className = 'tab-badge';
        tab.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
}

window.initHomeTabs = initHomeTabs;
window.switchHomeTab = switchHomeTab;
window.renderHomeTabBadges = renderHomeTabBadges;
