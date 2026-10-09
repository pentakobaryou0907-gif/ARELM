/**
 * 司令の列 ― 席を外しても、係の作業をサーバーが進める
 *
 * なぜこれが要るのか:
 *   司令塔.py は、分けて・振って・読む手までは、Pythonだけで進められる。
 *   だがやることを足す・控えを取る・夜の点検は、同期の控えとバックアップが
 *   Node側にある。画面が閉じているあいだに進めるには、ここで書く。
 *
 * 決まり:
 *   ・消さない。配列へ足すだけ。中身が読めないときは、上書きしない。
 *   ・外へ送らない。公開しない。SUZURIの公開ボタンは押さない。
 *   ・書く手が無い仕事は、Python側だけで完結する。
 *
 * 外部へは一切問い合わせない。
 */

const 見張りの間隔 = 20 * 1000;

function 同期の配列(店, 鍵) {
    try {
        const v = 店 && 店[鍵] && 店[鍵].value;
        if (v == null || v === '') return [];
        const a = JSON.parse(v);
        return Array.isArray(a) ? a : null;
    } catch {
        return null;
    }
}

/**
 * 同期の配列へ、1件足す。消さない。
 * 中身が壊れている・配列でないときは、上書きせず失敗を返す
 * （壊れたデータを「直す」つもりで空にしていた事故を避けるため）。
 */
function 同期の配列を足す(店, 鍵, 件) {
    let 並び;
    try {
        const raw = 店[鍵] && 店[鍵].value;
        if (raw == null || raw === '') 並び = [];
        else 並び = JSON.parse(raw);
    } catch {
        return { ok: false, 文: `${鍵} の中身が読めないので、足していません（壊れたデータを上書きしないため）` };
    }
    if (!Array.isArray(並び)) {
        return { ok: false, 文: `${鍵} が配列ではないので、足していません` };
    }
    並び.push(件);
    店[鍵] = { value: JSON.stringify(並び), updatedAt: Date.now() };
    return { ok: true, 数: 並び.length };
}

/** 公開は、よいと言われても押さない（本人がSUZURIで押す） */
function 公開してよいか() {
    return false;
}

/** 消すことはしない（整理済みへ移すのは、本人の画面操作） */
function 消してよいか() {
    return false;
}

const 文章の型 = {
    商品説明: 'product_description',
    説明: 'product_description',
    SNS: 'sns_post',
    投稿: 'sns_post',
    発注メール: 'order_mail',
    メール: 'order_mail',
    テックパック: 'techpack_note',
    注記: 'techpack_note',
};

