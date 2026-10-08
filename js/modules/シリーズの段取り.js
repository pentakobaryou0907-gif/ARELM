/**
 * シリーズの段取り（ホームの「計画」タブ。TUDURI・INTGLMは上の「制作の進捗」）
 *
 * 本人の要望（2026-10-08）: 各シリーズの作業（今はClaude in Chromeで行っているもの）を、
 * このツールの中で、途中から再開できる形で、正確に最後まで進められるようにする。
 *
 * ここで扱うもの（TUDURI・INTGLMは、上の「制作の進捗と公開前チェック」が担当）:
 *   ・AReGLM（予約販売）… 受注数が集まったら作る売り方の、準備から公開・見張り・記録まで
 *   ・動画投稿          … トレンド分析から制作・投稿・投稿の記録まで
 *
 * 決まり:
 *   ・「回」ごとに手順に印を付け、開いたら「続きはここから」を出す（最初からやり直さない）
 *   ・公開・投稿・課金の手順は「本人が行う」。ここからは押さず、本人が行ったことを印で残すだけ
 *   ・消さない。やめた回は「見送り」にして残す
 *   ・動画投稿の最後に、投稿の記録（日時・媒体・本文・タグ・素材・BGMの出所）を残す
 *   ・AIで作ったことは隠さない（電子透かしの除去などはしない）
 */

const 段取りの鍵 = 'areglm_series_runs';
const 投稿の記録の鍵 = 'areglm_post_log';

const 段取りの型 = {
    'AReGLM（予約販売）': [
        { 名: '商品を決める（購入したモックアップ・テックパックを使う。過去の商品と似ていないか確かめる）' },
        { 名: 'テックパックに、原価・必要な資金・期間・作り方・型紙・「工場が後から値段を変えない」注意書きを入れる' },
        { 名: '受注の条件を決める（何人で作るか・期限・届かなければ販売しない／お金も取らない）', 行き先: ['inventory', 'preorder'] },
        { 名: '商品説明を書く（販売方法・仕様・納期が半年以上かかること・何人以上で販売・届かなければ販売しない）' },
        { 名: '完成ビジュアル（画像・動画）を用意する（AIで作ったことは隠さない）' },
        { 名: '値札タグを考える' },
        { 名: '販売ページを準備する（Shopifyは有料。お金がかかるため、本人が決めてから）', 本人: true },
        { 名: '公開する（公開ボタンは本人が押す）', 本人: true },
        { 名: '受注数を見張る（決めた人数に達したら知らせが来る）', 行き先: ['inventory', 'preorder'] },
        { 名: '記録する（在庫・利益の表に登録）', 行き先: ['inventory', 'profit'] },
    ],
    '動画投稿': [
        { 名: 'トレンドを調べる（年齢層・どのSNSか・買う気につながる投稿の傾向）' },
        { 名: '素材を確かめる（保管庫）。使ったものは「使用済み」へ移す（消さない）', 行き先: ['studio'] },
        { 名: '動画・画像を作る（商用利用できる無料のもの）' },
        { 名: '効果音・BGMを付ける（どこで作ったかを残す）' },
        { 名: '1本にまとめる' },
        { 名: '投稿文とハッシュタグを決める（最初に調べた傾向から）', 行き先: ['sns'] },
        { 名: '投稿する（送信は本人が最終確認して押す）', 本人: true },
        { 名: '投稿の記録を残す（日時・媒体・本文・タグ・素材・BGMの出所）', 記録: true },
    ],
};

