/**
 * ツールの中から、Chromeを開いて操る
 *
 * なぜこれを作るのか:
 *
 *   base44 の画面も、SNSの画面も、ログインが要る。
 *   こちらからは開けないので、中身を見られない。
 *
 *   だが<b>あなたのChromeなら、もうログインしてある</b>。
 *   そのChromeを、この道具から開いて操れれば、
 *   一緒に画面を見ながら進められる。
 *
 * どうやるのか:
 *
 *   ページの中に他所のサイトを埋め込むことはできない。
 *   ほとんどのサイトが、埋め込みを断るためです（X-Frame-Options）。
 *
 *   代わりに<b>本物のChromeを開いて、外から操る</b>。
 *   開く・読む・進む・戻る・タブを選ぶ——
 *   どれも macOS が最初から持っている仕組みでできる。
 *
 * 守っていること:
 *
 *   ・<b>読むだけと、触るものを分ける。</b>
 *     読むのは自由。触るのは確かめてから。
 *
 *   ・<b>合言葉やお金の画面では、触らない。</b>
 *     間違って押すと取り返しがつかない。
 *
 *   ・<b>何をしたかは全部残る。</b>
 *
 * すべてこの端末の中だけで動きます。
 * 見たページの中身を、どこかへ送ることはしません。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Windows対応について、正直に書いておくこと:
 *
 * このファイルのタブ一覧・タブ選択・進む/戻る等（走らせる() 経由の操作）は、
 * macOSのAppleScript（Chromeが持つ「辞書」）で作られており、Windowsには
 * 同じ仕組みが無い。Windowsで同じことをするには、Chromeを
 * リモートデバッグモード（--remote-debugging-port）で起動し、
 * Chrome DevTools Protocolという別の仕組みで話しかける必要があり、
 * 作りがまるごと変わる（このツールにはまだ無いWebSocket通信が要る）。
 *
 * 中途半端に作って壊れたまま使われるよりはっきりしているほうがよいので、
 * ここでは「プロフィールを選んでChromeを開く」までをWindowsでも
 * 動くようにし、そこから先（タブの読み書き）は今のところ未対応と
 * 正直に伝える形にしてある。
 */
const WIN = process.platform === 'win32';

/**
 * 業務用に使うChromeのアカウント（プロフィール）。
 *
 * Chromeにはすでにいくつものアカウントがログイン済みだった。
 * パスワードを入れる必要は無かった。
 * その中から、業務で使うものだけをここで選べるようにする。
 *
 * 「Profile 5」のような中の名前は Chrome の Local State から読む。
 * メールアドレスそのものは画面に出さない（friendly名だけ見せる）。
 *
 * 「ブランド垢ARELM」（Profile 6）は、確かめたところ違うアカウントだった。
 * 代わりに、ご本人が指定した2つに差し替えてある。
 */
const よく使うプロフィール = {
    '個人アカウント': 'Default',
    'AReGLM': 'Profile 5',
};

/**
 * Chrome にログイン済みの全プロフィールを Local State から読む。
 *
 * 以前は上の固定2件だけだったが、
 * 「既存のアカウントそれぞれ別々に使いたい」との求めで、
 * 実際にある全部を出すようにした。
 *
 * パスワードには一切触れない。すでにログインしてある
 * プロフィールを、その窓で開くだけ。
 *
 * メールアドレスの全体は画面に出さない決まりは守る。
 * ただし「ユーザー 1」のような自動名だけでは
 * どの垢か本人にも分からないので、メールの頭数文字だけ添える。
 */
