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
const os = require('os');

const 設定ファイル = process.env.ARELM_GATE_FILE || path.join(__dirname, 'data', '門番.json');

/** 印の有効期間（日）。これを過ぎたら、もう一度合言葉を聞く。 */
const 印の日数 = 30;

/** 何回間違えたら締め出すか */
const 許す間違い = 5;

/** 締め出す長さ（分） */
const 締め出す分 = 15;

/** 合言葉の前でも渡してよい、アイコン類（アプリの名前と絵だけ） */
const 公開してよい道 = new Set([
    '/manifest.json',
    '/images/icon-192x192.png',
    '/images/icon-512x512.png',
    '/images/apple-touch-icon.png',
    '/images/icon-any-192x192.png',
    '/images/icon-any-512x512.png',
]);

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
    // 許した端末の印が入るので、本人だけが読める形で書く（以前は誰でも読める権限で書いていた）
    fs.writeFileSync(設定ファイル, JSON.stringify(中身, null, 2), { mode: 0o600 });
    try { fs.chmodSync(設定ファイル, 0o600); } catch { /* 権限を変えられない置き場でも、書けていればよい */ }
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
 * 接続元はこのMac自身でも、「他の端末の通信を中継したもの」か。
 *
 * tailscale serve・SSHの転送・リバースプロキシは、遠くの端末の通信を
 * このMacの中(127.0.0.1)から出し直す。接続元だけ見ると、Macの前にいる本人と
 * 見分けがつかず、合言葉もMac専用の操作も素通りになってしまう。
 * 中継の印（転送ヘッダー）が付いているか、宛先の名前（Host）が
 * localhost系でないものは、中継されたものとして扱う。
 * Macのブラウザが直接開いた通信には、どちらも付かない。
 */
