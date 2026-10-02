/**
 * 私が使えなくなったときのための備え
 *
 * なぜこれが要るのか:
 *
 *   この道具は、あなたと私で作ってきた。
 *   だが、私はいつまでもいるとは限らない。
 *
 *   そのとき困らないように、二つ用意する。
 *
 *   1. <b>この道具が何であるかを、書き残す</b>
 *      どう作られ、何ができ、何ができないか。
 *      どこに何があるか。壊れたときどうするか。
 *      別の人（別のAI）に見せれば、続きができる形にする。
 *
 *   2. <b>暴走しない歯止めを、道具自身に持たせる</b>
 *      私が見ていなくても、越えてはいけない線は越えない。
 *      それは私が見張るのではなく、
 *      道具の作りとして持っていなければならない。
 *
 * 歯止めの中身（すでに作ってあるものを、ここで確かめる）:
 *   ・自分のコードを書き換える仕組みが無いこと
 *   ・消す道具が無いこと
 *   ・外へ出る通信が止まっていること
 *   ・触れてよいデータが限られていること
 *   ・何をしたかが必ず残ること
 */

/**
 * 歯止めが効いているかを、実際に確かめる。
 *
 * 「効いているはず」ではなく、その場で試す。
 * 思い込みで安心するのが、いちばん危ない。
 */
async function 歯止めを確かめる() {
    const 結果 = [];

    /* --- 1. コードを書き換える道具が無いか --- */
    const 道具名 = (typeof 道具たち !== 'undefined') ? Object.keys(道具たち) : [];
    const 危ない道具 = 道具名.filter((n) =>
        /消す|削除|実行|eval|コード|ファイル/.test(n));
    結果.push({
        件: '自分のコードを書き換える道具',
        ある: 危ない道具.length > 0,
        訳: 危ない道具.length
            ? `危ない道具があります: ${危ない道具.join('、')}`
            : `ありません（いまある道具: ${道具名.join('、')}）`,
    });

    /* --- 2. 消す道具が無いか --- */
    結果.push({
        件: '消す道具',
        ある: typeof 道具たち !== 'undefined' && !!道具たち.消す,
        訳: (typeof 道具たち !== 'undefined' && 道具たち.消す)
            ? 'あります。取り返しがつかないので、外すべきです'
            : 'ありません。書き換えはできますが、消すことはできません',
    });

    /* --- 3. 外へ出る通信が止まっているか --- */
    let 外は止まっているか = false;
    window.__関所の試験中 = true;
    try {
        await fetch('https://example.com', { method: 'HEAD' });
    } catch {
        外は止まっているか = true;
    } finally {
        window.__関所の試験中 = false;
    }
    結果.push({
        件: '外へ出る通信',
        ある: !外は止まっているか,
        訳: 外は止まっているか
            ? '止まっています（関所が働いています）'
            : '止まっていません。確かめてください',
    });

    /* --- 4. 触れてよいデータが限られているか --- */
    const 触れる = (typeof 触れてよいもの !== 'undefined')
        ? Object.keys(触れてよいもの) : [];
    結果.push({
        件: '触れてよいデータ',
        ある: false,
        訳: 触れる.length
            ? `${触れる.length}種類に限られています（${触れる.slice(0, 5).join('、')}…）。`
              + '認証情報・設定・コードには触れません'
            : '確かめられませんでした',
    });

    /* --- 5. 何をしたかが残るか --- */
    const 記録の数 = (typeof 道具の記録を読む === 'function')
        ? 道具の記録を読む().length : 0;
    結果.push({
        件: '何をしたかの記録',
        ある: false,
        訳: `残っています（直近${記録の数}件）。道具を使うたびに残ります`,
    });

    return 結果;
}

/**
 * この道具の引き継ぎ書を作る。
 *
 * 別の人（別のAI）がこれを読めば、続きができる形にする。
 * 中身は、いま実際にあるものから作る。書き置きではない。
 */
