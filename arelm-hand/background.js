/**
 * ARELMの手 ― 本体（Chromeの拡張機能）
 *
 * なぜこれを作るのか:
 *   本人の要望「Claude in Chrome のような機能を、自作アプリのオリジナルで」。
 *   これまでのChrome操作（server/ブラウザを操る.js）は、MacのAppleScriptで
 *   「タブを開く・選ぶ・閉じる」までしかできず、ページの中を読む・押す・打つができなかった。
 *   Windowsでは、タブの読み書きが一切できなかった。
 *   拡張機能なら、Mac・Windowsの同じChromeで、ログイン済みのまま、ページの中まで扱える。
 *
 * 決まり（ここで守る。ARELMの画面やAIが何を頼んでも、ここを通らないと動かない）:
 *   ・頼みを受けるのは、ARELMの画面（決めた入り口）からだけ
 *   ・読むのは自由。押す・打つは、一手ずつ
 *   ・送信・購入・公開・削除・投稿などの手前では止まり、本人の「よい」を待つ
 *   ・SUZURIの「公開」は押さない（本人が押す）。合言葉・カード番号の欄には打たない
 *   ・ログイン・支払い・銀行の画面では、押さない・打たない
 *   ・ARELM自身の画面は触らない（AIが自分の確認を自分で通すのを防ぐ）
 *   ・止めるボタンで、その瞬間から一切動かない。1分に60回まで
 *   ・何をしたかを残す（打った文字そのものは残さない）
 *   ・読んだ中身を、拡張機能から外へ送らない（返す先は、頼んだARELMの画面だけ）
 */

// 本人の要望（2026-10-09）「私のデバイスでしか開けないように」。以前は localhost のどの番号でも ARELM とみなしていたため、
// 同じMacの別のサーバー（開発中の画面など）からも、この手に頼めた。ARELM の番号（8080・8090）だけにする
const 既定の入り口 = [
    { 出どころ: 'http://localhost', 番号: ['8080', '8090'], 道: '' },
    { 出どころ: 'http://127.0.0.1', 番号: ['8080', '8090'], 道: '' },
    { 出どころ: 'https://pentakobaryou0907-gif.github.io', 番号: [''], 道: '/ARELM/' },
];

const 触ってはいけない先 = [
    /accounts\.google\.com/i,
    /appleid\.apple\.com/i,
    /login|signin|sign-in|auth/i,
    /checkout|payment|billing|purchase/i,
    /bank|銀行|振込|送金/i,
];

const 確かめる言葉 = /送信|購入|支払|決済|公開|削除|退会|解約|契約|同意|注文|確定|振込|送金|購読|投稿|シェア|ポスト|出品|send|buy|purchase|pay\b|checkout|publish|delete|remove|post\b|share|submit|order|confirm|subscribe|sign up|agree|tweet/i;
const 一分の上限 = 60;
let 最近 = [];

/* ---------- 置き場 ---------- */
const 置き場 = {
    async 読む(名, 既定) {
        const x = await chrome.storage.local.get(名);
        return x[名] === undefined ? 既定 : x[名];
    },
    async 書く(名, 値) { await chrome.storage.local.set({ [名]: 値 }); },
    async 今だけ読む(名, 既定) {
        const x = await chrome.storage.session.get(名);
        return x[名] === undefined ? 既定 : x[名];
    },
    async 今だけ書く(名, 値) { await chrome.storage.session.set({ [名]: 値 }); },
};

async function 記録を残す(操作, 先, 結果) {
    const 記録 = await 置き場.読む('記録', []);
    let 場所 = '';
    try { 場所 = 先 ? new URL(先).hostname : ''; } catch { 場所 = ''; }
    記録.push({ とき: new Date().toISOString(), 操作, 先: 場所, ok: !!(結果 && 結果.ok), 訳: String((結果 && 結果.訳) || '').slice(0, 80) });
    await 置き場.書く('記録', 記録.slice(-200));
}

/* ---------- 入り口（ARELMの画面か） ---------- */
async function 足した入り口() { return 置き場.読む('入り口', []); }

