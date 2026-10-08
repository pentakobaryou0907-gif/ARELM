/**
 * まとめて取り出す
 *
 * なぜこれが要るのか:
 *   「商品のデータをすぐにまとめてダウンロードしたい」というご要望。
 *   工場や取引先に渡すとき、1件ずつ書き出していては手間がかかる。
 *
 * 何を出せるか:
 *   ・商品の一覧（CSV）— そのまま表計算で開ける
 *   ・全データの控え（JSON）— 別の端末へ移すとき用
 *   ・シリーズごとの資料（テキスト）— そのまま渡せる形
 *
 * 出さないもの:
 *   保管庫の中身（写真・動画）は入れない。
 *   数百MBになることがあり、開けないファイルになるため。
 *   写真は保管庫から個別に取り出してください。
 *
 * すべてこの端末の中だけで作る。外部へは一切送らない。
 */

/** 何を出せるか */
const 出せるもの = [
    {
        id: 'products_csv',
        名: '商品の一覧（CSV）',
        訳: '表計算でそのまま開けます。取引先に渡す用。',
        作る: () => 商品をCSVにする(),
    },
    {
        id: 'inventory_csv',
        名: '在庫と金額（CSV）',
        訳: '在庫数と在庫金額を合計つきで出します。',
        作る: () => 在庫をCSVにする(),
    },
    {
        id: 'series_txt',
        名: 'シリーズごとの資料（テキスト）',
        訳: 'シリーズと、その商品をまとめた資料。',
        作る: () => シリーズを資料にする(),
    },
    {
        id: 'all_json',
        名: '全データの控え（JSON）',
        訳: '別の端末へ移すとき用。写真・動画は含みません。',
        作る: () => 全データを控えにする(),
    },
];

// 読み書きは js/core/蓄え.js の「蓄えを読む」にまとめてある。
// ここに同じ「読む」を置いていたため、二つのファイルで名前がぶつかり、
// 後から読み込まれたほうが前を黙って上書きしていた。

