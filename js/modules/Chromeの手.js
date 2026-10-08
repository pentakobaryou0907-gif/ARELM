/**
 * Chromeの手（ARELMの画面の側）
 *
 * 本人の要望「Claude in Chrome のような機能を、自作アプリのオリジナルで」。
 * このChromeに入れた拡張機能「ARELMの手」（arelm-hand/）に頼んで、
 * ログイン済みのChromeのページを、読む・押す・打つ。Mac でも Windows でも同じ。
 *
 * 決まりの本体は拡張機能の側にある（ここから何を頼んでも、そこを通らないと動かない）:
 *   送信・購入・公開・削除などの手前で止まる／SUZURIの公開は押さない／合言葉・カードの欄に打たない／
 *   ログイン・支払いの画面は触らない／ARELM自身の画面は触らない／止めるでその場で止まる
 * この画面の側では:
 *   ・「確かめが要る」と返ってきたら、本人に聞く（「よい」を押したときだけ、もう一度頼む）
 *   ・AIが選んだ材料から「本人が許した」の印を外してから頼む（AIが自分で許せないように）
 *   ・自動で進めるときの頭は、Macの中のAI。Macが無いときは、本人が許したGemini（伏せてから送る）
 */

const 手の頼み待ち = new Map();
let 手の版 = null;

window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.ARELMの手 === 'います') {
        const 初めて = !手の版;
        手の版 = d.版 || '?';
        if (初めて) renderChromeの手();
    }
    if (d.ARELMの手 === 'こたえ' && 手の頼み待ち.has(d.id)) {
        手の頼み待ち.get(d.id)(d.結果 || { ok: false, 訳: '返事が空でした' });
        手の頼み待ち.delete(d.id);
    }
});

function Chromeの手があるか() { return !!手の版; }

function Chromeの手に頼む(操作, 材料 = {}, 秒 = 40) {
    if (!手の版) return Promise.resolve({ ok: false, 訳: 'このChromeに「ARELMの手」が入っていません' });
    return new Promise((ok) => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        手の頼み待ち.set(id, ok);
        window.postMessage({ ARELMの手: 'たのむ', id, 操作, 材料 }, location.origin);
        setTimeout(() => {
            if (!手の頼み待ち.has(id)) return;
            手の頼み待ち.delete(id);
            ok({ ok: false, 訳: '拡張機能から返事が来ませんでした' });
        }, 秒 * 1000);
    });
}

/* ---------- 本人に聞く ---------- */
let 手の確かめ待ち = null;

function 手の本人に確かめる(文) {
    const 欄 = document.getElementById('chrome-hand-approve');
    if (!欄) return Promise.resolve(false);
    if (手の確かめ待ち) 手の確かめ待ち(false);
    欄.textContent = '';
    欄.hidden = false;
    const p = document.createElement('p');
    p.textContent = 文;
    const よい = document.createElement('button');
    よい.type = 'button';
    よい.className = 'btn btn-primary';
    よい.textContent = 'よい（押す）';
    const やめる = document.createElement('button');
    やめる.type = 'button';
    やめる.className = 'btn btn-secondary';
    やめる.textContent = 'やめる';
    欄.append(p, よい, ' ', やめる);
    欄.scrollIntoView({ block: 'nearest' });
    return new Promise((ok) => {
        const 終わる = (答え) => { 欄.hidden = true; 欄.textContent = ''; 手の確かめ待ち = null; ok(答え); };
        手の確かめ待ち = 終わる;
        よい.addEventListener('click', () => 終わる(true));
        やめる.addEventListener('click', () => 終わる(false));
    });
}

/** 押す・打つ・キーを頼み、「確かめが要る」なら本人に聞いてから、もう一度頼む */
async function 手で確かめながら頼む(操作, 材料, 理由) {
    const 送る = { ...(材料 || {}) };
    delete 送る.本人が許した;
    let r = await Chromeの手に頼む(操作, 送る);
    if (r && r.確かめが要る) {
        const よい = await 手の本人に確かめる(`「${r.名 || 操作}」を押します。${理由 ? '（' + 理由 + '）' : ''}送信・購入・公開・削除などにあたるかもしれません。よろしいですか？`);
        if (!よい) return { ok: false, やめた: true, 訳: 'やめました（押していません）' };
        r = await Chromeの手に頼む(操作, { ...送る, 本人が許した: true });
    }
    return r;
}

