/**
 * お金（ホームの「お金」タブ）
 *
 * 本人の要望（2026-10-08）: 銀行・支払い・ポイント・仮想通貨など、持っているお金の動きを、
 * 何に使ったかまで一か所で見えるようにする。マネーフォワードを参考に。
 * 将来は投資（株・NISA・FX・仮想通貨）も、学びながら判断できるようにする。
 *
 * 参考にした考え方（画面やデータは写していない）:
 *   口座の一覧と資産の合計 ／ 月ごとの収入・支出・差額 ／ 分類ごとの支出と予算 ／ 明細の取り込み
 *
 * 決まり:
 *   ・銀行・証券会社・取引所へのログインや自動操作はしない（金融の資格情報を入れない）。
 *     入力は手で、または本人が書き出したCSVの取り込みで行う
 *   ・投資は「学ぶ・記録する・仮想の売買で練習する・見込みを計算する」まで。実際の売買は本人の判断と操作だけ。
 *     自動売買はしない。「確実に勝つ」はできないことを、画面に必ず出す
 *   ・とても個人的な情報。他の端末との同期でGitHubの倉庫に置くときは、端末とMacの側で暗号化した形でだけ置く
 *   ・消さない。間違えた記録は「取り消し」の印を付けて残す
 */

const お金の鍵 = 'areglm_money';

const 口座の種類 = ['銀行', '現金', '電子マネー・QR', 'ポイント', 'クレジットカード', '証券・NISA', 'FX', '仮想通貨', 'その他'];
const 支出の分類 = ['仕入れ・材料', '制作・外注', '手数料', '送料・梱包', '広告・宣伝', 'ツール・通信', '食費', '日用品', '交通', '住まい', '趣味・自分磨き', '学び', 'その他'];
const 収入の分類 = ['売上（ブランド）', '売上（古着）', '給料・バイト', 'ポイント・還元', '投資の利益', 'その他'];

function お金を読む() {
    try {
        const x = JSON.parse(localStorage.getItem(お金の鍵) || 'null') || {};
        return {
            口座: Array.isArray(x.口座) ? x.口座 : [],
            動き: Array.isArray(x.動き) ? x.動き : [],
            予算: x.予算 && typeof x.予算 === 'object' ? x.予算 : {},
            練習: x.練習 && Array.isArray(x.練習.持ち) ? x.練習 : { 持ち: [], 記録: [] },
            学び: Array.isArray(x.学び) ? x.学び : [],
        };
    } catch {
        return { 口座: [], 動き: [], 予算: {}, 練習: { 持ち: [], 記録: [] }, 学び: [] };
    }
}

function お金を書く(x) {
    localStorage.setItem(お金の鍵, JSON.stringify(x));
}

function お金の番号() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function お金の円(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '−' : '') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}

/** 月の収支・分類ごとの支出・資産の合計（画面と試験の両方で使う） */
function お金をまとめる(x, 月 = new Date().toISOString().slice(0, 7)) {
    const 生きている = x.動き.filter((m) => !m.取り消し);
    const 今月 = 生きている.filter((m) => String(m.日 || '').startsWith(月));
    const 収入 = 今月.filter((m) => m.向き === '収入').reduce((a, m) => a + Number(m.金額 || 0), 0);
    const 支出 = 今月.filter((m) => m.向き === '支出').reduce((a, m) => a + Number(m.金額 || 0), 0);
    const 分類別 = {};
    今月.filter((m) => m.向き === '支出').forEach((m) => { 分類別[m.分類 || 'その他'] = (分類別[m.分類 || 'その他'] || 0) + Number(m.金額 || 0); });
    const 予算超え = Object.entries(x.予算 || {}).filter(([k, v]) => Number(v) > 0 && (分類別[k] || 0) > Number(v)).map(([k]) => k);
    const 種類別 = {};
    let 資産 = 0;
    x.口座.forEach((a) => {
        // クレジットカードは、使った分が「これから払うお金」なので、資産から引く
        const 値 = (a.種類 === 'クレジットカード' ? -1 : 1) * Number(a.残高 || 0);
        種類別[a.種類] = (種類別[a.種類] || 0) + 値;
        資産 += 値;
    });
    // マネーフォワードの明細では、大項目が「収入」で、中項目に「売上」が入るため、両方を見る
    const ブランドの売上 = 今月.filter((m) => m.向き === '収入' && /売上/.test(`${m.分類 || ''} ${m.小分類 || ''}`)).reduce((a, m) => a + Number(m.金額 || 0), 0);
    return { 月, 収入, 支出, 差額: 収入 - 支出, 分類別, 予算超え, 資産, 種類別, ブランドの売上 };
}

