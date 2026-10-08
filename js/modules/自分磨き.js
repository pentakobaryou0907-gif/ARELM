/**
 * 自分磨き（ホームの「自分」タブ）
 *
 * 本人の要望（2026-10-08）: 顔・筋トレ・身長・知識・頭・性格、それとモチベーションを、
 * 一か所で見直せるようにする。
 *
 * やっていること:
 *   ・項目ごとに「目標」を決めて、毎日の取り組みを一行ずつ残す（数値は任意）
 *   ・直近7日に何回取り組んだか、続いている日数、最後の記録を出す
 *   ・モチベーションは1〜5で残し、7日の平均と、前の7日からの上下を出す
 *
 * 扱い方:
 *   ・医療の判断はしない（気づきのための記録）
 *   ・とても個人的な情報。他の端末との同期でGitHubの倉庫に置くときは、端末とMacの側で暗号化した形でだけ置く
 *     （GitHubからは中身が読めない）
 *   ・消さない。直したい記録は、新しい記録を足して上書きせずに残す
 */

const 自分磨きの鍵 = 'areglm_self_growth';

const 自分磨きの項目 = [
    { 名: '顔', 絵: '🙂', 例: 'スキンケア・睡眠・表情の練習', 数値: '' },
    { 名: '筋トレ', 絵: '💪', 例: '種目・回数・重さ（体重もここに）', 数値: 'kg・回' },
    { 名: '身長', 絵: '📏', 例: '姿勢・ストレッチ・測った身長', 数値: 'cm' },
    { 名: '知識・頭', 絵: '📚', 例: '学んだこと・読んだ本・勉強した時間', 数値: '分' },
    { 名: '性格', 絵: '🌱', 例: '意識したこと・うまくいったこと・振り返り', 数値: '' },
    { 名: 'モチベーション', 絵: '🔥', 例: '1〜5で、今日の気持ちの強さ', 数値: '1〜5' },
];

function 自分磨きを読む() {
    try {
        const x = JSON.parse(localStorage.getItem(自分磨きの鍵) || 'null');
        return x && typeof x === 'object' ? { 目標: x.目標 || {}, 記録: Array.isArray(x.記録) ? x.記録 : [] } : { 目標: {}, 記録: [] };
    } catch {
        return { 目標: {}, 記録: [] };
    }
}

function 自分磨きを書く(x) {
    localStorage.setItem(自分磨きの鍵, JSON.stringify(x));
}

