/**
 * ジャービス機能 — 映画のJ.A.R.V.I.S.と、ザッカーバーグ氏の自宅AI「Jarvis」の機能を
 * ARELMで実現できる形に置き換えたもの
 *
 *   ・家電の操作 … SwitchBot 公式API（照明・エアコン・テレビ・カーテン・鍵）。
 *                  声や文字の「電気つけて」「エアコン26度で冷房」でも動く。
 *                  鍵を開けるのは、毎回画面で確かめてから
 *   ・見守り     … カメラの動きとマイクの音の大きさだけを見て、変化があれば知らせる。
 *                  映像も音も保存せず、外へも送らない。誰かを見分ける（顔認識）ことはしない
 *   ・システム診断 … 電池・通信・メモリ・保存容量・サーバーと自作AIの応答をまとめて見る
 *   ・機能一覧   … JARVISの機能ごとに、ARELMのどこで実現しているか／できないかを示す
 */

const 家電_機器キー = 'areglm_switchbot_devices';
const 見守り_記録キー = 'areglm_watch_log';
const 見守り_設定キー = 'areglm_watch_settings';

/* ======================== 家電（SwitchBot） ======================== */

async function 家電の鍵を読む() {
    const token = await AReGLM_SECURITY.loadApiKeySecure('switchbot', 'token');
    const secret = await AReGLM_SECURITY.loadApiKeySecure('switchbot', 'secret');
    return token && secret ? { token, secret } : null;
}

function 家電の一覧() {
    try {
        const r = JSON.parse(localStorage.getItem(家電_機器キー) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

async function 家電の鍵を保存する() {
    const t = document.getElementById('switchbot-token')?.value.trim();
    const s = document.getElementById('switchbot-secret')?.value.trim();
    if (!t || !s) {
        showNotification('トークンとシークレットの両方を入れてください', 'error');
        return;
    }
    await AReGLM_SECURITY.saveApiKeySecure('switchbot', 'token', t);
    await AReGLM_SECURITY.saveApiKeySecure('switchbot', 'secret', s);
    document.getElementById('switchbot-token').value = '';
    document.getElementById('switchbot-secret').value = '';
    showNotification('SwitchBotの鍵を暗号化して保存しました', 'success');
    await 家電を読み込む();
}

async function 家電を読み込む() {
    const 鍵 = await 家電の鍵を読む();
    const 状態 = document.getElementById('switchbot-status');
    if (!鍵) {
        if (状態) 状態.textContent = 'まだ繋いでいません（設定 → 家電）';
        家電を描く();
        return;
    }
    if (状態) 状態.textContent = '機器を読み込んでいます…';
    try {
        const r = await fetch('/api/switchbot/devices', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(鍵),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.訳 || '読み込めませんでした');
        localStorage.setItem(家電_機器キー, JSON.stringify(d.機器));
        if (状態) 状態.textContent = `${d.機器.length}台の機器を読み込みました`;
    } catch (e) {
        if (状態) 状態.textContent = `読み込めませんでした: ${e.message}`;
    }
    家電を描く();
}

/** 機器の種類から、出すボタンを決める */
function 家電のボタン(機器) {
    const 種 = String(機器.種類 || '');
    if (/Lock/i.test(種)) return [['施錠', 'lock'], ['解錠', 'unlock']];
    if (/Curtain|Blind|Roller/i.test(種)) return [['開ける', 'turnOn'], ['閉める', 'turnOff']];
    if (/Bot/i.test(種) && !機器.赤外線) return [['押す', 'press']];
    if (/Air Conditioner/i.test(種)) return [['冷房26℃', 'setAll', '26,2,1,on'], ['暖房22℃', 'setAll', '22,5,1,on'], ['止める', 'turnOff']];
    if (/TV|IPTV|Set Top Box|Speaker/i.test(種)) return [['つける', 'turnOn'], ['消す', 'turnOff'], ['音＋', 'volumeAdd'], ['音−', 'volumeSub'], ['ch＋', 'channelAdd'], ['ch−', 'channelSub']];
    if (/Hub|Meter|Sensor|Contact|Motion|Remote/i.test(種) && !機器.赤外線) return [];
    return [['つける', 'turnOn'], ['消す', 'turnOff']];
}

async function 家電を動かす(id, command, parameter) {
    const 機器 = 家電の一覧().find((x) => x.id === id);
    const 鍵 = await 家電の鍵を読む();
    if (!鍵) {
        showNotification('SwitchBotが未設定です（設定 → 家電）', 'warn');
        return { ok: false, 訳: 'SwitchBotが未設定です' };
    }
    let confirmed = false;
    if (command === 'unlock') {
        confirmed = window.confirm(`「${機器?.名 || '鍵'}」を開けます。よろしいですか？`);
        if (!confirmed) return { ok: false, 訳: '鍵は開けませんでした' };
    }
    try {
        const r = await fetch('/api/switchbot/command', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...鍵, deviceId: id, command, parameter, confirmed }),
        });
        const d = await r.json();
        if (window.logActivity) logActivity('家電を操作', { category: 'home', text: `${機器?.名 || id} ${command}` });
        showNotification(d.ok ? `${機器?.名 || '機器'}: 送りました` : d.訳, d.ok ? 'success' : 'error');
        return d;
    } catch (e) {
        showNotification(`送れませんでした: ${e.message}`, 'error');
        return { ok: false, 訳: e.message };
    }
}

