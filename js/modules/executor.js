/**
 * 指示を実際に行う
 *
 * なぜこれが要るのか:
 *   AIは「やることを追加するを実行します」と返していたが、
 *   実際には何も起きていなかった。
 *   AI側は「何を、どの中身で行うか」を返すところまで作ってあり、
 *   それを受け取って実際に行う部分が無かった。
 *
 *   聞き取れているのに動かない、という一番たちの悪い状態だったので、
 *   ここで確実に繋ぐ。
 *
 * 考え方:
 *   ・データを増やす作業（やること・メモ・商品）は、その場で行う
 *   ・見るだけの作業（在庫を見る・今日の状況）は、その画面へ移る
 *   ・消す作業は、必ず不要ボックス経由にする（消えない）
 *   ・行った結果は、必ず画面に書いて返す。
 *     「やりました」だけで終わらせると、
 *     本当にやったのか分からないため、中身も出す。
 *
 * すべてこの端末の中だけで動く。外部へは一切送らない。
 */

/**
 * 作業ごとの、実際の中身。
 *
 * それぞれ「行った結果」を文章で返す。
 * 返せない場合は null を返し、呼び出し側で伝える。
 */
const 作業の中身 = {

    /**
     * プリント柄を作る。
     *
     * ただ絵を出して終わりにしない。
     * 色数・線の細さ・継ぎ目・大きさを測って、
     * プリントに出せるかどうかまで、こちらから言う。
     * 刷ってから気づくと、生地ごと無駄になるため。
     */
    make_pattern(材料) {
        const 指示 = (材料.text || 材料.title || '').trim();
        if (!指示) return { ok: false, 文: 'どんな柄にするか、聞き取れませんでした' };
        if (typeof 図案をつくる !== 'function') {
            return { ok: false, 文: '図案を作る仕組みが読み込まれていません' };
        }

        // 2048点で作る。
        //
        // 1024点だと 300dpi 換算で 8.7cm 幅までしか刷れず、
        // 前身頃いっぱいに使えない。
        // 作ったあとで「小さすぎます」と言うくらいなら、
        // はじめから足りる大きさで作るほうがよい。
        const r = 図案をつくる(指示, { width: 2048, height: 2048 });
        if (!r || r.type !== 'image') {
            return { ok: false, 文: '図案を作れませんでした' };
        }

        // 作ったものを保管庫に残す。
        // 画面に出しただけだと、閉じたら消える。
        if (typeof 保管庫に入れる === 'function') {
            try {
                保管庫に入れる({
                    名前: `柄_${指示.slice(0, 20)}`,
                    種類: 'image/png',
                    data: r.data,
                });
            } catch { /* 保管できなくても、図案そのものは渡す */ }
        }

        const 直す = (r.助言 || []).filter((x) => x.重さ > 0);
        const 文 = [`柄を作りました（${r.使った柄}${r.継ぎ目なし ? '・継ぎ目なし' : ''}）。`];

        if (r.数字) {
            文.push(`色数 ${r.数字.色数} / いちばん細い線 ${r.数字['25cm幅でのmm']}mm`
                + ` / ${r.数字['刷れる幅cm']}cm幅まで`);
        }

        if (直す.length) {
            文.push('');
            文.push(`プリントに出す前に、${直す.length}件 見てください:`);
            直す.forEach((x) => 文.push(`・${x.件} → ${x.手}`));
        } else {
            文.push('このままプリントに出せます。');
        }

        return { ok: true, 文: 文.join('\n'), 画像: r.data };
    },

    /** いまの様子を出す */
    show_activity() {
        return いまの様子を出す();
    },

    /** やることを足す */
    add_task(材料) {
        const 題 = (材料.title || '').trim();
        if (!題) return { ok: false, 文: '何をやることにするか、聞き取れませんでした' };

        const 一覧 = 蓄えを読む('areglm_tasks');
        一覧.push({
            id: 'task_' + Date.now(),
            title: 題,
            due: 材料.due || '',
            time: 材料.time || '',
            repeat: 材料.repeat || '',
            remind: true,
            reminded: false,
            priority: 材料.priority || 'normal',
            done: false,
            createdAt: new Date().toISOString(),
        });
        書く('areglm_tasks', 一覧);
        描き直す('renderTaskList');

        return { ok: true, 文: `やることに追加しました:「${題}」（全${一覧.length}件）` };
    },

    /** メモを残す */
    add_memo(材料) {
        const 本文 = (材料.body || 材料.title || '').trim();
        if (!本文) return { ok: false, 文: '何を書き留めるか、聞き取れませんでした' };

        const 一覧 = 蓄えを読む('areglm_memos');
        一覧.push({
            id: 'memo_' + Date.now(),
            body: 本文,
            source: 'AIへの指示',
            verified: false,
            createdAt: new Date().toISOString(),
        });
        書く('areglm_memos', 一覧);
        描き直す('renderMemoList');

        // メモはそのままAIの学習にもする。使うほど賢くなるように。
        if (window.AReGLM_LOCAL_AI) AReGLM_LOCAL_AI.learn(本文, 'memo');

        return { ok: true, 文: `メモに残しました:「${本文.slice(0, 30)}${本文.length > 30 ? '…' : ''}」` };
    },

    /** 商品を登録する */
    add_product(材料) {
        const 名 = (材料.name || '').trim();
        if (!名) return { ok: false, 文: '商品の名前が聞き取れませんでした' };

        // 値段は「4800円」のように書かれることが多いので、数字だけ取り出す
        const 値段 = Number(String(材料.price || '').replace(/[^\d.]/g, '')) || 0;

        const 一覧 = 蓄えを読む('products');
        一覧.push({
            id: 'p_' + Date.now(),
            name: 名,
            category: (材料.category || '').trim(),
            price: 値段,
            quantity: 0,
            createdAt: new Date().toISOString(),
        });
        書く('products', 一覧);
        描き直す('renderInventory');
        描き直す('renderInventoryHub');

        return {
            ok: true,
            文: `商品を登録しました:「${名}」／${材料.category || '種類なし'}／`
                + (値段 ? `¥${値段.toLocaleString('ja-JP')}` : '値段なし')
                + `（全${一覧.length}件）`,
        };
    },

    /* ---------- 今日足した機能（バックアップ・ひらめき箱・制作の進捗） ---------- */

    /** バックアップを、いま取る */
    async backup_now() {
        if (typeof アカウントAPI !== 'function') return { ok: false, 文: 'バックアップの仕組みが読み込まれていません' };
        const r = await アカウントAPI('/api/backup/now', {});
        if (!r.ok) return { ok: false, 文: r.訳 || 'バックアップを取れませんでした' };
        return { ok: true, 文: `バックアップを取りました（${r.ファイル数}ファイル）。置き場: ${r.場所}` };
    },

    /** バックアップの状況を答える */
    async show_backup() {
        if (typeof アカウントAPI !== 'function') return { ok: false, 文: 'バックアップの仕組みが読み込まれていません' };
        const r = await アカウントAPI('/api/backup/status');
        if (!r.ok) return { ok: false, 文: r.訳 || '状況を読めませんでした' };
        const 日時 = (iso) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const 行 = [r.最新 ? `最後のバックアップ: ${日時(r.最新.作成)}（${r.最新.種類}）` : 'まだバックアップがありません'];
        行.push(`置き場: ${r.場所}${r.iCloudか ? '（iCloud Drive）' : '（このMacの中だけ）'} ／ 控えは${r.件数}件`);
        if (r.古すぎる) 行.push('⚠ 2日以上、控えが取れていません。「バックアップを取って」と言ってください。');
        return { ok: true, 文: 行.join('\n') };
    },

    /** ひらめき箱に入れる */
    async add_inbox(材料) {
        if (typeof アカウントAPI !== 'function') return { ok: false, 文: 'ひらめき箱の仕組みが読み込まれていません' };
        // 「ひらめき箱に〜を入れて」から、頼み言葉を取り除いて、中身だけにする
        let 本文 = String(材料.body || 材料.text || '');
        本文 = 本文.replace(/ひらめき箱(に|へ)?|ひらめき(を|に)?入れ|思いつき(を)?入れ|ひらめきメモ/g, ' ')
            .replace(/(の)?(を|と)?(入れといて|入れておいて|入れて|追加して|しまって|放り込んで)(ください)?$/g, ' ')
            .replace(/(を|と)?(入れといて|入れておいて|入れて|追加して|しまって|放り込んで)(ください)?/g, ' ')
            .replace(/\s+/g, ' ').trim().replace(/^[:：、。,\s]+|[:：、。,\s]+$/g, '');
        if (!本文) return { ok: false, 文: '何を入れるか、聞き取れませんでした' };
        const 本体 = { 文: 本文, 端末: typeof 続き用の端末名 === 'function' ? 続き用の端末名() : '' };
        if (/^https?:\/\/\S+$/.test(本文)) 本体.種類 = 'URL';
        const r = await アカウントAPI('/api/inbox/add', 本体);
        if (!r.ok) return { ok: false, 文: r.訳 || 'ひらめき箱に入れられませんでした' };
        描き直す('renderひらめき箱');
        return { ok: true, 文: `ひらめき箱に入れました:「${本文.slice(0, 30)}${本文.length > 30 ? '…' : ''}」` };
    },

    /** ひらめき箱の、未整理を答える */
    async show_inbox() {
        if (typeof アカウントAPI !== 'function') return { ok: false, 文: 'ひらめき箱の仕組みが読み込まれていません' };
        const r = await アカウントAPI('/api/inbox/list');
        if (!r.ok) return { ok: false, 文: r.訳 || '読めませんでした' };
        const 未 = r.一覧.filter((x) => x.状態 !== '整理済み');
        if (!未.length) return { ok: true, 文: 'ひらめき箱に、未整理のものはありません。' };
        const 行 = 未.slice(0, 5).map((x) => `・[${x.種類}] ${(x.文 || x.url || '（写真）').slice(0, 40)}`);
        return { ok: true, 文: `ひらめき箱: 未整理 ${未.length}件\n${行.join('\n')}${未.length > 5 ? '\n…ほか' + (未.length - 5) + '件' : ''}` };
    },

    /** TUDURI・INTGLMの進捗と、公開前チェックの状況を答える */
    show_production() {
        const P = window.AREGLM_PREPUBLISH;
        if (!P) return { ok: false, 文: '公開前チェックの仕組みが読み込まれていません' };
        const 全部 = 蓄えを読む('areglm_production_log');
        const 数 = (状) => 全部.filter((x) => x.状態 === 状).length;
        const 行 = [`次のTUDURIの番号は No.${P.次のTUDURIの番号(全部)} です。`,
            `記録: 全${全部.length}件（案 ${数('案')} ／ 公開前チェック済み ${数('公開可')} ／ 公開済み ${数('公開済み')} ／ 見送り ${数('見送り')}）`];
        全部.filter((x) => x.状態 === '案').slice(0, 5).forEach((x) => {
            const j = P.判定(x, 全部);
            const 名 = x.series === 'TUDURI' ? `TUDURI No.${x.no ?? '？'} ${x.name}` : `INTGLM ${x.name}`;
            行.push(`・${名}: ${j.完了できる ? '完了できます' : `直すところ ${j.直すところ}件 ／ 目で確認 ${j.未確認}件`}`);
        });
        行.push('※ SUZURIの「商品を公開する」ボタンは、あなた自身が押します。');
        return { ok: true, 文: 行.join('\n') };
    },

    /** 制作の進捗に、「案」として記録する（公開前チェックには触れない） */
    add_production(材料) {
        const P = window.AREGLM_PREPUBLISH;
        if (!P) return { ok: false, 文: '制作の進捗の仕組みが読み込まれていません' };
        const 元 = String(材料.name || 材料.text || '');
        const series = /INTGLM/i.test(元) ? 'INTGLM' : 'TUDURI';
        let 名 = 元.replace(/TUDURI|INTGLM|制作(を)?記録|作品(を)?記録|制作(の進捗)?(に)?(追加|記録)|に追加|に記録|して/gi, ' ')
            .replace(/\s+/g, ' ').trim().replace(/^[:：、。,\s]+|[:：、。,\s]+$/g, '');
        if (!名) return { ok: false, 文: '作品の名前が聞き取れませんでした' };
        const 一覧 = 蓄えを読む('areglm_production_log');
        const 作品 = {
            id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            series, no: series === 'TUDURI' ? P.次のTUDURIの番号(一覧) : null, keitou: '',
            name: 名, item: '', price: 0, material: '', silhouette: '', palette: '', decoration: '', notes: '',
            状態: '案', 確認: {}, createdAt: new Date().toISOString(),
        };
        一覧.push(作品);
        書く('areglm_production_log', 一覧);
        描き直す('render制作の進捗');
        return {
            ok: true,
            文: `制作の進捗に「案」として記録しました:「${名}」（${series}${作品.no ? ' No.' + 作品.no : ''}）\n`
                + '品目・価格・系統などは、制作の進捗の画面（ホーム→計画）で入れてください。公開はしていません。',
        };
    },

    /** 覚えたことを忘れる */
    async forget(材料) {
        const 語 = (材料.term || '').trim();
        if (!語) return { ok: false, 文: '何を忘れるか、聞き取れませんでした' };
        if (!window.AReGLM_LOCAL_AI) return { ok: false, 文: '自作AIが動いていません' };

        const r = await AReGLM_LOCAL_AI.forget({ term: 語 });
        const 消えた = (r && r.removed) || [];
        return {
            ok: true,
            文: 消えた.length
                ? `「${語}」を忘れました（関連する${消えた.length}語も一緒に消しました）`
                : `「${語}」は覚えていませんでした`,
        };
    },

    /** 似ている商品がないか調べる */
    async check_duplicate(材料) {
        const 文 = (材料.text || '').trim();
        if (!文) return { ok: false, 文: 'どんな商品か聞き取れませんでした' };

        const 商品 = 蓄えを読む('products');
        await 送る('/api/ai-local/similarity/index', {
            items: 商品.map((p) => ({
                id: p.id,
                text: `${p.name} ${p.category || ''}`,
                attrs: { category: p.category || '', color: p.color || '' },
            })),
        });
        const r = await 送る('/api/ai-local/similarity/check', { text: 文, attrs: {} });

        if (!r) return { ok: false, 文: '判定できませんでした' };
        const 一番 = (r.matches || [])[0];
        return {
            ok: true,
            文: r.message
                + (一番 ? `\n近いもの:「${一番.text}」（近さ ${一番.score.toFixed(2)}）` : ''),
        };
    },

    /** 文章を作る */
    async write_text(材料) {
        const 型の対応 = {
            商品説明: 'product_description',
            説明: 'product_description',
            SNS: 'sns_post',
            投稿: 'sns_post',
            発注メール: 'order_mail',
            メール: 'order_mail',
            テックパック: 'techpack_note',
            注記: 'techpack_note',
        };
        const 指定 = (材料.template || '').trim();
        const 型 = 型の対応[指定]
            || Object.entries(型の対応).find(([k]) => 指定.includes(k))?.[1];

        if (!型) {
            return {
                ok: false,
                文: '何の文章か分かりませんでした。'
                    + '「商品説明」「SNS投稿」「発注メール」「テックパック注記」のどれかでお願いします。',
            };
        }

        const r = await 送る('/api/ai-local/generate', { template: 型, fields: 材料 });
        const 出 = (r && r.outputs && r.outputs[0]) || '';
        if (!出) return { ok: false, 文: '文章を作れませんでした。足りない情報があります。' };
        return { ok: true, 文: `作りました:\n\n${出}` };
    },
};

