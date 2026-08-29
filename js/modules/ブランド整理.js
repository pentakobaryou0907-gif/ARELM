/**
 * ブランドを分類で絞り、増え方を見る
 *
 * なぜこれが要るのか:
 *   参考ブランドは、これから増やしていくもの。
 *   36件のうちは目で追えるが、100件を超えたら追えなくなる。
 *
 *   増やしたときに困らない形にしておく。
 *     ・分類で絞れる
 *     ・自社と他社を分けて見られる
 *     ・いつ何件になったかが分かる
 *
 *   ここを後回しにすると、「増やしたけれど探せない」になり、
 *   結局使われなくなる。
 *
 * すべてこの端末の中だけで動きます。外部へは一切送りません。
 */

const ブランドの記録の鍵 = 'areglm_brand_growth';

function ブランドを読む() {
    try {
        const r = JSON.parse(localStorage.getItem('brands') || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

/* ---------- 絞り込み ---------- */

/** 分類の選択肢を、いま入っているものから作る */
function 分類の選択肢を作る() {
    const 選択 = document.getElementById('brand-filter-category');
    if (!選択) return;

    const いま = 選択.value;
    const 分類たち = [...new Set(ブランドを読む().map((b) => b.category).filter(Boolean))].sort();

    選択.innerHTML = '<option value="">すべての分類</option>';
    分類たち.forEach((c) => {
        const 数 = ブランドを読む().filter((b) => b.category === c).length;
        const o = document.createElement('option');
        o.value = c;
        o.textContent = `${c}（${数}）`;
        選択.appendChild(o);
    });
    選択.value = いま;
}

/**
 * 絞り込みを画面に反映する。
 *
 * 探し言葉・分類・自社他社の3つを、すべて満たすものだけ見せる。
 * どれか一つでも外れたら隠す。
 */
function ブランドを絞る() {
    const 言葉 = (document.getElementById('brand-search')?.value || '').trim().toLowerCase();
    const 分類 = document.getElementById('brand-filter-category')?.value || '';
    const 側 = document.getElementById('brand-filter-side')?.value || '';

    const 一覧 = ブランドを読む();
    const 枠 = document.getElementById('brand-list');
    if (!枠) return;

    let 見せた = 0;

    [...枠.children].forEach((札, i) => {
        const b = 一覧[i];
        if (!b) return;

        let 見せる = true;

        if (言葉) {
            const 的 = `${b.name || ''} ${b.description || ''} ${b['参考になる点'] || ''}`.toLowerCase();
            if (!的.includes(言葉)) 見せる = false;
        }
        if (分類 && b.category !== 分類) 見せる = false;
        if (側 && typeof どちらのブランドか === 'function' && どちらのブランドか(b) !== 側) 見せる = false;

        札.style.display = 見せる ? '' : 'none';
        if (見せる) 見せた += 1;
    });

    数を出す(見せた, 一覧.length);
}

function 数を出す(見せた, 全部) {
    let 出 = document.getElementById('brand-filter-count');
    if (!出) {
        出 = document.createElement('p');
        出.id = 'brand-filter-count';
        出.className = 'hint brand-count';
        document.getElementById('brand-list')?.before(出);
    }
    出.textContent = 見せた === 全部
        ? `${全部}件`
        : `${全部}件のうち ${見せた}件を表示中`;
}

/* ---------- 増え方の記録 ---------- */

/**
 * 今日の件数を書き留める。
 *
 * 一日一回でよい。何度も書くと、同じ日の行が並ぶだけになる。
 */
function 今日の件数を残す() {
    const 一覧 = ブランドを読む();
    const 日 = typeof 日付文字 === 'function'
        ? 日付文字(new Date())
        : new Date().toISOString().slice(0, 10);

    let 記録 = [];
    try { 記録 = JSON.parse(localStorage.getItem(ブランドの記録の鍵) || '[]'); } catch { 記録 = []; }

    const 分類ごと = {};
    一覧.forEach((b) => {
        const c = b.category || '未分類';
        分類ごと[c] = (分類ごと[c] || 0) + 1;
    });

    const 最後 = 記録[記録.length - 1];
    if (最後 && 最後.日 === 日) {
        最後.件数 = 一覧.length;
        最後.分類ごと = 分類ごと;
    } else {
        記録.push({ 日, 件数: 一覧.length, 分類ごと });
    }

    // 一年ぶん残せば十分
    localStorage.setItem(ブランドの記録の鍵, JSON.stringify(記録.slice(-365)));
    return 記録;
}

/** 増え方を文章にする */
function 増え方(){
    let 記録 = [];
    try { 記録 = JSON.parse(localStorage.getItem(ブランドの記録の鍵) || '[]'); } catch { 記録 = []; }
    if (記録.length < 2) return null;

    const 今 = 記録[記録.length - 1];
    const 前 = 記録[0];
    const 差 = 今.件数 - 前.件数;
    if (差 <= 0) return null;
    return `${前.日} の ${前.件数}件から、${差}件 増えました。`;
}

/* ---------- 画面 ---------- */

function renderブランド整理() {
    分類の選択肢を作る();
    今日の件数を残す();
    ブランドを絞る();

    const 箱 = document.getElementById('brand-growth');
    if (!箱) return;

    const 一覧 = ブランドを読む();
    箱.innerHTML = '';

    const 分類ごと = {};
    一覧.forEach((b) => {
        const c = b.category || '未分類';
        分類ごと[c] = (分類ごと[c] || 0) + 1;
    });

    const 並び = Object.entries(分類ごと).sort((a, b) => b[1] - a[1]);
    if (!並び.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'まだブランドが入っていません。「参考ブランドを読み込む」から始められます。';
        箱.appendChild(p);
        return;
    }

    const 帯 = document.createElement('div');
    帯.className = 'brand-bars';
    const 最大 = 並び[0][1];
    並び.forEach(([c, n]) => {
        const 行 = document.createElement('div');
        行.className = 'brand-bar-row';

        const ラベル = document.createElement('span');
        ラベル.textContent = c;

        const 溝 = document.createElement('span');
        溝.className = 'brand-bar-track';
        const 中 = document.createElement('span');
        中.className = 'brand-bar-fill';
        中.style.width = Math.round((n / 最大) * 100) + '%';
        溝.appendChild(中);

        const 数 = document.createElement('small');
        数.textContent = `${n}件`;

        行.appendChild(ラベル);
        行.appendChild(溝);
        行.appendChild(数);
        帯.appendChild(行);
    });
    箱.appendChild(帯);

    const 伸び = 増え方();
    if (伸び) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 伸び;
        箱.appendChild(p);
    }

    // 足りていない分類を知らせる。
    // 偏っていると、参考にならない方向へ寄る。
    const 薄い = ['ストリート', 'アパレル', 'スポーツ', 'アウトドア', 'ラグジュアリー', '古着・ヴィンテージ']
        .filter((c) => (分類ごと[c] || 0) < 3);
    if (薄い.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = `まだ少ない分類: ${薄い.join('、')}。`
            + '偏ったままだと、参考にする向きも偏ります。';
        箱.appendChild(p);
    }
}

function initブランド整理() {
    if (!document.getElementById('brand-filter-category')) return;

    ['brand-search', 'brand-filter-category', 'brand-filter-side'].forEach((id) => {
        const e = document.getElementById(id);
        if (!e) return;
        e.addEventListener('input', ブランドを絞る);
        e.addEventListener('change', ブランドを絞る);
    });

    // 読み込み・追加のあとに描き直す
    ['import-reference-brands-btn', 'import-competitor-brands-btn', 'refresh-brands-btn']
        .forEach((id) => {
            document.getElementById(id)?.addEventListener('click',
                () => setTimeout(renderブランド整理, 800));
        });

    renderブランド整理();
}

window.initブランド整理 = initブランド整理;
window.renderブランド整理 = renderブランド整理;
window.ブランドを絞る = ブランドを絞る;