/* ---------- 画面（手動） ---------- */
function 手の部品(タグ, 文, クラス) {
    const e = document.createElement(タグ);
    if (文 != null) e.textContent = 文;
    if (クラス) e.className = クラス;
    return e;
}

function 手のボタン(文, 押したら, クラス = 'btn btn-sm btn-secondary') {
    const b = 手の部品('button', 文, クラス);
    b.type = 'button';
    b.addEventListener('click', 押したら);
    return b;
}

function 手の結果を出す(文, 良い) {
    const 欄 = document.getElementById('chrome-hand-result');
    if (!欄) return;
    欄.textContent = 文 || '';
    欄.className = 'hint ' + (良い === false ? 'guard-on' : '');
}

function 手のページを描く(読) {
    const 箱 = document.getElementById('chrome-hand-view');
    if (!箱) return;
    箱.textContent = '';
    if (!読 || !読.ok) { 手の結果を出す((読 && 読.訳) || '読めませんでした', false); return; }
    箱.append(手の部品('h4', 読.題 || '（題なし）'));
    箱.append(手の部品('p', 読.道 || '', 'hint'));
    const 本文 = document.createElement('details');
    本文.append(手の部品('summary', 'ページの文字'));
    const pre = 手の部品('pre', (読.文 || '').slice(0, 4000));
    pre.style.cssText = 'white-space:pre-wrap;max-height:240px;overflow:auto;font-size:.85rem';
    本文.append(pre);
    箱.append(本文);
    const 一覧 = 手の部品('ol', null, 'chrome-hand-parts');
    (読.部品 || []).forEach((x) => {
        const li = document.createElement('li');
        li.value = x.番;
        li.append(手の部品('span', `[${x.種類}] ${x.名 || '（名前なし）'}`));
        if (x.種類 === '入力欄') {
            if (x.秘密) { li.append(手の部品('span', '（ご自身で入れてください）', 'hint')); }
            else {
                const 欄 = document.createElement('input');
                欄.type = 'text';
                欄.placeholder = '打つ文字';
                欄.setAttribute('aria-label', `${x.番}番に打つ文字`);
                li.append(欄, 手のボタン('打つ', async () => {
                    const r = await 手で確かめながら頼む('打つ', { 番: x.番, 文: 欄.value });
                    手の結果を出す(r.訳, r.ok);
                }));
            }
        } else if (x.種類 === '選択') {
            const 欄 = document.createElement('input');
            欄.type = 'text';
            欄.placeholder = '選ぶ項目';
            li.append(欄, 手のボタン('選ぶ', async () => {
                const r = await Chromeの手に頼む('選ぶ', { 番: x.番, 値: 欄.value });
                手の結果を出す(r.訳, r.ok);
            }));
        } else {
            li.append(手のボタン('押す', async () => {
                const r = await 手で確かめながら頼む('押す', { 番: x.番 });
                手の結果を出す(r.訳, r.ok);
                if (r.ok) 手のページを描く(await Chromeの手に頼む('ページを読む'));
            }));
        }
        一覧.append(li);
    });
    箱.append(一覧);
}

async function 手のタブを描く() {
    const 箱 = document.getElementById('chrome-hand-view');
    const r = await Chromeの手に頼む('タブを見る');
    if (!箱) return;
    箱.textContent = '';
    if (!r.ok) { 手の結果を出す(r.訳, false); return; }
    const ul = document.createElement('ul');
    r.タブ.filter((t) => /^https?:/.test(t.道)).forEach((t) => {
        const li = document.createElement('li');
        li.append(手の部品('span', `${t.作業中 ? '▶ ' : ''}${t.題 || t.道}`));
        if (t.ARELM) li.append(手の部品('span', '（ARELM）', 'hint'));
        else li.append(' ', 手のボタン('このタブで作業', async () => {
            const x = await Chromeの手に頼む('タブを選ぶ', { id: t.id });
            手の結果を出す(x.訳, x.ok);
            手のタブを描く();
        }));
        ul.append(li);
    });
    箱.append(ul);
}

