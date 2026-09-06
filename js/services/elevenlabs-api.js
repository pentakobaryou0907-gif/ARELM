/**
 * ElevenLabs Text-to-Speech（高品質な声の読み上げ・任意）— Gateway経由
 *
 * 既定はMac内蔵の声（voice-style.js）のまま。ここは、設定でAPIキー・
 * 声のIDを入れ、「高品質な声を使う」を有効にし、さらに
 * paid-guard.js側の許可（お金がかかる機能の許可）もONにしたときだけ
 * 呼ばれる（二重の関門）。
 *
 * 正直に書いておくこと:
 *   読み上げる文章は、そのつどElevenLabsへ送られる（この端末の中だけ
 *   では完結しない）。無料枠を超えると課金される。
 */
const AReGLM_ELEVENLABS = {
    async getKey() {
        return AReGLM_SECURITY.loadApiKeySecure('elevenlabs', 'api_key');
    },

    getVoiceId() {
        return localStorage.getItem('areglm_elevenlabs_voice_id') || '';
    },

    isEnabled() {
        return localStorage.getItem('areglm_elevenlabs_enabled') === 'true';
    },

    async isReady() {
        return !!(await this.getKey()) && !!this.getVoiceId();
    },

    /** 使う条件がすべて揃っているか（設定・鍵・声のID・お金の許可） */
    async 使えるか() {
        if (!this.isEnabled()) return false;
        if (!(await this.isReady())) return false;
        if (typeof 使ってよいか === 'function' && !使ってよいか('elevenlabs')) return false;
        return true;
    },

    /**
     * 読み上げる。音声を取得して再生する（再生が終わるまで待てる）。
     * @returns {Promise<boolean>} 再生できたか
     */
    async speak(text) {
        const key = await this.getKey();
        const voiceId = this.getVoiceId();
        if (!key || !voiceId || !text) return false;

        const res = await fetch('/api/ai/elevenlabs-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
            body: JSON.stringify({ text: text.slice(0, 500), voiceId }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d._課金の案内 || d.error || `読み上げに失敗しました（HTTP ${res.status}）`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        return new Promise((resolve) => {
            audio.onended = () => { URL.revokeObjectURL(url); resolve(true); };
            audio.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
            audio.play().catch(() => resolve(false));
        });
    },
};

window.AReGLM_ELEVENLABS = AReGLM_ELEVENLABS;
