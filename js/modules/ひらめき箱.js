/**
 * ひらめき箱（画面）
 *
 * 街で見かけたもの・気になったURL・思いついたことを、スマホやiPadから
 * すぐ投げ込む。あとでMacで見返して、知識メモに入れたり、整理済みにしたりする。
 * 保存・検証は server/ひらめき箱.js。
 *
 * ・消さない（「整理済み」にするだけ）
 * ・URLは保存するだけで、URLの先を取りに行かない（外を見に行かない決まり）
 * ・写真は送る前に小さく縮める（通信量と保存の大きさを抑える）
 */

async function 箱API(パス, 本文) {
    return アカウントAPI(パス, 本文);
}

/** 写真を、長い辺1600pxのJPEGに縮める。縮められなければ元のまま（形式が合うときだけ）。 */
async function 写真を縮める(ファイル) {
    const 読み込む = () => new Promise((解決, 失敗) => {
        const url = URL.createObjectURL(ファイル);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); 解決(img); };
        img.onerror = () => { URL.revokeObjectURL(url); 失敗(new Error('画像を読めませんでした')); };
        img.src = url;
    });
    const img = await 読み込む();
    const 倍率 = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * 倍率);
    c.height = Math.round(img.naturalHeight * 倍率);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
}

function 箱の日時(iso) {
    return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let 箱を描いている = false;

async function renderひらめき箱() {
    const 箱 = document.getElementById('inbox-panel');
    if (!箱 || 箱を描いている) return;
    箱を描いている = true;
    try {
        const 要素 = (タグ, 文字, クラス) => { const e = document.createElement(タグ); if (文字 != null) e.textContent = 文字; if (クラス) e.className = クラス; return e; };

        /* ---- 入れる（一度だけ作る。再描画しても、入力途中の文章は消えない） ---- */
        if (!箱.querySelector('form')) {
        箱.textContent = '';
        const f = 要素('form', null, 'login-form');
        const 文 = document.createElement('textarea');
        文.rows = 2;
        文.maxLength = 2000;
        文.placeholder = '思いついたこと・気になったURLを入れる';
        文.setAttribute('aria-label', 'ひらめき');
        const 写真 = document.createElement('input');
        写真.type = 'file';
        // jpeg等に限ると、iPhoneは写真を自動でjpegにして渡してくれる
        写真.accept = 'image/jpeg,image/png,image/webp';
        写真.setAttribute('aria-label', '写真');
        const 入れる = 要素('button', '入れる', 'btn btn-primary');
        入れる.type = 'submit';
        f.append(文, 写真, 入れる);
        f.addEventListener('submit', async (e) => {
            e.preventDefault();
            const テキスト = 文.value.trim();
            if (!テキスト && !写真.files[0]) { showNotification('文か写真を入れてください', 'error'); return; }
            入れる.disabled = true;
            try {
                const 本文 = { 文: テキスト, 端末: typeof 続き用の端末名 === 'function' ? 続き用の端末名() : '' };
                if (/^https?:\/\/\S+$/.test(テキスト)) 本文.種類 = 'URL';
                if (写真.files[0]) 本文.画像 = await 写真を縮める(写真.files[0]);
                const r = await 箱API('/api/inbox/add', 本文);
                showNotification(r.訳 || (r.ok ? '入れました' : '入れられませんでした'), r.ok ? 'success' : 'error');
                if (r.ok) { 文.value = ''; 写真.value = ''; }
            } catch (err) {
                showNotification('入れられませんでした: ' + err.message, 'error');
            } finally {
                入れる.disabled = false;
            }
            箱を描いている = false;
            renderひらめき箱();
        });
        箱.appendChild(f);
        箱.appendChild(要素('div', null, 'inbox-list'));
        }

        /* ---- 一覧 ---- */
        const 一覧枠 = 箱.querySelector('.inbox-list');
        const r = await 箱API('/api/inbox/list');
        一覧枠.textContent = '';
        if (!r.ok) { 一覧枠.appendChild(要素('p', r.訳 || '読み込めませんでした', 'hint')); return; }
        const 未 = r.一覧.filter((x) => x.状態 !== '整理済み');
        const 済 = r.一覧.filter((x) => x.状態 === '整理済み');
        一覧枠.appendChild(要素('p', `未整理 ${未.length}件 / 整理済み ${済.length}件`, 'hint'));

        const 行を作る箱 = (x) => {
            const li = 要素('li', null, 'monitor-item');
            li.appendChild(要素('small', `${箱の日時(x.作成)} ${x.端末 ? '・' + x.端末 : ''} ・${x.種類}`, 'hint'));
            if (x.画像) {
                const img = document.createElement('img');
                img.src = '/api/inbox/image/' + encodeURIComponent(x.画像);
                img.alt = x.文 || 'ひらめきの写真';
                img.loading = 'lazy';
                img.style.cssText = 'display:block;max-width:100%;max-height:220px;border-radius:8px;margin:6px 0';
                li.appendChild(img);
            }
            if (x.url) {
                const a = document.createElement('a');
                a.href = x.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = x.url;
                const p = 要素('p');
                p.appendChild(a);
                li.appendChild(p);
            } else if (x.文) {
                li.appendChild(要素('p', x.文));
            }
            const 並び = 要素('div', null, 'guard-row');
            if (x.文 && window.AReGLM_LOCAL_AI) {
                const k = 要素('button', '知識メモに入れる', 'btn btn-sm btn-secondary');
                k.type = 'button';
                k.addEventListener('click', async () => {
                    const 結果 = await AReGLM_LOCAL_AI.addKnowledge(x.文, 'manual', 'ひらめき');
                    showNotification(結果 && !結果.blocked ? '知識メモに入れました' : ((結果 && 結果.reason) || '入れられませんでした（AIエンジンが止まっている可能性）'), 結果 && !結果.blocked ? 'success' : 'error');
                });
                並び.appendChild(k);
            }
            const 切替 = 要素('button', x.状態 === '整理済み' ? '未整理に戻す' : '整理済みにする', 'btn btn-sm btn-secondary');
            切替.type = 'button';
            切替.addEventListener('click', async () => {
                const 結果 = await 箱API('/api/inbox/mark', { id: x.id, 状態: x.状態 === '整理済み' ? '未整理' : '整理済み' });
                if (!結果.ok) showNotification(結果.訳 || '変えられませんでした', 'error');
                箱を描いている = false;
                renderひらめき箱();
            });
            並び.appendChild(切替);
            li.appendChild(並び);
            return li;
        };

        if (未.length) {
            const ul = 要素('ul', null, 'monitor-list');
            未.forEach((x) => ul.appendChild(行を作る箱(x)));
            一覧枠.appendChild(ul);
        }
        if (済.length) {
            const d = document.createElement('details');
            d.appendChild(要素('summary', `整理済み（${済.length}件）`));
            const ul = 要素('ul', null, 'monitor-list');
            済.forEach((x) => ul.appendChild(行を作る箱(x)));
            d.appendChild(ul);
            一覧枠.appendChild(d);
        }
    } finally {
        箱を描いている = false;
    }
}

window.renderひらめき箱 = renderひらめき箱;
