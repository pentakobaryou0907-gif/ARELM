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

/**
 * 🌍 どこでも（外出先・別のWi-Fi）
 *
 * Tailscale（本人の端末だけをつなぐ閉じた回線）を使い、同じWi-Fiの外からも開けるようにする。
 * ボタン1つで: Tailscaleを起こす → ログインのリンクを出す → ログインできたら自動で出す。
 * ログインそのもの（アカウントでの認証）は、ご自身で行う。設定を変えられるのは、このMacの画面だけ。
 */
let どこでもの見張り = null;

/**
 * 長いアドレスを、打たずに他の端末へ渡す部品。
 * 「コピー」（ユニバーサルクリップボード・メモ・メールで送れる）と、
 * 「QRコード」（その端末のカメラで読むだけ）を付ける。QRはこの端末の中で作り、外へは何も送らない。
 */
function 住所を渡せる行にする(住所, 文字の指定) {
    const 箱 = document.createElement('div');
    const 字 = document.createElement('p');
    字.textContent = 住所;
    字.style.cssText = 文字の指定 || 'user-select:all;word-break:break-all;font-weight:600';
    const 並び = document.createElement('div');
    並び.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px';
    const コピー = document.createElement('button');
    コピー.type = 'button';
    コピー.className = 'btn btn-sm btn-secondary';
    コピー.textContent = 'コピー';
    コピー.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(住所); コピー.textContent = 'コピーしました'; }
        catch { コピー.textContent = '長押しで選んでコピー'; }
        setTimeout(() => { コピー.textContent = 'コピー'; }, 2500);
    });
    const QR枠 = document.createElement('div');
    QR枠.hidden = true;
    QR枠.style.cssText = 'background:#fff;padding:12px;border-radius:8px;width:fit-content;max-width:100%';
    const QR = document.createElement('button');
    QR.type = 'button';
    QR.className = 'btn btn-sm btn-secondary';
    QR.textContent = 'QRコードを出す';
    QR.addEventListener('click', () => {
        if (QR枠.hidden && !QR枠.firstChild) {
            try {
                const q = qrcode(0, 'M');
                q.addData(住所);
                q.make();
                // SVGはこの端末の中で組み立てた文字列だけ（外から来た文字は入らない）
                QR枠.innerHTML = q.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
                const svg = QR枠.querySelector('svg');
                if (svg) svg.style.cssText = 'width:min(260px,70vw);height:auto;display:block';
            } catch { QR枠.textContent = 'QRコードを作れませんでした'; }
        }
        QR枠.hidden = !QR枠.hidden;
        QR.textContent = QR枠.hidden ? 'QRコードを出す' : 'QRコードを隠す';
    });
    並び.append(コピー, QR);
    箱.append(字, 並び, QR枠);
    return 箱;
}