function 段取りを読む() {
    try { const x = JSON.parse(localStorage.getItem(段取りの鍵) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; }
}

function 段取りを書く(一覧) {
    localStorage.setItem(段取りの鍵, JSON.stringify(一覧));
}

function 投稿の記録を読む() {
    try { const x = JSON.parse(localStorage.getItem(投稿の記録の鍵) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; }
}

/** 回の様子: 済んだ数・続きの手順の番号（全部済めば null） */
function 段取りの様子(回) {
    const 済 = 回.手順.filter((t) => t.済).length;
    const 続き = 回.手順.findIndex((t) => !t.済);
    return { 済, 全部: 回.手順.length, 続き: 続き < 0 ? null : 続き };
}

/** 新しい回を作る（型から手順を写す） */
function 段取りの回を作る(シリーズ, 題, いま = new Date()) {
    const 型 = 段取りの型[シリーズ];
    if (!型) return null;
    return {
        id: 'run_' + いま.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
        シリーズ, 題: String(題 || '').trim() || `${シリーズ} ${いま.toISOString().slice(0, 10)}`,
        始めた日: いま.toISOString(), 状態: '進行中',
        手順: 型.map((t) => ({ 名: t.名, 本人: !!t.本人, 記録: !!t.記録, 行き先: t.行き先 || null, 済: false, メモ: '' })),
    };
}

function 段取り_部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function 段取り_移る(行き先) {
    if (!行き先 || typeof switchPage !== 'function') return;
    switchPage(行き先[0]);
    if (行き先[0] === 'inventory' && 行き先[1] && typeof switchHubTab === 'function') {
        if (typeof switchHubGroup === 'function') switchHubGroup('money');
        switchHubTab(行き先[1]);
    }
}

function 投稿の記録の形(回, 箱) {
    const 形 = document.createElement('form');
    形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0';
    const 欄 = (見本, 幅 = '140px') => { const i = document.createElement('input'); i.type = 'text'; i.placeholder = 見本; i.style.width = 幅; return i; };
    const 日時 = document.createElement('input');
    日時.type = 'datetime-local';
    日時.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const 媒体 = 欄('媒体（Instagram等）');
    const 本文 = 欄('本文', '220px');
    const タグ = 欄('ハッシュタグ', '160px');
    const 素材 = 欄('使った素材（ファイル名など）', '180px');
    const BGM = 欄('BGMの出所（例: Music FX）', '160px');
    const 残す = 段取り_部品('button', '投稿の記録を残す', 'btn btn-sm btn-primary');
    残す.type = 'submit';
    形.append(日時, 媒体, 本文, タグ, 素材, BGM, 残す);
    形.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!媒体.value.trim() || !本文.value.trim()) { showNotification('媒体と本文を入れてください', 'error'); return; }
        const 記録 = 投稿の記録を読む();
        記録.push({ 回: 回.id, 日時: 日時.value, 媒体: 媒体.value.trim(), 本文: 本文.value.trim(), タグ: タグ.value.trim(), 素材: 素材.value.trim(), BGMの出所: BGM.value.trim(), 残した日: new Date().toISOString() });
        localStorage.setItem(投稿の記録の鍵, JSON.stringify(記録));
        const 一覧 = 段取りを読む();
        const t = 一覧.find((x) => x.id === 回.id);
        if (t) { const 手 = t.手順.find((x) => x.記録); if (手) 手.済 = true; if (段取りの様子(t).続き == null) t.状態 = '済'; 段取りを書く(一覧); }
        showNotification('投稿の記録を残しました', 'success');
        render段取り();
    });
    箱.append(形);
}

