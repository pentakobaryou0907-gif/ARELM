/**
 * 門番 — 他の端末から使うときの、本人確認
 *
 * なぜこれが要るのか:
 *   スマホやデスクトップからも使いたい、という要望がある。
 *   そのためには、サーバーがネットワーク上で応答しなければならない。
 *   これは避けられない。
 *
 *   ところがそうすると、同じWi-Fiにいる人には入口が見える。
 *   守りは「ネットワークで遮断する」から
 *   「合言葉で拒否する」へ、性質が変わる。
 *
 *   画面側だけの合言葉では意味がない。
 *   画面を読み込む前に断らないと、
 *   中身のファイルは誰でも取れてしまう。
 *   だからサーバー側に門を置く。
 *
 * ここでやること:
 *   1. 自分の端末（127.0.0.1）からは、そのまま通す
 *   2. 外から来たら、まず同じLANの中かを見る。違えば断る
 *   3. LANの中でも、合言葉が合うまで何も渡さない
 *   4. 合ったら、その端末に印（token）を渡す。次からは聞かない
 *   5. 間違いが続いたら、しばらくその相手を締め出す
 *
 * はっきり書いておきます:
 *   これは「誰にも見えない」ではありません。
 *   同じWi-Fiにいる人には、入口があること自体は見えます。
 *   見えたうえで、合言葉が無いと中へ入れない、という形です。
 *
 *   合言葉が弱ければ、その分だけ弱くなります。
 *   使い回しの言葉は使わないでください。
 *
 * 外部へは一切問い合わせません。すべてこの端末の中で完結します。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const 設定ファイル = path.join(__dirname, 'data', '門番.json');

/** 印の有効期間（日）。これを過ぎたら、もう一度合言葉を聞く。 */
const 印の日数 = 30;

/** 何回間違えたら締め出すか */
const 許す間違い = 5;

/** 締め出す長さ（分） */
const 締め出す分 = 15;

/** 間違いの記録（相手ごと）。再起動で消えてよい。 */
const 間違い = new Map();

function 設定を読む() {
    try {
        return JSON.parse(fs.readFileSync(設定ファイル, 'utf8'));
    } catch {
        return { 使う: false, 合言葉: null, 端末: [] };
    }
}

function 設定を書く(中身) {
    const 場所 = path.dirname(設定ファイル);
    if (!fs.existsSync(場所)) fs.mkdirSync(場所, { recursive: true });
    fs.writeFileSync(設定ファイル, JSON.stringify(中身, null, 2));
}

/**
 * 合言葉を、元に戻せない形にする。
 *
 * そのまま保存すると、このファイルを見た人に読まれてしまう。
 * 何度も混ぜ直すのは、総当たりで当てにくくするため。
 *
 * 回数について:
 *
 *   12万回にしていた。作った当時はそれでよかったが、
 *   計算機は年々速くなるので、同じ回数では守りが薄くなっていく。
 *   いまの目安は60万回。
 *
 *   増やすと、こちらも少し待つことになる（0.3秒ほど）。
 *   だが待つのは合言葉を入れるときだけで、
 *   総当たりする側は、その0.3秒を何億回も払うことになる。
 *   こちらの0.3秒で、相手の手間が5倍になる。
 */
const 混ぜる回数 = 600000;

function 混ぜる(言葉, 塩, 回数) {
    return crypto.pbkdf2Sync(
        String(言葉), String(塩), 回数 || 混ぜる回数, 32, 'sha256').toString('hex');
}

function 合言葉を決める(言葉) {
    const s = String(言葉 || '').trim();
    if (s.length < 8) {
        return { ok: false, 訳: '合言葉は8文字以上にしてください。他の端末から入る鍵になります。' };
    }
    const 塩 = crypto.randomBytes(16).toString('hex');
    const 設定 = 設定を読む();

    // 回数も一緒に残す。
    // 残さないと、あとで回数を変えたときに
    // 前の合言葉が通らなくなる。
    設定.合言葉 = { 塩, 混ぜたもの: 混ぜる(s, 塩), 回数: 混ぜる回数 };
    設定を書く(設定);
    return { ok: true, 訳: '合言葉を決めました。' };
}

