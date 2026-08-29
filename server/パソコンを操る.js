/**
 * パソコンを操る
 *
 * なぜこれを作るのか:
 *
 *   「ブラウザを開いて、調べて、まとめて」——
 *   そういう指示を、口で言うだけで済ませたい。
 *   そのためには、道具が画面を触れなければならない。
 *
 *   pyautogui のような部品は入れない。
 *   macOS が最初から持っている osascript で足りる。
 *   追加で何も入れずに済むし、その方が安全でもある。
 *
 * この道具は強い。だから、次の四つを必ず付ける:
 *
 *   1. <b>決めた操作しかできない</b>
 *      好きな命令を書いて動かす、ということはできない。
 *      あらかじめ用意した型に、決まった値を入れるだけ。
 *      これが無いと、紛れ込んだ文字がそのまま命令になる。
 *
 *   2. <b>いつでも止められる</b>
 *      止めの札を立てれば、その瞬間から一切動かなくなる。
 *      暴れ出してから探すのでは遅い。
 *
 *   3. <b>何をしたか全部残る</b>
 *      画面を触るものが、黙って動いてはいけない。
 *
 *   4. <b>続けて動きすぎない</b>
 *      1分に20回まで。
 *      止まらなくなったとき、被害がそこで頭打ちになる。
 *
 * 打つ・押すについて:
 *
 *   本人が「許す」と決めたので作る。
 *   ただし、合言葉を打ち込む画面では<b>絶対に打たない</b>。
 *   macOS が「いま安全な入力中」と教えてくれるので、それを見る。
 *
 * すべてこの端末の中だけで動きます。外部へは一切送りません。
 */

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const 記録の道 = path.join(__dirname, 'data', 'パソコン操作の記録.json');
const 止めの札 = path.join(__dirname, 'data', '操作を止める');

/** 1分あたりの上限 */
const 一分の上限 = 20;
let 最近の操作 = [];

/* ==========================================================
   できる操作

   ここに無いものはできない。
   好きな命令を書いて動かす道は、作らない。
   ========================================================== */