function 家電を描く() {
    const 箱 = document.getElementById('switchbot-devices');
    if (!箱) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    const 一覧 = 家電の一覧().map((x) => ({ ...x, ボタン: 家電のボタン(x) })).filter((x) => x.ボタン.length);
    箱.innerHTML = 一覧.length
        ? 一覧.map((x) => `<div class="home-device"><b>${s(x.名)}</b><small>${s(x.種類)}</small><div class="home-device-btns">
            ${x.ボタン.map(([名, c, p]) => `<button type="button" class="btn btn-sm ${c === 'unlock' ? 'btn-danger' : 'btn-secondary'}"
                data-dev="${s(x.id)}" data-cmd="${s(c)}" data-param="${s(p || '')}">${s(名)}</button>`).join('')}
        </div></div>`).join('')
        : '<p class="hint">操作できる機器はまだありません。設定 →「家電（SwitchBot）」でトークンを入れると、ここに並びます。</p>';
    箱.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => 家電を動かす(b.dataset.dev, b.dataset.cmd, b.dataset.param || undefined)));
}

const 家電の言い方 = [
    { 語: /(電気|照明|ライト|あかり|明かり)(?!代|料)/, 種: /Light|Bulb|Strip|Plug|Ceiling/i },
    { 語: /(エアコン|冷房|暖房|クーラー)/, 種: /Air Conditioner/i },
    { 語: /(テレビ|TV)/i, 種: /TV|IPTV|Set Top Box/i },
    { 語: /(カーテン|ブラインド)/, 種: /Curtain|Blind|Roller/i },
    { 語: /(鍵|カギ|ロック|玄関)/, 種: /Lock/i },
    { 語: /(加湿器)/, 種: /Humidifier/i },
    { 語: /(扇風機)/, 種: /Fan/i },
];

/** 文から家電の操作を読み取る。家電の話でなければ null */
function 家電の指示を読む(文) {
    if (文.length > 40) return null;
    const 言い方 = 家電の言い方.find((x) => x.語.test(文));
    if (!言い方) return null;
    const 一覧 = 家電の一覧();
    const 名で = 一覧.find((x) => x.名 && 文.includes(x.名));
    const 機器 = 名で || 一覧.find((x) => 言い方.種.test(x.種類 || ''));

    const 度 = 文.match(/(\d{2})\s*(度|℃)/);
    const 錠 = /Lock/i.test(String(言い方.種));
    let command = null;
    let parameter;
    if (錠 && /(開け|解錠|あけ)/.test(文)) command = 'unlock';
    else if (錠 && /(閉め|施錠|しめ|かけ)/.test(文)) command = 'lock';
    else if (/(冷房|暖房|除湿|送風|\d{2}\s*(度|℃))/.test(文) && /Air Conditioner/i.test(String(言い方.種))) {
        const 型 = /暖房/.test(文) ? 5 : /除湿/.test(文) ? 3 : /送風/.test(文) ? 4 : 2;
        const 温度 = 度 ? Math.min(30, Math.max(16, Number(度[1]))) : (型 === 5 ? 22 : 26);
        command = 'setAll';
        parameter = `${温度},${型},1,on`;
    } else if (/(音量|音).*(上げ|大き)/.test(文)) command = 'volumeAdd';
    else if (/(音量|音).*(下げ|小さ)/.test(文)) command = 'volumeSub';
    else if (/(消し|けし|切っ|きっ|オフ|止め|とめ|閉め|しめ)/i.test(文)) command = 'turnOff';
    else if (/(つけ|点け|付け|オン)/i.test(文)) command = 'turnOn';
    else if (/Curtain/i.test(String(言い方.種)) && /(開け|あけ)/.test(文)) command = 'turnOn';
    if (!command) return null;
    return { 機器, command, parameter };
}

