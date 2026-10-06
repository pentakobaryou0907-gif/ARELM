/**
 * 今日の運用（仕様書 1.2・5.1・7・10・14章）
 *
 *   ・今日の最低ライン … 商品1件・SNS1投稿・記録 が済んだかを、実際のデータから判定する
 *   ・今日やること     … 日次ルーティン（制作→投稿準備→記録→整理→学習→改善提案）を
 *                        目的／完了条件／必要素材／手順／チェック／ログ項目つきのタスクにする
 *   ・進捗ログと再開   … 「いまどこまで進んだか」を残し、開いたときに前回の続きを出す。
 *                        ログが壊れていたら、やることと活動の記録から現在地を推定して戻す
 *   ・投稿ログ         … 投稿した後に、日時・媒体・本文・タグ・素材・BGMの出所を残す
 *   ・更新記録         … ツールの更新内容と日付。大きな変更は確認済みの印が無いと残せない
 *
 * 投稿・公開・販売そのものは行わない。ここは記録と段取りだけ。
 * すべてこの端末の中だけで保存する。外部へは一切送らない。
 */

const 運用_進捗キー = 'areglm_progress_log';
const 運用_投稿ログキー = 'areglm_post_log';
const 運用_更新記録キー = 'areglm_update_log';

const 日次ルーティン = [
    {
        段: '制作', title: '今日の商品を1件つくる（デザイン→販売準備）', priority: 'high',
        目的: '毎日1件、売れる状態の商品を増やす',
        完了条件: '商品が在庫の画面に登録され、販売先へ出す準備（画像・説明・値段）が揃っている',
        必要素材: ['デザインの元データ', 'モックアップ', '原価と販売先'],
        手順: ['シリーズとテーマを決める', 'デザインを作る', 'モックアップで確かめる', '「赤字にならない値段」で売値を決める', '在庫の画面に登録する'],
        チェック: ['他者の著作物・商標を使っていない', '手数料を引いても黒字', '命名規則（商品番号_商品名）どおり'],
        ログ項目: ['商品番号', '商品名', '売値', '原価', '保存したファイル'],
    },
    {
        段: '投稿準備', title: 'SNSの投稿を1件用意する（出すのは自分で確認してから）', priority: 'high',
        目的: '毎日1投稿を切らさない',
        完了条件: '本文・タグ・素材が揃い、確認待ちに入っている。投稿後は投稿ログに残っている',
        必要素材: ['今日の商品の画像か動画', 'BGMを使うなら出所の分かる音源'],
        手順: ['手元の記録から反応の良かった型を見る', '素材を作る', '本文とタグを書く', '自分で最終確認して投稿する', '投稿ログに残す'],
        チェック: ['BGMの出所と利用条件を確かめた', '誤字・リンク先を確かめた', '投稿ボタンは自分で押した'],
        ログ項目: ['日時', '媒体', '本文', 'タグ', '素材', 'BGMの出所'],
    },
    {
        段: '記録', title: '今日の売上・支出・在庫を記録する', priority: 'normal',
        目的: 'お金と在庫の動きを毎日残し、利益が出ているかを判断できるようにする',
        完了条件: 'お金の帳面に今日の分が入っている（無ければ「今日は動きなし」と進捗ログに残す）',
        必要素材: ['各販売先の売上', 'レシート・支払いの控え'],
        手順: ['販売先ごとの売上を入れる', '材料・送料・広告などの支出を入れる', '在庫数を合わせる'],
        チェック: ['手数料が引かれているか', '資金残高が実際と合っているか'],
        ログ項目: ['売上', '支出', '利益', '在庫の増減'],
    },
    {
        段: '整理', title: '今日のファイルを整理する（消さずに移す）', priority: 'normal',
        目的: '成果物を資産として探せる状態に保つ',
        完了条件: '今日の成果物が決まった置き場にあり、要らないものは「使用済み」へ移してある',
        必要素材: ['今日作ったファイル'],
        手順: ['Products / Posts / Finance / Logs に振り分ける', '名前を「商品番号_用途_日付」にそろえる', '要らないものは使用済みへ移す'],
        チェック: ['完全削除をしていない'],
        ログ項目: ['移したファイル'],
    },
    {
        段: '学習', title: '今日分かったことをメモに残す', priority: 'low',
        目的: '同じ失敗を繰り返さず、うまくいった型を再現する',
        完了条件: 'メモに1件以上、根拠つきで残っている',
        必要素材: ['今日の投稿の反応', '売れた・売れなかった商品'],
        手順: ['うまくいったことを1つ書く', 'うまくいかなかったことと理由を1つ書く'],
        チェック: ['他所の内容を丸写ししていない'],
        ログ項目: ['分かったこと', '根拠'],
    },
    {
        段: '改善提案', title: '明日の改善を1つ決める', priority: 'low',
        目的: '毎日少しずつ仕組みを良くする',
        完了条件: '明日やる改善が1つ、やることに入っている',
        必要素材: ['今日の進捗ログ', '失敗した作業'],
        手順: ['止まった・手間取った工程を選ぶ', '明日試すやり方を1つ決める'],
        チェック: ['お金がかかる改善なら、決める前に止まって確認した'],
        ログ項目: ['改善の内容'],
    },
];

