/**
 * 画面を見て操作する ― Geminiに実際の画面を見せながら、一手ずつ自動で進める
 *
 * なぜこれが要るのか:
 *
 *   これまでの「自動操作」（リモート作業.py）は、決まった名前の安全な
 *   操作（アプリを開く・音量を変える等）からしか選べなかった。
 *   理由ははっきりしている: 使っていたローカルLLM（Qwen2.5）は文字しか
 *   読めず、画面が見えない。見えないのに座標を当てさせるのは危ない。
 *
 *   Geminiは画面（画像）を読める。実際の画面を見せながら「次はここを
 *   押す・ここに入力する」を一手ずつ決めさせれば、座標の当てずっぽうに
 *   ならず、名前の付いた操作しか無かったこれまでより、できることが
 *   大きく広がる。
 *
 * 安全のための線引き（既存の「自動操作」「パソコンを操る」と同じ考え方
 * ＋ 送信・購入・公開など取り消せない行為の手前で必ず止まる、という
 * 一段強い線引きを追加）:
 *
 *   ・<b>取り消せない・重い行為の手前では、必ず人に確認する。</b>
 *     送信・購入・支払い・公開・削除・契約・同意等は、Geminiにも
 *     そう指示した上で、届いた答えの文面もこちら側でも見て確かめる
 *     （二重の見張り。AIが指示を忘れても、言葉で拾えるようにする）。
 *   ・<b>指図された座標をそのまま信じ切らない。</b>
 *     画像の中の割合（0〜1）で答えさせ、実際の画面の大きさに変換する。
 *   ・<b>止めるボタンは、いつでも一番上。</b>
 *   ・<b>同じ一手を連続2回選んだら、進んでいないとみなして止める。</b>
 *   ・<b>回数の上限を超えたら、そこで止める。</b>
 *   ・実行そのものは、既存の /api/remote/click・/api/remote/type を
 *     そのまま使う（合言葉の画面では動かさない・1分あたりの上限等、
 *     元からある安全装置は全部そのままかかる）。
 *
 * 使うには、Geminiキーの設定と「お金がかかる機能」での許可、
 * 遠隔操作の「動かす」が要る（すべて既存の仕組みをそのまま使う）。
 */

const 画面操作_危険な言葉 = [
    '送信', '購入', '支払', '決済', '公開', '削除', '退会', '解約',
    '契約', '同意する', '注文を確定', '予約を確定', '振込', '購読',
    'send', 'buy', 'purchase', 'pay', 'checkout', 'publish', 'delete',
    'subscribe', 'confirm order', 'place order', 'sign up', 'agree',
];

const 画面操作_上限 = 20;

let 画面操作_止めるか = false;
let 画面操作_進行中か = false;

function 画面操作ログに足す(文) {
    const box = document.getElementById('remote-auto-log');
    if (!box) return;
    const li = document.createElement('li');
    li.textContent = 文;
    box.appendChild(li);
    box.scrollTop = box.scrollHeight;
}