function プロフィールを読む() {
    try {
        // ChromeのLocal State（プロフィール一覧）の置き場所はOSで違う。
        const 道 = WIN
            ? path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', 'Local State')
            : path.join(process.env.HOME || '', 'Library/Application Support/Google/Chrome/Local State');
        const d = JSON.parse(fs.readFileSync(道, 'utf8'));
        const info = (d.profile && d.profile.info_cache) || {};
        const 一覧 = {};
        for (const [ディレクトリ, v] of Object.entries(info)) {
            let 名 = v.name || ディレクトリ;
            if (/^ユーザー ?\d+$/.test(名) && v.user_name) {
                名 = `${名}（${String(v.user_name).split('@')[0].slice(0, 5)}…）`;
            }
            if (一覧[名]) 名 = `${名}（${ディレクトリ}）`;
            一覧[名] = ディレクトリ;
        }
        if (Object.keys(一覧).length) return 一覧;
    } catch { /* 読めなければ従来の固定リストで動かす */ }
    return よく使うプロフィール;
}

function プロフィール一覧() {
    return Object.keys(プロフィールを読む());
}

/** 指定したアカウント（プロフィール）でChromeを開く／切り替える */
function プロフィールで開く(プロフィール名, 道) {
    const ディレクトリ = プロフィールを読む()[プロフィール名];
    if (!ディレクトリ) {
        return {
            ok: false,
            訳: `「${プロフィール名}」は使えません。使えるのは: ${プロフィール一覧().join('、')}`,
        };
    }

    const u = String(道 || '');
    if (u && !/^https?:\/\//.test(u)) {
        return { ok: false, 訳: 'http か https で始まる場所だけ開けます' };
    }
    if (動きすぎか()) {
        return { ok: false, 訳: `1分に${一分の上限}回までにしてあります` };
    }

    最近.push(Date.now());
    try {
        if (WIN) {
            // Windowsでは chrome.exe に直接 --profile-directory と場所を渡して開く。
            // （Mac版のように「開いた後に前面タブへ入れ直す」再挑戦は、
            // AppleScriptに相当する仕組みが無いため行っていない。）
            const 引数 = [`--profile-directory=${ディレクトリ}`];
            if (u) 引数.push(u);
            execFileSync('cmd.exe', ['/c', 'start', '', 'chrome', ...引数], { timeout: 10000 });
        } else {
            const 引数 = ['-na', 'Google Chrome', '--args', `--profile-directory=${ディレクトリ}`];
            if (u) 引数.push(u);
            execFileSync('/usr/bin/open', 引数, { timeout: 10000 });

            // 初めてそのプロフィールを開いたときは、アカウント選択の画面が
            // 出て、指定した場所へ行かないことがある。
            // 少し待ってから、front window に改めて場所を入れ直す。
            if (u) {
                try {
                    execFileSync('/bin/sh', ['-c', 'sleep 2'], { timeout: 3000 });
                    走らせる(`tell application "Google Chrome" to set URL of active tab of front window to ${引用符(u)}`, 10);
                } catch { /* 最初の open だけでも開けていれば良しとする */ }
            }
        }

        記録を残す({ 操作: 'プロフィールで開く', 中身: `${プロフィール名}: ${u}`, 結果: '開きました' });
        return { ok: true, 訳: `「${プロフィール名}」でChromeを開きました${u ? ': ' + u : ''}` };
    } catch (e) {
        return { ok: false, 訳: '開けませんでした: ' + String(e.message).slice(0, 100) };
    }
}

const 記録の道 = path.join(__dirname, 'data', 'ブラウザ操作の記録.json');

/** 1分あたりの上限 */
const 一分の上限 = 30;
let 最近 = [];

/**
 * 触ってはいけない画面
 *
 * 合言葉やお金の画面で勝手に押されると、取り返しがつかない。
 * 読むのは構わないが、触るのは止める。
 */
const 触ってはいけない先 = [
    /accounts\.google\.com/i,
    /appleid\.apple\.com/i,
    /login|signin|sign-in|auth/i,
    /checkout|payment|billing|purchase/i,
    /bank|銀行|振込|送金/i,
];

function 引用符(文) {
    const s = String(文 == null ? '' : 文)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\r\n]/g, ' ');
    return `"${s}"`;
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
    fs.writeFileSync(記録の道, JSON.stringify(記録.slice(-200), null, 2));
}

