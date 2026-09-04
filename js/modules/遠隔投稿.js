/**
 * 出先から投稿する
 *
 * なぜこれを作るのか:
 *
 *   投稿の下書きは作れるようになった。
 *   だが、それを出すには家のパソコンに戻る必要があった。
 *   出先で「いま出したい」と思っても、出せない。
 *
 *   スマホから、下書きを選んで、その場でSNSアプリに渡せるようにする。
 *
 * どうやって出すのか（ここが肝心）:
 *
 *   <b>公式APIにはつなぎません。</b>
 *   つなぐと、外へ送らないという決まりが崩れるためです。
 *
 *   代わりに、端末そのものが持っている「共有」を使います。
 *
 *     文章を写す → SNSアプリを開く → 貼り付けて出す
 *
 *   スマホなら、共有の画面から直接アプリに渡せます（Web Share API）。
 *   これはブラウザが持っている仕組みで、
 *   <b>渡した先はあなたの端末の中のアプリです。</b>
 *   どこかのサーバーを経由しません。
 *
 * つまり:
 *   ・準備は全部こちらでやる（文章・ハッシュタグ・出す時間）
 *   ・最後の「出す」だけ、あなたが一度触れる
 *   ・その一度で、投稿の中身は完成している
 *
 *   自動で出すのと、手数はほとんど変わりません。
 *   違うのは、出す前に必ず一度あなたの目を通ること。
 *   それは、悪いことではないはずです。
 */

/** SNSごとの、開く先と癖 */
const SNSたち = {
    Instagram: {
        開く: 'instagram://camera',
        webで開く: 'https://www.instagram.com/',
        癖: '文章は自動で入りません。写してから貼ってください（写す操作はこちらで行います）。',
        字数: 2200,
    },
    X: {
        // Xは、文章を持ったまま開ける
        開く: (文) => 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(文),
        癖: '文章を持ったまま開きます。そのまま出せます。',
        字数: 280,
    },
    Threads: {
        開く: (文) => 'https://www.threads.net/intent/post?text=' + encodeURIComponent(文),
        癖: '文章を持ったまま開きます。',
        字数: 500,
    },
    TikTok: {
        開く: 'snssdk1233://',
        webで開く: 'https://www.tiktok.com/upload',
        癖: '動画を選んでから、文章を貼ってください。',
        字数: 2200,
    },
    YouTube: {
        開く: 'https://studio.youtube.com/',
        癖: 'ショート・動画の説明欄に貼ってください。',
        字数: 5000,
    },
};

/**
 * この場所（プラットフォーム名）の決まりを探す。
 *
 * なぜこれが要るのか:
 *   SNSたち は「アプリの開き方の癖」を知っている専用の辞書で、
 *   ここに載っている5つ（Instagram/X/Threads/TikTok/YouTube）にしか
 *   対応していなかった。
 *
 *   一方、設定ページ「SNS連携の媒体」で本人が自由に追加・削除できる
 *   一覧（AREGLM_PROFILE.sns）は、初期状態でFacebookを含む別の4つ
 *   （Instagram/Facebook/TikTok/YouTube）で、本人が追加した媒体は
 *   ここにしか載らない。
 *
 *   2つの一覧が別々に存在し、「投稿作成」のプルダウンと
 *   「出先から投稿する」のボタン列とで、出てくる媒体の数が
 *   食い違っていた（実機テストで発見）。
 *
 *   ここで一本化する：どの媒体が「ある」かは、必ず
 *   AREGLM_PROFILE.sns（本人が管理できる一覧）を正とする。
 *   SNSたち は、その中の一部について「アプリの開き方」を
 *   知っているだけの追加情報として使う。
 *   本人が独自に追加した媒体（開き方を知らないもの）は、
 *   その媒体のURLを開く・文章は写すだけ、という汎用の動きにする。
 */