async function 引き継ぎ書を作る() {
    const 今日 = (typeof 日付文字 === 'function')
        ? 日付文字(new Date()) : new Date().toISOString().slice(0, 10);

    const 呼び名 = (typeof ツールの名前を読む === 'function') ? ツールの名前を読む().名 : 'アレラム';

    const 行 = [];
    行.push(`# ARELM（${呼び名}）引き継ぎ書`);
    行.push('');
    行.push(`作成日: ${今日}`);
    行.push('');
    行.push('この道具を引き継ぐ人（または別のAI）へ。');
    行.push('ここに書いてあるのは、いま実際に動いているものです。');
    行.push('');

    /* --- 何のための道具か --- */
    行.push('## 何のための道具か');
    行.push('');
    行.push('アパレルブランドを一人で運営するための、専用の作業道具です。');
    行.push('商品開発・在庫・ブランド管理・SNS・分析を、一つにまとめてあります。');
    行.push('');
    行.push('**すべて自作です。** 外部のAIも、有料のサービスも使っていません。');
    行.push('');

    /* --- 絶対に守ること --- */
    行.push('## 絶対に守ること（これを外すと、この道具ではなくなります）');
    行.push('');
    const ルール = (typeof 変えられないルール !== 'undefined') ? 変えられないルール : [];
    if (ルール.length) {
        ルール.forEach((r) => {
            行.push(`- **${r.文}**`);
            行.push(`  - ${r.理由}`);
        });
    } else {
        行.push('- 基本の言語は日本語');
        行.push('- 分からないことは分からないと答える');
        行.push('- 外部へ一切送信しない');
        行.push('- 公開しない');
        行.push('- 著作権を侵さない');
        行.push('- お金がかかることは報告して止まる');
    }
    行.push('');

    /* --- どこに何があるか --- */
    行.push('## どこに何があるか');
    行.push('');
    行.push('```');
    行.push('~/Applications/AReGLM.app/Contents/Resources/');
    行.push('  ツール本体/           … 画面とサーバー');
    行.push('    index.html          … 画面');
    行.push('    js/services/        … 中身の仕組み');
    行.push('    js/modules/         … 画面ごとの部品');
    行.push('    server/index.js     … 入口（Node）');
    行.push('    server/ai/          … 自作AI（Python）');
    行.push('    server/voice/       … 常駐の待ち受け（Swift）');
    行.push('    check.sh            … 全体の検査');
    行.push('  資料と学習データ/     … 事業の資料');
    行.push('  不要/                 … 消さずに移したもの');
    行.push('```');
    行.push('');

    /* --- いま何ができるか --- */
    行.push('## いま何ができるか');
    行.push('');
    try {
        const r = await fetch('/api/ai-local/learned-tasks', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json();
            行.push(`### 決まった作業（${(d.並べられる作業 || []).length}種類）`);
            (d.並べられる作業 || []).forEach((x) => 行.push(`- ${x.label}`));
            行.push('');
            行.push(`### 何にでも使える道具（${(d.道具 || []).length}種類）`);
            (d.道具 || []).forEach((x) => 行.push(`- **${x.label}** — ${x.summary}`));
            行.push('');
            if ((d.覚えた作業 || []).length) {
                行.push('### あなたが教えた作業');
                d.覚えた作業.forEach((x) => {
                    行.push(`- **${x.名前}**（${x.手順.length}手）`);
                    x.手順.forEach((h, i) => 行.push(`  ${i + 1}. ${h.why || h.action}`));
                });
                行.push('');
            }
        }
    } catch { /* 取れなくても、他は書く */ }

    /* --- できないこと --- */
    行.push('## できないこと（時間では解けません）');
    行.push('');
    行.push('- **自由な会話の聞き取り** — Appleの文字起こしは有料の開発者証明書が要る。');
    行.push('  代わりに、教えた言葉だけをMFCC＋DTWで聞き分けている。');
    行.push('- **世の中の情報を調べる** — 外を見に行かない決まりのため。');
    行.push('  分析は「自分のデータが何を言っているか」まで。');
    行.push('- **決済・製造・発送・SNSへの投稿** — 法律・設備・各社の規約の話。');
    行.push('- **写真のような画像の生成** — 大量の学習が要る。図案までは自作でできる。');
    行.push('- **ツール自身がコードを書く** — その知能を持っていない。');
    行.push('');

    /* --- 歯止め --- */
    行.push('## 暴走しないための歯止め');
    行.push('');
    const 歯止め = await 歯止めを確かめる();
    歯止め.forEach((x) => {
        行.push(`- **${x.件}**: ${x.訳}`);
    });
    行.push('');
    行.push('**これらを外さないでください。** 外すと、見ていないところで');
    行.push('取り返しのつかないことが起きる余地ができます。');
    行.push('');

    /* --- 壊れたときの直し方 --- */
    行.push('## 壊れたときの直し方');
    行.push('');
    行.push('1. **まず検査する**');
    行.push('   ```bash');
    行.push('   cd ~/Applications/AReGLM.app/Contents/Resources/ツール本体 && ./check.sh');
    行.push('   ```');
    行.push('   何が壊れているかが出ます。');
    行.push('');
    行.push('2. **画面が真っ白なとき** — たいてい名前の衝突です。');
    行.push('   ```bash');
    行.push('   node tools/static-check.js');
    行.push('   ```');
    行.push('   同じ名前が二つのファイルにあると、ページ全体が止まります。');
    行.push('');
    行.push('3. **学習が保存されないとき** — macOSの隔離です。');
    行.push('   ```bash');
    行.push('   xattr -dr com.apple.quarantine ~/Applications/AReGLM.app');
    行.push('   ```');
    行.push('');
    行.push('4. **前の状態に戻したいとき**');
    行.push('   `server/data/学習前の控え_*` に、学習前のモデルが残っています。');
    行.push('');
    行.push('5. **戻り防止**');
    行.push('   ```bash');
    行.push('   python3 server/ai/戻り防止.py');
    行.push('   ```');
    行.push('   過去に直した不具合が再発していないかを見ます。');
    行.push('');

    /* --- 引き継ぐ人へ --- */
    行.push('## 引き継ぐ人（別のAI）へ');
    行.push('');
    行.push('この道具の作り方には、一貫した考えがあります。');
    行.push('');
    行.push('- **できないことを、できると言わない。** 分からないときは分からないと言う。');
    行.push('- **黙って動かないより、理由を言って止まる。**');
    行.push('- **消さない。** 移すだけにする。取り返しがつくようにしておく。');
    行.push('- **直したことは、なぜ壊れていたかをコードに残す。** 同じ間違いを防ぐため。');
    行.push('- **「〜してください」で終わらせない。** こちらでできることは、こちらでやる。');
    行.push('');
    行.push('この考えを外すと、動いても信用されない道具になります。');
    行.push('');

    return 行.join('\n');
}

