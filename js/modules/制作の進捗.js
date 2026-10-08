/**
 * 制作の進捗と、公開前チェック（TUDURI／INTGLM）
 *
 * Driveの進捗ログを開かなくても、「どこまで進んだか」「次は何番か」が
 * このツールの中で分かるようにする。判定の中身は
 * js/services/公開前チェック.js（画面に依存しない部分）。
 *
 * 守っていること:
 *   ・SUZURIの「商品を公開する」ボタンは、あなた自身が押す。ここは公開しない。
 *     「公開した」は、押した後にあなたが記録するボタン。
 *   ・消さない。使わなくなったものは「見送り」にして、記録は残す。
 *   ・内容を直したら、いったん「案」に戻し、目での確認もやり直す
 *     （確認したあとで中身が変わったものを、そのまま公開可にしないため）。
 */

const 進捗の鍵 = 'areglm_production_log';

function 進捗を読む() {
    try {
        const r = JSON.parse(localStorage.getItem(進捗の鍵) || '[]');
        return Array.isArray(r) ? r : [];
    } catch { return []; }
}

function 進捗を書く(一覧) {
    localStorage.setItem(進捗の鍵, JSON.stringify(一覧));
}

function 進捗_要素(タグ, 文字, クラス) {
    const e = document.createElement(タグ);
    if (文字 != null) e.textContent = 文字;
    if (クラス) e.className = クラス;
    return e;
}

function 進捗_欄(ラベル, id, 種類, 既定, 選択肢) {
    const 枠 = 進捗_要素('div', null, 'form-group');
    const l = 進捗_要素('label', ラベル);
    l.htmlFor = id;
    let 入力;
    if (選択肢) {
        入力 = document.createElement('select');
        選択肢.forEach(([値, 名]) => {
            const o = document.createElement('option');
            o.value = 値;
            o.textContent = 名;
            入力.appendChild(o);
        });
    } else {
        入力 = document.createElement('input');
        入力.type = 種類 || 'text';
        入力.maxLength = 60;
    }
    入力.id = id;
    入力.value = 既定 == null ? '' : 既定;
    枠.append(l, 入力);
    return 枠;
}

const 状態の表示 = { 案: '案', 公開可: '公開前チェック済み', 公開済み: '公開済み', 見送り: '見送り' };

let 編集中のid = null;
let 開いているid = null;

