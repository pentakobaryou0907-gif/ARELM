/**
 * サーバー無しの代わり（公開先＝GitHub Pages で使うとき）
 *
 * なぜ要るのか:
 *   公開先にはARELMのサーバー（Mac）が無い。画面は /api/… を呼ぶが、何も返ってこず、
 *   データは端末ごとにばらばら、AIも使えなかった。
 *   本人が選んだ代わり（2026-10-08）:
 *     ・端末同士のデータ共有 … GitHubの非公開倉庫（本人の鍵で読み書き）
 *     ・AI（会話）          … Geminiの無料API（本人のキーで、端末から直接）
 *
 * やっていること:
 *   公開先で開いたときだけ（index.html に <meta name="arelm-host" content="static"> があるとき）、
 *   次の窓口への問い合わせを、この端末の中で受けて、代わりに答える。
 *     /api/sync/all   … 倉庫の sync_store.json を読む（Macの server/data/sync_store.json と同じ形）
 *     /api/sync/push  … 少しまとめてから、倉庫へ書き戻す（同じ項目は新しい方を残す）
 *     /api/ai-local/chat・/api/ai-local/health … Geminiで答える
 *   sync.js と各画面は、何も変えずに、そのまま動く。
 *   Macで開いたときは、何もしない（いつも通りMacのサーバーが答える）。
 *
 * 守ること:
 *   ・外への通信は、関所（外に出さない.js）の「本人が選んだ置き場」だけを通る
 *   ・鍵とキーは、端末の金庫（合言葉で閉じた置き場）からしか出さない
 *   ・カード番号・APIキー・メールアドレスらしきものは、Geminiへ送らない（自作AIの rules.py と同じ決まり）
 *   ・倉庫は消さない。書くたびに、GitHubの履歴に前の中身が残る
 */

function サーバーの無い公開先か() {
    return !!document.querySelector('meta[name="arelm-host"][content="static"]');
}

/* ---------- 同期の中身を混ぜる（同じ項目は、新しい方を残す。Mac側の橋渡しと同じ決まり） ---------- */
function 同期の中身をまぜる(元, 足す) {
    const 中身 = Object.assign({}, 元 || {});
    let 変わった = false;
    Object.entries(足す || {}).forEach(([key, entry]) => {
        if (!entry || typeof entry.updatedAt !== 'number') return;
        const 今 = 中身[key];
        if (!今 || entry.updatedAt > 今.updatedAt) {
            中身[key] = entry;
            変わった = true;
        }
    });
    return { 中身, 変わった };
}

/* ---------- 文字と base64（日本語を壊さないため、UTF-8を通す） ---------- */
function 文字をbase64に(文字) {
    const b = new TextEncoder().encode(文字);
    let 二進 = '';
    for (let i = 0; i < b.length; i += 0x8000) 二進 += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(二進);
}

function base64を文字に(b64) {
    const 二進 = atob(String(b64).replace(/\s/g, ''));
    const b = new Uint8Array(二進.length);
    for (let i = 0; i < 二進.length; i++) b[i] = 二進.charCodeAt(i);
    return new TextDecoder().decode(b);
}