function 合言葉が合うか(言葉) {
    const 設定 = 設定を読む();
    if (!設定.合言葉) return false;

    // 決めたときの回数で照らす。
    //
    // 回数を増やしたとき、前に決めた合言葉が通らなくなっては困る。
    // 「守りを固めたら入れなくなった」では、直したことにならない。
    // 古いものは古い回数で照らし、合っていれば静かに新しい回数へ移す。
    const 決めたときの回数 = 設定.合言葉.回数 || 120000;

    const 試し = Buffer.from(混ぜる(言葉, 設定.合言葉.塩, 決めたときの回数));
    const 本物 = Buffer.from(設定.合言葉.混ぜたもの);

    // 長さが違うと timingSafeEqual は例外を投げる
    if (試し.length !== 本物.length) return false;

    // 一文字ずつ比べる時間の差から当てられないようにする
    const 合った = crypto.timingSafeEqual(試し, 本物);

    // 合ったなら、いまの強さで作り直しておく。
    // 本人には何も起きない。次からは強いほうで守られる。
    if (合った && 決めたときの回数 < 混ぜる回数) {
        try {
            const 新しい塩 = crypto.randomBytes(16).toString('hex');
            設定.合言葉 = {
                塩: 新しい塩,
                混ぜたもの: 混ぜる(言葉, 新しい塩, 混ぜる回数),
                回数: 混ぜる回数,
            };
            設定を書く(設定);
            console.log(`[門番] 合言葉の守りを ${決めたときの回数} → ${混ぜる回数} 回に固めました`);
        } catch (e) {
            // 固め直せなくても、いまの合言葉は通っている。
            // ここで止めると、入れるはずの人が入れなくなる。
            console.warn('[門番] 固め直せませんでした:', e.message);
        }
    }

    return 合った;
}

/**
 * この相手は、同じLANの中か。
 *
 * 家や職場のネットワークの中だけを通す。
 * 外のインターネットから直に来たものは、
 * 合言葉を聞くまでもなく断る。
 */
