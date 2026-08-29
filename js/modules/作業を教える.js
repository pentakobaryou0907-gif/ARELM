/**
 * 新しい作業を、この道具に教える
 *
 * なぜこれが要るのか:
 *   いまエージェントができるのは、書かれている作業だけ。
 *   新しいことをさせたければ、そのたびにコードを足すしかなかった。
 *   それでは「本当に代わりにやってもらう」には届かない。
 *
 *   やり方を並べて教えれば、それを手順として覚える。
 *   次からは一言で実行できる。
 *   <b>できることが、教えるだけで増えていく。</b>
 *
 * 守っていること:
 *   ・並べられるのは、実際に動く作業だけ。
 *     動かないものを覚えたら「やります」と言って何も起きない。
 *     だから、選べるものしか選べない作りにしてある。
 *   ・覚えたものは、いつでも見られて、忘れられる。
 *   ・外へ出る作業、お金がかかる作業は覚えない。
 */

let 組み立て中 = [];

async function 教えられる状態を読む() {
    try {
        const r = await fetch('/api/ai-local/learned-tasks', { cache: 'no-store' });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

async function render作業を教える() {
    const 箱 = document.getElementById('teach-task');
    if (!箱) return;

    const d = await 教えられる状態を読む();
    箱.innerHTML = '';

    if (!d) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '状態を読めませんでした。';
        箱.appendChild(p);
        return;
    }

    /* --- 覚えている作業 --- */
    if (d.覚えた作業.length) {
        const 見出し = document.createElement('p');
        見出し.className = 'guard-on';
        見出し.textContent = `${d.覚えた作業.length}件の作業を覚えています`;
        箱.appendChild(見出し);

        const 一覧 = document.createElement('div');
        一覧.className = 'learned-list';
        d.覚えた作業.forEach((x) => {
            const 札 = document.createElement('div');
            札.className = 'learned-item';

            const 名 = document.createElement('b');
            名.textContent = x.名前;
            札.appendChild(名);

            const 手 = document.createElement('small');
            手.textContent = x.手順.map((h, i) => `${i + 1}. ${h.why || h.action}`).join(' → ');
            札.appendChild(手);

            const 使 = document.createElement('small');
            使.className = 'learned-count';
            使.textContent = `「${(x.呼び方 || []).join('」「')}」で呼べます`
                + (x.使った回数 ? `／${x.使った回数}回 使いました` : '');
            札.appendChild(使);

            const 忘 = document.createElement('button');
            忘.type = 'button';
            忘.className = 'btn-link';
            忘.textContent = '忘れさせる';
            忘.addEventListener('click', async () => {
                if (!confirm(`「${x.名前}」を忘れさせますか。`)) return;
                await fetch('/api/ai-local/learned-tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 忘れる: x.名前 }),
                });
                showNotification(`「${x.名前}」を忘れました`, 'success');
                render作業を教える();
            });
            札.appendChild(忘);

            一覧.appendChild(札);
        });
        箱.appendChild(一覧);
    }

    /* --- 新しく教える --- */
    const 見出し2 = document.createElement('h5');
    見出し2.className = 'rule-head';
    見出し2.textContent = '新しい作業を教える';
    箱.appendChild(見出し2);

    const 行1 = document.createElement('div');
    行1.className = 'guard-row';
    const 名入力 = document.createElement('input');
    名入力.type = 'text';
    名入力.id = 'teach-task-name';
    名入力.placeholder = '作業の名前（例: 撮影の準備）';
    名入力.autocomplete = 'off';
    行1.appendChild(名入力);
    箱.appendChild(行1);

    /* --- 手順を積む --- */
    const 説 = document.createElement('p');
    説.className = 'hint';
    説.textContent = '手順を順に足してください。'
        + '選べるものだけが並んでいます（動かないものは選べません）。';
    箱.appendChild(説);

    const 行2 = document.createElement('div');
    行2.className = 'guard-row';
    const 選択 = document.createElement('select');
    選択.id = 'teach-task-step';
    選択.innerHTML = '<option value="">手順を選ぶ…</option>';

    // 道具を先に出す。
    //
    // 決まった作業より、道具のほうが応用が利く。
    // 「何でもできるようにしたい」なら、
    // まず道具が目に入るほうがよい。
    if (d.道具 && d.道具.length) {
        const 組1 = document.createElement('optgroup');
        組1.label = '道具（組み合わせると何にでも使えます）';
        d.道具.forEach((x) => {
            const o = document.createElement('option');
            o.value = x.action;
            o.textContent = x.label + ' — ' + x.summary;
            o.title = x.summary;
            組1.appendChild(o);
        });
        選択.appendChild(組1);
    }

    const 組2 = document.createElement('optgroup');
    組2.label = '決まった作業';
    d.並べられる作業.forEach((x) => {
        const o = document.createElement('option');
        o.value = x.action;
        o.textContent = x.label;
        o.title = x.summary;
        組2.appendChild(o);
    });
    選択.appendChild(組2);
    行2.appendChild(選択);

    const 足す = document.createElement('button');
    足す.type = 'button';
    足す.className = 'btn btn-sm btn-secondary';
    足す.textContent = '＋ この手順を足す';
    足す.addEventListener('click', () => {
        const 値 = 選択.value;
        if (!値) return;
        const 名 = 選択.options[選択.selectedIndex].textContent;
        // 道具は、何をどうするかの中身が要る。
        // 決まった作業と違い、道具だけでは何をするか決まらない。
        if (値.startsWith('道具:')) {
            const 中身 = 道具の中身を聞く(値.slice(3));
            if (中身 === null) return;      // やめた
            組み立て中.push({ action: 値, why: 名.split(' — ')[0] + 中身.説, params: 中身.params });
        } else {
            組み立て中.push({ action: 値, why: 名 });
        }
        選択.value = '';
        組み立てを描く();
    });
    行2.appendChild(足す);
    箱.appendChild(行2);

    const 組 = document.createElement('div');
    組.id = 'teach-task-steps';
    組.className = 'teach-steps';
    箱.appendChild(組);

    const 行3 = document.createElement('div');
    行3.className = 'guard-row';
    const 覚 = document.createElement('button');
    覚.type = 'button';
    覚.className = 'btn btn-primary';
    覚.textContent = 'この作業を覚えさせる';
    覚.addEventListener('click', async () => {
        const 名 = 名入力.value.trim();
        if (!名) { showNotification('作業の名前を入れてください', 'error'); return; }
        if (!組み立て中.length) { showNotification('手順を足してください', 'error'); return; }

        覚.disabled = true;
        覚.textContent = '覚えています…';
        const r = await fetch('/api/ai-local/learned-tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 名前: 名, 手順: 組み立て中, 呼び方: [名] }),
        });
        const 返 = await r.json();
        showNotification(返.訳, 返.ok ? 'success' : 'error');
        if (返.ok) {
            組み立て中 = [];
            名入力.value = '';
        }
        覚.disabled = false;
        覚.textContent = 'この作業を覚えさせる';
        render作業を教える();
    });
    行3.appendChild(覚);

    const 消 = document.createElement('button');
    消.type = 'button';
    消.className = 'btn btn-sm btn-secondary';
    消.textContent = '組み立てをやめる';
    消.addEventListener('click', () => { 組み立て中 = []; 組み立てを描く(); });
    行3.appendChild(消);
    箱.appendChild(行3);

    組み立てを描く();

    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>覚えた作業は、いつでも見られて、忘れさせられます。</b>'
        + '中身の分からない手順が勝手に動くことはありません。<br>'
        + '<b>外へ出る作業、お金がかかる作業は覚えません。</b>'
        + '頼まれても入れない決まりにしてあります。<br>'
        + '<b>動かない手順は覚えません。</b>'
        + '選べるものだけが並んでいるので、'
        + '「やります」と言って何も起きない、ということが起きません。';
    箱.appendChild(断り);
}

