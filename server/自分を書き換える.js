/**
 * 自分のコードを、安全に書き換える
 *
 * なぜこれを作るのか:
 *
 *   「Claude Code のように、自分のコードを書き換えたい」と言われた。
 *
 *   正直に書いておく。
 *   <b>この道具の自作AIには、コードを書く能力がない。</b>
 *   覚えた文から答えを引き、分類することはできるが、
 *   JavaScript を組み立てることはできない。
 *   決まりではなく、能力の話。
 *
 *   だが、コードを書く以外の部分——
 *   読む・控えを取る・書き換える・検査する・駄目なら戻す——
 *   これは全部できる。Claude Code がやっていることの大半はここ。
 *
 *   だから、その部分を道具自身に持たせる。
 *   コードは人（または私）が書き、
 *   <b>当てる・確かめる・戻す</b>は道具が自分でやる。
 *
 * 絶対に守ること:
 *
 *   ・<b>触れてよい場所を限る。</b>
 *     歯止めそのもの（門番・外に出さない・ルール）には触らせない。
 *     鍵を掛けた本人が鍵を壊せるなら、掛けた意味がない。
 *
 *   ・<b>書き換える前に、必ず控えを取る。</b>
 *     戻せない変更は、変更ではなく事故。
 *
 *   ・<b>書き換えたら、必ず検査する。</b>
 *     文法と、名前の衝突を見る。
 *     駄目なら、その場で自動的に戻す。人を待たない。
 *
 *   ・<b>何をしたかを全部残す。</b>
 *     いつ・どのファイルを・どう変えたか。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const 本体 = path.join(__dirname, '..');
const 控えの場所 = path.join(__dirname, 'data', 'コードの控え');
const 記録の道 = path.join(__dirname, 'data', '書き換えの記録.json');

/**
 * 触れてよい場所。
 *
 * 画面と、画面の中身だけ。
 * サーバー・AI・歯止めには触らせない。
 */
const 触れてよい = [
    'js/modules/',
    'js/services/',
    'js/config/',
    'css/',
];

/**
 * 絶対に触れてはいけないファイル。
 *
 * これらは歯止めそのもの。
 * ここを書き換えられるなら、他の歯止めは全部意味を失う。
 */
const 触れてはいけない = [
    'js/core/外に出さない.js',      // 外へ出るのを止めている
    'js/modules/rules-ui.js',       // 変えられないルール
    'js/modules/引き継ぎ.js',       // 歯止めを確かめる仕組み
    'server/門番.js',
    'server/自分を書き換える.js',   // これ自身
    'tools/static-check.js',        // 検査そのもの
];

function 記録を読む() {
    try {
        const r = JSON.parse(fs.readFileSync(記録の道, 'utf8'));
        return Array.isArray(r) ? r : [];
    } catch {
        return [];
    }
}

function 記録を残す(中身) {
    const 記録 = 記録を読む();
    記録.push(Object.assign({ とき: new Date().toISOString() }, 中身));
    const 場所 = path.dirname(記録の道);
    if (!fs.existsSync(場所)) fs.mkdirSync(場所, { recursive: true });
    fs.writeFileSync(記録の道, JSON.stringify(記録.slice(-200), null, 2));
}

/**
 * その場所に触れてよいか。
 *
 * 迷ったら断る。
 * 分からないものを通すのが、いちばん危ない。
 */
function 触れてよいか(相対の道) {
    const 道 = String(相対の道 || '').replace(/\\/g, '/');

    // 上へ抜ける書き方は、まず断る
    if (道.includes('..') || 道.startsWith('/')) {
        return { よい: false, 訳: '場所の書き方が正しくありません' };
    }

    if (触れてはいけない.some((x) => 道 === x || 道.endsWith('/' + x))) {
        return {
            よい: false,
            訳: `「${道}」は歯止めそのものなので、書き換えられません。`
                + '鍵を掛けた本人が鍵を壊せるなら、掛けた意味がありません。',
        };
    }

    if (!触れてよい.some((x) => 道.startsWith(x))) {
        return {
            よい: false,
            訳: `「${道}」は触れてよい場所の外です。`
                + `触れてよいのは: ${触れてよい.join('、')}`,
        };
    }

    return { よい: true };
}

