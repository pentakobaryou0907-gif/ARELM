/**
 * どこでも使う（Tailscale）
 *
 * 目的:
 *   同じWi-Fiの外（外出先・別の回線）からも、本人が持っている端末だけで、
 *   このMacのARELMを開けるようにする。
 *
 * なぜ Tailscale か:
 *   Tailscaleは、本人のアカウントでログインした端末だけをつなぐ閉じた回線
 *   （100.64.0.0/10）を作る。ARELMの入口をインターネットに開けずに済む。
 *   ここでは、その準備を、画面のボタンから自動で進められるようにする。
 *
 * やっていること（管理者パスワードは要らない）:
 *   1. tailscaled を「ユーザー空間モード」で起こす（このMacのネットワーク設定を触らない）
 *   2. ログインのリンクを出す（ログインそのものは、本人がブラウザで行う）
 *   3. `tailscale serve` で、ARELM（127.0.0.1:APP_PORT）を、
 *      https://<このMacの名前>.<tailnet>.ts.net として、tailnet の中だけに出す
 *
 * 安全のために:
 *   ・serve は、遠くの端末の通信を、このMac自身(127.0.0.1)から出し直す。
 *     門番（門番.js）は、その「中継された通信」を遠くの端末として扱い、
 *     合言葉・Macでの許可が済むまで何も渡さない。Mac専用の操作も通らない。
 *   ・インターネットに公開する `tailscale funnel` は、ここでは一切使わない。
 *   ・Tailscaleのアカウントを作ること・パスワードを入れることは、ここではしない（本人がする）。
 *   ・外部へ送るのは、Tailscale自身の通信だけ。ARELMのデータは載せない。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

// ソケットの道は、長いと開けない（Unixソケットの上限）ため、短い場所に置く。
const 置き場 = path.join(os.homedir(), '.tailscale');
const 自前のソケット = path.join(置き場, 'tailscaled.sock');
const 状態ファイル = path.join(置き場, 'tailscaled.state');
const ログファイル = path.join(置き場, 'tailscaled.log');
const 公式のソケット = '/var/run/tailscaled.socket';   // 公式アプリ・rootで動かしたデーモン

const 道具の置き場 = ['/opt/homebrew/bin', '/usr/local/bin'];
const 端末の名前 = 'arelm-mac';

function 最初に見つかる(候補) {
    return 候補.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

function CLIの場所() {
    return 最初に見つかる([
        ...道具の置き場.map((d) => path.join(d, 'tailscale')),
        '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    ]);
}

function デーモンの場所() {
    return 最初に見つかる(道具の置き場.map((d) => path.join(d, 'tailscaled')));
}

/** どのデーモンと話すか。自前を優先し、無ければ公式のもの、どちらも無ければ自前を作る。 */
function 使うソケット() {
    if (fs.existsSync(自前のソケット)) return 自前のソケット;
    if (fs.existsSync(公式のソケット)) return 公式のソケット;
    return 自前のソケット;
}

function ソケットの引数() {
    const s = 使うソケット();
    return s === 公式のソケット ? [] : [`--socket=${s}`];
}

/** tailscale を1回実行する。時間切れでも、それまでに出た文字は返す（リンクを拾うため）。 */
function 実行(引数, 待つ時間 = 8000) {
    const cli = CLIの場所();
    if (!cli) return Promise.resolve({ ok: false, 出力: '', 訳: 'tailscale が見つかりません' });
    return new Promise((resolve) => {
        execFile(cli, [...ソケットの引数(), ...引数], { timeout: 待つ時間, maxBuffer: 1 << 20 }, (err, out, errOut) => {
            resolve({ ok: !err, 出力: `${out || ''}${errOut || ''}`.trim(), 訳: err ? String(err.message || err).split('\n')[0] : '' });
        });
    });
}

function 待つ(ms) { return new Promise((r) => setTimeout(r, ms)); }

function 末尾の点を取る(s) { return String(s || '').replace(/\.$/, ''); }

/** 今の様子（読むだけ。何も変えない） */
async function 状態() {
    const cli = CLIの場所();
    const 基本 = {
        入っている: !!cli, 動いている: false, 段階: cli ? '止まっている' : '未導入',
        認証URL: '', 住所: '', 名前: '', 端末たち: [], 公開中: '', HTTPS可: false,
    };
    if (!cli) return 基本;

    const r = await 実行(['status', '--json'], 6000);
    let j = null;
    try { j = JSON.parse(r.出力); } catch { /* 動いていない */ }
    if (!j || !j.BackendState) return 基本;

    const 自分 = j.Self || {};
    const 段階 = ({
        Running: 'つながっている', NeedsLogin: 'ログイン待ち', NeedsMachineAuth: '承認待ち',
        Stopped: '一時停止', Starting: '接続中', NoState: '起動中',
    })[j.BackendState] || j.BackendState;

    const 結果 = {
        ...基本,
        動いている: true,
        段階,
        認証URL: j.AuthURL || '',
        住所: (自分.TailscaleIPs || []).find((a) => /^100\./.test(a)) || '',
        名前: 末尾の点を取る(自分.DNSName),
        端末たち: Object.values(j.Peer || {}).map((p) => ({
            名前: p.HostName || 末尾の点を取る(p.DNSName),
            OS: p.OS || '',
            オンライン: p.Online === true,
        })),
        HTTPS可: Array.isArray(j.CertDomains) && j.CertDomains.length > 0,
    };

    if (段階 === 'つながっている') 結果.公開中 = await 公開中の住所();
    return 結果;
}

