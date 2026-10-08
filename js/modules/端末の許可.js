/**
 * 新しい端末の許可（Macの画面に出る知らせ）
 *
 * iPad・Windowsなど、新しい端末が「入りたい」と頼むと、4桁のコードつきの知らせがここに出る。
 * Macの前にいる本人が、相手の画面に出ているコードと同じか確かめて、「許可」か「断る」を押す。
 * 合言葉やパスワードを覚えていなくても、これで入れる。
 *
 * ・許せるのは、Mac本体の画面だけ（サーバー側でも、Mac本体のブラウザからしか受け付けない）
 * ・「ログインも省く」で許すと、その端末は、ユーザー名・パスワードなしで開ける（30日）
 * ・知らない端末のコードなら、断る（頼みは5分で消える）
 */

let 許可の確認を始めた = false;

async function 許可の知らせを確かめる() {
    if (document.hidden) return;
    if (document.getElementById('main-app')?.style.display === 'none') return;
    if (typeof アカウントAPI !== 'function') return;
    const r = await アカウントAPI('/api/pair/pending');
    if (!r.ok) return;
    const 出ている = new Set([...document.querySelectorAll('[data-pair-id]')].map((e) => e.dataset.pairId));
    const いま = new Set(r.待ち.map((x) => x.id));

    // 消えた頼み（時間切れ・決め済み）の知らせは、取り除く
    document.querySelectorAll('[data-pair-id]').forEach((e) => { if (!いま.has(e.dataset.pairId)) e.remove(); });

    r.待ち.filter((x) => !出ている.has(x.id)).forEach(知らせを出す);
}

function 知らせを出す(x) {
    let 台 = document.getElementById('pair-stack');
    if (!台) {
        台 = document.createElement('div');
        台.id = 'pair-stack';
        台.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10001;display:grid;gap:10px;max-width:380px';
        document.body.appendChild(台);
    }
    const 枠 = document.createElement('div');
    枠.dataset.pairId = x.id;
    枠.setAttribute('role', 'alertdialog');
    枠.style.cssText = 'background:#fff;color:#111;border-radius:12px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,.35)';

    const 題 = document.createElement('p');
    題.style.cssText = 'margin:0 0 4px;font-weight:700';
    題.textContent = `「${x.名前}」が、入りたがっています`;
    const コード = document.createElement('div');
    コード.style.cssText = 'font-size:2rem;letter-spacing:.3rem;font-weight:800;margin:2px 0';
    コード.textContent = x.code;
    const 注 = document.createElement('p');
    注.style.cssText = 'margin:0 0 10px;font-size:.85rem';
    注.textContent = '相手の画面に出ているコードと、同じですか？ 違う・知らない端末なら「断る」を押してください。';

    const 決める = async (許す, 省く) => {
        枠.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const r = await アカウントAPI('/api/pair/decide', { id: x.id, 許す, ログインも省く: 省く });
        showNotification?.(r.訳 || (r.ok ? '決めました' : '決められませんでした'), r.ok ? 'success' : 'error');
        枠.remove();
    };
    const ボタン = (文字, クラス, 押す) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = クラス;
        b.textContent = 文字;
        b.addEventListener('click', 押す);
        return b;
    };
    const 並び = document.createElement('div');
    並び.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    並び.append(
        ボタン('許可（ログインも省く）', 'btn btn-sm btn-primary', () => 決める(true, true)),
        ボタン('許可（ログインは必要）', 'btn btn-sm btn-secondary', () => 決める(true, false)),
        ボタン('断る', 'btn btn-sm btn-secondary', () => 決める(false, false)),
    );
    枠.append(題, コード, 注, 並び);
    台.appendChild(枠);
}

/** Mac本体の画面のときだけ、数秒おきに、頼みが来ていないか確かめる */
async function init端末の許可() {
    if (許可の確認を始めた) return;
    許可の確認を始めた = true;
    const s = await fetch('/api/account/status', { cache: 'no-store' }).then((y) => y.json()).catch(() => ({}));
    if (!s.本体から) return;               // 他の端末の画面では、許可の知らせは要らない
    const 確かめる = () => 許可の知らせを確かめる().catch(() => {});
    (window.AReGLM_PERF ? AReGLM_PERF.smartInterval(確かめる, 4000) : setInterval(確かめる, 4000));
    確かめる();
}

window.init端末の許可 = init端末の許可;
