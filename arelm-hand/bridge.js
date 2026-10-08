/**
 * ARELMの手 ― 橋渡し（ARELMの画面の中でだけ動く）
 *
 * ARELMの画面（このページ）と、拡張機能の本体（background.js）をつなぐだけ。
 * 他のサイトでは動かない（manifest の matches と、本人が足した入り口だけ）。
 * 同じページ・同じ出どころから来た頼みだけを本体へ渡す。
 */
(() => {
    if (window.__ARELMの手) return;
    window.__ARELMの手 = true;
    const 版 = chrome.runtime.getManifest().version;
    const 知らせる = () => window.postMessage({ ARELMの手: 'います', 版 }, location.origin);

    window.addEventListener('message', (e) => {
        if (e.source !== window || e.origin !== location.origin) return;
        const d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.ARELMの手 === 'いますか') { 知らせる(); return; }
        if (d.ARELMの手 !== 'たのむ' || typeof d.id !== 'string' || typeof d.操作 !== 'string') return;
        const 返す = (結果) => window.postMessage({ ARELMの手: 'こたえ', id: d.id, 結果 }, location.origin);
        try {
            chrome.runtime.sendMessage({ 種類: 'たのむ', 操作: d.操作, 材料: d.材料 || {} }, (結果) => {
                const 誤り = chrome.runtime.lastError;
                返す(誤り ? { ok: false, 訳: '拡張機能に届きませんでした: ' + 誤り.message } : 結果);
            });
        } catch (err) {
            // 拡張機能を入れ直した直後は、古い橋が残る。ページを読み込み直せば直る
            返す({ ok: false, 訳: '拡張機能が新しくなりました。このページを読み込み直してください' });
        }
    });
    知らせる();
})();
