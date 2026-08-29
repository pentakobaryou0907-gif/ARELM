/**
 * 統計分析の画面
 *
 * 在庫・売上のデータか、手で入れた数字を対象に、
 * 記述統計・ヒストグラム・相関・推定・検定・回帰を出す。
 *
 * 画面を作るうえで決めていること:
 *
 *   ・<b>数字だけを並べない。</b>
 *     p値や決定係数を出しただけでは、どう読めばよいか分からない。
 *     「何が言えて、何は言えないか」を必ず添える。
 *
 *   ・<b>足りないときは、止める。</b>
 *     3件のデータで回帰を引いても意味がない。
 *     出せない理由を書いて、そこで止める。
 *
 * すべてこの端末の中だけで動きます。外部へは一切送りません。
 */

const 手法 = () => window.AReGLM_統計手法;

/* ==========================================================
   データの取り出し
   ========================================================== */

/** 選べるデータのもと */
function データのもと() {
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const sales = JSON.parse(localStorage.getItem('sales') || '[]');

    // 月ごとの売上にまとめる
    const 月別 = {};
    sales.forEach((s) => {
        const 日 = s.date || s.createdAt || s.at;
        if (!日) return;
        const 月 = String(日).slice(0, 7);
        月別[月] = (月別[月] || 0) + (Number(s.total) || 0);
    });
    const 月の並び = Object.keys(月別).sort();

    return {
        商品の価格: { 値: products.map((p) => Number(p.price) || 0), 名: '商品の価格' },
        商品の在庫数: { 値: products.map((p) => Number(p.quantity) || 0), 名: '商品の在庫数' },
        月別の売上: { 値: 月の並び.map((m) => 月別[m]), 名: '月別の売上', ラベル: 月の並び },
        売上の明細: { 値: sales.map((s) => Number(s.total) || 0), 名: '売上の明細（1件ずつ）' },
    };
}

/** 選択欄と手入力から、実際の数字の並びを取る */
function 選ばれた数字(選択id, 手入力id) {
    const 選 = document.getElementById(選択id)?.value || '';

    if (選 === '手入力') {
        const 文 = document.getElementById(手入力id)?.value || '';
        return {
            値: 文.split(/[\s,、\n]+/).map(Number).filter((v) => Number.isFinite(v)),
            名: '手で入れた数字',
        };
    }

    const もと = データのもと()[選];
    return もと ? { 値: もと.値, 名: もと.名 } : { 値: [], 名: '' };
}

/** データの選択欄を作る */
function 選択欄を作る(id, 手入力も = true) {
    const 選 = document.getElementById(id);
    if (!選) return;
    選.innerHTML = '';
    const もと = データのもと();
    Object.entries(もと).forEach(([鍵, v]) => {
        const o = document.createElement('option');
        o.value = 鍵;
        o.textContent = `${v.名}（${v.値.length}件）`;
        選.appendChild(o);
    });
    if (手入力も) {
        const o = document.createElement('option');
        o.value = '手入力';
        o.textContent = '手で数字を入れる';
        選.appendChild(o);
    }
}

/* ==========================================================
   出す道具
   ========================================================== */

const 数字 = (n, 桁 = 3) => (n === null || n === undefined || !Number.isFinite(n))
    ? '—' : Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 桁 });

/** 名前と値の並びを、表として出す */
function 一覧を作る(組たち) {
    const dl = document.createElement('div');
    dl.className = 'cost-result';
    組たち.forEach(([名, 値, 強い]) => {
        const d = document.createElement('div');
        d.className = 'cost-row' + (強い ? ' strong' : '');
        const n = document.createElement('span');
        n.className = 'cost-name';
        n.textContent = 名;
        const v = document.createElement('span');
        v.className = 'cost-val';
        v.textContent = 値;
        d.appendChild(n);
        d.appendChild(v);
        dl.appendChild(d);
    });
    return dl;
}

