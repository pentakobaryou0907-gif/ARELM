/**
 * このツールの説明と点検（ホームの「設定」タブの一番上）
 *
 * 本人の要望（2026-10-08）: 何で作られて、どんな機能があり、何をしてくれるのかを、
 * 1から説明し、点検もできる場所がほしい。
 *
 * やっていること:
 *   ・作り（どこで何が動いているか）を並べ、いま動いているかを、その場で実際に確かめて出す
 *   ・できること（場所ごと）を並べ、押せばその場所へ移る
 *   ・守っている決まりを並べる
 *   ・要件表（js/config/requirements.js）から、できた/一部/まだ/不可/行わないの数を数えて出す
 *     （ここで別に「できること一覧」を持つと、表とずれて嘘になるため、数は表から取る）
 *   ・「まとめて点検」で、作りの確認と自己点検（self-check.js）を続けて走らせる
 *
 * 外へは何も送らない（確かめる先は、このツール自身の窓口と、この端末の中だけ）。
 */

const ツール説明_作り = [
    { 名: '画面', 中身: 'ビルドなしのJavaScript（index.html と js/）。Mac・iPad・Windowsのブラウザで動き、ホーム画面に入れると、入れ直さずに自動で最新になる（sw.js）。', 確かめ: 'アプリの控え' },
    { 名: 'Macのサーバー', 中身: 'Node（server/index.js）。データの保存と端末同士の同期、門番（Macで許可した端末だけ）、夜の当番（毎日の点検）。Mac本体で動く。', 確かめ: 'サーバー' },
    { 名: '自作AI', 中身: 'Python（server/ai/）。会話・学習・技能（実際の操作）・決まり（外へ出さない・違法なことはしない）。Macで動く。', 確かめ: '自作AI' },
    { 名: 'ローカルLLM', 中身: 'Ollama。長い文章を、Macの中だけで書く（外へ送らない）。', 確かめ: null },
    { 名: '公開先', 中身: 'GitHub Pages（https://pentakobaryou0907-gif.github.io/ARELM/）。Macが無くても画面が開く。その端末の指紋・顔（パスキー）で開く。合言葉もパスワードも無い。', 確かめ: '公開先' },
    { 名: '同期の倉庫', 中身: 'GitHubの非公開倉庫（ARELM-data）。全部の端末とMacで、同じデータになる。中身は、自動で作った同期の鍵で暗号化してから置く。新しい端末へは、QRで渡す（打たない）。', 確かめ: '倉庫' },
    { 名: '外のAI（Mac無しのとき）', 中身: 'Gemini の無料API。Macが無いときの会話だけに使う（カード番号・キー・メールらしきものは送らない）。', 確かめ: 'Gemini' },
];

const ツール説明_場所 = [
    { 名: 'ホーム', 頁: 'dashboard', 中身: '今日やること・確認待ち・夜の当番の報告／AI／記録（メモ・体調）／計画／自分（自分磨き）／お金／設定' },
    { 名: 'エージェント（◈）', 頁: 'mainai', 中身: '話しかけるだけで、段取りを見せてから代わりに進める。係で手分けして同時に進める（チーム）' },
    { 名: 'AIチャット', 頁: 'chat', 中身: '相談・文章づくり・＋から作れるもの（テックパック・投稿文など）' },
    { 名: '遠隔操作', 頁: 'remote', 中身: '外のサイトを触る作業の窓。作業ごとのタブ・確認待ち・目的と「いま何をしているか」' },
    { 名: 'ブランド', 頁: 'brands', 中身: '自社と他社のブランド情報・歴史と理念・参考ブランド' },
    { 名: 'SNS', 頁: 'sns', 中身: '投稿の下書きと管理・出先から投稿（端末の共有を使う）' },
    { 名: '在庫', 頁: 'inventory', 中身: 'SUZURIの商品だけの在庫・受注の見張り（決めた人数に達したら知らせる）・表で計算' },
    { 名: '開発', 頁: 'studio', 中身: 'モックアップ・テックパック・型紙・値札タグ・画像の編集・保管庫（写真や資料）' },
    { 名: '作業', 頁: 'tasks', 中身: '制作の進捗（続きから再開）・公開前チェック・繰り返しのやること' },
];

const ツール説明_決まり = [
    '消さない（取り除くのではなく、移す。データを空にする操作は確認なしで置かない）',
    '外へ送らない（外への通信は関所を通す。外部サービスは公式・無料のものだけ）',
    'SUZURIの「商品を公開する」ボタンは本人が押す。お金が絡む操作は、必ず本人に確認する',
    '鍵・パスワード・合言葉を、コード・ログ・画面に書かない',
    '「できた」と言う前に、動かして確かめる。確かめていないものは「未確認」と書く',
    'AIで作ったことを隠さない（電子透かしの除去・AI利用の秘匿はしない）',
];

