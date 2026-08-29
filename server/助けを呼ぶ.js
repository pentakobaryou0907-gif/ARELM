/**
 * 非常事態に、助けを呼ぶ
 *
 * なぜこれを作るのか:
 *
 *   壊れたとき、いちばん困るのは
 *   「何が起きているかを説明できないこと」。
 *
 *   画面が真っ白になった、動かなくなった——
 *   そのとき、何を見て、何を伝えればいいのか分からない。
 *   分からないまま「壊れました」とだけ言っても、直すのに時間がかかる。
 *
 *   だから、押した瞬間に<b>いま何が起きているかを全部まとめて</b>、
 *   そのまま渡せる形にしておく。
 *
 * 何を集めるのか:
 *   ・検査の結果（どこが壊れているか）
 *   ・サーバーが動いているか
 *   ・直近の記録（何をした後に壊れたか）
 *   ・最後に書き換えたもの（それが原因かもしれない）
 *   ・戻せる控えがあるか
 *
 * 集めたものは写しておく。貼るだけで済むように。
 *
 * すべてこの端末の中で集めます。外部へは一切送りません。
 * 送るかどうかは、あなたが決めます。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const 本体 = path.join(__dirname, '..');

/** すぐ終わる形で試す。壊れているときに待たされたくない。 */
function 短く試す(命令, 引数, 秒) {
    try {
        return execFileSync(命令, 引数, {
            cwd: 本体,
            encoding: 'utf8',
            timeout: (秒 || 10) * 1000,
            stdio: 'pipe',
        }).trim();
    } catch (e) {
        return String(e.stdout || e.stderr || e.message).trim();
    }
}

function 生きているか(港, 道) {
    return new Promise((応え) => {
        const q = http.get({ host: '127.0.0.1', port: 港, path: 道 || '/', timeout: 2500 },
            (r) => { r.resume(); 応え(r.statusCode < 500); });
        q.on('error', () => 応え(false));
        q.on('timeout', () => { q.destroy(); 応え(false); });
    });
}

/**
 * いま何が起きているかを集める。
 */
async function 様子を集める(本人の言葉) {
    const 行 = [];

    行.push('# AReGLM 非常事態の報せ');
    行.push('');
    行.push(`時刻: ${new Date().toLocaleString('ja-JP')}`);
    行.push('');

    if (本人の言葉) {
        行.push('## 何が起きているか（本人の言葉）');
        行.push('');
        行.push(String(本人の言葉).slice(0, 500));
        行.push('');
    }

    /* --- いちばん見てほしいもの: 検査 --- */
    行.push('## 検査の結果');
    行.push('');
    const 名前の衝突 = 短く試す('node', [path.join(本体, 'tools', 'static-check.js')], 30);
    行.push('### 名前の衝突（画面が真っ白になる原因）');
    行.push('```');
    行.push(名前の衝突.slice(0, 800) || '（出力なし）');
    行.push('```');
    行.push('');

    const 止まり = 短く試す('node', [path.join(本体, 'tools', 'ストッパー.js')], 60);
    行.push('### ストッパー');
    行.push('```');
    行.push(止まり.slice(0, 1200) || '（出力なし）');
    行.push('```');
    行.push('');

    /* --- サーバー --- */
    行.push('## サーバーが動いているか');
    行.push('');
    const 港たち = [
        ['入口（8090）', 8090, '/'],
        ['入口（8080）', 8080, '/api/health'],
        ['自作AI（8765）', 8765, '/health'],
    ];
    for (const [名, 港, 道] of 港たち) {
        const 生きて = await 生きているか(港, 道);
        行.push(`- ${名}: ${生きて ? '動いています' : '**止まっています**'}`);
    }
    行.push('');

    /* --- 最後に書き換えたもの --- */
    行.push('## 最後に書き換えたもの（これが原因かもしれません）');
    行.push('');
    try {
        const 書き換え = require('./自分を書き換える');
        const 記録 = 書き換え.記録を読む().slice(-5).reverse();
        if (記録.length) {
            記録.forEach((x) => {
                行.push(`- ${new Date(x.とき).toLocaleString('ja-JP')} `
                    + `\`${x.道}\` — ${x.様子}${x.訳 ? '（' + String(x.訳).slice(0, 80) + '）' : ''}`);
            });
        } else {
            行.push('- （書き換えの記録はありません）');
        }
    } catch (e) {
        行.push('- 記録を読めませんでした: ' + e.message);
    }
    行.push('');

    /* --- 戻せる控え --- */
    行.push('## 戻せる控え');
    行.push('');
    try {
        const 書き換え = require('./自分を書き換える');
        const 控え = 書き換え.控えの一覧().slice(0, 5);
        if (控え.length) {
            控え.forEach((x) => 行.push(`- \`${x.道}\` — ${x.とき}`));
        } else {
            行.push('- （控えはありません）');
        }
    } catch {
        行.push('- 控えを読めませんでした');
    }
    行.push('');

    /* --- パソコン操作の記録 --- */
    行.push('## 直近にしたこと');
    行.push('');
    try {
        const パソコン = require('./パソコンを操る');
        const 記録 = パソコン.記録を読む().slice(-8).reverse();
        if (記録.length) {
            記録.forEach((x) => {
                行.push(`- ${new Date(x.とき).toLocaleTimeString('ja-JP')} `
                    + `${x.操作} → ${String(x.結果).slice(0, 60)}`);
            });
        } else {
            行.push('- （操作の記録はありません）');
        }
    } catch {
        行.push('- 操作の記録を読めませんでした');
    }
    行.push('');

    /* --- 直し方 --- */
    行.push('## まず試すこと');
    行.push('');
    行.push('1. 画面が真っ白 → 上の「名前の衝突」を見る。同じ名前が二つあると全部止まる。');
    行.push('2. 学習が保存されない → `xattr -dr com.apple.quarantine ~/Applications/AReGLM.app`');
    行.push('3. サーバーが止まっている → 見張りが5秒ごとに立て直す。1分待って直らなければ手で起こす。');
    行.push('4. 直前の書き換えが原因 → 上の控えから戻す。');
    行.push('');
    行.push('---');
    行.push('この報せは、この端末の中だけで作られています。');
    行.push('どこにも送っていません。送るかどうかは、あなたが決めます。');

    // 出す前に、漏れて困るものを消す。
    //
    // この報せは、そのまま人に渡す前提のもの。
    // だからこそ、かぎや合言葉が混ざっていてはいけない。
    //
    // 「たぶん入っていない」では足りない。
    // 入っていたら消す、という形にしておく。
    return 危ないものを伏せる(行.join('\n'));
}

