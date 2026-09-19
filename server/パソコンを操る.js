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

/**
 * Windows対応について（正直に書いておくこと）:
 *
 * この端末（開発時）はMacのため、Windows側の動作はこのコードから
 * 読める範囲で慎重に組んだが、実機（Windows）では検証できていない。
 * PowerShellの一般的な自動化手法（P/Invoke・System.Drawing・SendKeys）
 * を使っており、書き方自体はよく知られたものだが、実際にWindows機で
 * 一度動作を確かめてから使ってほしい。うまくいかない操作があれば、
 * この関数のWindows向けの部分だけを直せばよいよう、Mac側（osascript）
 * とは完全に分けてある。
 */
const WIN = process.platform === 'win32';

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
        winスクリプト: () => `${PS_前面窓の定義}; $h=[ARELM.Win32]::GetForegroundWindow(); `
            + `$sb=New-Object System.Text.StringBuilder 256; [ARELM.Win32]::GetWindowText($h,$sb,256)|Out-Null; $sb.ToString()`,
    },

    音量を見る: {
        重さ: '軽い',
        説: 'いまの音量を見る',
        本文: () => 'get volume settings',
        // Windowsには、数値をそのまま取り出す簡単な標準の手段が無いため未対応。
        windows未対応: true,
    },

    /* --- 環境を整える（取り返しがつく） --- */

    アプリを開く: {
        重さ: '軽い',
        説: 'アプリを前に出す',
        要る: ['名前'],
        本文: (材) => `tell application ${引用符(材.名前)} to activate`,
        // Windowsには「同名のアプリを前面へ出す」統一の仕組みが無いため、
        // 起動（または再起動）で代用する（すでに動いていても前に出ない場合がある）。
        winスクリプト: (材) => `Start-Process ${PS引用符(材.名前)}`,
    },

    音量を変える: {
        重さ: '軽い',
        説: '音量を変える（0〜100）',
        要る: ['大きさ'],
        本文: (材) => {
            const n = Math.max(0, Math.min(100, Number(材.大きさ) || 0));
            return `set volume output volume ${n}`;
        },
        // Windowsには音量を数値で直接指定するAPIが標準では無いため、
        // 一旦下げきってから、目安の回数だけ上げるやり方で近づける
        // （1回あたり約2%が一般的だが、環境によりずれることがある）。
        winスクリプト: (材) => {
            const n = Math.max(0, Math.min(100, Number(材.大きさ) || 0));
            const 回数 = Math.round(n / 2);
            return `${PS_音量キー定義}; for($i=0;$i -lt 60;$i++){[ARELM.Snd]::Send(0xAE)}; `
                + `for($i=0;$i -lt ${回数};$i++){[ARELM.Snd]::Send(0xAF)}`;
        },
    },

    音を消す: {
        重さ: '軽い',
        説: '音を消す／戻す',
        本文: (材) => `set volume ${材.戻す ? 'without' : 'with'} output muted`,
        winスクリプト: () => `${PS_音量キー定義}; [ARELM.Snd]::Send(0xAD)`, // ミュートの切り替え（トグル）
    },

    画面を暗くする: {
        重さ: '軽い',
        説: '画面を消す（すぐ戻せます）',
        本文: () => 'tell application "System Events" to sleep',
        winスクリプト: () => 'Add-Type -AssemblyName System.Windows.Forms; '
            + '[System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false)',
    },

    スリープさせる: {
        重さ: '重い',
        説: 'パソコンを眠らせる',
        本文: () => 'tell application "System Events" to sleep',
        winスクリプト: () => 'Add-Type -AssemblyName System.Windows.Forms; '
            + '[System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false)',
    },

    読み上げる: {
        重さ: '軽い',
        説: '声で読み上げる',
        要る: ['文'],
        本文: (材) => `say ${引用符(String(材.文).slice(0, 300))} using "Kyoko"`,
        winスクリプト: (材) => 'Add-Type -AssemblyName System.Speech; '
            + `(New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(${PS引用符(String(材.文).slice(0, 300))})`,
    },

    知らせる: {
        重さ: '軽い',
        説: '通知を出す',
        要る: ['文'],
        本文: (材) => `display notification ${引用符(String(材.文).slice(0, 200))} `
            + `with title "ARELM"`,
        // バルーン通知（NotifyIcon）は標準搭載の部品だけで確実に出せる形。
        winスクリプト: (材) => 'Add-Type -AssemblyName System.Windows.Forms; '
            + '$ni=New-Object System.Windows.Forms.NotifyIcon; '
            + '$ni.Icon=[System.Drawing.SystemIcons]::Information; $ni.Visible=$true; '
            + `$ni.ShowBalloonTip(4000,"ARELM",${PS引用符(String(材.文).slice(0, 200))},[System.Windows.Forms.ToolTipIcon]::Info); `
            + 'Start-Sleep -Milliseconds 300; $ni.Dispose()',
    },

    フォルダーを開く: {
        重さ: '軽い',
        説: 'フォルダーをFinderで開く',
        要る: ['場所'],
        本文: (材) => `tell application "Finder" to open POSIX file ${引用符(材.場所)}`,
        winスクリプト: (材) => `Start-Process explorer.exe ${PS引用符(材.場所)}`,
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
        winスクリプト: (材) => {
            const u = String(材.場所 || '');
            if (!/^https?:\/\//.test(u)) {
                throw new Error('http か https で始まる場所だけ開けます');
            }
            return `Start-Process ${PS引用符(u)}`;
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
        // WMIのモニター輝度制御はノートPC等、対応ハードウェアでのみ効く
        // （外部モニターやデスクトップでは失敗することがある。正直に書いておく）。
        winスクリプト: () => 'try { $m=Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction Stop; '
            + '$new=[Math]::Min(100,$m.CurrentBrightness+15); '
            + '(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,$new) } '
            + 'catch { throw "この端末の輝度をソフトから変えられませんでした（対応していない場合があります）" }',
    },

    暗くする: {
        重さ: '軽い',
        説: '画面を暗くする',
        本文: () => 'tell application "System Events" to key code 145',
        winスクリプト: () => 'try { $m=Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction Stop; '
            + '$new=[Math]::Max(0,$m.CurrentBrightness-15); '
            + '(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,$new) } '
            + 'catch { throw "この端末の輝度をソフトから変えられませんでした（対応していない場合があります）" }',
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
        // Windowsの「集中モード（Focus Assist）」を外から確実に切り替える、
        // 簡単で壊れにくい標準の手段が無いため、正直に未対応としておく。
        windows未対応: true,
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
        winスクリプト: (材) => 'Add-Type -AssemblyName System.Windows.Forms; '
            + `[System.Windows.Forms.SendKeys]::SendWait(${PS引用符(SendKeysエスケープ(String(材.文).slice(0, 500)))})`,
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
        // Windowsに⌘（command）キーは無いため、同じ役目のCtrlで送る。
        winスクリプト: (材) => {
            const 対応 = {
                保存: 's', コピー: 'c', 貼る: 'v', 全部選ぶ: 'a',
                戻す: 'z', 新しく: 'n', 探す: 'f', 閉じる: 'w', 開く: 'o',
            };
            const 字 = 対応[材.キー];
            if (!字) {
                throw new Error(`「${材.キー}」は押せません。押せるのは: ${Object.keys(対応).join('、')}`);
            }
            return 'Add-Type -AssemblyName System.Windows.Forms; '
                + `[System.Windows.Forms.SendKeys]::SendWait(${PS引用符('^' + 字)})`;
        },
    },

    改行を押す: {
        重さ: '重い',
        説: 'エンターを押す',
        合言葉を見る: true,
        本文: () => 'tell application "System Events" to key code 36',
        winスクリプト: () => 'Add-Type -AssemblyName System.Windows.Forms; '
            + "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')",
    },

    // 遠隔操作画面（js/modules/遠隔操作画面.js）は、これまでクリックと
    // 文字入力しかできず、ページを下に読み進めたり、開いたダイアログを
    // 閉じたりする手段が無かった。「クリックする」「文字を打つ」と同じ
    // 重さ（合言葉の画面では打たない）の扱いにする。
    スクロール: {
        重さ: '重い',
        説: '画面を上下にスクロールする',
        要る: ['向き'],
        合言葉を見る: true,
        本文: (材) => `tell application "System Events" to key code ${材.向き === '上' ? 116 : 121}`,
        winスクリプト: (材) => 'Add-Type -AssemblyName System.Windows.Forms; '
            + `[System.Windows.Forms.SendKeys]::SendWait('${材.向き === '上' ? '{PGUP}' : '{PGDN}'}')`,
    },

    取り消しを押す: {
        重さ: '重い',
        説: 'エスケープを押す（開いたダイアログ・メニューを閉じる）',
        合言葉を見る: true,
        本文: () => 'tell application "System Events" to key code 53',
        winスクリプト: () => 'Add-Type -AssemblyName System.Windows.Forms; '
            + "[System.Windows.Forms.SendKeys]::SendWait('{ESC}')",
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
        winスクリプト: (材) => {
            const x = Math.max(0, Math.round(Number(材.よこ) || 0));
            const y = Math.max(0, Math.round(Number(材.たて) || 0));
            return `${PS_マウス定義}; [ARELM.Mouse]::SetCursorPos(${x},${y}); `
                + '[ARELM.Mouse]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); '
                + '[ARELM.Mouse]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)';
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

/**
 * Windows向け。PowerShellの単一引用符（'...'）の中で安全に使える形にする。
 * 単一引用符は変数展開をしないため、AppleScriptの二重引用符より安全に
 * 埋め込める（'' で単一引用符そのものをエスケープする決まり）。
 */
function PS引用符(文) {
    const s = String(文 == null ? '' : 文)
        .replace(/'/g, "''")
        .replace(/[\r\n]/g, ' ');
    return `'${s}'`;
}

/**
 * Windows向け。SendKeys に渡す文字列で特別な意味を持つ記号
 * （+ ^ % ~ ( ) { } [ ]）を {} で包み、そのままの文字として打たせる。
 */
function SendKeysエスケープ(文) {
    return String(文 == null ? '' : 文).replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`);
}

/**
 * Windows向け。前面ウィンドウ・フォーカス中の入力欄を調べるためのP/Invoke定義。
 * GUITHREADINFO はWin2000から変わっていない安定した構造体（フィールド順を
 * 変えると壊れるので、そのままの並びで書くこと）。
 */
const PS_前面窓の定義 = `
if (-not ('ARELM.Win32' -as [type])) {
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
namespace ARELM {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)]
  public struct GUITHREADINFO {
    public int cbSize;
    public int flags;
    public IntPtr hwndActive;
    public IntPtr hwndFocus;
    public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner;
    public IntPtr hwndMoveSize;
    public IntPtr hwndCaret;
    public RECT rcCaret;
  }
  public class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int c);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint id, ref GUITHREADINFO info);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetClassName(IntPtr h, StringBuilder s, int c);
  }
}
'@
}`;
// 注意: この文字列は Add-Type の -TypeDefinition に here-string（@' ... '@）を
// 使っているため、改行をつぶしてはいけない（here-stringは改行に依存する）。
// execFileSync には配列で渡すので、シェルを経由せず、この文字列に含まれる
// 改行はそのままPowerShellへ渡る。

/**
 * Windows向け。音量キー（ミュート/上げる/下げる）を、実際のキーボードの
 * メディアキーと同じ形で送る（keybd_event。フォーカスに関係なく効く）。
 */
const PS_音量キー定義 = `
if (-not ('ARELM.Snd' -as [type])) {
Add-Type @'
using System;
using System.Runtime.InteropServices;
namespace ARELM {
  public class Snd {
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    public static void Send(byte vk) {
      keybd_event(vk, 0, 0, UIntPtr.Zero);
      keybd_event(vk, 0, 2, UIntPtr.Zero);
    }
  }
}
'@
}`;

/** Windows向け。マウスを動かして左クリックするためのP/Invoke定義。 */
const PS_マウス定義 = `
if (-not ('ARELM.Mouse' -as [type])) {
Add-Type @'
using System;
using System.Runtime.InteropServices;
namespace ARELM {
  public class Mouse {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  }
}
'@
}`;

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
 *
 * Windows向けについて、正直に書いておくこと:
 *   Windowsには、macOSの「安全な入力中」のような、システム全体で
 *   一律に分かる仕組みが無い。ここでは、いま入力欄として選ばれている
 *   部品が「パスワード用のEdit（ES_PASSWORDスタイル）」かどうかを見て
 *   判定している。これは古典的なWin32の入力欄（多くのデスクトップアプリ）
 *   では効くが、ブラウザ（Chrome等）やElectron製アプリが自前で描く
 *   パスワード欄までは検知できない可能性がある。判定できない・
 *   分からないときは、macOS側と同じく「危ないほうに倒す」（=合言葉の
 *   画面として扱い、打たない）。
 */
function 合言葉の画面か() {
    if (WIN) {
        try {
            const script = `${PS_前面窓の定義}
