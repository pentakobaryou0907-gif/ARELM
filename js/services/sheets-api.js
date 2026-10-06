/**
 * Google スプレッドシートの進捗ログ — Gateway（/api/sheets-proxy）経由
 *
 * Google連携（js/services/google-oauth.js）のログインを使う。スコープは drive.file
 * のままなので、このアプリが作った「ARELM 進捗ログ」の表にしか触れない。
 * 行は足していくだけで、消したり書き換えたりはしない。
 * 送った行の id はこの端末に憶え、二重に送らない。
 */
const AReGLM_SHEETS = {
    表の名前: 'ARELM 進捗ログ',
    表の鍵: 'areglm_progress_sheet_id',
    送った鍵: 'areglm_progress_sheet_sent',

    タブ: {
        進捗: ['とき', 'ブランド', 'やること', '現在地', '次に', '動きなし'],
        投稿ログ: ['日時', 'ブランド', '媒体', '本文', 'タグ', '素材', 'BGMの出所', 'URL'],
        お金: ['日付', '種類', 'ブランド', '中身', '販売先', '数', '金額', '手数料', '原価', '利益'],
    },

    async _呼ぶ(method, path, body) {
        return AReGLM_GOOGLE_OAUTH.call('sheets-proxy', method, path, body);
    },

    _範囲(タブ) {
        return encodeURIComponent(`${タブ}!A1`);
    },

    async _表を用意する() {
        const 憶えた = localStorage.getItem(this.表の鍵);
        if (憶えた) {
            try {
                await this._呼ぶ('GET', `/v4/spreadsheets/${憶えた}?fields=spreadsheetId`);
                return { id: 憶えた, 新しい: false };
            } catch (e) {
                if (!/not found|404|削除|deleted/i.test(e.message)) throw e;
                localStorage.removeItem(this.表の鍵);
                localStorage.removeItem(this.送った鍵);
            }
        }
        const 作った = await this._呼ぶ('POST', '/v4/spreadsheets', {
            properties: { title: this.表の名前 },
            sheets: Object.keys(this.タブ).map((title) => ({ properties: { title } })),
        });
        if (!作った?.spreadsheetId) throw new Error('Googleスプレッドシートを作れませんでした');
        localStorage.setItem(this.表の鍵, 作った.spreadsheetId);
        for (const [タブ, 見出し] of Object.entries(this.タブ)) {
            await this._行を足す(作った.spreadsheetId, タブ, [見出し]);
        }
        return { id: 作った.spreadsheetId, 新しい: true };
    },

    async _行を足す(id, タブ, 行) {
        if (!行.length) return;
        await this._呼ぶ('POST',
            `/v4/spreadsheets/${id}/values/${this._範囲(タブ)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
            { values: 行 });
    },

    /** 名前や本文に出てくるブランド名。どれにも当たらなければ空 */
    _ブランド(...文) {
        const 中身 = 文.join(' ').toUpperCase();
        if (/TUDURI|TUZURI/.test(中身)) return 'TUDURI';
        if (中身.includes('INTGLM')) return 'INTGLM';
        if (中身.includes('ARELM')) return 'ARELM';
        return '';
    },

    _送った() {
        try { return new Set(JSON.parse(localStorage.getItem(this.送った鍵) || '[]')); } catch { return new Set(); }
    },

    _読む(鍵) {
        try { return JSON.parse(localStorage.getItem(鍵) || '[]') || []; } catch { return []; }
    },

    /** まだ送っていない進捗・投稿ログ・お金の記録を、表の各タブの末尾に足す */
    async まだの分を送る() {
        const { id, 新しい } = await this._表を用意する();
        const 送った = this._送った();
        const まだ = (一覧) => 一覧.filter((x) => x && x.id && !送った.has(x.id));
        const 文 = (v) => String(v ?? '').slice(0, 5000);

        const 進捗 = まだ(this._読む('areglm_progress_log'));
        const 投稿 = まだ(this._読む('areglm_post_log'));
        const 売上 = まだ(this._読む('areglm_sales'));
        const 支出 = まだ(this._読む('areglm_expenses'));

        await this._行を足す(id, '進捗', 進捗.map((x) => [
            文(x.とき), 文(x.ブランド || this._ブランド(x.見出し, x.現在地)), 文(x.見出し), 文(x.現在地), 文(x.次に), x.動きなし ? 'はい' : '',
        ]));
        await this._行を足す(id, '投稿ログ', 投稿.map((x) => [
            文(x.日時), 文(this._ブランド(x.本文, x.タグ)), 文(x.媒体), 文(x.本文), 文(x.タグ), 文(x.素材), 文(x.BGM出所), 文(x.URL),
        ]));
        await this._行を足す(id, 'お金', [
            ...売上.map((x) => [文(x.date), '売上', 文(this._ブランド(x.product)), 文(x.product), 文(x.channel),
                Number(x.qty) || 0, Number(x.total) || 0, Number(x.fee) || 0, Number(x.cost) || 0, Number(x.profit) || 0]),
            ...支出.map((x) => [文(x.date), '支出', 文(this._ブランド(x.product, x.note)),
                文([x.category, x.product || x.note].filter(Boolean).join(' ')), '',
                '', -(Number(x.amount) || 0), '', '', '']),
        ]);

        [...進捗, ...投稿, ...売上, ...支出].forEach((x) => 送った.add(x.id));
        localStorage.setItem(this.送った鍵, JSON.stringify([...送った].slice(-5000)));
        return {
            id, 新しい,
            URL: `https://docs.google.com/spreadsheets/d/${id}/edit`,
            件数: { 進捗: 進捗.length, 投稿ログ: 投稿.length, お金: 売上.length + 支出.length },
        };
    },
};

window.AReGLM_SHEETS = AReGLM_SHEETS;