function render段取り() {
    const 箱 = document.getElementById('series-runs-panel');
    if (!箱) return;
    箱.textContent = '';
    const 一覧 = 段取りを読む();

    // 新しい回
    const 形 = document.createElement('form');
    形.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
    const 種 = document.createElement('select');
    Object.keys(段取りの型).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = k; 種.append(o); });
    const 題 = document.createElement('input');
    題.type = 'text';
    題.placeholder = '題（例: 黒のワークジャケット）';
    題.style.width = '200px';
    const 始める = 段取り_部品('button', '新しく始める', 'btn btn-sm btn-primary');
    始める.type = 'submit';
    形.append(種, 題, 始める);
    形.addEventListener('submit', (e) => {
        e.preventDefault();
        const x = 段取りを読む();
        x.push(段取りの回を作る(種.value, 題.value));
        段取りを書く(x);
        render段取り();
    });
    箱.append(形);

    const 進行中 = 一覧.filter((r) => r.状態 === '進行中').reverse();
    if (!進行中.length) 箱.append(段取り_部品('p', '進めている回はありません。上から始めると、手順が並び、途中で閉じても続きから再開できます。', 'hint'));
    進行中.forEach((回) => {
        const 様 = 段取りの様子(回);
        const 札 = 段取り_部品('div', null, 'panel-card');
        札.style.margin = '8px 0';
        札.append(段取り_部品('h4', `${回.シリーズ}：${回.題}（${様.済}/${様.全部}）`));
        if (様.続き != null) 札.append(段取り_部品('p', `▶ 続きはここから: ${様.続き + 1}. ${回.手順[様.続き].名}`, 'status-banner ok'));
        const ol = 段取り_部品('ol');
        回.手順.forEach((t, i) => {
            const li = 段取り_部品('li');
            const 印 = document.createElement('input');
            印.type = 'checkbox';
            印.checked = !!t.済;
            印.disabled = !!t.記録 && !t.済;   // 投稿の記録は、下の欄で残したときに済む
            印.addEventListener('change', () => {
                const x = 段取りを読む();
                const r = x.find((z) => z.id === 回.id);
                if (!r) return;
                r.手順[i].済 = 印.checked;
                if (印.checked) r.手順[i].済んだ日 = new Date().toISOString();
                if (段取りの様子(r).続き == null) r.状態 = '済';
                段取りを書く(x);
                render段取り();
            });
            const 文 = 段取り_部品('span', ` ${t.名}`);
            if (t.済) 文.style.opacity = '.6';
            li.append(印, 文);
            if (t.本人) li.append(段取り_部品('strong', '（本人が行う）'));
            if (t.行き先) {
                const 移 = 段取り_部品('button', '開く', 'btn btn-sm btn-secondary');
                移.type = 'button';
                移.style.marginLeft = '6px';
                移.addEventListener('click', () => 段取り_移る(t.行き先));
                li.append(移);
            }
            if (t.記録 && !t.済 && 様.続き === i) 投稿の記録の形(回, li);
            ol.append(li);
        });
        札.append(ol);
        const 見送る = 段取り_部品('button', 'この回を見送る（消さずに残す）', 'btn btn-sm btn-secondary');
        見送る.type = 'button';
        見送る.addEventListener('click', () => {
            const x = 段取りを読む();
            const r = x.find((z) => z.id === 回.id);
            if (r) { r.状態 = '見送り'; r.見送った日 = new Date().toISOString(); 段取りを書く(x); }
            render段取り();
        });
        札.append(見送る);
        箱.append(札);
    });

    const 済んだ = 一覧.filter((r) => r.状態 !== '進行中');
    if (済んだ.length) 箱.append(段取り_部品('p', `済んだ回 ${済んだ.filter((r) => r.状態 === '済').length}件・見送り ${済んだ.filter((r) => r.状態 === '見送り').length}件（記録は残っています）`, 'hint'));
    const 記録 = 投稿の記録を読む();
    if (記録.length) {
        箱.append(段取り_部品('h4', `投稿の記録（${記録.length}件）`));
        const ul = 段取り_部品('ul');
        記録.slice(-10).reverse().forEach((r) => ul.append(段取り_部品('li', `${String(r.日時).replace('T', ' ')}　${r.媒体}　${r.本文.slice(0, 40)}${r.本文.length > 40 ? '…' : ''}　${r.タグ}　素材: ${r.素材 || '—'}　BGM: ${r.BGMの出所 || '—'}`)));
        箱.append(ul);
    }
}

window.render段取り = render段取り;
window.段取りの様子 = 段取りの様子;
window.段取りの回を作る = 段取りの回を作る;