async function renderChromeの手() {
    const 箱 = document.getElementById('chrome-hand-panel');
    if (!箱) return;
    箱.textContent = '';
    if (!手の版) {
        箱.append(手の部品('p', 'このChromeに拡張機能「ARELMの手」を入れると、ログイン済みのChromeのページを、ARELMから読む・押す・打つことができます（Mac・Windows の Chrome / Edge）。送信・購入・公開・削除の前は、必ずここで確かめます。'));
        const ol = document.createElement('ol');
        [
            '下の「ARELMの手をダウンロード」を押し、ZIPを開く（「arelm-hand」というフォルダができます）',
            'Chromeのアドレス欄に chrome://extensions と入れて開く（Edge は edge://extensions）',
            '右上の「デベロッパーモード」をオンにする',
            '「パッケージ化されていない拡張機能を読み込む」を押し、「arelm-hand」フォルダを選ぶ',
            'このページを読み込み直す',
        ].forEach((t) => ol.append(手の部品('li', t)));
        箱.append(ol);
        const a = 手の部品('a', '⬇ ARELMの手をダウンロード（ZIP）', 'btn btn-primary');
        a.href = 'arelm-hand.zip';
        a.setAttribute('download', 'arelm-hand.zip');
        箱.append(a);
        箱.append(手の部品('p', 'iPhone・iPad の Safari には入りません（Appleが許していないため）。一度入れたフォルダは、消さずに置いておいてください。', 'hint'));
        return;
    }
    const 様 = await Chromeの手に頼む('ようす');
    const 状 = 手の部品('p', 様.止めている ? '止めてあります（一切動きません）' : `✓ このChromeで使えます（ARELMの手 ${手の版}）`, 様.止めている ? 'status-banner warn' : 'status-banner ok');
    const 切り替え = 手のボタン(様.止めている ? '動かす' : '■ 止める', async () => {
        const r = await Chromeの手に頼む(様.止めている ? '動かす' : '止める');
        手の結果を出す(r.訳, r.ok);
        renderChromeの手();
    }, 様.止めている ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-danger');
    箱.append(状, 切り替え);

    const 開く行 = document.createElement('form');
    開く行.className = 'chrome-hand-open';
    const 住所 = document.createElement('input');
    住所.type = 'url';
    住所.placeholder = 'https://suzuri.jp/';
    住所.setAttribute('aria-label', '開くページ');
    const 開く = 手の部品('button', '開く', 'btn btn-sm btn-primary');
    開く.type = 'submit';
    開く行.append(住所, 開く);
    開く行.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await Chromeの手に頼む('開く', { 道: 住所.value.trim() });
        手の結果を出す(r.訳, r.ok);
        if (r.ok) 手のページを描く(await Chromeの手に頼む('ページを読む'));
    });
    箱.append(開く行);

    const 並び = document.createElement('div');
    並び.className = 'chrome-hand-tools';
    並び.append(
        手のボタン('タブを見る', 手のタブを描く),
        手のボタン('ページを読む', async () => 手のページを描く(await Chromeの手に頼む('ページを読む'))),
        手のボタン('写す', async () => {
            const r = await Chromeの手に頼む('写す');
            const v = document.getElementById('chrome-hand-view');
            if (!r.ok || !v) { 手の結果を出す(r.訳, false); return; }
            v.textContent = '';
            const img = document.createElement('img');
            img.src = r.絵;
            img.alt = '作業中のタブの写し';
            img.style.cssText = 'max-width:100%;border-radius:8px;border:1px solid var(--areglm-border,#ddd)';
            v.append(img);
        }),
        手のボタン('↑', async () => 手の結果を出す((await Chromeの手に頼む('スクロール', { 向き: '上' })).訳)),
        手のボタン('↓', async () => 手の結果を出す((await Chromeの手に頼む('スクロール', { 向き: '下' })).訳)),
        手のボタン('戻る', async () => 手の結果を出す((await Chromeの手に頼む('戻る')).訳)),
        手のボタン('Enter', async () => { const r = await 手で確かめながら頼む('キー', { キー: 'Enter' }); 手の結果を出す(r.訳, r.ok); }),
    );
    箱.append(並び);
    箱.append(手の部品('p', '「▶ お願いする」に「SUZURIで○○を探して」のように書くと、AIがこのChromeで一手ずつ進めます。', 'hint'));
    const 結果 = 手の部品('p', '', 'hint');
    結果.id = 'chrome-hand-result';
    結果.setAttribute('role', 'status');
    const 見る = document.createElement('div');
    見る.id = 'chrome-hand-view';
    箱.append(結果, 見る);
}

