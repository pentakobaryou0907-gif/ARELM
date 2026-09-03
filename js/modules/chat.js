/**
 * AI — ChatGPT風 統一チャット（会話・分析・学習・制作）
 */
let chatAttachments = [];
let chatMode = 'chat';
let chatSending = false;

function initChat() {
    const form = document.getElementById('chat-form');
    const fileInput = document.getElementById('chat-file-input');
    const urlBtn = document.getElementById('chat-url-add-btn');
    const newChatBtn = document.getElementById('chat-new-btn');
    const input = document.getElementById('chat-input');

    if (form) form.addEventListener('submit', handleChatSubmit);

    // 入力欄は打つほど自動で伸びる
    input?.addEventListener('input', () => autoGrowChatInput(input));

    // URL・動画の追加欄は普段は隠しておく
    document.getElementById('chat-more-btn')?.addEventListener('click', () => {
        const extra = document.getElementById('composer-extra');
        if (extra) extra.hidden = !extra.hidden;
    });

    // 狭い画面ではサイドバーを重ねて開く
    document.getElementById('chat-menu-btn')?.addEventListener('click', () => {
        document.getElementById('chat-sidebar')?.classList.toggle('open');
    });
    if (fileInput) fileInput.addEventListener('change', handleChatFiles);
    if (urlBtn) urlBtn.addEventListener('click', handleChatUrl);
    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);
    renderChatHistoryList();

    document.querySelectorAll('.chat-mode-chip').forEach((chip) => {
        chip.addEventListener('click', () => setChatMode(chip.dataset.mode));
    });

    document.getElementById('chat-google-photos-btn')?.addEventListener('click', openGooglePhotosPicker);
    document.getElementById('chat-video-url-btn')?.addEventListener('click', addVideoUrl);

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form?.requestSubmit();
            }
        });
    }

    loadChatHistory();
    if (typeof populateAiSelects === 'function') populateAiSelects();
    renderChatWelcome();

    // 「画像を再生成」ボタンは壊れた画像カードの中に後から差し込まれるため、
    // 個別に付けず、親要素で拾う（委譲）。
    document.getElementById('chat-messages')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.bubble-regen-btn');
        if (!btn) return;
        画像を再生成する(btn.dataset.regenPrompt, btn);
    });

    // 会話の脳（自作AI ⇄ Claude）の切り替え
    document.getElementById('chat-brain-toggle')?.addEventListener('click', 脳を切り替える);
    脳の表示を直す();

    // AIの話し方（性格）。設定ページに書いた内容を、以後すべての会話に添える。
    const persona入力 = document.getElementById('ai-persona-input');
    const persona保存 = document.getElementById('ai-persona-save');
    const persona消去 = document.getElementById('ai-persona-clear');
    if (persona入力) persona入力.value = localStorage.getItem('areglm_ai_persona') || '';
    if (persona保存) {
        persona保存.addEventListener('click', () => {
            localStorage.setItem('areglm_ai_persona', (persona入力.value || '').trim());
            showNotification('AIの話し方を保存しました。次の会話から反映されます。', 'success');
        });
    }
    if (persona消去) {
        persona消去.addEventListener('click', () => {
            localStorage.removeItem('areglm_ai_persona');
            if (persona入力) persona入力.value = '';
            showNotification('既定の話し方に戻しました。', 'success');
        });
    }

    // URLの本文を読みに行くかどうか（設定ページの項目。既定は「読まない」）
    const url取得の入 = document.getElementById('url-fetch-enabled');
    if (url取得の入) {
        url取得の入.checked = localStorage.getItem('areglm_url_fetch_enabled') === 'true';
        url取得の入.addEventListener('change', (e) => {
            localStorage.setItem('areglm_url_fetch_enabled', e.target.checked ? 'true' : 'false');
            showNotification(
                e.target.checked
                    ? 'URLを添付すると、この端末から本文を読みに行きます。'
                    : 'URLの本文は読みに行きません（添付URLはリンクとしてのみ扱います）。',
                e.target.checked ? 'warning' : 'success'
            );
        });
    }
}

function setChatMode(mode) {
    chatMode = mode;
    document.querySelectorAll('.chat-mode-chip').forEach((c) => c.classList.toggle('active', c.dataset.mode === mode));
}

/* ---------- 会話に使う「脳」の切り替え（自作AI ⇄ Claude） ---------- */

const CHAT_BRAIN_KEY = 'areglm_chat_brain';

function Claudeを使うか() {
    return localStorage.getItem(CHAT_BRAIN_KEY) === 'claude';
}

function 脳の表示を直す() {
    const b = document.getElementById('chat-brain-toggle');
    const who = document.getElementById('chat-who');
    const claude = Claudeを使うか();
    if (b) {
        b.textContent = claude ? '脳: Claude' : '脳: 自作AI';
        b.classList.toggle('btn-accent', claude);
        b.classList.toggle('btn-secondary', !claude);
    }
    if (who) {
        who.innerHTML = claude
            ? 'Claude<small>会話は外部（Anthropic）へ送られます・従量課金</small>'
            : '自作AI<small>この端末の中だけで動きます</small>';
    }
}