async function ARELMの画面か(url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    const 番号なし = `${u.protocol}//${u.hostname}`;
    if (既定の入り口.some((x) => 番号なし === x.出どころ && x.番号.includes(u.port) && u.pathname.startsWith(x.道 || '/'))) return true;
    return (await 足した入り口()).includes(u.origin);
}

function 入り口の型(出どころ) {
    const u = new URL(出どころ);
    // 型にも番号（ポート）を書く（書かないと、同じ名前のどの番号でも当たってしまう）
    return `${u.protocol}//${u.host}/*`;
}

async function 入り口を足す(住所) {
    let u;
    try { u = new URL(String(住所 || '').trim()); } catch { return { ok: false, 訳: 'http:// か https:// から始まる住所を入れてください' }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, 訳: 'http:// か https:// の住所だけ足せます' };
    const 一覧 = await 足した入り口();
    if (!一覧.includes(u.origin)) 一覧.push(u.origin);
    await 置き場.書く('入り口', 一覧);
    await 入り口を登録し直す();
    return { ok: true, 訳: `${u.origin} を、ARELMの入り口に足しました。そのページを読み込み直してください` };
}

async function 入り口を外す(出どころ) {
    const 一覧 = (await 足した入り口()).filter((x) => x !== 出どころ);
    await 置き場.書く('入り口', 一覧);
    await 入り口を登録し直す();
    return { ok: true, 訳: '外しました' };
}

async function 入り口を登録し直す() {
    try { await chrome.scripting.unregisterContentScripts({ ids: ['arelm-doors'] }); } catch { /* まだ無い */ }
    const 一覧 = await 足した入り口();
    if (!一覧.length) return;
    await chrome.scripting.registerContentScripts([{
        id: 'arelm-doors', matches: [...new Set(一覧.map(入り口の型))], js: ['bridge.js'], runAt: 'document_start',
    }]);
}

/* ---------- タブ ---------- */
async function 手の窓() { return 置き場.今だけ読む('手の窓', null); }
async function 手が開いたタブ() { return 置き場.今だけ読む('手が開いたタブ', []); }

async function 作業中のタブ() {
    const id = await 置き場.今だけ読む('作業中のタブ', null);
    if (id != null) {
        try { return await chrome.tabs.get(id); } catch { /* 閉じられた */ }
    }
    // 決まっていなければ、いちばん最近使った窓の、いま見ているタブ（ARELM自身は除く）
    const 窓たち = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    窓たち.sort((a, b) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0));
    for (const w of 窓たち) {
        const t = (w.tabs || []).find((x) => x.active);
        if (t && !(await ARELMの画面か(t.url || ''))) return t;
    }
    return null;
}

async function 作業中にする(タブ) { await 置き場.今だけ書く('作業中のタブ', タブ.id); }

function 読み込みを待つ(tabId, 秒 = 12) {
    return new Promise((ok) => {
        const 期限 = Date.now() + 秒 * 1000;
        const 見る = async () => {
            try {
                const t = await chrome.tabs.get(tabId);
                if (t.status === 'complete' || Date.now() > 期限) return ok(t);
            } catch { return ok(null); }
            setTimeout(見る, 250);
        };
        見る();
    });
}