/* ---------- 自動で進める（AIが一手ずつ決める） ---------- */
const 手の使える作業 = [
    { 名: '開く', 説: 'http か https のページを開く', 要る: ['道'] },
    { 名: '押す', 説: 'いまのページの番号の部品（ボタン・リンク）を押す', 要る: ['番'] },
    { 名: '打つ', 説: 'いまのページの番号の入力欄に文字を打つ（前の文字は置き換わる）', 要る: ['番', '文'] },
    { 名: '選ぶ', 説: 'いまのページの番号の選ぶ欄で、項目を選ぶ', 要る: ['番', '値'] },
    { 名: 'キー', 説: 'キーを押す（Enter・Tab・Escape・ArrowDown など）。検索欄に打った後の Enter など', 要る: ['キー'] },
    { 名: 'スクロール', 説: 'ページを上か下へ動かす', 要る: ['向き'] },
    { 名: '戻る', 説: '一つ前のページへ戻る' },
];

/** AIに見せる、いまのページのまとめ（長すぎると考えが鈍るので、絞る） */
function 手の画面をまとめる(読) {
    if (!読 || !読.ok) return '（まだページを開いていません。最初は「開く」を使ってください）';
    let 場所 = 読.道 || '';
    try { const u = new URL(読.道); 場所 = u.origin + u.pathname; } catch { /* そのまま */ }
    const 部品 = (読.部品 || []).slice(0, 80).map((x) => `${x.番}. [${x.種類}] ${x.名 || '（名前なし）'}${x.秘密 ? '（本人が入れる欄）' : ''}${x.入っている ? '（入力済み）' : ''}`).join('\n');
    return `題: ${読.題}\n場所: ${場所}\n部品:\n${部品}\n本文（抜粋）:\n${(読.文 || '').slice(0, 1500)}`.slice(0, 5000);
}

/** 外のAI（Gemini）へ送る前に、カード番号・メール・鍵らしきものを伏せる */
function 手の画面を伏せる(文) {
    let 出 = String(文 || '');
    const 型たち = (typeof 外のAI === 'object' && 外のAI && 外のAI.送らない中身) || [];
    型たち.forEach(([型]) => { 出 = 出.replace(new RegExp(型.source, 'g'), '［伏せた］'); });
    return 出;
}

async function 手の次の一手(目的, これまで, 画面) {
    const 公開先 = typeof サーバーの無い公開先か === 'function' && サーバーの無い公開先か();
    if (!公開先) {
        try {
            const r = await fetch('/api/hand/step', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 目的, これまで, 使える作業: 手の使える作業, 画面 }),
            });
            if (r.ok) return await r.json();
        } catch { /* Macにつながらなければ、次の頭へ */ }
    }
    if (typeof 外のAI === 'object' && 外のAI && 外のAI.使えるか()) {
        try { return await 外のAI.手の一手(目的, これまで, 手の画面を伏せる(画面), 手の使える作業); }
        catch (e) { return { する: false, 終わり: true, 訳: 'Geminiが答えませんでした: ' + e.message }; }
    }
    return { する: false, 終わり: true, 訳: '自動で進めるには、Macが起きているか、Gemini の設定（☁ Mac無しで使う）が要ります。上の手動の操作は、いつでも使えます。' };
}

let 手の自動を止める = false;
let 手の自動が進行中 = false;