/** 断り書き */
function 断りを作る(文, 種類 = 'notice-strict') {
    const p = document.createElement('p');
    p.className = 種類;
    p.textContent = 文;
    return p;
}

/** 出せなかった理由を出す */
function 出せない(箱, 訳) {
    箱.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'guard-off';
    p.textContent = 訳;
    箱.appendChild(p);
}

/* ==========================================================
   ① 記述統計とヒストグラム
   ========================================================== */

function render記述統計() {
    const 箱 = document.getElementById('stat-desc-result');
    if (!箱) return;

    const データ = 選ばれた数字('stat-desc-source', 'stat-desc-manual');
    const 結果 = 手法().記述統計(データ.値, true);
    if (!結果.ok) { 出せない(箱, 結果.訳); return; }

    箱.innerHTML = '';

    const 見出し = document.createElement('h4');
    見出し.className = 'rule-head';
    見出し.textContent = `${データ.名}（${結果.n}件）`;
    箱.appendChild(見出し);

    箱.appendChild(一覧を作る([
        ['件数', 数字(結果.n, 0)],
        ['合計', 数字(結果.合計)],
        ['平均', 数字(結果.平均), true],
        ['中央値', 数字(結果.中央値)],
        ['最小 〜 最大', `${数字(結果.最小)} 〜 ${数字(結果.最大)}`],
        ['範囲', 数字(結果.範囲)],
        [結果.分散の種類, 数字(結果.分散), true],
        ['標準偏差', 数字(結果.標準偏差), true],
        ['標準誤差', 数字(結果.標準誤差)],
        ['歪度（0で左右対称）', 数字(結果.歪度)],
        ['尖度（0で正規分布並み）', 数字(結果.尖度)],
    ]));

    // ヒストグラム
    const h = 手法().ヒストグラム(データ.値);
    if (h.ok) {
        const 見 = document.createElement('h4');
        見.className = 'rule-head';
        見.textContent = `ヒストグラム（階級数 ${h.階級数}・階級幅 ${数字(h.階級幅)}）`;
        箱.appendChild(見);

        const 最大度数 = Math.max(...h.階級たち.map((c) => c.度数)) || 1;
        const 図 = document.createElement('div');
        図.className = 'hist-wrap';

        h.階級たち.forEach((c) => {
            const 行 = document.createElement('div');
            行.className = 'hist-row';

            const 札 = document.createElement('span');
            札.className = 'hist-label';
            札.textContent = `${数字(c.下, 1)}〜${数字(c.上, 1)}`;

            const 溝 = document.createElement('span');
            溝.className = 'hist-bar-wrap';
            const 棒 = document.createElement('span');
            棒.className = 'hist-bar';
            棒.style.width = `${(c.度数 / 最大度数) * 100}%`;
            溝.appendChild(棒);

            const 数 = document.createElement('span');
            数.className = 'hist-count';
            数.textContent = `${c.度数}件 (${(c.相対度数 * 100).toFixed(1)}%)`;

            行.appendChild(札);
            行.appendChild(溝);
            行.appendChild(数);
            図.appendChild(行);
        });
        箱.appendChild(図);

        箱.appendChild(断りを作る(
            '階級数はスタージェスの公式（1 + log₂n）で決めています。'
            + '階級の切り方を変えると、山の見え方も変わります。', 'hint'));
    }
}

/* ==========================================================
   ② 相関と回帰
   ========================================================== */