/* ---------- ページの中で動かす関数（ここから下の3つは、そのままページへ送られる） ---------- */
function ページを読み取る(上限の部品, 上限の文字) {
    document.querySelectorAll('[data-arelm-hand]').forEach((e) => e.removeAttribute('data-arelm-hand'));
    const 型 = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [role=option], [role=combobox], [role=textbox], [contenteditable=""], [contenteditable="true"]';
    const 見える = (e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const s = getComputedStyle(e);
        return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
    };
    const 名前 = (e) => {
        const t = e.tagName.toLowerCase();
        let n = e.getAttribute('aria-label') || '';
        if (!n && e.labels && e.labels.length) n = e.labels[0].innerText;
        if (!n && (t === 'input' || t === 'textarea')) n = e.placeholder || e.title || e.name || '';
        if (!n && t === 'input' && /submit|button|reset/.test(e.type)) n = e.value;
        if (!n) n = e.innerText || e.textContent || '';
        if (!n) { const img = e.querySelector && e.querySelector('img[alt]'); if (img) n = img.alt; }
        if (!n) n = e.title || '';
        return String(n).replace(/\s+/g, ' ').trim().slice(0, 80);
    };
    const 種類 = (e) => {
        const t = e.tagName.toLowerCase();
        const role = e.getAttribute('role') || '';
        if (t === 'select' || role === 'combobox' || role === 'option') return '選択';
        if (t === 'input' && /checkbox|radio/.test(e.type)) return 'チェック';
        if (role === 'checkbox' || role === 'radio' || role === 'switch') return 'チェック';
        if (t === 'input' && /submit|button|reset|image/.test(e.type)) return 'ボタン';
        if (t === 'input' || t === 'textarea' || role === 'textbox' || e.isContentEditable) return '入力欄';
        if (t === 'a' || role === 'link') return 'リンク';
        return 'ボタン';
    };
    const 秘密か = (e) => {
        const ty = String(e.type || '').toLowerCase();
        if (ty === 'password') return true;
        const ac = String(e.getAttribute('autocomplete') || '').toLowerCase();
        if (/cc-|one-time-code|current-password|new-password/.test(ac)) return true;
        const 文 = [e.name, e.id, e.getAttribute('aria-label'), e.placeholder, e.labels && e.labels[0] && e.labels[0].innerText].join(' ');
        return /pass|パスワード|暗証|合言葉|card.?num|カード番号|cvc|cvv|security.?code|セキュリティコード|otp|認証コード|確認コード|token|secret|\bpin\b|口座番号/i.test(文);
    };
    const 高さ = innerHeight;
    const 全部 = [...document.querySelectorAll(型)].filter(見える);
    // いま見えている所を先に（遠いものは後ろへ）
    const 遠さ = (e) => { const r = e.getBoundingClientRect(); return r.bottom < 0 ? -r.bottom + 高さ : r.top > 高さ ? r.top : 0; };
    const 並び = 全部.map((e, i) => ({ e, i, d: 遠さ(e) })).sort((a, b) => (a.d - b.d) || (a.i - b.i)).slice(0, 上限の部品);
    並び.sort((a, b) => a.i - b.i);
    const 部品 = 並び.map(({ e }, k) => {
        const 番 = k + 1;
        e.setAttribute('data-arelm-hand', String(番));
        const 種 = 種類(e);
        const x = { 番, 種類: 種, 名: 名前(e) };
        if (種 === '入力欄') { x.入っている = !!(e.value || (e.isContentEditable && e.innerText.trim())); if (秘密か(e)) x.秘密 = true; }
        if (種 === 'チェック') x.入 = !!(e.checked || e.getAttribute('aria-checked') === 'true');
        if (種 === 'リンク' && e.href) { try { const u = new URL(e.href); x.行き先 = (u.origin + u.pathname).slice(0, 100); } catch { /* 読めない行き先は書かない */ } }
        if (e.disabled) x.押せない = true;
        return x;
    });
    const 文 = String(document.body ? document.body.innerText : '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 上限の文字);
    return { 題: document.title, 道: location.href, 文, 部品, 位置: { 上: Math.round(scrollY), 全体: document.documentElement.scrollHeight, 窓: 高さ } };
}

function 部品を調べる(番, 確かめる言葉の元) {
    const e = document.querySelector(`[data-arelm-hand="${番}"]`);
    if (!e) return { ok: false, 訳: `${番}番が見つかりません。ページが変わったので、もう一度読んでください` };
    const t = e.tagName.toLowerCase();
    const n = String(e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const 確かめる = new RegExp(確かめる言葉の元, 'i');
    const 形 = e.closest('form');
    const 送り出す = (t === 'button' && (e.type || 'submit') === 'submit' && !!形) || (t === 'input' && /submit|image/.test(e.type));
    const 探すだけ = /検索|search|探す|絞り込/i.test(n);
    const ty = String(e.type || '').toLowerCase();
    const ac = String(e.getAttribute('autocomplete') || '').toLowerCase();
    const 名札 = [e.name, e.id, e.getAttribute('aria-label'), e.placeholder, e.labels && e.labels[0] && e.labels[0].innerText].join(' ');
    const 秘密 = ty === 'password' || /cc-|one-time-code|current-password|new-password/.test(ac)
        || /pass|パスワード|暗証|合言葉|card.?num|カード番号|cvc|cvv|security.?code|セキュリティコード|otp|認証コード|確認コード|token|secret|\bpin\b|口座番号/i.test(名札);
    const 形に合言葉 = !!(形 && 形.querySelector('input[type=password]'));
    e.scrollIntoView({ block: 'center', inline: 'center' });
    const r = e.getBoundingClientRect();
    return {
        ok: true, 名: n, タグ: t,
        入力欄: t === 'input' || t === 'textarea' || e.isContentEditable,
        選択: t === 'select',
        秘密, 形に合言葉,
        確かめが要る: 確かめる.test(n) || (送り出す && !探すだけ),
        本人が押す: /(^|\.)suzuri\.jp$/i.test(location.hostname) && /公開/.test(n),
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        押せない: !!e.disabled,
    };
}

function ページの中で動かす(番, 何を, 値) {
    const e = 番 == null ? document.activeElement : document.querySelector(`[data-arelm-hand="${番}"]`);
    if (!e && 何を !== 'スクロール') return { ok: false, 訳: '相手が見つかりません' };
    if (何を === '押す') { e.click(); return { ok: true }; }
    if (何を === '的を合わせる') {
        e.focus();
        if (!値 && typeof e.select === 'function') e.select();
        if (!値 && e.isContentEditable) { const s = getSelection(); s.selectAllChildren(e); }
        return { ok: true };
    }
    if (何を === '打つ') {
        e.focus();
        if (e.isContentEditable) { document.execCommand('insertText', false, 値); return { ok: true }; }
        const 元 = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), 'value');
        if (元 && 元.set) 元.set.call(e, 値); else e.value = 値;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
    }
    if (何を === '選ぶ') {
        const 候補 = [...e.options].find((o) => o.text.trim() === String(値).trim() || o.value === String(値));
        if (!候補) return { ok: false, 訳: `「${値}」という選択肢がありません（${[...e.options].map((o) => o.text.trim()).slice(0, 10).join('・')}）` };
        e.value = 候補.value;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, 訳: `「${候補.text.trim()}」を選びました` };
    }
    if (何を === 'スクロール') {
        scrollBy({ top: (値 === '上' ? -1 : 1) * Math.round(innerHeight * 0.8), behavior: 'instant' });
        return { ok: true, 位置: Math.round(scrollY) };
    }
    if (何を === 'Enterの前') {
        const 形 = e && e.closest && e.closest('form');
        if (!形) return { ok: true, 確かめが要る: false };
        if (形.querySelector('input[type=password]')) return { ok: true, 合言葉: true };
        const 送り = [...形.querySelectorAll('button, input[type=submit]')].map((b) => String(b.innerText || b.value || b.getAttribute('aria-label') || '')).join(' ');
        return { ok: true, 確かめが要る: new RegExp(値, 'i').test(送り) && !/検索|search|探す/i.test(送り) };
    }
    return { ok: false, 訳: 'できない動きです' };
}

