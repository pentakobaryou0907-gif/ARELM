/**
 * SNS — AReGLM 公式アカウント連携
 */
function initSns() {
    document.getElementById('sns-post-form')?.addEventListener('submit', handleSnsPost);
    document.getElementById('sns-auto-promo-btn')?.addEventListener('click', runAutoPromo);
    document.getElementById('sns-trend-analyze-btn')?.addEventListener('click', analyzeTrendsWithAi);
    document.getElementById('refresh-sns-btn')?.addEventListener('click', loadSnsData);
    document.getElementById('sns-gen-btn')?.addEventListener('click', generateSnsCaptions);
    document.getElementById('sns-gen-type')?.addEventListener('change', 投稿文の型が変わった);
    document.getElementById('sns-post-format')?.addEventListener('change', 投稿形式が変わった);
    document.getElementById('sns-open-remote-btn')?.addEventListener('click', SNSを遠隔操作で開く);
    document.getElementById('faq-gen-btn')?.addEventListener('click', draftCustomerReply);
    if (typeof init転換率 === 'function') init転換率();
    populateSnsPlatformSelect();
    populateSnsProductSelect();
    投稿形式が変わった();
    loadSnsData();
    renderSnsStrategyGuide();
    renderSnsPlatformData();
}

/**
 * Instagramの投稿形式（フィード写真・リール・ストーリーズ・ショッピング投稿）ごとに、
 * 「投稿作成」で必要になる項目だけを出し分ける。
 *
 * 公式APIは使わない方針のまま（SNSを遠隔操作で開く 参照）なので、
 * ここで用意するのはあくまで下書き・準備（構成メモ・ステッカー案・商品タグ）であり、
 * 実際にリール動画を書き出したり、Instagram上でタグ付けを実行したりはしない。
 */
function 投稿形式が変わった() {
    const 形式 = document.getElementById('sns-post-format')?.value || 'feed';
    const 表示 = {
        'sns-post-reel-wrap': 形式 === 'reel',
        'sns-post-story-wrap': 形式 === 'story',
        'sns-post-shopping-wrap': 形式 === 'shopping',
    };
    Object.entries(表示).forEach(([id, 出す]) => {
        const 枠 = document.getElementById(id);
        if (枠) 枠.hidden = !出す;
    });
    if (形式 === 'shopping') populateSnsProductTags();
}

/** ショッピング投稿用に、在庫の商品をチェックボックスで選べるようにする */
function populateSnsProductTags() {
    const 箱 = document.getElementById('sns-post-product-tags');
    if (!箱) return;
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    if (!products.length) {
        箱.innerHTML = '<p class="empty">（商品がありません。先に在庫で登録してください）</p>';
        return;
    }
    箱.innerHTML = products
        .map((p, i) => `<label>
            <input type="checkbox" class="sns-product-tag-check" value="${i}">
            ${AReGLM_SECURITY.sanitizeHtml(p.name || '（名称未設定）')}${p.price ? `（¥${AReGLM_SECURITY.sanitizeHtml(String(p.price))}）` : ''}
        </label>`)
        .join('');
}

/** 商品セレクトを埋める（投稿文づくりの元にする） */
function populateSnsProductSelect() {
    const sel = document.getElementById('sns-gen-product');
    if (!sel) return;
    const products = JSON.parse(localStorage.getItem('products') || '[]');
    sel.innerHTML = products.length
        ? products.map((p, i) => `<option value="${i}">${AReGLM_SECURITY.escapeAttr(p.name || '（名称未設定）')}</option>`).join('')
        : '<option value="">（商品がありません。先に在庫で登録してください）</option>';
}

