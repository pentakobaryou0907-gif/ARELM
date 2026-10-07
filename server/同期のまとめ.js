/**
 * 端末同士の同期で、2台の編集をまとめる
 *
 * 前は項目（localStorage の鍵）ごとの「後から書いた方が勝つ」だった。
 * Mac と iPad で同じタスク一覧を別々に直すと、後から届いた一覧で
 * 丸ごと上書きされ、もう片方で足したタスクや付けた完了印が消えていた。
 *
 * いまは「元にした版（base）」「サーバーにある今の版（server）」
 * 「端末から届いた版（client）」の3つを比べてまとめる。
 *   ・id を持つものの並び（タスク・商品など）は、id ごとにまとめる。
 *     片方で足したもの・直したもの・完了にしたものは、両方とも残る。
 *   ・同じものの同じ欄を両方で直したときだけ「ぶつかった」とし、
 *     届いた方（後から書いた方）を採る。採らなかった方は捨てずに
 *     「ぶつかったもの」として返し、サーバーが控えに残す。
 *   ・片方で外したものは、もう片方で直していなければ外す。
 *     もう片方で直していれば、直した方を残す（消える方に倒さない）。
 *   ・元にした版が分からないときは、何も外さない（足すだけ）。
 */

function 同じか(a, b) {
    if (a === b) return true;
    return 並べて書く(a) === 並べて書く(b);
}

// 鍵の順番が違うだけの同じ中身を「違う」と見ないよう、鍵を並べてから書き出す。
function 並べて書く(v) {
    return JSON.stringify(v, (_k, x) => {
        if (x && typeof x === 'object' && !Array.isArray(x)) {
            return Object.keys(x).sort().reduce((o, k) => { o[k] = x[k]; return o; }, {});
        }
        return x;
    });
}