function 同じLANか(住所) {
    if (!住所) return false;
    const a = String(住所).replace(/^::ffff:/, '');

    if (a === '127.0.0.1' || a === '::1') return true;
    if (a.startsWith('192.168.')) return true;
    if (a.startsWith('10.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
    if (a.startsWith('169.254.')) return true;     // 自動割り当て
    if (a.startsWith('fe80:')) return true;        // IPv6 のリンクローカル
    return false;
}

function 自分の端末か(住所) {
    const a = String(住所 || '').replace(/^::ffff:/, '');
    return a === '127.0.0.1' || a === '::1';
}

/**
 * この相手は、Tailscale（本人だけの端末をつなぐVPN）の中か。
 *
 * Tailscaleは 100.64.0.0/10（100.64.0.0〜100.127.255.255）という
 * 決まった範囲のアドレスを、つないだ端末に配る。
 * インターネットには一切出ない、閉じた範囲。
 *
 * 普通のLAN（同じLANか）とは別に扱う。
 * 「他の端末から使う」（同じWi-Fiなら誰でも入口が見える）を
 * 入にしなくても、Tailscaleでつないだ自分の端末だけは通したい、
 * という場合に分けて判定できるようにするため。
 */
function Tailscaleの中か(住所) {
    if (!住所) return false;
    const a = String(住所).replace(/^::ffff:/, '');
    const m = a.match(/^100\.(\d{1,3})\./);
    if (!m) return false;
    const 二つ目 = Number(m[1]);
    return 二つ目 >= 64 && 二つ目 <= 127;
}

/* ---------- 印（token） ---------- */

function 印を作る(名前) {
    const 設定 = 設定を読む();
    const 印 = crypto.randomBytes(32).toString('hex');
    設定.端末 = (設定.端末 || []).filter((d) => new Date(d.期限) > new Date());
    設定.端末.push({
        印,
        名前: String(名前 || '名前のない端末').slice(0, 40),
        許した日: new Date().toISOString(),
        期限: new Date(Date.now() + 印の日数 * 86400000).toISOString(),
    });
    設定を書く(設定);
    return 印;
}

function 印が通るか(印) {
    if (!印) return false;
    const 設定 = 設定を読む();
    const d = (設定.端末 || []).find((x) => x.印 === 印);
    if (!d) return false;
    if (new Date(d.期限) <= new Date()) return false;
    return true;
}

/* ---------- 締め出し ---------- */

function 締め出されているか(住所) {
    const r = 間違い.get(住所);
    if (!r) return false;
    if (r.解ける && Date.now() < r.解ける) return true;
    if (r.解ける && Date.now() >= r.解ける) { 間違い.delete(住所); return false; }
    return false;
}

function 間違えた(住所) {
    const r = 間違い.get(住所) || { 回数: 0 };
    r.回数 += 1;
    if (r.回数 >= 許す間違い) {
        r.解ける = Date.now() + 締め出す分 * 60000;
        r.回数 = 0;
        console.warn(`[門番] ${住所} を ${締め出す分}分 締め出しました`);
    }
    間違い.set(住所, r);
}

function 合った(住所) {
    間違い.delete(住所);
}

/* ---------- 入口の画面 ---------- */

function 合言葉を聞く画面(訳) {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AReGLM</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center;
         font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;
         background:#f5f0e8; color:#2b2b2b; padding:1.2rem; }
  @media (prefers-color-scheme: dark){ body{ background:#1c1a17; color:#eee; } }
  .box { width:min(22rem,100%); display:grid; gap:.8rem; }
  h1 { font-size:1.1rem; margin:0; }
  p { font-size:.82rem; line-height:1.7; margin:0; opacity:.8; }
  input { padding:.7rem; font-size:1rem; border-radius:10px;
          border:1px solid rgba(128,128,128,.4); background:transparent; color:inherit; }
  button { padding:.7rem; font-size:1rem; border:0; border-radius:10px;
           background:#2e7d4f; color:#fff; cursor:pointer; }
  .err { color:#dc2626; font-size:.82rem; }
</style></head><body>
<form class="box" method="POST" action="/__gate">
  <h1>AReGLM</h1>
  <p>この端末は、まだ許可されていません。<br>合言葉を入れてください。</p>
  ${訳 ? `<p class="err">${訳}</p>` : ''}
  <input type="password" name="合言葉" autocomplete="current-password" autofocus required>
  <input type="text" name="名前" placeholder="端末の名前（例: iPhone）" autocomplete="off">
  <button type="submit">入る</button>
  <p>合っていれば、この端末を${印の日数}日間おぼえます。<br>
     このツールは外部へ一切送信しません。</p>
</form></body></html>`;
}

/**
 * 門番を Express に取り付ける。
 *
 * @param {object} app
 * @param {function} 他の端末を許しているか  設定で「他の端末から使う」が入かどうか
 */
/**
 * この端末からしか使わせない口
 *
 * なぜ分けるのか:
 *
 *   合言葉を通れば全部使える、という作りにしていた。
 *   だが、この二つは合言葉があっても外から使わせてはいけない。
 *
 *     ・パソコンを操る   … 画面に文字を打ち、押す
 *     ・コードを書き換える … 道具そのものを作り変える
 *
 *   合言葉が漏れたとき、
 *   「スマホから在庫を見られる」のと
 *   「よその端末からこのパソコンを操られる」のとでは、
 *   被害の重さがまるで違う。
 *
 *   合言葉は、いつか漏れるものとして考える。
 *   漏れても、この二つだけは届かないようにしておく。
 *
 *   スマホから使いたくなる類のものでもない。
 */
const この端末だけの口 = [
    '/api/computer',      // 画面に文字を打ち、押す
    '/api/browser',       // Chromeを開いて操る
    '/api/remote',        // 画面を映して、そこを押す
    '/api/code',          // 道具そのものを作り変える
    '/api/help',          // 端末の状態を全部まとめる
    '/api/tidy-logs',     // 記録を削る（消される側になり得る）
    // 自作AIへ渡す口は、前に /api/ai-local/ が付く。
    // 付け忘れると、守っているつもりで守れていない。
    '/api/ai-local/self-review',   // 覚えた中身を見せる
    '/api/ai-local/learned-tasks', // 覚えた手順を書き換えられる
    '/api/ai-local/forget',        // 覚えたことを忘れさせられる
    '/api/restart-gateway', // 入口を落とせる
];

function 門番を置く(app, 他の端末を許しているか, Tailscaleを許しているか) {
    app.use((req, res, next) => {
        const 住所 = (req.socket && req.socket.remoteAddress) || '';

        // 自分の端末は、いつでもそのまま通す。
        // ここを閉じると、自分が自分の道具を使えなくなる。
        if (自分の端末か(住所)) return next();

        // 強い口は、合言葉が合っていても外からは通さない。
        //
        // 合言葉は、いつか漏れるものとして考える。
        // 漏れたときに、この端末を操られては取り返しがつかない。
        if (この端末だけの口.some((道) => req.path.startsWith(道))) {
            console.warn(`[門番] 外から強い口に来ました: ${住所} → ${req.path}`);
            res.status(403).type('text/plain; charset=utf-8');
            return res.end('この操作は、この端末からしか行えません。\n'
                + 'パソコンを操る・コードを書き換えるといった操作は、'
                + '合言葉が合っていても、外からは受け付けません。');
        }

        /*
         * どの経路から来たかで、許しているかどうかを分けて見る。
         *
         *   ・Tailscale（本人だけの端末をつなぐVPN）の中から来た
         *     → 「Tailscaleから使う」が入かどうかだけを見る
         *   ・普通のLAN（同じWi-Fi等）から来た
         *     → 「他の端末から使う」が入かどうかだけを見る
         *   ・どちらでもない（インターネット等）
         *     → 合言葉を聞くまでもなく断る
         *
         * 片方だけ入にしていても、もう片方の経路までは開かない。
         * 「Tailscaleの自分の端末だけ許したい。同じWi-Fiの人には
         * 入口も見せたくない」という使い方ができるようにするため。
         */
        const Tailscale経由 = Tailscaleの中か(住所);
        const 普通のLAN経由 = !Tailscale経由 && 同じLANか(住所);

        if (Tailscale経由) {
            if (!(Tailscaleを許しているか && Tailscaleを許しているか())) {
                res.status(403).type('text/plain; charset=utf-8');
                return res.end('このツールは、Tailscale経由では使わない設定になっています。\n'
                    + '使うには、本体の設定で「Tailscaleから使う」を入にしてください。');
            }
        } else if (普通のLAN経由) {
            if (!他の端末を許しているか()) {
                res.status(403).type('text/plain; charset=utf-8');
                return res.end('このツールは、この端末の中だけで使う設定になっています。\n'
                    + '他の端末から使うには、本体の設定で「他の端末から使う」を入にしてください。');
            }
        } else {
            // 外のインターネットからは、合言葉を聞くまでもなく断る
            console.warn(`[門番] LANの外から来ました: ${住所}`);
            res.status(403).type('text/plain; charset=utf-8');
            return res.end('このネットワークからは使えません。');
        }

        if (締め出されているか(住所)) {
            res.status(429).type('text/plain; charset=utf-8');
            return res.end(`間違いが続いたため、しばらく受け付けません（約${締め出す分}分）。`);
        }

        // 合言葉を送ってきた
        // 道の名前は英字にしてある。
        // 日本語にしたところ、送られてくる文字と
        // ここで比べる文字が一致せず、正しい合言葉でも通らなかった。
        // 同じ間違いを /取引を見る でも一度やっている。
        if (req.method === 'POST' && req.path === '/__gate') {
            const 言葉 = (req.body && req.body['合言葉']) || '';
            const 名前 = (req.body && req.body['名前']) || '';

            if (!合言葉が合うか(言葉)) {
                間違えた(住所);
                res.status(401).type('text/html; charset=utf-8');
                return res.end(合言葉を聞く画面('合言葉が違います。'));
            }

            合った(住所);
            const 印 = 印を作る(名前);
            res.setHeader('Set-Cookie',
                `areglm_pass=${印}; Path=/; Max-Age=${印の日数 * 86400}; HttpOnly; SameSite=Lax`);
            res.setHeader('Location', '/');
            return res.status(303).end();
        }

        // すでに許した端末か
        const 印 = (req.headers.cookie || '')
            .split(';').map((s) => s.trim())
            .find((s) => s.startsWith('areglm_pass='));
        if (印 && 印が通るか(印.slice('areglm_pass='.length))) return next();

        // まだなら、合言葉を聞く。
        // ここで next() してしまうと、画面のファイルが誰でも取れてしまう。
        res.status(401).type('text/html; charset=utf-8');
        return res.end(合言葉を聞く画面(''));
    });
}

module.exports = {
    この端末だけの口,
    門番を置く,
    合言葉を決める,
    合言葉が合うか,
    設定を読む,
    設定を書く,
    同じLANか,
    Tailscaleの中か,
};
