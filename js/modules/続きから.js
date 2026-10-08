/**
 * 続きから — 別の端末で見ていた画面を、この端末で続ける
 *
 * Macで「在庫」を見ていて、あとでiPadを開いたら、
 * 「Macで見ていた在庫の続きを開きますか？」と出す。
 * 開いた画面の名前を、端末をまたいで同期される記録に残しておくだけ
 * （同期の仕組み js/core/sync.js をそのまま使う）。
 *
 * 画面の名前だけを覚える。入力途中の文章などは覚えない。
 */

const 続きの鍵 = 'areglm_resume';
const 端末の目印 = 'areglm_device_id';     // 端末ごと（同期しない）
const 続きの有効時間 = 12 * 60 * 60 * 1000;

const 続きの画面名 = {
    dashboard: 'ホーム', inventory: '在庫', brands: 'ブランド', sns: 'SNS', develop: '開発',
    settings: '設定', mainai: 'エージェント', remote: '遠隔操作', tasks: 'タスク', chat: 'チャット',
};

function 続き用の端末名() {
    const ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)) return 'iPad';
    if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windowsのパソコン';
    if (/Android/.test(ua)) return 'Android';
    return '別の端末';
}

function この端末のidを読む() {
    let id = localStorage.getItem(端末の目印);
    if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(端末の目印, id);
    }
    return id;
}

function 続きを覚える(画面) {
    if (!画面 || 画面 === 'login') return;
    localStorage.setItem(続きの鍵, JSON.stringify({
        page: 画面, at: Date.now(), device: この端末のidを読む(), label: 続き用の端末名(),
    }));
}

/** ログイン後に一度だけ、別の端末の続きを案内する */
function 続きを案内する() {
    // ログイン画面の上には出さない
    if (document.getElementById('main-app')?.style.display === 'none') return;
    if (sessionStorage.getItem('areglm_resume_offered') === '1') return;
    let 記録;
    try { 記録 = JSON.parse(localStorage.getItem(続きの鍵) || 'null'); } catch { 記録 = null; }
    if (!記録 || 記録.device === この端末のidを読む()) return;
    if (Date.now() - 記録.at > 続きの有効時間) return;
    if (!document.getElementById(`${記録.page}-page`) || 記録.page === 'dashboard') return;
    if (document.getElementById('resume-offer')) return;
    sessionStorage.setItem('areglm_resume_offered', '1');

    const 名 = 続きの画面名[記録.page] || 記録.page;
    const 枠 = document.createElement('div');
    枠.id = 'resume-offer';
    枠.setAttribute('role', 'dialog');
    枠.style.cssText = 'position:fixed;left:12px;right:12px;bottom:16px;z-index:10000;max-width:420px;margin:0 auto;'
        + 'background:#fff;color:#111;border-radius:12px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,.3)';
    const 文 = document.createElement('p');
    文.style.margin = '0 0 10px';
    文.textContent = `${記録.label || '別の端末'}で見ていた「${名}」の続きを開きますか？`;
    const 並び = document.createElement('div');
    並び.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const いいえ = document.createElement('button');
    いいえ.type = 'button';
    いいえ.className = 'btn btn-sm btn-secondary';
    いいえ.textContent = 'このまま';
    いいえ.addEventListener('click', () => 枠.remove());
    const はい = document.createElement('button');
    はい.type = 'button';
    はい.className = 'btn btn-sm btn-primary';
    はい.textContent = `${名}を開く`;
    はい.addEventListener('click', () => {
        枠.remove();
        if (typeof switchPage === 'function') switchPage(記録.page);
    });
    並び.append(いいえ, はい);
    枠.append(文, 並び);
    document.body.appendChild(枠);
    setTimeout(() => 枠.remove(), 20000);
}

function init続きから() {
    // 画面を切り替えるたびに、いまの画面を覚える（他の部品も同じ関数を包んでいるので、重ね掛けしても元を呼ぶ）
    if (typeof window.switchPage === 'function' && !window.switchPage.__続きつき) {
        const 元 = window.switchPage;
        const 包み = function (画面, ...残り) {
            const r = 元.call(this, 画面, ...残り);
            続きを覚える(画面);
            return r;
        };
        包み.__続きつき = true;
        window.switchPage = 包み;
    }
}

window.init続きから = init続きから;
window.続きを案内する = 続きを案内する;
window.続き用の端末名 = 続き用の端末名;
