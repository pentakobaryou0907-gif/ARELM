// ARELMの手 ― 小窓（拡張機能のボタンを押したときに出る）
const 頼む = (操作, 材料) => new Promise((ok) => chrome.runtime.sendMessage({ 種類: '小窓', 操作, 材料 }, (r) => ok(r || { ok: false })));

function 行(文, 右) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = 文;
    li.append(a);
    if (右) li.append(右);
    return li;
}

async function 描く() {
    const 様 = await 頼む('ようす');
    const 状態 = document.getElementById('状態');
    const 切り替え = document.getElementById('切り替え');
    if (様.止めている) {
        状態.textContent = '止めてあります（一切動きません）';
        状態.className = '状態 止め';
        切り替え.textContent = '動かす';
    } else {
        状態.textContent = '動かせます' + (様.作業中 ? `（作業中: ${String(様.作業中.題 || '').slice(0, 24)}）` : '');
        状態.className = '状態 動く';
        切り替え.textContent = '止める';
    }

    const 記録 = (await 頼む('記録')).記録 || [];
    const 箱 = document.getElementById('記録');
    箱.textContent = '';
    if (!記録.length) 箱.append(行('まだありません'));
    記録.slice(-10).reverse().forEach((x) => {
        const 時 = new Date(x.とき).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        箱.append(行(`${時} ${x.ok ? '✓' : '×'} ${x.操作} ${x.先 || ''}`));
    });

    const 入 = await 頼む('入り口');
    const 入箱 = document.getElementById('入り口');
    入箱.textContent = '';
    (入.既定 || []).forEach((x) => 入箱.append(行(x + '（いつも）')));
    (入.足した || []).forEach((x) => {
        const 外す = document.createElement('button');
        外す.textContent = '外す';
        外す.addEventListener('click', async () => { await 頼む('入り口を外す', { 出どころ: x }); 描く(); });
        入箱.append(行(x, 外す));
    });
}

document.getElementById('切り替え').addEventListener('click', async () => {
    const 様 = await 頼む('ようす');
    await 頼む(様.止めている ? '動かす' : '止める');
    描く();
});

document.getElementById('足す').addEventListener('click', async () => {
    const r = await 頼む('入り口を足す', { 住所: document.getElementById('住所').value });
    document.getElementById('知らせ').textContent = r.訳 || '';
    if (r.ok) document.getElementById('住所').value = '';
    描く();
});

描く();