/**
 * 見るだけの作業。行くべき画面だけを決める。
 *
 * データを変えないので、その場で行う必要がない。
 * 画面へ移ったほうが、続けて操作できる。
 */
/**
 * いまの様子を出す。
 *
 * 画面へ移すだけでは足りない。
 * 聞かれているのは「いま何をしているか」なので、
 * その場で答えを出す。
 */
function いまの様子を出す() {
    if (typeof いまの様子 !== 'function') {
        return { ok: false, 文: '様子を見る仕組みが読み込まれていません' };
    }
    const 今 = いまの様子();
    return { ok: true, 文: 今.文 };
}

const 画面へ移る作業 = {
    show_schedule: { 画面: 'dashboard', 文: '今日の状況を出します' },
    show_inventory: { 画面: 'inventory', 文: '在庫を出します' },
    price_advice: { 画面: 'inventory', 文: '値段を考える画面へ移ります' },
    search_knowledge: { 画面: 'dashboard', 文: '覚えたことを探します' },
    health: { 画面: 'dashboard', 文: '体調の記録へ移ります' },
    self_check: { 画面: 'settings', 文: '点検します' },
    next_steps: { 画面: 'dashboard', 文: '次にやることを出します' },
};

/* ---------- 道具 ---------- */

// 読み書きは js/core/蓄え.js の「蓄えを読む」にまとめてある。
// ここに同じ「読む」を置いていたため、二つのファイルで名前がぶつかり、
// 後から読み込まれたほうが前を黙って上書きしていた。