async function 脳を切り替える() {
    if (Claudeを使うか()) {
        localStorage.removeItem(CHAT_BRAIN_KEY);
        脳の表示を直す();
        return;
    }

    // 切り替えてから毎回エラーになるのを避ける。
    // 足りないものがあれば、押した時点で何が足りないかを言う。
    const 足りないもの = [];
    const 鍵 = await AReGLM_SECURITY.loadApiKeySecure('ai', 'claude');
    if (!鍵) 足りないもの.push('APIキー（設定 → 外部AI（Claude））');
    if (typeof 使ってよいか === 'function' && !使ってよいか('claude')) {
        足りないもの.push('使用の許可（設定 → お金がかかる機能）');
    }
    if (足りないもの.length) {
        showNotification(
            `Claudeを使うには、あと ${足りないもの.join(' と ')} が要ります。`,
            'warn');
        return;
    }

    // 外へ出る前に、必ず一度はっきり確認する。
    const よいか = confirm(
        '会話の脳をClaudeに切り替えます。\n\n'
        + '・この後の会話内容（添付画像も含む）はAnthropicのサーバーへ送られます\n'
        + '・使った分だけ課金されます\n'
        + '・Claudeの答えはこの端末の知識にも蓄え、いずれ自作AIだけで答えられるように育てます\n\n'
        + 'よろしいですか？');
    if (!よいか) return;

    localStorage.setItem(CHAT_BRAIN_KEY, 'claude');
    脳の表示を直す();
}

/**
 * 何も無いときの画面。
 * いきなり空欄だけだと何を打てばよいか分からないので、
 * よく使う入り口をカードで出す。押すと入力欄に入る。
 */
const CHAT_SUGGESTIONS = [
    { title: '商品の説明文を書く', sub: '素材や特徴から下書きを作る', text: 'デニムジャケットの商品説明を書きたい' },
    { title: 'SNS投稿を考える', sub: '新作の告知文', text: '新作の告知をInstagramに投稿したい' },
    { title: 'トレンドを調べる', sub: 'いまのアパレルの傾向', text: '今のアパレルのトレンドを教えて' },
    { title: '画像を作る', sub: 'デザイン案のイメージ', text: 'オーバーサイズTシャツのデザイン案の画像' }
];

function renderChatWelcome() {
    const box = document.getElementById('chat-messages');
    if (!box || loadChatMessages().length) return;

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v);
    box.innerHTML = `<div class="chat-welcome">
        <h2>何をしましょうか</h2>
        <p>会話・分析・制作をこの画面で。画像やURLも添付できます。</p>
        <div class="welcome-cards">
            ${CHAT_SUGGESTIONS.map(
                (c) => `<button type="button" class="welcome-card" data-suggest="${AReGLM_SECURITY.escapeAttr(c.text)}">
                    <strong>${s(c.title)}</strong><span>${s(c.sub)}</span>
                </button>`
            ).join('')}
        </div>
    </div>`;

    box.querySelectorAll('.welcome-card').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = btn.dataset.suggest;
                input.focus();
                autoGrowChatInput(input);
            }
        });
    });
}

