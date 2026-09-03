/**
 * AReGLM API Gateway（Base44型バックエンド）
 * 公式APIへのプロキシ — CORS回避・キーをサーバー経由で送信
 */
const express = require('express');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 8080;

// HTTPS が使えるかどうか（マイクを使える接続へ回すために先に判定しておく）
const HTTPS_PORT_VALUE = process.env.HTTPS_PORT || 8443;
const CERT_PATH = path.join(__dirname, 'certs', 'cert.pem');
const KEY_PATH = path.join(__dirname, 'certs', 'key.pem');
const httpsAvailable = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const LEARNING_FILE = path.join(DATA_DIR, 'learning.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));   // 合言葉の入力を受け取るため

/**
 * 門番 — 他の端末から使うときの本人確認
 *
 * 他の何よりも先に置く。
 * 後ろに置くと、画面のファイルだけ先に渡してしまう。
 */
const 門番 = require('./門番');
const 他の端末設定 = path.join(DATA_DIR, '他の端末.json');

function 他の端末を許しているか() {
    try {
        return JSON.parse(fs.readFileSync(他の端末設定, 'utf8')).使う === true;
    } catch {
        // 読めないときは「許していない」。
        // 分からないときに開ける方へ倒してはいけない。
        return false;
    }
}

門番.門番を置く(app, 他の端末を許しているか);

/**
 * 他の端末から使うかどうかの設定。
 * この端末（127.0.0.1）からしか触れない（門番が外を止めるため）。
 */
app.get('/api/other-devices', (req, res) => {
    let 設定 = { 使う: false };
    try { 設定 = JSON.parse(fs.readFileSync(他の端末設定, 'utf8')); } catch { /* 既定のまま */ }
    const 門 = 門番.設定を読む();
    res.json({
        使う: 設定.使う === true,
        合言葉を決めてあるか: !!門.合言葉,
        許した端末: (門.端末 || []).map((d) => ({
            名前: d.名前, 許した日: d.許した日, 期限: d.期限,
        })),
        このMacの住所: lanAddresses(),
        入口: PORT,
    });
});

app.post('/api/other-devices', (req, res) => {
    const 使う = req.body && req.body['使う'] === true;
    const 言葉 = req.body && req.body['合言葉'];

    if (使う) {
        // 合言葉が無いまま開けることは、絶対にしない。
        // 開いた瞬間、同じWi-Fiの誰でも入れてしまう。
        if (言葉) {
            const r = 門番.合言葉を決める(言葉);
            if (!r.ok) return res.status(400).json(r);
        } else if (!門番.設定を読む().合言葉) {
            return res.status(400).json({
                ok: false,
                訳: '先に合言葉を決めてください。合言葉なしで他の端末に開くことはできません。',
            });
        }
    }

    fs.writeFileSync(他の端末設定, JSON.stringify({ 使う }, null, 2));
    res.json({
        ok: true,
        使う,
        訳: 使う
            ? '他の端末から使えるようにしました。本体を再起動すると有効になります。'
            : 'この端末の中だけに戻しました。本体を再起動すると有効になります。',
    });
});

/**
 * 覚えた声を、常駐の待ち受けへ渡す
 *
 * 画面側（ブラウザ）が覚えた声は、ブラウザの中にしかない。
 * アプリを開いていなくても反応させるには、
 * 常駐のプログラムからも読める場所へ置く必要がある。
 *
 * 置くのは「音の特徴」だけで、音声そのものは持たない。
 */
const 覚えた声の道 = path.join(
    process.env.HOME || '', 'Library', 'Application Support', 'AReGLM', '覚えた声.json');

app.post('/api/voice-templates', (req, res) => {
    const 一覧 = Array.isArray(req.body && req.body.templates) ? req.body.templates : null;
    if (!一覧) return res.status(400).json({ ok: false, 訳: 'templates がありません' });

    try {
        const 場所 = path.dirname(覚えた声の道);
        if (!fs.existsSync(場所)) fs.mkdirSync(場所, { recursive: true });

        // 音の特徴だけを書き出す。ほかの項目は持ち出さない。
        const 渡すもの = 一覧.map((x) => ({ 言葉: x['言葉'], 特徴: x['特徴'] }));
        fs.writeFileSync(覚えた声の道, JSON.stringify(渡すもの));

        res.json({ ok: true, 件数: 渡すもの.length, 場所: 覚えた声の道 });
    } catch (e) {
        res.status(500).json({ ok: false, 訳: e.message });
    }
});

/**
 * 言葉を覚える（マイクは常駐のプログラムが使う）
 *
 * ブラウザにマイクを許すと、そのページが開いている間ずっと
 * マイクを使える状態になる。それは避けたい、という話だった。
 *
 * ここでは、覚えるときだけ常駐のプログラムを短く動かす。
 * ブラウザには一度もマイクを許さずに済む。
 */
app.post('/api/voice-teach', (req, res) => {
    const 実行file = 待ち受けを用意する()
        || path.join(__dirname, 'voice', '常駐の待ち受け');
    const 言葉 = (req.body && req.body['言葉'] || '').trim();
    const 秒 = Math.min(6, Math.max(1.5, Number(req.body && req.body['秒']) || 2.5));

    if (!言葉) return res.status(400).json({ ok: false, 訳: '何と言うかを教えてください' });
    if (!fs.existsSync(実行file)) {
        return res.status(400).json({ ok: false, 訳: '聞き取りのプログラムが見つかりません' });
    }

    execFile(実行file, [覚えた声の道, '--teach', 言葉, String(秒)],
        { timeout: (秒 + 20) * 1000 },
        (err, stdout, stderr) => {
            const 出 = String(stdout || '') + String(stderr || '');
            if (err && !出.includes('覚えました')) {
                return res.json({
                    ok: false,
                    訳: 出.trim() || 'うまく覚えられませんでした',
                });
            }
            let 件数 = 0;
            let 一覧 = [];
            try { 一覧 = JSON.parse(fs.readFileSync(覚えた声の道, 'utf8')); 件数 = 一覧.length; } catch { /* 無視 */ }

            // 呼び名を2回覚えたら、こちらから待ち受けを始める。
            //
            // 「いちいち設定しなくていいように」という話だった。
            // 覚え終わってから、さらにボタンを押させるのでは、
            // 結局こちらの都合を押しつけていることになる。
            const 呼び名 = 名前を読む();
            const 呼び名の回数 = 一覧.filter((x) => x['言葉'] === 呼び名).length;
            let 始めた = false;

            if (呼び名の回数 >= 2 && !待ち受けが動いているか()) {
                try {
                    待ち受けを始める(呼び名);
                    始めた = true;
                } catch (e) {
                    console.warn('待ち受けを始められませんでした:', e.message);
                }
            }

            res.json({
                ok: true,
                訳: 出.trim() + (始めた
                    ? `\n「${呼び名}」と呼べば応じるようになりました。画面を閉じていても構いません。`
                    : ''),
                件数,
                待ち受けを始めた: 始めた,
            });
        });
});

/** 覚えている言葉の一覧（常駐が読む場所から） */
app.get('/api/voice-teach', (req, res) => {
    try {
        const 一覧 = JSON.parse(fs.readFileSync(覚えた声の道, 'utf8'));
        const 数え = {};
        一覧.forEach((x) => { 数え[x['言葉']] = (数え[x['言葉']] || 0) + 1; });
        res.json({ 言葉たち: Object.entries(数え).map(([言葉, 回数]) => ({ 言葉, 回数 })) });
    } catch {
        res.json({ 言葉たち: [] });
    }
});

app.post('/api/voice-teach/forget', (req, res) => {
    const 言葉 = req.body && req.body['言葉'];
    try {
        const 一覧 = JSON.parse(fs.readFileSync(覚えた声の道, 'utf8'));
        const 残す = 言葉 ? 一覧.filter((x) => x['言葉'] !== 言葉) : [];
        fs.writeFileSync(覚えた声の道, JSON.stringify(残す));
        res.json({ ok: true, 残り: 残す.length });
    } catch (e) {
        res.status(500).json({ ok: false, 訳: e.message });
    }
});

/** いま設定されている呼び名 */
function 名前を読む() {
    try {
        const 道 = path.join(DATA_DIR, '呼び名.json');
        if (fs.existsSync(道)) return JSON.parse(fs.readFileSync(道, 'utf8')).名 || 'アレラム';
    } catch { /* 既定に戻す */ }
    return 'アレラム';
}

function 待ち受けが動いているか() {
    const 実行file = 待ち受けを用意する()
        || path.join(__dirname, 'voice', '常駐の待ち受け');
    try {
        // シェルを経由せず、コマンドと引数を配列で分ける。
        // テンプレート文字列で組み立てていたときは、実行fileの中身に
        // シェルの特殊文字が混ざると、それがそのまま実行される作りだった
        // （コードの安全点検が「疑わしい」として検出）。
        // execFileSync は引数をそのまま1つの値として渡すので、
        // 中身が何であってもコマンドの一部として解釈されない。
        const 出 = require('child_process')
            .execFileSync('pgrep', ['-f', 実行file], { encoding: 'utf8' });
        return 出.trim().length > 0;
    } catch {
        // pgrep は見つからないと0件でも失敗扱いになる。
        // 「動いていない」という、これまでと同じ意味で受け取る。
        return false;
    }
}

/**
 * 本当に止める。
 *
 * launchd の登録を外してから、動いているものを止める。
 * 順番が逆だと、外す前に立て直されてしまう。
 */
function 待ち受けを本当に止める() {
    const 名札 = 'jp.areglm.listener';
    const 実行file = 待ち受けを用意する()
        || path.join(__dirname, 'voice', '常駐の待ち受け');

    // まず登録を外す（これをしないと、殺しても立て直される）
    try {
        require('child_process').execSync(
            `launchctl bootout gui/${process.getuid()}/${名札} 2>/dev/null || true`);
    } catch { /* 登録されていない */ }

    // そのうえで止める
    try {
        require('child_process').execSync(
            `pkill -f ${JSON.stringify(実行file)} 2>/dev/null || true`);
    } catch { /* 動いていない */ }
}

function 待ち受けを始める(呼び名) {
    const 実行file = 待ち受けを用意する()
        || path.join(__dirname, 'voice', '常駐の待ち受け');
    const アプリ = path.resolve(ROOT, '..', '..', '..');   // .app まで戻る

    // 声を書き込む先が要る。無いと、待ち受けが自分で覚えても
    // 保存できずに消える（このあと Swift 側で自由な聞き取りを使い、
    // 話しかけられただけで最初の声を覚えるようにしたため）。
    try {
        if (!fs.existsSync(覚えた声の道)) {
            fs.mkdirSync(path.dirname(覚えた声の道), { recursive: true });
            fs.writeFileSync(覚えた声の道, '[]');
        }
    } catch (e) {
        console.warn('声を覚える場所を用意できませんでした:', e.message);
    }

    // 起動は launchd だけに任せる（直接 spawn もすると、
    // 同じマイクを2つのプロセスが取り合ってクラッシュする。
    // /api/voice-listener の同じ問題を、ここでも直した）。
    書き込む常駐の設定(実行file, 覚えた声の道, 呼び名 || 名前を読む(), アプリ);
}

/** 呼び名を決める（画面から） */
app.post('/api/voice-name', (req, res) => {
    const 名 = (req.body && req.body['名'] || '').trim();
    if (!名) return res.status(400).json({ ok: false, 訳: '名前がありません' });
    fs.writeFileSync(path.join(DATA_DIR, '呼び名.json'), JSON.stringify({ 名 }));
    res.json({ ok: true, 名 });
});

/**
 * 待ち受けを一時的に止める
 *
 * なぜこれが要るのか:
 *   呼び名を聞き取るには、マイクは聞き続けるしかない。
 *   仕組み上そうなる。
 *
 *   だが「いまは聞かれたくない」ときは必ずある。
 *   人と大事な話をしているとき、打ち合わせのとき。
 *
 *   そのときに確実なのは、止めることだけ。
 *   「聞いているが使っていません」では安心できない。
 *   本当に止める。
 */
const 一時停止の道 = path.join(DATA_DIR, '待ち受けの一時停止.json');

function 一時停止中か() {
    try {
        const d = JSON.parse(fs.readFileSync(一時停止の道, 'utf8'));
        if (!d.まで) return false;
        if (d.まで === '解除するまで') return true;
        return new Date(d.まで) > new Date();
    } catch {
        return false;
    }
}

app.post('/api/voice-pause', (req, res) => {
    const 分 = req.body && req.body['分'];
    const 実行file = 待ち受けを用意する()
        || path.join(__dirname, 'voice', '常駐の待ち受け');

    if (分 === 0 || 分 === null) {
        // 止めるのをやめる＝また聞き始める
        try { fs.existsSync(一時停止の道) && fs.unlinkSync(一時停止の道); } catch { /* 無視 */ }
        if (!待ち受けが動いているか()) {
            try { 待ち受けを始める(); } catch { /* 無視 */ }
        }
        return res.json({ ok: true, 訳: 'また呼びかけに応じます。' });
    }

    void 実行file;

    const まで = (分 === '解除するまで')
        ? '解除するまで'
        : new Date(Date.now() + Number(分) * 60000).toISOString();

    fs.writeFileSync(一時停止の道, JSON.stringify({ まで }));

    // 本当に止める。動いたまま「使わない」ことにはしない。
    //
    // pkill だけでは止まらない。
    // launchd に「落ちたら立て直す」で登録してあるので、
    // 殺した瞬間に復活していた。
    // 「止めました」と言って止まっていないのが、いちばん許されない。
    // 登録ごと外してから、止める。
    待ち受けを本当に止める();

    res.json({
        ok: true,
        まで,
        訳: まで === '解除するまで'
            ? 'マイクを止めました。解除するまで、一切聞きません。'
            : `マイクを止めました。${分}分後にまた聞き始めます。`,
    });
});

app.get('/api/voice-pause', (req, res) => {
    let まで = null;
    try { まで = JSON.parse(fs.readFileSync(一時停止の道, 'utf8')).まで; } catch { /* 無い */ }
    res.json({ 止めているか: 一時停止中か(), まで });
});

// 時間が来たら、また聞き始める。
// 「30分だけ止める」と言われて、そのまま止まりっぱなしでは困る。
setInterval(() => {
    try {
        if (!fs.existsSync(一時停止の道)) return;
        const d = JSON.parse(fs.readFileSync(一時停止の道, 'utf8'));
        if (d.まで === '解除するまで') return;
        if (new Date(d.まで) <= new Date()) {
            fs.unlinkSync(一時停止の道);
            if (!待ち受けが動いているか()) 待ち受けを始める();
            console.log('一時停止の時間が過ぎたので、また待ち受けます');
        }
    } catch { /* 無視 */ }
}, 30000);

/**
 * 待ち受けの入口を、開き直さずに切り替える
 *
 * 「アプリを一度閉じて開き直してください」と書いていた。
 * だが、それはこちらの都合。
 * こちらで入れ直せるなら、こちらでやる。
 */
app.post('/api/restart-gateway', (req, res) => {
    res.json({
        ok: true,
        訳: '入口を入れ直します。数秒で戻ります。',
    });

    // 返事を返してから入れ直す。
    // 先に落とすと、返事が届かない。
    setTimeout(() => {
        console.log('入口を入れ直します（画面からの求めに応じて）');
        process.exit(0);   // 見張りが立て直す
    }, 400);
});

/**
 * 自分のコードを、安全に書き換える
 *
 * 触れてよい場所を限り、控えを取り、検査し、
 * 駄目なら自動で戻す。
 * 歯止めそのものには触らせない。
 */
const 書き換え = require('./自分を書き換える');

/**
 * パソコンを操る
 *
 * 決めた操作しかできない。好きな命令を動かす道は作っていない。
 * いつでも止められる。何をしたかは全部残る。
 */
const パソコン = require('./パソコンを操る');

/**
 * ツールの中から、Chromeを開いて操る
 *
 * base44 も SNS も、ログインが要るので、こちらからは開けない。
 * だが、あなたのChromeなら、もうログインしてある。
 * そのChromeを開いて操れば、一緒に画面を見ながら進められる。
 */
const ブラウザ = require('./ブラウザを操る');

/**
 * 遠隔操作 ― 画面を写して、その場所を押す
 *
 * ツールの中に本物の画面を映し、
 * 映った場所を押すと、実際の画面のそこが押される。
 *
 * 他所のサイトは埋め込めないが、
 * <b>画面そのものを映せば、何でも映る</b>。
 */
app.get('/api/remote/screen', (req, res) => {
    res.json(パソコン.画面を写して返す());
});

app.post('/api/remote/click', (req, res) => {
    const { よこ, たて, 種類 } = req.body || {};
    if (よこ == null || たて == null) {
        return res.status(400).json({ ok: false, 訳: '場所が要ります' });
    }
    const 操作 = 種類 === '二度押し' ? 'クリックする' : 'クリックする';
    res.json(パソコン.操る(操作, { よこ, たて }));
});

app.post('/api/remote/type', (req, res) => {
    const { 文, キー } = req.body || {};
    if (キー) return res.json(パソコン.操る('キーを押す', { キー }));
    if (文 === '\n' || 文 === '改行') return res.json(パソコン.操る('改行を押す', {}));
    if (!文) return res.status(400).json({ ok: false, 訳: '打つ文字が要ります' });
    res.json(パソコン.操る('文字を打つ', { 文 }));
});

app.get('/api/browser', (req, res) => {
    const タブ = ブラウザ.タブを見る();
    res.json({
        タブ,
        できること: ブラウザ.できること(),
        記録: ブラウザ.記録を読む().slice(-15),
        プロフィール: ブラウザ.プロフィール一覧(),
    });
});

/**
 * 「在庫ページを開いて」のような、AReGLM自身の画面名を、
 * このアプリのURL（#ハッシュ）に解決する。
 *
 * なぜ要るのか:
 *   「自動で作業する」のAIは、httpから始まるURLしか開けないことを知らず、
 *   「在庫ページ」のような名前をそのまま道として渡すことがあった。
 *   これは実在のURLではないため毎回失敗し、何度繰り返しても直らず、
 *   上限に達して静かに終わっていた。
 *
 *   AReGLM自身の画面名だけは、ここで実際のURLに変換してから開く。
 *   それ以外（本物のURLでも、知らない名前でもない）は、
 *   これまで通り失敗として扱う。
 */
const AREGLM_内部ページ = [
    { 語: ['ホーム', 'ダッシュボード'], ハッシュ: 'dashboard' },
    { 語: ['チャット'], ハッシュ: 'chat' },
    { 語: ['遠隔操作', 'リモート'], ハッシュ: 'remote' },
    { 語: ['ブランド'], ハッシュ: 'brands' },
    { 語: ['SNS', 'sns'], ハッシュ: 'sns' },
    { 語: ['在庫', '売上'], ハッシュ: 'inventory' },
    { 語: ['開発', 'スタジオ', '工房'], ハッシュ: 'studio' },
];

function AReGLM内部ページを解決する(文字列) {
    const s = String(文字列 || '');
    if (!s) return null;
    const 一致 = AREGLM_内部ページ.find((p) => p.語.some((語) => s.includes(語)));
    return 一致 ? `http://127.0.0.1:${APP_PORT}/#${一致.ハッシュ}` : null;
}

/** ブラウザの操作を行う。/api/browser とリモート作業の両方から使う。 */
function ブラウザの操作を行う(操作, 材料) {
    材料 = 材料 || {};
    const 道 = 材料.道;
    const 番 = 材料.番;

    switch (操作) {
        case 'タブを見る':
            return ブラウザ.タブを見る();
        case 'ページを読む':
            return ブラウザ.ページを読む();
        case '開く': {
            // 本物のURLでなければ、まずAReGLM自身の画面名として解決を試す。
            if (道 && !/^https?:\/\//.test(String(道))) {
                const 内部先 = AReGLM内部ページを解決する(道);
                if (内部先) return ブラウザ.開く(内部先, 材料['新しいタブ']);
            }
            return ブラウザ.開く(道, 材料['新しいタブ']);
        }
        case 'プロフィールで開く':
            return ブラウザ.プロフィールで開く(材料['プロフィール'], 道);
        case 'タブを選ぶ':
            return ブラウザ.タブを選ぶ(番);
        case 'タブを閉じる':
            return ブラウザ.タブを閉じる(番);
        case '戻る':
        case '進む':
        case '読み直す':
            return ブラウザ.動かす(操作);
        default:
            return {
                ok: false,
                訳: `「${操作}」はできません。できるのは: `
                    + ブラウザ.できること().map((x) => x.名).join('、'),
            };
    }
}

app.post('/api/browser', (req, res) => {
    const { 操作, 道, 番 } = req.body || {};
    res.json(ブラウザの操作を行う(操作, { ...(req.body || {}), 道, 番 }));
});

/**
 * リモート作業 ― エージェントの指示で、遠隔操作の画面から一手だけ自動で動く
 *
 * 危ないことはさせない:
 *   座標を押す・文字を打つ・スリープさせる・タブを閉じるといった
 *   「重い」操作は、自動化には使わせない。開く・切り替える・見る、
 *   といった取り返しのつく操作だけに絞ってある。
 *
 *   実際に何を押すか・打つかを決めるのはローカルLLM（この端末の中だけ）。
 *   決めた作業も、ここで一覧に無ければ実行しない
 *   （AIが無い作業を作ってしまっても、実行はされない）。
 *
 * 一手ずつ:
 *   まとめて全部は決めない。一手やって、結果を見て、また一手。
 *   画面側は、これを止めるまで・終わるまで繰り返し呼ぶ。
 */
function 自動化で使える作業() {
    const パソコン側 = パソコン.操作の一覧()
        .filter((x) => x.重さ === '軽い')
        .map((x) => ({ ...x, 出所: 'パソコン' }));
    const ブラウザ側 = ブラウザ.できること()
        .filter((x) => x.重さ === '軽い')
        .map((x) => ({ ...x, 出所: 'ブラウザ' }));
    return [...パソコン側, ...ブラウザ側];
}

app.post('/api/remote-task/step', async (req, res) => {
    const 目的 = (req.body && req.body['目的'] || '').trim();
    const これまで = (req.body && req.body['これまで']) || [];

    if (!目的) return res.status(400).json({ する: false, 訳: '目的が要ります' });

    const 使える作業 = 自動化で使える作業();
    // 出所（どちらのモジュールで実行するか）は、こちら側だけの都合。
    // AIに見せる説明には要らないので外す。
    const 見せる用 = 使える作業.map(({ 出所, ...x }) => x);

    let 決めた;
    try {
        const r = await fetch('http://127.0.0.1:8765/remote-task/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 目的, これまで, 使える作業: 見せる用 }),
            signal: AbortSignal.timeout(35000),
        });
        決めた = await r.json();
    } catch (e) {
        return res.status(200).json({
            する: false, 終わり: true,
            訳: '考える仕組み（この端末の中のAI）に繋がりませんでした: ' + e.message,
        });
    }

    if (!決めた || !決めた['する']) {
        return res.json(決めた || { する: false, 終わり: true, 訳: '決められませんでした' });
    }

    // --- 実際に動かす ---
    const 作業 = 決めた['作業'];
    const 材料 = 決めた['材料'] || {};
    const 対象 = 使える作業.find((x) => x.名 === 作業);

    let 結果;
    if (!対象) {
        結果 = { ok: false, 訳: `「${作業}」は使える作業にありません` };
    } else if (対象.出所 === 'ブラウザ') {
        結果 = ブラウザの操作を行う(作業, 材料);
    } else {
        結果 = パソコン.操る(作業, 材料);
    }

    res.json({
        する: true,
        作業,
        材料,
        訳: 決めた['訳'],
        結果,
    });
});