const 投稿の媒体 = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'X', 'note', 'その他'];

function 運用で読む(鍵) {
    try {
        const r = JSON.parse(localStorage.getItem(鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return null;
    }
}

function 運用で保存(鍵, 中身) {
    localStorage.setItem(鍵, JSON.stringify(中身));
}

/* ---------------- 今日やること ---------------- */

function 今日のルーティンを作る() {
    const 日 = 今日();
    const tasks = typeof loadTasks === 'function' ? loadTasks() : [];
    let 足した = 0;
    日次ルーティン.forEach((r, i) => {
        if (tasks.some((t) => t.routine === 日 && t.段 === r.段)) return;
        tasks.push({
            id: `task_${Date.now()}_${i}`,
            title: r.title,
            due: 日,
            time: '',
            repeat: '',
            remind: false,
            reminded: false,
            priority: r.priority,
            done: false,
            createdAt: new Date().toISOString(),
            routine: 日,
            段: r.段,
            目的: r.目的,
            完了条件: r.完了条件,
            必要素材: [...r.必要素材],
            手順: [...r.手順],
            チェック: r.チェック.map((文) => ({ 文, 済: false })),
            ログ項目: [...r.ログ項目],
        });
        足した++;
    });
    if (typeof saveTasks === 'function') saveTasks(tasks);
    if (typeof renderTaskList === 'function') renderTaskList();
    今日の運用を描く();
    if (typeof showNotification === 'function') {
        showNotification(足した ? `今日やることを${足した}件作りました` : '今日の分はもう作ってあります', 足した ? 'success' : 'info');
    }
    if (足した && window.logActivity) logActivity('今日やることを作成', { category: 'task', text: `${足した}件` });
}

/* ---------------- 今日の最低ライン ---------------- */

function 今日の最低ラインを調べる() {
    const 日 = 今日();
    const 今日か = (v) => typeof v === 'string' && v.slice(0, 10) === 日;
    const tasks = typeof loadTasks === 'function' ? loadTasks() : [];
    const 段が済んだ = (段) => tasks.some((t) => t.routine === 日 && t.段 === 段 && t.done);

    let 商品 = [];
    try { 商品 = JSON.parse(localStorage.getItem('products') || '[]'); } catch { 商品 = []; }
    const 今日の商品 = 商品.filter((p) => 今日か(p.createdAt) || 今日か(p.created_at)).length;

    const 投稿 = (運用で読む(運用_投稿ログキー) || []).filter((x) => 今日か(x.日時)).length;

    const 売上 = (運用で読む('areglm_sales') || []).filter((x) => x.date === 日).length;
    const 支出 = (運用で読む('areglm_expenses') || []).filter((x) => x.date === 日).length;
    const 動きなし = (運用で読む(運用_進捗キー) || []).some((x) => 今日か(x.とき) && x.動きなし);

    return [
        { 名: '商品 1件', 済: 今日の商品 > 0 || 段が済んだ('制作'), 訳: 今日の商品 ? `今日登録 ${今日の商品}件` : '在庫の画面で今日の商品を登録' },
        { 名: 'SNS 1投稿', 済: 投稿 > 0, 訳: 投稿 ? `投稿ログ ${投稿}件` : '投稿したら「投稿ログ」に残す' },
        { 名: '記録', 済: 売上 + 支出 > 0 || 動きなし || 段が済んだ('記録'), 訳: 売上 + 支出 ? `帳面 ${売上 + 支出}件` : 'お金の帳面に今日の分を入れる' },
    ];
}

/* ---------------- 進捗ログと再開 ---------------- */

/**
 * 進捗ログを読む。壊れていたら中身を退避し、
 * 終わっていない「やること」のチェックの進み具合から現在地を推定して作り直す。
 */
function 進捗ログを読む() {
    const 読めた = 運用で読む(運用_進捗キー);
    if (読めた) return 読めた;

    localStorage.setItem(`${運用_進捗キー}_broken_${Date.now()}`, localStorage.getItem(運用_進捗キー) || '');
    const tasks = typeof loadTasks === 'function' ? loadTasks() : [];
    const 推定 = tasks.filter((t) => !t.done).slice(0, 5).map((t) => {
        const 済 = (t.チェック || []).filter((c) => c.済).length;
        return {
            id: 'prog_' + Date.now() + '_' + t.id,
            とき: t.createdAt || new Date().toISOString(),
            taskId: t.id,
            見出し: t.title,
            現在地: (t.チェック || []).length ? `チェック ${済}/${t.チェック.length} 済み（推定）` : '未着手（推定）',
            次に: (t.手順 || [])[0] || '',
            推定: true,
        };
    });
    運用で保存(運用_進捗キー, 推定);
    if (typeof showNotification === 'function') {
        showNotification('進捗ログが読めなかったので、やることから現在地を推定して作り直しました（元の中身は退避済み）', 'warn');
    }
    return 推定;
}

function 進捗を残す(e) {
    e?.preventDefault?.();
    const taskId = document.getElementById('progress-task')?.value || '';
    const 現在地 = document.getElementById('progress-where')?.value.trim() || '';
    const 次に = document.getElementById('progress-next')?.value.trim() || '';
    const 動きなし = !!document.getElementById('progress-nomove')?.checked;
    if (!現在地 && !動きなし) {
        showNotification('どこまで進んだかを書いてください', 'error');
        return;
    }
    const t = (typeof loadTasks === 'function' ? loadTasks() : []).find((x) => x.id === taskId);
    const ログ = 進捗ログを読む();
    ログ.push({
        id: 'prog_' + Date.now(),
        とき: new Date().toISOString(),
        taskId,
        見出し: t?.title || (動きなし ? '今日は売上・支出の動きなし' : ''),
        現在地: 現在地 || '今日は売上・支出の動きなし',
        次に,
        動きなし,
    });
    運用で保存(運用_進捗キー, ログ.slice(-300));
    ['progress-where', 'progress-next'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    const 印 = document.getElementById('progress-nomove');
    if (印) 印.checked = false;
    if (window.logActivity) logActivity('進捗を記録', { category: 'task', text: 現在地.slice(0, 40) });
    showNotification('現在地を残しました。次に開いたとき、ここから再開できます', 'success');
    今日の運用を描く();
}

/** 終わっていないやることについての、いちばん新しい進捗 */
function 前回の続き() {
    const tasks = typeof loadTasks === 'function' ? loadTasks() : [];
    const 未完 = new Set(tasks.filter((t) => !t.done).map((t) => t.id));
    const ログ = 進捗ログを読む().filter((x) => !x.動きなし && (!x.taskId || 未完.has(x.taskId)));
    return ログ.length ? ログ[ログ.length - 1] : null;
}

function ここから再開する() {
    const 続き = 前回の続き();
    if (!続き) return;
    if (typeof switchPage === 'function') switchPage('dashboard');
    if (typeof switchHomeTab === 'function') switchHomeTab('today');
    const 印 = 続き.taskId && document.querySelector(`#task-list [data-id="${CSS.escape(続き.taskId)}"]`);
    const 行 = 印?.closest('.task-item');
    if (行) {
        行.scrollIntoView({ behavior: 'smooth', block: 'center' });
        行.classList.add('task-resume');
        setTimeout(() => 行.classList.remove('task-resume'), 4000);
    }
    showNotification(`再開: ${続き.見出し || ''} — 次は「${続き.次に || '現在地の続き'}」`, 'info');
    if (window.logActivity) logActivity('前回の続きから再開', { category: 'task', text: 続き.見出し || '' });
}

/* ---------------- 投稿ログ ---------------- */

function 投稿を記録する(e) {
    e.preventDefault();
    const v = (id) => document.getElementById(id)?.value.trim() || '';
    const 本文 = v('postlog-body');
    const BGM = v('postlog-bgm');
    if (!本文) { showNotification('本文を入れてください', 'error'); return; }
    if (!BGM) { showNotification('BGMの出所を入れてください（使っていなければ「なし」）', 'error'); return; }
    const ログ = 運用で読む(運用_投稿ログキー) || [];
    ログ.push({
        id: 'post_' + Date.now(),
        日時: v('postlog-at') || new Date().toISOString().slice(0, 16),
        媒体: v('postlog-media') || 'その他',
        本文,
        タグ: v('postlog-tags'),
        素材: v('postlog-assets'),
        BGM出所: BGM,
        URL: v('postlog-url'),
        記録日: new Date().toISOString(),
    });
    運用で保存(運用_投稿ログキー, ログ);
    ['postlog-body', 'postlog-tags', 'postlog-assets', 'postlog-bgm', 'postlog-url'].forEach((id) => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    if (window.logActivity) logActivity('投稿ログを記録', { category: 'sns', text: 本文.slice(0, 40) });
    showNotification('投稿ログに残しました', 'success');
    投稿ログを描く();
    今日の運用を描く();
}

function 投稿ログを不要へ(id) {
    const ログ = 運用で読む(運用_投稿ログキー) || [];
    const もの = ログ.find((x) => x.id === id);
    if (!もの) return;
    if (typeof 不要ボックスへ入れる === 'function') 不要ボックスへ入れる('postlog', もの, `${もの.日時} ${もの.媒体}`);
    運用で保存(運用_投稿ログキー, ログ.filter((x) => x.id !== id));
    投稿ログを描く();
    今日の運用を描く();
}

function 投稿ログを描く() {
    const 箱 = document.getElementById('postlog-list');
    if (!箱) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    const ログ = (運用で読む(運用_投稿ログキー) || []).slice().sort((a, b) => String(b.日時).localeCompare(String(a.日時)));
    箱.innerHTML = ログ.length
        ? ログ.slice(0, 30).map((x) => `<tr>
            <td>${s(String(x.日時).replace('T', ' '))}</td><td>${s(x.媒体)}</td>
            <td>${s(String(x.本文).slice(0, 60))}</td><td>${s(x.タグ)}</td><td>${s(x.素材)}</td><td>${s(x.BGM出所)}</td>
            <td><button type="button" class="btn-link" data-postlog-trash="${s(x.id)}">不要へ移す</button></td></tr>`).join('')
        : '<tr><td colspan="7" class="empty-cell">まだ投稿の記録がありません</td></tr>';
    箱.querySelectorAll('[data-postlog-trash]').forEach((b) => b.addEventListener('click', () => 投稿ログを不要へ(b.dataset.postlogTrash)));
}

/* ---------------- 更新記録 ---------------- */

function 更新を記録する(e) {
    e.preventDefault();
    const 内容 = document.getElementById('updatelog-text')?.value.trim() || '';
    const 大きさ = document.getElementById('updatelog-size')?.value || 'small';
    const 確認済み = !!document.getElementById('updatelog-confirmed')?.checked;
    if (!内容) { showNotification('更新の内容を書いてください', 'error'); return; }
    if (大きさ === 'large' && !確認済み) {
        showNotification('大きな変更は、事前に確認したことに印を付けてから残してください', 'error');
        return;
    }
    const ログ = 運用で読む(運用_更新記録キー) || [];
    ログ.push({
        id: 'upd_' + Date.now(),
        日付: document.getElementById('updatelog-date')?.value || 今日(),
        内容,
        大きさ,
        確認済み: 大きさ === 'large' ? 確認済み : null,
        記録日: new Date().toISOString(),
    });
    運用で保存(運用_更新記録キー, ログ);
    const el = document.getElementById('updatelog-text'); if (el) el.value = '';
    const 印 = document.getElementById('updatelog-confirmed'); if (印) 印.checked = false;
    showNotification('更新記録に残しました', 'success');
    更新記録を描く();
}

function 更新記録を描く() {
    const 箱 = document.getElementById('updatelog-list');
    if (!箱) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));
    const ログ = (運用で読む(運用_更新記録キー) || []).slice().sort((a, b) => String(b.日付).localeCompare(String(a.日付)));
    箱.innerHTML = ログ.length
        ? ログ.slice(0, 30).map((x) => `<li><strong>${s(x.日付)}</strong>
            <span class="update-size ${x.大きさ === 'large' ? 'large' : ''}">${x.大きさ === 'large' ? '大きな変更（確認済み）' : '小さな変更'}</span>
            ${s(x.内容)}</li>`).join('')
        : '<li class="hint">まだ更新の記録がありません</li>';
}

/* ---------------- まとめて描く ---------------- */

function 今日の運用を描く() {
    const 線 = document.getElementById('today-kpi');
    if (!線) return;
    const s = (v) => AReGLM_SECURITY.sanitizeHtml(String(v ?? ''));

    const 結果 = 今日の最低ラインを調べる();
    線.innerHTML = 結果.map((r) => `<li class="kpi-item ${r.済 ? 'done' : ''}">
        <span class="kpi-mark">${r.済 ? '✓' : '・'}</span><strong>${s(r.名)}</strong><small>${s(r.訳)}</small></li>`).join('');
    const 残り = 結果.filter((r) => !r.済).length;
    const 見出し = document.getElementById('today-kpi-status');
    if (見出し) 見出し.textContent = 残り ? `あと${残り}つ` : '今日の最低ラインは達成';

    const 続き = 前回の続き();
    const 札 = document.getElementById('today-resume');
    if (札) {
        札.hidden = !続き;
        if (続き) {
            札.querySelector('[data-resume-text]').innerHTML = `<strong>前回の続き:</strong> ${s(続き.見出し || '（やること指定なし）')} — `
                + `${s(続き.現在地)}${続き.次に ? ` ／ 次は「${s(続き.次に)}」` : ''}`
                + ` <small class="hint">${s(new Date(続き.とき).toLocaleString('ja-JP'))}</small>`;
        }
    }

    const 選択 = document.getElementById('progress-task');
    if (選択) {
        const 前 = 選択.value;
        const 未完 = (typeof loadTasks === 'function' ? loadTasks() : []).filter((t) => !t.done);
        選択.innerHTML = '<option value="">（やることを選ぶ）</option>'
            + 未完.map((t) => `<option value="${s(t.id)}">${s(t.title.slice(0, 40))}</option>`).join('');
        if (前) 選択.value = 前;
    }
}

function init今日の運用() {
    document.getElementById('today-routine-btn')?.addEventListener('click', 今日のルーティンを作る);
    document.getElementById('today-resume-btn')?.addEventListener('click', ここから再開する);
    document.getElementById('progress-form')?.addEventListener('submit', 進捗を残す);
    document.getElementById('postlog-form')?.addEventListener('submit', 投稿を記録する);
    document.getElementById('updatelog-form')?.addEventListener('submit', 更新を記録する);

    const 媒体 = document.getElementById('postlog-media');
    if (媒体) 媒体.innerHTML = 投稿の媒体.map((m) => `<option value="${m}">${m}</option>`).join('');
    const 時 = document.getElementById('postlog-at');
    if (時 && !時.value) {
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        時.value = d.toISOString().slice(0, 16);
    }
    const 更新日 = document.getElementById('updatelog-date');
    if (更新日 && !更新日.value) 更新日.value = 今日();
    document.getElementById('updatelog-size')?.addEventListener('change', (e) => {
        const 行 = document.getElementById('updatelog-confirm-row');
        if (行) 行.hidden = e.target.value !== 'large';
    });

    今日の運用を描く();
    投稿ログを描く();
    更新記録を描く();

    if (前回の続き() && typeof showNotification === 'function') {
        setTimeout(() => showNotification('前回の続きがあります。ホームの「今日の運用」から再開できます', 'info'), 1500);
    }
}

window.init今日の運用 = init今日の運用;
window.今日の運用を描く = 今日の運用を描く;
window.今日のルーティンを作る = 今日のルーティンを作る;
window.今日の最低ラインを調べる = 今日の最低ラインを調べる;
window.前回の続き = 前回の続き;
window.投稿ログを描く = 投稿ログを描く;
