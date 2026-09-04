/**
 * 保管庫（写真・動画・資料）
 *
 * なぜこれが要るのか:
 *   商品の写真や資料を、Googleドライブや写真アプリに置いていた。
 *   このツールだけで完結させたいので、中に持てるようにする。
 *
 * なぜ localStorage を使わないのか:
 *   localStorage は約5MBしか入らない。写真1枚で足りなくなる。
 *   IndexedDB なら、この端末では約2.9GB 使える。
 *
 * 保存の形:
 *   ファイルそのもの（Blob）を、名前や日付と一緒に持つ。
 *   文字に変換して持つと1.3倍に膨らむので、そのまま持つ。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const 保管庫の名 = 'areglm_library';
const 保管庫の版 = 1;
const 棚の名 = 'items';

/** 保管庫を開く。無ければ作る。 */
function 保管庫を開く() {
    return new Promise((返す, 断る) => {
        const 要求 = indexedDB.open(保管庫の名, 保管庫の版);

        要求.onupgradeneeded = () => {
            const db = 要求.result;
            if (!db.objectStoreNames.contains(棚の名)) {
                const 棚 = db.createObjectStore(棚の名, { keyPath: 'id' });
                // 日付順に並べたいので、日付にも印を付けておく
                棚.createIndex('入れた日', '入れた日');
                棚.createIndex('種類', '種類');
            }
        };

        要求.onsuccess = () => 返す(要求.result);
        要求.onerror = () => 断る(要求.error);
    });
}

/** 棚を使う。読むだけか、書くかを分ける。 */
async function 棚を使う(書くか) {
    const db = await 保管庫を開く();
    return db.transaction(棚の名, 書くか ? 'readwrite' : 'readonly').objectStore(棚の名);
}

/** 種類を見分ける。何で開けるかが変わるため。 */
function 種類を見る(file) {
    const t = (file.type || '').toLowerCase();
    if (t.startsWith('image/')) return '画像';
    if (t.startsWith('video/')) return '動画';
    if (t.startsWith('audio/')) return '音声';
    if (t.includes('pdf')) return 'PDF';
    return '資料';
}

/**
 * しまう。
 *
 * 同じ名前・同じ大きさのものは入れない。
 * 同じ写真が何枚も溜まると、探すのが難しくなるため。
 */
async function 保管庫にしまう(file, 覚え書き) {
    if (!file) return { ok: false, 訳: 'ファイルがありません' };

    // 重複の確認を先に済ませる。
    //
    // 棚を開いてから別の読み取りを挟むと、
    // その間に書き込みの受け口が閉じてしまい、
    // 「transaction has finished」で失敗する。
    // 確認 → 開く → 書く、の順にする。
    const 全部 = await 一覧を読む();
    const ある = 全部.find((x) => x.名前 === file.name && x.大きさ === file.size);
    if (ある) {
        return { ok: false, 訳: `同じものがすでにあります:「${file.name}」` };
    }

    const もの = {
        id: 'lib_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        名前: file.name,
        種類: 種類を見る(file),
        形式: file.type || '不明',
        大きさ: file.size,
        中身: file,
        覚え書き: (覚え書き || '').trim(),
        入れた日: new Date().toISOString(),
    };

    const 棚 = await 棚を使う(true);
    return new Promise((返す) => {
        const r = 棚.add(もの);
        // id も返す。しまった直後に、その項目を別の場所（SNS投稿キューなど）
        // から指し示したいことがあるため（探し直させない）。
        r.onsuccess = () => 返す({ ok: true, 訳: `しまいました:「${file.name}」`, id: もの.id });
        r.onerror = () => 返す({ ok: false, 訳: 'しまえませんでした: ' + (r.error?.message || '') });
    });
}

/** 一覧を読む。中身は重いので、必要になるまで開かない。 */
async function 一覧を読む() {
    const 棚 = await 棚を使う(false);
    return new Promise((返す) => {
        const r = 棚.getAll();
        r.onsuccess = () => 返す((r.result || []).sort((a, b) => (a.入れた日 < b.入れた日 ? 1 : -1)));
        r.onerror = () => 返す([]);
    });
}

/** ひとつ取り出す */
async function 保管庫から取る(id) {
    const 棚 = await 棚を使う(false);
    return new Promise((返す) => {
        const r = 棚.get(id);
        r.onsuccess = () => 返す(r.result || null);
        r.onerror = () => 返す(null);
    });
}

/**
 * 出す。
 *
 * 消す前に、必ず不要ボックスへ控えを置く。
 * ただし中身そのものは重いので、控えには入れない。
 * 「何が、いつ消えたか」が分かれば、探し直せる。
 */
async function 保管庫から出す(id) {
    const もの = await 保管庫から取る(id);
    if (!もの) return false;

    if (typeof 不要ボックスへ入れる === 'function') {
        不要ボックスへ入れる('other', {
            名前: もの.名前, 種類: もの.種類, 大きさ: もの.大きさ,
            入れた日: もの.入れた日,
            備考: '保管庫から出したもの。中身は残っていません。',
        }, '保管庫: ' + もの.名前);
    }

    const 棚 = await 棚を使う(true);
    return new Promise((返す) => {
        const r = 棚.delete(id);
        r.onsuccess = () => { renderLibrary(); 返す(true); };
        r.onerror = () => 返す(false);
    });
}