/**
 * このツールを、ふつうのChromeウィンドウでも開く。
 *
 * 普段は「アプリのように開く」専用のウィンドウ（--app=）で使っているが、
 * それだと拡張機能や複数タブなど、ふつうのChromeの機能が使えない。
 * ボタン一つで、同じ場所をふつうのタブとしても開けるようにする。
 */
app.post('/api/open-in-chrome', (req, res) => {
    // 「open -a Google Chrome」は、この端末では窓を作らないことがあった
    // （AppleScript側から見えない状態になっていた）。
    // 代わりに、ブラウザのタブ操作で確かめずみの開き方（open location）を使う。
    const url = `http://127.0.0.1:${APP_PORT}`;
    res.json(ブラウザ.開く(url, true));
});

/**
 * 画像を作る（ComfyUI）の橋渡し
 *
 * 実際に作るのは AIエンジン（Python・8765番）と ComfyUI（8188番）。
 * 画面側からは、この道具のポート（APP_PORT）だけを見ていればよいようにする。
 */
/**
 * ブランドの記憶（長期記憶の最小版）
 *
 * 会話は30分で切れて忘れてしまう。
 * ブランドごとに「前に何をやって、どうなったか」を積み重ねておき、
 * 次にそのブランドの話が出たときに混ぜ込めるようにする。
 */
