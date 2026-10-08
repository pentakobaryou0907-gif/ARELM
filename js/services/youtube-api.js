/**
 * YouTube 公式API（Data API v3・アップロードのみ）— Gateway経由
 *
 * 使うには js/services/google-oauth.js での連携（ログイン）が先に必要
 * （youtube.upload スコープ）。
 *
 * 正直に書いておくこと:
 *   要求しているのは youtube.upload（アップロードのみ）権限だけ。
 *   チャンネルの設定変更・他の動画の削除・コメント操作等はできない
 *   （そのスコープを要求していないため）。
 */
const AReGLM_YOUTUBE = {
    async isReady() {
        return AReGLM_GOOGLE_OAUTH.isConnected();
    },

    /**
     * 動画をアップロードする。
     * @param blob 動画のBlob（media-studio.jsが組み立てたものなど）
     * @param title タイトル
     * @param description 説明文（任意）
     * @param privacy 'private'（既定・本人しか見えない）／'unlisted'／'public'
     * @returns {Promise<{id:string, url:string}>}
     */
    async upload(blob, title, description, privacy) {
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、YouTubeとつなげません。');
        }
        const token = await AReGLM_GOOGLE_OAUTH.getAccessToken();
        if (!token) throw new Error('Googleと連携していません → 設定（⚙）');

        const q = new URLSearchParams({
            title: (title || 'ARELM').slice(0, 100),
            description: (description || '').slice(0, 5000),
            privacy: ['public', 'unlisted', 'private'].includes(privacy) ? privacy : 'private',
        });

        const res = await fetch(`/api/youtube-upload-proxy?${q}`, {
            method: 'POST',
            headers: {
                'X-Google-Access-Token': token,
                'X-Video-Content-Type': blob.type || 'video/mp4',
                'Content-Type': blob.type || 'application/octet-stream',
            },
            body: blob,
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data?.error?.message || data?.error || `YouTube API エラー（${res.status}）`);
        }
        if (!data.id) throw new Error('アップロードできませんでした');
        return { id: data.id, url: `https://youtu.be/${data.id}` };
    },
};

window.AReGLM_YOUTUBE = AReGLM_YOUTUBE;