/**
 * 漏れて困るものを伏せる
 *
 * この報せは人に渡すものなので、
 * かぎ・合言葉・個人の連絡先が混ざっていたら消す。
 *
 * 消しすぎて読めなくなるより、
 * 一つ漏れるほうが困る。だから多めに伏せる。
 */
function 危ないものを伏せる(文) {
    let 出 = String(文 || '');

    const 伏せる型 = [
        // かぎらしい長い文字の並び
        [/\b(sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{16,}\b/g, '（かぎは伏せました）'],
        [/\bAIza[A-Za-z0-9_-]{20,}\b/g, '（かぎは伏せました）'],
        [/\b[A-Za-z0-9_-]{32,}\b/g, '（長い文字の並びは伏せました）'],

        // かぎや合言葉と書いてある行
        [/((api[_-]?key|token|secret|password|合言葉)\s*[:=]\s*)\S+/gi, '$1（伏せました）'],

        // メールと電話
        [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '（メールは伏せました）'],
        [/\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/g, '（電話は伏せました）'],
    ];

    伏せる型.forEach(([型, 代わり]) => { 出 = 出.replace(型, 代わり); });

    return 出;
}

/**
 * 助けを呼ぶ。
 *
 * 1. 様子を集める
 * 2. 写す（貼るだけで済むように）
 * 3. ファイルにも残す（写しそこねても消えないように）
 * 4. Claude を開く
 */
async function 助けを呼ぶ(本人の言葉, 開くか) {
    const 中身 = await 様子を集める(本人の言葉);

    /* --- ファイルに残す --- */
    let 道 = null;
    try {
        const 場所 = path.join(__dirname, 'data', '非常事態の報せ');
        if (!fs.existsSync(場所)) fs.mkdirSync(場所, { recursive: true });
        道 = path.join(場所, '報せ_' + new Date().toISOString().replace(/[:.]/g, '-') + '.md');
        fs.writeFileSync(道, 中身);
    } catch (e) {
        // 残せなくても、写しと表示はできる。
        // ここで止めると、助けを呼べなくなる。
        console.warn('報せを残せませんでした:', e.message);
    }

    /* --- 写す --- */
    let 写せた = false;
    try {
        const q = require('child_process').spawnSync('/usr/bin/pbcopy', {
            input: 中身,
            timeout: 5000,
        });
        写せた = q.status === 0;
    } catch {
        写せた = false;
    }

    /* --- Claude を開く --- */
    let 開けた = false;
    if (開くか !== false) {
        try {
            execFileSync('/usr/bin/open', ['-a', 'Claude'], { timeout: 5000 });
            開けた = true;
        } catch {
            // 開けなくても、写しはできている。
            // 自分で開いて貼れば同じこと。
            開けた = false;
        }
    }

    return {
        ok: true,
        訳: [
            '様子をまとめました。',
            写せた ? '写してあります（そのまま貼れます）。' : '写せませんでした。下の中身を使ってください。',
            開けた ? 'Claude を開きました。' : '',
            道 ? `控えも残しました。` : '',
        ].filter(Boolean).join(''),
        中身,
        道,
        写せた,
        開けた,
    };
}

module.exports = { 助けを呼ぶ, 様子を集める, 危ないものを伏せる };