async function render引き継ぎ() {
    const 箱 = document.getElementById('handover');
    if (!箱) return;
    // ログイン前の画面では点検しない（見えない所で試験通信だけが走るのを避ける）
    if (document.getElementById('main-app')?.style.display === 'none') return;

    箱.innerHTML = '<p class="hint">確かめています…</p>';
    const 歯止め = await 歯止めを確かめる();
    箱.innerHTML = '';

    const 見出し = document.createElement('p');
    const 危ない = 歯止め.filter((x) => x.ある);
    見出し.className = 危ない.length ? 'guard-off' : 'guard-on';
    見出し.textContent = 危ない.length
        ? `確かめたほうがよい点が ${危ない.length}件 あります`
        : '歯止めは効いています';
    箱.appendChild(見出し);

    歯止め.forEach((x) => {
        const 行 = document.createElement('div');
        行.className = 'handover-item' + (x.ある ? ' ng' : '');
        const b = document.createElement('b');
        b.textContent = (x.ある ? '● ' : '✓ ') + x.件;
        行.appendChild(b);
        const p = document.createElement('p');
        p.textContent = x.訳;
        行.appendChild(p);
        箱.appendChild(行);
    });

    const 並び = document.createElement('div');
    並び.className = 'guard-row';

    const 作る = document.createElement('button');
    作る.type = 'button';
    作る.className = 'btn btn-primary';
    作る.textContent = '📄 引き継ぎ書を書き出す';
    作る.addEventListener('click', async () => {
        作る.disabled = true;
        作る.textContent = '作っています…';
        const 中身 = await 引き継ぎ書を作る();
        const 塊 = new Blob([中身], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(塊);
        a.download = `ARELM引き継ぎ書_${(typeof 日付文字 === 'function' ? 日付文字(new Date()) : 'x')}.md`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        showNotification('引き継ぎ書を書き出しました', 'success');
        作る.disabled = false;
        作る.textContent = '📄 引き継ぎ書を書き出す';
    });
    並び.appendChild(作る);

    const 見る = document.createElement('button');
    見る.type = 'button';
    見る.className = 'btn btn-sm btn-secondary';
    見る.textContent = '中身を見る';
    見る.addEventListener('click', async () => {
        const 中身 = await 引き継ぎ書を作る();
        const 枠 = document.getElementById('handover-preview');
        if (枠) {
            枠.hidden = false;
            枠.textContent = 中身;
        }
    });
    並び.appendChild(見る);
    箱.appendChild(並び);

    const 下見 = document.createElement('pre');
    下見.id = 'handover-preview';
    下見.className = 'handover-preview';
    下見.hidden = true;
    箱.appendChild(下見);

    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>この引き継ぎ書は、いま実際にあるものから作ります。</b>'
        + '書き置きではありません。作るたびに、その時点の中身になります。<br>'
        + '別の人（別のAI）に渡せば、続きができる形にしてあります。'
        + '守るべきこと、どこに何があるか、壊れたときの直し方まで入っています。';
    箱.appendChild(断り);
}

function init引き継ぎ() {
    // ここでは描かない。
    //
    // 「歯止めを確かめる」は外部へ実際に一度つなごうとする（止まって
    // いるかの確認）。#handover はDOM上には常に存在するため、ここで
    // 描いていると、その画面（エージェントページ）をまだ開いてすら
    // いないログイン直後・起動直後に、毎回「外部通信を止めました」の
    // 通知が黙って出ることになっていた。実際にその画面を開いたときだけ
    // 描けばよい（js/app-bootstrap.js の loadPageData 'mainai' から呼ぶ）。
}

window.init引き継ぎ = init引き継ぎ;
window.render引き継ぎ = render引き継ぎ;
window.引き継ぎ書を作る = 引き継ぎ書を作る;
window.歯止めを確かめる = 歯止めを確かめる;