function render関係() {
    const 箱 = document.getElementById('stat-rel-result');
    if (!箱) return;

    const X = 選ばれた数字('stat-rel-x', 'stat-rel-x-manual');
    const Y = 選ばれた数字('stat-rel-y', 'stat-rel-y-manual');

    const r = 手法().相関(X.値, Y.値);
    if (!r.ok) { 出せない(箱, r.訳); return; }

    箱.innerHTML = '';

    const 見出し = document.createElement('h4');
    見出し.className = 'rule-head';
    見出し.textContent = `${X.名} と ${Y.名} の関係（そろった組 ${r.n}件）`;
    箱.appendChild(見出し);

    箱.appendChild(一覧を作る([
        ['相関係数 r', `${数字(r.r, 4)}（${r.強さ}）`, true],
        ['決定係数 r²', `${数字(r.決定係数, 4)}（${(r.決定係数 * 100).toFixed(1)}%）`],
        ['t値', 数字(r.t, 4)],
        ['自由度', 数字(r.自由度, 0)],
        ['p値', 数字(r.p値, 4), true],
        ['無相関といえるか', r.有意か ? '無相関とはいえない（関係がありそう）' : '無相関を否定できない'],
    ]));
    箱.appendChild(断りを作る(r.断り));

    // 回帰
    const g = 手法().単回帰(X.値, Y.値);
    if (!g.ok) return;

    const 見 = document.createElement('h4');
    見.className = 'rule-head';
    見.textContent = '回帰分析（xでyを説明する）';
    箱.appendChild(見);

    箱.appendChild(一覧を作る([
        ['回帰式', g.式, true],
        ['傾き', 数字(g.傾き, 4)],
        ['切片', 数字(g.切片, 4)],
        ['決定係数 R²', `${数字(g.決定係数, 4)}（${(g.決定係数 * 100).toFixed(1)}%を説明）`, true],
        ['傾きの標準誤差', 数字(g.傾きの標準誤差, 4)],
        ['傾きの t値', 数字(g.傾きのt, 4)],
        ['傾きの p値', 数字(g.傾きのp値, 4), true],
        ['F値', 数字(g.F, 4)],
        ['推定の標準誤差', 数字(g.標準誤差, 4)],
    ]));

    const 読み = document.createElement('p');
    読み.className = g.傾きは有意か ? 'guard-on' : 'guard-off';
    読み.textContent = g.読み方;
    箱.appendChild(読み);
    箱.appendChild(断りを作る(g.断り));
}

/* ==========================================================
   ③ 区間推定
   ========================================================== */

function render推定() {
    const 箱 = document.getElementById('stat-est-result');
    if (!箱) return;

    const 種類 = document.getElementById('stat-est-kind')?.value || '母平均';
    const 信頼度 = Number(document.getElementById('stat-est-level')?.value || 0.95);

    箱.innerHTML = '';

    if (種類 === '母比率') {
        const 成功 = Number(document.getElementById('stat-est-success')?.value);
        const 全体 = Number(document.getElementById('stat-est-total')?.value);
        const r = 手法().母比率の推定(成功, 全体, 信頼度);
        if (!r.ok) { 出せない(箱, r.訳); return; }

        箱.appendChild(一覧を作る([
            ['標本の比率', `${(r.比率 * 100).toFixed(2)}%（${r.成功数}/${r.n}）`, true],
            ['z値', 数字(r.z, 4)],
            [`${Math.round(信頼度 * 100)}% 信頼区間`,
                `${(r.下限 * 100).toFixed(2)}% 〜 ${(r.上限 * 100).toFixed(2)}%`, true],
        ]));
        if (r.注意) 箱.appendChild(断りを作る(r.注意, 'guard-off'));
        return;
    }

    const データ = 選ばれた数字('stat-est-source', 'stat-est-manual');

    if (種類 === '母分散') {
        const r = 手法().母分散の推定(データ.値, 信頼度);
        if (!r.ok) { 出せない(箱, r.訳); return; }
        箱.appendChild(一覧を作る([
            ['件数', 数字(r.n, 0)],
            ['不偏分散', 数字(r.不偏分散), true],
            ['自由度', 数字(r.自由度, 0)],
            [`${Math.round(信頼度 * 100)}% 信頼区間（分散）`,
                `${数字(r.下限)} 〜 ${数字(r.上限)}`, true],
            [`${Math.round(信頼度 * 100)}% 信頼区間（標準偏差）`,
                `${数字(r.標準偏差の下限)} 〜 ${数字(r.標準偏差の上限)}`],
        ]));
        箱.appendChild(断りを作る(r.注意));
        return;
    }

    const r = 手法().母平均の推定(データ.値, 信頼度);
    if (!r.ok) { 出せない(箱, r.訳); return; }
    箱.appendChild(一覧を作る([
        ['件数', 数字(r.n, 0)],
        ['標本平均', 数字(r.平均), true],
        ['標準偏差', 数字(r.標準偏差)],
        ['自由度', 数字(r.自由度, 0)],
        ['t値', 数字(r.t, 4)],
        [`${Math.round(信頼度 * 100)}% 信頼区間`, `${数字(r.下限)} 〜 ${数字(r.上限)}`, true],
    ]));
    箱.appendChild(断りを作る(r.読み方));
}