app.get('/api/brand-memory', async (req, res) => {
    try {
        const q = req.query.brand ? `?brand=${encodeURIComponent(req.query.brand)}` : '';
        const r = await fetch(`http://127.0.0.1:${AI_ENGINE_PORT}/brand-memory${q}`,
            { signal: AbortSignal.timeout(10000) });
        res.status(r.status).json(await r.json());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'AIエンジンに繋がりませんでした: ' + e.message });
    }
});

app.post('/api/brand-memory', async (req, res) => {
    try {
        const r = await fetch(`http://127.0.0.1:${AI_ENGINE_PORT}/brand-memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {}),
            signal: AbortSignal.timeout(10000),
        });
        res.status(r.status).json(await r.json());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'AIエンジンに繋がりませんでした: ' + e.message });
    }
});

/** SNS投稿文を複数パターン作る（ローカルLLM） */
app.post('/api/sns/generate', async (req, res) => {
    try {
        const r = await fetch(`http://127.0.0.1:${AI_ENGINE_PORT}/sns/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {}),
            // Python側のタイムアウト（120秒）より短いと、
            // 向こうがまだ考えている途中でここが先に諦めてしまう。
            signal: AbortSignal.timeout(130000),
        });
        res.status(r.status).json(await r.json());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'AIエンジンに繋がりませんでした: ' + e.message });
    }
});

/**
 * AI受付（最小版）― お客様からの問い合わせに、返信の下書きを作る
 *
 * 自分からは何も送らない。文面を作って画面に出すだけ。
 * 送るのは、必ず本人がSNS側の画面で行う。
 */
app.get('/api/faq', async (req, res) => {
    try {
        const r = await fetch(`http://127.0.0.1:${AI_ENGINE_PORT}/faq`,
            { signal: AbortSignal.timeout(10000) });
        res.status(r.status).json(await r.json());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'AIエンジンに繋がりませんでした: ' + e.message });
    }
});

app.post('/api/faq', async (req, res) => {
    try {
        const r = await fetch(`http://127.0.0.1:${AI_ENGINE_PORT}/faq`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {}),
            signal: AbortSignal.timeout(10000),
        });
        res.status(r.status).json(await r.json());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'AIエンジンに繋がりませんでした: ' + e.message });
    }
});

app.post('/api/customer-reply', async (req, res) => {
    try {
        const r = await fetch(`http://127.0.0.1:${AI_ENGINE_PORT}/customer-reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {}),
            signal: AbortSignal.timeout(90000),
        });
        res.status(r.status).json(await r.json());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'AIエンジンに繋がりませんでした: ' + e.message });
    }
});

app.post('/api/image/start', async (req, res) => {
    try {
        const r = await fetch(`http://127.0.0.1:${AI_ENGINE_PORT}/image/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {}),
            signal: AbortSignal.timeout(15000),
        });
        res.status(r.status).json(await r.json());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'AIエンジンに繋がりませんでした: ' + e.message });
    }
});

app.get('/api/image/status', async (req, res) => {
    try {
        const id = encodeURIComponent(req.query.id || '');
        const r = await fetch(`http://127.0.0.1:${AI_ENGINE_PORT}/image/status?id=${id}`,
            { signal: AbortSignal.timeout(10000) });
        res.status(r.status).json(await r.json());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'AIエンジンに繋がりませんでした: ' + e.message });
    }
});

app.get('/api/image/view', async (req, res) => {
    try {
        const { filename, subfolder, type } = req.query;
        if (!filename) return res.status(400).json({ ok: false, 訳: 'filename が要ります' });
        const q = new URLSearchParams({
            filename: String(filename),
            subfolder: String(subfolder || ''),
            type: String(type || 'output'),
        });
        const r = await fetch(`http://127.0.0.1:8188/view?${q}`, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) return res.status(r.status).end();
        res.set('Content-Type', r.headers.get('content-type') || 'image/png');
        res.set('Cache-Control', 'no-store');
        const buf = Buffer.from(await r.arrayBuffer());
        res.end(buf);
    } catch (e) {
        res.status(500).json({ ok: false, 訳: 'ComfyUIに繋がりませんでした: ' + e.message });
    }
});


/**
 * 常駐の待ち受けの置き場所
 *
 * <b>アプリの中には置かない。</b>
 *
 * アプリの中に置いていたところ、マイクが一度も使えず、
 * 起動した直後に落ち続けていた。
 * 見張りがすぐ立て直すので「動いている」ようにしか見えず、
 * 「呼んでも反応しない」だけが残っていた。
 *
 * macOS は、アプリの中の実行ファイルを
 * 「そのアプリ」として扱う。
 * するとアプリ自体にマイクの許可が要る。
 * 署名のないアプリには、それが下りない。
 *
 * アプリの外に置けば、実行ファイル単体として扱われ、
 * ふつうにマイクの許可を聞いてもらえる。
 */
const 待ち受けの置き場 = path.join(
    process.env.HOME || '', 'Library', 'Application Support', 'AReGLM', '待ち受け');

/**
 * 「聞き取り.app」（端末内の自由な文字起こし）の置き場。
 *
 * 常駐の待ち受けは、自分と同じ場所にある「聞き取り.app」を探して呼ぶ。
 * だから、待ち受けと同じフォルダに置く。
 */
const 聞き取りの置き場 = path.join(
    path.dirname(待ち受けの置き場), '聞き取り.app');

/**
 * マイクの許可が要ることを、こちらで開いて知らせる。
 *
 * 常駐の待ち受けは、作り直すたびに
 * macOS から「別のもの」と見なされ、マイクの許可が外れる。
 *
 * 音が一切届かないのに、
 * 待ち受けは動いているように見えるので、
 * 「呼んでも反応しない」だけが残る。
 *
 * 「設定してください」で終わらせない。
 * 設定の画面をこちらで開き、道も写しておく。
 */
function マイクの設定を開く() {
    try {
        require('child_process').execFileSync('/bin/sh',
            ['-c', `printf '%s' ${JSON.stringify(待ち受けの置き場)} | pbcopy`],
            { timeout: 3000 });
    } catch (e) {
        console.warn('道を写せませんでした:', e.message);
    }
    try {
        require('child_process').execFileSync('/usr/bin/open',
            ['x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'],
            { timeout: 5000 });
        return true;
    } catch (e) {
        console.warn('設定を開けませんでした:', e.message);
        return false;
    }
}

/**
 * 待ち受けを、使える場所に用意する。
 *
 * アプリの中にある元を、外へ写す。
 * 中身が変わっていたら写し直す。
 */
