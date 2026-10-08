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
// Macが止まっていても開ける、ARELMの入り口（GitHub Pages）。どの端末のホーム画面にも、ここを入れる
const 公開先の住所 = 'https://pentakobaryou0907-gif.github.io/ARELM/';
let ホーム画面の案内を待った回数 = 0;

// ChromeやEdgeが「アプリとして入れられます」と知らせてきたときの合図を預かる（押されたときに使う）
let アプリ入れの合図 = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    アプリ入れの合図 = e;
    document.querySelectorAll('[data-arelm-install]').forEach((b) => { b.hidden = false; b.style.display = ''; });
});
window.addEventListener('appinstalled', () => { アプリ入れの合図 = null; });

/** ブラウザの「アプリとして入れる」を出す（本人がボタンを押したときだけ） */
async function アプリとして入れる() {
    if (!アプリ入れの合図) return false;
    アプリ入れの合図.prompt();
    const 結果 = await アプリ入れの合図.userChoice.catch(() => null);
    アプリ入れの合図 = null;
    return !!結果 && 結果.outcome === 'accepted';
}

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
            'ホーム画面に「ARELM」ができます。中身は開くたびに自動で最新になります（入れ直しは要りません）',
        ];
    }
    if (端末 === 'Android') {
        return ['Chromeの右上「⋮」をタップ', '「ホーム画面に追加」（または「アプリをインストール」）をタップ', '「追加」をタップ'];
    }
    if (端末 === 'Mac') {
        return ['Safariなら、メニューの「ファイル」→「Dockに追加…」', 'Chromeなら、右上「⋮」→「保存して共有」→「ショートカットを作成…」→「ウィンドウとして開く」にチェック'];
    }
    if (端末 === 'Windows') {
        // 本物のアプリ(PWA)として入れる。一度入れれば、入れ直さなくても自動で最新になり、Macが落ちていても開く。
        // ただし、ブラウザは「https か localhost」でしかアプリとして入れさせない（http://192.168… では出ない）。
        return [
            // 公開先で開いているのに「どこでものアドレスを開く」と案内していた（公開先はもとから https）
            (typeof サーバーの無い公開先か === 'function' && サーバーの無い公開先か())
                ? 'いま開いているこのページ（https）のままでよい'
                : `ChromeかEdgeで、${公開先の住所} を開く（Macが止まっていても開けます）`,
            window.isSecureContext
                ? '下の「アプリとして入れる」を押す（出ないときは、右上「⋮」→「キャスト、保存、共有」→「ページをアプリとしてインストール」）'
                : 'いまは http で開いているため、アプリとして入れられません。https のアドレスで開き直してください（出来ないときだけ、下のZIPで入れられます。ZIPの方は、自動更新されません）',
            '入れたあとは、デスクトップやスタートメニューの「ARELM」を開くだけ。以後の更新は、自動です',
        ];
    }
    return ['ブラウザのメニューから「ホーム画面に追加」（またはショートカットの作成）を選んでください'];
}

/** iPad・iPhone で、ブラウザのまま開いているとき、一度だけ案内する */
function ホーム画面への追加を案内する() {
    try {
        if (localStorage.getItem(追加案内の鍵) === '1') return;
    } catch { return; }
    const 端末 = ホーム画面用の端末();
    // Macには、本物のアプリ（AReGLM.app）がある。
    // Windowsは、遠くから入れられない（ファイルの実行は、そのパソコンで行う必要がある）うえに、
    // 以前は案内が設定の奥にしか無く、「このパソコンにアプリが無い」と気づけなかった。
    if (端末 !== 'iPad' && 端末 !== 'iPhone' && 端末 !== 'Windows' && 端末 !== 'Android') return;
    if (ホーム画面のアプリとして開いているか()) return;
    // すでにこの端末に入っている（入れた場所の報告・アイコンから開いた記録がある）なら、勧めない
    if (typeof この端末に入っているか === 'function') {
        この端末に入っているか().then((入っている) => { if (!入っている) ホーム画面への追加を案内する続き(端末); });
        return;
    }
    ホーム画面への追加を案内する続き(端末);
}