function 動きすぎか() {
    const いま = Date.now();
    最近 = 最近.filter((t) => いま - t < 60000);
    return 最近.length >= 一分の上限;
}

function 走らせる(本文, 秒) {
    if (WIN) {
        // タブの読み書きは、Chrome DevTools Protocol という別の仕組みが
        // 要り、このツールにはまだ無い。ここで正直に止める
        // （黙って何もしない・作り話の結果を返す、をしないため）。
        throw new Error('タブの読み書きは、Windows版ではまだ対応していません（Chromeの起動は使えます）。');
    }
    return execFileSync('/usr/bin/osascript', ['-e', 本文],
        { encoding: 'utf8', timeout: (秒 || 10) * 1000 }).trim();
}

/* ==========================================================
   読むだけ（危なくない）
   ========================================================== */

/** いま開いているタブを全部見る */
function タブを見る() {
    try {
        // 区切りに tab（タブ文字）を使うと、
        // AppleScript の「tab（タブ）」という言葉とぶつかる。
        // 見た目に出てこない文字を区切りにする。
        // AppleScript の中では、日本語の変数名を使わない。
        //
        // 「set 結果 to ...」で毎回 syntax error になった。
        // JavaScript の中は日本語でよいが、
        // AppleScript に渡す文の中では英字にする。
        //
        // 区切りに tab（タブ文字）を使うのも避ける。
        // AppleScript の「tab」という言葉とぶつかる。
        const 出 = 走らせる(`
tell application "Google Chrome"
  if (count of windows) is 0 then return ""
  set outText to ""
  set w to front window
  set nowIndex to active tab index of w
  repeat with i from 1 to count of tabs of w
    set t to tab i of w
    set mark to ""
    if i is nowIndex then set mark to "*"
    set outText to outText & mark & i & "|~|" & (title of t) & "|~|" & (URL of t) & linefeed
  end repeat
  return outText
end tell`);

        const タブ = 出.split('\n').filter(Boolean).map((行) => {
            const [番, 題, 道] = 行.split('|~|');
            return {
                番: parseInt(String(番).replace('*', ''), 10),
                いま見ている: String(番).startsWith('*'),
                題: 題 || '',
                道: 道 || '',
                触ってよいか: !触ってはいけない先.some((x) => x.test(道 || '')),
            };
        });

        return { ok: true, タブ, 数: タブ.length };
    } catch (e) {
        const 訳 = String(e.stderr || e.message);
        if (/-1743|権限/.test(訳)) {
            return {
                ok: false,
                訳: 'Chromeを操る許可がありません。'
                    + '設定 → プライバシーとセキュリティ → オートメーション で、'
                    + 'この道具に Google Chrome を許可してください。',
                許可が要る: true,
            };
        }
        return { ok: false, 訳: 'タブを見られませんでした: ' + 訳.slice(0, 120) };
    }
}

/** いま見ているページの文字を読む */
function ページを読む() {
    try {
        const 出 = 走らせる(`
tell application "Google Chrome"
  if (count of windows) is 0 then return "窓がありません"
  set t to active tab of front window
  return (title of t) & linefeed & (URL of t)
end tell`);
        const [題, 道] = 出.split('\n');
        記録を残す({ 操作: 'ページを読む', 結果: (題 || '').slice(0, 60) });
        return { ok: true, 題, 道 };
    } catch (e) {
        return { ok: false, 訳: '読めませんでした: ' + String(e.message).slice(0, 100) };
    }
}

/* ==========================================================
   触る（確かめてから）
   ========================================================== */

