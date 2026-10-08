/**
 * 入場の記録（だれかが入ろうとしたことを、本人が見られるようにする）
 *
 * なぜ要るのか:
 *   ログインや合言葉の間違いが続くと、しばらく締め出す仕組みはあった（アカウント.js・門番.js）。
 *   ただ、その記録はサーバーの中だけで、本人には見えず、再起動で消えていた。
 *   本人の要望（2026-10-08）:「勝手にログインしていたり、知らないものがあったら、すぐに知らせて」。
 *
 * 決まり:
 *   ・打ち込まれた中身（パスワード・合言葉・ユーザー名）は、成否にかかわらず残さない
 *     （ユーザー名の欄にパスワードを打ってしまうことがあるため、名前も残さない）
 *   ・相手の住所（IP）は、どこから来たかを見分けるために残す。画面にはログインした本人にだけ見せる
 *   ・追記だけで、消さない（server/data/入場の記録.jsonl）
 *
 * 中身は、時刻と記録を外から渡す純粋な作りにしてあり、tools/サーバーの試験.js で試せる。
 */

const fs = require('fs');
const path = require('path');

const 種類 = {
    成功: 'ログインできた',
    失敗: 'ログインの間違い',
    締め出し: '間違いが続いたので締め出した',
    合言葉の間違い: '合言葉の間違い（他の端末の入口）',
    合言葉の締め出し: '合言葉の間違いが続いたので締め出した',
};

/** どこから来たか（画面で見分けやすい言葉にする） */
function どこから(住所) {
    const a = String(住所 || '').replace(/^::ffff:/, '');
    if (a === '127.0.0.1' || a === '::1') return 'このMac';
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a)) return 'Tailscaleの端末（' + a + '）';
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)) return '同じWi-Fiの端末（' + a + '）';
    return '外の住所（' + a + '）';
}

function 残す(場所, 何, 住所, いま = new Date()) {
    if (!種類[何]) return;
    try {
        fs.mkdirSync(path.dirname(場所), { recursive: true });
        fs.appendFileSync(場所, JSON.stringify({ とき: いま.toISOString(), 何, どこから: どこから(住所) }) + '\n', { mode: 0o600 });
    } catch {
        // 記録に失敗しても、ログインそのものは止めない
    }
}

function 読む(場所) {
    try {
        return fs.readFileSync(場所, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch {
        return [];
    }
}

/** 本人に見せるまとめ。直近の記録と、気をつけることがあるか */
function まとめる(記録, いま = new Date()) {
    const 一日前 = いま.getTime() - 24 * 60 * 60 * 1000;
    const 今日の分 = 記録.filter((r) => new Date(r.とき).getTime() >= 一日前);
    const 間違い = 今日の分.filter((r) => r.何 !== '成功');
    const 締め出し = 今日の分.filter((r) => /締め出し/.test(r.何));
    const 知らない所 = 今日の分.filter((r) => /^外の住所/.test(r.どこから));
    const 知らせ = [];
    if (締め出し.length) 知らせ.push(`この24時間に、間違いが続いて締め出したことが${締め出し.length}回あります`);
    else if (間違い.length >= 3) 知らせ.push(`この24時間に、間違いが${間違い.length}回ありました`);
    if (知らない所.length) 知らせ.push(`見慣れない住所からの入場が${知らない所.length}回ありました（${[...new Set(知らない所.map((r) => r.どこから))].join('、')}）`);
    return {
        直近: 記録.slice(-20).reverse().map((r) => ({ とき: r.とき, 何: 種類[r.何] || r.何, どこから: r.どこから })),
        今日の間違い: 間違い.length,
        気をつけて: 知らせ.length > 0,
        知らせ,
    };
}

module.exports = { 残す, 読む, まとめる, どこから, 種類 };