const できる操作 = {

    /* --- 見るだけ（危なくない） --- */

    いまの様子: {
        重さ: '軽い',
        説: 'いま何のアプリが前にいるかを見る',
        本文: () => 'tell application "System Events" to get name of first process whose frontmost is true',
    },

    音量を見る: {
        重さ: '軽い',
        説: 'いまの音量を見る',
        本文: () => 'get volume settings',
    },

    /* --- 環境を整える（取り返しがつく） --- */

    アプリを開く: {
        重さ: '軽い',
        説: 'アプリを前に出す',
        要る: ['名前'],
        本文: (材) => `tell application ${引用符(材.名前)} to activate`,
    },

    音量を変える: {
        重さ: '軽い',
        説: '音量を変える（0〜100）',
        要る: ['大きさ'],
        本文: (材) => {
            const n = Math.max(0, Math.min(100, Number(材.大きさ) || 0));
            return `set volume output volume ${n}`;
        },
    },

    音を消す: {
        重さ: '軽い',
        説: '音を消す／戻す',
        本文: (材) => `set volume ${材.戻す ? 'without' : 'with'} output muted`,
    },

    画面を暗くする: {
        重さ: '軽い',
        説: '画面を消す（すぐ戻せます）',
        本文: () => 'tell application "System Events" to sleep',
    },

    スリープさせる: {
        重さ: '重い',
        説: 'パソコンを眠らせる',
        本文: () => 'tell application "System Events" to sleep',
    },

    読み上げる: {
        重さ: '軽い',
        説: '声で読み上げる',
        要る: ['文'],
        本文: (材) => `say ${引用符(String(材.文).slice(0, 300))} using "Kyoko"`,
    },

    知らせる: {
        重さ: '軽い',
        説: '通知を出す',
        要る: ['文'],
        本文: (材) => `display notification ${引用符(String(材.文).slice(0, 200))} `
            + `with title "AReGLM"`,
    },

    フォルダーを開く: {
        重さ: '軽い',
        説: 'フォルダーをFinderで開く',
        要る: ['場所'],
        本文: (材) => `tell application "Finder" to open POSIX file ${引用符(材.場所)}`,
    },

    ページを開く: {
        重さ: '軽い',
        説: 'ブラウザでページを開く',
        要る: ['場所'],
        本文: (材) => {
            // http/https 以外は開かない。
            // file: や javascript: を開けると、何でもできてしまう。
            const u = String(材.場所 || '');
            if (!/^https?:\/\//.test(u)) {
                throw new Error('http か https で始まる場所だけ開けます');
            }
            return `open location ${引用符(u)}`;
        },
    },

    画面を撮る: {
        重さ: '軽い',
        説: 'いまの画面を写真に撮る（この端末に保存）',
        別のやり方: true,
    },

    /* ==========================================================
       部屋の様子を整える

       スマート家電の代わり。

       SwitchBot などの機器は持っていないので、
       その仕組みを作っても動かせるものが無い。
       持っていない機器のための仕組みを作っても、
       動くかどうか分からないものが残るだけ。

       代わりに、<b>この端末が実際に変えられるもの</b>で作る。
       画面の明るさ、音、集中の邪魔をしない設定——
       これらは「部屋の様子」の一部として、本当に効く。

       あとで機器が増えたときは、
       ここに一つ足すだけで繋がる形にしてある。
       ========================================================== */

    明るくする: {
        重さ: '軽い',
        説: '画面を明るくする',
        本文: () => 'tell application "System Events" to key code 144',
    },

    暗くする: {
        重さ: '軽い',
        説: '画面を暗くする',
        本文: () => 'tell application "System Events" to key code 145',
    },

    邪魔をしない: {
        重さ: '軽い',
        説: 'おやすみモードにする／戻す',
        本文: (材) => {
            // ショートカットを通す。macOS の集中モードは
            // 直接は切り替えられないが、ショートカット経由なら変えられる。
            const 名 = 材.戻す ? 'AReGLM_集中オフ' : 'AReGLM_集中オン';
            return `tell application "Shortcuts Events" to run shortcut ${引用符(名)}`;
        },
        下ごしらえ: 'ショートカットアプリに「AReGLM_集中オン」「AReGLM_集中オフ」を'
            + '作っておくと使えます（作り方はこちらで用意します）',
    },

    作業に入る: {
        重さ: '軽い',
        説: '作業に向いた様子にする（音を絞り、通知を止め、画面を少し暗く）',
        まとめ: true,
        中身: [
            { 操作: '音量を変える', 材料: { 大きさ: 20 } },
            { 操作: '暗くする' },
            { 操作: '知らせる', 材料: { 文: '作業の様子にしました' } },
        ],
    },

    休みに入る: {
        重さ: '軽い',
        説: '休むのに向いた様子にする（画面を暗く、音を消す）',
        まとめ: true,
        中身: [
            { 操作: '音を消す' },
            { 操作: '暗くする' },
            { 操作: '暗くする' },
            { 操作: '知らせる', 材料: { 文: '休みの様子にしました' } },
        ],
    },

    撮影に入る: {
        重さ: '軽い',
        説: '撮影に向いた様子にする（画面を明るく、通知を止める）',
        まとめ: true,
        中身: [
            { 操作: '明るくする' },
            { 操作: '明るくする' },
            { 操作: '明るくする' },
            { 操作: '知らせる', 材料: { 文: '撮影の様子にしました' } },
        ],
    },

    /* --- 触る（本人が許した。ただし厳しく守る） --- */

    文字を打つ: {
        重さ: '重い',
        説: 'いま前にいるアプリに文字を打つ',
        要る: ['文'],
        合言葉を見る: true,
        本文: (材) => `tell application "System Events" to keystroke `
            + 引用符(String(材.文).slice(0, 500)),
    },

    キーを押す: {
        重さ: '重い',
        説: 'キーの組み合わせを押す（⌘S など）',
        要る: ['キー'],
        合言葉を見る: true,
        本文: (材) => {
            const 対応 = {
                保存: 's', コピー: 'c', 貼る: 'v', 全部選ぶ: 'a',
                戻す: 'z', 新しく: 'n', 探す: 'f', 閉じる: 'w', 開く: 'o',
            };
            const 字 = 対応[材.キー];
            if (!字) {
                throw new Error(`「${材.キー}」は押せません。押せるのは: ${Object.keys(対応).join('、')}`);
            }
            return `tell application "System Events" to keystroke "${字}" using command down`;
        },
    },

    改行を押す: {
        重さ: '重い',
        説: 'エンターを押す',
        合言葉を見る: true,
        本文: () => 'tell application "System Events" to key code 36',
    },

    クリックする: {
        重さ: '重い',
        説: '画面のその場所を押す',
        要る: ['よこ', 'たて'],
        本文: (材) => {
            const x = Math.max(0, Math.round(Number(材.よこ) || 0));
            const y = Math.max(0, Math.round(Number(材.たて) || 0));
            return `tell application "System Events" to click at {${x}, ${y}}`;
        },
    },
};