/* ---------- ページの中で動かす（呼び出し側） ---------- */
async function ページで(tabId, func, args) {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return r ? r.result : null;
}

/* ---------- 本物の入力（デバッガー）。使えなければ、ページの中の動きで代える ---------- */
const つないだタブ = new Set();
let 離す札 = null;

async function デバッガーで(tabId, 命令たち) {
    try {
        if (!つないだタブ.has(tabId)) {
            try { await chrome.debugger.attach({ tabId }, '1.3'); }
            catch (e) { if (!/already attached/i.test(String(e.message))) throw e; }
            つないだタブ.add(tabId);
        }
        for (const [m, p] of 命令たち) await chrome.debugger.sendCommand({ tabId }, m, p);
        clearTimeout(離す札);
        // しばらく使わなければ離す（上に出る「デバッグ中」の帯を、出しっぱなしにしない）
        離す札 = setTimeout(全部離す, 15000);
        return true;
    } catch {
        return false;
    }
}

async function 全部離す() {
    for (const tabId of [...つないだタブ]) {
        try { await chrome.debugger.detach({ tabId }); } catch { /* もう離れている */ }
        つないだタブ.delete(tabId);
    }
}
chrome.debugger.onDetach.addListener((src) => つないだタブ.delete(src.tabId));

const キーの表 = {
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
    PageDown: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
    PageUp: { key: 'PageUp', code: 'PageUp', windowsVirtualKeyCode: 33 },
};
const キーの言い換え = { 改行: 'Enter', エンター: 'Enter', タブ: 'Tab', 取り消し: 'Escape', エスケープ: 'Escape', 戻る: 'Backspace', 上: 'ArrowUp', 下: 'ArrowDown', 左: 'ArrowLeft', 右: 'ArrowRight' };