function ただの入れ物か(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function idの並びか(v) {
    if (!Array.isArray(v)) return false;
    const 見た = new Set();
    for (const x of v) {
        if (!ただの入れ物か(x)) return false;
        if (typeof x.id !== 'string' && typeof x.id !== 'number') return false;
        const 鍵 = typeof x.id + ':' + x.id;
        if (見た.has(鍵)) return false;
        見た.add(鍵);
    }
    return true;
}

const idの鍵 = (x) => typeof x.id + ':' + x.id;

/**
 * @param {*} base   元にした版（分からなければ undefined）
 * @param {*} server サーバーにある今の版
 * @param {*} client 端末から届いた版
 * @param {object} 記録 { ぶつかった: [], 外した: [] } に書き足していく
 * @param {string} 場所 記録に残す位置の名前
 */
function まとめる(base, server, client, 記録, 場所 = '') {
    if (同じか(server, client)) return server;
    if (base !== undefined) {
        if (同じか(base, server)) return client;
        if (同じか(base, client)) return server;
    }

    const 並び = idの並びか(server) && idの並びか(client)
        && (base === undefined || idの並びか(base));
    if (並び) return 並びをまとめる(base, server, client, 記録, 場所);

    const 入れ物 = ただの入れ物か(server) && ただの入れ物か(client)
        && (base === undefined || ただの入れ物か(base));
    if (入れ物) return 入れ物をまとめる(base, server, client, 記録, 場所);

    記録.ぶつかった.push({ 場所, 採った: client, 採らなかった: server });
    return client;
}

function 入れ物をまとめる(base, server, client, 記録, 場所) {
    const 結果 = {};
    const 鍵たち = new Set([...Object.keys(server), ...Object.keys(client)]);
    for (const k of 鍵たち) {
        const 下 = 場所 ? `${場所}.${k}` : k;
        const s有 = Object.prototype.hasOwnProperty.call(server, k);
        const c有 = Object.prototype.hasOwnProperty.call(client, k);
        const b有 = base !== undefined && Object.prototype.hasOwnProperty.call(base, k);
        if (s有 && c有) {
            結果[k] = まとめる(b有 ? base[k] : undefined, server[k], client[k], 記録, 下);
        } else if (s有) {
            // 端末側に無い。元の版にあって変わっていなければ、端末側で外したもの。
            if (b有 && 同じか(base[k], server[k])) continue;
            結果[k] = server[k];
        } else {
            if (b有 && 同じか(base[k], client[k])) continue;
            結果[k] = client[k];
        }
    }
    return 結果;
}

function 並びをまとめる(base, server, client, 記録, 場所) {
    const 元 = new Map((base || []).map((x) => [idの鍵(x), x]));
    const 今 = new Map(server.map((x) => [idの鍵(x), x]));
    const 届 = new Map(client.map((x) => [idの鍵(x), x]));
    const 名 = (x) => `${場所}[id=${x.id}]`;

    const 決まり = new Map();
    for (const [k, c] of 届) {
        if (今.has(k)) {
            決まり.set(k, まとめる(元.get(k), 今.get(k), c, 記録, 名(c)));
        } else if (元.has(k)) {
            // ほかの端末で外されたもの。こちらで直していれば残す。
            if (同じか(元.get(k), c)) {
                記録.外した.push({ 場所: 名(c), 中身: c });
                continue;
            }
            決まり.set(k, c);
        } else {
            決まり.set(k, c);
        }
    }
    for (const [k, s] of 今) {
        if (届.has(k)) continue;
        if (base !== undefined && 元.has(k)) {
            if (同じか(元.get(k), s)) {
                記録.外した.push({ 場所: 名(s), 中身: s });
                continue;
            }
            // こちらで外したが、ほかの端末で直していた。直した方を残す。
        }
        決まり.set(k, s);
    }

    // 並びは届いた版の順を基にし、ほかの端末で足したものは、
    // サーバーの版で直前にあったものの後ろへ差し込む（先頭に足す一覧も崩さない）。
    const 結果 = client.map((x) => idの鍵(x)).filter((k) => 決まり.has(k));
    let 前 = null;
    for (const s of server) {
        const k = idの鍵(s);
        if (!届.has(k) && 決まり.has(k)) {
            const 位置 = 前 === null ? 0 : 結果.indexOf(前) + 1;
            結果.splice(位置, 0, k);
        }
        if (決まり.has(k)) 前 = k;
    }
    return 結果.map((k) => 決まり.get(k));
}

function 読む(文字) {
    if (typeof 文字 !== 'string') return { 読めた: false };
    try { return { 読めた: true, 中身: JSON.parse(文字) }; } catch { return { 読めた: false }; }
}

/**
 * localStorage に入っている文字のまま受け取り、まとめた文字を返す。
 * @returns {{ 値: string, 変わった: boolean, ぶつかった: Array, 外した: Array }}
 */
function 文字でまとめる(base文字, server文字, client文字) {
    const 記録 = { ぶつかった: [], 外した: [] };
    if (server文字 === client文字) return { 値: server文字, 変わった: false, ...記録 };
    if (base文字 !== undefined && base文字 === server文字) return { 値: client文字, 変わった: false, ...記録 };
    if (base文字 !== undefined && base文字 === client文字) return { 値: server文字, 変わった: true, ...記録 };

    const b = base文字 === undefined ? { 読めた: true, 中身: undefined } : 読む(base文字);
    const s = 読む(server文字);
    const c = 読む(client文字);
    if (!b.読めた || !s.読めた || !c.読めた) {
        記録.ぶつかった.push({ 場所: '', 採った: client文字, 採らなかった: server文字 });
        return { 値: client文字, 変わった: false, ...記録 };
    }
    const まとめた = まとめる(b.中身, s.中身, c.中身, 記録);
    if (同じか(まとめた, c.中身)) return { 値: client文字, 変わった: false, ...記録 };
    return { 値: JSON.stringify(まとめた), 変わった: true, ...記録 };
}

module.exports = { まとめる, 文字でまとめる, 同じか };
