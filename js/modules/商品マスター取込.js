/**
 * 商品マスターの取り込み（自分の実データを、CSVから）
 *
 * なぜこれが要るのか:
 *
 *   これまで「商品マスターを読み込む」で入るのは、
 *   ベーシックTシャツ・デニムジャケットといった<b>見本のデータ</b>だった。
 *   実際に管理したいのは TUZURI シリーズのような自分の商品で、
 *   見本とはまったく別のもの。見本しか入らないのでは、道具として動かない。
 *
 *   スプレッドシートからCSVで書き出し、それをここで読む。
 *   <b>外部のサービスにはつながない。</b>
 *   常時つなぐ形にすると、このツールの「外へ出さない」が崩れる。
 *   手元のファイルを読むだけなら、その心配がない。
 *
 * 列の見分け方:
 *
 *   見出しの言い方は人によって揺れる（「商品名」「デザイン名」「品名」）。
 *   一つに決めさせると、書き出したCSVをいちいち直すことになる。
 *   よくある言い方をこちらで引き受けて、当てはめる。
 *
 * すべてこの端末の中だけで動きます。外部へは一切送りません。
 */

/**
 * CSVの見出しと、商品のどの項目かの対応。
 * 左のどれかが見出しに含まれていれば、右の項目として読む。
 */
const 見出しの対応 = [
    { 項目: 'code', 言い方: ['商品番号', '品番', 'コード', 'code'] },
    { 項目: 'name', 言い方: ['商品名', 'デザイン名', '品名', 'name'] },
    { 項目: 'category', 言い方: ['カテゴリ', 'スタイル', '種別', 'category'] },
    { 項目: 'colors', 言い方: ['カラー', '色', 'color'] },
    { 項目: 'origin', 言い方: ['原産地', 'origin'] },
    { 項目: 'madeBy', 言い方: ['生産地', '生産', '製造', 'madeby'] },
    { 項目: 'price', 言い方: ['値段', '価格', '金額', 'price'] },
    { 項目: 'quantity', 言い方: ['在庫', '数量', '個数', 'quantity', 'stock'] },
    { 項目: 'dataLink', 言い方: ['保存先', 'リンク', 'ドライブ', 'url', 'link'] },
    { 項目: 'note', 言い方: ['備考', 'メモ', 'note'] },
    { 項目: 'sku', 言い方: ['sku'] },
];

/** CSVを行と列に分ける。引用符の中のカンマと改行を守る。 */
function CSVを分解する(文字) {
    const 行たち = [];
    let 行 = [];
    let マス = '';
    let 引用符の中 = false;

    const 中身 = String(文字 || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < 中身.length; i++) {
        const c =中身[i];

        if (引用符の中) {
            if (c === '"') {
                // 引用符が二つ続くのは、引用符そのもの
                if (中身[i + 1] === '"') { マス += '"'; i++; }
                else 引用符の中 = false;
            } else {
                マス += c;
            }
            continue;
        }

        if (c === '"') { 引用符の中 = true; continue; }
        if (c === ',') { 行.push(マス); マス = ''; continue; }
        if (c === '\n') { 行.push(マス); 行たち.push(行); 行 = []; マス = ''; continue; }
        マス += c;
    }
    行.push(マス);
    行たち.push(行);

    // 空っぽの行は落とす
    return 行たち.filter((r) => r.some((x) => String(x).trim() !== ''));
}

/** 見出しの行から、どの列が何かを決める */
function 列の意味を決める(見出しの行) {
    const 対応 = {};
    見出しの行.forEach((見出し, 列) => {
        const h = String(見出し || '').toLowerCase().replace(/\s/g, '');
        if (!h) return;
        const 見つけた = 見出しの対応.find(
            (x) => x.言い方.some((語) => h.includes(String(語).toLowerCase())));
        // 先に決まった列を、後の列で上書きしない。
        // 「商品名」と「商品番号」のように、似た見出しが並ぶことがある。
        if (見つけた && !(見つけた.項目 in 対応)) 対応[見つけた.項目] = 列;
    });
    return 対応;
}