function 決まりを探す(場所) {
    if (SNSたち[場所]) return SNSたち[場所];

    // 名前の大文字小文字だけが違う場合も同じとみなす
    const 一致名 = Object.keys(SNSたち).find((k) => k.toLowerCase() === String(場所 || '').toLowerCase());
    if (一致名) return SNSたち[一致名];

    // AREGLM_PROFILE.sns にあるが、開き方までは知らない媒体。
    // アカウントのURLを開く汎用の動きにする。
    const 登録 = Object.values(AREGLM_PROFILE?.sns || {}).find(
        (s) => (s.name || '').toLowerCase() === String(場所 || '').toLowerCase());
    if (登録) {
        return {
            webで開く: 登録.url,
            癖: '文章は自動で入りません。写してから貼ってください（写す操作はこちらで行います）。',
            字数: 2200,
        };
    }
    return null;
}

/**
 * 文章を写す。
 *
 * 出す直前に写しておけば、貼るだけで済む。
 * 「コピーしてください」と言わず、こちらで写す。
 */
async function 文章を写す(文) {
    try {
        await navigator.clipboard.writeText(文);
        return true;
    } catch {
        // 許可が下りない環境がある。そのときは選択状態にして渡す。
        const 欄 = document.createElement('textarea');
        欄.value = 文;
        欄.style.position = 'fixed';
        欄.style.opacity = '0';
        document.body.appendChild(欄);
        欄.select();
        let よい = false;
        try { よい = document.execCommand('copy'); } catch { よい = false; }
        欄.remove();
        return よい;
    }
}

/**
 * 端末の共有に渡す。
 *
 * スマホなら、ここからアプリを直接選べる。
 * 渡した先は端末の中のアプリで、どこかのサーバーではない。
 */
async function 端末の共有に渡す(文, 題) {
    if (!navigator.share) return { ok: false, 訳: 'この端末は共有に対応していません' };
    try {
        await navigator.share({ text: 文, title: 題 || 'AReGLM' });
        return { ok: true };
    } catch (e) {
        // 本人がやめたときも例外になる。失敗と区別する。
        if (e && e.name === 'AbortError') return { ok: false, やめた: true };
        return { ok: false, 訳: e.message };
    }
}

async function render遠隔投稿() {
    const 箱 = document.getElementById('remote-post');
    if (!箱) return;

    箱.innerHTML = '';

    /* --- いまの端末で何ができるか --- */
    const できること = {
        共有: !!navigator.share,
        写す: !!(navigator.clipboard && navigator.clipboard.writeText),
        スマホ: /iPhone|iPad|Android/.test(navigator.userAgent),
    };

    const 状態 = document.createElement('p');
    状態.className = できること.共有 ? 'guard-on' : 'hint';
    状態.textContent = できること.共有
        ? 'この端末は共有に対応しています。下書きを選べば、そのままアプリに渡せます。'
        : 'この端末は共有に対応していません。文章を写して、アプリに貼る形になります。';
    箱.appendChild(状態);

    /* --- 下書きの一覧 --- */
    let 下書き = [];
    try {
        下書き = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
    } catch { 下書き = []; }

    const 出せる = 下書き.filter((x) => x.caption || x.text || x.本文);

    if (!出せる.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'まだ下書きがありません。'
            + '上の「投稿作成」で作ると、ここから出せるようになります。';
        箱.appendChild(p);
    } else {
        出せる.slice(0, 10).forEach((x) => 下書きを出す(箱, x));
    }

    /* --- その場で書いて出す --- */
    const 見出し = document.createElement('h5');
    見出し.className = 'rule-head';
    見出し.textContent = 'その場で書いて出す';
    箱.appendChild(見出し);

    const 欄 = document.createElement('textarea');
    欄.id = 'remote-post-text';
    欄.rows = 4;
    欄.placeholder = 'ここに書いて、下のSNSを選ぶと、そのまま出せます';
    箱.appendChild(欄);

    const 並び = document.createElement('div');
    並び.className = 'remote-sns-row';
    // 「本人が管理できる媒体一覧（設定 → SNS連携の媒体）」を正とする。
    // 追加・削除した分が、ここにもそのまま反映される。
    Object.values(AREGLM_PROFILE?.sns || {}).forEach((s) => {
        const 名 = s.name;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-secondary';
        b.textContent = 名;
        b.addEventListener('click', () => 出す(名, 欄.value, b));
        並び.appendChild(b);
    });
    箱.appendChild(並び);

    if (できること.共有) {
        const 共有 = document.createElement('button');
        共有.type = 'button';
        共有.className = 'btn btn-primary';
        共有.textContent = '📤 端末の共有から選ぶ（どのアプリにも渡せます）';
        共有.addEventListener('click', async () => {
            const 文 = 欄.value.trim();
            if (!文) { showNotification('先に書いてください', 'error'); return; }
            const r = await 端末の共有に渡す(文);
            if (r.ok) showNotification('渡しました', 'success');
            else if (!r.やめた) showNotification(r.訳 || '渡せませんでした', 'error');
        });
        箱.appendChild(共有);
    }

    /* --- 正直に書く --- */
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>公式APIにはつなぎません。</b>'
        + 'つなぐと「外へ送らない」という決まりが崩れるためです。<br>'
        + '代わりに、端末そのものが持っている共有を使います。'
        + '<b>渡した先はあなたの端末の中のアプリで、どこかのサーバーを経由しません。</b><br>'
        + '準備は全部こちらでやります。'
        + '最後の「出す」だけ、あなたが一度触れます。'
        + '<b>自動で出すのと、手数はほとんど変わりません。</b>'
        + '違うのは、出す前に必ず一度あなたの目を通ることだけです。';
    箱.appendChild(断り);
}