/** 使える状態か（無ければ理由を返す） */
async function 画面操作_使えるか確かめる() {
    if (typeof Geminiを使うか !== 'function' || !Geminiを使うか()) {
        return '「脳」をGeminiに切り替えてから使ってください（設定の近く・チャット画面の「脳」ボタン）。';
    }
    const key = await AReGLM_SECURITY.loadApiKeySecure('ai', 'gemini');
    if (!key) return 'Gemini APIキーが未設定です。設定（⚙）→ 外部AI（Gemini）から登録してください。';
    if (typeof 使ってよいか === 'function' && !使ってよいか('gemini')) {
        return '設定 → お金がかかる機能で、Geminiの使用を許可してください。';
    }
    const 様子 = await fetch('/api/computer', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (様子 && 様子.止まっているか) {
        return 'いまパソコン操作が止められています。「🛠 パソコン操作」タブの「動かす」を押してから使ってください。';
    }
    return null;
}

/**
 * Geminiに、いまの画面と目的から「次の一手」を一つだけ決めてもらう。
 */
async function 画面操作_次の一手を決める(目的, 画像dataUrl, これまで) {
    const key = await AReGLM_SECURITY.loadApiKeySecure('ai', 'gemini');

    let 履歴文 = '';
    if (これまで.length) {
        履歴文 = '【これまでの手順】\n' + これまで
            .slice(-8)
            .map((h, i) => `${i + 1}. ${h.操作}${h.詳細 ? '（' + h.詳細 + '）' : ''} → ${h.結果}`)
            .join('\n') + '\n\n';
    }

    const 指示 = 'あなたは「ARELM」というツールの中で、実際のパソコン画面を見ながら、'
        + '目的を達成するために一手ずつ操作を進めるエージェントです。\n'
        + '渡された画面の画像をよく見て、次に行う「たった一つの操作」だけを決めてください。\n'
        + '複数の手順を一度にまとめて答えないでください。\n\n'
        + `【目的】\n${目的}\n\n`
        + 履歴文
        + '必ず、次のJSON形式だけで答えてください。前置きや説明、コードの囲みは書かないでください。\n'
        + '・押す場所がある場合: {"操作":"クリック","x":0〜1の横の割合,"y":0〜1の縦の割合,"理由":"なぜここを押すか"}\n'
        + '　（xは画像の左端を0・右端を1、yは上端を0・下端を1とした割合。ピクセル数ではなく割合で答えること）\n'
        + '・文字を入力する場合: {"操作":"入力","文字":"入れる文字列","理由":"..."}\n'
        + '・スクロールする場合: {"操作":"スクロール","向き":"上"または"下","理由":"..."}\n'
        + '・改行を押す場合: {"操作":"キー","キー":"改行","理由":"..."}\n'
        + '・閉じる・戻る場合: {"操作":"キー","キー":"取り消し","理由":"..."}\n'
        + '・すでに目的を達成した場合: {"操作":"終わり","訳":"何ができたか"}\n'
        + '・これ以上は進められない場合: {"操作":"行き詰まった","訳":"なぜ進められないか"}\n'
        + '・次の一手が、送信・購入・支払い・公開・削除・契約・同意・登録の確定など、'
        + '取り消せない、または重い行為にあたる場合は、絶対に自分で選ばず、必ず'
        + '{"操作":"承認が要る","内容":"何をしようとしているか","理由":"..."} と答えてください。\n'
        + '・"操作"の値は、上に挙げた言葉のどれかそのままにしてください。他の値は作らないでください。';

    const base64 = (画像dataUrl.split(',')[1] || '');
    const data = await AReGLM_API_CLIENT.gemini(key, {
        contents: [{
            role: 'user',
            parts: [
                { text: 指示 },
                { inline_data: { mime_type: 'image/png', data: base64 } },
            ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
    });

    const 文 = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    const 始 = 文.indexOf('{');
    const 終 = 文.lastIndexOf('}');
    if (始 < 0 || 終 < 0 || 終 <= 始) return null;
    try {
        return JSON.parse(文.slice(始, 終 + 1));
    } catch {
        return null;
    }
}

/** 決めた内容の文面に、危険な言葉が含まれていないか（AIが見落としても拾う二重の見張り） */
function 画面操作_危険そうか(決めた) {
    const 文 = [決めた['理由'], 決めた['内容'], 決めた['文字']].filter(Boolean).join(' ').toLowerCase();
    return 画面操作_危険な言葉.some((w) => 文.includes(w.toLowerCase()));
}

/** 決めた一手を、実際に画面へ反映する（既存のクリック・文字入力APIをそのまま使う） */
async function 画面操作_実行する(決めた, 元の幅, 元の高さ) {
    switch (決めた['操作']) {
        case 'クリック': {
            const x = Math.round(Math.max(0, Math.min(1, Number(決めた['x']) || 0)) * (元の幅 || 0));
            const y = Math.round(Math.max(0, Math.min(1, Number(決めた['y']) || 0)) * (元の高さ || 0));
            const r = await fetch('/api/remote/click', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ よこ: x, たて: y }),
            }).then((r2) => r2.json());
            return { ok: r.ok, 訳: r.訳 || (r.ok ? '押しました' : ''), 詳細: `(${x}, ${y})` };
        }
        case '入力': {
            const r = await fetch('/api/remote/type', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 文: String(決めた['文字'] || '') }),
            }).then((r2) => r2.json());
            return { ok: r.ok, 訳: r.訳 || (r.ok ? '入力しました' : ''), 詳細: String(決めた['文字'] || '').slice(0, 30) };
        }
        case 'スクロール': {
            const 向き = 決めた['向き'] === '上' ? '上' : '下';
            const r = await fetch('/api/remote/type', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ スクロール: 向き }),
            }).then((r2) => r2.json());
            return { ok: r.ok, 訳: r.訳 || (r.ok ? 'スクロールしました' : ''), 詳細: 向き };
        }
        case 'キー': {
            const body = 決めた['キー'] === '取り消し' ? { 取り消し: true } : { 文: '改行' };
            const r = await fetch('/api/remote/type', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }).then((r2) => r2.json());
            return { ok: r.ok, 訳: r.訳 || (r.ok ? '押しました' : ''), 詳細: 決めた['キー'] || '' };
        }
        default:
            return { ok: false, 訳: `分からない操作です: ${決めた['操作']}` };
    }
}