$h=[ARELM.Win32]::GetForegroundWindow()
$tpid=0
$tid=[ARELM.Win32]::GetWindowThreadProcessId($h,[ref]$tpid)
$info=New-Object ARELM.GUITHREADINFO
$info.cbSize=[System.Runtime.InteropServices.Marshal]::SizeOf([type][ARELM.GUITHREADINFO])
$ok=[ARELM.Win32]::GetGUIThreadInfo($tid,[ref]$info)
if ($ok -and $info.hwndFocus -ne [IntPtr]::Zero) {
  $style=[ARELM.Win32]::GetWindowLong($info.hwndFocus,-16)
  if (($style -band 0x20) -ne 0) { Write-Output "1" } else { Write-Output "0" }
} else { Write-Output "0" }`;
            const 出 = execFileSync('powershell.exe',
                ['-NoProfile', '-NonInteractive', '-Command', script],
                { encoding: 'utf8', timeout: 5000 });
            return 出.trim() === '1';
        } catch {
            return true; // 見られないときは、危ないほうに倒す。
        }
    }

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

    /* --- Windowsでは対応していない操作か --- */
    if (WIN && 決まり.windows未対応 && !決まり.まとめ && !決まり.別のやり方) {
        return {
            ok: false,
            訳: `「${操作名}」は、Windows版ではまだ対応していません`
                + '（この端末の中だけで、確実にできると分かる形が見つかっていないため）。',
        };
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

    /* --- 命令を組み立てる（OSごとに違う書き方を使う） --- */
    let 本文;
    try {
        本文 = WIN ? 決まり.winスクリプト(材料) : 決まり.本文(材料);
    } catch (e) {
        return { ok: false, 訳: e.message };
    }

    最近の操作.push(Date.now());

    try {
        const 出 = WIN
            ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 本文],
                { encoding: 'utf8', timeout: 8000 })
            : execFileSync('/usr/bin/osascript', ['-e', 本文],
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
/**
 * Windows向け。画面全体（全モニター分）をPNGとして指定の場所に保存する。
 * macOSの screencapture と違い、Windowsでは通常この方法に特別な許可は要らない
 * （ここは実機で未検証。企業のポリシー等で塞がれていた場合は失敗するだけで、
 * 危険な副作用は無い）。
 */
function _win_画面を撮って保存する(保存先) {
    const script = 'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; '
        + '$b=[System.Windows.Forms.SystemInformation]::VirtualScreen; '
        + '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; '
        + '$g=[System.Drawing.Graphics]::FromImage($bmp); '
        + '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); '
        + `$bmp.Save(${PS引用符(保存先)},[System.Drawing.Imaging.ImageFormat]::Png); `
        + '$g.Dispose(); $bmp.Dispose()';
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000 });
}

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
        if (WIN) {
            _win_画面を撮って保存する(道);
        } else {
            // -x は撮影音を鳴らさない
            execFileSync('/usr/sbin/screencapture', ['-x', 道], { timeout: 8000 });
        }

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
        // （Windowsでは通常この種の許可自体が無いため、この案内はMacのみ。）
        const 許可がない = !WIN && /許可|not authorized|could not create image/i
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
/**
 * Windows向け。既に保存済みの画像の大きさを読み、必要なら縮めて別名で保存する。
 * macOS版が sips でやっている「縮める」「大きさを読む」を、
 * System.Drawing でまとめて行う。
 */
function _win_画像を縮めて情報を得る(元, 縮み先, 最大幅) {
    const script = 'Add-Type -AssemblyName System.Drawing; '
        + `$img=[System.Drawing.Image]::FromFile(${PS引用符(元)}); `
        + '$w=$img.Width; $h=$img.Height; $縮めた=0; '
        + `if ($w -gt ${最大幅}) { `
        + `$nh=[Math]::Round($h * ${最大幅} / $w); `
        + `$bmp=New-Object System.Drawing.Bitmap ${最大幅},$nh; `
        + '$g=[System.Drawing.Graphics]::FromImage($bmp); '
        + `$g.DrawImage($img,0,0,${最大幅},$nh); `
        + `$bmp.Save(${PS引用符(縮み先)},[System.Drawing.Imaging.ImageFormat]::Png); `
        + '$g.Dispose(); $bmp.Dispose(); $縮めた=1 } '
        + '$img.Dispose(); '
        + 'Write-Output "$w,$h,$縮めた"';
    const 出 = execFileSync('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf8', timeout: 10000 });
    const [w, h, 縮めたFlag] = 出.trim().split(',').map(Number);
    return { 幅: w, 高さ: h, 縮めた: 縮めたFlag === 1 };
}

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
        if (WIN) {
            _win_画面を撮って保存する(仮);
        } else {
            // -x は撮影音を鳴らさない
            execFileSync('/usr/sbin/screencapture', ['-x', 仮], { timeout: 10000 });
        }

        const 大きさ = fs.existsSync(仮) ? fs.statSync(仮).size : 0;
        if (大きさ < 1000) {
            if (fs.existsSync(仮)) fs.unlinkSync(仮);   // 中身の無い写真は残さない
            throw new Error('画面収録の許可がありません');
        }

        // 縮める。そのままだと重くて、何枚も送れない。
        // 元の画面の大きさも、ここで一緒に読む（押された場所を戻すのに要る）。
        let 出す道 = 仮;
        let 元幅 = 0;
        let 元高 = 0;

        if (WIN) {
            try {
                const 縮 = 仮.replace('.png', '_small.png');
                const 情報 = _win_画像を縮めて情報を得る(仮, 縮, 1400);
                元幅 = 情報.幅;
                元高 = 情報.高さ;
                if (縮める !== false && 情報.縮めた && fs.existsSync(縮)) 出す道 = 縮;
            } catch (e) {
                console.warn('画面の縮小・大きさの取得に失敗しました:', e.message);
            }
        } else {
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
            try {
                const 情報 = execFileSync('/usr/bin/sips',
                    ['-g', 'pixelWidth', '-g', 'pixelHeight', 仮],
                    { encoding: 'utf8', timeout: 5000 });
                元幅 = Number((情報.match(/pixelWidth:\s*(\d+)/) || [])[1] || 0);
                元高 = Number((情報.match(/pixelHeight:\s*(\d+)/) || [])[1] || 0);
            } catch (e) {
                console.warn('画面の大きさを読めませんでした:', e.message);
            }
        }

        const 中身 = fs.readFileSync(出す道).toString('base64');

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

        const 許可がない = !WIN && /許可|not authorized|could not create image/i
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
