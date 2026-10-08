/**
 * TikTok 公式API（Content Posting API）— Gateway経由
 *
 * 連携（認可）は js/services/tiktok-oauth.js が担当。ここは投稿処理だけ。
 *
 * 正直に書いておくこと:
 *   ・審査を受けていないTikTokアプリは、既定で「非公開（自分にだけ見える）」
 *     投稿しかできない場合がある（TikTok側の仕様）。公開投稿には
 *     アプリの審査が要ることがある。
 *   ・動画は1回のアップロードで送る（小〜中サイズの宣伝動画向け。
 *     数百MBを超える大きな動画の分割送信には対応していない）。
 *   ・実際のTikTokアプリでの投稿テストは、本人の認証情報が必要なため
 *     未実施。
 */
const AReGLM_TIKTOK = {
    async isConnected() {
        return AReGLM_TIKTOK_OAUTH.isConnected();
    },

    async _call(method, path, body) {
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、TikTokとつなげません。');
        }
        const token = await AReGLM_TIKTOK_OAUTH.getAccessToken();
        const res = await fetch('/api/tiktok-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tiktok-Access-Token': token },
            body: JSON.stringify({ method, path, body }),
        });
        const data = await res.json();
        if (!res.ok || data.error?.code && data.error.code !== 'ok') {
            throw new Error(data?.error?.message || `TikTok API エラー（${res.status}）`);
        }
        return data;
    },

    /**
     * 動画を投稿する。
     * @param blob 動画のBlob
     * @param title 投稿文（タイトル）
     * @param privacy 'SELF_ONLY'（既定・自分にだけ見える）／'PUBLIC_TO_EVERYONE'／'MUTUAL_FOLLOW_FRIENDS'
     * @returns {Promise<string>} publish_id
     */
    async publishVideo(blob, title, privacy) {
        const token = await AReGLM_TIKTOK_OAUTH.getAccessToken();

        // 1) アップロードを開始し、送り先URLを受け取る
        const 開始 = await this._call('POST', '/v2/post/publish/video/init/', {
            post_info: {
                title: (title || '').slice(0, 150),
                privacy_level: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS'].includes(privacy)
                    ? privacy : 'SELF_ONLY',
            },
            source_info: {
                source: 'FILE_UPLOAD',
                video_size: blob.size,
                chunk_size: blob.size,
                total_chunk_count: 1,
            },
        });

        const publishId = 開始.data?.publish_id;
        const uploadUrl = 開始.data?.upload_url;
        if (!publishId || !uploadUrl) throw new Error('アップロードを開始できませんでした');

        // 2) 動画の中身を、受け取ったURLへそのまま送る
        const res = await fetch('/api/tiktok-video-proxy', {
            method: 'PUT',
            headers: {
                'X-Tiktok-Upload-Url': uploadUrl,
                'X-Video-Content-Type': blob.type || 'video/mp4',
                'X-Video-Content-Range': `bytes 0-${blob.size - 1}/${blob.size}`,
                'X-Tiktok-Access-Token': token,
            },
            body: blob,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('動画データの送信に失敗しました: ' + text.slice(0, 200));
        }

        return publishId;
    },

    /** 投稿の処理状況を確認する */
    async publishStatus(publishId) {
        return this._call('POST', '/v2/post/publish/status/fetch/', { publish_id: publishId });
    },
};

window.AReGLM_TIKTOK = AReGLM_TIKTOK;
