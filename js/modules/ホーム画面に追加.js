/**
 * ホーム画面に追加（iPad・iPhone・パソコン）
 *
 * iPad/iPhone の Safari で ARELM を開いたとき、「共有ボタン → ホーム画面に追加」で、
 * アイコンを置いてアプリのように開ける。その手順を、その端末の画面の中で案内する。
 *
 * ・すでにホーム画面のアプリとして開いているときは、何も出さない
 * ・「もう出さない」を選んだ端末には、出さない（設定画面からいつでも手順を見られる）
 * ・案内の文は、その端末の種類（iPad・iPhone・Android・パソコン）に合わせる
 *
 * 外へは何も送らない。
 */

const 追加案内の鍵 = 'areglm_a2hs_dismissed';   // 端末ごと（同期しない）

function ホーム画面のアプリとして開いているか() {
    return navigator.standalone === true
        || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
}

function ホーム画面用の端末() {
    const ua = navigator.userAgent || '';
    const タッチ = (navigator.maxTouchPoints || 0) > 1;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && タッチ)) return 'iPad';     // iPadOSは、Macの名前で来ることがある
    if (/Android/.test(ua)) return 'Android';
    if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'その他';
}

/** その端末での、追加の手順（一行ずつ） */
function ホーム画面への手順(端末 = ホーム画面用の端末()) {
    if (端末 === 'iPad' || 端末 === 'iPhone') {
        return [
            '画面の上（iPad）または下（iPhone）にある「共有」ボタン（四角に上向きの矢印）をタップ',
            '出てきた一覧を下へ送り、「ホーム画面に追加」をタップ',
            '名前（ARELM）をそのままにして、右上の「追加」をタップ',
            'ホーム画面に「ARELM」のアイコンができます。次からは、これをタップするだけで開きます',
        ];
    }
    if (端末 === 'Android') {
        return ['Chromeの右上「⋮」をタップ', '「ホーム画面に追加」（または「アプリをインストール」）をタップ', '「追加」をタップ'];
    }
    if (端末 === 'Mac') {
        return ['Safariなら、メニューの「ファイル」→「Dockに追加…」', 'Chromeなら、右上「⋮」→「保存して共有」→「ショートカットを作成…」→「ウィンドウとして開く」にチェック'];
    }
    if (端末 === 'Windows') {
        return ['Chromeの右上「⋮」→「保存して共有」→「ショートカットを作成…」', '「ウィンドウとして開く」にチェックして「作成」', 'Edgeなら、右上「…」→「アプリ」→「このサイトをアプリとしてインストール」'];
    }
    return ['ブラウザのメニューから「ホーム画面に追加」（またはショートカットの作成）を選んでください'];
}

/** iPad・iPhone で、ブラウザのまま開いているとき、一度だけ案内する */
function ホーム画面への追加を案内する() {
    try {
        if (localStorage.getItem(追加案内の鍵) === '1') return;
    } catch { return; }
    const 端末 = ホーム画面用の端末();
    if (端末 !== 'iPad' && 端末 !== 'iPhone') return;           // パソコン・Androidは、設定画面の手順だけにする
    if (ホーム画面のアプリとして開いているか()) return;
    if (document.getElementById('main-app')?.style.display === 'none') return;
    // ほかの案内（指紋の登録・続きから）と重ならないよう、先に出ていれば待つ
    if (document.getElementById('passkey-offer') || document.getElementById('resume-offer')) {
        setTimeout(ホーム画面への追加を案内する, 8000);
        return;
    }
    if (document.getElementById('a2hs-offer')) return;

    const 枠 = document.createElement('div');
    枠.id = 'a2hs-offer';
    枠.setAttribute('role', 'dialog');
    枠.style.cssText = 'position:fixed;left:12px;right:12px;bottom:16px;z-index:10000;max-width:460px;margin:0 auto;'
        + 'background:#fff;color:#111;border-radius:12px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,.3)';
    const 題 = document.createElement('p');
    題.style.cssText = 'margin:0 0 6px;font-weight:600';
    題.textContent = `${端末}のホーム画面に、ARELMのアイコンを置けます`;
    const 手順 = document.createElement('ol');
    手順.style.cssText = 'margin:0 0 10px;padding-left:1.3em;font-size:.9rem';
    ホーム画面への手順(端末).forEach((t) => { const li = document.createElement('li'); li.textContent = t; 手順.appendChild(li); });
    const 並び = document.createElement('div');
    並び.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const あとで = document.createElement('button');
    あとで.type = 'button';
    あとで.className = 'btn btn-sm btn-secondary';
    あとで.textContent = '閉じる';
    あとで.addEventListener('click', () => 枠.remove());
    const もう = document.createElement('button');
    もう.type = 'button';
    もう.className = 'btn btn-sm btn-primary';
    もう.textContent = 'もう出さない';
    もう.addEventListener('click', () => { try { localStorage.setItem(追加案内の鍵, '1'); } catch { /* 無視 */ } 枠.remove(); });
    並び.append(あとで, もう);
    枠.append(題, 手順, 並び);
    document.body.appendChild(枠);
}