/** 会話の入口から呼ばれる。家電の話なら操作して返事を返す。違えば null */
async function 家電の指示を拾う(文) {
    const 読み = 家電の指示を読む(String(文 || ''));
    if (!読み) return null;
    if (!(await 家電の鍵を読む())) {
        return '家電はまだ繋いでいません。設定 →「家電（SwitchBot）」でトークンとシークレットを入れると、声や文字で操作できます。';
    }
    if (!読み.機器) return '当てはまる機器が見つかりませんでした。設定 →「家電」で機器を読み込み直してください。';
    const r = await 家電を動かす(読み.機器.id, 読み.command, 読み.parameter);
    return r.ok ? `${読み.機器.名}に「${読み.command}${読み.parameter ? `（${読み.parameter}）` : ''}」を送りました。` : (r.訳 || '送れませんでした。');
}

/* ======================== 見守り ======================== */

const 見守り = { 映像: null, 音: null, 札: null, 前: null, 静か: 0, 最後: {}, 文脈: null };

function 見守りの設定() {
    try {
        return Object.assign({ 動きの感度: 12, 音の感度: 0.12, 隠す: false }, JSON.parse(localStorage.getItem(見守り_設定キー) || '{}'));
    } catch {
        return { 動きの感度: 12, 音の感度: 0.12, 隠す: false };
    }
}

function 見守りで知らせる(種類, 強さ) {
    const 今 = Date.now();
    if (今 - (見守り.最後[種類] || 0) < 30000) return;
    見守り.最後[種類] = 今;
    let 記録 = [];
    try { 記録 = JSON.parse(localStorage.getItem(見守り_記録キー) || '[]'); } catch { 記録 = []; }
    記録.push({ とき: new Date().toISOString(), 種類, 強さ: Math.round(強さ * 100) / 100 });
    localStorage.setItem(見守り_記録キー, JSON.stringify(記録.slice(-200)));
    const 文 = 種類 === '動き' ? 'カメラの前で動きがありました' : '大きな音が続きました（泣き声・物音など）';
    showNotification(`見守り: ${文}`, 'warn');
    if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('ARELM — 見守り', { body: 文 }); } catch { /* 通知が出せない環境では画面内だけ */ }
    }
    if (種類 === '動き' && 見守りの設定().隠す && typeof 目隠しをかける === 'function') {
        目隠しをかける('カメラの前で動きがあったので隠しました。');
    }
    見守りを描く();
}

function 動きを調べる() {
    const v = 見守り.映像;
    if (!v || v.readyState < 2) return;
    const c = 見守り.画 || (見守り.画 = Object.assign(document.createElement('canvas'), { width: 80, height: 60 }));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0, 80, 60);
    const 画素 = g.getImageData(0, 0, 80, 60).data;
    const 明るさ = new Uint8Array(80 * 60);
    for (let i = 0; i < 明るさ.length; i++) 明るさ[i] = (画素[i * 4] * 3 + 画素[i * 4 + 1] * 6 + 画素[i * 4 + 2]) / 10;
    if (見守り.前) {
        let 変わった = 0;
        for (let i = 0; i < 明るさ.length; i++) if (Math.abs(明るさ[i] - 見守り.前[i]) > 25) 変わった++;
        const 割合 = (変わった / 明るさ.length) * 100;
        if (割合 > 見守りの設定().動きの感度) 見守りで知らせる('動き', 割合);
    }
    見守り.前 = 明るさ;
}

function 音を調べる() {
    const a = 見守り.音;
    if (!a) return;
    const 波 = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(波);
    let 和 = 0;
    for (const x of 波) 和 += x * x;
    const 大きさ = Math.sqrt(和 / 波.length);
    見守り.静か = 大きさ > 見守りの設定().音の感度 ? 見守り.静か + 1 : 0;
    if (見守り.静か >= 3) {
        見守り.静か = 0;
        見守りで知らせる('音', 大きさ);
    }
}

async function 見守りを始める() {
    if (見守り.札) return true;
    try {
        const 流れ = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: true });
        見守り.流れ = 流れ;
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.srcObject = 流れ;
        await v.play();
        見守り.映像 = v;
        const 文脈 = new AudioContext();
        const 解析 = 文脈.createAnalyser();
        解析.fftSize = 2048;
        文脈.createMediaStreamSource(流れ).connect(解析);
        見守り.文脈 = 文脈;
        見守り.音 = 解析;
        見守り.札 = setInterval(() => { 動きを調べる(); 音を調べる(); }, 500);
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        showNotification('見守りを始めました（映像も音も保存しません）', 'success');
        見守りを描く();
        return true;
    } catch (e) {
        showNotification(`カメラかマイクを使えませんでした: ${e.message}`, 'error');
        return false;
    }
}