function 待ち受けを用意する() {
    const 元 = path.join(__dirname, 'voice', '常駐の待ち受け');
    if (!fs.existsSync(元)) return null;

    try {
        const 場所 = path.dirname(待ち受けの置き場);
        if (!fs.existsSync(場所)) fs.mkdirSync(場所, { recursive: true });

        // 中身が同じなら写さない。毎回写すと、そのたびに
        // macOS が「別のもの」と見なして許可を聞き直すことがある。
        const 写す = !fs.existsSync(待ち受けの置き場)
            || fs.statSync(元).size !== fs.statSync(待ち受けの置き場).size
            || fs.statSync(元).mtimeMs > fs.statSync(待ち受けの置き場).mtimeMs;

        if (写す) {
            fs.copyFileSync(元, 待ち受けの置き場);
            fs.chmodSync(待ち受けの置き場, 0o755);

            // 決まった名前で署名する。
            // 名前が変わると、macOS は別のものと見なし、
            // 許可がやり直しになる。
            try {
                require('child_process').execFileSync('/usr/bin/codesign',
                    ['--force', '--sign', '-', '--identifier', 'com.areglm.listener',
                        待ち受けの置き場],
                    { timeout: 10000, stdio: 'pipe' });
            } catch (e) {
                console.warn('待ち受けに署名できませんでした:', e.message);
            }
        }
        聞き取りを用意する();
        return 待ち受けの置き場;
    } catch (e) {
        console.warn('待ち受けを用意できませんでした:', e.message);
        return null;
    }
}

/**
 * 「聞き取り.app」を、待ち受けと同じ場所に用意する。
 *
 * これが無いと、待ち受けは自作の聞き分け（教えた呼び名だけ）に留まる。
 * あれば、教えていない言い方も端末内で文字にできる。
 *
 * .app は署名込みでそのまま写すだけでよい
 * （フォルダごとの複製なら、中の署名は崩れない）。
 */
function 聞き取りを用意する() {
    const 元 = path.join(__dirname, 'voice', '聞き取り.app');
    const 元の実行 = path.join(元, 'Contents', 'MacOS', '聞き取り');
    if (!fs.existsSync(元の実行)) return null;

    try {
        const 場所 = path.dirname(聞き取りの置き場);
        if (!fs.existsSync(場所)) fs.mkdirSync(場所, { recursive: true });

        const 先の実行 = path.join(聞き取りの置き場, 'Contents', 'MacOS', '聞き取り');
        const 写す = !fs.existsSync(先の実行)
            || fs.statSync(元の実行).size !== fs.statSync(先の実行).size
            || fs.statSync(元の実行).mtimeMs > fs.statSync(先の実行).mtimeMs;

        if (写す) {
            fs.rmSync(聞き取りの置き場, { recursive: true, force: true });
            fs.cpSync(元, 聞き取りの置き場, { recursive: true });
        }
        return 聞き取りの置き場;
    } catch (e) {
        console.warn('聞き取りを用意できませんでした:', e.message);
        return null;
    }
}

/**
 * 記録を片づける
 *
 * 古い記録は、漏れどころとして残り続ける。
 * 持っていなければ、漏れようがない。
 */
app.post('/api/tidy-logs', (req, res) => {
    try {
        const 片づけ = require(path.join(__dirname, '..', 'tools', '記録を片づける.js'));
        res.json(片づけ.片づける());
    } catch (e) {
        res.status(500).json({ ok: false, 訳: '片づけられませんでした: ' + e.message });
    }
});

app.get('/api/computer', (req, res) => {
    res.json({
        できる操作: パソコン.操作の一覧(),
        止まっているか: パソコン.止まっているか(),
        記録: パソコン.記録を読む().slice(-20),
        合言葉の画面: パソコン.合言葉の画面か(),
    });
});

app.post('/api/computer', (req, res) => {
    const { 操作, 材料, 止める, 動かす } = req.body || {};

    if (止める) return res.json(パソコン.止める('画面から止めました'));
    if (動かす) return res.json(パソコン.動かす());

    if (!操作) return res.status(400).json({ ok: false, 訳: '何をするかが要ります' });
    res.json(パソコン.操る(操作, 材料 || {}));
});


app.get('/api/code', (req, res) => {
    // 引数の名前は英字にしてある。
    // 日本語だと符号化されて一致せず、一覧しか返らなかった。
    // 同じ間違いを /取引を見る と /__門番 でもしている。
    const 道 = req.query && (req.query.path || req.query.道);
    if (道) return res.json(書き換え.読む(道));
    res.json({
        一覧: 書き換え.一覧する(),
        触れてよい: 書き換え.触れてよい,
        触れてはいけない: 書き換え.触れてはいけない,
        記録: 書き換え.記録を読む().slice(-20),
        控え: 書き換え.控えの一覧(),
    });
});

app.post('/api/code', (req, res) => {
    const { 道, 中身, 訳, 戻す, 控え } = req.body || {};

    if (戻す && 控え) {
        const よい = 書き換え.戻す(道, 控え);
        return res.json({
            ok: よい,
            訳: よい ? `${道} を控えから戻しました` : '控えが見つかりません',
        });
    }

    if (!道 || typeof 中身 !== 'string') {
        return res.status(400).json({ ok: false, 訳: '場所と中身が要ります' });
    }
    res.json(書き換え.書き換える(道, 中身, 訳));
});

/**
 * 待ち受けに音が届いているかを見る
 *
 * 「動いている」だけでは足りない。
 * 動いていても音が来ていなければ、呼んでも反応しない。
 */
app.get('/api/voice-listener/hearing', (req, res) => {
    const 記録の道 = path.join(process.env.HOME || '',
        'Library', 'Logs', 'AReGLM', '待ち受け.log');
    let 中身 = '';
    try {
        中身 = fs.readFileSync(記録の道, 'utf8');
    } catch {
        中身 = '';
    }

    const 聞いた = (中身.match(/声を聞きました/g) || []).length;
    const 呼ばれた = (中身.match(/呼ばれました/g) || []).length;
    const 動いている = 中身.includes('待ち受けます');

    res.json({
        動いているか: 動いている,
        音が届いているか: 聞いた > 0,
        聞いた回数: 聞いた,
        呼ばれた回数: 呼ばれた,
        訳: !動いている
            ? '待ち受けが動いていません。'
            : (聞いた > 0
                ? `音は届いています（${聞いた}回）。${呼ばれた}回 呼びかけに応じました。`
                : 'マイクの音が届いていません。'
                    + 'macOS の許可が要ります（作り直すと外れることがあります）。'),
    });
});

app.post('/api/voice-listener/open-mic-settings', (req, res) => {
    const 開けた = マイクの設定を開く();
    res.json({
        ok: 開けた,
        訳: 開けた
            ? 'マイクの設定を開きました。「＋」を押し、⌘⇧G で貼り付けて、'
              + '待ち受けを入りにしてください。道はもう写してあります。'
            : '設定を開けませんでした。',
        道: 待ち受けの置き場,
    });
});

app.get('/api/voice-listener', (req, res) => {
    const 実行file = 待ち受けを用意する()
        || path.join(__dirname, 'voice', '常駐の待ち受け');
    let 覚えた = 0;
    try {
        覚えた = JSON.parse(fs.readFileSync(覚えた声の道, 'utf8')).length;
    } catch { /* まだ無い */ }

    // 動いているか。
    //
    // pgrep に日本語を渡すと、シェルの文字の扱いで
    // 動いていないのに「動いている」と出ていた。
    // 実行ファイルの場所そのもので探すほうが確かめられる。
    let 動いている = false;
    try {
        // シェルを経由しない形に統一（待ち受けが動いているか() と同じ理由）。
        const 出 = require('child_process')
            .execFileSync('pgrep', ['-f', 実行file], { encoding: 'utf8' });
        動いている = 出.trim().length > 0;
    } catch { /* 動いていない */ }

    res.json({
        用意できているか: fs.existsSync(実行file),
        動いているか: 動いている,
        渡した声の数: 覚えた,
        置き場: 覚えた声の道,
    });
});

app.post('/api/voice-listener', (req, res) => {
    const 実行file = 待ち受けを用意する()
        || path.join(__dirname, 'voice', '常駐の待ち受け');
    const 入れる = req.body && req.body['使う'] === true;

    if (!入れる) {
        // 止めるときは、ログイン時の登録も外す。
        // 外さないと、次にログインしたときにまた立ち上がる。
        try {
            execFile('/bin/launchctl',
                ['bootout', `gui/${process.getuid()}/jp.areglm.listener`], () => {});
        } catch { /* 登録されていない */ }
        try {
            const 道 = path.join(process.env.HOME, 'Library', 'LaunchAgents',
                'jp.areglm.listener.plist');
            if (fs.existsSync(道)) fs.unlinkSync(道);
        } catch { /* 無視 */ }
        待ち受けを本当に止める();
        return res.json({ ok: true, 訳: '常駐の待ち受けを止めました。ログイン時にも立ち上がりません。' });
    }

    if (!fs.existsSync(実行file)) {
        return res.status(400).json({ ok: false, 訳: '待ち受けのプログラムが見つかりません。' });
    }
    // 以前はここで、まだ何も録っていなければ止めていた。
    //
    // いまは待ち受け側（Swift）が、話しかけられた声を
    // 自由な聞き取りで確かめて自分で覚えるので、
    // 先に「言葉を教える」を済ませておく必要はない。
    //
    // ただし、待ち受けが新しく覚えた声を書き込める先が要る。
    // ファイルが無いと、覚えても保存できずに消えてしまう。
    if (!fs.existsSync(覚えた声の道)) {
        try {
            fs.mkdirSync(path.dirname(覚えた声の道), { recursive: true });
            fs.writeFileSync(覚えた声の道, '[]');
        } catch (e) {
            return res.status(500).json({
                ok: false,
                訳: '声を覚える場所を用意できませんでした: ' + e.message,
            });
        }
    }

    const 名 = (req.body && req.body['呼び名']) || 'アレラム';
    const アプリ = path.resolve(ROOT, '..', '..', '..');   // .app まで戻る

    // 起動は launchd だけに任せる。
    //
    // 以前はここで直接 spawn したうえで、さらに launchd にも登録していた。
    // すると同じマイクを2つのプロセスが同時に掴もうとして、
    // 「Failed to create tap due to format mismatch」でどちらも
    // クラッシュ→launchd が立て直す→また衝突、を繰り返していた。
    //
    // launchd の bootstrap は RunAtLoad があるので、登録した時点で
    // 立ち上がる。二重に起動する必要はない。
    try {
        書き込む常駐の設定(実行file, 覚えた声の道, 名, アプリ);
    } catch (e) {
        console.warn('常駐の登録に失敗:', e.message);
    }

    res.json({
        ok: true,
        訳: `「${名}」と呼ばれるのを、アプリを開いていなくても待ち受けます。`
            + '呼びかけると「はい」と答え、続けて言った用件に声で返します。'
            + '画面は開きません。'
            + '初めての起動では、マイクの許可を聞かれます。'
            + 'Mac を再起動しても、そのまま待ち受けます。',
    });
});

/**
 * ログインしたら自動で待ち受けるよう、macOS に登録する。
 *
 * 以前この仕組み（launchd）で失敗したことがある。
 * 置き場所がデスクトップで、iCloud の同期対象だったため、
 * ファイルの実体が無くなって起動できなかった。
 * いまは ~/Applications にあるので、その心配はない。
 */