function 下書きを出す(箱, x) {
    const 文 = x.caption || x.text || x.本文 || '';
    const 場所 = x.platform || x.場所 || 'Instagram';

    const 札 = document.createElement('div');
    札.className = 'remote-draft';

    const 上 = document.createElement('div');
    上.className = 'remote-draft-head';
    const 印 = document.createElement('b');
    印.textContent = 場所;
    上.appendChild(印);

    // 「投稿作成」で選んだ投稿形式（フィード／リール／ストーリーズ／ショッピング）を、
    // ここでも分かるように出す。sns.js の AREGLM_SNS_POST_FORMATS を正とする。
    const 形式定義 = (window.AREGLM_SNS_POST_FORMATS || {})[x.format];
    if (形式定義) {
        const 形式印 = document.createElement('span');
        形式印.className = `sns-format-badge ${形式定義.badgeClass || ''}`;
        形式印.textContent = 形式定義.label;
        上.appendChild(形式印);
    }
    if (x.date || x.日) {
        const s = document.createElement('small');
        s.textContent = x.date || x.日;
        上.appendChild(s);
    }
    札.appendChild(上);

    const 本 = document.createElement('p');
    本.textContent = 文.slice(0, 120) + (文.length > 120 ? '…' : '');
    札.appendChild(本);

    // 形式ごとの、投稿するときに忘れやすい準備事項を出しておく。
    // （公式APIを使わず自分で操作する方針のため、ここは「本人への申し送り」であって、
    // ツールが自動でリール化・タグ付けをするわけではない）
    if (x.videoNote) {
        const 注 = document.createElement('p');
        注.className = 'hint';
        注.textContent = `🎬 動画の構成メモ: ${x.videoNote}`;
        札.appendChild(注);
    }
    if (x.carouselNote) {
        const 注 = document.createElement('p');
        注.className = 'hint';
        注.style.whiteSpace = 'pre-wrap';
        注.textContent = `🎠 スライド構成: ${x.carouselNote}`;
        札.appendChild(注);
    }
    if (x.sticker) {
        const 注 = document.createElement('p');
        注.className = 'hint';
        注.textContent = `⭐ ステッカー案: ${x.sticker}`;
        札.appendChild(注);
    }
    if (x.taggedProducts && x.taggedProducts.length) {
        const 注 = document.createElement('p');
        注.className = 'hint';
        注.textContent = `🛍 商品タグ: ${x.taggedProducts.join('、')}`;
        札.appendChild(注);
    }

    const 決まり = 決まりを探す(場所) || SNSたち.Instagram;
    if (文.length > 決まり.字数) {
        const 注 = document.createElement('small');
        注.className = 'remote-warn';
        注.textContent = `${場所}の上限 ${決まり.字数}字 を ${文.length - 決まり.字数}字 こえています`;
        札.appendChild(注);
    }

    const 並び = document.createElement('div');
    並び.className = 'remote-sns-row';

    const 出すボタン = document.createElement('button');
    出すボタン.type = 'button';
    出すボタン.className = 'btn btn-sm btn-primary';
    出すボタン.textContent = `${場所}で出す`;
    出すボタン.addEventListener('click', () => 出す(場所, 文, 出すボタン, x.format));
    並び.appendChild(出すボタン);

    if (navigator.share) {
        const 共有 = document.createElement('button');
        共有.type = 'button';
        共有.className = 'btn btn-sm btn-secondary';
        共有.textContent = '📤 共有';
        共有.addEventListener('click', async () => {
            const r = await 端末の共有に渡す(文);
            if (r.ok) showNotification('渡しました', 'success');
            else if (!r.やめた) showNotification(r.訳 || '渡せませんでした', 'error');
        });
        並び.appendChild(共有);
    }

    札.appendChild(並び);
    箱.appendChild(札);
}