/** ページを開く */
function 開く(道, 新しいタブか) {
    const u = String(道 || '');
    if (!/^https?:\/\//.test(u)) {
        return {
            ok: false,
            訳: 'http か https で始まる場所だけ開けます'
                + '（「在庫ページ」のような名前は、AReGLM自身の画面のときだけ解決できます）',
        };
    }
    if (動きすぎか()) {
        return { ok: false, 訳: `1分に${一分の上限}回までにしてあります` };
    }

    最近.push(Date.now());
    try {
        走らせる(`
tell application "Google Chrome"
  activate
  if (count of windows) is 0 then
    make new window
    set URL of active tab of front window to ${引用符(u)}
  else if ${新しいタブか ? 'true' : 'false'} then
    tell front window to make new tab with properties {URL:${引用符(u)}}
  else
    set URL of active tab of front window to ${引用符(u)}
  end if
end tell`, 15);
        記録を残す({ 操作: '開く', 中身: u.slice(0, 80), 結果: '開きました' });
        return { ok: true, 訳: `開きました: ${u}` };
    } catch (e) {
        return { ok: false, 訳: '開けませんでした: ' + String(e.message).slice(0, 100) };
    }
}

/** タブを選ぶ */
function タブを選ぶ(番) {
    const n = parseInt(番, 10);
    if (!n || n < 1) return { ok: false, 訳: '何番目かを教えてください' };
    try {
        走らせる(`
tell application "Google Chrome"
  activate
  set active tab index of front window to ${n}
end tell`);
        記録を残す({ 操作: 'タブを選ぶ', 中身: String(n), 結果: '選びました' });
        return { ok: true, 訳: `${n}番目のタブを開きました` };
    } catch (e) {
        return { ok: false, 訳: '選べませんでした: ' + String(e.message).slice(0, 100) };
    }
}

/** 進む・戻る・読み込み直す */
function 動かす(何を) {
    const 対応 = {
        戻る: 'go back active tab of front window',
        進む: 'go forward active tab of front window',
        読み直す: 'reload active tab of front window',
    };
    const 命令 = 対応[何を];
    if (!命令) {
        return { ok: false, 訳: `「${何を}」はできません（戻る・進む・読み直す）` };
    }
    try {
        走らせる(`tell application "Google Chrome" to ${命令}`);
        記録を残す({ 操作: 何を, 結果: '行いました' });
        return { ok: true, 訳: `${何を}を行いました` };
    } catch (e) {
        return { ok: false, 訳: 'できませんでした: ' + String(e.message).slice(0, 100) };
    }
}

/** タブを閉じる（開いたものだけ。消す扱いにはしない） */
function タブを閉じる(番) {
    const n = parseInt(番, 10);
    if (!n || n < 1) return { ok: false, 訳: '何番目かを教えてください' };
    try {
        走らせる(`tell application "Google Chrome" to close tab ${n} of front window`);
        記録を残す({ 操作: 'タブを閉じる', 中身: String(n), 結果: '閉じました' });
        return { ok: true, 訳: `${n}番目のタブを閉じました` };
    } catch (e) {
        return { ok: false, 訳: '閉じられませんでした: ' + String(e.message).slice(0, 100) };
    }
}

function できること() {
    return [
        { 名: 'タブを見る', 説: 'いま開いているタブを全部見る', 重さ: '軽い' },
        { 名: 'ページを読む', 説: 'いま見ているページの題と場所を読む', 重さ: '軽い' },
        {
            名: '開く',
            説: 'ページを開く。道には http/https のURL、'
                + 'またはAReGLM自身の画面名（ホーム・チャット・遠隔操作・ブランド・SNS・在庫・開発）を渡せる',
            重さ: '軽い',
            要る: ['道'],
        },
        { 名: 'タブを選ぶ', 説: '何番目かのタブに切り替える', 重さ: '軽い', 要る: ['番'] },
        { 名: '戻る', 説: '一つ前のページへ', 重さ: '軽い' },
        { 名: '進む', 説: '一つ先のページへ', 重さ: '軽い' },
        { 名: '読み直す', 説: 'いまのページを読み込み直す', 重さ: '軽い' },
        { 名: 'タブを閉じる', 説: '何番目かのタブを閉じる', 重さ: '重い', 要る: ['番'] },
    ];
}

module.exports = {
    タブを見る, ページを読む, 開く, タブを選ぶ, 動かす, タブを閉じる,
    できること, 記録を読む, 触ってはいけない先,
    プロフィール一覧, プロフィールで開く,
};