/* ==========================================================
   ④ 検定
   ========================================================== */

function render検定() {
    const 箱 = document.getElementById('stat-test-result');
    if (!箱) return;

    const 種類 = document.getElementById('stat-test-kind')?.value || 't検定';
    const 水準 = Number(document.getElementById('stat-test-level')?.value || 0.05);
    箱.innerHTML = '';

    if (種類 === '独立性の検定') {
        const 文 = document.getElementById('stat-test-table')?.value || '';
        const 表 = 文.trim().split('\n')
            .map((行) => 行.split(/[\s,、\t]+/).map(Number).filter((v) => Number.isFinite(v)))
            .filter((行) => 行.length);

        if (!表.length || 表.some((行) => 行.length !== 表[0].length)) {
            出せない(箱, '行ごとに同じ個数の数字を、改行で区切って入れてください（例: 20 30 ／ 30 20）');
            return;
        }

        const r = 手法().独立性の検定(表, 水準);
        if (!r.ok) { 出せない(箱, r.訳); return; }

        箱.appendChild(一覧を作る([
            ['χ²（カイ二乗）値', 数字(r.χ2, 4), true],
            ['自由度', 数字(r.自由度, 0)],
            ['p値', 数字(r.p値, 4), true],
            [`棄却の境目（${水準 * 100}%）`, 数字(r.棄却値, 4)],
            ['総計', 数字(r.総計, 0)],
        ]));

        // 期待度数も見せる。前提を満たしているかを自分で確かめられるように。
        const 見 = document.createElement('h4');
        見.className = 'rule-head';
        見.textContent = '期待度数（5未満があると、この検定は当てにならない）';
        箱.appendChild(見);
        const pre = document.createElement('pre');
        pre.className = 'stat-matrix';
        pre.textContent = r.期待.map((行) => 行.map((v) => v.toFixed(2).padStart(8)).join('')).join('\n');
        箱.appendChild(pre);

        const 読み = document.createElement('p');
        読み.className = r.棄却できるか ? 'guard-on' : 'hint';
        読み.textContent = r.読み方;
        箱.appendChild(読み);
        if (r.注意) 箱.appendChild(断りを作る(r.注意, 'guard-off'));
        return;
    }

    // t検定
    const データ = 選ばれた数字('stat-test-source', 'stat-test-manual');
    const 比べる = Number(document.getElementById('stat-test-mu')?.value || 0);
    const r = 手法().t検定(データ.値, 比べる, 水準);
    if (!r.ok) { 出せない(箱, r.訳); return; }

    箱.appendChild(一覧を作る([
        ['件数', 数字(r.n, 0)],
        ['標本平均', 数字(r.平均), true],
        ['比べる値', 数字(r.比べる値)],
        ['t値', 数字(r.t, 4), true],
        ['自由度', 数字(r.自由度, 0)],
        ['p値', 数字(r.p値, 4), true],
        [`棄却の境目（両側${水準 * 100}%）`, `±${数字(r.棄却値, 4)}`],
    ]));

    const 読み = document.createElement('p');
    読み.className = r.棄却できるか ? 'guard-on' : 'hint';
    読み.textContent = r.読み方;
    箱.appendChild(読み);
}