function 書く(鍵, 中身) {
    localStorage.setItem(鍵, JSON.stringify(中身));
}

function 描き直す(名) {
    if (typeof window[名] === 'function') {
        try {
            window[名]();
        } catch {
            /* 画面が開いていないだけなので、黙って続ける */
        }
    }
}

async function 送る(道, 中身) {
    try {
        const r = await fetch(道, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(中身),
        });
        return r.ok ? r.json() : null;
    } catch {
        return null;
    }
}

/* ---------- 入口 ---------- */

/**
 * AIの返事に実行の指示が入っていれば、実際に行う。
 *
 * @param {object} 返事  AIからの応答（action / params を含むことがある）
 * @param {string} 出力先 'mainai' など。結果を書く場所
 * @returns {Promise<boolean>} 実際に何かを行ったか
 */
async function 指示を実行する(返事, 出力先) {
    if (!返事 || !返事.action) return false;

    const 作業 = 返事.action;
    const 材料 = 返事.params || {};

    // 何がどれだけ使われたかを数えておく。
    // これが無いと、自分を見るときの材料が無い。
    if (typeof 作業が使われた === 'function') 作業が使われた(作業);

    // --- 何にでも使える道具 ---
    //
    // 決まった作業だけでは「何でも」に届かない。
    // 読む・書く・数える・探す・比べる——
    // これらを組み合わせれば、教わっていない作業もできる。
    if (作業.startsWith('道具:')) {
        const 道具名 = 作業.slice(3);
        const 道具 = (typeof 道具たち !== 'undefined') ? 道具たち[道具名] : null;

        if (!道具) {
            const 文 = `「${道具名}」という道具はありません。`
                + `あるのは: ${(typeof 道具の一覧 === 'function'
                    ? 道具の一覧().map((x) => x.名).join('、') : '—')}`;
            if (typeof appendConsoleLine === 'function') {
                appendConsoleLine('assistant', '✗ ' + 文, 出力先);
            }
            return true;
        }

        let 結果;
        try {
            結果 = 道具(材料);
        } catch (e) {
            結果 = { ok: false, 文: '道具を使う途中で失敗しました: ' + e.message };
        }

        if (typeof appendConsoleLine === 'function') {
            appendConsoleLine('assistant', (結果.ok ? '✓ ' : '✗ ') + 結果.文, 出力先);
        }
        if (typeof showNotification === 'function') {
            showNotification(結果.文.split('\n')[0], 結果.ok ? 'success' : 'error');
        }
        return true;
    }

    // --- データを変える作業 ---
    if (作業の中身[作業]) {
        let 結果;
        try {
            結果 = await 作業の中身[作業](材料);
        } catch (e) {
            結果 = { ok: false, 文: '実行の途中で失敗しました: ' + e.message };
        }

        if (typeof appendConsoleLine === 'function') {
            appendConsoleLine('assistant', (結果.ok ? '✓ ' : '✗ ') + 結果.文, 出力先);
        }
        if (typeof showNotification === 'function') {
            showNotification(結果.文.split('\n')[0], 結果.ok ? 'success' : 'error');
        }
        return true;
    }

    // --- 画面へ移る作業 ---
    if (画面へ移る作業[作業]) {
        const 先 = 画面へ移る作業[作業];
        // 画面を切り替える関数名は switchPage。
        // 名前を間違えると、黙って何も起きないので必ず確かめる。
        if (typeof switchPage === 'function') switchPage(先.画面);

        // 点検は移るだけでなく、その場で走らせる
        if (作業 === 'self_check' && typeof selfCheckRun === 'function') selfCheckRun();

        if (typeof appendConsoleLine === 'function') {
            appendConsoleLine('assistant', '✓ ' + 先.文, 出力先);
        }
        return true;
    }

    // --- 知らない作業 ---
    if (typeof appendConsoleLine === 'function') {
        appendConsoleLine(
            'assistant',
            `「${作業}」の行い方がまだ作られていません。できることの一覧に載せていないので、いまはできません。`,
            出力先
        );
    }
    return false;
}

window.指示を実行する = 指示を実行する;
window.作業の中身 = 作業の中身;
window.画面へ移る作業 = 画面へ移る作業;