/**
 * 文字を、命令の中で安全に使えるようにする。
 *
 * ここがいちばん大事。
 * 引用符を閉じられると、そこから先が別の命令になる。
 */
function 引用符(文) {
    const s = String(文 == null ? '' : 文)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\r\n]/g, ' ');
    return `"${s}"`;
}

/* ==========================================================
   守り
   ========================================================== */

/** 止めの札が立っているか */
function 止まっているか() {
    return fs.existsSync(止めの札);
}

function 止める(訳) {
    const 場所 = path.dirname(止めの札);
    if (!fs.existsSync(場所)) fs.mkdirSync(場所, { recursive: true });
    fs.writeFileSync(止めの札, JSON.stringify({
        訳: 訳 || '本人が止めました',
        とき: new Date().toISOString(),
    }));
    記録を残す({ 操作: '（全部止めた）', 訳: 訳 || '本人が止めました', 結果: '止まりました' });
    return { ok: true, 訳: 'すべての操作を止めました。動かすまで、一切触りません。' };
}

function 動かす() {
    if (fs.existsSync(止めの札)) fs.unlinkSync(止めの札);
    記録を残す({ 操作: '（動かした）', 結果: '動くようになりました' });
    return { ok: true, 訳: '操作できるようにしました。' };
}

/**
 * 合言葉を打ち込む画面かどうかを見る。
 *
 * macOS は、合言葉の欄にいるとき「安全な入力中」になる。
 * そのときに打つと、合言葉の欄に文字が入る。
 * 絶対にしてはいけない。
 */
function 合言葉の画面か() {
    try {
        const 出 = execFileSync('/bin/sh',
            ['-c', 'ioreg -l -w 0 | grep -c "kCGSSessionSecureInputPID" || true'],
            { encoding: 'utf8', timeout: 3000 });
        return Number(出.trim()) > 0;
    } catch {
        // 見られないときは、危ないほうに倒す。
        // 分からないなら打たない。
        return true;
    }
}

/** 続けて動きすぎていないか */
function 動きすぎか() {
    const いま = Date.now();
    最近の操作 = 最近の操作.filter((t) => いま - t < 60000);
    return 最近の操作.length >= 一分の上限;
}

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
    fs.writeFileSync(記録の道, JSON.stringify(記録.slice(-300), null, 2));
}

/* ==========================================================
   動かす
   ========================================================== */

