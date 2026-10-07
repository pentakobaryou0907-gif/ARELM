/**
 * 夜の当番（ホーム）― 寝ている間の点検と、朝の報告
 *
 * 画面を閉じた夜でも、サーバーが決まった時刻に、読むだけの点検（在庫・やること・制作の進捗・
 * バックアップ・動作）を進めて、結果を残す。ここは、その報告を見せて、時刻や通知を決める画面。
 *
 *   ・要確認があるときだけ目立たせる（毎日「異常なし」を出し続けると、見なくなるため）
 *   ・朝のはじめに、要確認があれば、1日に1回だけ知らせる（端末ごと）
 *   ・「いますぐ点検」で、いつでも同じ点検を行える
 *
 * 点検は読むだけ。直さない・消さない・外へ送らない。SUZURIの「商品を公開する」は押さない。
 * すべてこの端末の中だけで動く。
 */

const 夜の見た記録の鍵 = 'areglm_night_seen';   // 端末ごと（同期しない。js/core/sync.js の除外キー）

function 夜の行(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function 夜の時刻の文(iso) {
    return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function 夜の様子を読む() {
    if (typeof アカウントAPI !== 'function') return null;
    const r = await アカウントAPI('/api/night/status');
    return r && r.ok ? r : null;
}

async function render夜の当番() {
    const 箱 = document.getElementById('night-panel');
    if (!箱) return;
    const 様子 = await 夜の様子を読む();
    箱.textContent = '';
    if (!様子) {
        箱.appendChild(夜の行('p', '夜の当番の様子を読めません（ログインし直してください）', 'hint'));
        return;
    }

    const 設定 = 様子.設定;
    const 最新 = 様子.最新;

    if (!最新) {
        箱.appendChild(夜の行('p', 設定.有効
            ? `まだ報告がありません。毎日 ${設定.時刻} に、サーバーが点検します（Macが眠っているときは、起きてから）。`
            : '夜の当番は止めています。', 'hint'));
    } else {
        const 要確認 = 最新.要確認 || [];
        箱.appendChild(夜の行('p', `${最新.要約}`, 要確認.length ? 'guard-on' : 'guard-off'));
        箱.appendChild(夜の行('p',
            `点検した時刻: ${夜の時刻の文(最新.実行時刻)}（${最新.理由}${最新.遅れて実行した ? '。Macが眠っていて、起きてから実行しました' : ''}）`, 'hint'));

        if (要確認.length) {
            const ul = document.createElement('ul');
            ul.className = 'night-alerts';
            要確認.forEach((x) => ul.appendChild(夜の行('li', `${x.係}　${x.文}`)));
            箱.appendChild(ul);
        }

        const 詳しく = document.createElement('details');
        詳しく.className = 'night-detail';
        詳しく.appendChild(夜の行('summary', '係ごとの点検の中身'));
        (最新.係ごと || []).forEach((k) => {
            詳しく.appendChild(夜の行('h5', `${k.絵} ${k.係}`));
            k.件.forEach((x) => {
                const 印 = x.重さ === '要確認' ? '⚠ ' : (x.重さ === '良好' ? '✓ ' : '・');
                詳しく.appendChild(夜の行('p', 印 + x.文, x.重さ === '要確認' ? 'night-line alert' : 'night-line'));
            });
        });
        箱.appendChild(詳しく);
    }

    /* ---- いますぐ点検 ---- */
    const 今すぐ = 夜の行('button', 様子.実行中 ? '点検中…' : '🌙 いますぐ点検する', 'btn btn-secondary btn-sm');
    今すぐ.type = 'button';
    今すぐ.disabled = !!様子.実行中;
    今すぐ.addEventListener('click', async () => {
        今すぐ.disabled = true;
        今すぐ.textContent = '点検しています…';
        const r = await アカウントAPI('/api/night/run', {});
        if (r && r.ok) showNotification?.(r.報告.要約, r.報告.要確認.length ? 'warning' : 'success');
        else showNotification?.((r && r.訳) || '点検できませんでした', 'error');
        render夜の当番();
    });
    箱.appendChild(今すぐ);

    /* ---- 時刻・通知 ---- */
    const 設定の行 = document.createElement('div');
    設定の行.className = 'night-config';

    const 有効 = document.createElement('label');
    有効.className = 'checkbox-label';
    const 有効の欄 = document.createElement('input');
    有効の欄.type = 'checkbox';
    有効の欄.checked = 設定.有効;
    有効.append(有効の欄, document.createTextNode(' 毎日、夜に点検する'));

    const 時刻の欄 = document.createElement('input');
    時刻の欄.type = 'time';
    時刻の欄.value = 設定.時刻;
    時刻の欄.setAttribute('aria-label', '点検する時刻');

    const 通知 = document.createElement('label');
    通知.className = 'checkbox-label';
    const 通知の欄 = document.createElement('input');
    通知の欄.type = 'checkbox';
    通知の欄.checked = 設定.通知;
    通知.append(通知の欄, document.createTextNode(` 要確認があれば、${設定.通知の時刻} にMacの通知で知らせる`));

    const 保存 = async () => {
        const r = await アカウントAPI('/api/night/config', { 有効: 有効の欄.checked, 時刻: 時刻の欄.value, 通知: 通知の欄.checked });
        showNotification?.(r && r.ok ? '夜の当番の設定を保存しました' : '保存できませんでした', r && r.ok ? 'success' : 'error');
    };
    [有効の欄, 時刻の欄, 通知の欄].forEach((e) => e.addEventListener('change', 保存));
    設定の行.append(有効, 時刻の欄, 通知);
    箱.appendChild(設定の行);
    箱.appendChild(夜の行('p', 'この点検は、読むだけです（直さない・消さない・外へ送らない）。古いときだけ、バックアップを取ります。', 'hint'));
}

/** 朝のはじめに、要確認があれば、1日に1回だけ知らせる（端末ごと） */
async function 夜の報告を知らせる() {
    try {
        const 様子 = await 夜の様子を読む();
        const 最新 = 様子 && 様子.最新;
        if (!最新 || !(最新.要確認 || []).length) return;
        const 今日 = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem(夜の見た記録の鍵) === 今日) return;
        localStorage.setItem(夜の見た記録の鍵, 今日);
        showNotification?.(`夜のあいだの点検: ${最新.要約}。ホームで確かめてください`, 'warning');
    } catch { /* 知らせられなくても、報告はホームに残っている */ }
}

function init夜の当番() {
    render夜の当番();
    夜の報告を知らせる();
    // ホームに居る間だけ、ゆっくり読み直す（省電力のインターバル）
    (window.AReGLM_PERF ? AReGLM_PERF.smartInterval(render夜の当番, 5 * 60 * 1000) : { id: setInterval(render夜の当番, 5 * 60 * 1000) });
}

window.init夜の当番 = init夜の当番;
window.render夜の当番 = render夜の当番;