function 進捗を描く() {
    const 箱 = document.getElementById('production-panel');
    if (!箱) return;
    箱.textContent = '';

    const 全部 = 進捗を読む();
    const P = window.AREGLM_PREPUBLISH;
    箱.appendChild(進捗_要素('p', `次のTUDURIの番号は No.${P.次のTUDURIの番号(全部)} です（記録済みの1〜20の続き）。`, 'hint'));

    /* ---- 追加・編集フォーム ---- */
    const 編集 = 編集中のid ? 全部.find((x) => x.id === 編集中のid) : null;
    const f = document.createElement('form');
    f.className = 'login-form';
    f.appendChild(進捗_要素('h4', 編集 ? '内容を直す' : '新しく記録する'));

    const 系列 = 進捗_欄('シリーズ', 'prod-series', null, 編集 ? 編集.series : 'TUDURI', [['TUDURI', 'TUDURI'], ['INTGLM', 'INTGLM']]);
    if (編集) 系列.querySelector('select').disabled = true;
    const 欄たち = {
        番号: 進捗_欄('番号（TUDURI）', 'prod-no', 'number', 編集 ? 編集.no : P.次のTUDURIの番号(全部)),
        系統: 進捗_欄('系統（TUDURI）', 'prod-keitou', null, 編集 ? 編集.keitou : 'A',
            [['A', '系統A（Drive資料を参照）'], ['B', '系統B（完全オリジナル）']]),
        名前: 進捗_欄('名前', 'prod-name', null, 編集 ? 編集.name : ''),
        品目: 進捗_欄('品目（Tシャツ・パーカー等）', 'prod-item', null, 編集 ? 編集.item : ''),
        価格: 進捗_欄('価格（円）', 'prod-price', 'number', 編集 ? 編集.price : ''),
        素材: 進捗_欄('素材（INTGLM）', 'prod-material', null, 編集 ? 編集.material : ''),
        シルエット: 進捗_欄('シルエット（INTGLM）', 'prod-silhouette', null, 編集 ? 編集.silhouette : ''),
        配色: 進捗_欄('配色（INTGLM）', 'prod-palette', null, 編集 ? 編集.palette : ''),
        装飾: 進捗_欄('装飾技法（INTGLM）', 'prod-decoration', null, 編集 ? 編集.decoration : ''),
        メモ: 進捗_欄('メモ', 'prod-notes', null, 編集 ? 編集.notes : ''),
    };
    f.appendChild(系列);
    Object.values(欄たち).forEach((e) => f.appendChild(e));

    const 切替 = () => {
        const tud = 系列.querySelector('select').value === 'TUDURI';
        ['番号', '系統'].forEach((k) => { 欄たち[k].hidden = !tud; });
        ['素材', 'シルエット', '配色', '装飾'].forEach((k) => { 欄たち[k].hidden = tud; });
    };
    系列.querySelector('select').addEventListener('change', 切替);
    切替();

    const 保存 = 進捗_要素('button', 編集 ? '保存する' : '記録する', 'btn btn-primary');
    保存.type = 'submit';
    f.appendChild(保存);
    if (編集) {
        const やめる = 進捗_要素('button', 'やめる', 'btn btn-secondary');
        やめる.type = 'button';
        やめる.addEventListener('click', () => { 編集中のid = null; 進捗を描く(); });
        f.appendChild(やめる);
    }
    const v = (id) => document.getElementById(id).value.trim();
    f.addEventListener('submit', (e) => {
        e.preventDefault();
        const series = 系列.querySelector('select').value;
        const 一覧 = 進捗を読む();
        const 値 = {
            series,
            no: series === 'TUDURI' ? Number(v('prod-no')) || null : null,
            keitou: series === 'TUDURI' ? v('prod-keitou') : '',
            name: v('prod-name'), item: v('prod-item'), price: Number(v('prod-price')) || 0,
            material: series === 'INTGLM' ? v('prod-material') : '',
            silhouette: series === 'INTGLM' ? v('prod-silhouette') : '',
            palette: series === 'INTGLM' ? v('prod-palette') : '',
            decoration: series === 'INTGLM' ? v('prod-decoration') : '',
            notes: v('prod-notes'),
        };
        if (!値.name) { showNotification('名前を入れてください', 'error'); return; }
        if (編集) {
            const 対象 = 一覧.find((x) => x.id === 編集.id);
            Object.assign(対象, 値);
            // 直したら、確認し直す
            対象.状態 = '案';
            対象.確認 = {};
        } else {
            一覧.push({
                id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                ...値, 状態: '案', 確認: {}, createdAt: new Date().toISOString(),
            });
        }
        進捗を書く(一覧);
        編集中のid = null;
        進捗を描く();
        showNotification('記録しました', 'success');
    });
    箱.appendChild(f);

    /* ---- 一覧 ---- */
    const 並び = 全部.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!並び.length) {
        箱.appendChild(進捗_要素('p', 'まだ記録がありません。', 'hint'));
        return;
    }
    const ul = 進捗_要素('ul', null, 'monitor-list');
    並び.forEach((x) => {
        const li = 進捗_要素('li', null, 'monitor-item');
        const 見出し = x.series === 'TUDURI' ? `TUDURI No.${x.no ?? '？'}（系統${x.keitou || '？'}）` : 'INTGLM';
        li.appendChild(進捗_要素('strong', `${見出し} ${x.name}`));
        li.appendChild(進捗_要素('span', ` — ${状態の表示[x.状態] || x.状態}`));
        const 開く = 進捗_要素('button', 開いているid === x.id ? '閉じる' : '確認する', 'btn btn-sm btn-secondary');
        開く.type = 'button';
        開く.addEventListener('click', () => { 開いているid = 開いているid === x.id ? null : x.id; 進捗を描く(); });
        li.append(' ', 開く);
        if (開いているid === x.id) li.appendChild(進捗の詳細(x, 全部));
        ul.appendChild(li);
    });
    箱.appendChild(ul);
}