/** お客様からの質問に、返信の下書きを作る（AI受付） */
async function draftCustomerReply() {
    const 質問欄 = document.getElementById('faq-question');
    const 結果欄 = document.getElementById('faq-gen-result');
    const btn = document.getElementById('faq-gen-btn');
    const 質問 = (質問欄?.value || '').trim();
    if (!質問 || !結果欄) {
        showNotification('お客様からの質問を入力してください', 'error');
        return;
    }

    結果欄.hidden = false;
    結果欄.textContent = '下書きを作っています…';
    if (btn) btn.disabled = true;

    try {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const r = await fetch('/api/customer-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 質問, 商品一覧: products, ブランド: 'AReGLM' }),
        }).then((y) => y.json());

        結果欄.textContent = r.ok ? r['返信案'] : (r.訳 || '下書きを作れませんでした');
    } catch (e) {
        結果欄.textContent = 'つながりませんでした: ' + e.message;
    } finally {
        if (btn) btn.disabled = false;
    }
}

/** AIに投稿文を3パターン作ってもらう */
/**
 * SNSの実際の操作（ログイン・投稿・確認）は公式APIを使わず、
 * 画面を映して操作する「遠隔操作」で行う（本人の方針）。
 * ここから1回で、遠隔操作の「画面を見る」タブを開き、映し始めるところまで進める。
 */
function SNSを遠隔操作で開く() {
    if (typeof switchPage === 'function') switchPage('remote');
    setTimeout(() => {
        document.querySelector('[data-remote-tab="screen"]')?.click();
        setTimeout(() => {
            const 映すボタン = document.querySelector('.stop-box button');
            if (映すボタン && 映すボタン.textContent.includes('映し始める')) 映すボタン.click();
        }, 100);
    }, 50);
}

/** 「工程公開」なら保管庫の写真、「DM下書き」ならDMの目的を、型に応じて出し分ける */
async function 投稿文の型が変わった() {
    const 型 = document.getElementById('sns-gen-type')?.value;

    const dm枠 = document.getElementById('sns-gen-dm-wrap');
    if (dm枠) dm枠.hidden = 型 !== 'DM下書き';

    const 枠 = document.getElementById('sns-gen-photo-wrap');
    if (!枠) return;
    枠.hidden = 型 !== '工程公開';
    if (枠.hidden) return;

    const sel = document.getElementById('sns-gen-photo');
    if (!sel || typeof 一覧を読む !== 'function') return;

    sel.innerHTML = '<option value="">読み込み中…</option>';
    const 一覧 = (await 一覧を読む()).filter((x) => x.種類 === '画像' && x.覚え書き);
    if (!一覧.length) {
        sel.innerHTML = '<option value="">（覚え書き付きの写真が保管庫にありません）</option>';
        return;
    }
    sel.innerHTML = 一覧
        .map((x) => `<option value="${x.id}" data-note="${AReGLM_SECURITY.escapeAttr(x.覚え書き)}">${AReGLM_SECURITY.sanitizeHtml(x.名前)}（${AReGLM_SECURITY.sanitizeHtml(x.覚え書き.slice(0, 20))}…）</option>`)
        .join('');
}