/** 作りの一つが、いま動いているかを確かめる。{ 状態: 'ok'|'warn'|'ng', 文 } */
async function ツール説明_確かめる(何) {
    const 問う = async (道) => {
        try { const r = await fetch(道, { cache: 'no-store', signal: AbortSignal.timeout(4000) }); return r.ok ? await r.json().catch(() => ({})) : null; }
        catch { return null; }
    };
    const 公開先か = typeof サーバーの無い公開先か === 'function' && サーバーの無い公開先か();
    if (何 === 'アプリの控え') {
        if (!('serviceWorker' in navigator) || !window.isSecureContext) return { 状態: 'warn', 文: 'この接続（http）では控えを置けません。https か localhost で開くと、Mac無しでも開けます' };
        const 登録 = await navigator.serviceWorker.getRegistrations();
        return 登録.length ? { 状態: 'ok', 文: '端末に控えがあり、自動で最新になります' } : { 状態: 'warn', 文: 'まだ控えがありません（一度開き直すと置かれます）' };
    }
    if (何 === 'サーバー') {
        if (公開先か) return { 状態: 'warn', 文: '公開先ではMacのサーバーを使いません（データは同期の倉庫、会話はGemini）' };
        return (await 問う('/api/health')) ? { 状態: 'ok', 文: '動いています' } : { 状態: 'ng', 文: 'Macのサーバーに繋がりません（Macが寝ている・止まっている）' };
    }
    if (何 === '自作AI') {
        if (公開先か) return { 状態: 'warn', 文: '公開先には自作AIがありません（Macで開いたときに使えます）' };
        return (await 問う('/api/ai-local/health')) ? { 状態: 'ok', 文: '動いています' } : { 状態: 'ng', 文: '自作AIが応えません（設定の自己点検で状態を確かめてください）' };
    }
    if (何 === '公開先') {
        return 公開先か ? { 状態: 'ok', 文: 'いま公開先で開いています（Macが無くても使えます）' } : { 状態: 'ok', 文: 'いまはMacのARELMで開いています' };
    }
    if (何 === '倉庫') {
        if (公開先か) {
            return window.外の倉庫 && 外の倉庫.使えるか()
                ? { 状態: 'ok', 文: 'つながっています（暗号化して同期）' }
                : { 状態: 'warn', 文: 'まだつながっていません（設定の「☁ Mac無しで使う」）' };
        }
        const 様 = await 問う('/api/ext-store/status');
        if (!様) return { 状態: 'warn', 文: 'Macのサーバーに繋がらないため、分かりません' };
        if (!様.設定済み) return { 状態: 'warn', 文: 'Macのデータは、まだ共有していません（設定の「☁ Mac無しで使う」）' };
        return 様.最後 && 様.最後.ok === false ? { 状態: 'ng', 文: '最後に混ぜたとき、うまくいきませんでした: ' + 様.最後.訳 } : { 状態: 'ok', 文: 'Macのデータも共有しています' };
    }
    if (何 === 'Gemini') {
        if (!公開先か) return { 状態: 'ok', 文: 'Macでは自作AIが答えます（Geminiは使いません）' };
        return window.外のAI && 外のAI.使えるか() ? { 状態: 'ok', 文: 'キーが入っています' } : { 状態: 'warn', 文: 'まだキーが入っていません（設定の「☁ Mac無しで使う」）' };
    }
    return { 状態: 'warn', 文: 'ここからは確かめられません' };
}

/** 要件表から、分類ごとの数を数える */
function ツール説明_要件の数() {
    const 表 = Array.isArray(window.要件一覧) ? window.要件一覧 : [];
    const 全体 = { done: 0, partial: 0, todo: 0, blocked: 0, 行わない: 0 };
    const 分類別 = {};
    表.forEach((r) => {
        全体[r.状態] = (全体[r.状態] || 0) + 1;
        分類別[r.分類] = 分類別[r.分類] || { done: 0, 全部: 0 };
        分類別[r.分類].全部++;
        if (r.状態 === 'done') 分類別[r.分類].done++;
    });
    return { 全体, 分類別, 件数: 表.length };
}

function ツール説明_部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

const ツール説明_印 = { ok: '✓', warn: '◐', ng: '✗' };