async function 手を行う(手, 道具) {
    const a = 手.action;
    const 材料 = 手.params || {};

    if (a === 'add_task') {
        const 題 = String(材料.title || '').trim();
        if (!題) return { ok: false, 文: '何をやることにするか、聞き取れませんでした' };
        const 店 = 道具.読む();
        const r = 同期の配列を足す(店, 'areglm_tasks', {
            id: 'task_hq_' + Date.now(),
            title: 題,
            due: 材料.due || '',
            time: 材料.time || '',
            done: false,
            createdAt: new Date().toISOString(),
            source: '司令の列',
        });
        if (!r.ok) return r;
        道具.書く(店);
        return { ok: true, 文: `やることに追加しました:「${題}」（全${r.数}件）` };
    }

    if (a === 'add_memo') {
        const 本文 = String(材料.body || 材料.title || '').trim();
        if (!本文) return { ok: false, 文: '何を書き留めるか、聞き取れませんでした' };
        const 店 = 道具.読む();
        const r = 同期の配列を足す(店, 'areglm_memos', {
            id: 'memo_hq_' + Date.now(),
            body: 本文,
            source: '司令の列',
            verified: false,
            createdAt: new Date().toISOString(),
        });
        if (!r.ok) return r;
        道具.書く(店);
        return { ok: true, 文: `メモに残しました:「${本文.slice(0, 40)}${本文.length > 40 ? '…' : ''}」` };
    }

    if (a === 'add_product') {
        const 名 = String(材料.name || '').trim();
        if (!名) return { ok: false, 文: '商品の名前が聞き取れませんでした' };
        const 値段 = Number(String(材料.price || '').replace(/[^\d.]/g, '')) || 0;
        const 店 = 道具.読む();
        const r = 同期の配列を足す(店, 'products', {
            id: 'p_hq_' + Date.now(),
            name: 名,
            category: String(材料.category || '').trim(),
            price: 値段,
            quantity: 0,
            createdAt: new Date().toISOString(),
            source: '司令の列',
        });
        if (!r.ok) return r;
        道具.書く(店);
        return {
            ok: true,
            文: `商品を登録しました:「${名}」／${材料.category || '種類なし'}／`
                + (値段 ? `¥${値段}` : '値段なし') + `（全${r.数}件）`,
        };
    }

    if (a === 'add_production') {
        const 名 = String(材料.name || 材料.text || '').trim();
        if (!名) return { ok: false, 文: '作品の名前が聞き取れませんでした' };
        const 店 = 道具.読む();
        const r = 同期の配列を足す(店, 'areglm_production_log', {
            id: 'prod_hq_' + Date.now(),
            name: 名,
            状態: '案',
            createdAt: new Date().toISOString(),
            source: '司令の列',
        });
        if (!r.ok) return r;
        道具.書く(店);
        return { ok: true, 文: `制作の進捗に「案」として残しました:「${名}」（公開はしていません）` };
    }

    if (a === 'backup_now') {
        if (!道具.バックアップ || typeof 道具.バックアップ.控えを取る !== 'function') {
            return { ok: false, 文: 'バックアップの仕組みがありません' };
        }
        const r = 道具.バックアップ.控えを取る('司令の列');
        if (!r || !r.ok) return { ok: false, 文: (r && r.訳) || 'バックアップを取れませんでした' };
        return { ok: true, 文: `バックアップを取りました（${r.ファイル数 || ''}ファイル）` };
    }

    if (a === 'show_backup') {
        if (!道具.バックアップ || typeof 道具.バックアップ.状態 !== 'function') {
            return { ok: false, 文: 'バックアップの仕組みがありません' };
        }
        const r = 道具.バックアップ.状態();
        const 最新 = r && r.最新;
        return {
            ok: true,
            文: 最新
                ? `最後のバックアップ: ${最新.作成}（${最新.種類}）／控えは${r.件数}件`
                : 'まだバックアップがありません',
        };
    }

    if (a === 'run_night') {
        if (!道具.夜を実行する) return { ok: false, 文: '夜の当番の仕組みがありません' };
        const 報告 = await 道具.夜を実行する();
        return { ok: true, 文: (報告 && 報告.要約) || '点検しました（読むだけです）' };
    }

    if (a === 'show_night') {
        if (!道具.夜の報告) return { ok: false, 文: '夜の当番の仕組みがありません' };
        const 最新 = 道具.夜の報告();
        if (!最新) return { ok: true, 文: 'まだ朝の報告がありません' };
        return { ok: true, 文: 最新.要約 || '報告があります' };
    }

    if (a === 'add_inbox') {
        if (!道具.ひらめき箱) return { ok: false, 文: 'ひらめき箱の仕組みがありません' };
        const 本文 = String(材料.body || 材料.text || '').trim();
        if (!本文) return { ok: false, 文: '何を入れるか、聞き取れませんでした' };
        const r = 道具.ひらめき箱.追加({ 文: 本文, 端末: '司令の列' });
        if (!r || !r.ok) return { ok: false, 文: (r && r.訳) || '入れられませんでした' };
        return { ok: true, 文: r.訳 || 'ひらめき箱に入れました' };
    }

    if (a === 'show_inbox') {
        if (!道具.ひらめき箱) return { ok: false, 文: 'ひらめき箱の仕組みがありません' };
        const 一覧 = 道具.ひらめき箱.一覧を返す() || [];
        const 未 = 一覧.filter((x) => x.状態 !== '整理済み');
        return { ok: true, 文: 未.length ? `ひらめき箱: 未整理 ${未.length}件` : 'ひらめき箱に、未整理のものはありません。' };
    }

    if (a === 'write_text') {
        if (!道具.文章を作る) return { ok: false, 文: '文章を作る仕組みがありません' };
        const 指定 = String(材料.template || '').trim();
        const 型 = 文章の型[指定]
            || Object.entries(文章の型).find(([k]) => 指定.includes(k))?.[1];
        if (!型) {
            return { ok: false, 文: '何の文章か分かりませんでした。「商品説明」「SNS」などでお願いします。' };
        }
        const 出 = await 道具.文章を作る(型, 材料);
        if (!出) return { ok: false, 文: '文章を作れませんでした。足りない情報があります。' };
        return { ok: true, 文: `下書きを作りました（投稿はしていません）:\n\n${出}` };
    }

    if (a === 'forget') {
        if (!道具.忘れる) return { ok: false, 文: '忘れる仕組みがありません' };
        const 語 = String(材料.term || '').trim();
        if (!語) return { ok: false, 文: '何を忘れるか、聞き取れませんでした' };
        const r = await 道具.忘れる(語);
        return { ok: true, 文: (r && r.文) || `「${語}」を忘れます（永久の記憶へ残してから）` };
    }

    return { ok: false, 文: `「${a}」は、裏からはまだ行えません` };
}