/** 動きを足す。口座を選んでいれば、その残高も動かす */
function お金の動きを足す(x, 動き) {
    const m = Object.assign({ id: お金の番号(), 日: new Date().toISOString().slice(0, 10) }, 動き);
    m.金額 = Math.abs(Number(m.金額) || 0);
    x.動き.push(m);
    const 口座 = x.口座.find((a) => a.id === m.口座);
    const 先 = x.口座.find((a) => a.id === m.先の口座);
    const 符号 = (a) => (a && a.種類 === 'クレジットカード' ? -1 : 1);   // カードは使うと「払う分」が増える
    if (口座) {
        if (m.向き === '収入') 口座.残高 = Number(口座.残高 || 0) + 符号(口座) * m.金額;
        if (m.向き === '支出' || m.向き === '振替') 口座.残高 = Number(口座.残高 || 0) - 符号(口座) * m.金額;
        口座.更新日 = m.日;
    }
    if (m.向き === '振替' && 先) {
        先.残高 = Number(先.残高 || 0) + 符号(先) * m.金額;
        先.更新日 = m.日;
    }
    return m;
}

/** CSVの一行を、引用符を考えて区切る */
function CSVの行を分ける(行) {
    const 列 = [];
    let 今 = '';
    let 引用 = false;
    for (let i = 0; i < 行.length; i++) {
        const c = 行[i];
        if (引用) {
            if (c === '"' && 行[i + 1] === '"') { 今 += '"'; i++; }
            else if (c === '"') 引用 = false;
            else 今 += c;
        } else if (c === '"') 引用 = true;
        else if (c === ',') { 列.push(今); 今 = ''; }
        else 今 += c;
    }
    列.push(今);
    return 列.map((v) => v.trim());
}

/**
 * 本人が書き出した明細のCSVを、動きに変える。
 * 見出しに「日付」「内容」「金額」を含むもの（マネーフォワードの書き出し・銀行の明細の多く）に対応する。
 * 金額がマイナスなら支出、プラスなら収入。「振替」の列が1のものは振替として扱う。
 */