function 数にする(v) {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

/**
 * CSVの中身から、商品の一覧を組み立てる。
 *
 * SKUの列が無いことのほうが多い（スプレッドシートには商品番号しかない）。
 * そのときは商品番号をSKUとして使う。どちらも無ければ、その行は飛ばす。
 */
function CSVから商品を作る(文字) {
    const 行たち = CSVを分解する(文字);
    if (行たち.length < 2) {
        return { ok: false, 訳: '見出しの行と、少なくとも1行のデータが要ります' };
    }

    const 対応 = 列の意味を決める(行たち[0]);
    if (!('name' in 対応) && !('code' in 対応)) {
        return {
            ok: false,
            訳: '「商品名」または「商品番号」の列が見つかりませんでした。'
                + '見出しの行に、その言葉が入っているか確かめてください。',
        };
    }

    const 取る = (行, 項目) => (項目 in 対応 ? String(行[対応[項目]] ?? '').trim() : '');

    const 商品たち = [];
    const 飛ばした = [];

    行たち.slice(1).forEach((行, i) => {
        const code = 取る(行, 'code');
        const name = 取る(行, 'name');
        const sku = 取る(行, 'sku') || code || name;

        if (!sku) { 飛ばした.push(i + 2); return; }

        商品たち.push({
            sku,
            code,
            name: name || code,
            category: 取る(行, 'category'),
            colors: 取る(行, 'colors'),
            origin: 取る(行, 'origin'),
            madeBy: 取る(行, 'madeBy'),
            dataLink: 取る(行, 'dataLink'),
            note: 取る(行, 'note'),
            price: 数にする(取る(行, 'price')),
            quantity: 数にする(取る(行, 'quantity')),
        });
    });

    return {
        ok: true,
        商品たち,
        飛ばした,
        読めた列: Object.keys(対応),
    };
}

/**
 * 読み込んだ商品を、いまの一覧に入れる。
 *
 * 同じSKUが既にあるときは、<b>消さずに上書きする</b>。
 * 在庫の数と値段の履歴は、こちらで持っているほうが正しいことがあるため、
 * 値段が変わっていれば履歴に残す。
 */
function 商品を取り込む(新しい商品たち) {
    const いまの = JSON.parse(localStorage.getItem('products') || '[]');
    let 足した = 0;
    let 直した = 0;
    let 値段を直した = 0;

    新しい商品たち.forEach((新) => {
        const 位置 = いまの.findIndex((p) => p.sku === 新.sku);

        if (位置 < 0) {
            いまの.push({
                ...新,
                source: 'csv',          // 見本（seed）と区別できるようにする
                価格改定履歴: [],
                createdAt: new Date().toISOString(),
            });
            足した++;
            return;
        }

        const 元 = いまの[位置];
        const 履歴 = Array.isArray(元.価格改定履歴) ? [...元.価格改定履歴] : [];
        const 旧価格 = Number(元.price) || 0;

        if (新.price && 旧価格 && 旧価格 !== 新.price) {
            履歴.push({
                旧価格,
                新価格: 新.price,
                訳: 'CSVの取り込みで更新',
                変えた日: new Date().toISOString(),
            });
            値段を直した++;
        }

        // 空の値で、せっかくある中身を消さない。
        const 混ぜる = { ...元 };
        Object.entries(新).forEach(([k, v]) => {
            if (v !== '' && v !== 0 && v != null) 混ぜる[k] = v;
        });

        いまの[位置] = { ...混ぜる, source: 元.source || 'csv', 価格改定履歴: 履歴 };
        直した++;
    });

    localStorage.setItem('products', JSON.stringify(いまの));
    return { 足した, 直した, 値段を直した };
}

function init商品マスター取込() {
    const 入力 = document.getElementById('product-csv-import');
    if (!入力 || 入力.dataset.配線済み) return;
    入力.dataset.配線済み = '1';

    // <label for="...">はクリックでは入力欄を開くが、
    // キーボード（Tab→Enter/Space）では既定で反応しない。
    // tabindexだけ付けても押せないままなので、ここで拾って開く。
    const ラベル = document.querySelector('label[for="product-csv-import"]');
    ラベル?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            入力.click();
        }
    });

    入力.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;

        const 箱 = document.getElementById('product-csv-result');
        if (箱) 箱.innerHTML = '<p class="hint">読んでいます…</p>';

        const fr = new FileReader();
        fr.onload = () => {
            const 結果 = CSVから商品を作る(fr.result);
            if (!結果.ok) {
                if (箱) {
                    箱.innerHTML = '';
                    const p = document.createElement('p');
                    p.className = 'guard-off';
                    p.textContent = `読み込めませんでした: ${結果.訳}`;
                    箱.appendChild(p);
                }
                return;
            }

            const 取込 = 商品を取り込む(結果.商品たち);

            if (箱) {
                箱.innerHTML = '';
                const p = document.createElement('p');
                p.className = 'guard-on';
                p.textContent = `${結果.商品たち.length}件を読みました`
                    + `（新しく ${取込.足した}件 / 上書き ${取込.直した}件`
                    + (取込.値段を直した ? ` / うち値段の改定 ${取込.値段を直した}件を履歴に記録` : '')
                    + '）';
                箱.appendChild(p);

                const 列 = document.createElement('small');
                列.className = 'hint';
                列.textContent = `読み取れた列: ${結果.読めた列.join('、')}`
                    + (結果.飛ばした.length ? ` ／ 名前も番号も無い ${結果.飛ばした.length}行は飛ばしました` : '');
                箱.appendChild(列);
            }

            if (typeof loadInventoryHub === 'function') loadInventoryHub();
            if (typeof refreshInventory === 'function') refreshInventory();
            if (typeof loadDashboardData === 'function') loadDashboardData();
            showNotification?.(`商品を${取込.足した + 取込.直した}件取り込みました`, 'success');
            if (window.logActivity) {
                logActivity(`商品マスターをCSVから取り込み（${取込.足した + 取込.直した}件）`,
                    { category: 'inventory' });
            }
        };
        fr.onerror = () => {
            if (箱) 箱.innerHTML = '<p class="guard-off">ファイルを読めませんでした。</p>';
        };
        fr.readAsText(f, 'utf-8');
    });
}

window.init商品マスター取込 = init商品マスター取込;
window.CSVから商品を作る = CSVから商品を作る;
window.商品を取り込む = 商品を取り込む;