/** いま serve で出している https の住所（無ければ空） */
async function 公開中の住所() {
    const r = await 実行(['serve', 'status', '--json'], 5000);
    try {
        const j = JSON.parse(r.出力 || '{}');
        const 鍵 = Object.keys(j.Web || {})[0];
        if (鍵 && j.TCP && Object.values(j.TCP).some((t) => t && t.HTTPS)) return `https://${鍵.replace(/:443$/, '')}`;
    } catch { /* 出していない */ }
    return '';
}

async function デーモンが答えるか() {
    const r = await 実行(['status', '--json'], 4000);
    try { return !!JSON.parse(r.出力).BackendState; } catch { return false; }
}

/** デーモンを（まだなら）起こす。ユーザー空間モード＝管理者権限もネットワーク設定の変更も要らない。 */
async function デーモンを起こす() {
    if (!CLIの場所()) return { ok: false, 訳: 'Tailscale が入っていません（brew install tailscale）' };
    if (await デーモンが答えるか()) return { ok: true, もう動いていた: true };
    const d = デーモンの場所();
    if (!d) return { ok: false, 訳: 'tailscaled が見つかりません。Tailscale のアプリを入れて、開いてください' };
    try {
        fs.mkdirSync(置き場, { recursive: true, mode: 0o700 });
        const ログ = fs.openSync(ログファイル, 'a', 0o600);
        const p = spawn(d, ['--tun=userspace-networking', `--socket=${自前のソケット}`, `--state=${状態ファイル}`],
            { detached: true, stdio: ['ignore', ログ, ログ] });
        p.on('error', () => { /* 起こせなければ、下の確認で分かる */ });
        p.unref();
    } catch (e) {
        return { ok: false, 訳: `起こせませんでした: ${e.message}` };
    }
    for (let i = 0; i < 16; i++) {
        await 待つ(500);
        if (await デーモンが答えるか()) return { ok: true };
    }
    return { ok: false, 訳: 'Tailscale が起きませんでした（~/.tailscale/tailscaled.log を見てください）' };
}

let ログイン待ちの子 = null;

/**
 * ログインのリンクを出す。ログイン（アカウントでの認証）は、本人がブラウザで行う。
 * すでにつながっていれば、何もしない。
 */
async function ログインを始める() {
    const 起 = await デーモンを起こす();
    if (!起.ok) return 起;
    let s = await 状態();
    if (s.段階 === 'つながっている') return { ok: true, 済み: true, 状態: s };

    if (!s.認証URL) {
        const cli = CLIの場所();
        if (!ログイン待ちの子 || ログイン待ちの子.exitCode !== null) {
            ログイン待ちの子 = spawn(cli, [...ソケットの引数(), 'up', `--hostname=${端末の名前}`, '--accept-dns=false', '--timeout=900s'],
                { detached: true, stdio: 'ignore' });
            ログイン待ちの子.on('error', () => { /* 状態の確認で分かる */ });
            ログイン待ちの子.unref();
        }
        for (let i = 0; i < 16 && !s.認証URL; i++) {
            await 待つ(500);
            s = await 状態();
            if (s.段階 === 'つながっている') return { ok: true, 済み: true, 状態: s };
        }
    }
    if (!s.認証URL) return { ok: false, 訳: 'ログインのリンクを作れませんでした。もう一度押してください', 状態: s };
    return { ok: true, 認証URL: s.認証URL, 状態: s };
}

/**
 * ARELMを tailnet の中だけに、https で出す。インターネットには出さない（funnel は使わない）。
 * tailnet 側で「HTTPS証明書」が有効になっていないと、先へ進めない（管理画面で1回オンにする）。
 */
async function 公開する(アプリのポート) {
    const s = await 状態();
    if (s.段階 !== 'つながっている') return { ok: false, 訳: '先に Tailscale にログインしてください', 状態: s };

    const r = await 実行(['serve', '--bg', '--yes', '--https=443', `http://127.0.0.1:${Number(アプリのポート) || 8090}`], 25000);
    const リンク = (r.出力.match(/https:\/\/login\.tailscale\.com\/[^\s]+/) || [])[0] || '';
    const 公開 = await 公開中の住所();
    if (公開) return { ok: true, 住所: 公開 };
    if (リンク) {
        return { ok: false, 設定が要る: true, リンク,
            訳: 'Tailscale の管理画面で、HTTPS（serve）を1回だけ許してください。許したら、もう一度押してください' };
    }
    return { ok: false, 訳: `出せませんでした: ${r.出力 || r.訳}`.slice(0, 300) };
}

async function 公開をやめる() {
    const r = await 実行(['serve', 'reset'], 8000);
    return { ok: r.ok, 訳: r.ok ? 'tailnet への公開をやめました' : (r.出力 || r.訳) };
}

/**
 * サーバーを起こしたとき、「どこでも使う」が入になっていれば、デーモンも起こしておく。
 * ログイン済みの印（状態ファイル）が無いときは何もしない（ログインの前に、勝手に動かさない）。
 */
async function 起動時に整える() {
    try {
        if (!CLIの場所() || !fs.existsSync(状態ファイル)) return { ok: true, 何もしない: true };
        return await デーモンを起こす();
    } catch (e) {
        return { ok: false, 訳: e.message };
    }
}

module.exports = { 状態, デーモンを起こす, ログインを始める, 公開する, 公開をやめる, 起動時に整える };