/* ---------- GitHubの非公開倉庫 ---------- */
const 外の倉庫 = {
    設定の名: 'areglm_ext_store',
    ファイル: 'sync_store.json',
    窓口: 'https://api.github.com',

    設定() {
        try { return JSON.parse(localStorage.getItem(this.設定の名) || 'null'); } catch { return null; }
    },

    使えるか() {
        const s = this.設定();
        return !!(s && s.持ち主 && s.倉庫 && window.端末の金庫 && 端末の金庫.開いているか() && 端末の金庫.入っているか('github'));
    },

    async _頭(追加) {
        const 鍵 = await 端末の金庫.出す('github');
        if (!鍵) throw new Error('GitHubの鍵が開けません（合言葉を入れ直してください）');
        return Object.assign({
            Authorization: 'Bearer ' + 鍵,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        }, 追加 || {});
    },

    _道() {
        const s = this.設定();
        return `${this.窓口}/repos/${s.持ち主}/${s.倉庫}/contents/${this.ファイル}`;
    },

    /** 倉庫の中身を読む。まだファイルが無ければ空 */
    async 読む() {
        const r = await fetch(this._道(), { headers: await this._頭(), cache: 'no-store' });
        if (r.status === 404) return { データ: {}, sha: null };
        if (!r.ok) throw new Error('倉庫を読めませんでした（' + r.status + '）');
        const j = await r.json();
        let 文字;
        if (j.content && j.encoding === 'base64') {
            文字 = base64を文字に(j.content);
        } else {
            // 1MBを超えると、中身は付いてこない。そのまま（raw）でもう一度取る
            const r2 = await fetch(this._道(), { headers: await this._頭({ Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' });
            if (!r2.ok) throw new Error('倉庫を読めませんでした（' + r2.status + '）');
            文字 = await r2.text();
        }
        let データ = {};
        try { データ = JSON.parse(文字 || '{}') || {}; } catch { データ = {}; }
        return { データ, sha: j.sha };
    },

    /** 足す分を、倉庫の最新と混ぜて書く。ぶつかったら（他の端末が先に書いた）、読み直して混ぜ直す */
    async 混ぜて書く(足す) {
        for (let 回 = 0; 回 < 4; 回++) {
            const { データ, sha } = await this.読む();
            const { 中身, 変わった } = 同期の中身をまぜる(データ, 足す);
            if (!変わった && sha) return true;
            const 本文 = { message: 'ARELM: 端末からの更新', content: 文字をbase64に(JSON.stringify(中身)) };
            if (sha) 本文.sha = sha;
            const r = await fetch(this._道(), {
                method: 'PUT',
                headers: await this._頭({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(本文),
            });
            if (r.ok) return true;
            if (r.status !== 409 && r.status !== 422) throw new Error('倉庫へ書けませんでした（' + r.status + '）');
        }
        throw new Error('他の端末と書き込みがぶつかり続けました');
    },

    // 一つずつ送ると、書くたびに倉庫の記録が増えるので、少しまとめてから送る
    _待ち: {},
    _返事: [],
    _タイマー: null,

    送る予約(key, value, updatedAt) {
        return new Promise((resolve) => {
            this._待ち[key] = { value, updatedAt };
            this._返事.push(resolve);
            clearTimeout(this._タイマー);
            this._タイマー = setTimeout(() => this._まとめて送る(), 2000);
        });
    },

    async _まとめて送る() {
        const 待ち = this._待ち;
        const 返事 = this._返事;
        this._待ち = {};
        this._返事 = [];
        let ok = false;
        try { ok = await this.混ぜて書く(待ち); }
        catch (e) { console.warn('[外の倉庫] 送れませんでした:', e.message); }
        // 送れなかった項目は、sync.js の決まり通り、次にその項目へ書き込みが起きたとき送り直される
        返事.forEach((r) => r(ok));
    },

    /** 鍵の持ち主を確かめ、倉庫が無ければ非公開で作る（設定の保存のときに使う） */
    async 準備する(倉庫の名) {
        const 持ち主 = await fetch(`${this.窓口}/user`, { headers: await this._頭(), cache: 'no-store' });
        if (持ち主.status === 401) throw new Error('鍵が正しくないか、期限が切れています');
        if (!持ち主.ok) throw new Error('鍵の持ち主を確かめられませんでした（' + 持ち主.status + '）');
        const 名 = (await 持ち主.json()).login;
        localStorage.setItem(this.設定の名, JSON.stringify({ 持ち主: 名, 倉庫: 倉庫の名 }));

        const 有無 = await fetch(`${this.窓口}/repos/${名}/${倉庫の名}`, { headers: await this._頭(), cache: 'no-store' });
        if (有無.status === 404) {
            const 作る = await fetch(`${this.窓口}/user/repos`, {
                method: 'POST',
                headers: await this._頭({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name: 倉庫の名, private: true, auto_init: true, description: 'ARELMの端末間で共有するデータ（非公開）' }),
            });
            if (!作る.ok) {
                throw new Error(`倉庫「${倉庫の名}」がありません。GitHubで非公開の倉庫を作ってから、もう一度保存してください（${作る.status}）`);
            }
        } else if (有無.ok) {
            const 中 = await 有無.json();
            // 公開の倉庫にデータを置くと、誰でも読めてしまう。非公開でなければ使わない
            if (中.private !== true) throw new Error(`倉庫「${倉庫の名}」が公開になっています。データは非公開の倉庫にしか置きません`);
        } else {
            throw new Error('倉庫を確かめられませんでした（' + 有無.status + '）');
        }
        // 読めるか確かめる（中身が無ければ空でよい）
        await this.読む();
        return 名;
    },
};

/* ---------- Gemini（無料API） ---------- */
const 外のAI = {
    設定の名: 'areglm_ext_ai',
    // 新しい順に試す。名前が無くなっていたら（404）、次を使う
    候補: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    _使えた名: null,

    使えるか() {
        return localStorage.getItem(this.設定の名) === 'gemini'
            && !!window.端末の金庫 && 端末の金庫.開いているか() && 端末の金庫.入っているか('gemini');
    },

    // 自作AIの rules.py の SENSITIVE_PATTERNS と同じ決まり。外のAIへは、これらを送らない
    送らない中身: [
        [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, 'クレジットカード番号らしき数列'],
        [/\b\d{12}\b/, 'マイナンバーらしき数列'],
        [/\b\d{3}-?\d{4}-?\d{4}\b/, '電話番号らしき数列'],
        [/[\w.+-]+@[\w-]+\.[\w.-]+/, 'メールアドレス'],
        [/\b(sk|pk|ghp|gsk)_[A-Za-z0-9]{16,}\b/, 'APIキーらしき文字列'],
        [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/, 'GitHubの鍵らしき文字列'],
        [/\bAIza[0-9A-Za-z_-]{30,}\b/, 'Google APIキー'],
    ],

    送ってよいか(文) {
        const 当たり = this.送らない中身.find(([型]) => 型.test(文));
        return 当たり ? 当たり[1] : null;
    },

    /** 画面が渡す手がかり（商品・予定など）を、短くまとめる（送る量を必要な分に絞る） */
    手がかりをまとめる(ctx) {
        const 先頭 = (配列, n) => (Array.isArray(配列) ? 配列.slice(0, n) : []);
        const 商品 = 先頭(ctx.products, 40).map((p) => ({ 名: p.name || p.名前, 価格: p.price || p.価格, 在庫: p.stock ?? p.在庫 }));
        const やること = 先頭(ctx.tasks, 40).map((t) => ({ 題: t.title || t.text || t.名前, 済: !!(t.done || t.completed), 期限: t.due || t.期限 }));
        const 予定 = 先頭(ctx.events, 20).map((e) => ({ 題: e.title || e.名前, 日: e.date || e.日付 }));
        let 文 = JSON.stringify({ 今日: ctx.today || '', 商品, やること, 予定 });
        if (文.length > 8000) 文 = 文.slice(0, 8000);
        // 手がかりの中にも、送らない中身があれば、手がかりごと送らない
        return this.送ってよいか(文) ? '' : 文;
    },

    _履歴の名: 'areglm_ext_ai_history',

    _履歴(session) {
        try { return (JSON.parse(sessionStorage.getItem(this._履歴の名) || '{}')[session]) || []; } catch { return []; }
    },

    _履歴に足す(session, 問い, 答え) {
        let 全部 = {};
        try { 全部 = JSON.parse(sessionStorage.getItem(this._履歴の名) || '{}'); } catch { 全部 = {}; }
        const 今 = (全部[session] || []).concat([
            { role: 'user', parts: [{ text: 問い }] },
            { role: 'model', parts: [{ text: 答え }] },
        ]);
        全部[session] = 今.slice(-20);   // 直近10往復だけ
        sessionStorage.setItem(this._履歴の名, JSON.stringify(全部));
    },

    async 答える(text, ctx, session) {
        const 引っかかり = this.送ってよいか(text);
        if (引っかかり) {
            return { ok: false, certainty: 'blocked', answer: `${引っかかり}が入っているため、外のAI（Gemini）へは送りませんでした。消してから、もう一度どうぞ。`, sources: [] };
        }
        const キー = await 端末の金庫.出す('gemini');
        if (!キー) throw new Error('Geminiのキーが開けません');
        const 手がかり = this.手がかりをまとめる(ctx || {});
        const 決まり = [
            'あなたは、一人で運営するアパレルブランド「ARELM」の運営を手伝うアシスタントです。',
            '日本語で、短く、具体的に答えてください。分からないことは、分からないと言ってください。',
            '違法なこと・他社の権利を侵すこと・規約に反すること・誇大な広告は、手伝わずに理由を伝えてください。',
            'お金が絡む操作（商品の公開・購入・送金）は、必ず本人が自分で行うよう伝えてください。',
            ctx && ctx.persona ? '話し方の希望: ' + String(ctx.persona).slice(0, 300) : '',
            手がかり ? 'いまのブランドの状況（参考）: ' + 手がかり : '',
        ].filter(Boolean).join('\n');
        const 本文 = JSON.stringify({
            systemInstruction: { parts: [{ text: 決まり }] },
            contents: this._履歴(session).concat([{ role: 'user', parts: [{ text }] }]),
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        });
        const 候補 = this._使えた名 ? [this._使えた名] : this.候補;
        let 最後 = null;
        for (const 名 of 候補) {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${名}:generateContent`, {
                method: 'POST',
                // キーはURLに載せず、頭に載せる（記録に残りにくくするため）
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': キー },
                body: 本文,
            });
            if (r.status === 404) { 最後 = r; continue; }
            if (r.status === 429) throw new Error('Geminiの無料枠の回数を超えました。少し待ってから、もう一度どうぞ。');
            if (r.status === 400 || r.status === 403) throw new Error('Geminiのキーが使えません（設定の「Mac無しで使う」で入れ直してください）');
            if (!r.ok) throw new Error('Geminiが答えませんでした（' + r.status + '）');
            this._使えた名 = 名;
            const d = await r.json();
            const 答え = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [])
                .map((p) => p.text || '').join('').trim() || '（答えが空でした）';
            this._履歴に足す(session, text, 答え);
            return { ok: true, answer: 答え, sources: [], agent: { 名: 'Gemini（Mac無し）', 絵: '☁' } };
        }
        throw new Error('使えるGeminiのモデルが見つかりませんでした（' + (最後 ? 最後.status : '?') + '）');
    },
};

/* ---------- 窓口の代わり ---------- */
function 代わりの返事(本体, 状態 = 200) {
    return new Response(JSON.stringify(本体), { status: 状態, headers: { 'Content-Type': 'application/json' } });
}

async function 代わりに答える(道, 設定) {
    if (道 === '/api/sync/all') {
        if (!外の倉庫.使えるか()) return 代わりの返事({ ok: false, 訳: 'データの置き場が、まだ決まっていません' }, 503);
        try { return 代わりの返事({ ok: true, データ: (await 外の倉庫.読む()).データ }); }
        catch (e) { return 代わりの返事({ ok: false, 訳: e.message }, 503); }
    }
    if (道 === '/api/sync/push') {
        if (!外の倉庫.使えるか()) return 代わりの返事({ ok: false }, 503);
        let b = {};
        try { b = JSON.parse((設定 && 設定.body) || '{}'); } catch { b = {}; }
        if (!b.key || typeof b.updatedAt !== 'number') return 代わりの返事({ ok: false, 訳: 'key と updatedAt が要ります' }, 400);
        const ok = await 外の倉庫.送る予約(b.key, b.value, b.updatedAt);
        return 代わりの返事({ ok }, ok ? 200 : 503);
    }
    if (道 === '/api/ai-local/health') {
        return 外のAI.使えるか()
            ? 代わりの返事({ ok: true, status: 'ok', 代わり: 'gemini' })
            : 代わりの返事({ ok: false, 訳: 'Mac無しでAIを使うには、設定の「Mac無しで使う」でGeminiのキーを入れてください' }, 503);
    }
    if (道 === '/api/ai-local/chat') {
        let b = {};
        try { b = JSON.parse((設定 && 設定.body) || '{}'); } catch { b = {}; }
        if (!外のAI.使えるか()) {
            return 代わりの返事({ ok: false, answer: 'Macが無いときにAIを使うには、設定の「☁ Mac無しで使う」で、Geminiのキーを入れてください。', sources: [] });
        }
        try {
            return 代わりの返事(await 外のAI.答える(String(b.text || '').trim(), b.context || {}, b.session_id || 'chat'));
        } catch (e) {
            return 代わりの返事({ ok: false, answer: e.message, sources: [] });
        }
    }
    return null;
}

const 代わりの窓口 = new Set(['/api/sync/all', '/api/sync/push', '/api/ai-local/health', '/api/ai-local/chat']);

(function 代わりを置く() {
    if (!サーバーの無い公開先か()) return;
    const 前のfetch = window.fetch;
    window.fetch = function (入力, 設定) {
        try {
            const url = new URL((入力 && 入力.url) ? 入力.url : 入力, location.href);
            if (url.origin === location.origin && 代わりの窓口.has(url.pathname)) {
                return 代わりに答える(url.pathname, 設定);
            }
        } catch { /* 読めない行き先は、いつも通りに任せる */ }
        return 前のfetch.apply(this, arguments);
    };
})();

/**
 * 合言葉で開いた直後・ときどき: 倉庫の最新を取り込む。
 * 取り込んで何か変わったら true（画面は、開き直したときに新しい中身で出る）。
 */
async function サーバー無しで取り込み直す() {
    if (!サーバーの無い公開先か() || !外の倉庫.使えるか() || !window.AReGLM_SYNC) return false;
    const 前 = localStorage.getItem(AReGLM_SYNC.META_KEY) || '';
    await AReGLM_SYNC.起動時に取り込む();
    return (localStorage.getItem(AReGLM_SYNC.META_KEY) || '') !== 前;
}

// 開いている間も、他の端末の変更をときどき取り込む（3分ごと・画面に戻ったとき）
(function ときどき取り込む() {
    if (!サーバーの無い公開先か()) return;
    const 取り込む = async () => {
        if (document.getElementById('main-app')?.style.display === 'none') return;
        try {
            if (await サーバー無しで取り込み直す() && typeof showNotification === 'function') {
                showNotification('他の端末の変更を取り込みました。画面を開き直すと、表示に出ます', 'info');
            }
        } catch { /* 繋がらなければ、次の機会に */ }
    };
    setInterval(取り込む, 3 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') 取り込む(); });
})();

window.外の倉庫 = 外の倉庫;
window.外のAI = 外のAI;
window.サーバーの無い公開先か = サーバーの無い公開先か;
window.サーバー無しで取り込み直す = サーバー無しで取り込み直す;
window.同期の中身をまぜる = 同期の中身をまぜる;