function 操る(操作名, 材料) {
    材料 = 材料 || {};

    /* --- 止められていないか --- */
    if (止まっているか()) {
        return {
            ok: false,
            訳: '操作は止められています。「動かす」を押すまで、画面には一切触りません。',
        };
    }

    /* --- できる操作か --- */
    const 決まり = できる操作[操作名];
    if (!決まり) {
        return {
            ok: false,
            訳: `「${操作名}」はできません。できるのは: ${Object.keys(できる操作).join('、')}`,
        };
    }

    /* --- 要るものが揃っているか --- */
    for (const 要る of (決まり.要る || [])) {
        if (材料[要る] == null || 材料[要る] === '') {
            return { ok: false, 訳: `「${要る}」が要ります` };
        }
    }

    /* --- 動きすぎていないか --- */
    if (動きすぎか()) {
        return {
            ok: false,
            訳: `1分に${一分の上限}回までにしてあります。`
                + '止まらなくなったときに、被害がそこで頭打ちになるためです。',
        };
    }

    /* --- 合言葉の画面では打たない --- */
    if (決まり.合言葉を見る && 合言葉の画面か()) {
        記録を残す({ 操作: 操作名, 結果: '打ちませんでした（合言葉の画面）' });
        return {
            ok: false,
            訳: 'いま合言葉を打ち込む画面が開いています。ここでは打ちません。',
        };
    }

    /* --- 画面を撮るのは、別のやり方 --- */
    if (決まり.別のやり方) return 画面を撮る();

    /* --- いくつかをまとめて行うもの --- */
    if (決まり.まとめ) {
        const 結果 = [];
        for (const 一つ of 決まり.中身) {
            const r = 操る(一つ.操作, 一つ.材料 || {});
            結果.push(`${一つ.操作}: ${r.ok ? '行いました' : r.訳}`);
            // 一つ失敗しても続ける。
            // 途中で止めると、中途半端な様子のまま残る。
        }
        記録を残す({ 操作: 操作名, 結果: `${決まり.中身.length}手を行いました` });
        return { ok: true, 訳: `${決まり.説}`, 中身: 結果.join(' / ') };
    }

    /* --- 命令を組み立てる --- */
    let 本文;
    try {
        本文 = 決まり.本文(材料);
    } catch (e) {
        return { ok: false, 訳: e.message };
    }

    最近の操作.push(Date.now());

    try {
        const 出 = execFileSync('/usr/bin/osascript', ['-e', 本文],
            { encoding: 'utf8', timeout: 8000 });
        記録を残す({
            操作: 操作名,
            材料: JSON.stringify(材料).slice(0, 120),
            結果: (出 || '').trim().slice(0, 120) || '行いました',
        });
        return { ok: true, 訳: `${決まり.説}: 行いました`, 中身: (出 || '').trim() };
    } catch (e) {
        const 訳 = String(e.stderr || e.message).slice(0, 200);
        記録を残す({ 操作: 操作名, 結果: '失敗: ' + 訳 });
        return { ok: false, 訳: '失敗しました: ' + 訳 };
    }
}

/**
 * 画面を撮る（この端末の中に保存）
 *
 * 気をつけていること:
 *
 *   画面には、合言葉の入力欄、メールの中身、
 *   知らせたくないものが写り込むことがある。
 *   それが残り続けると、写真そのものが漏れどころになる。
 *
 *   だから:
 *     ・<b>合言葉を打ち込む画面が開いているときは撮らない</b>
 *     ・<b>古いものは自動で片づける</b>（30日、20枚まで）
 *     ・置き場所はこの端末の中だけ。どこにも送らない。
 */