function 書き込む常駐の設定(実行file, 声の道, 呼び名, アプリ) {
    const 名札 = 'jp.areglm.listener';
    const 置き場 = path.join(process.env.HOME, 'Library', 'LaunchAgents');
    if (!fs.existsSync(置き場)) fs.mkdirSync(置き場, { recursive: true });

    const 記録 = path.join(process.env.HOME, 'Library', 'Logs', 'AReGLM');
    if (!fs.existsSync(記録)) fs.mkdirSync(記録, { recursive: true });

    // アプリの場所も渡す。渡さないと、待ち受け側は既定値
    // （書いてある固定の道）にしか戻れない。
    const アプリ引数 = アプリ ? `\n    <string>${アプリ}</string>` : '';

    const 設定 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${名札}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${実行file}</string>
    <string>${声の道}</string>
    <string>${呼び名}</string>${アプリ引数}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(記録, '待ち受け.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(記録, '待ち受け.err')}</string>
</dict></plist>
`;
    const 道 = path.join(置き場, 名札 + '.plist');
    fs.writeFileSync(道, 設定);

    // 入れ直す（古い登録が残っていると、古い設定のまま動く）
    //
    // bootout は非同期。終わる前に bootstrap すると、
    // 「まだ登録が残っている」として弾かれたり、
    // 古いものと新しいものが一瞬並び立ったりする。
    // 少し待ってから入れる。
    try {
        require('child_process').execFileSync('/bin/launchctl',
            ['bootout', `gui/${process.getuid()}/${名札}`],
            { stdio: 'ignore' });
    } catch { /* 登録されていなかっただけ */ }
    execFile('/bin/launchctl',
        ['bootstrap', `gui/${process.getuid()}`, 道], () => {});
}

app.post('/api/other-devices/forget', (req, res) => {
    const 門 = 門番.設定を読む();
    門.端末 = [];
    門番.設定を書く(門);
    res.json({ ok: true, 訳: '許した端末をすべて忘れました。次はまた合言葉を聞きます。' });
});


/**
 * マイクが使えない接続なら、HTTPS へ回す
 *
 * ブラウザはマイク・カメラ・録音を「安全な接続」でしか許可しない。
 * 127.0.0.1 と localhost は例外だが、
 * arinoMacBook-Pro.local のようなURLでは使えなくなる。
 *
 * そこで、マイクが使えない入口で来たときは HTTPS に送る。
 * どのURLから開いても、そのまま話しかけられる状態にするため。
 */
/**
 * 自動転送はしない。
 *
 * 以前はマイクを使えるようにするため HTTPS へ自動で回していたが、
 * 証明書が自己署名のためブラウザが警告を出し、
 * 許可していない状態ではツール自体が開けなくなっていた。
 *
 * いまは HTTP のまま普通に使えるようにしておき、
 * マイクが必要なときだけ画面から HTTPS へ切り替えてもらう。
 * （切り替え先は /api/https-info で伝える）
 */
app.get('/api/https-info', (req, res) => {
    const host = (req.hostname || '').toLowerCase();
    const micWorksNow =
        req.secure || host === '127.0.0.1' || host === 'localhost' || host === '::1';

    res.json({
        micWorksNow,
        httpsAvailable,
        httpsUrl: httpsAvailable ? `https://${req.hostname}:${HTTPS_PORT_VALUE}` : null,
        localUrl: `http://127.0.0.1:${PORT}`
    });
});

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    // HTML・CSS・JS はブラウザに溜め込ませない。
    // 溜まると「直したのに画面が変わらない」が起きるため。
    if (/\.(html|css|js)$/.test(req.path) || req.path === '/') {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
    }

    // Service Worker のファイルは特に確実に取り直させる。
    // ここが古いままだと、キャッシュを消す仕組みが働かない。
    if (req.path === '/sw.js') {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.setHeader('Service-Worker-Allowed', '/');
    }
    next();
});

/**
 * 外へ出てよい先の一覧
 *
 * ここに書かれたホスト以外へは、一切通さない。
 * 非公式のもの、規約に反する経路は入れない。
 *
 * 二つの決まりで見る:
 *
 *   1. <b>公式が出しているものだけ</b>
 *      その会社が自分で公開しているAPIに限る。
 *      勝手に読み取る仕組みは、規約に反するので使わない。
 *
 *   2. <b>無料で使える範囲だけ</b>
 *      無料枠が無いもの、いつ課金されるか分からないものは通さない。
 *      「知らないうちに請求が来ていた」が、いちばん困る。
 *
 * 有料になったものの扱い:
 *
 *   会社の都合で、無料だったものが有料になることがある。
 *   そのときは <b>無料か: false</b> に書き換えるだけで、
 *   自動的に通らなくなる。
 *   コードを直して回る必要はない。
 */
const OFFICIAL_API_ALLOWLIST = [
    {
        host: 'generativelanguage.googleapis.com',
        name: 'Google Gemini API',
        provider: 'Google（公式）',
        terms: 'https://ai.google.dev/gemini-api/terms',
        無料か: true,
        無料の中身: '無料枠あり（1分15回・1日1500回まで／2026年8月時点）',
        確かめた日: '2026-08-21',
    },
    {
        host: 'api.groq.com',
        name: 'Groq API',
        provider: 'Groq（公式）',
        terms: 'https://groq.com/terms-of-use/',
        無料か: true,
        無料の中身: '無料枠あり（回数に上限あり／2026年8月時点）',
        確かめた日: '2026-08-21',
    },
    {
        host: 'api-inference.huggingface.co',
        name: 'Hugging Face Inference API',
        provider: 'Hugging Face（公式）',
        terms: 'https://huggingface.co/terms-of-service',
        無料か: true,
        無料の中身: '無料枠あり（混んでいると待たされる／2026年8月時点）',
        確かめた日: '2026-08-21',
    },
    {
        host: 'suzuri.jp',
        name: 'SUZURI API v1',
        provider: 'GMOペパボ（公式）',
        terms: 'https://suzuri.jp/developer/documentation/v1',
        無料か: true,
        無料の中身: 'API自体は無料（商品が売れたときの手数料は別）',
        確かめた日: '2026-08-21',
    },
    {
        // Googleカレンダー連携（N-19）用。ホスト単位の許可リストのため、
        // ここを通すと www.googleapis.com 配下の他のGoogle APIも技術的には
        // 通ってしまう（パスまでは絞れていない）。カレンダー以外を
        // 呼ぶコードは書かないことで実質的に絞る。
        // 実際に使うには、オーナー自身がGoogle Cloud ConsoleでOAuth
        // クライアントIDを取得し、設定ページで連携をONにする必要がある
        // （コード側の許可だけでは動かない＝二重の関門）。
        host: 'www.googleapis.com',
        name: 'Google Calendar API',
        provider: 'Google（公式）',
        terms: 'https://developers.google.com/calendar/api/terms',
        無料か: true,
        無料の中身: '無料枠あり（1ユーザー1日あたり相当な回数まで／2026年8月時点）',
        確かめた日: '2026-08-29',
    },
    {
        host: 'accounts.google.com',
        name: 'Google OAuth（ログイン確認）',
        provider: 'Google（公式）',
        terms: 'https://developers.google.com/identity/protocols/oauth2',
        無料か: true,
        無料の中身: '認証のための通信で、課金対象ではない',
        確かめた日: '2026-08-29',
    },
    {
        // Notion連携用。統合トークンは、Notion側で本人が明示的に
        // 共有したページ・データベースにしか届かない（Notion自身の
        // 権限モデルによる制限）。ここでの許可は「送信先ホストとして
        // 通す」だけで、実際に触れる範囲を広げるものではない。
        host: 'api.notion.com',
        name: 'Notion API',
        provider: 'Notion（公式）',
        terms: 'https://www.notion.so/notion/Notion-API-Terms-and-Conditions',
        無料か: true,
        無料の中身: '統合トークンの発行・API利用そのものは無料（2026年8月時点）',
        確かめた日: '2026-08-30',
    },
    {
        host: 'api.anthropic.com',
        name: 'Anthropic Claude API',
        provider: 'Anthropic（公式）',
        terms: 'https://www.anthropic.com/legal/commercial-terms',
        無料か: false,
        無料の中身: '無料枠なし（従量課金）',
        // 2026-08-28、本人が「会話が外部へ送られること・従量課金」を
        // 了承した上で「今の脳はClaudeでいい」と明示的に決めた。
        // 有料でも通すのはこの一件だけ。画面側の「お金がかかる機能」の
        // 許可スイッチも通らないと、実際には呼ばれない（二重の関門）。
        本人が許可した有料: true,
        確かめた日: '2026-08-28',
    }
];

/**
 * 通してよい先を作る。
 *
 * <b>無料でないものは、ここで落ちる。</b>
 * 一覧に載っていても、無料か: false なら通らない。
 *
 * 有料になったときは、上の一覧を書き換えるだけでよい。
 * 探して回らなくても、ここで自動的に外れる。
 */
const ALLOWED_HOSTS = new Set(
    OFFICIAL_API_ALLOWLIST
        .filter((a) => a.無料か === true || a.本人が許可した有料 === true)
        .map((a) => a.host));

/** 有料になったために外したもの（画面に出して知らせるため） */
const 有料で外したもの = OFFICIAL_API_ALLOWLIST
    .filter((a) => a.無料か !== true && a.本人が許可した有料 !== true);

if (有料で外したもの.length) {
    console.warn('[お金] 有料になったため、次の先へは通しません: '
        + 有料で外したもの.map((a) => `${a.name}（${a.無料の中身 || '有料'}）`).join('、'));
}

/** 許可リストに無いホストへの通信を実行前に止める */
function assertAllowedUrl(url) {
    let host;
    try {
        host = new URL(url).hostname;
    } catch {
        throw new Error('送信先URLが不正です');
    }
    if (!ALLOWED_HOSTS.has(host)) {
        // なぜ止まったのかを、はっきり分ける。
        //
        // 「許可されていません」だけでは、
        // 知らない相手なのか、有料になったから外れたのかが分からない。
        // 有料で外れたなら、それは知らせるべきこと。
        const 有料になった = 有料で外したもの.find((a) => a.host === host);
        if (有料になった) {
            throw new Error(
                `${有料になった.name} は有料になったため、通していません。`
                + `（${有料になった.無料の中身 || '無料枠なし'}）`
                + 'この道具は、無料で使える範囲だけを通す決まりです。');
        }
        throw new Error(`許可されていない送信先です: ${host}`);
    }
    return url;
}

/** 外部通信はすべてこの関数を通す（許可リスト外は例外で止まる） */
async function safeFetch(url, options) {
    return fetch(assertAllowedUrl(url), options);
}

