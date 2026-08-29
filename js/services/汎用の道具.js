/**
 * 何にでも使える道具
 *
 * なぜこれが要るのか:
 *
 *   ここまでエージェントができたのは、書かれた17個の作業だけだった。
 *   手順を教えても、その17個を並べ替えるだけ。
 *   だから「何でも代わりにやる」には、永久に届かなかった。
 *
 *   決まった作業ではなく、<b>何にでも使える道具</b>を渡す。
 *   読む・書く・数える・探す・作る・比べる——
 *   これらを組み合わせれば、決まっていない作業もできる。
 *
 *   包丁とまな板を渡すのと、決まった料理を17品覚えさせるのとの違い。
 *   道具があれば、教わっていない料理も作れる。
 *
 * 守っていること:
 *
 *   ・<b>消す道具は渡さない。</b>
 *     書き換えはできるが、消すことはできない。
 *     取り返しがつかないことを、道具として持たせない。
 *
 *   ・<b>外へ出る道具は渡さない。</b>
 *     この端末の中のものだけを扱う。
 *
 *   ・<b>何をしたかは、必ず残る。</b>
 *     道具が強いほど、記録が要る。
 *
 * すべてこの端末の中だけで動きます。外部へは一切送りません。
 */

/** 扱ってよいデータ。ここに無いものには触れない。 */
const 触れてよいもの = {
    商品: 'products',
    在庫: 'products',
    やること: 'areglm_tasks',
    タスク: 'areglm_tasks',
    メモ: 'areglm_memos',
    予定: 'areglm_events',
    売上: 'areglm_sales',
    ブランド: 'brands',
    投稿: 'areglm_sns_queue',
    ほしいもの: 'areglm_wishlist',
};

/** 記録 */
const 道具の記録の鍵 = 'areglm_tool_log';

function 道具を使った(道具, 中身, 結果) {
    let 記録 = [];
    try { 記録 = JSON.parse(localStorage.getItem(道具の記録の鍵) || '[]'); } catch { 記録 = []; }
    記録.push({
        道具,
        中身: String(中身 || '').slice(0, 80),
        結果: String(結果 || '').slice(0, 120),
        とき: new Date().toISOString(),
    });
    localStorage.setItem(道具の記録の鍵, JSON.stringify(記録.slice(-100)));
}

function 道具の記録を読む() {
    try { return JSON.parse(localStorage.getItem(道具の記録の鍵) || '[]'); } catch { return []; }
}

function _鍵にする(名) {
    const n = String(名 || '').trim();
    return 触れてよいもの[n] || (Object.values(触れてよいもの).includes(n) ? n : null);
}

