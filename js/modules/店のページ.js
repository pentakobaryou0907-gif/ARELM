/**
 * 商品データから、自分の店のページを書き出す
 *
 * なぜこれを作るのか:
 *   置き換え計画で「未」だったのが、これ一つだった。
 *   BASE や STORES のような、自分の商品を見せるページ。
 *
 *   見せるところまでは自作できる。
 *   商品名・写真・説明・価格は、すでにこの道具の中にある。
 *   それを一枚のHTMLにまとめれば、それが店の見た目になる。
 *
 * できないこと（はっきり書きます）:
 *   <b>支払いは作れません。</b>
 *   カード情報を自分で預かるには規格（PCI DSS）が要るし、
 *   前金を預かる形は資金決済法の話になる。
 *   個人で背負うものではないし、法律で決まっていることは時間では解けない。
 *
 *   なので「見せるページは自作、支払いは外部」という形になる。
 *   買う導線には、あなたが使う外部の売り場（Amazon、SUZURI 等）へ
 *   繋ぐ場所を用意してある。
 *
 * 書き出したページは、そのままでは公開されません。
 * このMacの中に保存されるだけです。
 * 公開するかどうかは、あなたが決めることです。
 */

function 店の商品を集める() {
    let 品 = [];
    try {
        品 = JSON.parse(localStorage.getItem('products') || '[]');
    } catch {
        品 = [];
    }
    return Array.isArray(品) ? 品 : [];
}

/** 文字をHTMLに置くときの逃がし */
function 逃がす(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 店のページを組み立てる。
 *
 * 外部から何も読み込まない一枚のHTMLにする。
 * 外の飾りを読み込むと、その時点で外へ通信が出る。
 * それはこの道具の決まりに反するし、
 * 相手のサーバーが止まればページも崩れる。
 */
function 店のページを作る(設定 = {}) {
    const 品 = 店の商品を集める();
    const 店名 = 設定.店名 || (typeof ツールの名前を読む === 'function'
        ? 'ARELM' : 'ARELM');
    const 一言 = 設定.一言 || '';
    const 買う先 = 設定.買う先 || '';

    const 札 = 品.map((p) => {
        const 写真 = p.photo || p.image || '';
        const 値 = Number(p.price || 0);
        return `      <article class="item">
        ${写真 ? `<div class="ph"><img src="${逃がす(写真)}" alt="${逃がす(p.name)}" loading="lazy"></div>`
                : '<div class="ph none">写真なし</div>'}
        <h2>${逃がす(p.name || '（名前なし）')}</h2>
        ${p.sku ? `<p class="sku">${逃がす(p.sku)}</p>` : ''}
        ${p.description ? `<p class="desc">${逃がす(p.description)}</p>` : ''}
        <p class="price">${値 ? '¥' + 値.toLocaleString('ja-JP') : '価格未定'}</p>
        ${買う先 ? `<a class="buy" href="${逃がす(買う先)}" target="_blank" rel="noopener">買える場所へ</a>` : ''}
      </article>`;
    }).join('\n');

    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${逃がす(店名)}</title>
<style>
  /* 外から何も読み込まない。読み込むと、そこで外へ通信が出る。 */
  :root { color-scheme: light dark; --ink:#2b2b2b; --bg:#faf7f2; --line:#e3ded5; --dim:#7a736a; }
  @media (prefers-color-scheme: dark){
    :root { --ink:#ececec; --bg:#1a1815; --line:#332f2a; --dim:#9a938a; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;
         line-height:1.8; }
  header { padding:3rem 1.2rem 2rem; text-align:center; border-bottom:1px solid var(--line); }
  header h1 { margin:0; font-size:1.6rem; letter-spacing:.08em; }
  header p { margin:.6rem 0 0; color:var(--dim); font-size:.9rem; }
  main { max-width:60rem; margin:0 auto; padding:1.5rem 1.2rem 4rem;
         display:grid; gap:1.2rem;
         grid-template-columns:repeat(auto-fill,minmax(15rem,1fr)); }
  .item { border:1px solid var(--line); border-radius:12px; overflow:hidden;
          background:transparent; display:flex; flex-direction:column; }
  .ph { aspect-ratio:1/1; overflow:hidden; background:rgba(128,128,128,.08); }
  .ph img { width:100%; height:100%; object-fit:cover; display:block; }
  .ph.none { display:grid; place-items:center; color:var(--dim); font-size:.8rem; }
  .item h2 { font-size:1rem; margin:.8rem .9rem .2rem; }
  .sku { margin:0 .9rem; font-size:.72rem; color:var(--dim); letter-spacing:.06em; }
  .desc { margin:.4rem .9rem; font-size:.82rem; color:var(--dim); }
  .price { margin:.4rem .9rem .9rem; font-weight:700; }
  .buy { margin:auto .9rem .9rem; padding:.55rem; text-align:center;
         border:1px solid var(--ink); border-radius:8px;
         text-decoration:none; color:inherit; font-size:.85rem; }
  footer { padding:2rem 1.2rem; text-align:center; color:var(--dim); font-size:.78rem;
           border-top:1px solid var(--line); }
</style>
</head>
<body>
<header>
  <h1>${逃がす(店名)}</h1>
  ${一言 ? `<p>${逃がす(一言)}</p>` : ''}
</header>
<main>
${札 || '      <p>商品がまだ登録されていません。</p>'}
</main>
<footer>
  <p>${逃がす(店名)}　全${品.length}点</p>
  <p>このページは外部から何も読み込みません。</p>
</footer>
</body>
</html>`;
}

/** 書き出して、手元に落とす */
function 店のページを書き出す() {
    const 品 = 店の商品を集める();
    if (!品.length) {
        showNotification('商品がまだありません。在庫から登録してください。', 'error');
        return;
    }

    const 中身 = 店のページを作る({
        店名: (document.getElementById('shop-name')?.value || '').trim() || 'ARELM',
        一言: (document.getElementById('shop-lead')?.value || '').trim(),
        買う先: (document.getElementById('shop-buy-url')?.value || '').trim(),
    });

    const 塊 = new Blob([中身], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(塊);
    a.download = `店のページ_${typeof 日付文字 === 'function' ? 日付文字(new Date()) : 'page'}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);

    showNotification(`${品.length}点の店のページを書き出しました`, 'success');
    if (typeof logActivity === 'function') {
        logActivity(`店のページを書き出した（${品.length}点）`, { category: 'design' });
    }
}

/** その場で見てみる */
function 店のページを見る() {
    const 品 = 店の商品を集める();
    if (!品.length) {
        showNotification('商品がまだありません。', 'error');
        return;
    }
    const 枠 = document.getElementById('shop-preview');
    if (!枠) return;

    const 中身 = 店のページを作る({
        店名: (document.getElementById('shop-name')?.value || '').trim() || 'ARELM',
        一言: (document.getElementById('shop-lead')?.value || '').trim(),
        買う先: (document.getElementById('shop-buy-url')?.value || '').trim(),
    });

    // srcdoc で中に閉じ込める。外へは出さない。
    枠.hidden = false;
    枠.srcdoc = 中身;
}

function init店のページ() {
    document.getElementById('shop-build-btn')?.addEventListener('click', 店のページを書き出す);
    document.getElementById('shop-preview-btn')?.addEventListener('click', 店のページを見る);
}

window.init店のページ = init店のページ;
window.店のページを作る = 店のページを作る;
window.店のページを書き出す = 店のページを書き出す;