/**
 * 出す。
 *
 * 「コピーしてください」とは言わない。
 * 写すところまでこちらでやって、アプリを開く。
 */
async function 出す(場所, 文, ボタン, 投稿形式) {
    const 本文 = String(文 || '').trim();
    if (!本文) { showNotification('先に書いてください', 'error'); return; }

    const 決まり = 決まりを探す(場所);
    if (!決まり) { showNotification(`${場所}は分かりません`, 'error'); return; }

    if (本文.length > 決まり.字数) {
        if (!confirm(`${場所}の上限 ${決まり.字数}字 を ${本文.length - 決まり.字数}字 こえています。`
            + 'このまま進めますか。')) return;
    }

    const 元 = ボタン ? ボタン.textContent : '';
    if (ボタン) { ボタン.disabled = true; ボタン.textContent = '用意しています…'; }

    // まず写す。貼るだけで済むようにしておく。
    const 写せた = await 文章を写す(本文);

    // 開く先を決める。専用の開き方（開く）を知らない媒体は、
    // アカウントのページ（webで開く）をそのまま開く。
    if (決まり.開く) {
        const 先 = typeof 決まり.開く === 'function' ? 決まり.開く(本文) : 決まり.開く;
        const 窓 = window.open(先, '_blank');
        if (!窓 && 決まり.webで開く) window.open(決まり.webで開く, '_blank');
    } else if (決まり.webで開く) {
        window.open(決まり.webで開く, '_blank');
    }

    showNotification(
        写せた
            ? `文章を写しました。${場所}を開きます。${決まり.癖}`
            : `${場所}を開きます。${決まり.癖}`,
        'success');

    // 出したことを、成績の下ごしらえとして残しておく。
    // あとで数字を入れるとき、探さなくて済む。
    if (typeof 成績を残す === 'function') {
        const 形式定義 = (window.AREGLM_SNS_POST_FORMATS || {})[投稿形式];
        成績を残す({
            場所,
            本文,
            型: 形式定義?.型 || '写真',
            表示: 0, 反応: 0, 流入: 0,
        });
    }

    if (ボタン) { ボタン.disabled = false; ボタン.textContent = 元; }
}

function init遠隔投稿() {
    if (document.getElementById('remote-post')) render遠隔投稿();
}

window.init遠隔投稿 = init遠隔投稿;
window.render遠隔投稿 = render遠隔投稿;