function 画面を撮る() {
    // 合言葉の画面が開いているときは撮らない。
    // 撮った写真に合言葉が写れば、それは漏れたのと同じ。
    if (合言葉の画面か()) {
        記録を残す({ 操作: '画面を撮る', 結果: '撮りませんでした（合言葉の画面）' });
        return {
            ok: false,
            訳: 'いま合言葉を打ち込む画面が開いています。'
                + '写り込むと困るので、ここでは撮りません。',
        };
    }

    const 場所 = path.join(__dirname, 'data', '画面の写真');
    if (!fs.existsSync(場所)) fs.mkdirSync(場所, { recursive: true });

    古い写真を片づける(場所);

    const 名 = '画面_' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
    const 道 = path.join(場所, 名);

    try {
        // -x は撮影音を鳴らさない
        execFileSync('/usr/sbin/screencapture', ['-x', 道], { timeout: 8000 });

        // 撮れたことにして中身が空、ということがある。
        // ファイルの大きさを見て、本当に撮れたかを確かめる。
        const 大きさ = fs.existsSync(道) ? fs.statSync(道).size : 0;
        if (大きさ < 1000) {
            if (fs.existsSync(道)) fs.unlinkSync(道);   // 中身の無い写真は残さない
            throw new Error('画面収録の許可がありません');
        }

        記録を残す({ 操作: '画面を撮る', 結果: 名 });
        return { ok: true, 訳: `画面を撮りました（${名}）`, 道 };
    } catch (e) {
        // 画面収録の許可が無いときは、「設定してください」で終わらせない。
        // 設定の場所をこちらで開く。探させない。
        const 許可がない = /許可|not authorized|could not create image/i
            .test(String(e.stderr || e.message));

        if (許可がない) {
            // 「設定してください」で終わらせない。
            //
            // 許可すべきものは node なのだが、
            // その置き場所は隠しフォルダーの奥にあって、
            // 設定の画面から探すのはほぼ無理。
            //
            // だから、その道をこちらで写しておく。
            // 設定の画面で ⌘⇧G を押して貼れば、一発でたどり着ける。
            const nodeの道 = process.execPath;

            try {
                execFileSync('/bin/sh',
                    ['-c', `printf '%s' ${JSON.stringify(nodeの道)} | pbcopy`],
                    { timeout: 3000 });
            } catch {
                // 写せなくても、道は下に書いてある。
                // ここで止めると、何が起きたか分からないまま終わる。
            }

            try {
                execFileSync('/usr/bin/open',
                    ['x-apple.systempreferences:com.apple.preference.security'
                        + '?Privacy_ScreenCapture'],
                    { timeout: 5000 });
            } catch {
                // 同上。開けなくても案内は出す。
            }

            記録を残す({
                操作: '画面を撮る',
                結果: '画面収録の許可がないため撮れず。設定を開き、道を写しました',
            });

            return {
                ok: false,
                訳: '画面収録の許可がありません。\n'
                    + '設定の画面をこちらで開き、必要な道を写しました。\n\n'
                    + '1. 開いた画面で「＋」を押す\n'
                    + '2. ⌘⇧G を押して貼り付ける（もう写してあります）\n'
                    + '3. node を選んで、入りにする\n'
                    + '4. アプリを開き直す\n\n'
                    + `写した道: ${nodeの道}`,
                設定を開いた: true,
                道: nodeの道,
            };
        }

        return { ok: false, 訳: '撮れませんでした: ' + String(e.message).slice(0, 120) };
    }
}

/**
 * 古い写真を片づける。
 *
 * 画面の写真は、残るほど漏れどころが増える。
 * 見返すのはたいてい直近のものだけなので、
 * 古いものは持ち続けない。
 *
 * 「消さない」の決まりは、あなたが作ったものについての話。
 * 道具が勝手に撮った写真は、道具が片づけてよい。
 */
function 古い写真を片づける(場所) {
    const 残す日数 = 30;
    const 残す枚数 = 20;

    try {
        const 一覧 = fs.readdirSync(場所)
            .filter((f) => f.endsWith('.png'))
            .map((f) => ({ 名: f, 時: fs.statSync(path.join(場所, f)).mtimeMs }))
            .sort((a, b) => b.時 - a.時);

        const 期限 = Date.now() - 残す日数 * 86400000;
        一覧.forEach((x, i) => {
            if (i >= 残す枚数 || x.時 < 期限) {
                try { fs.unlinkSync(path.join(場所, x.名)); } catch (e) {
                    console.warn('古い写真を片づけられません:', e.message);
                }
            }
        });
    } catch (e) {
        // 片づけられなくても、撮ることはできる。
        // ここで止めると、写真が一枚も撮れなくなる。
        console.warn('写真を片づけられませんでした:', e.message);
    }
}

/**
 * 画面を撮って、そのまま画面に出せる形で返す
 *
 * 遠隔操作のための土台。
 *
 * ファイルに保存してから読み直すのではなく、
 * その場で文字にして返す。
 * 何枚も撮るので、ファイルを増やしたくない。
 *
 * 大きさも一緒に返す。
 * 画面に縮めて出したとき、
 * <b>押された場所を元の座標へ戻す</b>のに要る。
 */