/** いま何があるかを一覧する */
function 一覧する() {
    const 出 = [];
    触れてよい.forEach((場所) => {
        const 実 = path.join(本体, 場所);
        if (!fs.existsSync(実)) return;
        fs.readdirSync(実).forEach((f) => {
            if (!/\.(js|css)$/.test(f)) return;
            const 道 = 場所 + f;
            const 情報 = fs.statSync(path.join(本体, 道));
            出.push({
                道,
                大きさ: 情報.size,
                直した日: 情報.mtime.toISOString().slice(0, 10),
                書き換えられるか: 触れてよいか(道).よい,
            });
        });
    });
    return 出.sort((a, b) => a.道.localeCompare(b.道));
}

/** 中身を読む */
function 読む(相対の道) {
    const 可否 = 触れてよいか(相対の道);
    if (!可否.よい) return { ok: false, 訳: 可否.訳 };

    const 実 = path.join(本体, 相対の道);
    if (!fs.existsSync(実)) return { ok: false, 訳: 'そのファイルはありません' };

    return {
        ok: true,
        道: 相対の道,
        中身: fs.readFileSync(実, 'utf8'),
    };
}

/** 控えを取る */
function 控えを取る(相対の道) {
    if (!fs.existsSync(控えの場所)) fs.mkdirSync(控えの場所, { recursive: true });
    const 刻 = new Date().toISOString().replace(/[:.]/g, '-');
    const 名 = 相対の道.replace(/\//g, '__') + '.' + 刻;
    const 先 = path.join(控えの場所, 名);
    fs.copyFileSync(path.join(本体, 相対の道), 先);
    return 名;
}

/**
 * 検査する。
 *
 * 文法と、名前の衝突を見る。
 * 名前の衝突は、画面全体を止めるので、必ず見る。
 */
function 検査する() {
    const 結果 = { 文法: true, 衝突: true, 訳: [] };

    try {
        execFileSync('node', [path.join(本体, 'tools', 'static-check.js')],
            { cwd: 本体, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
        結果.衝突 = false;
        結果.訳.push(String(e.stdout || e.message).trim().slice(0, 400));
    }

    return 結果;
}

/**
 * 書き換える。
 *
 * 流れ:
 *   1. 触れてよいか見る
 *   2. 控えを取る
 *   3. 書く
 *   4. 文法を見る
 *   5. 全体を検査する
 *   6. 駄目なら、その場で戻す
 *
 * 5で駄目だったときに人を待たない。自分で戻す。
 * 壊れたまま待つ時間があってはいけない。
 */
function 書き換える(相対の道, 新しい中身, 訳) {
    const 可否 = 触れてよいか(相対の道);
    if (!可否.よい) {
        記録を残す({ 道: 相対の道, 様子: '断りました', 訳: 可否.訳 });
        return { ok: false, 訳: 可否.訳 };
    }

    const 実 = path.join(本体, 相対の道);
    if (!fs.existsSync(実)) return { ok: false, 訳: 'そのファイルはありません' };
    if (typeof 新しい中身 !== 'string' || !新しい中身.trim()) {
        return { ok: false, 訳: '中身が空です。空にするのは書き換えではありません' };
    }

    // 控えを取る。ここを飛ばすことはしない。
    const 控え = 控えを取る(相対の道);

    fs.writeFileSync(実, 新しい中身);

    // 文法を見る（JSのみ）
    if (/\.js$/.test(相対の道)) {
        try {
            execFileSync('node', ['--check', 実], { encoding: 'utf8', stdio: 'pipe' });
        } catch (e) {
            戻す(相対の道, 控え);
            const 訳2 = '文法が通りませんでした: ' + String(e.stderr || e.message).slice(0, 300);
            記録を残す({ 道: 相対の道, 様子: '戻しました', 訳: 訳2, 控え });
            return { ok: false, 訳: 訳2, 戻した: true };
        }
    }

    // ストッパーに掛ける。
    //
    // 文法が通っても、渡してよいとは限らない。
    // 外国語の混入、外へ出る通信、消す処理——
    // 動くけれど渡してはいけないものを、ここで止める。
    const 止まり = ストッパーに掛ける(相対の道);
    if (止まり.止める.length) {
        戻す(相対の道, 控え);
        const 訳2 = 'ストッパーが止めました: '
            + 止まり.止める.map((x) => `${x.件}（${x.直し方}）`).join(' / ').slice(0, 300);
        記録を残す({ 道: 相対の道, 様子: '戻しました', 訳: 訳2, 控え });
        return { ok: false, 訳: 訳2, 戻した: true };
    }

    // 全体を検査する
    const 検査 = 検査する();
    if (!検査.衝突) {
        戻す(相対の道, 控え);
        const 訳2 = '検査で止まりました: ' + 検査.訳.join(' / ');
        記録を残す({ 道: 相対の道, 様子: '戻しました', 訳: 訳2, 控え });
        return { ok: false, 訳: 訳2, 戻した: true };
    }

    記録を残す({
        道: 相対の道,
        様子: '書き換えました',
        訳: 訳 || '',
        控え,
        大きさ: 新しい中身.length,
    });

    return {
        ok: true,
        訳: `${相対の道} を書き換えました。文法・検査とも通っています。`,
        控え,
    };
}

/**
 * ストッパーに掛ける。
 *
 * 文法が通っても、渡してよいとは限らない。
 * 動くけれど渡してはいけないものがある。
 *
 * 見て報告するだけでは足りない。ここで止める。
 */
function ストッパーに掛ける(相対の道) {
    try {
        const ストッパー = require(path.join(本体, 'tools', 'ストッパー.js'));
        const 見つけた = ストッパー.見張る(相対の道);
        return {
            止める: 見つけた.filter((x) => x.重さ >= 3),
            直す: 見つけた.filter((x) => x.重さ === 2),
        };
    } catch (e) {
        // ストッパーが動かないときは、<b>通さない</b>。
        //
        // ここははじめ「動かなくても通す」にしていた。
        // それで実際に事故が起きた——
        // 名前を変えたときに書き出す名前を直し忘れ、
        // ストッパーが毎回失敗していたのに、
        // 失敗が握りつぶされて、外国語も外部通信も素通りした。
        //
        // 止めるものが動かないなら、止まっているのと同じ扱いにする。
        // 「たぶん大丈夫」で通すのが、いちばん危ない。
        console.error('ストッパーを呼べません:', e.message);
        return {
            止める: [{
                件: 'ストッパーが動きません: ' + e.message,
                直し方: 'ストッパー自体が壊れています。'
                    + '止めるものが動かない状態で書き換えることはできません。',
            }],
            直す: [],
        };
    }
}

function 戻す(相対の道, 控えの名) {
    const 元 = path.join(控えの場所, 控えの名);
    if (!fs.existsSync(元)) return false;
    fs.copyFileSync(元, path.join(本体, 相対の道));
    return true;
}

/** 控えの一覧（戻したいときのため） */
function 控えの一覧(相対の道) {
    if (!fs.existsSync(控えの場所)) return [];
    const 前 = 相対の道 ? 相対の道.replace(/\//g, '__') + '.' : '';
    return fs.readdirSync(控えの場所)
        .filter((f) => !前 || f.startsWith(前))
        .sort()
        .reverse()
        .slice(0, 20)
        .map((f) => ({
            名: f,
            道: f.split('.')[0].replace(/__/g, '/'),
            とき: f.split('.').slice(1).join('.').replace(/-/g, ':').slice(0, 19),
        }));
}

module.exports = {
    一覧する,
    読む,
    書き換える,
    戻す,
    控えの一覧,
    記録を読む,
    触れてよいか,
    触れてよい,
    触れてはいけない,
};