/** 入力欄を中身の量に合わせて伸ばす（1行から始めて必要な分だけ広げる） */
function autoGrowChatInput(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

/**
 * 新しい会話を始める。
 *
 * 前の会話は消さずに、しまっておく。
 * これまでは確認のうえ消していたが、
 * 前の話を見返せないと、何を頼んだか分からなくなる。
 */
function startNewChat() {
    const いまの = loadChatMessages();

    if (いまの.length) {
        const 束 = 会話の束を読む();
        束.push({
            id: 'c_' + Date.now(),
            見出し: 会話の見出し(いまの),
            件数: いまの.length,
            とき: new Date().toISOString(),
            中身: いまの,
        });
        // 増えすぎないよう、直近30件だけ残す
        try {
            localStorage.setItem('areglm_chat_history', JSON.stringify(束.slice(-30)));
        } catch (e) {
            console.error('会話をしまえませんでした（容量不足の可能性）:', e);
        }
    }

    localStorage.removeItem('areglm_chat');
    chatAttachments = [];
    renderChatAttachments();
    renderChatWelcome();
    renderChatHistoryList();
}

/** しまってある会話の束 */
function 会話の束を読む() {
    try {
        const r = JSON.parse(localStorage.getItem('areglm_chat_history') || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

/**
 * 会話の見出しを作る。
 * 最初に話しかけた言葉を使う。何の話だったか一番分かりやすいため。
 */
function 会話の見出し(msgs) {
    const 最初 = msgs.find((m) => m.role === 'user');
    const 文 = (最初 && 最初.text) || '（名前なし）';
    return 文.slice(0, 24) + (文.length > 24 ? '…' : '');
}

/** しまってある会話を開き直す */
function 会話を開く(id) {
    const 束 = 会話の束を読む();
    const c = 束.find((x) => x.id === id);
    if (!c) return;

    // いま開いている会話も、失わないようにしまう
    const いまの = loadChatMessages();
    if (いまの.length) {
        束.push({
            id: 'c_' + Date.now(),
            見出し: 会話の見出し(いまの),
            件数: いまの.length,
            とき: new Date().toISOString(),
            中身: いまの,
        });
    }

    saveChatMessages(c.中身);
    try {
        localStorage.setItem('areglm_chat_history',
            JSON.stringify(束.filter((x) => x.id !== id).slice(-30)));
    } catch (e) {
        console.error('会話をしまえませんでした（容量不足の可能性）:', e);
    }

    loadChatHistory();
    renderChatHistoryList();
}

/** 左に、これまでの会話を並べる */
function renderChatHistoryList() {
    const 箱 = document.getElementById('chat-history-list');
    if (!箱) return;

    const 束 = 会話の束を読む().slice().reverse();
    箱.innerHTML = '';

    if (!束.length) {
        箱.innerHTML = '<li class="sidebar-note">まだありません</li>';
        return;
    }

    束.forEach((c) => {
        const li = document.createElement('li');
        li.className = 'chat-history-item';

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-history-open';
        b.textContent = c.見出し;
        b.title = `${new Date(c.とき).toLocaleString('ja-JP')}（${c.件数}件）`;
        b.addEventListener('click', () => 会話を開く(c.id));

        li.appendChild(b);
        箱.appendChild(li);
    });
}

window.renderChatHistoryList = renderChatHistoryList;

/**
 * 画像の添付データを作る。
 *
 * data: で始まる大きなbase64は、そのままlocalStorageに残すと
 * すぐ容量オーバーになる。IndexedDBへ移し、番号だけを持たせる。
 *
 * ComfyUIの結果（/api/image/view?... のような短いURL）は、
 * それ自体が軽いので、そのままでよい。
 */
async function 画像添付を作る(dataOrUrl, prompt) {
    // 自分で作った絵だけを台帳に控える（prompt があるものが作った絵）。
    // 人からもらった写真は、うちのものではないので控えない。
    if (prompt) {
        window.AReGLM_真贋?.作ったものを控える(dataOrUrl, {
            種類: 'AIで作った図案',
            作った言葉: prompt,
        });
    }

    if (typeof dataOrUrl === 'string' && dataOrUrl.startsWith('data:') && window.AReGLM_IMAGES) {
        try {
            const imgId = await AReGLM_IMAGES.画像を保存する(dataOrUrl);
            return { type: 'image', data: dataOrUrl, imgId, prompt };
        } catch (err) {
            console.warn('画像をIndexedDBへ保存できませんでした:', err);
        }
    }
    return { type: 'image', data: dataOrUrl, prompt };
}

/** 資料として本文を読み取れる拡張子（サーバー側のingest.pyと対応） */
const 資料として読める拡張子 = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.csv'];

function handleChatFiles(e) {
    Array.from(e.target.files || []).forEach((file) => {
        if (file.type.startsWith('image/')) {
            画像として添付する(file);
            return;
        }

        const 拡張子 = ('.' + (file.name.split('.').pop() || '')).toLowerCase();
        if (資料として読める拡張子.includes(拡張子)) {
            資料として添付する(file, 拡張子);
            return;
        }

        // 読み方を知らない形式（動画等）は、中身は読まず名前だけ添付する。
        // 添付ボタン自体は accept="image/*,.pdf,video/*" なので、ここに
        // 来るのは主に動画。動画の内容理解はまだ実装していない。
        chatAttachments.push({ type: 'file', name: file.name });
        renderChatAttachments();
        showNotification(`「${file.name}」は名前だけ添付しました（この形式の中身はまだ読めません）`, 'info');
    });
    e.target.value = '';
}

function 画像として添付する(file) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const 項目 = { type: 'image', name: file.name, data: ev.target.result };
        chatAttachments.push(項目);
        renderChatAttachments();

        // 本体はIndexedDBへ。会話の履歴（localStorage）には
        // 番号だけを持たせ、あとから容量オーバーで消えないようにする。
        if (window.AReGLM_IMAGES) {
            try {
                項目.imgId = await AReGLM_IMAGES.画像を保存する(ev.target.result);
            } catch (err) {
                console.warn('画像をIndexedDBへ保存できませんでした:', err);
            }
        }
    };
    reader.readAsDataURL(file);
}

/**
 * PDF・Word・PowerPoint・テキストの本文を、この端末のAIエンジンで取り出す。
 * 取り出した本文は添付として持たせ、AIへの質問に含める（chat.js側の
 * AIへの質問 組み立てで、URL添付と同じように使う）。
 */
async function 資料として添付する(file, 拡張子) {
    const 項目 = { type: 'document', name: file.name, 読み込み中: true };
    chatAttachments.push(項目);
    renderChatAttachments();

    try {
        const buf = await file.arrayBuffer();
        const r = await fetch(`/api/extract-document-text?ext=${encodeURIComponent(拡張子)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: buf,
        }).then((y) => y.json());

        項目.読み込み中 = false;
        if (r.ok) {
            項目.本文 = r.text;
            項目.truncated = !!r.truncated;
            showNotification(`「${file.name}」の本文を読み取りました。`, 'success');
        } else {
            項目.失敗 = r.reason || '読み取れませんでした';
            showNotification(`「${file.name}」: ${項目.失敗}`, 'error');
        }
    } catch (e) {
        項目.読み込み中 = false;
        項目.失敗 = e.message;
        showNotification(`「${file.name}」の読み取りに失敗しました: ${e.message}`, 'error');
    }
    renderChatAttachments();
}

/**
 * 添付したURLの本文を取ってきて、AIへの質問に添える。
 *
 * 設定（url-fetch-enabled、既定オフ）がONのときだけ、実際に取りに行く。
 * OFFのまま・取得に失敗したときは、もとの発言だけを返す
 * （URLを添付したこと自体は伝わる。相手のURLは見えているが、中身は読んでいない）。
 */
async function URL添付の本文を差し込む(text, attachments) {
    let 質問 = text;

    // --- URL添付（既定オフの設定が必要。設定 → 「URLの本文を読みに行く」） ---
    const urlたち = (attachments || []).filter((a) => a.type === 'url');
    if (urlたち.length && localStorage.getItem('areglm_url_fetch_enabled') === 'true') {
        const 結果たち = await Promise.all(urlたち.map(async (a) => {
            try {
                const res = await fetch('/api/fetch-url-text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: a.data || a.name }),
                    signal: AbortSignal.timeout(17000),
                });
                const d = await res.json();
                if (!d.ok) return `${a.name}: 読み込めませんでした（${d.reason || '不明な理由'}）`;
                const 見出し = d.title ? `${d.title}（${a.name}）` : a.name;
                return `${見出し}\n${d.text}${d.truncated ? '\n…（長いため途中まで）' : ''}`;
            } catch (e) {
                return `${a.name}: 読み込めませんでした（${e.message}）`;
            }
        }));
        質問 += `\n\n【添付URLの本文】\n${結果たち.join('\n\n---\n\n')}`;
    }

    // --- 資料添付（PDF/Word/PowerPoint/テキスト。添付した時点で既に読み取り済み） ---
    const 資料たち = (attachments || []).filter((a) => a.type === 'document' && a.本文);
    if (資料たち.length) {
        const 資料の文 = 資料たち
            .map((a) => `${a.name}\n${a.本文}${a.truncated ? '\n…（長いため途中まで）' : ''}`)
            .join('\n\n---\n\n');
        質問 += `\n\n【添付資料の本文】\n${資料の文}`;
    }

    return 質問;
}

/** 「これを中国語に訳して」のような発言から、訳したい言語を拾う */
function 翻訳先の言語を拾う(text) {
    const 対応 = [
        ['英語', ['英語', 'english']],
        ['日本語', ['日本語', 'japanese']],
        ['中国語', ['中国語', '中文', 'chinese']],
        ['韓国語', ['韓国語', 'korean']],
        ['フランス語', ['フランス語', 'french']],
        ['ドイツ語', ['ドイツ語', 'german']],
        ['スペイン語', ['スペイン語', 'spanish']],
        ['イタリア語', ['イタリア語', 'italian']],
        ['ベトナム語', ['ベトナム語', 'vietnamese']],
        ['タイ語', ['タイ語', 'thai']],
    ];
    const 低 = (text || '').toLowerCase();
    for (const [名, 語たち] of 対応) {
        if (語たち.some((w) => 低.includes(w.toLowerCase()))) return 名;
    }
    return '';
}

function addVideoUrl() {
    const input = document.getElementById('chat-video-url');
    const url = input?.value?.trim();
    if (!url) return;
    try {
        new URL(url);
        chatAttachments.push({ type: 'video', name: url, data: url });
        renderChatAttachments();
        input.value = '';
    } catch {
        showNotification('有効な動画URLを入力', 'error');
    }
}

function openGooglePhotosPicker() {
    const cfg = getApiConfig();
    const clientId = cfg.google_client_id;
    if (!clientId) {
        document.getElementById('chat-file-input')?.click();
        showNotification('Google Client ID未設定のため、ローカルファイルを選択します', 'info');
        return;
    }
    showNotification('Google Pickerは設定のClient IDでOAuth連携後に利用できます。今は📎で画像を添付してください。', 'info');
    document.getElementById('chat-file-input')?.click();
}

function handleChatUrl() {
    const input = document.getElementById('chat-url-input');
    const url = input?.value?.trim();
    if (!url) return;
    try {
        new URL(url);
        chatAttachments.push({ type: 'url', name: url, data: url });
        renderChatAttachments();
        input.value = '';
    } catch {
        showNotification('有効なURLを入力してください', 'error');
    }
}

function renderChatAttachments() {
    const box = document.getElementById('chat-attachments-preview');
    if (!box) return;
    if (!chatAttachments.length) {
        box.innerHTML = '';
        box.hidden = true;
        return;
    }
    box.hidden = false;
    box.innerHTML = chatAttachments
        .map((a, i) => {
            let 状態 = '';
            if (a.type === 'document') {
                if (a.読み込み中) 状態 = '（読み込み中…）';
                else if (a.失敗) 状態 = `（読み取れませんでした: ${a.失敗}）`;
                else if (a.本文) 状態 = '（本文を読み取り済み）';
            }
            return `<span class="attach-chip">${AReGLM_SECURITY.sanitizeHtml(a.name)}${AReGLM_SECURITY.sanitizeHtml(状態)}<button type="button" data-i="${i}" aria-label="削除">×</button></span>`;
        })
        .join('');
    box.querySelectorAll('button').forEach((btn) => {
        btn.onclick = () => {
            chatAttachments.splice(parseInt(btn.dataset.i, 10), 1);
            renderChatAttachments();
        };
    });
}

async function handleChatSubmit(e) {
    e.preventDefault();
    if (chatSending) return;

    const input = document.getElementById('chat-input');
    const text = input?.value?.trim() || '';
    if (!text && !chatAttachments.length) return;

    const policy = AReGLM_CONTENT_POLICY.validate(text);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    // 既定は自作AI（この端末の中だけ）。
    // 本人が上の「脳」切り替えでClaudeを選んだときだけ外部へ出す。
    // お金の関所（paid-guard）を通らなければ、自動で自作AIに戻る。
    const provider = Claudeを使うか() ? 'claude' : 'local';

    // 何を作りたいかは、言葉から読み取る。
    //
    // 以前は「画像」「モック」などのボタンを先に押させていたが、
    // 話せば分かることを毎回選ばせるのは手間でしかない。
    // 読み取れないときは、ふつうの会話として扱う。
    const 読み = typeof 用途を読む === 'function'
        ? 用途を読む(text)
        : { 用途: 'chat', 名: '会話', 確信: 0 };
    chatMode = typeof 用途をモードに === 'function' ? 用途をモードに(読み.用途) : 'chat';
    if (typeof 用途を画面に出す === 'function') 用途を画面に出す(読み);
    const history = loadChatMessages();

    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const userMsg = {
        role: 'user',
        text,
        attachments: [...chatAttachments],
        mode: chatMode,
        at: new Date().toISOString()
    };
    history.push(userMsg);
    saveChatMessages(history);
    appendChatBubble(userMsg);

    input.value = '';
    autoGrowChatInput(input); // 送信後は1行に戻す
    const attachmentsCopy = [...chatAttachments];
    chatAttachments = [];
    renderChatAttachments();

    // 添付にURLがあり、「URLの本文を読みに行く」設定がONなら、
    // 本文を取ってきてAIへの質問に添える。
    // 吹き出しに出す userMsg.text はさっき確定済みなので、
    // ここで作るのはAIに渡す分だけ（画面には長い本文を出さない）。
    const AIへの質問 = await URL添付の本文を差し込む(text, attachmentsCopy);

    const typingId = showTypingIndicator();

    chatSending = true;
    const sendBtn = document.querySelector('#chat-form button[type="submit"]');
    if (sendBtn) sendBtn.disabled = true;

    try {
        let replyText;
        let replyAttachments = [];

        if (chatMode === 'image') {
            // 画像を作って、そのまま吹き出しに出す
            const img = await AReGLM_LOCAL_FIRST.generateImage(provider, text);

            if (img && img.type === 'image' && img.data) {
                // 自作の図案。何をどう作ったかを添えて返す。
                // 中身を JSON のまま出してしまう不具合があったので、
                // 受け取る形をはっきり分けてある。
                replyText = '図案を作りました。'
                    + (img.使った柄 ? `\n柄: ${色柄の呼び名(img.使った柄)}` : '')
                    + (img.載せた言葉 ? `\n文字: ${img.載せた言葉}` : '')
                    + (img.note ? `\n\n※ ${img.note}` : '');
                replyAttachments = [await 画像添付を作る(img.data, text)];
            } else if (typeof img === 'string' && img.startsWith('data:image')) {
                replyText = '画像を作りました。';
                replyAttachments = [await 画像添付を作る(img, text)];
            } else if (img && img.type === 'description') {
                replyText = img.text + (img.note ? `\n\n※ ${img.note}` : '');
            } else {
                replyText = '画像を作れませんでした。';
            }
        } else if (読み.用途 === 'translate') {
            // 通訳（N-13）。世間知識の分類を挟まず、専用の入口へ直接聞く
            // （chat_engine 側は「翻訳」を、このツールが持たない世間知識として
            // 先に断る作りになっているため、そちらは通さない）。
            const 言語 = 翻訳先の言語を拾う(text) || '英語';
            try {
                const r = await fetch('/api/ai-local/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: AIへの質問, 言語 }),
                }).then((y) => y.json());
                replyText = r.ok ? r.answer : (r.answer || '訳せませんでした。');
            } catch (e) {
                replyText = 'つながりませんでした: ' + e.message;
            }
        } else if (読み.用途 === 'sns' || 読み.用途 === 'mail'
                   || 読み.用途 === 'product_text' || 読み.用途 === 'techpack') {
            // 文章づくりを頼まれた場合は、型を使って作る。
            //
            // ここを通さず会話に流していたため、
            //「商品説明を書きたい」と言っても作られなかった。
            replyText = await AReGLM_LOCAL_FIRST.complete({
                provider: 'local',
                history: history.slice(0, -1),
                userText: AIへの質問,
                attachments: attachmentsCopy,
                mode: chatMode,
            });
        } else if (provider === 'local') {
            // ふつうの会話。外部へは一切出さない。
            replyText = await 自作AIに聞く(AIへの質問, history.slice(0, -1), chatMode);
        } else {
            replyText = await AReGLM_LOCAL_FIRST.complete({
                provider,
                history: history.slice(0, -1),
                userText: AIへの質問,
                attachments: attachmentsCopy,
                mode: chatMode
            });
        }

        removeTypingIndicator(typingId);
        // 同じ答えが3回以上、そのまま続いていないか。
        //
        // 「商品がまだ登録されていません。」のような定型文が、
        // 直そうとしても直らないまま連続して出ると、
        // 壊れて止まらなくなっているように見える。
        // 同じ文をただ繰り返すのではなく、一言添えて気づけるようにする。
        const 直近のAI発言 = history.filter((m) => m.role === 'assistant').slice(-2);
        const 同じ内容が続いているか = 直近のAI発言.length === 2
            && 直近のAI発言.every((m) => m.text === replyText);

        // どこが答えたかを残す。
        // これが無いと、自作AIの答えにまで
        //「外部AIの回答です」という断りが出てしまっていた。
        const reply = {
            role: 'assistant',
            text: 同じ内容が続いているか
                ? `${replyText}\n\n（同じ内容が続いています。言い方を変えるか、別のことを聞いてみてください）`
                : replyText,
            attachments: replyAttachments,
            source: provider,
            at: new Date().toISOString(),
        };
        history.push(reply);
        saveChatMessages(history);
        appendChatBubble(reply);
        // 会話そのものを自作AIに学習させる（自分の発言とAIの返答を分けて覚える）
        if (window.AReGLM_LOCAL_AI) {
            AReGLM_LOCAL_AI.learnConversation(text, replyText, chatMode);
            // 外部AIを使ったときだけ、その回答を鵜呑みにせず分析する。
            // 自作AIの答えは根拠を付けて返しているので、二重に分析しない。
            if (provider !== 'local') {
                analyzeExternalReply(replyText, reply);
                // 外部の答えは出所つきで知識にも蓄える。
                // 目標は「いずれ外部が無くても、蓄えた知識で自作AIが答えられる」こと。
                AReGLM_LOCAL_AI.addKnowledge(
                    `Q: ${text}\nA: ${replyText}`.slice(0, 4000),
                    provider, chatMode, '外部AIの回答（要裏取り）');
            }
        }

        logActivity('AIチャット（' + chatMode + '）', {
            category: 'chat',
            mode: chatMode,
            provider,
            text: `${text} ${replyText}`.slice(0, 2000)
        });
    } catch (err) {
        removeTypingIndicator(typingId);
        const errMsg = {
            role: 'assistant',
            text: `⚠ ${err.message || 'エラーが発生しました'}`,
            error: true,
            at: new Date().toISOString()
        };
        history.push(errMsg);
        saveChatMessages(history);
        appendChatBubble(errMsg);
        showNotification(err.message, 'error');
    } finally {
        chatSending = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

function showTypingIndicator() {
    const box = document.getElementById('chat-messages');
    const id = 'typing-' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.className = 'chat-bubble assistant typing';
    el.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    box.appendChild(el);
    scrollChatToBottom();
    return id;
}

function removeTypingIndicator(id) {
    document.getElementById(id)?.remove();
}

function loadChatMessages() {
    return JSON.parse(localStorage.getItem('areglm_chat') || '[]');
}

/** 保存する前に、画像の本体（data）を軽くする。IndexedDBに番号（imgId）があるものだけ外す。 */
function 保存用に軽くする(msgs) {
    return msgs.map((m) => {
        if (!m.attachments?.length) return m;
        return {
            ...m,
            attachments: m.attachments.map((a) => {
                if (a.type === 'image' && a.data && a.imgId) {
                    const { data, ...軽い } = a;
                    return 軽い;
                }
                // 資料の本文（最大8000字）は、送るときにその場で使うだけのもの。
                // 毎回の会話保存に残し続けると容量を圧迫するため、
                // 添付した事実（名前）だけ残し、本文は保存しない。
                if (a.type === 'document' && a.本文) {
                    const { 本文, ...軽い } = a;
                    return 軽い;
                }
                return a;
            }),
        };
    });
}

function saveChatMessages(msgs) {
    const 軽くした = 保存用に軽くする(msgs);
    try {
        localStorage.setItem('areglm_chat', JSON.stringify(軽くした.slice(-80)));
    } catch (e) {
        // 容量オーバーで保存に失敗しても、黙って握りつぶさない。
        // 画像の本体は既にIndexedDB側にあるので、履歴を減らして
        // もう一度だけ試す（会話の中身自体は失われない）。
        console.error('会話の保存に失敗しました。件数を減らして再試行します:', e);
        try {
            localStorage.setItem('areglm_chat', JSON.stringify(軽くした.slice(-20)));
        } catch (e2) {
            console.error('会話を保存できませんでした:', e2);
        }
    }
}

function loadChatHistory() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const msgs = loadChatMessages();
    if (!msgs.length) {
        renderChatWelcome();
        return;
    }
    box.innerHTML = '';
    msgs.forEach(appendChatBubble);
}

/**
 * 外部AIの回答を自作AIで分析し、確認が必要な箇所を吹き出しの下に出す。
 * 事実として扱ってよいかを、その場で判断できるようにするため。
 */
async function analyzeExternalReply(replyText, replyMsg) {
    if (!replyText || !window.AReGLM_LOCAL_AI) return;

    const result = await AReGLM_LOCAL_AI.analyze(replyText);
    if (!result?.ok) return;

    // 確認すべきものが無ければ何も出さない（画面を無駄に埋めない）
    if (!result.needsCheck?.length && !result.repeatsPastMistake?.length) return;

    const box = document.getElementById('chat-messages');
    if (!box) return;

    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    let html = `<div class="verify-title">自作AIによる確認結果</div>
        <p class="verify-summary">${s(result.summary)}</p>`;

    if (result.repeatsPastMistake?.length) {
        html += '<div class="verify-mistake"><strong>過去に誤りと分かった内容と一致しています</strong><ul>';
        result.repeatsPastMistake.forEach((m) => {
            html += `<li>${s(m.claim)}<br><small>実際: ${s(m.whatActuallyHappened)}</small></li>`;
        });
        html += '</ul></div>';
    }

    if (result.needsCheck?.length) {
        html += '<div class="verify-check"><strong>裏取りが必要な主張</strong><ul>';
        result.needsCheck.slice(0, 6).forEach((a) => {
            html += `<li>${s(a.text)}<br><small>${s(a.flags.join('、'))}</small></li>`;
        });
        html += '</ul></div>';
    }

    const div = document.createElement('div');
    div.className = 'chat-verify';
    div.innerHTML = html;
    box.appendChild(div);
    scrollChatToBottom();
}

function appendChatBubble(msg) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `chat-bubble ${msg.role}${msg.error ? ' error' : ''}`;

    let html = '';
    if (msg.role === 'assistant') {
        html += '<div class="bubble-avatar">AI</div>';
    }
    html += '<div class="bubble-body">';
    if (msg.attachments?.length) {
        html += '<div class="bubble-attachments">';
        msg.attachments.forEach((a) => {
            if (a.type === 'image' && a.data) {
                // すぐ出せる中身がある（送った直後など）。そのまま出す。
                html += `<img src="${AReGLM_SECURITY.escapeAttr(a.data)}" alt="" class="bubble-img">`;
            } else if (a.type === 'image' && a.imgId) {
                // 本体はIndexedDB側にある。ここではまだ待ち状態の箱を置き、
                // このあとJSで読みに行って差し替える（下のresolve処理）。
                html += `<div class="bubble-img-slot" data-img-id="${AReGLM_SECURITY.escapeAttr(a.imgId)}" `
                    + `data-img-name="${AReGLM_SECURITY.escapeAttr(a.name || '')}" `
                    + `data-img-prompt="${AReGLM_SECURITY.escapeAttr(a.prompt || '')}">読み込み中…</div>`;
            } else if (a.type === 'image') {
                // 番号（imgId）も中身（data）も無い＝本当に失われている。
                // 以前はここで、名前の文字だけを灰色の小さな箱で出していた。
                // 何が起きているかを、はっきり書く。
                html += 壊れた画像カードHTML(a.name, a.prompt);
            } else {
                html += `<small>${AReGLM_SECURITY.sanitizeHtml(a.name)}</small>`;
            }
        });
        html += '</div>';
    }
    // msg.text は、外部AIの応答やユーザー自身の入力がそのまま入りうる。
    // 改行だけ <br> にしたいが、無害化せずに innerHTML へ入れていたため、
    // 文中にHTMLタグが混ざると（外部AIの応答やコピペ経由で）そのまま
    // 実行される恐れがあった（コードの安全点検が検出）。
    // 先にエスケープしてから、あとで改行だけ <br> に戻す。
    const formatted = AReGLM_SECURITY.sanitizeHtml(msg.text || '').replace(/\n/g, '<br>');
    html += `<div class="bubble-text">${formatted}</div>`;

    // 外部AIの回答は、もっともらしい誤りを含むことがある。
    // 出所をはっきりさせて、裏を取れるようにする。
    //
    // 自作AIの答えには付けない。
    // 自作AIは根拠を付けて返しており、知らないことは知らないと言うため、
    // 同じ断りを毎回出すと、かえって読みにくくなる。
    const 外部が答えた = msg.source && msg.source !== 'local';
    if (msg.role === 'assistant' && !msg.error && 外部が答えた) {
        html += '<div class="bubble-source">外部AIの回答です。事実かどうかは未検証のため、'
            + '重要な判断に使う前に必ず裏を取ってください。</div>';
    }

    html += '</div>';

    div.innerHTML = html;
    box.appendChild(div);
    div.querySelectorAll('.bubble-img-slot').forEach(画像枠を差し替える);
    scrollChatToBottom();
}

/**
 * 画像が読めなかったときの案内カードのHTML。
 *
 * 作った時のプロンプトが分かっていれば「画像を再生成」を出す
 * （この端末のAIでまた作り直せるため）。
 * 自分でアップロードした写真はここでは作れないので、
 * 正直に「再度アップロードしてください」とだけ伝える。
 */
function 壊れた画像カードHTML(名, prompt) {
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(v || '');
    let html = '<div class="bubble-broken-image">⚠ 画像を読み込めませんでした'
        + (名 ? `（${s(名)}）` : '');
    if (prompt) {
        html += `<button type="button" class="btn btn-sm btn-secondary bubble-regen-btn" `
            + `data-regen-prompt="${AReGLM_SECURITY.escapeAttr(prompt)}">↻ 画像を再生成</button>`;
    } else {
        html += '<br><small>アップロードした画像のため、こちらでは作り直せません。お手数ですが再度アップロードしてください。</small>';
    }
    html += '</div>';
    return html;
}

/**
 * 「読み込み中…」の箱を、IndexedDBから読んだ本物の画像に差し替える。
 *
 * 読めなければ、壊れた画像アイコンではなく、
 * はっきり「読み込めませんでした」と伝える。
 */
async function 画像枠を差し替える(枠) {
    const id = 枠.dataset.imgId;
    const 名 = 枠.dataset.imgName;
    const prompt = 枠.dataset.imgPrompt;

    const dataUrl = window.AReGLM_IMAGES ? await AReGLM_IMAGES.画像を読む(id) : null;

    if (dataUrl) {
        const img = document.createElement('img');
        img.className = 'bubble-img';
        img.alt = '';
        img.src = dataUrl;
        枠.replaceWith(img);
        scrollChatToBottom();
        return;
    }

    const 断り = document.createElement('div');
    断り.innerHTML = 壊れた画像カードHTML(名, prompt);
    枠.replaceWith(断り.firstElementChild);
}

/**
 * 「画像を再生成」ボタンから、同じプロンプトでもう一度作り直す。
 * 会話履歴には新しいAIの発言として追加する（元の壊れたメッセージは残す）。
 */
async function 画像を再生成する(prompt, ボタン) {
    if (ボタン) { ボタン.disabled = true; ボタン.textContent = '生成中…'; }

    try {
        const img = await AReGLM_LOCAL_FIRST.generateImage('local', prompt);
        let replyText;
        let replyAttachments = [];

        if (img && img.type === 'image' && img.data) {
            replyText = '図案を作り直しました。'
                + (img.使った柄 ? `\n柄: ${色柄の呼び名(img.使った柄)}` : '')
                + (img.載せた言葉 ? `\n文字: ${img.載せた言葉}` : '');
            replyAttachments = [await 画像添付を作る(img.data, prompt)];
        } else if (typeof img === 'string' && img.startsWith('data:image')) {
            replyText = '画像を作り直しました。';
            replyAttachments = [await 画像添付を作る(img, prompt)];
        } else {
            replyText = '画像を作り直せませんでした。';
        }

        const history = loadChatMessages();
        const reply = {
            role: 'assistant',
            text: replyText,
            attachments: replyAttachments,
            source: 'local',
            at: new Date().toISOString(),
        };
        history.push(reply);
        saveChatMessages(history);
        appendChatBubble(reply);
    } catch (e) {
        showNotification?.(`画像の再生成に失敗しました: ${e.message}`, 'error');
        if (ボタン) { ボタン.disabled = false; ボタン.textContent = '↻ 画像を再生成'; }
    }
}

/** 会話の一番下まで送る（外側の枠がスクロールする作りになったため） */
function scrollChatToBottom() {
    const scroller = document.getElementById('chat-scroll');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

window.initChat = initChat;
window.loadChatHistory = loadChatHistory;

/**
 * 自作AIに聞く
 *
 * 外部AIを使わずに答えるための入口。
 * 送り先はこの端末の中（127.0.0.1）だけで、外へは一切出ない。
 *
 * 実行の指示が返ってきたときは、その場で実際に行う。
 * 「実行します」と言うだけで何も起きない状態を避けるため。
 */
async function 自作AIに聞く(text, 履歴, モード) {
    const res = await fetch('/api/ai-local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text,
            session_id: typeof getSessionId === 'function' ? getSessionId() : 'chat',
            context: {
                today: typeof 今日 === 'function' ? 今日() : '',
                products: JSON.parse(localStorage.getItem('products') || '[]'),
                tasks: JSON.parse(localStorage.getItem('areglm_tasks') || '[]'),
                events: JSON.parse(localStorage.getItem('areglm_events') || '[]'),
                mode: モード,
                persona: localStorage.getItem('areglm_ai_persona') || '',
                // マルチエージェント化: 今見ている画面から、専門の担当を選んでもらう。
                page: document.querySelector('.page.active')?.id?.replace('-page', '') || '',
            },
        }),
    });

    if (!res.ok) {
        throw new Error('自作AIが応答しません。設定 → 自己点検で状態を確かめてください。');
    }

    const d = await res.json();
    let 返事 = d.answer || '（答えが空でした）';

    // マルチエージェント化: 担当が答えたときは、誰が答えたか分かるようにする。
    // 画面と話題が食い違って引き継いだときは、引き継ぎ元も添える。
    if (d.agent?.名) {
        const 引き継ぎ = d.agent.引き継ぎ元
            ? `（${d.agent.引き継ぎ元.絵 || ''}${d.agent.引き継ぎ元.名}から引き継ぎ）` : '';
        返事 = `【${d.agent.絵 || ''} ${d.agent.名}】${引き継ぎ}\n${返事}`;
    }

    if (d.sources?.length) 返事 += `\n\n（根拠: ${d.sources.join('、')}）`;

    // 実行の指示が入っていれば、実際に行う
    // ひとまとまりの仕事として返ってきたときは、一手ずつ進める。
    // run が付いているときだけ動かす。
    // 段取りを見せた段階では動かさない（見てから決めてもらうため）。
    if (d.plan && d.run && typeof 段取りを進める === 'function') {
        await 段取りを進める(d.plan, null);
        return true;
    }

    if (d.action && typeof 指示を実行する === 'function') {
        const 行った = await 指示を実行する(d, null);
        if (行った) 返事 += '\n\n（実行しました）';
    }

    return 返事;
}

window.自作AIに聞く = 自作AIに聞く;

/** 柄の名前を、読める言葉にする */
function 色柄の呼び名(柄) {
    return {
        stripe: '縞', check: '格子', dot: '水玉',
        camo: '迷彩', geo: '幾何', plain: '無地', text: '文字',
    }[柄] || 柄;
}
