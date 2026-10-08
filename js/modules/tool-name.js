/**
 * このツールの名前
 *
 * なぜこれが要るのか:
 *   呼び名がないと、声で呼びかけるときに困る。
 *   また、いずれ事業として使うときに、
 *   人に説明する名前がないと話が進まない。
 *
 * ここでやること:
 *   名前を決めて、画面と呼びかけに反映する。
 *   案も出すが、決めるのはご自身。
 *
 * 案の作り方:
 *   ブランド名 ARELM から取ったもの、
 *   役割から取ったもの、日本語のものを混ぜてある。
 *   一方向に寄せると選べなくなるため。
 *
 * すべてこの端末の中だけに保存する。外部へは一切送らない。
 */

const AREGLM_TOOLNAME_KEY = 'areglm_tool_name';

/**
 * 名前の案。
 *
 * それぞれ、なぜその名前かを添えてある。
 * 由来が分からない名前は、愛着が湧きにくいため。
 */
const 名前の案 = [
    {
        名: 'アレラム', 読み: 'ARELM',
        由来: 'ご本人が決めた、いまの呼び名。（いまの名前）',
    },
    {
        名: 'アレン', 読み: 'Aren',
        由来: 'ARELM の頭から。以前の呼び名。',
    },
    {
        名: 'グラム', 読み: 'GLM',
        由来: 'ARELM の後ろから。短く、声で呼びやすい。',
    },
    {
        名: 'ツヅリ', 読み: 'TUDURI',
        由来: 'シリーズ名から。「綴る」に通じ、作り続ける意味が重なる。',
    },
    {
        名: 'ソウ', 読み: 'Sou',
        由来: '「相棒」の相。一文字で呼べる。',
    },
    {
        名: 'アトリエ', 読み: 'Atelier',
        由来: '作る場所という意味。仕事場そのものを指す。',
    },
    {
        名: 'ハコ', 読み: 'Hako',
        由来: '道具箱の箱。何でも入っている場所。',
    },
];

function ツールの名前を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(AREGLM_TOOLNAME_KEY) || 'null');
        if (r && r.名) {
            呼びかけの名前をそろえる(r.名);
            return r;
        }
    } catch {
        /* 壊れていれば既定に戻す */
    }
    呼びかけの名前をそろえる('アレラム');
    // 既定は「アレラム」。
    // ご本人が決めた名前なので、何も設定しなくてもこの名前で始まる。
    // 以前は「アレン」（ARELM の頭から取った名前）だった。
    return { 名: 'アレラム', 読み: 'ARELM', 決めた日: '2026-08-27' };
}

/**
 * 呼びかけの名前を、画面の名前にそろえる。
 *
 * なぜ要るのか:
 *   名前を自分で決めたときだけ、呼びかけの名前も書き込んでいた。
 *   はじめから「アレン」で始まる人は、決める操作をしないので、
 *   呼びかけの名前が空のままだった。
 *
 *   その結果、画面には「アレン」と出ているのに、
 *   呼んでも反応しない、という状態になっていた。
 *   点検（要件表の「このツールの名前」）で見つけた。
 */
function 呼びかけの名前をそろえる(名) {
    if (!名) return;
    if (localStorage.getItem('areglm_wake_name') !== 名) {
        localStorage.setItem('areglm_wake_name', 名);
    }
}

/**
 * 名前を決める。
 *
 * 呼び名にも同じ名前を入れる。
 * 別々にすると、画面の名前と呼びかけがずれてしまう。
 */
function ツールの名前を決める(名, 読み) {
    名 = (名 || '').trim();
    if (!名) return false;

    localStorage.setItem(AREGLM_TOOLNAME_KEY, JSON.stringify({
        名,
        読み: (読み || 名).trim(),
        決めた日: typeof 今日 === 'function' ? 今日() : '',
    }));

    // 呼びかけの名前もそろえる
    localStorage.setItem('areglm_wake_name', 名);

    名前を画面に反映();
    renderToolName();

    if (typeof showNotification === 'function') {
        showNotification(`このツールの名前を「${名}」にしました。声でもこの名前で呼べます。`, 'success');
    }
    return true;
}

/**
 * 決めた名前を、画面のあちこちに反映する。
 *
 * 一つずつ書き換えると必ず漏れるので、
 * 目印を付けた場所をまとめて書き換える。
 */
function 名前を画面に反映() {
    const n = ツールの名前を読む();

    document.querySelectorAll('[data-tool-name]').forEach((el) => {
        el.textContent = n.名;
    });

    // 表記名は「ARELM」だけ（全端末で統一）。呼び名（アレラム等）は、声で呼ぶための名前で、表記には出さない
    document.title = 'ARELM';

    // 呼びかけの欄にも入れる
    const 呼び名 = document.getElementById('wake-name');
    if (呼び名) 呼び名.value = n.名;
}

function renderToolName() {
    const 箱 = document.getElementById('toolname-list');
    if (!箱) return;

    const いま = ツールの名前を読む();

    const 今の表示 = document.getElementById('toolname-current');
    if (今の表示) {
        今の表示.textContent = いま.決めた日
            ? `いまの名前: ${いま.名}（${いま.決めた日} に決めました）`
            : `いまの名前: ${いま.名}（まだ決めていません）`;
    }

    箱.innerHTML = '';
    名前の案.forEach((a) => {
        const li = document.createElement('li');
        li.className = 'name-item' + (a.名 === いま.名 ? ' chosen' : '');

        const 本体 = document.createElement('div');
        本体.className = 'name-body';
        const 名 = document.createElement('b');
        名.textContent = `${a.名}（${a.読み}）`;
        const 由 = document.createElement('small');
        由.textContent = a.由来;
        本体.appendChild(名);
        本体.appendChild(由);

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm ' + (a.名 === いま.名 ? 'btn-secondary' : 'btn-primary');
        b.textContent = a.名 === いま.名 ? 'この名前です' : 'これにする';
        b.disabled = a.名 === いま.名;
        b.addEventListener('click', () => ツールの名前を決める(a.名, a.読み));

        li.appendChild(本体);
        li.appendChild(b);
        箱.appendChild(li);
    });
}

function initToolName() {
    document.getElementById('toolname-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const 名 = document.getElementById('toolname-input');
        const 読 = document.getElementById('toolname-read');
        if (!ツールの名前を決める(名?.value, 読?.value)) return;
        if (名) 名.value = '';
        if (読) 読.value = '';
    });

    名前を画面に反映();
    renderToolName();
}

window.initToolName = initToolName;
window.renderToolName = renderToolName;
window.ツールの名前を読む = ツールの名前を読む;
window.ツールの名前を決める = ツールの名前を決める;
window.名前を画面に反映 = 名前を画面に反映;