/** CSVの一マス分。カンマや改行を含むときは囲む。 */
function マス(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function 商品をCSVにする() {
    const 商品 = 蓄えを読む('products');
    if (!商品.length) return { ok: false, 訳: '商品がまだ登録されていません' };

    const 見出し = ['商品名', '種類', '価格', '在庫数', 'SKU', '登録日'];
    const 行 = [見出し.join(',')];

    商品.forEach((p) => {
        行.push([
            p.name, p.category, p.price ?? 0, p.quantity ?? 0,
            p.sku || p.id || '',
            (p.createdAt || '').slice(0, 10),
        ].map(マス).join(','));
    });

    return { ok: true, 中身: 行.join('\n'), 名: `商品一覧_${日付()}.csv`, 型: 'text/csv' };
}

function 在庫をCSVにする() {
    const 商品 = 蓄えを読む('products');
    if (!商品.length) return { ok: false, 訳: '商品がまだ登録されていません' };

    const 行 = [['商品名', '価格', '在庫数', '在庫金額'].join(',')];
    let 総数 = 0;
    let 総額 = 0;

    商品.forEach((p) => {
        const 数 = p.quantity ?? 0;
        const 額 = (p.price ?? 0) * 数;
        総数 += 数;
        総額 += 額;
        行.push([p.name, p.price ?? 0, 数, 額].map(マス).join(','));
    });

    // 合計を最後に足す。渡された側が自分で足さずに済むように。
    行.push(['合計', '', 総数, 総額].map(マス).join(','));

    return { ok: true, 中身: 行.join('\n'), 名: `在庫と金額_${日付()}.csv`, 型: 'text/csv' };
}

function シリーズを資料にする() {
    const シリーズ = 蓄えを読む('areglm_series');
    const 商品 = 蓄えを読む('products');

    if (!シリーズ.length && !商品.length) {
        return { ok: false, 訳: 'シリーズも商品もまだありません' };
    }

    const 行 = [`【シリーズ資料】`, `作成日: ${日付()}`, ''];

    if (シリーズ.length) {
        シリーズ.forEach((s) => {
            行.push(`■ ${s.name || s.名前 || '（名前なし）'}`);
            if (s.description || s.説明) 行.push(`  ${s.description || s.説明}`);

            // そのシリーズの商品を拾う
            const 属する = 商品.filter((p) =>
                (p.series && p.series === (s.id || s.name))
                || (p.name || '').includes(s.name || '＿＿'));

            if (属する.length) {
                行.push(`  商品 ${属する.length}件:`);
                属する.forEach((p) => {
                    行.push(`    ・${p.name}　${p.category || ''}　¥${(p.price ?? 0).toLocaleString('ja-JP')}　在庫${p.quantity ?? 0}`);
                });
            } else {
                行.push('  （商品はまだありません）');
            }
            行.push('');
        });
    }

    // どのシリーズにも入っていない商品も出す。
    // 出さないと、あるはずのものが資料から消える。
    const 属さない = 商品.filter((p) => !p.series);
    if (属さない.length) {
        行.push('■ シリーズ未設定の商品');
        属さない.forEach((p) => {
            行.push(`  ・${p.name}　${p.category || ''}　¥${(p.price ?? 0).toLocaleString('ja-JP')}　在庫${p.quantity ?? 0}`);
        });
    }

    return { ok: true, 中身: 行.join('\n'), 名: `シリーズ資料_${日付()}.txt`, 型: 'text/plain' };
}

function 全データを控えにする() {
    // 写真・動画は入れない。数百MBになり、開けないファイルになるため。
    const 鍵たち = [
        'products', 'brands', 'areglm_series', 'areglm_tasks', 'areglm_memos',
        'areglm_events', 'areglm_sns_posts', 'areglm_health', 'areglm_wishlist',
        'areglm_vintage', 'areglm_preorders', 'areglm_sheets', 'areglm_my_rules',
        'areglm_techpack_cost', 'areglm_tags', 'areglm_activity_log', 'areglm_troubles',
    ];

    const 控え = { 作成日: new Date().toISOString(), 中身: {} };
    鍵たち.forEach((k) => {
        const v = localStorage.getItem(k);
        if (v) {
            try { 控え.中身[k] = JSON.parse(v); } catch { /* 壊れていれば飛ばす */ }
        }
    });

    控え.備考 = '写真・動画は含まれていません（保管庫から個別に取り出してください）';

    return {
        ok: true,
        中身: JSON.stringify(控え, null, 1),
        名: `ARELM控え_${日付()}.json`,
        型: 'application/json',
    };
}

function 日付() {
    return typeof 今日 === 'function' ? 今日() : new Date().toISOString().slice(0, 10);
}

/** 実際に取り出す */
function 取り出す(id) {
    const も = 出せるもの.find((x) => x.id === id);
    if (!も) return;

    const r = も.作る();
    if (!r.ok) {
        if (typeof showNotification === 'function') showNotification(r.訳, 'error');
        return;
    }

    // Excel で開いたとき文字化けしないよう、CSVには先頭に印を付ける
    const 中身 = r.型 === 'text/csv' ? '﻿' + r.中身 : r.中身;
    const blob = new Blob([中身], { type: r.型 + ';charset=utf-8' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.名;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);

    if (typeof showNotification === 'function') {
        showNotification(`書き出しました: ${r.名}`, 'success');
    }
}

function renderExportAll() {
    const 箱 = document.getElementById('export-list');
    if (!箱) return;

    箱.innerHTML = '';
    出せるもの.forEach((も) => {
        const li = document.createElement('li');
        li.className = 'export-item';

        const 本 = document.createElement('div');
        本.className = 'export-body';
        const 名 = document.createElement('b');
        名.textContent = も.名;
        const 訳 = document.createElement('small');
        訳.textContent = も.訳;
        本.appendChild(名);
        本.appendChild(訳);

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-primary';
        b.textContent = '取り出す';
        b.addEventListener('click', () => 取り出す(も.id));

        li.appendChild(本);
        li.appendChild(b);
        箱.appendChild(li);
    });
}

function initExportAll() {
    renderExportAll();
}

window.initExportAll = initExportAll;
window.renderExportAll = renderExportAll;
window.取り出す = 取り出す;
window.出せるもの = 出せるもの;
