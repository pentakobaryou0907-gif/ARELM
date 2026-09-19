/**
 * Google Drive API — Gateway経由（バックアップ専用）
 *
 * 使うには js/services/google-oauth.js での連携（ログイン）が先に必要。
 * drive.file スコープしか要求していないため、このアプリ自身が作成した
 * ファイルにしか触れない（Drive内の他のファイルは見えない。Google側の
 * 権限モデルによる制限）。
 */
const AReGLM_DRIVE = {
    FOLDER_NAME: 'ARELM バックアップ',

    async isReady() {
        return AReGLM_GOOGLE_OAUTH.isConnected();
    },

    /**
     * 専用フォルダのIDを返す（無ければ作る）。
     * 一覧検索はせず、この端末に憶えたIDだけを使う
     * （検索用クエリの記号をそのままURLに載せる複雑さを避けるため。
     * 端末の記憶が消えた場合は、単に新しいフォルダが1つ増えるだけで、
     * 実害はない）。
     */
    async _folderIdを用意する() {
        const 憶えているID = localStorage.getItem('areglm_drive_folder_id');
        if (憶えているID) return 憶えているID;
        const created = await AReGLM_GOOGLE_OAUTH.call('drive-proxy', 'POST', '/drive/v3/files', {
            name: this.FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
        });
        if (!created?.id) throw new Error('Driveにフォルダを作れませんでした');
        localStorage.setItem('areglm_drive_folder_id', created.id);
        return created.id;
    },

    /** テキストを、専用フォルダへ新規ファイルとして保存する（上書きはしない。積み上げていく） */
    async backupText(fileName, text, mimeType = 'text/plain') {
        const folderId = await this._folderIdを用意する();
        const meta = await AReGLM_GOOGLE_OAUTH.call('drive-proxy', 'POST', '/drive/v3/files', {
            name: fileName,
            parents: [folderId],
        });
        if (!meta?.id) throw new Error('Driveにファイルを作れませんでした');
        await AReGLM_GOOGLE_OAUTH.call(
            'drive-proxy', 'PATCH', `/upload/drive/v3/files/${meta.id}?uploadType=media`,
            text, { contentType: mimeType }
        );
        return meta;
    },
};

window.AReGLM_DRIVE = AReGLM_DRIVE;