// 名前は「道具で読む」。
// 「_読む」だと 気づき.js とぶつかり、
// const の二重宣言でページ全体が止まる。
// 同じ間違いを 自動で動く.js でも一度している。
function 道具で読む(鍵) {
    try {
        const r = JSON.parse(localStorage.getItem(鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

/* ==========================================================
   道具たち
   ========================================================== */

const 道具たち = {

    /**
     * 読む — 何が入っているかを見る
     *
     * 「商品を読む」「やることを読む」のように使う。
     * 絞り込みもできる。
     */
    読む(材料) {
        const 鍵 = _鍵にする(材料.何を);
        if (!鍵) {
            return { ok: false, 文: `「${材料.何を}」は扱えません。扱えるのは: ${Object.keys(触れてよいもの).join('、')}` };
        }

        let 一覧 = 道具で読む(鍵);

        // 絞り込み（例: 残りが3以下）
        if (材料.条件) {
            一覧 = 一覧.filter((x) => 条件に合うか(x, 材料.条件));
        }

        道具を使った('読む', `${材料.何を}${材料.条件 ? '（' + JSON.stringify(材料.条件) + '）' : ''}`,
            `${一覧.length}件`);

        return {
            ok: true,
            文: `${材料.何を}: ${一覧.length}件`
                + (一覧.length ? '\n' + 一覧.slice(0, 5).map((x) => '・' + 見出しにする(x)).join('\n') : ''),
            中身: 一覧,
        };
    },

    /**
     * 書く — 足す、または直す
     *
     * <b>消すことはできない。</b>取り返しがつかないため。
     */
    書く(材料) {
        const 鍵 = _鍵にする(材料.何を);
        if (!鍵) return { ok: false, 文: `「${材料.何を}」は扱えません` };
        if (!材料.中身 || typeof 材料.中身 !== 'object') {
            return { ok: false, 文: '書く中身がありません' };
        }

        const 一覧 = 道具で読む(鍵);

        // 目印があれば、それを直す。無ければ足す。
        let 様子;
        if (材料.目印) {
            const i = 一覧.findIndex((x) =>
                x.id === 材料.目印 || x.sku === 材料.目印 || x.name === 材料.目印);
            if (i < 0) return { ok: false, 文: `「${材料.目印}」が見つかりません` };
            Object.assign(一覧[i], 材料.中身);
            様子 = `「${材料.目印}」を直しました`;
        } else {
            一覧.push(Object.assign({
                id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                createdAt: new Date().toISOString(),
            }, 材料.中身));
            様子 = `${材料.何を}に1件 足しました`;
        }

        localStorage.setItem(鍵, JSON.stringify(一覧));
        画面を描き直す(鍵);
        道具を使った('書く', 材料.何を, 様子);

        return { ok: true, 文: 様子 + `（全${一覧.length}件）` };
    },

    /**
     * 数える — 合計・平均・件数を出す
     */
    数える(材料) {
        const 鍵 = _鍵にする(材料.何を);
        if (!鍵) return { ok: false, 文: `「${材料.何を}」は扱えません` };

        let 一覧 = 道具で読む(鍵);
        if (材料.条件) 一覧 = 一覧.filter((x) => 条件に合うか(x, 材料.条件));

        const 項目 = 材料.項目;
        if (!項目) {
            道具を使った('数える', 材料.何を, `${一覧.length}件`);
            return { ok: true, 文: `${材料.何を}: ${一覧.length}件`, 値: 一覧.length };
        }

        const 数たち = 一覧.map((x) => Number(x[項目])).filter((n) => !Number.isNaN(n));
        if (!数たち.length) return { ok: false, 文: `「${項目}」に数が入っていません` };

        const 合計 = 数たち.reduce((a, b) => a + b, 0);
        const やり方 = 材料.やり方 || '合計';
        const 値 = {
            合計,
            平均: 合計 / 数たち.length,
            最大: Math.max(...数たち),
            最小: Math.min(...数たち),
        }[やり方];

        if (値 === undefined) return { ok: false, 文: `「${やり方}」は分かりません（合計・平均・最大・最小）` };

        道具を使った('数える', `${材料.何を}の${項目}の${やり方}`, String(Math.round(値)));
        return {
            ok: true,
            文: `${材料.何を}の${項目}の${やり方}: ${値.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}`
                + `（${数たち.length}件から）`,
            値,
        };
    },

    /**
     * 探す — 全部の中から言葉で探す
     */
    探す(材料) {
        const 言葉 = String(材料.言葉 || '').trim().toLowerCase();
        if (!言葉) return { ok: false, 文: '何を探すか、教えてください' };

        const 見つけた = [];
        Object.entries(触れてよいもの).forEach(([名, 鍵]) => {
            道具で読む(鍵).forEach((x) => {
                if (JSON.stringify(x).toLowerCase().includes(言葉)) {
                    見つけた.push({ どこ: 名, 中身: 見出しにする(x) });
                }
            });
        });

        // 同じものが複数の名前で入っているので、重複を落とす
        const 重複なし = [];
        const 見た = new Set();
        見つけた.forEach((x) => {
            const 鍵 = x.どこ + '|' + x.中身;
            if (!見た.has(鍵)) { 見た.add(鍵); 重複なし.push(x); }
        });

        道具を使った('探す', 言葉, `${重複なし.length}件`);

        return {
            ok: true,
            文: 重複なし.length
                ? `「${材料.言葉}」で ${重複なし.length}件 見つかりました\n`
                    + 重複なし.slice(0, 8).map((x) => `・[${x.どこ}] ${x.中身}`).join('\n')
                : `「${材料.言葉}」は見つかりませんでした`,
            中身: 重複なし,
        };
    },

    /**
     * 比べる — 二つの数を比べて、次にどうするかを決める
     *
     * 手順の中で「もし〜なら」を作るための道具。
     */
    比べる(材料) {
        const 左 = Number(材料.左);
        const 右 = Number(材料.右);
        if (Number.isNaN(左) || Number.isNaN(右)) {
            return { ok: false, 文: '数で比べてください' };
        }
        const やり方 = 材料.やり方 || '以下';
        const 結果 = {
            '以下': 左 <= 右,
            '以上': 左 >= 右,
            '未満': 左 < 右,
            'より大きい': 左 > 右,
            '同じ': 左 === 右,
        }[やり方];

        if (結果 === undefined) return { ok: false, 文: `「${やり方}」は分かりません` };

        道具を使った('比べる', `${左} ${やり方} ${右}`, 結果 ? 'あてはまる' : 'あてはまらない');
        return {
            ok: true,
            文: `${左} は ${右} ${やり方}: ${結果 ? 'はい' : 'いいえ'}`,
            値: 結果,
            続ける: 結果,          // あてはまらなければ、後の手順を飛ばす
        };
    },

    /** 知らせる — 画面に出す */
    知らせる(材料) {
        const 文 = String(材料.文 || '').trim();
        if (!文) return { ok: false, 文: '何を知らせるか、教えてください' };
        if (typeof showNotification === 'function') showNotification(文, 'info');
        道具を使った('知らせる', 文, '出しました');
        return { ok: true, 文 };
    },

    /** 画面を開く */
    開く(材料) {
        const どこ = String(材料.どこ || '').trim();
        const 対応 = {
            ホーム: 'dashboard', 在庫: 'inventory', ブランド: 'brands',
            SNS: 'sns', 開発: 'develop', 設定: 'settings', エージェント: 'mainai',
        };
        const 先 = 対応[どこ] || どこ;
        if (typeof switchPage !== 'function') return { ok: false, 文: '画面を切り替えられません' };
        switchPage(先);
        道具を使った('開く', どこ, '開きました');
        return { ok: true, 文: `${どこ} を開きました` };
    },

    /** 書き出す — CSVにして手元に落とす */
    書き出す(材料) {
        const 鍵 = _鍵にする(材料.何を);
        if (!鍵) return { ok: false, 文: `「${材料.何を}」は扱えません` };

        const 一覧 = 道具で読む(鍵);
        if (!一覧.length) return { ok: false, 文: `${材料.何を}が空です` };

        const 見出し = [...new Set(一覧.flatMap((x) => Object.keys(x)))];
        const 行 = [見出し.join(',')];
        一覧.forEach((x) => {
            行.push(見出し.map((k) => {
                const v = x[k] == null ? '' : String(x[k]);
                return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
            }).join(','));
        });

        const 塊 = new Blob(['﻿' + 行.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(塊);
        a.download = `${材料.何を}_${(typeof 日付文字 === 'function' ? 日付文字(new Date()) : 'export')}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);

        道具を使った('書き出す', 材料.何を, `${一覧.length}件`);
        return { ok: true, 文: `${材料.何を} ${一覧.length}件を書き出しました` };
    },
};

/* ==========================================================
   中で使うもの
   ========================================================== */

/** 条件に合うか（{項目, やり方, 値}） */
function 条件に合うか(もの, 条件) {
    if (!条件 || !条件.項目) return true;
    const 実 = もの[条件.項目];
    const 数 = Number(実);
    const 目 = Number(条件.値);

    switch (条件.やり方 || '以下') {
        case '以下': return !Number.isNaN(数) && 数 <= 目;
        case '以上': return !Number.isNaN(数) && 数 >= 目;
        case '未満': return !Number.isNaN(数) && 数 < 目;
        case 'より大きい': return !Number.isNaN(数) && 数 > 目;
        case '同じ': return String(実) === String(条件.値);
        case '含む': return String(実 || '').includes(String(条件.値));
        default: return true;
    }
}

/** 一件を、人に見せる一行にする */
function 見出しにする(もの) {
    const 名 = もの.name || もの.title || もの.題 || もの.言葉 || もの.sku || '';
    const 部品 = [名];
    if (もの.quantity != null) 部品.push(`残り${もの.quantity}`);
    if (もの.price != null) 部品.push(`¥${Number(もの.price).toLocaleString('ja-JP')}`);
    if (もの.due) 部品.push(`期限${もの.due}`);
    return 部品.filter(Boolean).join(' / ') || JSON.stringify(もの).slice(0, 50);
}

/** 変えたものを、画面に反映する */
function 画面を描き直す(鍵) {
    const 表 = {
        products: ['refreshInventory', 'loadBrandsData'],
        areglm_tasks: ['renderTaskList'],
        areglm_memos: ['renderMemos'],
        areglm_events: ['renderCalendar'],
        brands: ['loadBrandsData'],
    }[鍵] || [];
    表.forEach((名) => {
        if (typeof window[名] === 'function') {
            try { window[名](); } catch { /* 描き直せなくても、保存はできている */ }
        }
    });
}

/** どんな道具があるか（教えるとき・説明するときに使う） */
function 道具の一覧() {
    return [
        { 名: '読む', 説: 'データを見る', 材料: '何を（商品/やること/メモ…）、条件（任意）' },
        { 名: '書く', 説: '足す・直す（消すことはできません）', 材料: '何を、中身、目印（直すとき）' },
        { 名: '数える', 説: '合計・平均・最大・最小・件数', 材料: '何を、項目、やり方' },
        { 名: '探す', 説: '全部の中から言葉で探す', 材料: '言葉' },
        { 名: '比べる', 説: '数を比べて、続けるかを決める', 材料: '左、右、やり方' },
        { 名: '知らせる', 説: '画面に出す', 材料: '文' },
        { 名: '開く', 説: '画面を切り替える', 材料: 'どこ' },
        { 名: '書き出す', 説: 'CSVにして手元に落とす', 材料: '何を' },
    ];
}

window.道具たち = 道具たち;
window.道具の一覧 = 道具の一覧;
window.道具の記録を読む = 道具の記録を読む;
window.触れてよいもの = 触れてよいもの;
