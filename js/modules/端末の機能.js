/**
 * 端末の機能を、どの端末からでも使う（遠隔操作ページの一番上）
 *
 * 本人の要望（2026-10-08）: スマホにも入れて、各端末に入っているサービスを、どの端末からでも使えるように。
 *
 * できることと、その理由:
 *   ブラウザで動くアプリは、OSの決まりで、ほかのアプリを直接は操作できない（端末を守るための制限）。
 *   そこで、OSが用意している正規の入口だけを使う:
 *     ・iPhone・iPad・Mac … 「ショートカット」の実行（shortcuts://）。本人が作ったショートカットで、
 *                         リマインダー・メモ・音楽・家電など、その端末の機能を何でも呼べる
 *     ・どの端末でも     … 地図・電話・メッセージ・メール・各SNSやお店（公式のアドレスで、入っていればアプリが開く）
 *   他の端末への頼みは、同期で届け、その端末で本人が「実行する」を押したときだけ動く（勝手には動かさない）。
 *   Macのアプリ・Chromeの操作は、この下の「お願いする」（Macの「パソコンを操る」）から。
 *
 * 守ること:
 *   ・頼みに入れるのは「どの機能を、何の入力で」だけ。URLそのものは入れない。
 *     受け取った端末が、下の決まった形からURLを組み立てる（同期で届いた中身から、知らない行き先を開かないため）
 *   ・お金が絡む操作・送信は、開いた先のアプリで本人が行う（ここからは押さない）
 */

const 端末の頼みの鍵 = 'areglm_device_requests';   // 同期する（全部の端末で同じ一覧）
const この端末の名前の鍵 = 'areglm_device_name';     // 端末ごと（同期しない）

function 端末の機能_種類() {
    return typeof ホーム画面用の端末 === 'function' ? ホーム画面用の端末() : 'その他';
}

function 端末の機能_名前() {
    try { return localStorage.getItem(この端末の名前の鍵) || 端末の機能_種類(); } catch { return 端末の機能_種類(); }
}

const 端末の機能_り = (s) => encodeURIComponent(String(s || '').trim());
const 端末の機能_番号 = (s) => String(s || '').replace(/[^\d+]/g, '');

function 端末の機能_店(名) {
    const p = window.AREGLM_PROFILE || {};
    const 店 = (p.shops && p.shops[名]) || (p.sns && p.sns[名]) || null;
    return 店 && /^https:\/\//.test(店.url) ? 店.url : null;
}

/** 機能の一覧。url(入力, 端末の種類) は、決まった形のURLだけを返す */
const 端末の機能の一覧 = [
    { id: 'shortcut', 名: 'ショートカットを実行', 対象: ['iPhone', 'iPad', 'Mac'], 入力: ['ショートカットの名前', '渡す文字（任意）'],
        url: ([名, 文]) => (String(名 || '').trim() ? `shortcuts://run-shortcut?name=${端末の機能_り(名)}${String(文 || '').trim() ? `&input=text&text=${端末の機能_り(文)}` : ''}` : null) },
    { id: 'map', 名: '地図で探す', 入力: ['場所・お店の名前'],
        url: ([場所], 種類) => (String(場所 || '').trim() ? (['iPhone', 'iPad', 'Mac'].includes(種類) ? `maps://?q=${端末の機能_り(場所)}` : `https://www.google.com/maps/search/?api=1&query=${端末の機能_り(場所)}`) : null) },
    { id: 'tel', 名: '電話をかける', 対象: ['iPhone', 'Android'], 入力: ['電話番号'],
        url: ([番号]) => (端末の機能_番号(番号).length >= 3 ? `tel:${端末の機能_番号(番号)}` : null) },
    { id: 'sms', 名: 'メッセージを書く', 入力: ['宛先の電話番号', '文'],
        url: ([番号, 文]) => (端末の機能_番号(番号).length >= 3 ? `sms:${端末の機能_番号(番号)}${String(文 || '').trim() ? `&body=${端末の機能_り(文)}` : ''}` : null) },
    { id: 'mail', 名: 'メールを書く', 入力: ['宛先のメールアドレス', '件名', '本文'],
        url: ([宛先, 件名, 本文]) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(宛先 || '').trim()) ? `mailto:${String(宛先).trim()}?subject=${端末の機能_り(件名)}&body=${端末の機能_り(本文)}` : null) },
    { id: 'instagram', 名: 'Instagram（AReGLM）を開く', 入力: [], url: () => 端末の機能_店('instagram') },
    { id: 'tiktok', 名: 'TikTok（AReGLM）を開く', 入力: [], url: () => 端末の機能_店('tiktok') },
    { id: 'youtube', 名: 'YouTube（AReGLM）を開く', 入力: [], url: () => 端末の機能_店('youtube') },
    { id: 'suzuri', 名: 'SUZURIのお店を開く', 入力: [], url: () => 端末の機能_店('suzuri') },
    { id: 'base', 名: 'BASEのお店を開く', 入力: [], url: () => 端末の機能_店('base') },
];