function 自分磨きの日付(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 直近n日（今日を含む）の日付の集まり */
function 自分磨きの直近(n, 基準 = new Date()) {
    const 日 = new Set();
    for (let i = 0; i < n; i++) {
        const d = new Date(基準);
        d.setDate(d.getDate() - i);
        日.add(自分磨きの日付(d));
    }
    return 日;
}

/** 今日（または昨日）から、途切れずに取り組んだ日数 */
function 自分磨きの連続(記録, 項目, 基準 = new Date()) {
    const 日 = new Set(記録.filter((r) => r.項目 === 項目).map((r) => r.日));
    let 数 = 0;
    const d = new Date(基準);
    if (!日.has(自分磨きの日付(d))) d.setDate(d.getDate() - 1);   // 今日まだでも、昨日まで続いていれば数える
    while (日.has(自分磨きの日付(d))) {
        数++;
        d.setDate(d.getDate() - 1);
    }
    return 数;
}

/** 項目ごとのまとめ（画面と試験の両方で使う） */
function 自分磨きをまとめる(x, 基準 = new Date()) {
    const 七日 = 自分磨きの直近(7, 基準);
    const 前の七日 = new Set([...自分磨きの直近(14, 基準)].filter((d) => !七日.has(d)));
    return 自分磨きの項目.map((項) => {
        const 自分の = x.記録.filter((r) => r.項目 === 項.名);
        const 七日分 = 自分の.filter((r) => 七日.has(r.日));
        const まとめ = {
            項目: 項.名,
            目標: x.目標[項.名] || '',
            七日の回数: new Set(七日分.map((r) => r.日)).size,
            連続: 自分磨きの連続(x.記録, 項.名, 基準),
            最後: 自分の.length ? 自分の[自分の.length - 1] : null,
        };
        if (項.名 === 'モチベーション') {
            const 平均 = (列) => {
                const 数 = 列.map((r) => Number(r.数値)).filter((v) => v >= 1 && v <= 5);
                return 数.length ? Math.round((数.reduce((a, b) => a + b, 0) / 数.length) * 10) / 10 : null;
            };
            まとめ.平均 = 平均(七日分);
            まとめ.前の平均 = 平均(自分の.filter((r) => 前の七日.has(r.日)));
        }
        return まとめ;
    });
}

function 自分磨きの部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function render自分磨き() {
    const 箱 = document.getElementById('self-growth-panel');
    if (!箱) return;
    const x = 自分磨きを読む();
    const まとめ = 自分磨きをまとめる(x);
    箱.textContent = '';

    const 並び = 自分磨きの部品('div');
    並び.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px';

    自分磨きの項目.forEach((項, i) => {
        const ま = まとめ[i];
        const 札 = 自分磨きの部品('div', null, 'panel-card');
        札.style.margin = '0';
        札.append(自分磨きの部品('h4', `${項.絵} ${項.名}`));

        // 目標（いつでも書き直せる。前の目標は記録に残す）
        const 目標欄 = document.createElement('input');
        目標欄.type = 'text';
        目標欄.placeholder = '目標（例: ' + 項.例 + '）';
        目標欄.value = ま.目標;
        目標欄.style.width = '100%';
        目標欄.addEventListener('change', () => {
            const y = 自分磨きを読む();
            const 前 = y.目標[項.名] || '';
            if (前 === 目標欄.value.trim()) return;
            y.目標[項.名] = 目標欄.value.trim();
            if (前) y.記録.push({ 日: 自分磨きの日付(), 項目: 項.名, メモ: `（前の目標: ${前}）`, 目標の変更: true });
            自分磨きを書く(y);
            showNotification(`${項.名}の目標を決めました`, 'success');
        });
        札.append(目標欄);

        const 様子 = [
            `直近7日: ${ま.七日の回数}日`,
            ま.連続 ? `${ま.連続}日つづいています` : '',
            ま.平均 != null ? `平均 ${ま.平均}${ま.前の平均 != null ? (ま.平均 > ま.前の平均 ? '（上がっています）' : ま.平均 < ま.前の平均 ? '（下がっています）' : '（変わらず）') : ''}` : '',
        ].filter(Boolean).join('　');
        札.append(自分磨きの部品('p', 様子, 'hint'));
        if (ま.最後 && !ま.最後.目標の変更) {
            札.append(自分磨きの部品('p', `最後: ${ま.最後.日} ${ま.最後.メモ || ''}${ま.最後.数値 ? `（${ま.最後.数値}${項.数値 && 項.名 !== 'モチベーション' ? ' ' + 項.数値 : ''}）` : ''}`, 'hint'));
        }

        // 今日の取り組み
        const 形 = document.createElement('form');
        形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
        const メモ = document.createElement('input');
        メモ.type = 'text';
        メモ.placeholder = '今日やったこと';
        メモ.style.flex = '1 1 140px';
        let 数値 = null;
        if (項.数値) {
            数値 = document.createElement('input');
            数値.type = 'number';
            数値.step = 'any';
            if (項.名 === 'モチベーション') { 数値.min = '1'; 数値.max = '5'; }
            数値.placeholder = 項.数値;
            数値.style.width = '80px';
        }
        const 足す = 自分磨きの部品('button', '残す', 'btn btn-sm btn-primary');
        足す.type = 'submit';
        形.append(メモ);
        if (数値) 形.append(数値);
        形.append(足す);
        形.addEventListener('submit', (e) => {
            e.preventDefault();
            const 文 = メモ.value.trim();
            const 値 = 数値 && 数値.value !== '' ? Number(数値.value) : null;
            if (!文 && 値 == null) return;
            if (項.名 === 'モチベーション' && 値 != null && !(値 >= 1 && 値 <= 5)) {
                showNotification('モチベーションは1〜5で入れてください', 'error');
                return;
            }
            const y = 自分磨きを読む();
            y.記録.push({ 日: 自分磨きの日付(), 項目: 項.名, メモ: 文, 数値: 値 });
            自分磨きを書く(y);
            render自分磨き();
        });
        札.append(形);
        並び.append(札);
    });
    箱.append(並び);

    // 振り返り: いちばん続いている項目と、手が止まっている項目
    const 止まっている = まとめ.filter((m) => m.七日の回数 === 0).map((m) => m.項目);
    const 一番 = [...まとめ].sort((a, b) => b.連続 - a.連続)[0];
    const 振り返り = [];
    if (一番 && 一番.連続 >= 2) 振り返り.push(`「${一番.項目}」が${一番.連続}日つづいています。`);
    if (止まっている.length && 止まっている.length < 自分磨きの項目.length) 振り返り.push(`この7日、「${止まっている.join('」「')}」はまだです。小さく一つだけでも。`);
    if (!x.記録.length) 振り返り.push('まずは目標を一つだけ決めて、今日やったことを一行残してみてください。');
    if (振り返り.length) 箱.append(自分磨きの部品('p', 振り返り.join(' '), 'status-banner ok'));
}

window.render自分磨き = render自分磨き;
window.自分磨きをまとめる = 自分磨きをまとめる;