/**
 * URLの本文を取りに行く（AIチャットへのURL添付用）
 *
 * 上の許可リスト（OFFICIAL_API_ALLOWLIST）とは別物。
 * あちらは「決まった公式APIの先だけ」を通す仕組みで、
 * こちらは「本人が貼った、どのページでもよい」を取りに行く仕組み。
 * だからこそ、既定オフ・設定画面での明示許可としている
 * （呼び出す側の js/modules/chat.js が、設定を見てから呼ぶ）。
 *
 * 安全のためにしていること:
 *   ・http/https 以外は拒む（file:// 等でこの端末の中身を読ませない）
 *   ・大きさに上限を付ける（重い・終わらないページで固まらないように）
 *   ・text/html・text/plain 以外は拒む（画像やファイルを丸ごと持ってこない）
 *   ・タイムアウトを付ける
 */
/**
 * この端末やLAN内へは向けさせない。
 *
 * 「本人が貼ったURLなら、本人の意図しか通らない」と思いがちだが、
 * 例えば外部のページに埋め込まれたリンクをそのまま貼ってしまった場合や、
 * 別の不具合と組み合わさった場合に、この機能が「この端末の中や
 * 同じLAN内の、外からは見えないはずのもの」を覗く踏み台にされうる。
 * URLを貼るだけで内部探索ができてしまわないよう、行き先を絞る。
 */
function 内部向けURLか(u) {
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
    // IPv4リテラル
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
        if (a === 127 || a === 10 || a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
    }
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
    return false;
}

app.post('/api/fetch-url-text', async (req, res) => {
    let u;
    try {
        u = new URL((req.body || {}).url || '');
    } catch {
        return res.status(400).json({ ok: false, reason: 'URLの形が正しくありません' });
    }
    if (!['http:', 'https:'].includes(u.protocol)) {
        return res.status(400).json({ ok: false, reason: 'httpまたはhttpsのURLのみ対応しています' });
    }
    if (内部向けURLか(u)) {
        return res.status(400).json({ ok: false, reason: 'この端末やLAN内向けのURLは取得できません' });
    }

    try {
        // リダイレクト先も同じ確認をしたいので、自動追従は使わず自分で辿る。
        let 現在 = u;
        let upstream;
        for (let 回数 = 0; 回数 < 5; 回数 += 1) {
            upstream = await fetch(現在.toString(), {
                signal: AbortSignal.timeout(15000),
                redirect: 'manual',
                headers: { 'User-Agent': 'AReGLM/1.0 (local tool; user-requested single-page fetch)' },
            });
            if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
                const 次 = new URL(upstream.headers.get('location'), 現在);
                if (!['http:', 'https:'].includes(次.protocol) || 内部向けURLか(次)) {
                    return res.json({ ok: false, reason: 'リダイレクト先が許可されていません' });
                }
                現在 = 次;
                continue;
            }
            break;
        }
        if (!upstream.ok) {
            return res.json({ ok: false, reason: `取得できませんでした（HTTP ${upstream.status}）` });
        }
        const contentType = upstream.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            return res.json({ ok: false, reason: `この形式には対応していません（${contentType || '不明な形式'}）` });
        }

        const buf = await upstream.arrayBuffer();
        if (buf.byteLength > 3 * 1024 * 1024) {
            return res.json({ ok: false, reason: 'ページが大きすぎます（3MB超）' });
        }

        const html = Buffer.from(buf).toString('utf8');
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // 専用ライブラリを増やさず、タグを剥がすだけの簡易抽出。
        // レイアウトや広告文言も混ざりうるが、「本文が何も読めない」よりは良い。
        let text = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'")
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n\s*\n+/g, '\n\n')
            .trim();

        const 上限 = 6000;
        const truncated = text.length > 上限;
        if (truncated) text = text.slice(0, 上限);

        res.json({ ok: true, title, text, truncated });
    } catch (e) {
        res.json({ ok: false, reason: `取得に失敗しました: ${e.message}` });
    }
});

/**
 * 自作AIエンジン（Python）への中継
 *
 * これは外部サービスではなく、この端末内で動くローカルプロセス。
 * 127.0.0.1 のみを相手にするため、外部許可リストとは別扱いにする。
 * ローカル以外へは絶対に向かないよう、URLを固定で組み立てる。
 */
const AI_ENGINE_PORT = process.env.AI_PORT || 8765;
const AI_ENGINE_BASE = `http://127.0.0.1:${AI_ENGINE_PORT}`;

async function aiEngineFetch(pathname, options = {}) {
    // pathname は呼び出し側が固定文字列で渡す。念のため先頭スラッシュのみ許可。
    if (!/^\/[\w/-]*$/.test(pathname)) {
        throw new Error('不正なパスです');
    }
    return fetch(AI_ENGINE_BASE + pathname, options);
}

/** 自作AIエンジンへの中継ルートをまとめて定義する */
function proxyToAiEngine(method, route) {
    const handler = async (req, res) => {
        try {
            const opts = { method };
            if (method === 'POST') {
                opts.headers = { 'Content-Type': 'application/json' };
                opts.body = JSON.stringify(req.body || {});
            }
            const upstream = await aiEngineFetch(route, opts);
            const data = await upstream.json();
            res.status(upstream.status).json(data);
        } catch (e) {
            res.status(503).json({
                error: '自作AIエンジンに接続できません',
                hint: 'server/ai/server.py を起動してください',
                detail: e.message
            });
        }
    };
    if (method === 'GET') app.get('/api/ai-local' + route, handler);
    else app.post('/api/ai-local' + route, handler);
}

proxyToAiEngine('GET', '/health');
proxyToAiEngine('GET', '/summary');
proxyToAiEngine('GET', '/plans');
proxyToAiEngine('GET', '/learned-tasks');
proxyToAiEngine('POST', '/self-review');
proxyToAiEngine('POST', '/learned-tasks');
proxyToAiEngine('GET', '/topics');
proxyToAiEngine('GET', '/writable');
proxyToAiEngine('POST', '/learn');
proxyToAiEngine('POST', '/classify');
proxyToAiEngine('POST', '/answer');
proxyToAiEngine('POST', '/analyze');
proxyToAiEngine('GET', '/generate/templates');
proxyToAiEngine('POST', '/generate');
proxyToAiEngine('POST', '/chat');
proxyToAiEngine('POST', '/deal-check');
proxyToAiEngine('POST', '/generate/learn-style');
proxyToAiEngine('POST', '/knowledge/add');
proxyToAiEngine('POST', '/knowledge/search');
proxyToAiEngine('POST', '/knowledge/verify');
proxyToAiEngine('POST', '/knowledge/forget');
proxyToAiEngine('POST', '/forget');
proxyToAiEngine('POST', '/keywords');
proxyToAiEngine('POST', '/related');
proxyToAiEngine('POST', '/code-review');
proxyToAiEngine('POST', '/translate');
proxyToAiEngine('POST', '/agent-route');
proxyToAiEngine('POST', '/agent-task/submit');
proxyToAiEngine('GET', '/agent-task/list');
proxyToAiEngine('POST', '/agent-task/cancel');
proxyToAiEngine('POST', '/agent-task/retry');
proxyToAiEngine('POST', '/agent-task/delete');
proxyToAiEngine('POST', '/similarity/index');
proxyToAiEngine('POST', '/similarity/check');
proxyToAiEngine('POST', '/similarity/duplicates');
proxyToAiEngine('POST', '/semantics/similar');
proxyToAiEngine('POST', '/semantics/rebuild');

app.get('/api/health', (_, res) => {
    res.json({ ok: true, service: 'AReGLM API Gateway' });
});

/**
 * コードの安全点検
 *
 * このツール自身のフォルダの中だけを見る、防御専用の静的解析。
 * 外部へは何も送らない。書き換えはせず、見つけて知らせるだけ。
 */
const コードの安全点検 = require('./コードの安全点検');
app.get('/api/security-scan', (_, res) => {
    try {
        res.json(コードの安全点検.点検を行う(ROOT));
    } catch (e) {
        res.status(500).json({ ok: false, 訳: '点検できませんでした: ' + e.message });
    }
});

/** 現在許可されている公式APIの一覧（画面で確認できるようにする） */
app.get('/api/compliance', (_, res) => {
    res.json({
        policy: '公式APIのみ使用。非公式API・スクレイピングは行いません。',
        allowlist: OFFICIAL_API_ALLOWLIST,
        通している先: OFFICIAL_API_ALLOWLIST.filter((a) => a.無料か === true),
        有料で外した先: 有料で外したもの,
        決まり: '公式が出しているものだけ、かつ無料で使える範囲だけを通します。'
            + '有料になったものは、一覧の「無料か」を false にするだけで自動的に外れます。'
    });
});

/**
 * 学習エンジンの永続化
 * ブラウザのlocalStorageが消えても学習内容が失われないよう、
 * この端末内のファイルにのみ保存する（外部送信・外部保存は一切しない）
 */