/** 端末に書き出す */
async function 保管庫から書き出す(id) {
    const もの = await 保管庫から取る(id);
    if (!もの) return;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(もの.中身);
    a.download = もの.名前;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- 画面 ---------- */

/** いま絞り込んでいる種類 */
let 保管庫の絞り = 'すべて';

function 大きさの言い方(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return Math.round((n / 1024 / 1024) * 10) / 10 + ' MB';
}

async function renderLibrary() {
    const 箱 = document.getElementById('library-list');
    if (!箱) return;

    const 全部 = await 一覧を読む();
    const 出す = 保管庫の絞り === 'すべて'
        ? 全部
        : 全部.filter((x) => x.種類 === 保管庫の絞り);

    // 使っている量を出す。入れすぎに気づけるようにするため。
    const 合 = document.getElementById('library-summary');
    if (合) {
        const 総 = 全部.reduce((n, x) => n + x.大きさ, 0);
        let 上限 = '';
        if (navigator.storage?.estimate) {
            const e = await navigator.storage.estimate();
            上限 = ` ／ この端末で使える容量 ${Math.round((e.quota / 1024 / 1024 / 1024) * 10) / 10} GB`;
        }
        合.textContent = `${全部.length}件 ／ ${大きさの言い方(総)}${上限}`;
    }

    // 種類ごとの数をタブに出す
    const 種類ごと = {};
    全部.forEach((x) => { 種類ごと[x.種類] = (種類ごと[x.種類] || 0) + 1; });
    document.querySelectorAll('[data-lib-kind]').forEach((b) => {
        const k = b.dataset.libKind;
        const n = k === 'すべて' ? 全部.length : (種類ごと[k] || 0);
        const 印 = b.querySelector('.lib-count');
        if (印) 印.textContent = n ? String(n) : '';
        b.classList.toggle('active', k === 保管庫の絞り);
    });

    箱.innerHTML = '';
    if (!出す.length) {
        箱.innerHTML = '<div class="hint">まだ何も入っていません。下から入れられます。</div>';
        return;
    }

    出す.forEach((x) => {
        const c = document.createElement('div');
        c.className = 'lib-card';

        // 画像だけは、その場で見えるようにする。
        // 名前だけでは、どれがどれか分からないため。
        if (x.種類 === '画像') {
            const img = document.createElement('img');
            img.className = 'lib-thumb';
            img.src = URL.createObjectURL(x.中身);
            img.alt = x.名前;
            img.loading = 'lazy';
            // 使い終わったら開放する。開きっぱなしだと重くなる。
            img.onload = () => URL.revokeObjectURL(img.src);
            c.appendChild(img);
        } else {
            const 印 = document.createElement('div');
            印.className = 'lib-icon';
            印.textContent = { 動画: '🎬', 音声: '🎵', PDF: '📄', 資料: '📁' }[x.種類] || '📁';
            c.appendChild(印);
        }

        const 名 = document.createElement('div');
        名.className = 'lib-name';
        名.textContent = x.名前;
        名.title = x.名前;

        const 情 = document.createElement('div');
        情.className = 'lib-info';
        情.textContent = `${x.種類} ／ ${大きさの言い方(x.大きさ)} ／ `
            + new Date(x.入れた日).toLocaleDateString('ja-JP');

        const 操 = document.createElement('div');
        操.className = 'lib-actions';

        const 出 = document.createElement('button');
        出.type = 'button';
        出.className = 'btn-link';
        出.textContent = '取り出す';
        出.addEventListener('click', () => 保管庫から書き出す(x.id));

        const 消 = document.createElement('button');
        消.type = 'button';
        消.className = 'btn-link danger';
        消.textContent = '外す';
        消.addEventListener('click', async () => {
            if (!confirm(`「${x.名前}」を保管庫から出しますか。\n（中身は消えます。記録は不要ボックスに残ります）`)) return;
            await 保管庫から出す(x.id);
        });

        操.appendChild(出);
        操.appendChild(消);

        c.appendChild(名);
        c.appendChild(情);
        c.appendChild(操);
        箱.appendChild(c);
    });
}

function initLibrary() {
    document.getElementById('library-input')?.addEventListener('change', async (e) => {
        const ファイルたち = [...(e.target.files || [])];
        if (!ファイルたち.length) return;

        let 入った = 0;
        let 断り = [];
        for (const f of ファイルたち) {
            const r = await 保管庫にしまう(f);
            if (r.ok) 入った++;
            else 断り.push(r.訳);
        }

        e.target.value = '';
        await renderLibrary();

        if (typeof showNotification === 'function') {
            showNotification(
                入った ? `${入った}件しまいました` + (断り.length ? `（${断り.length}件は入れませんでした）` : '')
                       : 断り[0] || 'しまえませんでした',
                入った ? 'success' : 'error'
            );
        }
    });

    document.querySelectorAll('[data-lib-kind]').forEach((b) => {
        b.addEventListener('click', () => {
            保管庫の絞り = b.dataset.libKind;
            renderLibrary();
        });
    });

    renderLibrary();
}

window.initLibrary = initLibrary;
window.renderLibrary = renderLibrary;
window.保管庫にしまう = 保管庫にしまう;
window.一覧を読む = 一覧を読む;
