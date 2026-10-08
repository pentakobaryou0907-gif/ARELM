/**
 * Google Photos Picker API — Gateway経由（読み取り専用・本人が選んだ写真だけ）
 *
 * 使うには js/services/google-oauth.js での連携（ログイン）が先に必要。
 * photospicker.mediaitems.readonly スコープしか要求していないため、
 * 写真ライブラリを丸ごと見ることはできない。毎回Googleのピッカー画面が
 * 開き、そこで本人が選んだ写真の情報だけがこちらへ届く（Google側の
 * 権限モデルによる制限。この端末の実装で絞っているわけではない）。
 *
 * 流れ（Picker APIの公式な使い方）:
 *   1. セッションを作る（POST /v1/sessions）→ pickerUri をもらう
 *   2. pickerUriを新しいタブで開く（本人が写真を選ぶ）
 *   3. セッションの状態を数秒おきに確認し、mediaItemsSet が true になるまで待つ
 *   4. 選ばれた写真の一覧（GET /v1/mediaItems）を取る
 *   5. 写真1枚ごとに、baseUrl から実データを取ってくる
 *      （baseUrlは決まったAPIホストではなくGoogleの画像CDN上の一時URLなので、
 *      /api/google-photos-download 側でホスト名を確認してから中継する）
 */
const AReGLM_GOOGLE_PHOTOS = {
    async isReady() {
        return AReGLM_GOOGLE_OAUTH.isConnected();
    },

    /**
     * ピッカーを開き、本人が写真を選び終わるまで待って、選ばれた一覧を返す。
     * @returns {Promise<Array>} mediaItems（各要素に id・mediaFile.baseUrl 等）
     */
    async pick() {
        const セッション = await AReGLM_GOOGLE_OAUTH.call('google-photos-proxy', 'POST', '/v1/sessions', {});
        if (!セッション?.pickerUri || !セッション?.id) {
            throw new Error('ピッカーを開始できませんでした');
        }

        const 窓 = window.open(セッション.pickerUri, 'areglm_google_photos_picker', 'width=520,height=680');
        if (!窓) throw new Error('ポップアップがブロックされました。ブラウザの設定で許可してから、もう一度試してください。');

        const 確認間隔ms = 2000;
        const 締切 = Date.now() + 5 * 60 * 1000; // 5分で諦める

        try {
            while (Date.now() < 締切) {
                await new Promise((r) => setTimeout(r, 確認間隔ms));

                let 状態;
                try {
                    状態 = await AReGLM_GOOGLE_OAUTH.call('google-photos-proxy', 'GET', `/v1/sessions/${encodeURIComponent(セッション.id)}`);
                } catch {
                    continue; // 1回の確認失敗では諦めず、次の間隔でもう一度見る
                }

                if (状態?.mediaItemsSet) {
                    return this._選ばれた一覧を取る(セッション.id);
                }
                if (状態?.expireTime && new Date(状態.expireTime) < new Date()) {
                    throw new Error('選択の時間が切れました。もう一度お試しください。');
                }
                if (窓.closed && !状態?.mediaItemsSet) {
                    // 選ばずに閉じた可能性が高いが、選択直後に自動で閉じることもあるため
                    // すぐには諦めず、状態を一度だけ確認してから判断する。
                    const 最終確認 = await AReGLM_GOOGLE_OAUTH.call(
                        'google-photos-proxy', 'GET', `/v1/sessions/${encodeURIComponent(セッション.id)}`);
                    if (最終確認?.mediaItemsSet) return this._選ばれた一覧を取る(セッション.id);
                    throw new Error('選択されませんでした（ウィンドウが閉じられました）');
                }
            }
            throw new Error('選択が時間内に終わりませんでした');
        } finally {
            try { if (!窓.closed) 窓.close(); } catch { /* 閉じられなくても致命的ではない */ }
        }
    },

    async _選ばれた一覧を取る(sessionId) {
        const 結果 = await AReGLM_GOOGLE_OAUTH.call(
            'google-photos-proxy', 'GET', `/v1/mediaItems?sessionId=${encodeURIComponent(sessionId)}`);
        return 結果?.mediaItems || [];
    },

    /** 選ばれた写真1枚を、そのままチャット添付に使えるdata URLとして取ってくる */
    async downloadAsDataUrl(mediaItem) {
        const baseUrl = mediaItem?.mediaFile?.baseUrl;
        if (!baseUrl) throw new Error('この項目には画像データがありません（動画等、未対応の種類の可能性があります）');

        const token = await AReGLM_GOOGLE_OAUTH.getAccessToken();
        const res = await fetch('/api/google-photos-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Google-Access-Token': token },
            // "=d" は元データそのままダウンロードの指定（Picker APIの仕様）
            body: JSON.stringify({ url: `${baseUrl}=d` }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => null);
            throw new Error(d?.error || `画像を取得できませんでした（HTTP ${res.status}）`);
        }
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
            reader.readAsDataURL(blob);
        });
    },
};

window.AReGLM_GOOGLE_PHOTOS = AReGLM_GOOGLE_PHOTOS;