function ホーム画面への追加を案内する続き(端末) {
    if (document.getElementById('main-app')?.style.display === 'none') return;
    // ほかの案内（指紋の登録・続きから・朝のあいさつ・エージェントの画面）と重ならないよう、先に出ていれば待つ。
    // スマホでは、開いた直後に案内が3つ重なり、画面が埋まっていたため
    const 他の案内 = document.getElementById('passkey-offer') || document.getElementById('resume-offer') || document.getElementById('briefing')
        || [...document.querySelectorAll('[role="dialog"]')].some((e) => e.id !== 'a2hs-offer' && e.offsetParent !== null);
    if (他の案内) {
        ホーム画面の案内を待った回数 = (ホーム画面の案内を待った回数 || 0) + 1;
        if (ホーム画面の案内を待った回数 <= 5) setTimeout(ホーム画面への追加を案内する, 8000);
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
    題.textContent = 端末 === 'Windows'
        ? 'このパソコンには、まだARELMのアプリが入っていません。一度入れれば、あとは自動で最新になります'
        : `${端末}のホーム画面に、ARELMのアイコンを置けます`;
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
    枠.append(題, 手順);
    // Macのアドレスで開いたままホーム画面に入れると、Macが止まっている間は開けない。公開先を勧める
    if (!(typeof サーバーの無い公開先か === 'function' && サーバーの無い公開先か())) {
        const 公開 = document.createElement('p');
        公開.style.cssText = 'margin:0 0 10px;font-size:.9rem';
        const a = document.createElement('a');
        a.href = 公開先の住所;
        a.textContent = 公開先の住所;
        a.rel = 'noopener';
        公開.append('Macが止まっていても開けるのは、こちらのアドレスです。開いてから、同じ手順で入れてください: ', a);
        枠.appendChild(公開);
    }
    if ((端末 === 'Windows' || 端末 === 'Android') && window.isSecureContext) {
        const 入れる = document.createElement('button');
        入れる.type = 'button';
        入れる.className = 'btn btn-sm btn-primary';
        入れる.textContent = 'アプリとして入れる';
        入れる.setAttribute('data-arelm-install', '1');
        入れる.hidden = !アプリ入れの合図;
        入れる.style.cssText = 'margin-bottom:10px';
        入れる.addEventListener('click', async () => { if (await アプリとして入れる()) 枠.remove(); });
        枠.appendChild(入れる);
    }
    // 公開先にはZIPが無い（押しても404になっていた）。ZIPは、Macから開いたときだけ
    if (端末 === 'Windows' && !(typeof サーバーの無い公開先か === 'function' && サーバーの無い公開先か())) {
        // 別の方法: ファイルで入れる（ブラウザのメニューが使えないとき）
        const 別 = document.createElement('p');
        別.style.cssText = 'margin:0 0 10px;font-size:.8rem;color:#555';
        const a = document.createElement('a');
        a.href = '/windows-kit.zip';
        a.textContent = 'Windows用のアプリ（ZIP）';
        別.append('⬇ ', a, '（ここを押すと、ダウンロードが始まります）');
        別.style.cssText = 'margin:0 0 10px;font-size:.95rem;font-weight:600';
        枠.appendChild(別);
    }
    枠.appendChild(並び);
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

    // ChromeやEdgeが入れられると言っているときは、ボタン1つで入れる
    if (!ホーム画面のアプリとして開いているか()) {
        const 入れる = 行('button', 'この端末にアプリとして入れる', 'btn btn-primary');
        入れる.type = 'button';
        入れる.setAttribute('data-arelm-install', '1');
        入れる.hidden = !アプリ入れの合図;
        入れる.addEventListener('click', async () => { if (await アプリとして入れる()) renderホーム画面に追加(); });
        箱.appendChild(入れる);
    }

    箱.appendChild(行('h4', `${端末}で、ホーム画面に追加する手順`));
    const ol = document.createElement('ol');
    ホーム画面への手順().forEach((t) => ol.appendChild(行('li', t)));
    箱.appendChild(ol);

    // ほかの端末へ: 公開先のアドレスを、打たずに渡す（QRをスマホ・iPadのカメラで読む）
    箱.appendChild(行('h4', 'ほかの端末（スマホ・iPad・Windows）にも入れる'));
    箱.appendChild(行('p', 'その端末で、このアドレスを開き、上と同じ手順でホーム画面に追加します。Macが止まっていても開け、一度入れれば、あとは自動で最新になります。', 'hint'));
    if (typeof 住所を渡せる行にする === 'function') 箱.appendChild(住所を渡せる行にする(公開先の住所));
    else { const p = 行('p', 公開先の住所); p.style.cssText = 'user-select:all;word-break:break-all;font-weight:600'; 箱.appendChild(p); }
    箱.appendChild(行('p', '初めて開く端末では、その端末用の合言葉を決めます。データを全部の端末でそろえるには、設定の「☁ Mac無しで使う」で、同じ倉庫と同じ同期の合言葉を入れます。', 'hint'));

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
    箱.appendChild(行('p', 'iPhone・iPadのホーム画面のアプリは、Safariとは別の入れ物で動きます。そのため、追加したあと、初めて開くときに、もう一度、合言葉が要ります（1回だけ）。', 'hint'));
    if (住所.length) 箱.appendChild(行('p', 'Macのアドレスを外出先（別のWi-Fiや回線）から開くには、Tailscaleの設定が要ります。公開先のアドレスなら、どこからでも開けます。', 'hint'));

    const 戻す = 行('button', '案内を、もう一度出す', 'btn btn-sm btn-secondary');
    戻す.type = 'button';
    戻す.addEventListener('click', () => { try { localStorage.removeItem(追加案内の鍵); } catch { /* 無視 */ } showNotification?.('次に開いたとき、案内を出します', 'success'); });
    箱.appendChild(戻す);
}

window.ホーム画面への追加を案内する = ホーム画面への追加を案内する;
window.renderホーム画面に追加 = renderホーム画面に追加;
window.ホーム画面への手順 = ホーム画面への手順;
window.公開先の住所 = 公開先の住所;