function 見守りを止める() {
    clearInterval(見守り.札);
    見守り.流れ?.getTracks().forEach((t) => t.stop());
    見守り.文脈?.close();
    Object.assign(見守り, { 映像: null, 音: null, 札: null, 前: null, 流れ: null, 文脈: null, 静か: 0 });
    showNotification('見守りを止めました', 'info');
    見守りを描く();
}

function 見守りを描く() {
    const 状態 = document.getElementById('watch-status');
    const ボタン = document.getElementById('watch-toggle-btn');
    if (状態) 状態.textContent = 見守り.札 ? '見守り中（カメラとマイクが入っています）' : '止まっています';
    if (ボタン) ボタン.textContent = 見守り.札 ? '見守りを止める' : '見守りを始める';
    const 箱 = document.getElementById('watch-log');
    if (!箱) return;
    let 記録 = [];
    try { 記録 = JSON.parse(localStorage.getItem(見守り_記録キー) || '[]'); } catch { 記録 = []; }
    箱.innerHTML = 記録.length
        ? 記録.slice(-8).reverse().map((x) => `<li>${AReGLM_SECURITY.sanitizeHtml(new Date(x.とき).toLocaleString('ja-JP'))} — ${x.種類 === '動き' ? '動き' : '大きな音'}</li>`).join('')
        : '<li class="hint">まだ知らせたことはありません</li>';
}

/* ======================== システム診断 ======================== */

async function システムを診断する() {
    const 結果 = [];
    const 足す = (名, 良い, 訳) => 結果.push({ 名, 良い, 訳 });

    try {
        if (navigator.getBattery) {
            const b = await navigator.getBattery();
            const 割 = Math.round(b.level * 100);
            足す('電池', b.charging || 割 > 20, `${割}%${b.charging ? '（充電中）' : ''}`);
        }
    } catch { /* 電池の情報が無い端末（デスクトップPC等）では出さない */ }
    足す('通信', navigator.onLine, navigator.onLine ? 'つながっています' : 'オフラインです');
    if (navigator.deviceMemory) 足す('メモリ', navigator.deviceMemory >= 4, `約${navigator.deviceMemory}GB`);
    if (navigator.hardwareConcurrency) 足す('処理の並列数', true, `${navigator.hardwareConcurrency}`);
    try {
        const e = await navigator.storage?.estimate?.();
        if (e?.quota) {
            const 使用 = Math.round((e.usage / e.quota) * 1000) / 10;
            足す('保存容量', 使用 < 80, `${使用}% 使用`);
        }
    } catch { /* 取れなければ出さない */ }
    const 測る = async (名, url) => {
        const 始 = performance.now();
        try {
            const r = await fetch(url, { cache: 'no-store' });
            const ms = Math.round(performance.now() - 始);
            足す(名, r.ok, r.ok ? `応答あり（${ms}ms）` : `応答が異常（${r.status}）`);
        } catch {
            足す(名, false, '応答なし');
        }
    };
    await 測る('サーバー', '/api/health');
    await 測る('自作AI', '/api/ai-local/health');
    足す('見守り', true, 見守り.札 ? '動いています' : '止まっています');
    足す('家電', true, (await 家電の鍵を読む()) ? `${家電の一覧().length}台` : '未設定');
    return 結果;
}

async function 診断を描く() {
    const 箱 = document.getElementById('system-diagnosis');
    if (!箱) return [];
    箱.innerHTML = '<li class="hint">調べています…</li>';
    const 結果 = await システムを診断する();
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    箱.innerHTML = 結果.map((r) => `<li class="${r.良い ? 'ok' : 'ng'}"><b>${r.良い ? '✓' : '！'} ${s(r.名)}</b> ${s(r.訳)}</li>`).join('');
    return 結果;
}

/** 会話の入口から呼ばれる。診断・見守りの指示なら処理して返事を返す。違えば null */
async function ジャービスの指示を拾う(文) {
    const t = String(文 || '');
    if (/(システム|端末|全体).*(診断|状態|調子|チェック)|^診断/.test(t)) {
        const 結果 = await システムを診断する();
        const 悪い = 結果.filter((r) => !r.良い);
        return 悪い.length
            ? `気になる点が${悪い.length}つあります。${悪い.map((r) => `${r.名}: ${r.訳}`).join('、')}。`
            : `すべて正常です。${結果.map((r) => `${r.名} ${r.訳}`).join('、')}。`;
    }
    if (/見守り/.test(t) && /(止め|やめ|終わ|オフ)/.test(t)) {
        見守りを止める();
        return '見守りを止めました。';
    }
    if (/見守り/.test(t) && /(始め|はじめ|開始|して|オン|つけ)/.test(t)) {
        return (await 見守りを始める())
            ? '見守りを始めました。動きや大きな音があれば知らせます。映像も音も保存しません。'
            : 'カメラかマイクを使えなかったので、見守りを始められませんでした。';
    }
    return 家電の指示を拾う(t);
}