/** 機能と入力から、開くURLを組み立てる（決まった形だけ。組み立てられなければ null） */
function 端末の機能のURL(機能id, 入力, 種類 = 端末の機能_種類()) {
    const 機 = 端末の機能の一覧.find((x) => x.id === 機能id);
    if (!機) return null;
    if (機.対象 && !機.対象.includes(種類)) return null;
    const url = 機.url(Array.isArray(入力) ? 入力.map((v) => String(v == null ? '' : v).slice(0, 500)) : [], 種類);
    // 念のため、決まった入口以外は開かない
    return url && /^(shortcuts:\/\/run-shortcut\?|maps:\/\/\?q=|tel:|sms:|mailto:|https:\/\/)/.test(url) ? url : null;
}

function 端末の頼みを読む() {
    try { const x = JSON.parse(localStorage.getItem(端末の頼みの鍵) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; }
}

function 端末の頼みを書く(一覧) {
    localStorage.setItem(端末の頼みの鍵, JSON.stringify(一覧.slice(-200)));   // 古いものは、済んだものから順に送り出す
}

/** この端末に宛てた、まだの頼み */
function この端末への頼み(一覧 = 端末の頼みを読む(), 名前 = 端末の機能_名前(), 種類 = 端末の機能_種類()) {
    return 一覧.filter((r) => r.状態 === '待ち' && (r.宛先 === 名前 || r.宛先 === 種類 || r.宛先 === 'どの端末でも'));
}

function 端末の機能_開く(url) {
    // 新しい窓ではなく、その場で開く（ショートカット・電話などは、OSがアプリへ渡す）
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener noreferrer';
    if (/^https:\/\//.test(url)) a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function 端末の機能_部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function render端末の機能() {
    const 箱 = document.getElementById('device-functions-panel');
    if (!箱) return;
    箱.textContent = '';
    const 種類 = 端末の機能_種類();

    // この端末の名前
    const 名の行 = 端末の機能_部品('p');
    const 名 = document.createElement('input');
    名.type = 'text';
    名.value = 端末の機能_名前();
    名.style.width = '160px';
    名.addEventListener('change', () => { try { localStorage.setItem(この端末の名前の鍵, 名.value.trim() || 種類); } catch { /* 無視 */ } render端末の機能(); });
    名の行.append(`この端末（${種類}）の呼び名: `, 名);
    箱.append(名の行);

    // この端末への頼み
    const 待ち = この端末への頼み();
    if (待ち.length) {
        const 帯 = 端末の機能_部品('div', null, 'status-banner warn');
        帯.append(端末の機能_部品('p', `この端末への頼みが ${待ち.length}件 あります（押したときだけ動きます）`));
        待ち.forEach((r) => {
            const 機 = 端末の機能の一覧.find((x) => x.id === r.機能);
            const url = 端末の機能のURL(r.機能, r.入力, 種類);
            const 行 = 端末の機能_部品('p', `${r.頼んだ端末 || '別の端末'}から: ${機 ? 機.名 : r.機能}${(r.入力 || []).filter(Boolean).length ? '（' + r.入力.filter(Boolean).join('・') + '）' : ''} `);
            const 実行 = 端末の機能_部品('button', url ? '実行する' : 'この端末ではできません', 'btn btn-sm btn-primary');
            実行.type = 'button';
            実行.disabled = !url;
            実行.addEventListener('click', () => {
                const 一覧 = 端末の頼みを読む();
                const t = 一覧.find((z) => z.id === r.id);
                if (t) { t.状態 = '済'; t.済んだ日 = new Date().toISOString(); t.済んだ端末 = 端末の機能_名前(); 端末の頼みを書く(一覧); }
                端末の機能_開く(url);
                render端末の機能();
            });
            const 見送る = 端末の機能_部品('button', '見送る', 'btn btn-sm btn-secondary');
            見送る.type = 'button';
            見送る.addEventListener('click', () => {
                const 一覧 = 端末の頼みを読む();
                const t = 一覧.find((z) => z.id === r.id);
                if (t) { t.状態 = '見送り'; t.済んだ日 = new Date().toISOString(); 端末の頼みを書く(一覧); }
                render端末の機能();
            });
            行.append(実行, ' ', 見送る);
            帯.append(行);
        });
        箱.append(帯);
    }

    // 機能を使う・頼む
    const 形 = document.createElement('form');
    形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
    const 機能 = document.createElement('select');
    端末の機能の一覧.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.名 + (m.対象 ? `（${m.対象.join('・')}）` : ''); 機能.append(o); });
    const 入力欄 = 端末の機能_部品('span');
    入力欄.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    const 入力を描く = () => {
        入力欄.textContent = '';
        const 機 = 端末の機能の一覧.find((x) => x.id === 機能.value);
        (機.入力 || []).forEach((見本) => { const i = document.createElement('input'); i.type = 'text'; i.placeholder = 見本; i.style.width = '150px'; 入力欄.append(i); });
    };
    機能.addEventListener('change', 入力を描く);
    入力を描く();
    const 宛先 = document.createElement('select');
    const 既知 = [...new Set(端末の頼みを読む().flatMap((r) => [r.宛先, r.頼んだ端末]).filter(Boolean))];
    ['この端末で今すぐ', 'どの端末でも', 'iPhone', 'iPad', 'Android', 'Windows', 'Mac', ...既知]
        .filter((v, i, a) => a.indexOf(v) === i && v !== 端末の機能_名前())
        .forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v === 'この端末で今すぐ' ? v : `${v} に頼む`; 宛先.append(o); });
    const 押す = 端末の機能_部品('button', '使う', 'btn btn-sm btn-primary');
    押す.type = 'submit';
    形.append(機能, 入力欄, 宛先, 押す);
    形.addEventListener('submit', (e) => {
        e.preventDefault();
        const 入力 = [...入力欄.querySelectorAll('input')].map((i) => i.value);
        if (宛先.value === 'この端末で今すぐ') {
            const url = 端末の機能のURL(機能.value, 入力, 種類);
            if (!url) { showNotification('この端末ではできないか、入力が足りません', 'error'); return; }
            端末の機能_開く(url);
            return;
        }
        // 他の端末への頼み。URLは入れず、機能と入力だけを届ける
        const 一覧 = 端末の頼みを読む();
        一覧.push({ id: 'dr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), 機能: 機能.value, 入力: 入力.map((v) => String(v).slice(0, 500)), 宛先: 宛先.value, 頼んだ端末: 端末の機能_名前(), 頼んだ日: new Date().toISOString(), 状態: '待ち' });
        端末の頼みを書く(一覧);
        showNotification(`${宛先.value}へ届けました。その端末でARELMを開くと、「実行する」が出ます`, 'success');
        render端末の機能();
    });
    箱.append(形);
    箱.append(端末の機能_部品('p',
        'iPhone・iPad・Macでは、「ショートカット」アプリで作ったものを名前で呼べます（リマインダー・メモ・音楽・家電なども）。'
        + '他の端末への頼みは、同期で届き、その端末で本人が押したときだけ動きます。Macのアプリ・Chromeの操作は、下の「お願いする」から。', 'hint'));
}

/** 開いたとき、この端末への頼みがあれば知らせる（実行はしない） */
function この端末への頼みを知らせる() {
    const 待ち = この端末への頼み();
    if (待ち.length && typeof showNotification === 'function') {
        showNotification(`この端末への頼みが${待ち.length}件あります（遠隔操作ページの一番上）`, 'info');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    render端末の機能();
    // 同期の取り込みが済んでから見る
    setTimeout(この端末への頼みを知らせる, 4000);
});

window.render端末の機能 = render端末の機能;
window.端末の機能のURL = 端末の機能のURL;