/**
 * 道具を使うときの中身を聞く。
 *
 * 道具は強いぶん、何をするかを決めないと動けない。
 * 「商品を読む」のか「やることを読む」のかで、まるで違う。
 */
function 道具の中身を聞く(道具名) {
    const 扱えるもの = '商品 / やること / メモ / 予定 / 売上 / ブランド / 投稿';

    switch (道具名) {
        case '読む':
        case '書き出す': {
            const 何 = prompt(`何を${道具名}か\n（${扱えるもの}）`, '商品');
            if (!何) return null;
            return { params: { 何を: 何 }, 説: `：${何}` };
        }

        case '数える': {
            const 何 = prompt(`何を数えますか\n（${扱えるもの}）`, '商品');
            if (!何) return null;
            const 項目 = prompt('どの項目を数えますか（空なら件数）\n例: price / quantity', 'quantity');
            const やり方 = 項目
                ? prompt('やり方（合計 / 平均 / 最大 / 最小）', '合計')
                : '';
            return {
                params: { 何を: 何, 項目: 項目 || '', やり方: やり方 || '合計' },
                説: `：${何}${項目 ? 'の' + 項目 + 'の' + (やり方 || '合計') : 'の件数'}`,
            };
        }

        case '書く': {
            const 何 = prompt(`何に書きますか\n（${扱えるもの}）`, 'やること');
            if (!何) return null;
            const 題 = prompt('中身（題名）を入れてください', '');
            if (!題) return null;
            return { params: { 何を: 何, 中身: { title: 題, name: 題 } }, 説: `：${何}に「${題}」` };
        }

        case '探す': {
            const 言 = prompt('何を探しますか', '');
            if (!言) return null;
            return { params: { 言葉: 言 }, 説: `：「${言}」` };
        }

        case '知らせる': {
            const 文 = prompt('何を知らせますか', '');
            if (!文) return null;
            return { params: { 文 }, 説: `：「${文.slice(0, 16)}」` };
        }

        case '開く': {
            const ど = prompt('どこを開きますか\n（ホーム / 在庫 / ブランド / SNS / 開発 / 設定）', '在庫');
            if (!ど) return null;
            return { params: { どこ: ど }, 説: `：${ど}` };
        }

        case '比べる': {
            const 左 = prompt('左の数', '0');
            const やり方 = prompt('やり方（以下 / 以上 / 未満 / より大きい / 同じ）', '以下');
            const 右 = prompt('右の数', '3');
            if (左 === null || 右 === null) return null;
            return { params: { 左, 右, やり方: やり方 || '以下' }, 説: `：${左} ${やり方} ${右}` };
        }

        default:
            return { params: {}, 説: '' };
    }
}

function 組み立てを描く() {
    const 枠 = document.getElementById('teach-task-steps');
    if (!枠) return;
    枠.innerHTML = '';

    if (!組み立て中.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'まだ手順がありません。';
        枠.appendChild(p);
        return;
    }

    組み立て中.forEach((h, i) => {
        const 行 = document.createElement('div');
        行.className = 'teach-step';

        const n = document.createElement('b');
        n.textContent = `${i + 1}.`;
        行.appendChild(n);

        const w = document.createElement('span');
        w.textContent = h.why;
        行.appendChild(w);

        const 消 = document.createElement('button');
        消.type = 'button';
        消.className = 'btn-link';
        消.textContent = '外す';
        消.addEventListener('click', () => {
            組み立て中.splice(i, 1);
            組み立てを描く();
        });
        行.appendChild(消);

        枠.appendChild(行);
    });
}

function init作業を教える() {
    if (document.getElementById('teach-task')) render作業を教える();
}

window.init作業を教える = init作業を教える;
window.render作業を教える = render作業を教える;