/* ==========================================================
   組み立て
   ========================================================== */

/** 手入力欄は、「手で数字を入れる」を選んだときだけ出す */
function 手入力の出し入れ(選択id, 手入力id) {
    const 選 = document.getElementById(選択id);
    const 欄 = document.getElementById(手入力id);
    if (!選 || !欄) return;
    欄.hidden = 選.value !== '手入力';
}

function 統計画面を作り直す() {
    ['stat-desc-source', 'stat-rel-x', 'stat-rel-y', 'stat-est-source', 'stat-test-source']
        .forEach((id) => 選択欄を作る(id));

    // 2つ目は既定を変えておく。同じものを比べても意味がないため。
    const y = document.getElementById('stat-rel-y');
    if (y && y.options.length > 1) y.selectedIndex = 1;

    render記述統計();
    render関係();
    render推定();
    render検定();
}

function init統計画面() {
    const 箱 = document.getElementById('stat-desc-result');
    if (!箱 || 箱.dataset.配線済み) return;
    箱.dataset.配線済み = '1';

    統計画面を作り直す();

    const つなぐ = (ids, 動き) => ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', 動き);
            el.addEventListener('input', 動き);
        }
    });

    つなぐ(['stat-desc-source', 'stat-desc-manual'], () => {
        手入力の出し入れ('stat-desc-source', 'stat-desc-manual');
        render記述統計();
    });
    つなぐ(['stat-rel-x', 'stat-rel-y', 'stat-rel-x-manual', 'stat-rel-y-manual'], () => {
        手入力の出し入れ('stat-rel-x', 'stat-rel-x-manual');
        手入力の出し入れ('stat-rel-y', 'stat-rel-y-manual');
        render関係();
    });
    つなぐ(['stat-est-kind', 'stat-est-level', 'stat-est-source', 'stat-est-manual',
        'stat-est-success', 'stat-est-total'], () => {
        手入力の出し入れ('stat-est-source', 'stat-est-manual');
        推定の欄を出し分ける();
        render推定();
    });
    つなぐ(['stat-test-kind', 'stat-test-level', 'stat-test-source', 'stat-test-manual',
        'stat-test-mu', 'stat-test-table'], () => {
        手入力の出し入れ('stat-test-source', 'stat-test-manual');
        検定の欄を出し分ける();
        render検定();
    });

    推定の欄を出し分ける();
    検定の欄を出し分ける();
    ['stat-desc-manual', 'stat-rel-x-manual', 'stat-rel-y-manual', 'stat-est-manual', 'stat-test-manual']
        .forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.hidden = true;
        });
}

/** 推定の種類に応じて、要る欄だけを出す */
function 推定の欄を出し分ける() {
    const 種類 = document.getElementById('stat-est-kind')?.value || '母平均';
    const 比率の欄 = document.getElementById('stat-est-prop-wrap');
    const 並びの欄 = document.getElementById('stat-est-series-wrap');
    if (比率の欄) 比率の欄.hidden = 種類 !== '母比率';
    if (並びの欄) 並びの欄.hidden = 種類 === '母比率';
}

/** 検定の種類に応じて、要る欄だけを出す */
function 検定の欄を出し分ける() {
    const 種類 = document.getElementById('stat-test-kind')?.value || 't検定';
    const 表の欄 = document.getElementById('stat-test-table-wrap');
    const 並びの欄 = document.getElementById('stat-test-series-wrap');
    if (表の欄) 表の欄.hidden = 種類 !== '独立性の検定';
    if (並びの欄) 並びの欄.hidden = 種類 === '独立性の検定';
}

window.init統計画面 = init統計画面;
window.統計画面を作り直す = 統計画面を作り直す;
