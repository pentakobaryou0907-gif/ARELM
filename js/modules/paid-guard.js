/**
 * お金がかかることの見張り
 *
 * なぜこれが要るのか:
 *   「お金がかかることは絶対に報告して、指示が来るまで止める」
 *   というのが、このツールの決まりごと。
 *
 *   ところが外部AIや外部サービスの入口は、
 *   押せば使えてしまう状態のままだった。
 *   うっかり押して課金される、ということが起こりうる。
 *
 * ここでやること:
 *   お金がかかりうる機能を、既定で使えないようにする。
 *   使いたいときは、その場で許可を出せる。
 *
 * 大事にしていること:
 *   ・既定は「使わない」。何も設定しなくても安全でいられるようにする
 *   ・完全に消しはしない。使いたい日が来るかもしれないため
 *   ・許可は一つずつ。まとめて全部開くことはしない
 *   ・いつ許可したかを残す。あとから見返せるようにする
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const AREGLM_PAID_KEY = 'areglm_paid_allow';
const AREGLM_PAID_LOG_KEY = 'areglm_paid_log';

/**
 * お金がかかりうる機能。
 *
 * ここに載せるのは、実際に課金されうるものだけにする。
 * 無料のものまで止めると、使えるはずのものが使えなくなる。
 */
const 有料になりうる機能 = [
    {
        id: 'claude',
        名: 'Claude（Anthropic のAI）',
        訳: '無料枠が無く、使った分だけ課金されます。会話の内容がAnthropicへ送られます。賢い会話・分析・文章づくりに使えます。',
        代わり: '自作AI（この端末の中だけ・無料）でも会話と文章づくりはできます',
    },
    {
        id: 'gemini',
        名: 'Gemini（Google のAI）',
        訳: '無料の枠を超えると課金されます。文章と画像の生成に使えます。',
        代わり: '自作AIで文章と図案を作れます（無料・無制限）',
    },
    {
        id: 'groq',
        名: 'Groq（外部のAI）',
        訳: '無料の枠を超えると課金されます。',
        代わり: '自作AIで文章を作れます（無料・無制限）',
    },
    {
        id: 'huggingface',
        名: 'Hugging Face（画像生成）',
        訳: '無料の枠を超えると課金されます。写真のような画像が作れます。',
        代わり: '自作で図案を作れます。ただし写真のような画像は作れません',
    },
    {
        id: 'shopify',
        名: 'Shopify（ECサイト）',
        訳: '月額の利用料がかかります。',
        代わり: 'いまは SUZURI のみで販売しています',
    },
];

function 許可を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_PAID_KEY) || '{}');
        return (r && typeof r === 'object') ? r : {};
    } catch {
        return {};
    }
}

function 許可を保存(中身) {
    localStorage.setItem(AREGLM_PAID_KEY, JSON.stringify(中身));
}

/** その機能を使ってよいか。既定は「だめ」。 */
function 使ってよいか(id) {
    return 許可を読む()[id] === true;
}

/** 許可を切り替える */
function 許可を切り替える(id, 許す) {
    const 全 = 許可を読む();
    if (許す) 全[id] = true;
    else delete 全[id];
    許可を保存(全);

    // いつ、何を許したかを残す。あとから見返せるようにするため。
    const 記録 = 記録を読む();
    記録.push({
        とき: new Date().toISOString(),
        機能: id,
        した事: 許す ? '許可した' : '止めた',
    });
    localStorage.setItem(AREGLM_PAID_LOG_KEY, JSON.stringify(記録.slice(-100)));

    renderPaidGuard();

    const 名 = (有料になりうる機能.find((x) => x.id === id) || {}).名 || id;
    if (typeof showNotification === 'function') {
        showNotification(
            許す ? `${名} を使えるようにしました（お金がかかる場合があります）` : `${名} を止めました`,
            許す ? 'warn' : 'success'
        );
    }
}

function 記録を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_PAID_LOG_KEY) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

/**
 * 使う直前に確かめる。
 *
 * 許していなければ、その場で理由を伝えて止める。
 * 黙って止めると「壊れている」と思われるため、必ず伝える。
 *
 * @returns {boolean} 使ってよければ true
 */
function 使う前に確かめる(id) {
    if (使ってよいか(id)) return true;

    const 機能 = 有料になりうる機能.find((x) => x.id === id);
    const 名 = 機能 ? 機能.名 : id;
    const 代 = 機能 ? 機能.代わり : '';

    if (typeof showNotification === 'function') {
        showNotification(
            `${名} は止めてあります（お金がかかるため）。`
            + (代 ? ` ${代}。` : '')
            + ' 使う場合は 設定 → お金がかかる機能 から許可してください。',
            'warn'
        );
    }
    return false;
}

function renderPaidGuard() {
    const 箱 = document.getElementById('paid-list');
    if (!箱) return;

    const 許 = 許可を読む();
    箱.innerHTML = '';

    有料になりうる機能.forEach((f) => {
        const li = document.createElement('li');
        const 許した = 許[f.id] === true;
        li.className = 'paid-item' + (許した ? ' allowed' : '');

        const 本体 = document.createElement('div');
        本体.className = 'paid-body';

        const 名 = document.createElement('b');
        名.textContent = f.名;

        const 訳 = document.createElement('small');
        訳.textContent = f.訳;

        const 代 = document.createElement('small');
        代.className = 'paid-alt';
        代.textContent = '代わりに: ' + f.代わり;

        本体.appendChild(名);
        本体.appendChild(訳);
        本体.appendChild(代);

        const 切 = document.createElement('label');
        切.className = 'paid-switch';
        const ち = document.createElement('input');
        ち.type = 'checkbox';
        ち.checked = 許した;
        ち.addEventListener('change', () => {
            if (ち.checked) {
                const よいか = confirm(
                    `${f.名} を使えるようにします。\n\n`
                    + `${f.訳}\n\n`
                    + `${f.代わり}\n\n`
                    + `お金がかかる場合があります。よろしいですか。`
                );
                if (!よいか) { ち.checked = false; return; }
            }
            許可を切り替える(f.id, ち.checked);
        });
        const 印 = document.createElement('span');
        印.textContent = 許した ? '使える' : '止めてある';

        切.appendChild(ち);
        切.appendChild(印);

        li.appendChild(本体);
        li.appendChild(切);
        箱.appendChild(li);
    });

    const 記録箱 = document.getElementById('paid-log');
    if (記録箱) {
        const 記録 = 記録を読む().slice(-5).reverse();
        記録箱.innerHTML = 記録.length ? '' : '<li class="hint">まだ変更はありません</li>';
        記録.forEach((r) => {
            const li = document.createElement('li');
            li.className = 'rule-log-item';
            const 名 = (有料になりうる機能.find((x) => x.id === r.機能) || {}).名 || r.機能;
            li.textContent = `${new Date(r.とき).toLocaleString('ja-JP')}  ${名} を${r.した事}`;
            記録箱.appendChild(li);
        });
    }
}

function initPaidGuard() {
    renderPaidGuard();
}

window.initPaidGuard = initPaidGuard;
window.renderPaidGuard = renderPaidGuard;
window.使ってよいか = 使ってよいか;
window.使う前に確かめる = 使う前に確かめる;
window.有料になりうる機能 = 有料になりうる機能;
