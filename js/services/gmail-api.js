/**
 * Gmail API — Gateway経由（送信・受信箱の閲覧）
 *
 * 使うには js/services/google-oauth.js での連携（ログイン）が先に必要。
 * 要求しているのは gmail.send（送信）と gmail.readonly（閲覧専用）の
 * 2つだけ。読み取りはできても、既読にする・削除する・下書きを作る
 * ことはできない（そのスコープを要求していないため、Google側の
 * 権限モデルで弾かれる）。
 */
const AReGLM_GMAIL = {
    async isReady() {
        return AReGLM_GOOGLE_OAUTH.isConnected();
    },

    /** 連携したアカウント自身（自分）宛に、件名・本文のメールを送る */
    async sendToSelf(subject, bodyText) {
        const email = AReGLM_GOOGLE_OAUTH.getConnectedEmail();
        if (!email) throw new Error('Googleアカウントのメールアドレスが未確認です。設定（⚙）でログインし直してください。');
        return this.send(email, subject, bodyText);
    },

    /** 指定した宛先へ、件名・本文（プレーンテキスト）のメールを送る */
    async send(to, subject, bodyText) {
        const raw = this._rawMessageを作る(to, subject, bodyText);
        return AReGLM_GOOGLE_OAUTH.call('gmail-proxy', 'POST', '/gmail/v1/users/me/messages/send', { raw });
    },

    /**
     * 未読メールを新しい順に取ってくる（差出人・件名・スニペットだけ。
     * 本文の全文は取得しない＝渡す情報を必要最小限にとどめる）。
     * @param 件数 最大いくつ取るか（既定10）
     * @returns {Promise<Array<{id, 差出人, 件名, 概要}>>}
     */
    async 未読を読む(件数 = 10) {
        const 一覧 = await AReGLM_GOOGLE_OAUTH.call(
            'gmail-proxy', 'GET',
            `/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread')}&maxResults=${Math.max(1, Math.min(50, 件数))}`
        );
        const idたち = (一覧.messages || []).map((m) => m.id);
        if (!idたち.length) return [];

        // 1通ずつメタデータだけ取る（本文は取らない）。件数が多いと遅いが、
        // Gmail APIに複数IDをまとめて取る手段が無いための素直な実装。
        const 結果 = [];
        for (const id of idたち) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const msg = await AReGLM_GOOGLE_OAUTH.call(
                    'gmail-proxy', 'GET',
                    `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`
                );
                const headers = msg.payload?.headers || [];
                const 取る = (名) => headers.find((h) => h.name === 名)?.value || '';
                結果.push({
                    id,
                    差出人: 取る('From'),
                    件名: 取る('Subject') || '(件名なし)',
                    概要: (msg.snippet || '').slice(0, 120),
                });
            } catch {
                // 1通取れなくても、他が取れていれば続ける
            }
        }
        return 結果;
    },

    /** Gmail APIの仕様（raw = base64urlのRFC822メッセージ）に合わせて組み立てる */
    _rawMessageを作る(to, subject, bodyText) {
        const utf8をbase64に = (s) => btoa(unescape(encodeURIComponent(s)));
        const 件名エンコード = `=?UTF-8?B?${utf8をbase64に(subject)}?=`;
        const mime = [
            `To: ${to}`,
            `Subject: ${件名エンコード}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset="UTF-8"',
            'Content-Transfer-Encoding: base64',
            '',
            utf8をbase64に(bodyText),
        ].join('\r\n');
        return utf8をbase64に(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
};

window.AReGLM_GMAIL = AReGLM_GMAIL;