async function AIへ(道具, 道, 本文) {
    if (!道具.AI) throw new Error('AIエンジンがありません');
    return 道具.AI(道, 本文);
}

async function 一回(道具) {
    const 同期 = 道具.読む ? 道具.読む() : {};
    let 進;
    try {
        進 = await AIへ(道具, '/hq/advance', { 同期 });
    } catch (e) {
        return { ok: false, 訳: e.message };
    }
    if (!進 || 進.ok === false) return 進 || { ok: false };

    const 結果たち = [];
    for (const 手 of 進.書く手 || []) {
        let 結果;
        try {
            結果 = await 手を行う(手, 道具);
        } catch (e) {
            結果 = { ok: false, 文: '実行の途中で失敗しました: ' + e.message };
        }
        try {
            await AIへ(道具, '/hq/result', { id: 手.仕事id, 番号: 手.番号, 結果 });
        } catch { /* 結果を残せなくても、次の手へ */ }
        結果たち.push({ 手, 結果 });
    }
    return { ok: true, 書いた: 結果たち.length, 一覧: 進.一覧 };
}

function 見張りを始める(道具) {
    let 実行中 = false;
    const 回す = async () => {
        if (実行中) return;
        実行中 = true;
        try {
            await 一回(道具);
        } catch (e) {
            console.warn('[司令の列] 失敗しました:', e.message);
        } finally {
            実行中 = false;
        }
    };
    const 札 = setInterval(回す, 見張りの間隔);
    札.unref?.();
    setTimeout(回す, 15000).unref?.();
    return 札;
}

function 窓口を置く(app, 道具, 本人だけ) {
    app.get('/api/hq/status', async (req, res) => {
        if (!本人だけ(req, res)) return;
        try {
            const d = await AIへ(道具, '/hq/list', null);
            res.set('Cache-Control', 'no-store');
            res.json({
                ok: true,
                一覧: (d && d.一覧) || [],
                決まり: (d && d.決まり) || [],
            });
        } catch (e) {
            res.status(503).json({ ok: false, 訳: '司令塔に繋がりません: ' + e.message });
        }
    });

    app.post('/api/hq/submit', async (req, res) => {
        if (!本人だけ(req, res)) return;
        try {
            const d = await AIへ(道具, '/hq/submit', { text: (req.body || {}).text, 定時: false });
            if (d && d.分かった) {
                try { await 一回(道具); } catch { /* 積めたあと進められなくても、列には残る */ }
            }
            res.json(d);
        } catch (e) {
            res.status(503).json({ ok: false, 訳: e.message });
        }
    });

    app.post('/api/hq/approve', async (req, res) => {
        if (!本人だけ(req, res)) return;
        const b = req.body || {};
        try {
            const d = await AIへ(道具, '/hq/approve', { id: b.id, よい: b.よい !== false, 番号: b.番号 });
            for (const 手 of (d && d.書く手) || []) {
                const 結果 = await 手を行う(手, 道具);
                await AIへ(道具, '/hq/result', { id: 手.仕事id, 番号: 手.番号, 結果 });
            }
            try { await 一回(道具); } catch { /* 続けられなくても、門の返事は残る */ }
            res.json(d);
        } catch (e) {
            res.status(503).json({ ok: false, 訳: e.message });
        }
    });

    app.post('/api/hq/cancel', async (req, res) => {
        if (!本人だけ(req, res)) return;
        try {
            res.json(await AIへ(道具, '/hq/cancel', { id: (req.body || {}).id }));
        } catch (e) {
            res.status(503).json({ ok: false, 訳: e.message });
        }
    });

    app.post('/api/hq/screen-done', async (req, res) => {
        if (!本人だけ(req, res)) return;
        const b = req.body || {};
        try {
            const d = await AIへ(道具, '/hq/result', { id: b.id, 番号: b.番号, 結果: b.結果 });
            try { await 一回(道具); } catch { /* 次が進められなくても、この手の結果は残る */ }
            res.json(d);
        } catch (e) {
            res.status(503).json({ ok: false, 訳: e.message });
        }
    });

    app.post('/api/hq/config', async (req, res) => {
        if (!本人だけ(req, res)) return;
        try {
            res.json(await AIへ(道具, '/hq/rules', { 決まり: (req.body || {}).決まり }));
        } catch (e) {
            res.status(503).json({ ok: false, 訳: e.message });
        }
    });

    app.post('/api/hq/tick', async (req, res) => {
        if (!本人だけ(req, res)) return;
        try {
            res.json(await 一回(道具));
        } catch (e) {
            res.status(500).json({ ok: false, 訳: e.message });
        }
    });
}

module.exports = {
    同期の配列, 同期の配列を足す, 公開してよいか, 消してよいか,
    手を行う, 一回, 見張りを始める, 窓口を置く, 見張りの間隔,
};