async function どこでもの枠を作る(再描画) {
    if (どこでもの見張り) { clearInterval(どこでもの見張り); どこでもの見張り = null; }
    const 状 = typeof アカウントAPI === 'function' ? await アカウントAPI('/api/anywhere/status') : { ok: false };
    const 枠 = 端末の枠('🌍 どこでも（外出先・別のWi-Fi）', '', false);
    const 文 = 枠.querySelector('p');
    const 手順 = (行たち) => {
        const ol = document.createElement('ol');
        行たち.forEach((t) => ol.appendChild(render三端末の行('li', t)));
        return ol;
    };
    const 住所の行 = (住所) => 住所を渡せる行にする(住所);

    if (!状.ok) {
        文.textContent = 状.訳 || '様子を読めませんでした（ログインし直してください）';
        return 枠;
    }
    if (!状.入っている) {
        文.textContent = 'Tailscale がこのMacに入っていません。';
        枠.appendChild(render三端末の行('p', 'ターミナルで brew install tailscale を実行すると入ります（そのあと、この画面を開き直してください）。', 'hint'));
        return 枠;
    }

    const 出している = !!状.公開中;
    文.textContent = 出している
        ? '使えます。Tailscale につないだ、ご自身の端末なら、どこからでも開けます。'
        : `いまは、まだ外から開けません（Tailscale: ${状.段階}）`;
    文.className = 出している ? 'guard-off' : 'guard-on';

    if (出している) {
        枠.appendChild(render三端末の行('p', '外から開くアドレス:'));
        枠.appendChild(住所の行(状.公開中));
    }

    const 進み = render三端末の行('p', '', 'hint');
    const リンク欄 = document.createElement('p');

    const 最後まで進める = async () => {
        // 段階1: 起こして、ログインのリンクをもらう
        進み.textContent = 'Tailscale を起こしています…';
        const a = await アカウントAPI('/api/anywhere/start', {});
        if (!a.ok) { 進み.textContent = a.訳 || '始められませんでした'; return; }

        if (!a.済み) {
            const 場所 = document.createElement('a');
            場所.href = a.認証URL;
            場所.target = '_blank';
            場所.rel = 'noopener noreferrer';
            場所.textContent = '👉 ここを開いて、Tailscale にログイン（ご自身のアカウントで）';
            場所.className = 'btn btn-sm btn-secondary';
            リンク欄.textContent = '';
            リンク欄.appendChild(場所);
            進み.textContent = 'ログインが終わるのを待っています…（このまま、この画面を開いておいてください）';
            // ログインが済んだら、自動で次へ（最大15分）
            const 待つ上限 = Date.now() + 15 * 60 * 1000;
            await new Promise((resolve) => {
                どこでもの見張り = setInterval(async () => {
                    const t = await アカウントAPI('/api/anywhere/status');
                    if (t.ok && t.段階 === 'つながっている') { clearInterval(どこでもの見張り); どこでもの見張り = null; resolve(true); }
                    else if (Date.now() > 待つ上限) { clearInterval(どこでもの見張り); どこでもの見張り = null; resolve(false); }
                }, 3000);
            }).then((済) => { if (!済) throw new Error('時間切れ'); }).catch(() => { 進み.textContent = 'ログインが確認できませんでした。もう一度、ボタンを押してください。'; throw null; });
            リンク欄.textContent = '';
        }

        // 段階2: 出す
        進み.textContent = '外から開けるようにしています…';
        const b = await アカウントAPI('/api/anywhere/enable', {});
        if (b.ok) { showNotification?.('どこでも使えるようになりました', 'success'); 再描画(); return; }
        if (b.設定が要る && b.リンク) {
            const 場所 = document.createElement('a');
            場所.href = b.リンク; 場所.target = '_blank'; 場所.rel = 'noopener noreferrer';
            場所.textContent = '👉 ここを開いて、Tailscale の HTTPS（serve）を1回だけ許す';
            場所.className = 'btn btn-sm btn-secondary';
            リンク欄.textContent = '';
            リンク欄.appendChild(場所);
        }
        進み.textContent = b.訳 || '出せませんでした';
    };

    if (状.Mac本体から) {
        const ボタン = render三端末の行('button', 出している ? '外から開けるのをやめる' : (状.段階 === 'つながっている' ? '外から開けるようにする' : '🌍 どこでも使えるようにする'), 'btn btn-secondary');
        ボタン.type = 'button';
        ボタン.addEventListener('click', async () => {
            ボタン.disabled = true;
            try {
                if (出している) {
                    const r = await アカウントAPI('/api/anywhere/disable', {});
                    showNotification?.(r.訳 || '', r.ok ? 'success' : 'error');
                    再描画();
                } else {
                    await 最後まで進める();
                }
            } catch { /* 進みの欄に理由を出してある */ }
            ボタン.disabled = false;
        });
        枠.append(ボタン, 進み, リンク欄);
    } else {
        枠.appendChild(render三端末の行('p', '設定を変えるのは、このMacの画面からだけです（外から勝手に変えられないようにするため）。', 'hint'));
    }

    if ((状.端末たち || []).length) {
        枠.appendChild(render三端末の行('h5', 'つながっている、ご自身の端末'));
        状.端末たち.forEach((x) => 枠.appendChild(render三端末の行('p', `${x.オンライン ? '🟢' : '⚪'} ${x.名前}（${x.OS || '?'}）`)));
    }

    枠.appendChild(render三端末の行('h5', 'iPad・Windows・iPhone を、外でも使えるようにする'));
    枠.appendChild(手順([
        'その端末に Tailscale のアプリを入れる（iPad・iPhone: App Storeで「Tailscale」／Windows: tailscale.com/download）',
        'Macと同じアカウントでログインする（アプリを開いて、ログインするだけです）',
        '上の「外から開くアドレス」を、その端末のブラウザで開く → 「Macで許可してもらう」→ Macの画面で許可',
    ]));
    枠.appendChild(render三端末の行('p', 'Mac が起きていて、ARELM が動いていれば、どこからでも使えます（Mac の電源が切れていると、開けません）。', 'hint'));
    return 枠;
}

/**
 * 📍 ARELMが入っている端末と、その場所
 *
 * 「このパソコンにARELMが入っているのか、どこにあるのか」が、どこにも出ていなかった。
 * Macのアプリはサーバー自身の置き場所から、Windowsはインストーラーの報告から、
 * iPadなどはホーム画面のアイコンから開いた記録から、分かる範囲を出す（分からないものは、分からないと書く）。
 */