async function renderツールの説明() {
    const 箱 = document.getElementById('tool-guide-panel');
    if (!箱) return;
    箱.textContent = '';

    /* ---- 作り ---- */
    箱.append(ツール説明_部品('h4', '① 何でできているか（いま動いているか）'));
    const 作り = ツール説明_部品('ul');
    const 結果欄 = [];
    ツール説明_作り.forEach((x) => {
        const li = ツール説明_部品('li');
        li.append(ツール説明_部品('strong', x.名 + '：'), x.中身);
        const 結果 = ツール説明_部品('div', x.確かめ ? '確かめています…' : '（ここからは確かめません）', 'hint');
        li.append(結果);
        if (x.確かめ) 結果欄.push([x.確かめ, 結果]);
        作り.append(li);
    });
    箱.append(作り);
    Promise.all(結果欄.map(async ([何, 欄]) => {
        const r = await ツール説明_確かめる(何);
        欄.textContent = `${ツール説明_印[r.状態]} ${r.文}`;
        欄.style.color = r.状態 === 'ng' ? '#dc2626' : '';
    }));

    /* ---- できること ---- */
    箱.append(ツール説明_部品('h4', '② 何ができるか（押すと、その場所へ移ります）'));
    const 場所 = ツール説明_部品('ul');
    ツール説明_場所.forEach((x) => {
        const li = ツール説明_部品('li');
        const a = ツール説明_部品('button', x.名, 'btn btn-sm btn-secondary');
        a.type = 'button';
        a.addEventListener('click', () => { if (typeof switchPage === 'function') switchPage(x.頁); });
        li.append(a, ' ', x.中身);
        場所.append(li);
    });
    箱.append(場所);

    /* ---- 決まり ---- */
    箱.append(ツール説明_部品('h4', '③ 守っている決まり'));
    const 決まり = ツール説明_部品('ul');
    ツール説明_決まり.forEach((t) => 決まり.append(ツール説明_部品('li', t)));
    箱.append(決まり);

    /* ---- できる・できないの数 ---- */
    const 数 = ツール説明_要件の数();
    箱.append(ツール説明_部品('h4', '④ やりたいことの進み具合（要件表から数えています）'));
    箱.append(ツール説明_部品('p',
        `全${数.件数}件: できた ${数.全体.done}／一部 ${数.全体.partial}／まだ ${数.全体.todo}／不可・条件つき ${数.全体.blocked}／あえて行わない ${数.全体.行わない}`));
    箱.append(ツール説明_部品('p',
        Object.entries(数.分類別).map(([k, v]) => `${k} ${v.done}/${v.全部}`).join('　'), 'hint'));

    /* ---- 点検 ---- */
    箱.append(ツール説明_部品('h4', '⑤ 点検'));
    const 並び = ツール説明_部品('div');
    並び.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const まとめて = ツール説明_部品('button', 'まとめて点検する', 'btn btn-sm btn-primary');
    まとめて.type = 'button';
    const 結果 = ツール説明_部品('p', '', 'hint');
    まとめて.addEventListener('click', async () => {
        まとめて.disabled = true;
        結果.textContent = '点検しています…';
        const 返事 = await Promise.all(ツール説明_作り.filter((x) => x.確かめ).map(async (x) => [x.名, await ツール説明_確かめる(x.確かめ)]));
        const 悪い = 返事.filter(([, r]) => r.状態 === 'ng');
        if (typeof selfCheckRun === 'function') selfCheckRun();   // 画面の自己点検も続けて走らせる（下の「自己点検と修復」に結果が出る）
        結果.textContent = 悪い.length
            ? `直すところがあります: ${悪い.map(([名, r]) => `${名}（${r.文}）`).join('／')}。下の「自己点検と修復」も見てください。`
            : '作りはすべて動いています（◐は、使っていない・まだ設定していないもの）。画面の自己点検の結果は、下の「自己点検と修復」に出ています。';
        renderツールの説明が描いた結果を更新(返事);
        まとめて.disabled = false;
    });
    並び.append(まとめて);
    箱.append(並び, 結果);
}

/** まとめて点検した結果で、①の欄も新しくする */
function renderツールの説明が描いた結果を更新(返事) {
    const 欄 = document.querySelectorAll('#tool-guide-panel ul:first-of-type li .hint');
    const 名前順 = ツール説明_作り.map((x) => x.名);
    返事.forEach(([名, r]) => {
        const i = 名前順.indexOf(名);
        if (欄[i]) { 欄[i].textContent = `${ツール説明_印[r.状態]} ${r.文}`; 欄[i].style.color = r.状態 === 'ng' ? '#dc2626' : ''; }
    });
}

window.renderツールの説明 = renderツールの説明;
window.ツール説明_要件の数 = ツール説明_要件の数;