async function 画面を見て自動作業を始める(目的) {
    if (画面操作_進行中か) return;

    const 使えない理由 = await 画面操作_使えるか確かめる();
    if (使えない理由) {
        showNotification(使えない理由, 'warn');
        return;
    }

    画面操作_止めるか = false;
    画面操作_進行中か = true;

    // ログ・確認欄・止めるボタンは、名前の付いた安全な操作だけの
    // 自動操作（遠隔とタスク.js）と共有している。「見て操作」か
    // 「名前で操作」かを人が選ばずに済むよう、入口を一つにまとめたため。
    const ログ = document.getElementById('remote-auto-log');
    if (ログ) ログ.innerHTML = '';
    const 承認欄 = document.getElementById('remote-auto-approve');
    if (承認欄) { 承認欄.hidden = true; 承認欄.innerHTML = ''; }

    const 始めるボタン = document.querySelector('#remote-auto-form button[type="submit"]');
    const 止めるボタン = document.getElementById('remote-auto-stop');
    if (始めるボタン) 始めるボタン.disabled = true;
    if (止めるボタン) 止めるボタン.hidden = false;

    画面操作ログに足す(`目的: ${目的}`);

    const これまで = [];
    let 直前の操作キー = '';
    let 同じ一手が続いた回数 = 0;

    for (let i = 0; i < 画面操作_上限; i++) {
        if (画面操作_止めるか) { 画面操作ログに足す('（止めました）'); break; }

        const 画面 = await fetch('/api/remote/screen', { cache: 'no-store' }).then((r) => r.json()).catch((e) => ({ ok: false, 訳: e.message }));
        if (!画面.ok) { 画面操作ログに足す(`画面を撮れませんでした: ${画面.訳 || ''}`); break; }

        let 決めた;
        try {
            決めた = await 画面操作_次の一手を決める(目的, 画面.絵, これまで);
        } catch (e) {
            画面操作ログに足す(`Geminiから答えが得られませんでした: ${e.message}`);
            break;
        }
        if (!決めた || typeof 決めた['操作'] !== 'string') {
            画面操作ログに足す('決められませんでした（答えの形が読めませんでした）');
            break;
        }

        if (決めた['操作'] === '終わり') {
            画面操作ログに足す(`✅ 終わりました: ${決めた['訳'] || ''}`);
            break;
        }
        if (決めた['操作'] === '行き詰まった') {
            画面操作ログに足す(`⚠️ ここで止めます: ${決めた['訳'] || ''}`);
            break;
        }
        if (決めた['操作'] === '承認が要る' || 画面操作_危険そうか(決めた)) {
            画面操作ログに足す(`🔔 確認が要ります: ${決めた['内容'] || 決めた['理由'] || ''}`);
            if (承認欄) {
                承認欄.hidden = false;
                承認欄.innerHTML = '';
                const p = document.createElement('p');
                p.textContent = `このまま進めると: ${決めた['内容'] || 決めた['理由'] || '内容不明の操作'}`;
                承認欄.appendChild(p);
                const 案内 = document.createElement('p');
                案内.className = 'hint';
                案内.textContent = '送信・購入・公開・削除など、取り消しにくい操作の手前なので、'
                    + 'ここでは自動では進めません。続きは下の「手動で細かく操作したいとき」から、'
                    + 'ご自身の目と手で確かめて行ってください。';
                承認欄.appendChild(案内);
            }
            break;
        }

        const 結果 = await 画面操作_実行する(決めた, 画面.元の幅, 画面.元の高さ);
        これまで.push({ 操作: 決めた['操作'], 詳細: 結果.詳細, 結果: 結果.訳 });
        画面操作ログに足す(`${i + 1}. ${決めた['操作']}${結果.詳細 ? '（' + 結果.詳細 + '）' : ''} → ${結果.訳}`);

        const 今回のキー = 決めた['操作'] + JSON.stringify(結果.詳細 || '');
        同じ一手が続いた回数 = 今回のキー === 直前の操作キー ? 同じ一手が続いた回数 + 1 : 1;
        直前の操作キー = 今回のキー;
        if (同じ一手が続いた回数 >= 2) {
            画面操作ログに足す('同じ一手が続けて選ばれたため、進んでいないとみなして止めます。');
            break;
        }

        if (i === 画面操作_上限 - 1) {
            画面操作ログに足す(`回数の上限（${画面操作_上限}）に達したため、いったん止めます。`);
        }
        await new Promise((r) => setTimeout(r, 500));
    }

    if (始めるボタン) 始めるボタン.disabled = false;
    if (止めるボタン) 止めるボタン.hidden = true;
    画面操作_進行中か = false;
}

// 「お願いする」の入口・止めるボタンは、遠隔とタスク.js の
// remote-auto-form / remote-auto-stop を共有する（一つにまとめたため）。
// そちらの 統合で自動作業を始める() が、使える状況なら
// 画面を見て自動作業を始める() をそのまま呼ぶ。
window.画面を見て自動作業を始める = 画面を見て自動作業を始める;
window.画面操作_使えるか確かめる = 画面操作_使えるか確かめる;
window.画面操作_止めさせる = () => { 画面操作_止めるか = true; };