app.get('/api/learning', (_, res) => {
    try {
        if (!fs.existsSync(LEARNING_FILE)) {
            return res.json({ events: [], counters: {}, tagCounters: {}, createdAt: null, updatedAt: null });
        }
        const raw = fs.readFileSync(LEARNING_FILE, 'utf-8');
        res.json(JSON.parse(raw));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/learning', (req, res) => {
    try {
        const data = req.body || {};
        fs.writeFileSync(LEARNING_FILE, JSON.stringify(data, null, 2), 'utf-8');
        res.json({ ok: true, savedEvents: (data.events || []).length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * 自動スナップショット
 * ブラウザのlocalStorageが消えてもデータを失わないよう、この端末内にのみ保存する。
 * 方針: 古いスナップショットは削除せず、日付ごとのファイルとして残す。
 */
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

app.post('/api/snapshot', (req, res) => {
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(SNAPSHOT_DIR, `snapshot_${stamp}.json`);
        fs.writeFileSync(file, JSON.stringify(req.body || {}, null, 2), 'utf-8');
        res.json({ ok: true, file: path.basename(file) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/snapshot', (_, res) => {
    try {
        const files = fs
            .readdirSync(SNAPSHOT_DIR)
            .filter((f) => f.endsWith('.json'))
            .sort()
            .reverse();
        res.json({ count: files.length, latest: files[0] || null, files: files.slice(0, 50) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/snapshot/:name', (req, res) => {
    try {
        // ディレクトリ外へのアクセスを防ぐ
        const name = path.basename(req.params.name);
        const file = path.join(SNAPSHOT_DIR, name);
        if (!file.startsWith(SNAPSHOT_DIR) || !fs.existsSync(file)) {
            return res.status(404).json({ error: 'not found' });
        }
        res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Gemini */
/**
 * 「今は無料だが、あとで有料になっているかもしれない」への備え（C-10）。
 *
 * 完全な自動検知（無料枠を使い切ったのか、仕様が変わったのか）は
 * こちらからは判別できないため、まずは「呼び出しが料金絡みで
 * 失敗した可能性がある」ときに、その旨とプランの確認先を案内するだけに
 * とどめる。案内が要らないときは何も付け足さない。
 */
function 課金の案内を添える(name, status, data) {
    const 怪しい = status === 402 || status === 403 || status === 429
        || /quota|billing|payment|insufficient.?credit|exceeded/i.test(JSON.stringify(data || {}));
    if (!怪しい) return data;
    const 一致 = OFFICIAL_API_ALLOWLIST.find((a) => a.name === name);
    return {
        ...data,
        _課金の案内: `${name} の呼び出しが失敗しました（HTTP ${status}）。`
            + '無料枠を使い切ったか、料金プランが変わった可能性があります。'
            + (一致?.terms ? ` 利用規約・料金: ${一致.terms}` : ''),
    };
}

app.post('/api/ai/gemini', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'APIキーが必要です' });

    try {
        const model = req.body.model || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const upstream = await safeFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body.payload)
        });
        const data = await upstream.json();
        res.status(upstream.status).json(課金の案内を添える('Google Gemini API', upstream.status, data));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Gemini 画像生成 */
app.post('/api/ai/gemini-image', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'APIキーが必要です' });

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(apiKey)}`;
        const upstream = await safeFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body.payload)
        });
        const data = await upstream.json();
        res.status(upstream.status).json(課金の案内を添える('Google Gemini API', upstream.status, data));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * Claude（Anthropic）
 *
 * 有料の外部AI。本人が2026-08-28に、会話が外部へ送られること・
 * 従量課金であることを了承した上で「脳はClaudeでいい」と決めたため通す。
 * 画面側の「お金がかかる機能」の許可が無ければ、そもそもここへ来ない。
 */
app.post('/api/ai/claude', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'APIキーが必要です' });

    try {
        const upstream = await safeFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body.payload)
        });
        const data = await upstream.json();
        res.status(upstream.status).json(課金の案内を添える('Anthropic Claude API', upstream.status, data));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Groq */
app.post('/api/ai/groq', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'APIキーが必要です' });

    try {
        const upstream = await safeFetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body.payload)
        });
        const data = await upstream.json();
        res.status(upstream.status).json(課金の案内を添える('Groq API', upstream.status, data));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Hugging Face */
app.post('/api/ai/huggingface', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'APIキーが必要です' });

    try {
        const model = req.body.model || 'stabilityai/stable-diffusion-xl-base-1.0';

        // モデル名は「所有者/モデル名」の形式のみ許可する。
        // 上位ディレクトリ指定などで想定外のパスへ到達しないようにするため。
        if (!/^[\w.-]+(\/[\w.-]+)?$/.test(model)) {
            return res.status(400).json({ error: 'モデル名の形式が不正です' });
        }

        const upstream = await safeFetch(`https://api-inference.huggingface.co/models/${model}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body.payload)
        });
        const buf = await upstream.arrayBuffer();
        const b64 = Buffer.from(buf).toString('base64');
        const ctype = upstream.headers.get('content-type') || 'image/png';
        if (!upstream.ok) {
            try {
                const err = JSON.parse(Buffer.from(buf).toString());
                return res.status(upstream.status).json(課金の案内を添える('Hugging Face Inference API', upstream.status, err));
            } catch {
                return res.status(upstream.status).json(課金の案内を添える('Hugging Face Inference API', upstream.status, { error: 'HF API error' }));
            }
        }
        res.json({ image: `data:${ctype};base64,${b64}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** SUZURI */
async function suzuriFetch(token, method, apiPath, body) {
    const opts = {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    };
    if (body) opts.body = JSON.stringify(body);
    return safeFetch(`https://suzuri.jp/api/v1${apiPath}`, opts);
}

app.get('/api/suzuri/products', async (req, res) => {
    const token = req.headers['x-suzuri-token'];
    if (!token) return res.status(401).json({ error: 'SUZURIトークンが必要です' });
    try {
        const upstream = await suzuriFetch(token, 'GET', '/products?per_page=50');
        const data = await upstream.json();
        res.status(upstream.status).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/suzuri/materials', async (req, res) => {
    const token = req.headers['x-suzuri-token'];
    if (!token) return res.status(401).json({ error: 'SUZURIトークンが必要です' });
    try {
        const upstream = await suzuriFetch(token, 'POST', '/materials', req.body);
        const text = await upstream.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }
        res.status(upstream.status).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/suzuri/products', async (req, res) => {
    const token = req.headers['x-suzuri-token'];
    if (!token) return res.status(401).json({ error: 'SUZURIトークンが必要です' });
    try {
        const upstream = await suzuriFetch(token, 'POST', '/products', req.body);
        const data = await upstream.json();
        res.status(upstream.status).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * Notion連携
 *
 * 統合トークンは本人がNotion側の設定画面で発行し、AReGLMには
 * 暗号化してこの端末にだけ保存する（サーバー側では保持しない・
 * 毎回ヘッダーで受け取って中継するだけ）。
 * 実際に触れる範囲は、Notion側で本人がその統合に「共有」した
 * ページ・データベースだけに、Notion自身の権限モデルで絞られる。
 *
 * パスと本文をそのまま中継する、ひとつの汎用口にしてある
 * （search・データベースの問い合わせ・ページ作成・追記など、
 * Notion API全体を毎回ルートを増やさずに使えるようにするため）。
 * 送信先ホストは許可リスト（OFFICIAL_API_ALLOWLIST）で固定されており、
 * それ以外へは safeFetch が例外で止める。
 */
app.post('/api/notion-proxy', async (req, res) => {
    const token = req.headers['x-notion-token'];
    if (!token) return res.status(401).json({ error: 'Notion統合トークンが必要です' });
    const { method, path, body } = req.body || {};
    if (!method || !path || !/^\/[\w./-]*$/.test(path)) {
        return res.status(400).json({ error: 'method・path の形が不正です' });
    }
    try {
        const upstream = await safeFetch(`https://api.notion.com/v1${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: (method === 'GET' || method === 'HEAD') ? undefined : JSON.stringify(body || {})
        });
        const text = await upstream.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        res.status(upstream.status).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * Obsidian連携（Local REST APIプラグイン経由）
 *
 * ObsidianはVault自体がこの端末（またはLAN内の別端末）にあり、
 * 無料のコミュニティプラグイン「Local REST API」が立てるローカルの
 * サーバーへ話しかける仕組み。外部（インターネット上のサービス）
 * ではないため、OFFICIAL_API_ALLOWLIST（外部公式APIの許可リスト）
 * の対象にはしない。ただし送信先は必ず127.0.0.1固定・ポート番号は
 * 数字のみに絞り、他のホストへは向けさせない。
 */
app.post('/api/obsidian-proxy', async (req, res) => {
    const key = req.headers['x-obsidian-key'];
    if (!key) return res.status(401).json({ error: 'ObsidianのAPIキーが必要です' });
    const { method, path, body, port } = req.body || {};
    const ポート = parseInt(port, 10) || 27123;
    if (!method || !path || !/^\/[\w./%-]*$/.test(path) || ポート < 1 || ポート > 65535) {
        return res.status(400).json({ error: 'method・path・port の形が不正です' });
    }
    try {
        const upstream = await fetch(`http://127.0.0.1:${ポート}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': typeof body === 'string' ? 'text/markdown' : 'application/json'
            },
            body: (method === 'GET' || method === 'HEAD' || body == null)
                ? undefined
                : (typeof body === 'string' ? body : JSON.stringify(body))
        });
        const text = await upstream.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        res.status(upstream.status).json(data);
    } catch (e) {
        res.status(502).json({
            error: 'Obsidianに繋がりません',
            hint: 'Obsidianを起動し、Local REST APIプラグインを有効にしてください',
            detail: e.message
        });
    }
});

/**
 * 自己修正の安全装置（1-2）
 *
 * 「ツールが自分で直せる」ようにしたいという要望と、
 * 「人の確認なしに動いているコードが書き換わるのは危ない」という
 * 心配の、両方を満たすための土台。
 *
 * ここで正直に書いておくこと：
 *   この端末のローカルAI（Qwen2.5・7Bクラス）は、自然な言葉から
 *   このアプリ規模のコードを正しく書き換えるだけの力を、
 *   まだ持っていない。無理に「自動で書かせる」ボタンを作ると、
 *   壊れたコードがそのまま動いてしまう恐れがある。
 *   だから今回作るのは「誰が変更したコードであっても、
 *   安全に記録・検査・元に戻せる」骨組みまで。
 *
 * 骨組みの中身：
 *   1. 変更前に、必ずGitへ記録する（このファイルの下でコミットする）
 *   2. コミットする前に、自動テストを走らせる（落ちたら記録しない）
 *   3. いつでも直前の記録点まで戻せる（ロールバック）
 *   4. 差分が大きい変更は、コミットせずに差分だけを返す
 *      （呼び出す側が本人に見せてから、別途「このまま記録する」を呼ぶ）
 */
const { execFileSync: 実行 } = require('child_process');
const AREGLM_ROOT = __dirname.replace(/\/server$/, '');
const 大きな変更の目安 = 50; // これを超える行数の差分は、確認なしでは記録しない

function gitで実行(args) {
    return 実行('git', args, { cwd: AREGLM_ROOT, encoding: 'utf8' });
}

/**
 * Node側から見える python3 は、pyenvのshimが必要なパッケージ
 * （numpy等）の入っていない別のバージョンを指してしまうことがある
 * （実際にテストで踏んだ）。自作AIエンジン本体（server.py）と
 * 同じ実体を、確実に同じもので実行する。
 */
const PYTHON_BIN = (() => {
    try {
        const 一覧 = 実行('bash', ['-lc', 'ls /Users/ari/.pyenv/versions/*/bin/python3 2>/dev/null'], { encoding: 'utf8' })
            .split('\n').filter(Boolean);
        return 一覧[一覧.length - 1] || 'python3';
    } catch {
        return 'python3';
    }
})();

/** 変更されたコードファイルだけを検査する（学習データ等は対象外） */
function 変更ファイルを検査する() {
    const 変更 = gitで実行(['status', '--porcelain']).split('\n').filter(Boolean)
        .map((l) => l.slice(3).trim())
        .filter((f) => !f.includes('server/data/') && !f.includes('node_modules/'));

    const 結果 = { ok: true, 見た数: 0, 失敗: [] };
    for (const f of 変更) {
        const 絶対path = require('path').join(AREGLM_ROOT, f);
        if (!require('fs').existsSync(絶対path)) continue;
        try {
            if (f.endsWith('.js')) {
                実行('node', ['--check', 絶対path], { encoding: 'utf8' });
                結果.見た数 += 1;
            } else if (f.endsWith('.py')) {
                実行(PYTHON_BIN, ['-m', 'py_compile', 絶対path], { encoding: 'utf8' });
                結果.見た数 += 1;
            }
        } catch (e) {
            結果.ok = false;
            結果.失敗.push({ ファイル: f, 訳: (e.stderr || e.message || '').toString().slice(0, 500) });
        }
    }
    return 結果;
}

/** 自作AIエンジンの自動テストを走らせる（速いので毎回やる） */
function AIエンジンのテストを走らせる() {
    try {
        const 出 = 実行(PYTHON_BIN, ['test_ai.py'], {
            cwd: require('path').join(AREGLM_ROOT, 'server/ai'),
            encoding: 'utf8',
        });
        return { ok: true, 出 };
    } catch (e) {
        return { ok: false, 出: (e.stdout || e.message || '').toString() };
    }
}

app.get('/api/self-heal/status', (req, res) => {
    try {
        const 状態 = gitで実行(['status', '--porcelain']);
        const 変更行数 = (() => {
            try {
                const 統計 = gitで実行(['diff', '--shortstat']);
                const m = 統計.match(/(\d+) insertion|(\d+) deletion/g) || [];
                return m.reduce((sum, s) => sum + parseInt(s, 10), 0);
            } catch { return 0; }
        })();
        res.json({
            ok: true,
            変更ファイル数: 状態.split('\n').filter(Boolean).length,
            変更行数,
            大きな変更か: 変更行数 > 大きな変更の目安,
        });
    } catch (e) {
        res.status(500).json({ ok: false, 訳: e.message });
    }
});

app.post('/api/self-heal/checkpoint', (req, res) => {
    try {
        const message = (req.body?.message || '変更を記録').slice(0, 200);
        const 強制 = !!req.body?.強制的に記録する;

        const 検査 = 変更ファイルを検査する();
        if (!検査.ok) {
            return res.json({ ok: false, 段階: '構文検査', 検査 });
        }

        const テスト = AIエンジンのテストを走らせる();
        if (!テスト.ok) {
            return res.json({ ok: false, 段階: '自動テスト', テスト });
        }

        const 統計 = gitで実行(['diff', '--shortstat']) || '';
        const 変更行数 = (統計.match(/(\d+) insertion|(\d+) deletion/g) || [])
            .reduce((sum, s) => sum + parseInt(s, 10), 0);

        if (変更行数 > 大きな変更の目安 && !強制) {
            // 大きな変更は、ここでは記録しない。差分を見せるだけにする。
            const 差分 = gitで実行(['diff', '--stat']);
            return res.json({
                ok: true, 記録した: false,
                訳: `変更が${変更行数}行と大きいため、確認なしでは記録しません。`,
                差分,
            });
        }

        gitで実行(['add', '-A']);
        gitで実行(['commit', '-m', message]);
        const 直近 = gitで実行(['log', '-1', '--format=%h %ad', '--date=iso-local']);
        res.json({ ok: true, 記録した: true, 検査, テスト: { ok: true }, 直近 });
    } catch (e) {
        res.status(500).json({ ok: false, 訳: e.message });
    }
});

app.get('/api/self-heal/history', (req, res) => {
    try {
        const ログ = gitで実行(['log', '--format=%h|%ad|%s', '--date=iso-local', '-30']);
        const 一覧 = ログ.split('\n').filter(Boolean).map((行) => {
            const [hash, 日付, ...文] = 行.split('|');
            return { hash, 日付, 件名: 文.join('|') };
        });
        res.json({ ok: true, 一覧 });
    } catch (e) {
        res.status(500).json({ ok: false, 訳: e.message });
    }
});

app.post('/api/self-heal/rollback', (req, res) => {
    // 取り返しがつかない操作なので、hashの形をきびしく確かめる
    // （任意のGitオプション文字列を渡されないようにする）。
    const hash = String(req.body?.hash || '');
    if (!/^[0-9a-f]{7,40}$/.test(hash)) {
        return res.status(400).json({ ok: false, 訳: 'コミットの指定が正しくありません' });
    }
    try {
        gitで実行(['reset', '--hard', hash]);
        res.json({ ok: true, 訳: `${hash} まで戻しました` });
    } catch (e) {
        res.status(500).json({ ok: false, 訳: e.message });
    }
});

/** 静的ファイル + SPA */
app.use(express.static(ROOT));

/* ==========================================================
   端末内だけの音声認識

   なぜこれが要るのか:
     ブラウザ標準の音声認識は、音声をGoogleのサーバーへ送っている。
     「外部に一切送らない」という約束に反していた。

     macOS には端末の中だけで音声を文字にする仕組みがある。
     Apple 公式・追加費用なし・ライセンス表示不要。
     それを呼び出して、音声が外へ出ないようにする。

   受け取った音声ファイルは、文字にしたあと必ず消す。
   残しておく理由がないため。
   ========================================================== */

/**
 * 端末内だけの音声認識（Whisper・自作AIエンジン側に実装）
 *
 * 以前は macOS の SFSpeechRecognizer を素の実行ファイルから呼んでいたが、
 * アプリとしての署名・権限が無く、起動するたびクラッシュしていた
 * （Apple の有料開発者証明書が要る）。
 *
 * Ollamaでの文章生成AIと同じ考え方で、無料・オープンソースの
 * 音声認識モデル（faster-whisper・small）を自作AIエンジンの中で動かす。
 * 証明書もクラウドも要らない。
 */
app.get('/api/voice/status', async (req, res) => {
    try {
        const r = await aiEngineFetch('/speech-to-text-status');
        res.json(await r.json());
    } catch (e) {
        res.json({
            ok: false, 使える: false,
            reason: '自作AIエンジンに繋がりません（server/ai/server.py が起動しているか確かめてください）: ' + e.message,
        });
    }
});

app.post('/api/voice/auth', (req, res) => {
    // Whisperはこのツール自身のプロセスの中で動くので、
    // macOSに許可を求めるダイアログは要らない。
    res.json({ ok: true, reason: null });
});

app.post('/api/voice/transcribe', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
    if (!req.body || !req.body.length) {
        return res.status(400).json({ ok: false, reason: '音声が届いていません' });
    }
    try {
        const r = await aiEngineFetch('/speech-to-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: req.body,
        });
        const d = await r.json();
        res.json(d);
    } catch (e) {
        res.status(503).json({
            ok: false,
            reason: '自作AIエンジンに繋がりません: ' + e.message,
        });
    }
});

/** AIチャットに添付した資料（PDF/Word/PowerPoint/テキスト）の本文を取り出す */
app.post('/api/extract-document-text', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
    if (!req.body || !req.body.length) {
        return res.status(400).json({ ok: false, text: '', reason: 'ファイルが届いていません' });
    }
    const 拡張子 = String(req.query.ext || '').toLowerCase();
    try {
        const r = await aiEngineFetch('/extract-document-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-File-Ext': 拡張子 },
            body: req.body,
        });
        const d = await r.json();
        res.json(d);
    } catch (e) {
        res.status(503).json({ ok: false, text: '', reason: '自作AIエンジンに繋がりません: ' + e.message });
    }
});

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(ROOT, 'index.html'));
});

// HOST=127.0.0.1 にするとこのMacからのみアクセス可能（既定は同一LAN内の他端末からも利用可）
/**
 * どこからの接続を受けるか。
 *
 * 既定は 127.0.0.1（この端末の中だけ）。
 *
 * ここは以前 '0.0.0.0' で、同じWi-Fiにいる端末なら
 * 誰でもこのツールを開けてしまう状態だった。
 * 在庫・原価・取引先が全部入っているので、
 * 公開しない道具としては、そこが開いていてはいけない。
 *
 * 他の端末から使いたいときは、
 * 自分で HOST=0.0.0.0 を指定したときだけ開く。
 * 黙って開けることはしない。
 */
const HOST = process.env.HOST
    || (他の端末を許しているか() ? '0.0.0.0' : '127.0.0.1');
const HTTPS_PORT = HTTPS_PORT_VALUE;

function lanAddresses() {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((n) => n && n.family === 'IPv4' && !n.internal)
        .map((n) => n.address);
}

/**
 * 追加の入口（アプリ用）
 *
 * 以前のバージョンが 8080 に残したキャッシュのせいで、
 * 直しても古い画面が出続けることがあった。
 * ブラウザのキャッシュはポートごとに別扱いなので、
 * 別のポートで開けばその影響を受けない。
 *
 * 127.0.0.1 はポートが違ってもマイクが使えるため、
 * 証明書の警告も出ず、これが最も確実な入口になる。
 */
const APP_PORT = process.env.APP_PORT || 8090;


app.listen(APP_PORT, '127.0.0.1', () => {
    console.log(`アプリ用の入口: http://127.0.0.1:${APP_PORT}  （マイク可・キャッシュの影響なし）`);
});

app.listen(PORT, HOST, () => {
    console.log(`AReGLM: http://localhost:${PORT}`);

    if (HOST === '0.0.0.0') {
        lanAddresses().forEach((ip) => {
            console.log(`同一Wi-Fi内の他端末から: http://${ip}:${PORT}`);
        });
        console.log('※ 他端末に見せたくない場合は HOST=127.0.0.1 で起動してください');
    }

    console.log('API Gateway 稼働 — 公式APIプロキシ有効');
});

/**
 * HTTPS でも待ち受ける
 *
 * ブラウザはマイク・カメラ・録音を「安全な接続」でしか許可しない。
 * 127.0.0.1 と localhost は例外だが、
 * arinoMacBook-Pro.local のようなURLでは使えなくなる。
 * HTTPS にすれば、どのURLからでもマイクが使える。
 *
 * 証明書が無ければ HTTPS は開かない（HTTP だけで動く）。
 * 作るには: server/certs/make-cert.sh を実行する
 */
if (httpsAvailable) {
    try {
        const https = require('https');
        const options = {
            cert: fs.readFileSync(CERT_PATH),
            key: fs.readFileSync(KEY_PATH)
        };

        https.createServer(options, app).listen(HTTPS_PORT, HOST, () => {
            const hostName = os.hostname().replace(/\.local$/, '');
            console.log(`\nHTTPS（マイクが使えます）: https://localhost:${HTTPS_PORT}`);
            console.log(`  名前で: https://${hostName}.local:${HTTPS_PORT}`);
            lanAddresses().forEach((ip) => {
                console.log(`  他端末から: https://${ip}:${HTTPS_PORT}`);
            });
            console.log('  ※ 初回だけブラウザが警告を出します。「詳細」→「アクセスする」で進んでください');
        });
    } catch (e) {
        console.log(`HTTPSを開けませんでした: ${e.message}`);
    }
} else {
    console.log('\nHTTPS未設定（マイクは 127.0.0.1 でのみ使えます）');
    console.log('  有効にするには: server/certs/make-cert.sh を実行');
}