/** 設定画面の欄: この端末の様子と、手順 */
async function renderホーム画面に追加() {
    const 箱 = document.getElementById('a2hs-panel');
    if (!箱) return;
    箱.textContent = '';
    const 行 = (タグ, 文字, クラス) => { const e = document.createElement(タグ); e.textContent = 文字; if (クラス) e.className = クラス; return e; };
    const 端末 = ホーム画面用の端末();

    箱.appendChild(行('p', ホーム画面のアプリとして開いているか()
        ? `いま: ${端末}のホーム画面のアプリとして開いています。`
        : `いま: ブラウザで開いています（${端末}）。`, ホーム画面のアプリとして開いているか() ? 'guard-off' : 'guard-on'));

    箱.appendChild(行('h4', `${端末}で、ホーム画面に追加する手順`));
    const ol = document.createElement('ol');
    ホーム画面への手順().forEach((t) => ol.appendChild(行('li', t)));
    箱.appendChild(ol);

    // iPad・iPhone で開くときの、このMacのアドレス
    let 住所 = [];
    try {
        const d = await fetch('/api/other-devices', { cache: 'no-store' }).then((r) => r.json());
        住所 = (d['このMacの住所'] || []).map((ip) => `http://${ip}:${d['入口'] || 8080}`);
        if (d['Tailscaleの住所']) 住所.push(`http://${d['Tailscaleの住所']}:${d['入口'] || 8080}`);
    } catch { /* 取れなければ出さない */ }
    if (住所.length) {
        箱.appendChild(行('h4', 'iPad・iPhoneのSafariで開くアドレス（同じWi-Fiのとき）'));
        住所.forEach((a) => { const p = 行('p', a); p.style.cssText = 'user-select:all;word-break:break-all'; 箱.appendChild(p); });
        箱.appendChild(行('p', '最初に合言葉を聞かれます（Macで決めたもの）。そのあと、ユーザー名とパスワードでログインします。', 'hint'));
    }
    箱.appendChild(行('p', 'ホーム画面のアプリは、Safariとは別の入れ物で動きます。そのため、追加したあと、初めて開くときに、もう一度、合言葉とログインが要ります（1回だけ）。', 'hint'));
    箱.appendChild(行('p', '外出先など、別のWi-Fiや回線から開くには、Tailscaleの設定が要ります。', 'hint'));

    const 戻す = 行('button', '案内を、もう一度出す', 'btn btn-sm btn-secondary');
    戻す.type = 'button';
    戻す.addEventListener('click', () => { try { localStorage.removeItem(追加案内の鍵); } catch { /* 無視 */ } showNotification?.('次に開いたとき、案内を出します', 'success'); });
    箱.appendChild(戻す);
}

window.ホーム画面への追加を案内する = ホーム画面への追加を案内する;
window.renderホーム画面に追加 = renderホーム画面に追加;
window.ホーム画面への手順 = ホーム画面への手順;