async function 端末の場所の枠を作る() {
    const 枠 = 端末の枠('📍 ARELMが入っている端末と、その場所', '', true);
    const 文 = 枠.querySelector('p');
    const r = typeof アカウントAPI === 'function' ? await アカウントAPI('/api/devices/list') : { ok: false };
    if (!r.ok) { 文.textContent = r.訳 || '読めませんでした（ログインし直してください）'; return 枠; }
    文.textContent = 'アイコンの場所と、最後にアイコンから開いた日時です。';
    const 日時 = (iso) => iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const 場所の行 = (t) => { const p = render三端末の行('p', t); p.style.cssText = 'user-select:all;word-break:break-all;font-size:.8rem;margin:.1rem 0 .1rem 1rem'; return p; };

    // Mac
    const mac = render三端末の行('h5', '💻 Mac（アプリ）' + (r.この端末 === 'this-mac' ? '　← いま見ている端末' : ''));
    枠.appendChild(mac);
    if (r.Macのアプリ.デスクトップ) { 枠.appendChild(render三端末の行('p', 'デスクトップの「ARELM」')); 枠.appendChild(場所の行(r.Macのアプリ.デスクトップ)); }
    if (r.Macのアプリ.本体) { 枠.appendChild(render三端末の行('p', '本体（アプリの中に、このツール一式）')); 枠.appendChild(場所の行(r.Macのアプリ.本体)); }

    // ほかの端末
    const ほか = r.一覧.filter((d) => d.id !== 'this-mac');
    if (!ほか.length) 枠.appendChild(render三端末の行('p', 'ほかの端末の記録は、まだありません。', 'hint'));
    ほか.forEach((d) => {
        const 種類 = d.種類 || '';
        const 絵 = /iPad|iPhone/.test(種類) ? '📱' : (/Windows/.test(種類) ? '🖥' : '🔹');
        枠.appendChild(render三端末の行('h5', `${絵} ${d.名前}${種類 && !d.名前.includes(種類) ? `（${種類}）` : ''}${r.この端末 === d.id ? '　← いま見ている端末' : ''}`));
        if (d.入れた場所) {
            枠.appendChild(render三端末の行('p', `入っています（${日時(d.入れた日)}に入れた）`, 'guard-off'));
            if (d.入れた場所.デスクトップ) { 枠.appendChild(render三端末の行('p', 'デスクトップのアイコン')); 枠.appendChild(場所の行(d.入れた場所.デスクトップ)); }
            if (d.入れた場所.スタートメニュー) { 枠.appendChild(render三端末の行('p', 'スタートメニュー')); 枠.appendChild(場所の行(d.入れた場所.スタートメニュー)); }
            if (d.入れた場所.本体のフォルダ) { 枠.appendChild(render三端末の行('p', '起動用のファイルの置き場')); 枠.appendChild(場所の行(d.入れた場所.本体のフォルダ)); }
        } else if (d.アプリとして最後に開いた) {
            枠.appendChild(render三端末の行('p', `入っています（ホーム画面・デスクトップのアイコンから、${日時(d.アプリとして最後に開いた)}に開いた）`, 'guard-off'));
            if (/iPad|iPhone/.test(種類) || d.名前 === 'Mac') 枠.appendChild(場所の行('ホーム画面の「ARELM」'));
        } else {
            枠.appendChild(render三端末の行('p', d.消した日 ? `消しました（${日時(d.消した日)}）` : 'アイコンから開いた記録はありません（ブラウザで開いただけ・まだ入っていない）', 'guard-on'));
        }
        枠.appendChild(render三端末の行('p', `最後に開いた: ${日時(d.最後に開いた)}`, 'hint'));
    });
    枠.appendChild(render三端末の行('p', 'iPadは、Safariが自分を「Mac」と名乗るため、名前が「Mac」と出ることがあります。', 'hint'));
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

    /* ---- 入っている端末と、その場所 ---- */
    箱.appendChild(await 端末の場所の枠を作る());

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

    /* ---- どこでも（外出先・別のWi-Fi） ---- */
    箱.appendChild(await どこでもの枠を作る(render三端末));

    /* ---- 開くアドレス ---- */
    if (d && (d['このMacの住所'] || []).length) {
        const 住 = 端末の枠('🌐 他の端末で開くアドレス（同じWi-Fiのとき）', 'iPadとWindowsは、これを開きます。', true);
        d['このMacの住所'].forEach((ip) => {
            住.appendChild(住所を渡せる行にする(`http://${ip}:${d['入口'] || 8080}`));
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