function 中継された通信か(req) {
    const h = (req && req.headers) || {};
    if (h['x-forwarded-for'] || h['x-forwarded-host'] || h['x-forwarded-proto'] || h['forwarded']
        || h['x-real-ip'] || h['via'] || h['tailscale-user-login']) return true;
    const host = String(h['host'] || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    return !['localhost', '127.0.0.1', '::1'].includes(host);
}

/**
 * 遠くの端末が、どんな名前でこのMacを開いたか（Host）が、よそのサイトの名前ではないか。
 *
 * DNSの付け替え（あるサイトの名前を、途中でこのMacの住所に向け直す手口）を使うと、
 * 同じWi-Fiの端末で開いた「よそのページ」から、このMacへ頼みを送れる。
 * 合言葉が無くなり、入るにはMacで「許可」を押すだけになったので、その頼みが本人の端末の頼みと
 * 見分けられないと、一度押しただけで、よそのページが中に入れてしまう。
 * よそのサイトは、普通のインターネットの名前（evil.example など）でしか来られない。
 * だから、住所そのもの（192.168… / 100.… / [fe80::…]）・点の無い名前・家の中だけの名前
 * （.local・.lan・.home.arpa など）・Tailscaleの名前（.ts.net）・このMacの名前だけを通す。
 */
function 家の中の名前か(名前) {
    const n = String(名前 || '').toLowerCase().trim();
    if (!n) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(n)) return true;          // IPv4 の住所
    if (n.includes(':')) return true;                              // IPv6 の住所（[ ] は外してある）
    if (!n.includes('.')) return true;                             // 点の無い名前（Tailscaleの短い名前など）
    if (n === String(os.hostname() || '').toLowerCase()) return true;
    return /\.(local|lan|home|internal|localhost|home\.arpa|ts\.net)$/.test(n);
}
function 宛先の名前を取り出す(値) {
    let h = String(値 || '').split(',')[0].trim();
    if (h.startsWith('[')) return h.slice(1, h.indexOf(']') > 0 ? h.indexOf(']') : undefined);
    return h.replace(/:\d+$/, '');
}
function 宛先の名前がよいか(req) {
    const h = (req && req.headers) || {};
    const 名前たち = [h['host'], h['x-forwarded-host']].filter(Boolean).map(宛先の名前を取り出す);
    return 名前たち.length > 0 && 名前たち.every(家の中の名前か);
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

function 印を作る(名前, ログインも省く = false) {
    const 設定 = 設定を読む();
    const 印 = crypto.randomBytes(32).toString('hex');
    設定.端末 = (設定.端末 || []).filter((d) => new Date(d.期限) > new Date());
    設定.端末.push({
        印,
        名前: String(名前 || '名前のない端末').slice(0, 40),
        許した日: new Date().toISOString(),
        期限: new Date(Date.now() + 印の日数 * 86400000).toISOString(),
        // Macの前で「ログインも省く」を選んで許した端末は、ユーザー名・パスワードなしで入れる
        ログイン省略: !!ログインも省く,
    });
    設定を書く(設定);
    return 印;
}

/* ==========================================================
   許可の頼み（合言葉を覚えていなくても、Macの前で1回押すだけで入れる）
   ========================================================== */
//
// 新しい端末が「入りたい」と頼むと、4桁のコードつきで、Macの画面に知らせが出る。
// 許せるのは、Mac本体の画面だけ（server/index.js で、Mac本体のブラウザからだけ受け付ける）。
// コードは秘密ではない。「いま目の前の端末が頼んだものか」を、人が見分けるための印。
// 頼みは5分で消える。頼める回数にも、待ちの数にも、上限がある。

const 待つ分 = 5;
const 待ち = new Map();          // id → { id, code, 名前, 住所, 時刻, 状態, 省く }
const 頼みの記録 = new Map();    // 住所 → [時刻, …]

function 待ちを掃除() {
    const 今 = Date.now();
    for (const [id, x] of 待ち) if (今 - x.時刻 > 待つ分 * 60000) 待ち.delete(id);
}

function ペアを頼む(住所, 名前, 経路) {
    待ちを掃除();
    const 今 = Date.now();
    const 記録 = (頼みの記録.get(住所) || []).filter((t) => 今 - t < 10 * 60000);
    if (記録.length >= 10) return { ok: false, 訳: '続けて頼みすぎです。しばらく待ってください' };
    // 数えるのは、まだ決めていない頼みだけ。前は決め済みの頼みも5分間数えていたので、
    // 同じWi-Fiの誰かが頼みを続けると、本人が断っても、誰も頼めないままになった（合言葉の道も閉じたので、入る道が無くなる）。
    const まだの頼み = [...待ち.values()].filter((x) => x.状態 === '待ち');
    if (まだの頼み.filter((x) => x.住所 === 住所).length >= 2) return { ok: false, 訳: 'この端末からの頼みが、まだMacで決まっていません。Macの画面を見てください' };
    if (まだの頼み.length >= 5) return { ok: false, 訳: 'いま、許可待ちが多すぎます。少し待ってください' };
    記録.push(今);
    頼みの記録.set(住所, 記録);
    const id = crypto.randomBytes(16).toString('hex');
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    待ち.set(id, { id, code, 名前: String(名前 || '名前のない端末').slice(0, 40), 住所, 経路: String(経路 || ''), 時刻: 今, 状態: '待ち', 省く: false });
    return { ok: true, id, code, 待つ分 };
}

/** 頼んだ端末が、結果を聞く。許されていれば、一度だけ、印を渡す。 */
function ペアの様子(id) {
    待ちを掃除();
    const x = 待ち.get(id);
    if (!x) return { 状態: '期限切れ' };
    if (x.状態 === '許可') {
        待ち.delete(id);                                 // 一度きり。使い回せない
        return { 状態: '許可', 印: 印を作る(x.名前, x.省く) };
    }
    if (x.状態 === '断った') { 待ち.delete(id); return { 状態: '断った' }; }
    return { 状態: '待ち' };
}

function ペアの待ち一覧() {
    待ちを掃除();
    return [...待ち.values()].filter((x) => x.状態 === '待ち')
        .map((x) => ({ id: x.id, code: x.code, 名前: x.名前, 住所: x.住所, 経路: x.経路, 経過秒: Math.round((Date.now() - x.時刻) / 1000) }));
}

function ペアを決める(id, 許す, ログインも省く) {
    const x = 待ち.get(id);
    if (!x || x.状態 !== '待ち') return { ok: false, 訳: 'その頼みは、もうありません（時間切れか、決め済みです）' };
    x.状態 = 許す ? '許可' : '断った';
    x.省く = !!ログインも省く;
    return { ok: true, 訳: 許す ? `「${x.名前}」を許しました` : `「${x.名前}」を断りました` };
}

/** 端末を指す、秘密でない名札（印そのものは画面に出さない） */
function 端末の名札(印) {
    return crypto.createHash('sha256').update(String(印)).digest('hex').slice(0, 12);
}

/**
 * 使っている端末の印を延ばす（最後に来た日も残す）。
 * 本人の要望「合言葉なしで、私の端末だけ」。許可はMacの前で押すだけになったが、
 * 30日で切れるたびにMacの前へ行く必要があった。使っている間は切れないようにする（使わなくなった端末は30日で切れる）。
 * 書き込みは1日に1回まで。延ばしたときだけ、新しい期限を返す。
 */
function 印を延ばす(印) {
    if (!印) return null;
    const 設定 = 設定を読む();
    const d = (設定.端末 || []).find((x) => x.印 === 印);
    if (!d || new Date(d.期限) <= new Date()) return null;
    const 今 = Date.now();
    if (d.最後 && 今 - new Date(d.最後).getTime() < 86400000) return null;
    d.最後 = new Date(今).toISOString();
    d.期限 = new Date(今 + 印の日数 * 86400000).toISOString();
    設定を書く(設定);
    return d.期限;
}

/** 許した端末の一覧（印は出さない） */
function 許した端末の一覧() {
    return (設定を読む().端末 || [])
        .filter((d) => new Date(d.期限) > new Date())
        .map((d) => ({ id: 端末の名札(d.印), 名前: d.名前, 許した日: d.許した日, 期限: d.期限, 最後: d.最後 || null, ログイン省略: d.ログイン省略 === true }));
}

/**
 * 1台だけ外す（なくした端末など）。消さずに「外した端末」へ移す（いつ・どの端末を外したかが残る）。
 * 外した端末の印は、もう通らない。
 */
function 端末を外す(id) {
    const 設定 = 設定を読む();
    const i = (設定.端末 || []).findIndex((d) => 端末の名札(d.印) === String(id || ''));
    if (i < 0) return { ok: false, 訳: 'その端末は、もう一覧にありません' };
    const [d] = 設定.端末.splice(i, 1);
    設定.外した端末 = (設定.外した端末 || []).concat([{ 名前: d.名前, 許した日: d.許した日, 外した日: new Date().toISOString(), 名札: 端末の名札(d.印) }]).slice(-100);
    設定を書く(設定);
    return { ok: true, 訳: `「${d.名前}」を外しました（もう一度使うには、Macで許可し直します）` };
}

/** 許した端末の「ログインも省く」を切り替える（前に「ログインは必要」で許した端末を、押すだけで入れるようにする） */
function ログイン省略を変える(id, 入) {
    const 設定 = 設定を読む();
    const d = (設定.端末 || []).find((x) => 端末の名札(x.印) === String(id || ''));
    if (!d) return { ok: false, 訳: 'その端末は、もう一覧にありません' };
    d.ログイン省略 = 入 === true;
    設定を書く(設定);
    return { ok: true, 訳: 入 ? `「${d.名前}」は、ログインなしで入れます` : `「${d.名前}」は、入るたびにログインが要ります` };
}

/** 合言葉で入る道を、まだ使うか（既定は使わない。本人の要望「合言葉はなしに」。許可はMacの前で押すだけ） */
function 合言葉で入れるか() {
    return 設定を読む().合言葉で入れる === true && !!設定を読む().合言葉;
}

/** cookie の印から、許した端末の記録を引く（無ければ null） */
function 印からの端末(cookie) {
    const 部分 = String(cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('areglm_pass='));
    if (!部分) return null;
    const 印 = 部分.slice('areglm_pass='.length);
    const d = (設定を読む().端末 || []).find((x) => x.印 === 印);
    return d && new Date(d.期限) > new Date() ? d : null;
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

// 間違い・締め出しを、本人が見られる「入場の記録」へ知らせる先（server/index.js が決める）
let 間違いの知らせ先 = null;
function 間違いの知らせ先を決める(fn) { 間違いの知らせ先 = typeof fn === 'function' ? fn : null; }

function 間違えた(住所) {
    const r = 間違い.get(住所) || { 回数: 0 };
    r.回数 += 1;
    let 締め出した = false;
    if (r.回数 >= 許す間違い) {
        r.解ける = Date.now() + 締め出す分 * 60000;
        r.回数 = 0;
        締め出した = true;
        console.warn(`[門番] ${住所} を ${締め出す分}分 締め出しました`);
    }
    間違い.set(住所, r);
    try { if (間違いの知らせ先) 間違いの知らせ先(締め出した ? '合言葉の締め出し' : '合言葉の間違い', 住所); } catch { /* 記録の失敗で門番を止めない */ }
}

function 合った(住所) {
    間違い.delete(住所);
}

/* ---------- 入口の画面 ---------- */

/** ブラウザの情報から、端末の呼び名を推す（合言葉の画面の「端末の名前」の初期値） */
function 端末名を推す(ua) {
    const u = String(ua || '');
    const タッチ = /Macintosh/.test(u) && /Mobile\//.test(u);      // iPadOS は Mac を名乗ることがある
    if (/iPhone/.test(u)) return 'iPhone';
    if (/iPad/.test(u) || タッチ) return 'iPad';
    if (/Android/.test(u)) return 'Android';
    if (/Windows/.test(u)) return 'Windowsのパソコン';
    if (/Macintosh|Mac OS X/.test(u)) return 'Mac';
    return '';
}

function 合言葉を聞く画面(訳, 初期の名前 = '') {
    // 本人の要望（2026-10-09）「合言葉やパスワードはなしにして、私のデバイスでしか開けないように」。
    // 入るには、Macの前で本人が「許可」を押すだけにする。合言葉の欄は、本人が合言葉で入る道を残したときだけ出す。
    const 合言葉も = 合言葉で入れるか();
    const 名前 = String(初期の名前).replace(/[&<>"']/g, '');
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ARELM</title>
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
  button { padding:.8rem; font-size:1rem; border:0; border-radius:10px;
           background:#2e7d4f; color:#fff; cursor:pointer; }
  .err { color:#dc2626; font-size:.82rem; }
  details summary { font-size:.82rem; opacity:.7; cursor:pointer; }
</style></head><body>
<form class="box" method="POST" action="/__gate">
  <h1>ARELM</h1>
  <p>この端末は、まだ許可されていません。<br>下のボタンを押して、Macの画面で「許可」を押すと入れます（合言葉もパスワードも要りません）。</p>
  ${訳 ? `<p class="err">${訳}</p>` : ''}
  <input type="text" name="名前" placeholder="端末の名前（例: iPhone）" autocomplete="off" value="${名前}" aria-label="端末の名前">
  <button type="button" id="pair">Macに許可を頼む</button>
  <p id="pairmsg"></p>
  <p>許可した端末だけが、このツールを開けます。使っている間は、許可が切れません。<br>このツールは外部へ一切送信しません。</p>
  ${合言葉も ? `<details><summary>合言葉で入る（前の決め方）</summary>
  <input type="password" name="合言葉" autocomplete="current-password" aria-label="合言葉">
  <button type="submit" style="background:#555;margin-top:.5rem">合言葉で入る</button></details>` : ''}
</form>
<script>
// iPadは、別のアプリへ切り替えて戻るとページを読み込み直すことがあり、そのたびに新しい頼み（新しいコード）を
// 出していた。コードが変わってMacで確かめられず、すぐ回数の上限に達した。頼みはこのタブに覚えておき、続きから待つ。
var 覚え鍵 = 'areglm_pair_wait';
function 待ちを見せる(r) {
  var m = document.getElementById('pairmsg');
  m.textContent = '';
  m.appendChild(document.createTextNode('Macの画面に、このコードの知らせが出ます。同じコードか確かめて、Macで「許可」を押してください（5分以内）。'));
  var 大 = document.createElement('div'); 大.textContent = r.code; 大.style.cssText = 'font-size:2.4rem;letter-spacing:.4rem;font-weight:700;margin-top:.4rem';
  m.appendChild(大);
  var t = setInterval(async function () {
    var s;
    try { s = await (await fetch('/__pair/status?id=' + encodeURIComponent(r.id), { cache: 'no-store' })).json(); } catch (e) { return; }
    if (s['状態'] === '許可') { clearInterval(t); sessionStorage.removeItem(覚え鍵); location.href = '/'; }
    else if (s['状態'] !== '待ち') { clearInterval(t); sessionStorage.removeItem(覚え鍵); m.textContent = s['状態'] === '断った' ? 'Macで断られました。' : '時間切れです。もう一度押してください。'; }
  }, 2000);
}
function 覚えた待ち() {
  try { var r = JSON.parse(sessionStorage.getItem(覚え鍵) || 'null'); return r && Date.now() - r.時刻 < 5 * 60000 ? r : null; } catch (e) { return null; }
}
var 前 = 覚えた待ち();
if (前) 待ちを見せる(前);
// 名前の欄でEnterを押したときも、合言葉ではなく、許可を頼む（合言葉の道を残していないときは、送らない）
document.querySelector('form').addEventListener('submit', function (e) {
  if (!document.querySelector('[name=合言葉]') || !document.querySelector('[name=合言葉]').value) { e.preventDefault(); document.getElementById('pair').click(); }
});
document.getElementById('pair').addEventListener('click', async function () {
  var m = document.getElementById('pairmsg');
  var 続き = 覚えた待ち();
  if (続き) { 待ちを見せる(続き); return; }
  var 名 = document.querySelector('[name=名前]').value;
  var r = await (await fetch('/__pair/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 名前: 名 }) })).json();
  if (!r.ok) { m.textContent = r.訳 || '頼めませんでした'; return; }
  r.時刻 = Date.now();
  try { sessionStorage.setItem(覚え鍵, JSON.stringify(r)); } catch (e) {}
  待ちを見せる(r);
});
</script></body></html>`;
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
 *
 * ただし一つだけ例外を設けている:
 *
 *   Tailscale（本人だけの端末をつなぐVPN）経由で、かつ
 *   「Tailscaleから使う」が入になっているときだけは、
 *   合言葉の認証を経たうえでこの口も通す。
 *
 *   同じWi-Fiには他人（家族の来客・同居人・IoT機器）が
 *   混ざりうるが、Tailscaleは本人が承認した端末しか
 *   繋がらない、閉じたネットワークだから区別する。
 *   それでも合言葉は必ず求める — Tailscaleの中にいる
 *   ことと、この人が本人であることは別の話だから。
 */
const この端末だけの口 = [
    '/api/pair',          // 新しい端末を許す・断る（Mac本体の画面でだけ）
    '/api/account/reset', // ユーザー名とパスワードの決め直し（Mac本体の画面でだけ）
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
        const 接続元 = (req.socket && req.socket.remoteAddress) || '';
        const 中継 = 自分の端末か(接続元) && 中継された通信か(req);

        // Macの前にいる本人（このMac自身から、中継なしで来た通信）は、いつでもそのまま通す。
        // ここを閉じると、自分が自分の道具を使えなくなる。
        if (自分の端末か(接続元) && !中継) return next();

        // 中継された通信（tailscale serve 等）は、遠くの端末として扱う。
        // 接続元は常にこのMacに見えるので、相手の区別と締め出しには、
        // 中継が付けた「元の相手」の住所を使う（無ければ「中継」という名前）。
        const 元の住所 = 中継 ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
        const 住所 = 中継 ? (元の住所 || '中継') : 接続元;

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
        // 中継は、Macの設定した tailscale serve から来たものだけを想定している
        // （本人の端末だけがつながる閉じたネットワーク）ので、Tailscale経由として扱う。
        const Tailscale経由 = 中継 || Tailscaleの中か(住所);
        const 普通のLAN経由 = !Tailscale経由 && 同じLANか(住所);

        // よそのサイトの名前で来た頼み（DNSの付け替え）は、何も見せずに断る
        if (!宛先の名前がよいか(req)) {
            console.warn(`[門番] よそのサイトの名前で来ました: ${住所} → ${String(req.headers['host'] || '').slice(0, 80)}`);
            res.status(403).type('text/plain; charset=utf-8');
            return res.end('この名前では開けません。Macの住所（例: http://192.168.…）か、Tailscaleの名前で開いてください。');
        }

        // 強い口は、原則として外からは通さない。
        //
        // 合言葉は、いつか漏れるものとして考える。
        // 漏れたときに、この端末を操られては取り返しがつかない。
        //
        // 例外は Tailscale 経由だけ。本人が承認した端末しか
        // 繋がらない閉じたネットワークなので、同じWi-Fi（他人が
        // 混ざりうる）とは切り分ける。ここを通っても、この先の
        // 合言葉の認証は普通に必要（次の if 群 → __gate → 印）。
        // 大文字・小文字を揃えて比べる。Expressの道は大小を区別しないので、/API/computer が
        // ここの比べ（区別する）をすり抜けて、同じWi-Fiの端末からMacを操る口に届いていた。
        const 小文字の道 = String(req.path || '').toLowerCase();
        if (この端末だけの口.some((道) => 小文字の道.startsWith(道))) {
            const Tailscaleから強い口を許すか = Tailscale経由
                && Tailscaleを許しているか && Tailscaleを許しているか();
            if (!Tailscaleから強い口を許すか) {
                console.warn(`[門番] 外から強い口に来ました: ${住所} → ${req.path}`);
                res.status(403).type('text/plain; charset=utf-8');
                return res.end('この操作は、この端末か、Tailscaleでつないだ本人の端末からしか行えません。\n'
                    + 'パソコンを操る・コードを書き換えるといった操作は、'
                    + '合言葉が合っていても、それ以外の経路からは受け付けません。');
            }
            // Tailscale経由で許された場合は、下の通常の認証の流れに合流する。
        }

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

        // ホーム画面に追加するときの、アイコンとマニフェスト（アプリの名前と絵だけ）。
        //
        // iPad/iPhone は、「ホーム画面に追加」のときにアイコンを取りに行くが、
        // 合言葉を通った印（cookie）を付けないことがあり、ここで止まると、
        // アイコンが文字だけの味気ないものになる。
        // 中身は名前と絵だけで、鍵もデータも入っていない。
        // ここに来られるのは、上の経路の確認（同じLAN／Tailscale・設定で許可・締め出されていない）を
        // 通った相手だけなので、外のインターネットからは、これまでどおり届かない。
        if (req.method === 'GET' && 公開してよい道.has(req.path)) return next();

        // 許可の頼み（合言葉の代わりに、Macの前で許してもらう）。
        // ここに来られるのは、上の経路の確認を通った相手だけ（同じLAN／Tailscale）。
        if (req.method === 'POST' && req.path === '/__pair/request') {
            const r = ペアを頼む(住所, (req.body && req.body['名前']) || 端末名を推す(req.headers['user-agent']),
                Tailscale経由 ? 'Tailscale' : '同じWi-Fi');
            // 頼んだことを、入場の記録に残す（見慣れない住所からの頼みに、本人が気づけるように）
            if (r.ok && 間違いの知らせ先) { try { 間違いの知らせ先('許可の頼み', 住所); } catch { /* 記録できなくても、頼みは止めない */ } }
            return res.status(r.ok ? 200 : 429).json(r);
        }
        // Windows用キットのインストーラーからの報告。ブラウザの印（cookie）は持たないので、ここでは通し、
        // 中身はキットのZIPに入れた使い捨ての印で確かめる（server/端末の記録.js）。
        if (req.method === 'POST' && req.path === '/__installed') return next();
        if (req.method === 'GET' && req.path === '/__pair/status') {
            const s = ペアの様子(String(req.query.id || ''));
            if (s.印) {
                res.setHeader('Set-Cookie',
                    `areglm_pass=${s.印}; Path=/; Max-Age=${印の日数 * 86400}; HttpOnly; SameSite=Lax`);
            }
            res.set('Cache-Control', 'no-store');
            return res.json({ 状態: s.状態 });
        }

        // 合言葉を送ってきた
        // 道の名前は英字にしてある。
        // 日本語にしたところ、送られてくる文字と
        // ここで比べる文字が一致せず、正しい合言葉でも通らなかった。
        // 同じ間違いを /取引を見る でも一度やっている。
        if (req.method === 'POST' && req.path === '/__gate') {
            const 言葉 = (req.body && req.body['合言葉']) || '';
            const 名前 = (req.body && req.body['名前']) || '';
            // 合言葉の道は、既定では閉じている（許可はMacの前で押すだけ）。前の合言葉を知っている人でも入れない
            if (!合言葉で入れるか()) {
                res.status(403).type('text/html; charset=utf-8');
                return res.end(合言葉を聞く画面('合言葉では入れません。「Macに許可を頼む」を押してください。', 端末名を推す(req.headers['user-agent'])));
            }

            if (!合言葉が合うか(言葉)) {
                間違えた(住所);
                res.status(401).type('text/html; charset=utf-8');
                return res.end(合言葉を聞く画面('合言葉が違います。', 端末名を推す(req.headers['user-agent'])));
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
        if (印 && 印が通るか(印.slice('areglm_pass='.length))) {
            const 新しい期限 = 印を延ばす(印.slice('areglm_pass='.length));
            if (新しい期限) {
                res.append('Set-Cookie', `${印}; Path=/; Max-Age=${印の日数 * 86400}; HttpOnly; SameSite=Lax`);
            }
            return next();
        }

        // まだなら、合言葉を聞く。
        // ここで next() してしまうと、画面のファイルが誰でも取れてしまう。
        res.status(401).type('text/html; charset=utf-8');
        return res.end(合言葉を聞く画面('', 端末名を推す(req.headers['user-agent'])));
    });
}

module.exports = {
    間違いの知らせ先を決める,
    この端末だけの口,
    門番を置く,
    中継された通信か,
    合言葉を決める,
    合言葉が合うか,
    設定を読む,
    設定を書く,
    同じLANか,
    Tailscaleの中か,
    ペアの待ち一覧,
    ペアを決める,
    印からの端末,
    許した端末の一覧,
    端末を外す,
    ログイン省略を変える,
    合言葉で入れるか,
    印を延ばす,
    家の中の名前か,
    宛先の名前がよいか,
    ペアを頼む,
};
