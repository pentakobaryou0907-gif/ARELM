/**
 * Gmail API — Gateway経由（送信専用）
 *
 * 使うには js/services/google-oauth.js での連携（ログイン）が先に必要。
 * gmail.send スコープしか要求していないため、受信箱の閲覧・削除はできない
 * （送るだけ。Google側の権限モデルによる制限）。
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
