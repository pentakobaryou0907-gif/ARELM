/**
 * 三端末（Mac・iPad・Windows）で使う（設定ページ）
 *
 * 目的: Mac・iPad・Windows の三つで、ARELMを開けて、それぞれのホーム画面にアイコンがある状態にする。
 * その進み具合と、次にすることを、一か所で見られるようにする。
 *
 *   ・Mac: デスクトップの「AReGLM」から開く（すでにある）
 *   ・iPad: ホーム画面アイコン用のプロファイルをダウンロードして入れる
 *   ・Windows: 専用アプリ（ZIP）をダウンロードして、インストーラーを動かす
 *
 * 他の端末で開くには「合言葉」と「ユーザー名・パスワード」が要る。思い出せないときのために、
 * このMacの画面から（ログインなしで使う設定のときだけ）、決め直せるようにしてある。
 * パスワードを私（開発側）が決めることは、しない。ここで、ご自身が入れる。
 */

async function 三端末の状況を読む() {
    try {
        const r = await fetch('/api/other-devices', { cache: 'no-store' });
        return r.ok ? await r.json() : null;     // 他の端末から開いているときは、読めない（Mac本体だけの口）
    } catch { return null; }
}

function render三端末の行(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function 三端末の入力欄(ラベル, 型, id, 初期値) {
    const 枠 = document.createElement('div');
    枠.className = 'form-group';
    const l = render三端末の行('label', ラベル);
    l.htmlFor = id;
    const i = document.createElement('input');
    i.type = 型;
    i.id = id;
    i.autocomplete = 型 === 'password' ? 'new-password' : 'off';
    if (初期値) i.value = 初期値;
    枠.append(l, i);
    return 枠;
}

function 端末の枠(題, 状態文, 良いか) {
    const 枠 = document.createElement('div');
    枠.className = 'login-form';
    枠.appendChild(render三端末の行('h4', 題));
    枠.appendChild(render三端末の行('p', 状態文, 良いか ? 'guard-off' : 'guard-on'));
    return 枠;
}

async function render三端末() {
    const 箱 = document.getElementById('devices-panel');
    if (!箱) return;
    箱.textContent = '';

    const d = await 三端末の状況を読む();
    const s = await fetch('/api/account/status', { cache: 'no-store' }).then((y) => y.json()).catch(() => ({}));
    const 許した = (d && d.許した端末) || [];
    const 数える = (語) => 許した.filter((x) => String(x.名前 || '').includes(語)).length;
    const いま = typeof ホーム画面用の端末 === 'function' ? ホーム画面用の端末() : '';

    /* ---- Mac ---- */
    const mac = 端末の枠('💻 Mac', 'このMacでは、デスクトップの「AReGLM」のアイコンから開けます。', true);
    mac.appendChild(render三端末の行('p', 'ドックに置きたいときは、そのアイコンをドックへドラッグしてください。', 'hint'));
    箱.appendChild(mac);

    /* ---- iPad ---- */
    const ipad数 = 数える('iPad');
    const ipad = 端末の枠('📱 iPad',
        d ? (ipad数 ? `届いています（合言葉を通したiPad: ${ipad数}台）` : 'まだ届いていません')
          : (いま === 'iPad' ? 'このiPadで開いています' : '（Macの画面で見ると、届いた様子が分かります）'),
        d ? ipad数 > 0 : いま === 'iPad');
    const ipadA = document.createElement('a');
    ipadA.href = '/ipad.mobileconfig';
    ipadA.textContent = '⬇ iPad用のアイコン（プロファイル）をダウンロード';
    ipadA.className = 'btn btn-sm btn-secondary';
    ipad.appendChild(ipadA);
    const ol1 = document.createElement('ol');
    ['iPadのSafariで、下の「開くアドレス」を開き、合言葉を入力し、ログインする',
        'この画面の上のボタンで、プロファイルをダウンロードして「許可」',
        '「設定」→「一般」→「VPNとデバイス管理」→「ARELM」→「インストール」（パスコードを入力。「未署名」と出ますが、そのままで大丈夫）',
        'ホーム画面に「ARELM」のアイコンができます'].forEach((t) => ol1.appendChild(render三端末の行('li', t)));
    ipad.appendChild(ol1);
    箱.appendChild(ipad);

    /* ---- Windows ---- */
    const win数 = 数える('Windows');
    const win = 端末の枠('🖥 Windows',
        d ? (win数 ? `届いています（合言葉を通したWindows: ${win数}台）` : 'まだ届いていません')
          : (いま === 'Windows' ? 'このWindowsで開いています' : '（Macの画面で見ると、届いた様子が分かります）'),
        d ? win数 > 0 : いま === 'Windows');
    const winA = document.createElement('a');
    winA.href = '/windows-kit.zip';
    winA.textContent = '⬇ Windows用のアプリ（ZIP）をダウンロード';
    winA.className = 'btn btn-sm btn-secondary';
    win.appendChild(winA);
    const ol2 = document.createElement('ol');
    ['Windowsのブラウザで、下の「開くアドレス」を開き、合言葉を入力し、ログインする',
        'この画面の上のボタンで、ZIPをダウンロードし、「すべて展開」',
        '展開したフォルダの「ARELM-install.bat」をダブルクリック（「保護されました」と出たら「詳細情報」→「実行」）',
        'デスクトップに「ARELM」のアイコンができます'].forEach((t) => ol2.appendChild(render三端末の行('li', t)));
    win.appendChild(ol2);
    箱.appendChild(win);

    /* ---- 開くアドレス ---- */
    if (d && (d['このMacの住所'] || []).length) {
        const 住 = 端末の枠('🌐 他の端末で開くアドレス（同じWi-Fiのとき）', 'iPadとWindowsは、これを開きます。', true);
        d['このMacの住所'].forEach((ip) => {
            const p = render三端末の行('p', `http://${ip}:${d['入口'] || 8080}`);
            p.style.cssText = 'user-select:all;word-break:break-all;font-weight:600';
            住.appendChild(p);
        });
        箱.appendChild(住);
    }

    /* ---- 入るために要るもの ---- */
    const 鍵 = 端末の枠('🔑 他の端末で入るために要るもの', '合言葉と、ユーザー名・パスワードの2つです（両方、他の端末で最初に1回だけ入れます）。', true);
    let 名前 = null;
    if (typeof アカウントAPI === 'function') {
        const me = await アカウントAPI('/api/account/me');
        if (me.ok) 名前 = me.名前;
    }
    鍵.appendChild(render三端末の行('p', 名前 ? `いまのユーザー名: ${名前}` : 'ユーザー名: （ログインすると表示されます）'));
    鍵.appendChild(render三端末の行('p', d ? (d['合言葉を決めてあるか'] ? '合言葉: 決めてあります（中身は、この画面にも出ません）' : '合言葉: まだ決めていません') : '合言葉: （Macの画面で見られます）'));
    箱.appendChild(鍵);

    /* ---- 決め直す（このMacの画面のとき・ログインなしのときだけ） ---- */
    if (s.ログインなし && d) {
        const 直 = 端末の枠('✏ 思い出せないとき: このMacで決め直す',
            'ご自身で、新しいものを決めてください（私が決めることはありません）。', true);

        const 合 = document.createElement('form');
        合.className = 'login-form';
        合.append(render三端末の行('h5', '合言葉を決め直す（8文字以上）'), 三端末の入力欄('新しい合言葉', 'password', 'dev-new-gate'));
        const 合ボタン = render三端末の行('button', '合言葉を決め直す', 'btn btn-secondary');
        合ボタン.type = 'submit';
        合.appendChild(合ボタン);
        合.addEventListener('submit', async (e) => {
            e.preventDefault();
            const 言葉 = document.getElementById('dev-new-gate').value;
            const r = await fetch('/api/other-devices', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 合言葉: 言葉 }),
            }).then((y) => y.json()).catch(() => ({ ok: false, 訳: '送れませんでした' }));
            showNotification?.(r.訳 || (r.ok ? '決めました' : '決められませんでした'), r.ok ? 'success' : 'error');
            if (r.ok) document.getElementById('dev-new-gate').value = '';
        });
        直.appendChild(合);

        const ログ = document.createElement('form');
        ログ.className = 'login-form';
        ログ.append(render三端末の行('h5', 'ユーザー名とパスワードを決め直す（パスワードは10文字以上）'),
            三端末の入力欄('ユーザー名', 'text', 'dev-new-name', 名前 || ''),
            三端末の入力欄('新しいパスワード', 'password', 'dev-new-pass'),
            三端末の入力欄('新しいパスワード（もう一度）', 'password', 'dev-new-pass2'));
        const ログボタン = render三端末の行('button', 'ユーザー名とパスワードを決め直す', 'btn btn-secondary');
        ログボタン.type = 'submit';
        ログ.appendChild(ログボタン);
        ログ.addEventListener('submit', async (e) => {
            e.preventDefault();
            const p1 = document.getElementById('dev-new-pass').value;
            if (p1 !== document.getElementById('dev-new-pass2').value) {
                showNotification?.('パスワードが一致しません', 'error');
                return;
            }
            const r = await アカウントAPI('/api/account/reset', { 名前: document.getElementById('dev-new-name').value.trim(), パスワード: p1 });
            if (r.ok && typeof 入場券を覚える === 'function') 入場券を覚える(r);
            showNotification?.(r.訳 || '', r.ok ? 'success' : 'error');
            if (r.ok) {
                ['dev-new-pass', 'dev-new-pass2'].forEach((id) => { document.getElementById(id).value = ''; });
                localStorage.setItem('areglm_login_name', r.名前);
                render三端末();
            }
        });
        直.appendChild(ログ);
        箱.appendChild(直);
    }
}

window.render三端末 = render三端末;
