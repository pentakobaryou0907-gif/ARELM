/**
 * バックアップの画面（設定ページ）
 *
 * 控えを取る・戻す本体は server/バックアップ.js。ここは画面だけ。
 * ログインの入場券を使う部品（アカウントAPI・行を作る）は
 * js/modules/アカウント画面.js のものを使う（先に読み込まれる）。
 */

async function バックアップAPI(パス, 本文) {
    return アカウントAPI(パス, 本文);
}

function バックアップの日時(iso) {
    return iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

async function renderバックアップ() {
    const 箱 = document.getElementById('backup-panel');
    if (!箱) return;
    箱.textContent = '';

    const s = await バックアップAPI('/api/backup/status');
    if (!s.ok) {
        箱.appendChild(行を作る('p', s.訳 || '読み込めませんでした', 'hint'));
        return;
    }

    const 最新文 = s.最新
        ? `最後の控え: ${バックアップの日時(s.最新.作成)}（${s.最新.種類}）`
        : 'まだ控えがありません';
    箱.appendChild(行を作る('p', 最新文, s.古すぎる ? 'guard-off' : 'guard-on'));
    if (s.古すぎる) {
        箱.appendChild(行を作る('p', '2日以上、控えが取れていません。「今すぐ控えを取る」を押してください。', 'hint'));
    }
    箱.appendChild(行を作る('p', `置き場: ${s.場所}${s.iCloudか ? '（iCloud Drive。Mac以外にも複製されます）' : '（このMacの中だけです）'}`, 'hint'));
    箱.appendChild(行を作る('p', '毎日1回、自動で控えを取ります。控えは自動では消えません。アカウント・合言葉は控えに入れていません。', 'hint'));

    const 今 = 行を作る('button', '今すぐ控えを取る', 'btn btn-primary');
    今.type = 'button';
    今.addEventListener('click', async () => {
        今.disabled = true;
        const r = await バックアップAPI('/api/backup/now', {});
        showNotification(r.ok ? `控えを取りました（${r.ファイル数}ファイル）` : (r.訳 || '取れませんでした'), r.ok ? 'success' : 'error');
        renderバックアップ();
    });
    箱.appendChild(今);

    if (s.一覧.length) {
        箱.appendChild(行を作る('h4', '戻す'));
        const ul = document.createElement('ul');
        ul.className = 'monitor-list';
        s.一覧.slice(0, 10).forEach((x) => {
            const li = 行を作る('li', `${バックアップの日時(x.作成)}（${x.種類}・${x.ファイル数}ファイル） `, 'monitor-item');
            const b = 行を作る('button', 'この控えに戻す', 'btn btn-sm btn-secondary');
            b.type = 'button';
            b.addEventListener('click', async () => {
                if (!confirm(`${バックアップの日時(x.作成)} の控えに、商品・タスク・売上などのデータを戻します。\n\n`
                    + '戻す直前の状態も、自動で控えを取ってから戻します（あとで元に戻せます）。\n続けますか？')) return;
                b.disabled = true;
                const r = await バックアップAPI('/api/backup/restore', { 名前: x.名前 });
                if (r.ok) {
                    showNotification('戻しました。画面を読み込み直します', 'success');
                    setTimeout(() => location.reload(), 900);
                } else {
                    showNotification(r.訳 || '戻せませんでした', 'error');
                    b.disabled = false;
                }
            });
            li.appendChild(b);
            ul.appendChild(li);
        });
        箱.appendChild(ul);
        箱.appendChild(行を作る('p', '戻せるのは、商品・タスク・売上などのアプリのデータと、ひらめき箱です。自作AIの学習ファイルは、動いているAIが書き換えるため自動では戻しません（控えの中に残してあります）。', 'hint'));
    }

    const 変える = document.createElement('form');
    変える.className = 'login-form';
    const 入力 = document.createElement('input');
    入力.type = 'text';
    入力.placeholder = '置き場を変える場合: /Users/… から始まる場所';
    入力.setAttribute('aria-label', '控えの置き場');
    const 決める = 行を作る('button', '置き場を変える', 'btn btn-sm btn-secondary');
    決める.type = 'submit';
    変える.append(入力, 決める);
    変える.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!入力.value.trim()) return;
        const r = await バックアップAPI('/api/backup/location', { 場所: 入力.value.trim() });
        showNotification(r.訳 || '', r.ok ? 'success' : 'error');
        if (r.ok) renderバックアップ();
    });
    箱.appendChild(変える);
}

window.renderバックアップ = renderバックアップ;