async function generateSnsCaptions() {
    const btn = document.getElementById('sns-gen-btn');
    const box = document.getElementById('sns-gen-results');
    const sel = document.getElementById('sns-gen-product');
    const toneSel = document.getElementById('sns-gen-tone');
    const typeSel = document.getElementById('sns-gen-type');
    if (!box || !sel) return;

    const products = JSON.parse(localStorage.getItem('products') || '[]');
    const p = products[Number(sel.value)];
    if (!p) {
        showNotification('商品を選んでください', 'error');
        return;
    }

    const 型 = typeSel?.value || 'キャプション';

    let 商品情報 = [
        `商品名: ${p.name || ''}`,
        p.price ? `価格: ¥${p.price}` : '',
        p.description ? `特徴: ${p.description}` : '',
    ].filter(Boolean).join('\n');

    if (型 === 'トーク台本') {
        // 台本には、商品の情報だけでなく「今の状況」も少し添える
        // （フックに使える数字・事実があると、話しやすい台本になるため）。
        const 状況 = typeof reportTodayStatus === 'function' ? reportTodayStatus() : '';
        商品情報 = `${商品情報}${状況 ? `\n\n【今の状況】\n${状況}` : ''}`;
    }

    if (型 === '工程公開') {
        const photoSel = document.getElementById('sns-gen-photo');
        const 覚え書き = photoSel?.selectedOptions?.[0]?.dataset?.note || '';
        if (!覚え書き) {
            showNotification('保管庫の写真を選んでください（覚え書きが無いものは選べません）', 'error');
            return;
        }
        商品情報 = `${商品情報}\n\n写真の内容（本人の覚え書き）: ${覚え書き}`;
    }

    if (型 === 'DM下書き') {
        const 目的 = document.getElementById('sns-gen-dm-purpose')?.value || '新規フォロワー御礼';
        商品情報 = `【DMの目的】${目的}\n\n${商品情報}`;
    }

    box.innerHTML = '<li class="sns-gen-loading" id="sns-gen-loading-line">作っています…（この端末のAIなので少し時間がかかります・0秒）</li>';
    if (btn) btn.disabled = true;

    // 待っている間、固まったと誤解されないよう経過秒数を出す。
    const 開始時刻 = Date.now();
    const 経過表示 = setInterval(() => {
        const 行 = document.getElementById('sns-gen-loading-line');
        if (!行) { clearInterval(経過表示); return; }
        const 秒 = Math.floor((Date.now() - 開始時刻) / 1000);
        行.textContent = `作っています…（この端末のAIなので少し時間がかかります・${秒}秒）`;
    }, 1000);

    try {
        const r = await fetch('/api/sns/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 商品情報, トーン: toneSel?.value || 'カジュアル', 件数: (型 === '工程公開' || 型 === 'ストーリーズ' || 型 === 'DM下書き') ? 2 : 3, 型 }),
        }).then((y) => y.json());

        if (!r.ok) {
            // 失敗したとき、同じボタンをもう一度押せばよいのかが
            // 画面から分かりにくかった。その場に再試行ボタンを出す。
            box.innerHTML = '';
            const 行 = document.createElement('li');
            行.className = 'sns-gen-loading';
            行.textContent = r.訳 || '作れませんでした';
            box.appendChild(行);

            const 再試行 = document.createElement('button');
            再試行.type = 'button';
            再試行.className = 'btn btn-sm btn-secondary';
            再試行.textContent = 'もう一度試す';
            再試行.style.marginTop = '0.5rem';
            再試行.addEventListener('click', generateSnsCaptions);
            box.appendChild(再試行);
            return;
        }

        box.innerHTML = '';
        (r['パターン'] || []).forEach((文, i) => {
            const li = document.createElement('li');
            li.className = 'sns-gen-item';

            const 本文 = document.createElement('p');
            本文.textContent = 文;
            li.appendChild(本文);

            const 使うボタン = document.createElement('button');
            使うボタン.type = 'button';
            使うボタン.className = 'btn btn-sm btn-secondary';
            使うボタン.textContent = `これを使う（${i + 1}）`;
            使うボタン.addEventListener('click', () => {
                const caption = document.getElementById('sns-caption');
                if (caption) {
                    caption.value = 文;
                    caption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
            li.appendChild(使うボタン);
            box.appendChild(li);
        });
    } catch (e) {
        box.innerHTML = `<li class="sns-gen-loading">つながりませんでした: ${AReGLM_SECURITY.sanitizeHtml(e.message)}</li>`;
    } finally {
        clearInterval(経過表示);
        if (btn) btn.disabled = false;
    }
}

/**
 * 自主研究「アパレルブランドにおいてSNS投稿の内容の違いが購買意欲に与える影響」
 * （20123019 小林遼汰／2025年7月16日版）の検証手法STEP3で選定された3投稿系統。
 *
 * 重要: 最新版ではゼミ指導を受けて「SNSを一つに絞る」方針となり、
 * 検証期間中の投稿は Instagram のみに限定されている（STEP1）。
 * そのため全類型のプラットフォームは instagram で固定する。
 *
 * 購買意欲の定義（スライド4）:
 * 「身に付けたい、所有したい、それによって自分を表現したいと思い、
 * 　実際に購入を決意する心理状態」
 */
const AREGLM_SNS_CONTENT_TYPES = [
    {
        id: 'review',
        title: '① 商品レビュー／紹介動画・写真（商品単体の紹介）',
        hypothesis: '「損をしたくない」というInstagramでの流行に沿い、「可愛い！欲しい！」と思わせるのに有効。商品の詳細も知れる',
        format: 'カルーセル投稿：1枚目=他社商品との比較を含む短いリール、2枚目以降=商品単体の詳細写真。AIも活用',
        platform: 'instagram',
        template: '【AReGLM】{商品名}\n\n実際に着てみてわかった特徴を正直にレビューします。\nサイズ感 / 素材 / 着回しやすさ…\n\n保存して比較の参考にしてください✅'
    },
    {
        id: 'worldview',
        title: '② モデルを使った写真撮影（モデル着用・世界観）',
        hypothesis: 'モデル着用で商品の詳細が伝わり、憧れと世界観からブランドの基盤を設計し「この服が欲しい」と思わせる（HUMAN MADE社員ヒアリングの知見）',
        format: '写真のみ・複数枚カルーセル。カメラマン撮影の高画質コーデ写真、またはAIモデルでルックブック風に',
        platform: 'instagram',
        template: '{商品名}\n\n———\n\nAReGLM'
    },
    {
        id: 'streetsnap',
        title: '③ ストリートスナップ＋モデルインタビュー（コーデ紹介）',
        hypothesis: '「この服を着て街を歩いたら自分もこれくらいオシャレになれる」と日常に落とし込んだリアルな妄想（強烈な物欲）を膨らませる',
        format: 'リール（縦型動画）。コーディネートの静止画を複数挿入し、ゆっくり見られる形にする',
        platform: 'instagram',
        template: '街で{商品名}を着てみた。\n\nどんな時に着たい？コメントで教えてください👇\n\n#AReGLM'
    }
];

/** SNS別の特性比較（投稿先を決めるときの判断材料） */
const AREGLM_SNS_PLATFORM_DATA = [
    {
        platform: 'Instagram',
        users: '約6,600万人／月',
        age: '20〜30代',
        format: '写真・リール動画・DM・ストーリー',
        purchase: 'ショッピング機能あり → 商品訴求に直結',
        fit: '◎ ビジュアル重視',
        reference: 'アパレル購買前の参照率 約50%'
    },
    {
        platform: 'TikTok',
        users: '約4,200万人／月',
        age: '10〜20代',
        format: '短尺縦型動画・写真',
        purchase: '認知・バズメイン → 話題拡散力が高い',
        fit: '○ 若年層獲得',
        reference: 'アパレル購買前の参照率 約20〜25%'
    }
];

function renderSnsStrategyGuide() {
    const box = document.getElementById('sns-strategy-guide');
    if (!box) return;
    const platLabel = { instagram: 'Instagram向き', tiktok: 'TikTok向き' };
    box.innerHTML = AREGLM_SNS_CONTENT_TYPES.map(
        (t) => `<article class="sns-strategy-card">
            <h4>${AReGLM_SECURITY.sanitizeHtml(t.title)}</h4>
            <span class="sns-plat-badge plat-${AReGLM_SECURITY.sanitizeHtml(t.platform || 'instagram')}">${AReGLM_SECURITY.sanitizeHtml(platLabel[t.platform] || 'Instagram向き')}</span>
            <p class="hint">${AReGLM_SECURITY.sanitizeHtml(t.hypothesis)}</p>
            <p>${AReGLM_SECURITY.sanitizeHtml(t.format)}</p>
            <button type="button" class="btn btn-sm btn-secondary sns-use-template" data-type="${t.id}">この形式で下書きを作成</button>
        </article>`
    ).join('');

    box.querySelectorAll('.sns-use-template').forEach((btn) => {
        btn.addEventListener('click', () => {
            const type = AREGLM_SNS_CONTENT_TYPES.find((t) => t.id === btn.dataset.type);
            if (!type) return;
            const platformSel = document.getElementById('sns-platform');
            const captionBox = document.getElementById('sns-caption');
            // 投稿類型ごとに研究資料で適性が高いとされたSNSを初期選択
            if (platformSel) platformSel.value = type.platform || 'instagram';
            if (captionBox) {
                captionBox.value = type.template;
                captionBox.focus();
            }
            showNotification(`「${type.title}」のテンプレートを読み込みました`, 'info');
            logActivity(`SNS投稿戦略ガイド: ${type.title} を使用`, { category: 'sns', text: type.title });
        });
    });
}

function renderSnsPlatformData() {
    const box = document.getElementById('sns-platform-data');
    if (!box) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    box.innerHTML = AREGLM_SNS_PLATFORM_DATA.map(
        (p) => `<article class="sns-data-card">
            <h4>${s(p.platform)} <small>${s(p.fit)}</small></h4>
            <dl>
                <dt>利用者数</dt><dd>${s(p.users)}</dd>
                <dt>主要年代</dt><dd>${s(p.age)}</dd>
                <dt>コンテンツ形式</dt><dd>${s(p.format)}</dd>
                <dt>購買との関連</dt><dd>${s(p.purchase)}</dd>
                <dt>購買前参照率</dt><dd><strong>${s(p.reference)}</strong></dd>
            </dl>
        </article>`
    ).join('');
}

function populateSnsPlatformSelect() {
    const sel = document.getElementById('sns-platform');
    if (!sel || !AREGLM_PROFILE) return;
    sel.innerHTML = Object.entries(AREGLM_PROFILE.sns)
        .map(([id, s]) => `<option value="${id}">${s.name}</option>`)
        .join('');
}

function loadSnsData() {
    renderSnsAccounts();
    renderSnsQueue();
    // 「出先から投稿する」の下書き一覧は、起動時に一度描いたきり
    // キューが増えても描き直されず、いつまでも「まだ下書きがありません」
    // のままだった。同じキュー（areglm_sns_queue）を見ているので、
    // ここでも一緒に描き直す。
    if (typeof render遠隔投稿 === 'function') render遠隔投稿();
}

function renderSnsAccounts() {
    const grid = document.getElementById('sns-platform-grid');
    if (!grid || !AREGLM_PROFILE) return;

    // 全プラットフォームが「API未設定」だと、初めて見た人には
    // 「何もできない」ように見える。下書き作成はAPIなしで使えることを伝える。
    const 案内 = document.getElementById('sns-onboarding-banner');
    if (案内) {
        const 一つでも設定済み = Object.keys(AREGLM_PROFILE.sns).some((id) => getApiConfig().sns?.[id]?.connected);
        案内.hidden = 一つでも設定済み;
    }

    grid.innerHTML = Object.entries(AREGLM_PROFILE.sns)
        .map(([id, s]) => {
            const configured = getApiConfig().sns?.[id]?.connected;
            return `<article class="sns-account-card">
                <h4>${AReGLM_SECURITY.sanitizeHtml(s.name)}</h4>
                <p>${AReGLM_SECURITY.sanitizeHtml(s.handle)}</p>
                <a href="${AReGLM_SECURITY.escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary">アカウントを開く</a>
                <span class="status-badge ${configured ? 'connected' : ''}">${configured ? 'API設定済' : 'API未設定'}</span>
                <button type="button" class="btn btn-sm btn-secondary sns-open-compose" data-platform="${id}">投稿を作成</button>
            </article>`;
        })
        .join('');

    grid.querySelectorAll('.sns-open-compose').forEach((btn) => {
        btn.addEventListener('click', () => {
            const sel = document.getElementById('sns-platform');
            if (sel) sel.value = btn.dataset.platform;
            document.getElementById('sns-caption')?.focus();
        });
    });
}

/**
 * 投稿形式（キューに保存する id）ごとの表示名・分析用の「型」・バッジの色分けクラス。
 * SNS成績.js の型別分析（写真・動画・文章）と合わせられるよう、型はそこに合わせる。
 */
const AREGLM_SNS_POST_FORMATS = {
    feed: { label: '🖼 フィード', 型: '写真', badgeClass: '' },
    reel: { label: '🎬 リール', 型: '動画', badgeClass: 'fmt-reel' },
    story: { label: '⭐ ストーリーズ', 型: '写真', badgeClass: 'fmt-story' },
    shopping: { label: '🛍 ショッピング', 型: '写真', badgeClass: 'fmt-shopping' },
};

function renderSnsQueue() {
    const tbody = document.getElementById('sns-queue-tbody');
    if (!tbody) return;
    const queue = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
    if (!queue.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">キューは空です</td></tr>';
        return;
    }
    tbody.innerHTML = queue
        .map((q) => {
            const profile = AREGLM_PROFILE.sns[q.platform];
            const link = profile?.url || '#';
            const fmt = AREGLM_SNS_POST_FORMATS[q.format] || AREGLM_SNS_POST_FORMATS.feed;
            return `<tr>
            <td><a href="${AReGLM_SECURITY.escapeAttr(link)}" target="_blank" rel="noopener">${AReGLM_SECURITY.sanitizeHtml(profile?.name || q.platform)}</a></td>
            <td><span class="sns-format-badge ${fmt.badgeClass}">${AReGLM_SECURITY.sanitizeHtml(fmt.label)}</span></td>
            <td>${AReGLM_SECURITY.sanitizeHtml((q.caption || '').slice(0, 50))}…</td>
            <td><span class="status-badge">${AReGLM_SECURITY.sanitizeHtml(q.status)}</span></td>
            <td>${new Date(q.scheduledAt || q.createdAt).toLocaleString('ja-JP')}</td>
            <td><button class="btn btn-sm btn-danger" onclick="removeSnsQueue('${q.id}')">取消</button></td>
        </tr>`;
        })
        .join('');
}

function handleSnsPost(e) {
    e.preventDefault();
    const platform = document.getElementById('sns-platform')?.value;
    const caption = document.getElementById('sns-caption')?.value?.trim();
    const format = document.getElementById('sns-post-format')?.value || 'feed';
    if (!platform || !caption) return;

    const policy = AReGLM_CONTENT_POLICY.validate(caption);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    // 形式ごとの追加項目。空欄なら保存しない（キューの表示・分析を汚さないため）。
    const videoNote = format === 'reel' ? (document.getElementById('sns-post-video-note')?.value || '').trim() : '';
    const sticker = format === 'story' ? (document.getElementById('sns-post-sticker')?.value || '').trim() : '';

    for (const extra of [videoNote, sticker]) {
        if (!extra) continue;
        const extraPolicy = AReGLM_CONTENT_POLICY.validate(extra);
        if (!extraPolicy.ok) {
            showNotification(extraPolicy.message, 'error');
            return;
        }
    }

    let taggedProducts = [];
    if (format === 'shopping') {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        taggedProducts = Array.from(document.querySelectorAll('.sns-product-tag-check:checked'))
            .map((el) => products[Number(el.value)]?.name)
            .filter(Boolean);
        if (!taggedProducts.length) {
            showNotification('ショッピング投稿は、タグ付けする商品を1つ以上選んでください', 'error');
            return;
        }
    }

    const shop = AREGLM_PROFILE.suzuriShop;
    const fullCaption = caption.includes(shop) ? caption : `${caption}\n\n🛍 ${shop}`;

    const queue = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
    queue.push({
        id: 'sns_' + Date.now(),
        platform,
        format,
        caption: fullCaption,
        videoNote: videoNote || undefined,
        sticker: sticker || undefined,
        taggedProducts: taggedProducts.length ? taggedProducts : undefined,
        profileUrl: AREGLM_PROFILE.sns[platform]?.url,
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    localStorage.setItem('areglm_sns_queue', JSON.stringify(queue));

    e.target.reset();
    投稿形式が変わった();
    loadSnsData();
    logActivity(`${AREGLM_PROFILE.sns[platform]?.name} 投稿をキューに追加（${AREGLM_SNS_POST_FORMATS[format]?.label || format}）`);
    showNotification('投稿をキューに追加しました（実際の投稿は「遠隔操作」または「出先から投稿する」から）', 'success');
}

function removeSnsQueue(id) {
    let queue = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
    queue = queue.filter((q) => q.id !== id);
    localStorage.setItem('areglm_sns_queue', JSON.stringify(queue));
    loadSnsData();
}

/**
 * @param 自動実行か  全自動ループ（15分ごと）から呼ばれたときは true。
 *
 * 「商品がありません」の案内は、ボタンを押した本人には有用だが、
 * 自動ループから毎回無条件に出すと、何も操作していないのに
 * 通知が湧いて出る形になり、「勝手に反応した」ように見えていた
 * （他の操作の直後にたまたま自動実行の周期が重なると、
 * 無関係な2つの通知が同時に出ているようにも見えていた）。
 * 自動実行のときは、画面を騒がせず静かに諦める。
 */
async function runAutoPromo(自動実行か = false) {
    const products = JSON.parse(localStorage.getItem('products') || '[]').filter((p) => p.source === 'suzuri');
    if (!products.length) {
        if (!自動実行か) {
            showNotification('先に在庫ページで「SUZURIから同期」してください', 'info');
        }
        return;
    }

    const platforms = Object.keys(AREGLM_PROFILE.sns);
    const queue = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');

    products.slice(0, 4).forEach((p, i) => {
        const plat = platforms[i % platforms.length];
        queue.push({
            id: 'promo_' + Date.now() + i,
            platform: plat,
            format: 'feed',
            caption: `【AReGLM】${p.name}\n${p.shopUrl || AREGLM_PROFILE.suzuriShop}`,
            profileUrl: AREGLM_PROFILE.sns[plat]?.url,
            status: 'scheduled',
            createdAt: new Date().toISOString()
        });
    });

    localStorage.setItem('areglm_sns_queue', JSON.stringify(queue));
    loadSnsData();
    if (!自動実行か) showNotification('全SNS向け宣伝をキューに追加しました', 'success');
}

async function analyzeTrendsWithAi() {
    const keyword = document.getElementById('sns-trend-product')?.value?.trim() || 'AReGLM アパレル';
    const out = document.getElementById('sns-trend-result');
    if (out) out.innerHTML = '<p class="hint">分析中…</p>';

    try {
        const text = await AReGLM_LOCAL_FIRST.complete({
            provider: document.getElementById('chat-ai-provider')?.value || 'local',
            history: [],
            userText: `「${keyword}」に関するSNSトレンドと投稿戦略を、Instagram/TikTok/YouTube向けに箇条書きで分析してください。AReGLMブランド（${AREGLM_PROFILE.suzuriShop}）向けです。`,
            attachments: [],
            mode: 'analyze'
        });
        if (out) {
            // AIの答えをそのまま入れていた。ストッパーが見つけた。
            out.textContent = '';
            const 枠 = document.createElement('div');
            枠.className = 'bubble-text';
            枠.textContent = text;
            枠.style.whiteSpace = 'pre-wrap';
            out.appendChild(枠);
        }
    } catch (e) {
        if (out) {
            out.innerHTML = `<p>${AReGLM_SECURITY.sanitizeHtml(e.message)}</p>
                <ul><li>サステナブル・ストリートウェア</li><li>ショート動画での着用シーン</li><li>設定でAIキーを登録すると詳細分析が可能</li></ul>`;
        }
    }
}

/**
 * SNS連携の媒体を、設定画面から増やせるようにする。
 *
 * 前は Instagram/Facebook/TikTok/YouTube の4つが js の中に
 * 書き込まれているだけで、X や note などを使いたくなっても
 * コードを直すしかなかった。
 * AREGLM_PROFILE.sns（この端末に保存される）を直接編集する形にし、
 * SNSページの一覧・投稿作成の選択肢は、いつも通りそこから作られる。
 */
function renderSnsPlatformManageList() {
    const box = document.getElementById('sns-platform-manage-list');
    if (!box || !AREGLM_PROFILE) return;

    const 一覧 = Object.entries(AREGLM_PROFILE.sns || {});
    if (!一覧.length) {
        box.innerHTML = '<li class="empty">まだ媒体がありません。下から追加できます。</li>';
        return;
    }

    box.innerHTML = 一覧
        .map(([id, s]) => `
            <li class="sns-platform-manage-row" data-id="${AReGLM_SECURITY.escapeAttr(id)}">
                <div class="sns-platform-manage-info">
                    <strong>${AReGLM_SECURITY.sanitizeHtml(s.name || id)}</strong>
                    <span class="hint">${AReGLM_SECURITY.sanitizeHtml(s.handle || '')}</span>
                </div>
                <button type="button" class="btn btn-sm btn-secondary sns-plat-edit" data-id="${AReGLM_SECURITY.escapeAttr(id)}">編集</button>
                <button type="button" class="btn btn-sm btn-danger sns-plat-remove" data-id="${AReGLM_SECURITY.escapeAttr(id)}">削除</button>
            </li>`)
        .join('');

    box.querySelectorAll('.sns-plat-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const 名 = AREGLM_PROFILE.sns[id]?.name || id;
            if (!confirm(`「${名}」をSNS連携の一覧から削除しますか？`)) return;
            const 残り = { ...AREGLM_PROFILE.sns };
            delete 残り[id];
            SNS媒体を保存する(残り);
            renderSnsPlatformManageList();
            populateSnsPlatformSelect();
            renderSnsAccounts();
        });
    });

    box.querySelectorAll('.sns-plat-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const s = AREGLM_PROFILE.sns[id];
            if (!s) return;
            const 名 = prompt('名前', s.name || id);
            if (名 === null) return;
            const ハンドル = prompt('ID・ハンドル名（任意）', s.handle || '');
            if (ハンドル === null) return;
            const url = prompt('アカウントURL', s.url || '');
            if (url === null) return;
            const 更新 = { ...AREGLM_PROFILE.sns, [id]: { ...s, name: 名.trim() || id, handle: ハンドル.trim(), url: url.trim() } };
            SNS媒体を保存する(更新);
            renderSnsPlatformManageList();
            populateSnsPlatformSelect();
            renderSnsAccounts();
        });
    });
}