function 明細のCSVを読む(文字) {
    const 行たち = String(文字 || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!行たち.length) return [];
    const 見出し = CSVの行を分ける(行たち[0]);
    const 位置 = (候補) => 見出し.findIndex((h) => 候補.some((c) => h.includes(c)));
    const 日 = 位置(['日付', '取引日', 'date', 'Date']);
    const 内容 = 位置(['内容', '摘要', 'お取引内容', 'description']);
    const 金額 = 位置(['金額', 'amount', 'Amount']);
    const 分類 = 位置(['大項目', '分類', 'カテゴリ']);
    const 中分類 = 位置(['中項目']);
    const 口座 = 位置(['保有金融機関', '口座', '金融機関']);
    const 振替 = 位置(['振替']);
    const 対象 = 位置(['計算対象']);
    if (日 < 0 || 金額 < 0) return [];
    return 行たち.slice(1).map((l) => {
        const c = CSVの行を分ける(l);
        // 見出しと列の数が合わない行は、列がずれて金額を読み違えるため、取り込まない
        if (c.length !== 見出し.length) return null;
        if (対象 >= 0 && c[対象] === '0') return null;   // 計算の対象外にした明細は取り込まない
        const 値 = Number(String(c[金額] || '').replace(/[¥,円\s]/g, ''));
        if (!c[日] || !isFinite(値) || 値 === 0) return null;
        return {
            日: String(c[日]).replace(/\//g, '-').slice(0, 10),
            内容: 内容 >= 0 ? c[内容] : '',
            金額: Math.abs(値),
            向き: 振替 >= 0 && c[振替] === '1' ? '振替' : 値 < 0 ? '支出' : '収入',
            分類: 分類 >= 0 && c[分類] ? c[分類] : 'その他',
            小分類: 中分類 >= 0 ? c[中分類] : '',
            口座名: 口座 >= 0 ? c[口座] : '',
            取り込み: true,
        };
    }).filter(Boolean);
}

/** 毎月の積立の見込み（年率は仮定。将来を約束するものではない） */
function 積立の見込み(月額, 年率, 年数) {
    const r = Number(年率) / 100 / 12;
    const n = Math.round(Number(年数) * 12);
    const 元本 = Number(月額) * n;
    const 見込み = r === 0 ? 元本 : Number(月額) * ((Math.pow(1 + r, n) - 1) / r);
    return { 元本: Math.round(元本), 見込み: Math.round(見込み), 増えた分: Math.round(見込み - 元本) };
}

/** 練習（仮想の売買）の損益 */
function 練習の損益(持ち) {
    const 買い = Number(持ち.買値) * Number(持ち.数量);
    const 今 = Number(持ち.今の値 ?? 持ち.買値) * Number(持ち.数量);
    return { 買い, 今, 損益: 今 - 買い, 率: 買い ? Math.round(((今 - 買い) / 買い) * 1000) / 10 : 0 };
}

/* ---------------- 画面 ---------------- */

function お金の部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function お金の選択(名前たち, 既定) {
    const s = document.createElement('select');
    名前たち.forEach((n) => {
        const o = document.createElement('option');
        if (typeof n === 'object') { o.value = n.値; o.textContent = n.名; } else { o.value = n; o.textContent = n; }
        if (o.value === 既定) o.selected = true;
        s.append(o);
    });
    return s;
}

function お金の入力(種類, 見本, 幅) {
    const i = document.createElement('input');
    i.type = 種類;
    if (見本) i.placeholder = 見本;
    if (幅) i.style.width = 幅;
    if (種類 === 'number') i.step = 'any';
    return i;
}

function お金の札(題) {
    const 札 = お金の部品('div', null, 'panel-card');
    札.style.margin = '0';
    札.append(お金の部品('h4', 題));
    return 札;
}

function renderお金() {
    const 箱 = document.getElementById('money-panel');
    if (!箱) return;
    const x = お金を読む();
    const ま = お金をまとめる(x);
    箱.textContent = '';

    箱.append(お金の部品('p',
        '口座や明細は、手で入れるか、ご自身で書き出したCSVを取り込みます（銀行や証券会社にはログインしません）。'
        + '投資は、ブランドの収入が安定してから、少ない額（100円）から。どんな分析でも「確実に勝つ」ことはできず、'
        + 'FXは元本より大きく損をすることもあります。ここでできるのは、学ぶ・記録する・仮想の売買で練習することまでで、'
        + '実際の売買はご自身の判断で行ってください。', 'status-banner warn'));

    const 並び = お金の部品('div');
    並び.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px';
    箱.append(並び);

    /* ---- 資産 ---- */
    const 資産 = お金の札('🏦 資産');
    資産.append(お金の部品('p', `合計 ${お金の円(ま.資産)}`, 'stat-big'));
    Object.entries(ま.種類別).forEach(([k, v]) => 資産.append(お金の部品('p', `${k}: ${お金の円(v)}`, 'hint')));
    const 一覧 = お金の部品('ul');
    x.口座.forEach((a) => {
        const li = お金の部品('li', `${a.名}（${a.種類}）${お金の円(a.残高)}${a.更新日 ? ' ・' + a.更新日 : ''} `);
        const 直す = お金の部品('button', '残高を直す', 'btn btn-sm btn-secondary');
        直す.type = 'button';
        直す.addEventListener('click', () => {
            const v = prompt(`${a.名} のいまの残高（円）`, String(a.残高 || 0));
            if (v == null || v.trim() === '' || !isFinite(Number(v))) return;
            const y = お金を読む();
            const t = y.口座.find((b) => b.id === a.id);
            if (!t) return;
            t.残高 = Number(v);
            t.更新日 = new Date().toISOString().slice(0, 10);
            お金を書く(y);
            renderお金();
        });
        li.append(直す);
        一覧.append(li);
    });
    資産.append(一覧);
    const 口座の形 = document.createElement('form');
    口座の形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    const 名 = お金の入力('text', '口座の名前（例: 〇〇銀行）', '160px');
    const 種 = お金の選択(口座の種類, '銀行');
    const 残 = お金の入力('number', '残高', '110px');
    const 足す = お金の部品('button', '口座を足す', 'btn btn-sm btn-primary');
    足す.type = 'submit';
    口座の形.append(名, 種, 残, 足す);
    口座の形.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!名.value.trim()) return;
        const y = お金を読む();
        y.口座.push({ id: お金の番号(), 名: 名.value.trim(), 種類: 種.value, 残高: Number(残.value) || 0, 更新日: new Date().toISOString().slice(0, 10) });
        お金を書く(y);
        renderお金();
    });
    資産.append(口座の形);
    並び.append(資産);

    /* ---- 今月の収支と予算 ---- */
    const 収支 = お金の札(`📊 ${ま.月} の収支`);
    収支.append(お金の部品('p', `収入 ${お金の円(ま.収入)} ／ 支出 ${お金の円(ま.支出)} ／ 差額 ${お金の円(ま.差額)}`));
    if (ま.ブランドの売上) 収支.append(お金の部品('p', `うち売上 ${お金の円(ま.ブランドの売上)}`, 'hint'));
    const 最大 = Math.max(1, ...Object.values(ま.分類別), ...Object.values(x.予算).map(Number));
    支出の分類.forEach((k) => {
        const 使った = ま.分類別[k] || 0;
        const 予算 = Number(x.予算[k] || 0);
        if (!使った && !予算) return;
        const 行 = お金の部品('div');
        行.style.cssText = 'margin:4px 0';
        行.append(お金の部品('div', `${k}: ${お金の円(使った)}${予算 ? ` ／ 予算 ${お金の円(予算)}` : ''}${ま.予算超え.includes(k) ? ' ⚠ 予算を超えています' : ''}`, 'hint'));
        const 棒 = お金の部品('div');
        棒.style.cssText = `height:6px;border-radius:3px;background:${ま.予算超え.includes(k) ? '#dc2626' : '#3b82f6'};width:${Math.round((使った / 最大) * 100)}%`;
        行.append(棒);
        収支.append(行);
    });
    const 予算の形 = document.createElement('form');
    予算の形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px';
    const 予算の分類 = お金の選択(支出の分類, '食費');
    const 予算の額 = お金の入力('number', '月の予算', '110px');
    const 予算の保存 = お金の部品('button', '予算を決める', 'btn btn-sm btn-secondary');
    予算の保存.type = 'submit';
    予算の形.append(予算の分類, 予算の額, 予算の保存);
    予算の形.addEventListener('submit', (e) => {
        e.preventDefault();
        const y = お金を読む();
        y.予算[予算の分類.value] = Number(予算の額.value) || 0;
        お金を書く(y);
        renderお金();
    });
    収支.append(予算の形);
    並び.append(収支);

    /* ---- 動きを足す・取り込む ---- */
    const 動き = お金の札('✏ お金の動き');
    const 動きの形 = document.createElement('form');
    動きの形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    const 日 = お金の入力('date', '', '140px');
    日.value = new Date().toISOString().slice(0, 10);
    const 向き = お金の選択(['支出', '収入', '振替'], '支出');
    const 分類 = お金の選択(支出の分類, 'その他');
    向き.addEventListener('change', () => {
        const 新 = お金の選択(向き.value === '収入' ? 収入の分類 : 支出の分類, 'その他');
        分類.replaceWith(新);
        動きの形.分類 = 新;
    });
    動きの形.分類 = 分類;
    const 金額 = お金の入力('number', '金額', '100px');
    const 口座 = お金の選択([{ 値: '', 名: '（口座を選ばない）' }].concat(x.口座.map((a) => ({ 値: a.id, 名: a.名 }))), '');
    const メモ = お金の入力('text', '何に使った・何で入った', '160px');
    const 残す = お金の部品('button', '残す', 'btn btn-sm btn-primary');
    残す.type = 'submit';
    動きの形.append(日, 向き, 分類, 金額, 口座, メモ, 残す);
    動きの形.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!(Number(金額.value) > 0)) { showNotification('金額を入れてください', 'error'); return; }
        const y = お金を読む();
        お金の動きを足す(y, { 日: 日.value, 向き: 向き.value, 分類: 動きの形.分類.value, 金額: Number(金額.value), 口座: 口座.value || null, 内容: メモ.value.trim() });
        お金を書く(y);
        renderお金();
    });
    動き.append(動きの形);

    const 取り込み = お金の部品('p', null, 'hint');
    const ファイル = document.createElement('input');
    ファイル.type = 'file';
    ファイル.accept = '.csv,text/csv';
    ファイル.addEventListener('change', async () => {
        const f = ファイル.files && ファイル.files[0];
        if (!f) return;
        const 生 = await f.arrayBuffer();
        // 日本の明細のCSVはShift_JISのことが多い。UTF-8で読めなければShift_JISで読み直す
        let 文字 = new TextDecoder('utf-8').decode(生);
        if (文字.includes('�')) {
            try { 文字 = new TextDecoder('shift_jis').decode(生); } catch { /* この端末が対応していなければ、UTF-8のまま */ }
        }
        const 行たち = 明細のCSVを読む(文字);
        const y = お金を読む();
        const 既に = new Set(y.動き.map((m) => `${m.日}|${m.内容}|${m.金額}|${m.向き}`));
        let 数 = 0;
        行たち.forEach((r) => {
            const 鍵 = `${r.日}|${r.内容}|${r.金額}|${r.向き}`;
            if (既に.has(鍵)) return;   // 同じ明細を二度取り込まない
            既に.add(鍵);
            y.動き.push(Object.assign({ id: お金の番号() }, r));
            数++;
        });
        お金を書く(y);
        showNotification(行たち.length ? `${数}件を取り込みました（重なり ${行たち.length - 数}件は飛ばしました）` : '見出しに「日付」「金額」がある明細のCSVを選んでください', 行たち.length ? 'success' : 'error');
        renderお金();
    });
    取り込み.append('明細のCSVを取り込む（マネーフォワード・銀行などから、ご自身で書き出したもの）: ', ファイル);
    動き.append(取り込み);

    const 直近 = x.動き.slice(-15).reverse();
    const 表 = お金の部品('ul');
    直近.forEach((m) => {
        const li = お金の部品('li', `${m.日} ${m.向き === '収入' ? '+' : m.向き === '支出' ? '−' : '⇄'}${お金の円(m.金額)} ${m.分類 || ''} ${m.内容 || ''}`);
        if (m.取り消し) { li.style.textDecoration = 'line-through'; li.style.opacity = '.6'; }
        else {
            const 消 = お金の部品('button', '取り消す', 'btn btn-sm btn-secondary');
            消.type = 'button';
            消.addEventListener('click', () => {
                const y = お金を読む();
                const t = y.動き.find((z) => z.id === m.id);
                if (!t) return;
                t.取り消し = new Date().toISOString();   // 消さずに印を付ける（合計からは外れる）
                お金を書く(y);
                renderお金();
            });
            li.append(' ', 消);
        }
        表.append(li);
    });
    動き.append(表);
    並び.append(動き);

    /* ---- 投資の練習と学び ---- */
    const 投資 = お金の札('📈 投資の練習（仮想・お金は動きません）');
    let 合計 = 0;
    x.練習.持ち.forEach((p) => {
        const r = 練習の損益(p);
        合計 += r.損益;
        const li = お金の部品('p', `${p.名}（${p.種類}）買い ${お金の円(r.買い)} → 今 ${お金の円(r.今)} ／ ${r.損益 >= 0 ? '+' : ''}${お金の円(r.損益)}（${r.率}%）`);
        const 値 = お金の部品('button', '今の値', 'btn btn-sm btn-secondary');
        値.type = 'button';
        値.addEventListener('click', () => {
            const v = prompt(`${p.名} のいまの値（1つあたり）`, String(p.今の値 ?? p.買値));
            if (v == null || !isFinite(Number(v))) return;
            const y = お金を読む();
            const t = y.練習.持ち.find((z) => z.id === p.id);
            if (t) { t.今の値 = Number(v); お金を書く(y); renderお金(); }
        });
        const 売る = お金の部品('button', '売ったことにする', 'btn btn-sm btn-secondary');
        売る.type = 'button';
        売る.addEventListener('click', () => {
            const 理由 = prompt('売った理由と、学んだこと（あとで見返します）', '') || '';
            const y = お金を読む();
            const i = y.練習.持ち.findIndex((z) => z.id === p.id);
            if (i < 0) return;
            const [t] = y.練習.持ち.splice(i, 1);
            y.練習.記録.push(Object.assign({}, t, 練習の損益(t), { 売った日: new Date().toISOString().slice(0, 10), 理由 }));
            お金を書く(y);
            renderお金();
        });
        li.append(' ', 値, ' ', 売る);
        投資.append(li);
    });
    if (x.練習.持ち.length) 投資.append(お金の部品('p', `いまの練習の損益: ${合計 >= 0 ? '+' : ''}${お金の円(合計)}`, 'hint'));
    const 記録 = x.練習.記録;
    if (記録.length) {
        const 勝ち = 記録.filter((r) => r.損益 > 0).length;
        投資.append(お金の部品('p', `練習の記録: ${記録.length}回（利益 ${勝ち}回・損 ${記録.length - 勝ち}回）。損した理由を見返すと、次の判断が良くなります。`, 'hint'));
    }
    const 練習の形 = document.createElement('form');
    練習の形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    const 銘柄 = お金の入力('text', '銘柄・通貨の名前', '140px');
    const 種類 = お金の選択(['株', '投資信託（NISA）', 'FX', '仮想通貨'], '株');
    const 買値 = お金の入力('number', '買った値（1つ）', '110px');
    const 数量 = お金の入力('number', '数量', '80px');
    const 理由 = お金の入力('text', '買った理由', '160px');
    const 買う = お金の部品('button', '仮想で買う', 'btn btn-sm btn-primary');
    買う.type = 'submit';
    練習の形.append(銘柄, 種類, 買値, 数量, 理由, 買う);
    練習の形.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!銘柄.value.trim() || !(Number(買値.value) > 0) || !(Number(数量.value) > 0)) return;
        const y = お金を読む();
        y.練習.持ち.push({ id: お金の番号(), 名: 銘柄.value.trim(), 種類: 種類.value, 買値: Number(買値.value), 数量: Number(数量.value), 理由: 理由.value.trim(), 買った日: new Date().toISOString().slice(0, 10) });
        お金を書く(y);
        renderお金();
    });
    投資.append(練習の形);

    // NISAの積立の見込み（年率は仮定）
    const 見込み = お金の部品('div');
    見込み.style.marginTop = '8px';
    const 月額 = お金の入力('number', '毎月', '90px');
    月額.value = '5000';
    const 年 = お金の入力('number', '年数', '70px');
    年.value = '20';
    const 結果 = お金の部品('p', '', 'hint');
    const 計算 = () => {
        const 行 = [1, 3, 5].map((r) => { const v = 積立の見込み(月額.value, r, 年.value); return `年${r}%なら ${お金の円(v.見込み)}`; });
        const 元 = 積立の見込み(月額.value, 0, 年.value).元本;
        結果.textContent = `積み立てた元本 ${お金の円(元)} → ${行.join(' ／ ')}（年率は仮定。値下がりして元本を下回ることもあります）`;
    };
    月額.addEventListener('input', 計算);
    年.addEventListener('input', 計算);
    見込み.append('NISAの積立の見込み: 毎月 ', 月額, ' 円を ', 年, ' 年', 結果);
    計算();
    投資.append(見込み);

    // 学びのメモ（FXなび・株たすなど、他のアプリで学んだことを、ここに書き写す）
    const 学び = お金の部品('div');
    学び.style.marginTop = '8px';
    const 学びの欄 = document.createElement('textarea');
    学びの欄.rows = 2;
    学びの欄.placeholder = '学んだこと（他のアプリ・本・ニュースから。アプリの中のデータは、ここからは読めないので書き写す）';
    学びの欄.style.width = '100%';
    const 学びを残す = お金の部品('button', '学びを残す', 'btn btn-sm btn-secondary');
    学びを残す.type = 'button';
    学びを残す.addEventListener('click', () => {
        if (!学びの欄.value.trim()) return;
        const y = お金を読む();
        y.学び.push({ 日: new Date().toISOString().slice(0, 10), 文: 学びの欄.value.trim() });
        お金を書く(y);
        renderお金();
    });
    学び.append(学びの欄, 学びを残す);
    x.学び.slice(-5).reverse().forEach((m) => 学び.append(お金の部品('p', `${m.日}: ${m.文}`, 'hint')));
    投資.append(学び);
    並び.append(投資);
}

window.renderお金 = renderお金;
window.お金をまとめる = お金をまとめる;
window.明細のCSVを読む = 明細のCSVを読む;
window.積立の見込み = 積立の見込み;

// 試験（tools/サーバーの試験.js）から、画面を描かずに計算の部分だけを require で読むための出口。
// ブラウザには module が無いので、ここは何もしない（試験で、文字をコードとして動かす書き方を使わないため）。
if (typeof module !== 'undefined' && module.exports) module.exports = { お金をまとめる, お金の動きを足す, 明細のCSVを読む, 積立の見込み, 練習の損益 };
