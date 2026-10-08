/**
 * 設定の欄「☁ Mac無しで使う」（公開先＝GitHub Pages で開いたときだけ出す）
 *
 * 公開先で、端末同士のデータ共有（GitHubの非公開倉庫）とAI（Geminiの無料API）を使う準備をする。
 * 鍵とキーは、合言葉で閉じた端末の金庫にだけ置き、画面には二度と出さない。
 * 外へ出る先は、関所（外に出さない.js）の「本人が選んだ置き場」だけ。
 */

function Mac無しの部品(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function Mac無しのリンク(文字, 行き先) {
    const a = document.createElement('a');
    a.href = 行き先;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 文字;
    return a;
}

function Mac無しの入力欄(id, 見出し, 種類, 既定) {
    const 枠 = Mac無しの部品('div', null, 'form-group');
    const l = Mac無しの部品('label', 見出し);
    l.htmlFor = id;
    const i = document.createElement('input');
    i.id = id;
    i.type = 種類;
    i.autocomplete = 'off';
    i.spellcheck = false;
    if (既定) i.value = 既定;
    枠.append(l, i);
    return 枠;
}

function renderMac無しで使う() {
    const 枠 = document.getElementById('mac-free-section');
    const 箱 = document.getElementById('mac-free-panel');
    if (!枠 || !箱) return;
    if (!(typeof サーバーの無い公開先か === 'function' && サーバーの無い公開先か())) {
        Macのデータも共有する欄(枠, 箱);
        return;
    }
    枠.style.display = '';
    箱.textContent = '';

    const 倉庫 = 外の倉庫.設定();
    const 状 = Mac無しの部品('div', null, 'status-banner ' + (外の倉庫.使えるか() && 外のAI.使えるか() ? 'ok' : 'warn'));
    状.append(
        Mac無しの部品('p', 外の倉庫.使えるか()
            ? `データの共有: 使えます（GitHubの非公開倉庫 ${倉庫.持ち主}/${倉庫.倉庫}）`
            : 'データの共有: まだです（この端末の中だけに残ります）'),
        Mac無しの部品('p', 外のAI.使えるか() ? 'AI: 使えます（Gemini）' : 'AI: まだです'),
    );
    箱.appendChild(状);

    /* ---- データの共有（GitHub） ---- */
    箱.appendChild(Mac無しの部品('h4', '① データの共有（iPad・Windows・Macで同じデータ）'));
    const 手順 = Mac無しの部品('ol');
    const 一 = Mac無しの部品('li');
    一.append('データ用の非公開の倉庫を作る: ',
        Mac無しのリンク('倉庫を作る画面を開く', 'https://github.com/new?name=ARELM-data&visibility=private&description=ARELM%E3%81%AE%E3%83%87%E3%83%BC%E3%82%BF%EF%BC%88%E9%9D%9E%E5%85%AC%E9%96%8B%EF%BC%89'),
        '（名前は「ARELM-data」、「Private」のまま「Create repository」を押す）');
    const 二 = Mac無しの部品('li');
    二.append('その倉庫だけに使える鍵を作る: ',
        Mac無しのリンク('鍵を作る画面を開く', 'https://github.com/settings/personal-access-tokens/new?name=ARELM-data&description=ARELM%20data%20sync&expires_in=none&contents=write'),
        '（「Repository access」で「Only select repositories」→「ARELM-data」を選ぶ。「Contents」を「Read and write」にして「Generate token」。出てきた github_pat_… をコピー）');
    const 三 = Mac無しの部品('li', 'コピーした鍵を、下に貼って「保存して共有を始める」を押す');
    手順.append(一, 二, 三);
    箱.appendChild(手順);

    const 形 = document.createElement('form');
    形.className = 'login-form';
    形.append(
        Mac無しの入力欄('mac-free-gh-token', 'GitHubの鍵（github_pat_…）', 'password'),
        Mac無しの入力欄('mac-free-gh-repo', '倉庫の名前', 'text', (倉庫 && 倉庫.倉庫) || 'ARELM-data'),
    );
    const 保存 = Mac無しの部品('button', '保存して共有を始める', 'btn btn-primary');
    保存.type = 'submit';
    const 今 = Mac無しの部品('button', '今すぐ同期する', 'btn btn-secondary');
    今.type = 'button';
    const 結果 = Mac無しの部品('p', '', 'hint');
    形.append(保存, ' ', 今, 結果);
    形.addEventListener('submit', async (e) => {
        e.preventDefault();
        const 鍵 = document.getElementById('mac-free-gh-token').value.trim();
        const 名 = document.getElementById('mac-free-gh-repo').value.trim() || 'ARELM-data';
        if (!/^[A-Za-z0-9_.-]+$/.test(名)) { 結果.textContent = '倉庫の名前は、英数字と - _ . だけにしてください'; return; }
        if (!鍵 && !端末の金庫.入っているか('github')) { 結果.textContent = '鍵を貼ってください'; return; }
        保存.disabled = true;
        結果.textContent = '確かめています…';
        try {
            if (鍵) await 端末の金庫.入れる('github', 鍵);
            // 関所が /user と /user/repos を通せるよう、先に倉庫の名前だけ決める（持ち主は鍵から確かめる）
            localStorage.setItem(外の倉庫.設定の名, JSON.stringify({ 持ち主: '', 倉庫: 名 }));
            const 持ち主 = await 外の倉庫.準備する(名);
            document.getElementById('mac-free-gh-token').value = '';
            const 変わった = await サーバー無しで取り込み直す();
            結果.textContent = `つながりました（${持ち主}/${名}）。この端末のデータを倉庫へ送っています。`;
            showNotification('データの共有を始めました', 'success');
            if (変わった) setTimeout(() => location.reload(), 1500);
            else renderMac無しで使う();
        } catch (err) {
            // 失敗したら、関所の例外も閉じる（中途半端な設定で外へ出さない）
            localStorage.removeItem(外の倉庫.設定の名);
            結果.textContent = err.message;
        } finally {
            保存.disabled = false;
        }
    });
    今.addEventListener('click', async () => {
        if (!外の倉庫.使えるか()) { 結果.textContent = 'まだ、つながっていません'; return; }
        結果.textContent = '同期しています…';
        try {
            if (window.AReGLM_SYNC) await AReGLM_SYNC.今すぐ送る();
            const 変わった = await サーバー無しで取り込み直す();
            結果.textContent = 変わった ? '他の端末の変更を取り込みました。開き直します…' : '最新です';
            if (変わった) setTimeout(() => location.reload(), 1500);
        } catch (err) {
            結果.textContent = '同期できませんでした: ' + err.message;
        }
    });
    箱.appendChild(形);
    箱.appendChild(Mac無しの部品('p',
        'データは、あなたのGitHubの非公開の倉庫に置かれます（他の人には見えません）。書くたびに前の中身が履歴に残るので、消えません。'
        + 'Macのデータも共有するには、Macが起きているときに、Macの設定で同じ倉庫を選んでください。', 'hint'));

    /* ---- AI（Gemini） ---- */
    箱.appendChild(Mac無しの部品('h4', '② AI（Macが無いときの会話）'));
    const ai手順 = Mac無しの部品('p');
    ai手順.append('Googleの無料のキーを作る: ', Mac無しのリンク('キーを作る画面を開く', 'https://aistudio.google.com/apikey'),
        '（「APIキーを作成」→ 出てきた AIza… をコピーして、下に貼る）');
    箱.appendChild(ai手順);
    const ai形 = document.createElement('form');
    ai形.className = 'login-form';
    ai形.append(Mac無しの入力欄('mac-free-gemini', 'Geminiのキー（AIza…）', 'password'));
    const ai保存 = Mac無しの部品('button', '保存して確かめる', 'btn btn-primary');
    ai保存.type = 'submit';
    const ai結果 = Mac無しの部品('p', '', 'hint');
    ai形.append(ai保存, ai結果);
    ai形.addEventListener('submit', async (e) => {
        e.preventDefault();
        const キー = document.getElementById('mac-free-gemini').value.trim();
        if (!キー) { ai結果.textContent = 'キーを貼ってください'; return; }
        ai保存.disabled = true;
        ai結果.textContent = '確かめています…';
        try {
            await 端末の金庫.入れる('gemini', キー);
            localStorage.setItem(外のAI.設定の名, 'gemini');
            const r = await 外のAI.答える('「準備ができました」とだけ答えてください。', {}, '__確かめ');
            document.getElementById('mac-free-gemini').value = '';
            ai結果.textContent = 'つながりました。AIの答え: ' + r.answer;
            renderMac無しで使う();
        } catch (err) {
            localStorage.removeItem(外のAI.設定の名);
            ai結果.textContent = err.message;
        } finally {
            ai保存.disabled = false;
        }
    });
    箱.appendChild(ai形);
    箱.appendChild(Mac無しの部品('p',
        'Macが無いときの会話は、Googleの Gemini に送られます（カード番号・キー・メールアドレスらしきものは送りません）。'
        + '無料枠では、送った内容が Google のサービス改善に使われることがあります。'
        + '商品の登録などの「操作」は、Macの自作AIのときだけです。', 'hint'));
}

/**
 * Macで開いたときの欄: Macのデータも、公開先と同じ倉庫で共有する。
 * Macが起きている間、5分ごとに混ぜる（server/外の倉庫.js）。鍵はMacの server/data にだけ置く。
 * 鍵を預けられるのは、Mac本体の画面からだけ（遠くの端末から送っても、サーバーが断る）。
 */
async function Macのデータも共有する欄(枠, 箱) {
    let 様 = null;
    try { 様 = await fetch('/api/ext-store/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); } catch { 様 = null; }
    if (!様) { 枠.style.display = 'none'; return; }
    枠.style.display = '';
    箱.textContent = '';
    const 最後 = 様.最後;
    const 状 = Mac無しの部品('div', null, 'status-banner ' + (様.設定済み && (!最後 || 最後.ok) ? 'ok' : 'warn'));
    状.append(Mac無しの部品('p', 様.設定済み
        ? `Macのデータも共有しています（GitHubの非公開倉庫 ${様.持ち主}/${様.倉庫}）`
        : 'Macのデータは、まだ共有していません（公開先のiPad・Windowsからは見えません）'));
    if (最後) {
        状.append(Mac無しの部品('p', 最後.ok
            ? `最後に混ぜたとき: ${new Date(最後.とき).toLocaleString('ja-JP')}（取り込み ${最後.取り込んだ}件・送った ${最後.送った}件）`
            : `最後に混ぜたとき: うまくいきませんでした（${最後.訳}）`));
    }
    箱.appendChild(状);
    箱.appendChild(Mac無しの部品('p',
        '公開先（github.io）の「☁ Mac無しで使う」で作った倉庫と、同じ倉庫を選びます。'
        + 'Macが起きている間、Macのデータと倉庫を5分ごとに混ぜて同じにします（同じ項目は新しい方を残し、前の値は永久の記憶へ）。', 'hint'));
    const 形 = document.createElement('form');
    形.className = 'login-form';
    形.append(
        Mac無しの入力欄('mac-share-token', 'GitHubの鍵（github_pat_…。公開先で作ったものと同じでよい）', 'password'),
        Mac無しの入力欄('mac-share-repo', '倉庫の名前', 'text', 様.倉庫 || 'ARELM-data'),
    );
    const 保存 = Mac無しの部品('button', '保存して共有を始める', 'btn btn-primary');
    保存.type = 'submit';
    const 今 = Mac無しの部品('button', '今すぐ混ぜる', 'btn btn-secondary');
    今.type = 'button';
    const 結果 = Mac無しの部品('p', '', 'hint');
    形.append(保存, ' ', 今, 結果);
    形.addEventListener('submit', async (e) => {
        e.preventDefault();
        保存.disabled = true;
        結果.textContent = '確かめています…';
        try {
            const r = await fetch('/api/ext-store/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 鍵: document.getElementById('mac-share-token').value, 倉庫: document.getElementById('mac-share-repo').value }),
            }).then((y) => y.json());
            document.getElementById('mac-share-token').value = '';
            if (!r.ok) { 結果.textContent = r.訳 || '保存できませんでした'; return; }
            showNotification('Macのデータの共有を始めました', 'success');
            Macのデータも共有する欄(枠, 箱);
        } catch (err) {
            結果.textContent = '保存できませんでした: ' + err.message;
        } finally {
            保存.disabled = false;
        }
    });
    今.addEventListener('click', async () => {
        結果.textContent = '混ぜています…';
        try {
            const r = await fetch('/api/ext-store/sync-now', { method: 'POST' }).then((y) => y.json());
            if (!r.ok) { 結果.textContent = r.訳 || 'できませんでした'; return; }
            Macのデータも共有する欄(枠, 箱);
        } catch (err) {
            結果.textContent = 'できませんでした: ' + err.message;
        }
    });
    箱.appendChild(形);
}

document.addEventListener('DOMContentLoaded', () => {
    renderMac無しで使う();
});

window.renderMac無しで使う = renderMac無しで使う;