function handleSnsPlatformAdd(e) {
    e.preventDefault();
    const 名 = document.getElementById('sns-plat-name')?.value.trim();
    const ハンドル = document.getElementById('sns-plat-handle')?.value.trim() || '';
    const url = document.getElementById('sns-plat-url')?.value.trim();
    if (!名 || !url) return;

    try {
        new URL(url);
    } catch {
        showNotification?.('アカウントURLの形が正しくありません', 'error');
        return;
    }

    // id は、一覧の中で重ならない形にする（同じ名前を2回足しても事故らないように）
    let base = 名.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'sns';
    let id = base;
    let n = 2;
    while (AREGLM_PROFILE.sns[id]) {
        id = `${base}${n}`;
        n += 1;
    }

    const 更新 = { ...AREGLM_PROFILE.sns, [id]: { name: 名, url, handle: ハンドル, apiId: id } };
    SNS媒体を保存する(更新);
    renderSnsPlatformManageList();
    populateSnsPlatformSelect();
    renderSnsAccounts();
    e.target.reset();
    showNotification?.(`「${名}」を追加しました`, 'success');
}

function initSnsPlatformManage() {
    document.getElementById('sns-platform-add-form')?.addEventListener('submit', handleSnsPlatformAdd);
    renderSnsPlatformManageList();
}

window.initSns = initSns;
window.loadSnsData = loadSnsData;
window.removeSnsQueue = removeSnsQueue;
window.renderSnsStrategyGuide = renderSnsStrategyGuide;
window.renderSnsPlatformData = renderSnsPlatformData;
window.initSnsPlatformManage = initSnsPlatformManage;
window.AREGLM_SNS_POST_FORMATS = AREGLM_SNS_POST_FORMATS;