/** 目的が、Chromeのページで済む頼みか（音量・アプリなど、パソコンそのものの頼みは、これまで通りMacへ） */
function Chromeで済む頼みか(目的) {
    return /chrome|ブラウザ|サイト|ページ|開いて|検索|調べ|https?:|www\.|\.(com|jp|net|org|io|co)\b|suzuri|base|instagram|tiktok|youtube|x\.com|twitter|google|gemini|chatgpt|amazon|楽天|メルカリ|カート|投稿|ログイン/i.test(String(目的 || ''));
}

async function Chromeの手で自動作業を始める(目的) {
    if (手の自動が進行中) return;
    手の自動が進行中 = true;
    手の自動を止める = false;
    const 書く = (文) => (typeof 自動作業ログに足す === 'function' ? 自動作業ログに足す(文) : 手の結果を出す(文));
    const ログ = document.getElementById('remote-auto-log');
    const 止めるボタン = document.getElementById('remote-auto-stop');
    const 始めるボタン = document.querySelector('#remote-auto-form button[type="submit"]');
    if (ログ) ログ.innerHTML = '';
    if (止めるボタン) 止めるボタン.hidden = false;
    if (始めるボタン) 始めるボタン.disabled = true;
    書く(`目的: ${目的}（Chromeの手で進めます）`);

    const これまで = [];
    const 上限 = 15;
    let 最後 = '';
    try {
        for (let i = 0; i < 上限; i++) {
            if (手の自動を止める) { 書く('（止めました）'); break; }
            const 読 = await Chromeの手に頼む('ページを読む');
            if (読 && 読.止めている) { 書く(読.訳); break; }
            const 決めた = await 手の次の一手(目的, これまで, 手の画面をまとめる(読));
            if (手の自動を止める) { 書く('（止めました）'); break; }
            if (!決めた || !決めた.する) { 最後 = (決めた && 決めた.訳) || '決められませんでした'; 書く(最後); break; }
            if (!手の使える作業.some((x) => x.名 === 決めた.作業)) { 書く(`「${決めた.作業}」は使える作業にないため、止めます`); break; }
            const 材料 = (決めた.材料 && typeof 決めた.材料 === 'object') ? { ...決めた.材料 } : {};
            delete 材料.本人が許した;   // AIは自分で許せない
            const 結果 = await 手で確かめながら頼む(決めた.作業, 材料, 決めた.訳);
            const 材料文 = Object.keys(材料).length ? '（' + Object.entries(材料).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join('、') + '）' : '';
            書く(`${i + 1}. ${決めた.作業}${材料文} → ${結果.訳 || (結果.ok ? 'できました' : 'できませんでした')}`);
            これまで.push({ 作業: 決めた.作業, 材料, 結果: { ok: !!結果.ok, 訳: 結果.訳 || '' } });
            if (結果.やめた || 結果.本人が押す || 結果.止めている) break;
            await new Promise((ok) => setTimeout(ok, 500));
        }
    } finally {
        if (止めるボタン) 止めるボタン.hidden = true;
        if (始めるボタン) 始めるボタン.disabled = false;
        手の自動が進行中 = false;
        if (手の確かめ待ち) 手の確かめ待ち(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 橋（拡張機能）は、この部品より先に「います」と言うことがあるので、こちらから聞き直す
    window.postMessage({ ARELMの手: 'いますか' }, location.origin);
    setTimeout(() => window.postMessage({ ARELMの手: 'いますか' }, location.origin), 1500);
    renderChromeの手();
    document.getElementById('remote-auto-stop')?.addEventListener('click', () => {
        手の自動を止める = true;
        if (手の確かめ待ち) 手の確かめ待ち(false);
    });
});

window.Chromeの手に頼む = Chromeの手に頼む;
window.Chromeの手があるか = Chromeの手があるか;
window.Chromeの手で自動作業を始める = Chromeの手で自動作業を始める;
window.Chromeで済む頼みか = Chromeで済む頼みか;
if (typeof module !== 'undefined' && module.exports) module.exports = { 手の画面をまとめる, 手の画面を伏せる, Chromeで済む頼みか, 手の使える作業 };