/* ======================== JARVISの機能一覧 ======================== */

const ジャービス機能一覧 = [
    { 元: '映画', 機能: '自然な会話（意図・冗談を汲む）', 状態: 'できる', 場所: 'エージェント・AIチャット（自作AI）' },
    { 元: '映画', 機能: 'データ分析・シミュレーション', 状態: 'できる', 場所: '分析・統計・数値計画・お金の帳面' },
    { 元: '映画', 機能: 'アーマーのダメージ診断・エネルギー管理', 状態: '置き換え', 場所: 'このページの「システム診断」（電池・通信・容量・サーバー・自作AI）' },
    { 元: '映画', 機能: 'アイアン・レギオン（大量の機体の統括）', 状態: '置き換え', 場所: 'エージェントの裏作業（複数の作業を並行して進め、状況を一か所で見る）' },
    { 元: '映画', 機能: '邸宅のセキュリティ・自動化', 状態: 'できる', 場所: '守り（端末の確認・目隠し）、見守り、家電の操作' },
    { 元: '映画', 機能: 'パワードスーツの飛行・武器の制御', 状態: 'やらない', 場所: '機体が無く、武器の制御はARELMの決まりに反するため' },
    { 元: '現実版', 機能: '照明・エアコン・テレビ・音楽を声や文字で操作', 状態: 'できる', 場所: '家電（SwitchBot公式API）。「電気つけて」「エアコン26度で冷房」' },
    { 元: '現実版', 機能: '来客の顔を見分けて門を開ける', 状態: '一部', 場所: '動きの検知と通知まで。顔で人を見分けることはしない。鍵は毎回画面で確かめて開ける' },
    { 元: '現実版', 機能: '子ども部屋の異変・泣き声の通知', 状態: 'できる', 場所: '見守り（動きと音の大きさ。映像・音は保存しない）' },
    { 元: '現実版', 機能: 'スマホや家の各所の端末から声・文字で命令', 状態: 'できる', 場所: '他の端末から開く・声で指示する（同じWi-Fi／Tailscale）' },
];

function ジャービス機能一覧を描く() {
    const 箱 = document.getElementById('jarvis-feature-map');
    if (!箱) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    箱.innerHTML = ジャービス機能一覧.map((x) => `<tr>
        <td>${s(x.元)}</td><td>${s(x.機能)}</td>
        <td><span class="jarvis-state jarvis-state-${{ できる: 'ok', 置き換え: 'alt', 一部: 'part', やらない: 'no' }[x.状態]}">${s(x.状態)}</span></td>
        <td>${s(x.場所)}</td></tr>`).join('');
}

function initジャービス機能() {
    document.getElementById('switchbot-save-btn')?.addEventListener('click', 家電の鍵を保存する);
    document.getElementById('switchbot-reload-btn')?.addEventListener('click', 家電を読み込む);
    document.getElementById('watch-toggle-btn')?.addEventListener('click', () => (見守り.札 ? 見守りを止める() : 見守りを始める()));
    document.getElementById('system-diagnosis-btn')?.addEventListener('click', 診断を描く);
    const 隠す = document.getElementById('watch-hide');
    if (隠す) {
        隠す.checked = 見守りの設定().隠す;
        隠す.addEventListener('change', () => {
            localStorage.setItem(見守り_設定キー, JSON.stringify({ ...見守りの設定(), 隠す: 隠す.checked }));
        });
    }
    家電の鍵を読む().then((鍵) => {
        const 状態 = document.getElementById('switchbot-status');
        if (状態) 状態.textContent = 鍵 ? `繋いであります（${家電の一覧().length}台）` : 'まだ繋いでいません';
    });
    家電を描く();
    見守りを描く();
    ジャービス機能一覧を描く();
}

window.initジャービス機能 = initジャービス機能;
window.ジャービスの指示を拾う = ジャービスの指示を拾う;
window.家電の指示を読む = 家電の指示を読む;
window.システムを診断する = システムを診断する;
window.見守りを始める = 見守りを始める;
window.見守りを止める = 見守りを止める;