function 画面を写して返す(縮める) {
    if (合言葉の画面か()) {
        return {
            ok: false,
            訳: 'いま合言葉を打ち込む画面が開いています。'
                + '写り込むと困るので、ここでは撮りません。',
        };
    }

    const 仮 = path.join(require('os').tmpdir(),
        'areglm_gamen_' + Date.now() + '.png');

    try {
        // -x は撮影音を鳴らさない
        execFileSync('/usr/sbin/screencapture', ['-x', 仮], { timeout: 10000 });

        const 大きさ = fs.existsSync(仮) ? fs.statSync(仮).size : 0;
        if (大きさ < 1000) {
            if (fs.existsSync(仮)) fs.unlinkSync(仮);   // 中身の無い写真は残さない
            throw new Error('画面収録の許可がありません');
        }

        // 縮める。そのままだと重くて、何枚も送れない。
        let 出す道 = 仮;
        if (縮める !== false) {
            const 縮 = 仮.replace('.png', '_small.png');
            try {
                execFileSync('/usr/bin/sips',
                    ['-Z', '1400', 仮, '--out', 縮],
                    { timeout: 10000, stdio: 'pipe' });
                if (fs.existsSync(縮)) 出す道 = 縮;
            } catch (e) {
                // 縮められなくても、元のままで出せる。
                console.warn('画面を縮められませんでした:', e.message);
            }
        }

        const 中身 = fs.readFileSync(出す道).toString('base64');

        // 元の画面の大きさを見る。押された場所を戻すのに要る。
        let 元幅 = 0;
        let 元高 = 0;
        try {
            const 情報 = execFileSync('/usr/bin/sips',
                ['-g', 'pixelWidth', '-g', 'pixelHeight', 仮],
                { encoding: 'utf8', timeout: 5000 });
            元幅 = Number((情報.match(/pixelWidth:\s*(\d+)/) || [])[1] || 0);
            元高 = Number((情報.match(/pixelHeight:\s*(\d+)/) || [])[1] || 0);
        } catch (e) {
            console.warn('画面の大きさを読めませんでした:', e.message);
        }

        // 一時のものは、その場で片づける
        [仮, 出す道].forEach((f) => {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* 残っても害はない */ }
        });

        記録を残す({ 操作: '画面を写す', 結果: `${Math.round(中身.length / 1024)}KB` });

        return {
            ok: true,
            絵: 'data:image/png;base64,' + 中身,
            元の幅: 元幅,
            元の高さ: 元高,
        };
    } catch (e) {
        [仮].forEach((f) => {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* 同上 */ }
        });

        const 許可がない = /許可|not authorized|could not create image/i
            .test(String(e.stderr || e.message));

        if (許可がない) {
            const nodeの道 = process.execPath;
            try {
                execFileSync('/bin/sh',
                    ['-c', `printf '%s' ${JSON.stringify(nodeの道)} | pbcopy`],
                    { timeout: 3000 });
                execFileSync('/usr/bin/open',
                    ['x-apple.systempreferences:com.apple.preference.security'
                        + '?Privacy_ScreenCapture'],
                    { timeout: 5000 });
            } catch (e2) {
                console.warn('設定を開けませんでした:', e2.message);
            }
            return {
                ok: false,
                許可が要る: true,
                訳: '画面収録の許可がありません。設定の画面を開き、道を写しました。',
                道: nodeの道,
            };
        }

        return { ok: false, 訳: '撮れませんでした: ' + String(e.message).slice(0, 120) };
    }
}

function 操作の一覧() {
    return Object.entries(できる操作).map(([名, x]) => ({
        名,
        説: x.説,
        重さ: x.重さ,
        要る: x.要る || [],
    }));
}

module.exports = {
    操る,
    画面を写して返す,
    操作の一覧,
    止める,
    動かす,
    止まっているか,
    記録を読む,
    合言葉の画面か,
};