/* ---------- 操作 ---------- */
function 動きすぎか() {
    const いま = Date.now();
    最近 = 最近.filter((t) => いま - t < 60000);
    if (最近.length >= 一分の上限) return true;
    最近.push(いま);
    return false;
}

async function 触ってよいタブか(タブ) {
    if (!タブ) return { ok: false, 訳: '触るタブがありません。「開く」か「タブを選ぶ」で、先にタブを決めてください' };
    const 道 = タブ.url || '';
    if (!/^https?:/.test(道)) return { ok: false, 訳: 'このタブ（Chromeの設定画面など）は触れません' };
    if (await ARELMの画面か(道)) return { ok: false, 訳: 'ARELM自身の画面は、手では触りません（確認を自分で通さないため）' };
    if (触ってはいけない先.some((x) => x.test(道))) return { ok: false, 訳: 'ログイン・支払い・銀行の画面では、押す・打つをしません。ここは、ご自身で操作してください' };
    return { ok: true };
}

const 操作たち = {
    async ようす() {
        const タブ = await 作業中のタブ();
        return { ok: true, 版: chrome.runtime.getManifest().version, 止めている: await 置き場.読む('止めている', false), 作業中: タブ ? { id: タブ.id, 題: タブ.title, 道: タブ.url } : null };
    },

    async 記録() { return { ok: true, 記録: (await 置き場.読む('記録', [])).slice(-30) }; },
    async 止める() { await 置き場.書く('止めている', true); await 全部離す(); return { ok: true, 訳: '止めました。「動かす」を押すまで、一切動きません' }; },
    async 動かす() { await 置き場.書く('止めている', false); return { ok: true, 訳: '動かせるようにしました' }; },

    async タブを見る() {
        const 開いた = await 手が開いたタブ();
        const 作業中 = await 置き場.今だけ読む('作業中のタブ', null);
        const 窓たち = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
        const タブ = [];
        for (const w of 窓たち) {
            for (const t of w.tabs || []) {
                const 道 = t.url || '';
                タブ.push({
                    id: t.id, 題: t.title || '', 道,
                    いま見ている: !!(t.active && w.focused), 作業中: t.id === 作業中,
                    手が開いた: 開いた.includes(t.id),
                    ARELM: await ARELMの画面か(道),
                    触ってよいか: /^https?:/.test(道) && !触ってはいけない先.some((x) => x.test(道)) && !(await ARELMの画面か(道)),
                });
            }
        }
        return { ok: true, タブ, 数: タブ.length };
    },

    async 開く({ 道, 新しいタブ }) {
        const u = String(道 || '').trim();
        if (!/^https?:\/\//i.test(u)) return { ok: false, 訳: 'http:// か https:// で始まる場所だけ開けます' };
        if (await ARELMの画面か(u)) return { ok: false, 訳: 'ARELM自身の画面は、手では開きません' };
        let タブ = await 作業中のタブ();
        const 開いた = await 手が開いたタブ();
        // ARELMの窓を押しのけないよう、手は自分の窓で開く
        let 窓 = await 手の窓();
        if (窓 != null) { try { await chrome.windows.get(窓); } catch { 窓 = null; } }
        if (新しいタブ || !タブ || !開いた.includes(タブ.id)) {
            if (窓 == null) {
                const w = await chrome.windows.create({ url: u, focused: true, type: 'normal' });
                窓 = w.id;
                await 置き場.今だけ書く('手の窓', 窓);
                タブ = w.tabs[0];
            } else {
                タブ = await chrome.tabs.create({ windowId: 窓, url: u, active: true });
            }
            開いた.push(タブ.id);
            await 置き場.今だけ書く('手が開いたタブ', 開いた.slice(-50));
        } else {
            タブ = await chrome.tabs.update(タブ.id, { url: u, active: true });
        }
        await 作業中にする(タブ);
        const 済 = await 読み込みを待つ(タブ.id);
        return { ok: true, 訳: `開きました: ${(済 && 済.title) || u}`, タブ: { id: タブ.id, 題: 済 && 済.title, 道: 済 && 済.url } };
    },

    async タブを選ぶ({ id }) {
        let タブ;
        try { タブ = await chrome.tabs.get(Number(id)); } catch { return { ok: false, 訳: 'そのタブはもうありません' }; }
        if (await ARELMの画面か(タブ.url || '')) return { ok: false, 訳: 'ARELM自身の画面は、作業するタブにできません' };
        await chrome.tabs.update(タブ.id, { active: true });
        await chrome.windows.update(タブ.windowId, { focused: true });
        await 作業中にする(タブ);
        return { ok: true, 訳: `「${タブ.title}」を作業するタブにしました` };
    },

    async タブを閉じる({ id }) {
        const 開いた = await 手が開いたタブ();
        if (!開いた.includes(Number(id))) return { ok: false, 訳: '手が開いたタブだけ閉じます（ご自身で開いたタブは閉じません）' };
        await chrome.tabs.remove(Number(id));
        await 置き場.今だけ書く('手が開いたタブ', 開いた.filter((x) => x !== Number(id)));
        return { ok: true, 訳: '閉じました' };
    },

    async 戻る() { const t = await 作業中のタブ(); if (!t) return { ok: false, 訳: 'タブがありません' }; await chrome.tabs.goBack(t.id).catch(() => {}); await 読み込みを待つ(t.id); return { ok: true, 訳: '戻りました' }; },
    async 進む() { const t = await 作業中のタブ(); if (!t) return { ok: false, 訳: 'タブがありません' }; await chrome.tabs.goForward(t.id).catch(() => {}); await 読み込みを待つ(t.id); return { ok: true, 訳: '進みました' }; },
    async 読み直す() { const t = await 作業中のタブ(); if (!t) return { ok: false, 訳: 'タブがありません' }; await chrome.tabs.reload(t.id); await 読み込みを待つ(t.id); return { ok: true, 訳: '読み込み直しました' }; },

    async ページを読む() {
        const t = await 作業中のタブ();
        if (!t) return { ok: false, 訳: '読むタブがありません。「開く」か「タブを選ぶ」で、先にタブを決めてください' };
        if (!/^https?:/.test(t.url || '')) return { ok: false, 訳: 'このタブ（Chromeの設定画面など）は読めません' };
        await 読み込みを待つ(t.id, 8);
        const 中身 = await ページで(t.id, ページを読み取る, [150, 4000]);
        if (!中身) return { ok: false, 訳: '読めませんでした' };
        return { ok: true, 訳: `読みました: ${中身.題}`, タブ: t.id, ...中身 };
    },

    async 写す() {
        const t = await 作業中のタブ();
        if (!t) return { ok: false, 訳: '写すタブがありません' };
        await chrome.tabs.update(t.id, { active: true });
        const 絵 = await chrome.tabs.captureVisibleTab(t.windowId, { format: 'jpeg', quality: 60 });
        return { ok: true, 訳: '写しました', 絵 };
    },

    async スクロール({ 向き }) {
        const t = await 作業中のタブ();
        const 可 = await 触ってよいタブか(t);
        if (!可.ok) return 可;
        const r = await ページで(t.id, ページの中で動かす, [null, 'スクロール', 向き === '上' ? '上' : '下']);
        return { ok: true, 訳: `${向き === '上' ? '上' : '下'}へ動かしました`, 位置: r && r.位置 };
    },

    async 押す({ 番, 本人が許した }) {
        const t = await 作業中のタブ();
        const 可 = await 触ってよいタブか(t);
        if (!可.ok) return 可;
        const 様 = await ページで(t.id, 部品を調べる, [Number(番), 確かめる言葉.source]);
        if (!様 || !様.ok) return 様 || { ok: false, 訳: '調べられませんでした' };
        if (様.本人が押す) return { ok: false, 本人が押す: true, 訳: `SUZURIの「${様.名}」は、ご自身で押してください（手は押しません）` };
        if (様.押せない) return { ok: false, 訳: `「${様.名}」は、いま押せない状態です` };
        if (様.確かめが要る && 本人が許した !== true) return { ok: false, 確かめが要る: true, 名: 様.名, 訳: `「${様.名}」を押す前に、確かめが要ります` };
        const 本物 = await デバッガーで(t.id, [
            ['Input.dispatchMouseEvent', { type: 'mouseMoved', x: 様.x, y: 様.y }],
            ['Input.dispatchMouseEvent', { type: 'mousePressed', x: 様.x, y: 様.y, button: 'left', clickCount: 1 }],
            ['Input.dispatchMouseEvent', { type: 'mouseReleased', x: 様.x, y: 様.y, button: 'left', clickCount: 1 }],
        ]);
        if (!本物) await ページで(t.id, ページの中で動かす, [Number(番), '押す', null]);
        await new Promise((ok) => setTimeout(ok, 600));
        await 読み込みを待つ(t.id, 8);
        return { ok: true, 訳: `「${様.名}」を押しました` };
    },

    async 打つ({ 番, 文, 足す }) {
        const t = await 作業中のタブ();
        const 可 = await 触ってよいタブか(t);
        if (!可.ok) return 可;
        const 中身 = String(文 == null ? '' : 文);
        if (!中身) return { ok: false, 訳: '打つ文字がありません' };
        if (中身.length > 2000) return { ok: false, 訳: '一度に打てるのは2000文字までです' };
        const 様 = await ページで(t.id, 部品を調べる, [Number(番), 確かめる言葉.source]);
        if (!様 || !様.ok) return 様 || { ok: false, 訳: '調べられませんでした' };
        if (!様.入力欄) return { ok: false, 訳: `「${様.名}」は、文字を打つ欄ではありません` };
        if (様.秘密 || 様.形に合言葉) return { ok: false, 訳: '合言葉・パスワード・カード番号などの欄には打ちません。ご自身で入れてください' };
        await ページで(t.id, ページの中で動かす, [Number(番), '的を合わせる', !!足す]);
        const 本物 = await デバッガーで(t.id, [['Input.insertText', { text: 中身 }]]);
        if (!本物) await ページで(t.id, ページの中で動かす, [Number(番), '打つ', 中身]);
        return { ok: true, 訳: `「${様.名 || '入力欄'}」に${中身.length}文字を打ちました` };
    },

    async 選ぶ({ 番, 値 }) {
        const t = await 作業中のタブ();
        const 可 = await 触ってよいタブか(t);
        if (!可.ok) return 可;
        const 様 = await ページで(t.id, 部品を調べる, [Number(番), 確かめる言葉.source]);
        if (!様 || !様.ok) return 様 || { ok: false, 訳: '調べられませんでした' };
        if (!様.選択) return { ok: false, 訳: `「${様.名}」は、選ぶ欄ではありません` };
        return (await ページで(t.id, ページの中で動かす, [Number(番), '選ぶ', String(値 == null ? '' : 値)])) || { ok: false, 訳: '選べませんでした' };
    },

    async キー({ キー, 本人が許した }) {
        const t = await 作業中のタブ();
        const 可 = await 触ってよいタブか(t);
        if (!可.ok) return 可;
        const 名 = キーの言い換え[キー] || キー;
        const k = キーの表[名];
        if (!k) return { ok: false, 訳: `「${キー}」は押せません（${Object.keys(キーの表).join('・')}）` };
        if (名 === 'Enter') {
            const 前 = await ページで(t.id, ページの中で動かす, [null, 'Enterの前', 確かめる言葉.source]);
            if (前 && 前.合言葉) return { ok: false, 訳: 'ログインの欄では、Enterを押しません。ご自身で押してください' };
            if (前 && 前.確かめが要る && 本人が許した !== true) return { ok: false, 確かめが要る: true, 名: 'Enter（送信）', 訳: 'Enterで送信されそうです。押す前に、確かめが要ります' };
        }
        const 下 = { type: k.text ? 'keyDown' : 'rawKeyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode, nativeVirtualKeyCode: k.windowsVirtualKeyCode };
        if (k.text) { 下.text = k.text; 下.unmodifiedText = k.text; }
        const 本物 = await デバッガーで(t.id, [
            ['Input.dispatchKeyEvent', 下],
            ['Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode, nativeVirtualKeyCode: k.windowsVirtualKeyCode }],
        ]);
        if (!本物) return { ok: false, 訳: 'キーを送れませんでした（開発者ツールを開いていると送れません）' };
        await new Promise((ok) => setTimeout(ok, 500));
        await 読み込みを待つ(t.id, 8);
        return { ok: true, 訳: `${名}を押しました` };
    },

    async 入り口() { return { ok: true, 既定: 既定の入り口.flatMap((x) => x.番号.map((n) => x.出どころ + (n ? ':' + n : '') + (x.道 || ''))), 足した: await 足した入り口() }; },
};

// 本人が許したかどうかは、頼む側が付ける印。AIが選んだ材料からは、ARELMの画面が外してから送る
const 動きすぎを数える操作 = new Set(['開く', '押す', '打つ', 'キー', '選ぶ', 'スクロール', 'タブを閉じる']);
const 止めていても使える操作 = new Set(['ようす', '記録', '止める', '動かす', '入り口']);

async function 頼みを受ける(msg, 送り手) {
    if (!送り手 || 送り手.id !== chrome.runtime.id || !送り手.tab || !(await ARELMの画面か(送り手.url || ''))) {
        return { ok: false, 訳: 'ARELMの画面からの頼みだけを受けます' };
    }
    const 操作 = String(msg.操作 || '');
    const 手 = 操作たち[操作];
    if (!手) return { ok: false, 訳: `「${操作}」はできません。できるのは: ${Object.keys(操作たち).join('・')}` };
    if (!止めていても使える操作.has(操作) && await 置き場.読む('止めている', false)) {
        return { ok: false, 止めている: true, 訳: '止めてあります。拡張機能のボタンか、ARELMの「動かす」で動かせます' };
    }
    if (動きすぎを数える操作.has(操作) && 動きすぎか()) return { ok: false, 訳: `1分に${一分の上限}回までにしてあります。少し待ってください` };
    let 結果;
    try { 結果 = await 手(msg.材料 || {}); }
    catch (e) { 結果 = { ok: false, 訳: 'できませんでした: ' + String(e && e.message || e).slice(0, 120) }; }
    if (!止めていても使える操作.has(操作) && 操作 !== 'タブを見る' && 操作 !== '写す') {
        const t = await 作業中のタブ().catch(() => null);
        await 記録を残す(操作, t && t.url, 結果);
    }
    return 結果;
}

chrome.runtime.onMessage.addListener((msg, 送り手, 返す) => {
    if (msg && msg.種類 === 'たのむ') { 頼みを受ける(msg, 送り手).then(返す); return true; }
    if (msg && msg.種類 === '小窓') {
        // 拡張機能の小窓（popup.html）から。小窓は拡張機能の中なので、ARELMの画面の確かめは要らない
        const 手 = { ようす: 操作たち.ようす, 記録: 操作たち.記録, 止める: 操作たち.止める, 動かす: 操作たち.動かす, 入り口: 操作たち.入り口, 入り口を足す: (m) => 入り口を足す(m.住所), 入り口を外す: (m) => 入り口を外す(m.出どころ) }[msg.操作];
        if (!手 || 送り手.id !== chrome.runtime.id || 送り手.tab) { 返す({ ok: false }); return false; }
        Promise.resolve(手(msg.材料 || {})).then(返す);
        return true;
    }
    return false;
});

chrome.runtime.onInstalled.addListener(() => { 入り口を登録し直す().catch(() => {}); });