function 進捗の詳細(作品, 全部) {
    const P = window.AREGLM_PREPUBLISH;
    const 判定 = P.判定(作品, 全部);
    const 枠 = 進捗_要素('div', null, 'prepublish-detail');
    const 変更 = (関数) => {
        const 一覧 = 進捗を読む();
        const 対象 = 一覧.find((y) => y.id === 作品.id);
        関数(対象);
        進捗を書く(一覧);
        進捗を描く();
    };

    枠.appendChild(進捗_要素('h5', '自動で確かめたこと'));
    const 記号 = { ok: '✅', ng: '❌', info: 'ℹ️' };
    判定.自動.forEach((c) => 枠.appendChild(進捗_要素('p', `${記号[c.状態] || ''} ${c.件} — ${c.訳}`, c.状態 === 'ng' ? 'prepublish-ng' : '')));

    枠.appendChild(進捗_要素('h5', '目で確かめること（あなたが見て、チェックを入れます）'));
    判定.手動.forEach((m) => {
        const 行 = document.createElement('label');
        行.style.display = 'block';
        const ck = document.createElement('input');
        ck.type = 'checkbox';
        ck.checked = m.済み;
        ck.disabled = 作品.状態 === '公開済み' || 作品.状態 === '見送り';
        ck.addEventListener('change', () => 変更((y) => {
            y.確認 = y.確認 || {};
            y.確認[m.id] = ck.checked;
            // 確認を外したら、公開前チェック済みではなくなる
            if (!ck.checked && y.状態 === '公開可') y.状態 = '案';
        }));
        行.append(ck, ' ' + m.文);
        枠.appendChild(行);
    });

    const 並び = 進捗_要素('div', null, 'guard-row');
    if (作品.状態 === '案') {
        const 完了 = 進捗_要素('button', '公開前チェックを完了にする', 'btn btn-primary');
        完了.type = 'button';
        完了.disabled = !判定.完了できる;
        完了.addEventListener('click', () => 変更((y) => { y.状態 = '公開可'; }));
        並び.appendChild(完了);
        if (!判定.完了できる) {
            枠.appendChild(進捗_要素('p', `あと、直すところ ${判定.直すところ}件・目で確認 ${判定.未確認}件 です。`, 'hint'));
        }
    }
    if (作品.状態 === '公開可') {
        枠.appendChild(進捗_要素('p', 'チェックは完了です。SUZURIの「商品を公開する」ボタンは、あなた自身で押してください（こちらからは押しません）。', 'notice-strict'));
        const 済 = 進捗_要素('button', 'SUZURIで公開した（押した後に記録）', 'btn btn-primary');
        済.type = 'button';
        済.addEventListener('click', () => 変更((y) => {
            y.状態 = '公開済み';
            y.publishedAt = new Date().toISOString();
            if (window.logActivity) logActivity(`${y.series} ${y.name} を公開済みとして記録`, { category: 'production' });
        }));
        並び.appendChild(済);
    }
    if (作品.状態 === '案' || 作品.状態 === '公開可') {
        const 直す = 進捗_要素('button', '内容を直す', 'btn btn-secondary');
        直す.type = 'button';
        直す.addEventListener('click', () => { 編集中のid = 作品.id; 進捗を描く(); });
        const 見送る = 進捗_要素('button', '見送りにする（記録は残ります）', 'btn btn-secondary');
        見送る.type = 'button';
        見送る.addEventListener('click', () => {
            if (confirm('この作品を「見送り」にします。記録は消えません。よろしいですか？')) 変更((y) => { y.状態 = '見送り'; });
        });
        並び.append(直す, 見送る);
    }
    if (作品.状態 === '見送り') {
        const 戻す = 進捗_要素('button', '案に戻す', 'btn btn-secondary');
        戻す.type = 'button';
        戻す.addEventListener('click', () => 変更((y) => { y.状態 = '案'; y.確認 = {}; }));
        並び.appendChild(戻す);
    }
    枠.appendChild(並び);
    return 枠;
}

function init制作の進捗() {
    if (document.getElementById('production-panel')) 進捗を描く();
}

window.init制作の進捗 = init制作の進捗;
window.render制作の進捗 = 進捗を描く;
