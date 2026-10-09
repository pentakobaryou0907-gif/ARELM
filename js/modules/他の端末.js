/**
 * 他の端末から使う（スマホ・別のPC）
 *
 * ここで扱うのは、次の一点だけです。
 *
 *   他の端末から使うには、サーバーがネットワーク上で応答しなければならない。
 *   これは避けられない。
 *   そうすると、同じWi-Fiにいる人には「入口があること」は見える。
 *
 *   だから守りは「見えなくする」ではなく「Macで許可した端末しか入れない」になる。
 *   その違いを、画面にもはっきり書く。ごまかさない。
 *
 * 守りの中身（サーバー側の門番が行う）:
 *   ・この端末（127.0.0.1）は、いつでもそのまま使える
 *   ・外からは、まず同じLANの中かを見る。違えば断る
 *   ・LANの中でも、Macの前で本人が「許可」を押すまで、画面もJSもAPIも一切渡さない
 *   ・許した端末には印を渡す。使っている間は切れない（使わなければ30日で切れる）。1台ずつ外せる
 *
 * 本人の要望（2026-10-09）「合言葉やパスワードはなしにして、私のデバイスでしか開けないように」で、合言葉をやめた。
 */

async function 他の端末の状態を読む() {
    try {
        const r = await fetch('/api/other-devices', { cache: 'no-store' });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

async function render他の端末() {
    const 箱 = document.getElementById('other-devices');
    if (!箱) return;

    const d = await 他の端末の状態を読む();
    箱.innerHTML = '';

    if (!d) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '状態を読めませんでした。';
        箱.appendChild(p);
        return;
    }

    // --- いまの状態 ---
    const 状態 = document.createElement('p');
    状態.className = d.使う ? 'guard-off' : 'guard-on';
    状態.textContent = d.使う
        ? `他の端末から使えます（許した端末 ${d.許した端末.length}台）`
        : 'この端末の中だけで動いています（外からは一切入れません）';
    箱.appendChild(状態);

    if (d.使う && d.このMacの住所?.length) {
        const 入口 = document.createElement('p');
        入口.className = 'hint';
        入口.innerHTML = 'スマホや別のPCのChromeで、次を開いてください:<br>'
            + d.このMacの住所.map((ip) => `<b>http://${ip}:${d.入口}</b>`).join('<br>')
            + '<br>最初の一度だけ、その端末で「Macに許可を頼む」を押し、このMacで「許可」を押します。';
        箱.appendChild(入口);
    }

    // --- 正直に伝える ---
    const 断り = document.createElement('p');
    断り.className = 'notice-strict';
    断り.innerHTML = '<b>正直にお伝えします。</b>'
        + '他の端末から使うには、このMacがネットワーク上で応答する必要があります。'
        + 'そうすると、<b>同じWi-Fiにいる人には「入口があること」自体は見えます。</b>'
        + '見えたうえで、<b>このMacで「許可」を押した端末しか中へ入れない</b>、という形です。<br>'
        + '画面もJSもデータも、許可するまで一切渡しません。合言葉もパスワードも使いません。'
        + '知らない端末から頼みが来たら、「断る」を押してください。';
    箱.appendChild(断り);

    // 変えられるのは、Mac本体の画面だけ（サーバーも断る）。ほかの端末では、押しても断られるだけなので出さない
    if (d.Mac本体から === false) {
        const 注 = document.createElement('p');
        注.className = 'hint';
        注.textContent = 'この設定と、許した端末の一覧を変えられるのは、Mac本体の画面だけです。';
        箱.appendChild(注);
        return;
    }

    // --- 切り替え ---
    const 行 = document.createElement('div');
    行.className = 'guard-row';

    if (!d.使う) {
        const 開く = document.createElement('button');
        開く.type = 'button';
        開く.className = 'btn btn-sm btn-primary';
        開く.textContent = '他の端末から使えるようにする';
        開く.addEventListener('click', async () => {
            開く.disabled = true;
            開く.textContent = '設定しています…';
            const 中身 = { 使う: true };
            const r = await fetch('/api/other-devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(中身),
            });
            const 返 = await r.json();
            showNotification(返.訳, 返.ok ? 'success' : 'error');
            render他の端末();
        });

        行.appendChild(開く);
    } else {
        const 閉じる = document.createElement('button');
        閉じる.type = 'button';
        閉じる.className = 'btn btn-sm btn-secondary';
        閉じる.textContent = 'この端末の中だけに戻す';
        閉じる.addEventListener('click', async () => {
            const r = await fetch('/api/other-devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 使う: false }),
            });
            const 返 = await r.json();
            showNotification(返.訳, 返.ok ? 'success' : 'error');
            render他の端末();
        });
        行.appendChild(閉じる);

        const 忘れる = document.createElement('button');
        忘れる.type = 'button';
        忘れる.className = 'btn btn-sm btn-secondary';
        忘れる.textContent = '許した端末を全部外す';
        忘れる.addEventListener('click', async () => {
            if (!confirm('許した端末をすべて外します。次に使うときは、もう一度このMacで許可します。')) return;
            const r = await fetch('/api/other-devices/forget', { method: 'POST' });
            const 返 = await r.json();
            showNotification(返.訳, 返.ok ? 'success' : 'error');
            render他の端末();
        });
        行.appendChild(忘れる);
    }
    箱.appendChild(行);

    /* ==========================================================
       Tailscale専用の区画（同じWi-Fiには開けたくないが、
       Tailscaleでつないだ自分の端末だけは許したい、という人向け）
       ========================================================== */
    const 区切り = document.createElement('hr');
    箱.appendChild(区切り);

    const TS見出し = document.createElement('h4');
    TS見出し.textContent = 'Tailscale経由で使う（自分の端末だけに限定）';
    箱.appendChild(TS見出し);

    const TS説明 = document.createElement('p');
    TS説明.className = 'hint';
    TS説明.innerHTML = '<a href="https://tailscale.com/" target="_blank" rel="noopener">Tailscale</a>'
        + '（無料プランあり）を、このMacと使いたい端末の両方に入れて、'
        + '<b>同じアカウントでログイン</b>しておいてください（インストール・ログインはご本人の作業です）。'
        + 'それだけで「自分がログインした端末」だけがつながる、閉じたネットワークになります。'
        + '上の「他の端末から使う」とは<b>別に</b>切り替えられ、'
        + 'Tailscaleを入にしても同じWi-Fiには入口自体が見えません。';
    箱.appendChild(TS説明);

    const TS状態 = document.createElement('p');
    if (!d.Tailscaleの住所) {
        TS状態.className = 'hint';
        TS状態.textContent = 'いまTailscaleのアドレスが見つかりません（Tailscaleが起動していないか、未接続です）。';
    } else if (d.Tailscale使う) {
        TS状態.className = 'guard-off';
        TS状態.innerHTML = `Tailscale経由で使えます:<br><b>http://${d.Tailscaleの住所}:${d.アプリ入口}</b>`;
    } else {
        TS状態.className = 'guard-on';
        TS状態.textContent = `Tailscaleのアドレスは見つかっています（${d.Tailscaleの住所}）が、まだ許可していません。`;
    }
    箱.appendChild(TS状態);

    const TS行 = document.createElement('div');
    TS行.className = 'guard-row';

    if (!d.Tailscale使う) {
        const TS開く = document.createElement('button');
        TS開く.type = 'button';
        TS開く.className = 'btn btn-sm btn-primary';
        TS開く.textContent = 'Tailscaleから使えるようにする';
        TS開く.addEventListener('click', async () => {
            TS開く.disabled = true;
            TS開く.textContent = '設定しています…';
            const 中身 = { 'Tailscale使う': true };
            const r = await fetch('/api/other-devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(中身),
            });
            const 返 = await r.json();
            showNotification(返.訳, 返.ok ? 'success' : 'error');
            render他の端末();
        });

        TS行.appendChild(TS開く);
    } else {
        const TS閉じる = document.createElement('button');
        TS閉じる.type = 'button';
        TS閉じる.className = 'btn btn-sm btn-secondary';
        TS閉じる.textContent = 'Tailscale経由は止める';
        TS閉じる.addEventListener('click', async () => {
            const r = await fetch('/api/other-devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 'Tailscale使う': false }),
            });
            const 返 = await r.json();
            showNotification(返.訳, 返.ok ? 'success' : 'error');
            render他の端末();
        });
        TS行.appendChild(TS閉じる);
    }
    箱.appendChild(TS行);

    // --- 許した端末 ---
    if (d.許した端末?.length) {
        const 見出し = document.createElement('h4');
        見出し.textContent = '許した端末';
        箱.appendChild(見出し);
        const 一覧 = document.createElement('ul');
        一覧.className = 'guard-devices';
        const 送る = async (動き, 中身) => {
            const r = await fetch('/api/other-devices/' + 動き, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(中身) });
            const 返 = await r.json().catch(() => ({ ok: false, 訳: '返事を読めませんでした' }));
            showNotification(返.訳, 返.ok ? 'success' : 'error');
            render他の端末();
        };
        d.許した端末.forEach((x) => {
            const li = document.createElement('li');
            const 文 = document.createElement('span');
            文.textContent = `${x.名前}（${(x.許した日 || '').slice(0, 10)} 許可・最後 ${(x.最後 || x.許した日 || '').slice(0, 10)}）`;
            li.appendChild(文);
            // 前に「ログインは必要」で許した端末は、押すだけで入れるようにできる（パスワードをやめたため）
            if (!x.ログイン省略) {
                const 省く = document.createElement('button');
                省く.type = 'button';
                省く.className = 'btn btn-sm btn-secondary';
                省く.textContent = 'ログインなしで入れる';
                省く.addEventListener('click', () => 送る('skip-login', { id: x.id, 入: true }));
                li.append(' ', 省く);
            }
            const 外す = document.createElement('button');
            外す.type = 'button';
            外す.className = 'btn btn-sm btn-secondary';
            外す.textContent = '外す';
            外す.setAttribute('aria-label', `${x.名前}を外す`);
            外す.addEventListener('click', () => {
                if (!confirm(`「${x.名前}」を外します。もう一度使うときは、このMacで許可し直します。`)) return;
                送る('remove', { id: x.id });
            });
            li.append(' ', 外す);
            一覧.appendChild(li);
        });
        箱.appendChild(一覧);
    }

    // 「開き直してください」とは言わない。
    // こちらで入れ直せるなら、こちらでやる。
    const 入れ直す = document.createElement('button');
    入れ直す.type = 'button';
    入れ直す.className = 'btn btn-sm btn-secondary';
    入れ直す.textContent = '↻ いま反映する（入口を入れ直します）';
    入れ直す.addEventListener('click', async () => {
        入れ直す.disabled = true;
        入れ直す.textContent = '入れ直しています…';
        try {
            await fetch('/api/restart-gateway', { method: 'POST' });
        } catch { /* 落ちるので、返事が来ないことがある */ }

        // 立て直しを待ってから、画面も読み込み直す
        showNotification('入口を入れ直しています。数秒お待ちください。', 'info');
        let 回 = 0;
        const 待つ = setInterval(async () => {
            回 += 1;
            try {
                const r = await fetch('/api/other-devices', { cache: 'no-store' });
                if (r.ok) {
                    clearInterval(待つ);
                    location.reload();
                }
            } catch { /* まだ立ち上がっていない */ }
            if (回 > 20) {
                clearInterval(待つ);
                入れ直す.disabled = false;
                入れ直す.textContent = '↻ いま反映する（入口を入れ直します）';
                showNotification('立て直しに時間がかかっています。'
                    + 'アプリを開き直してください。', 'warning');
            }
        }, 1000);
    });
    箱.appendChild(入れ直す);

    const 注 = document.createElement('p');
    注.className = 'hint';
    注.textContent = '待ち受けの仕方が変わるので、入口を入れ直すと反映されます。'
        + '押せば、こちらで入れ直して画面も読み込み直します。';
    箱.appendChild(注);

    // Windows PCには、Mac用のアプリは動かない。専用の起動アプリを、ここから受け取れる。
    const win = document.createElement('p');
    const a = document.createElement('a');
    a.href = '/windows-kit.zip';
    a.download = 'ARELM-Windows.zip';
    a.textContent = '⬇ Windows PC用のアプリをダウンロード（ZIP）';
    win.appendChild(a);
    win.appendChild(document.createTextNode(' 展開して ARELM-install.bat を実行すると、デスクトップにARELMのアイコンができます。'));
    箱.appendChild(win);
}

function init他の端末() {
    if (document.getElementById('other-devices')) render他の端末();
}

window.init他の端末 = init他の端末;
window.render他の端末 = render他の端末;
