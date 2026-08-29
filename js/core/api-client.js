/**
 * API Gateway クライアント（同一オリジンの server/index.js 経由）
 */
/**
 * サーバー側（_課金の案内）が付けてくれた、料金絡みで失敗した可能性の
 * 案内をエラーメッセージへ足す。C-10「有料化したAPIを自動排除」の
 * 第一段階として、まずは「気づける」ようにする。
 */
function _課金の案内つきエラー文(data, 基本の文) {
    return data?._課金の案内 ? `${基本の文}\n${data._課金の案内}` : 基本の文;
}

const AReGLM_API_CLIENT = {
    async health() {
        try {
            const r = await fetch('/api/health');
            return r.ok;
        } catch {
            return false;
        }
    },

    async gemini(apiKey, payload, model = 'gemini-2.0-flash') {
        const r = await fetch('/api/ai/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ model, payload })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(_課金の案内つきエラー文(data, data.error?.message || data.error || `Gemini ${r.status}`));
        return data;
    },

    async claude(apiKey, payload) {
        const r = await fetch('/api/ai/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ payload })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(_課金の案内つきエラー文(data, data.error?.message || data.error || `Claude ${r.status}`));
        return data;
    },

    async groq(apiKey, payload) {
        const r = await fetch('/api/ai/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ payload })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(_課金の案内つきエラー文(data, data.error?.message || data.error || `Groq ${r.status}`));
        return data;
    },

    async huggingface(apiKey, model, payload) {
        const r = await fetch('/api/ai/huggingface', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ model, payload })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(_課金の案内つきエラー文(data, data.error || `HF ${r.status}`));
        return data;
    },

    async suzuriProducts(token) {
        const r = await fetch('/api/suzuri/products', {
            headers: { 'X-Suzuri-Token': token }
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || data.message || `SUZURI ${r.status}`);
        return data;
    },

    async suzuriPost(token, path, body) {
        const r = await fetch(`/api/suzuri/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Suzuri-Token': token },
            body: JSON.stringify(body)
        });
        const text = await r.text();
        try {
            return JSON.parse(text);
        } catch {
            return { raw: text };
        }
    }
};

window.AReGLM_API_CLIENT = AReGLM_API_CLIENT;
