/**
 * 原価・価格設定の判定
 *
 * 自社分析資料「エグゼクティブサマリー」の価格ポジショニング基準に準拠：
 *   - 仕入価格は売価の約50%以下で商品化する
 *   - 粗利率50%超を目指す
 * 入力するたびに基準を満たしているかを判定する。計算はこの端末内のみ。
 */
const AREGLM_TARGET_MARGIN_RATE = 0.5; // 粗利50%超が目標

function initPricing() {
    ['pricing-cost', 'pricing-price', 'pricing-qty'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', renderPricingResult);
    });
    renderPricingResult();
}

function renderPricingResult() {
    const box = document.getElementById('pricing-result');
    if (!box) return;

    const cost = parseFloat(document.getElementById('pricing-cost')?.value);
    const price = parseFloat(document.getElementById('pricing-price')?.value);
    const qty = parseInt(document.getElementById('pricing-qty')?.value || '1', 10) || 1;

    if (!Number.isFinite(cost) || !Number.isFinite(price) || price <= 0) {
        box.innerHTML = '<p class="hint">原価と販売価格を入力すると、粗利率と基準の判定を表示します。</p>';
        return;
    }

    const grossPerUnit = price - cost;
    const marginRate = grossPerUnit / price;
    const costRate = cost / price;
    const totalGross = grossPerUnit * qty;

    const meetsMargin = marginRate > AREGLM_TARGET_MARGIN_RATE;
    const meetsCost = costRate <= 0.5;

    // 基準を満たす最低販売価格（粗利50%超 = 原価の2倍より上）
    const suggestedPrice = Math.ceil((cost * 2 + 1) / 10) * 10;

    const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
    const pct = (n) => `${(n * 100).toFixed(1)}%`;

    box.innerHTML = `
        <div class="pricing-metrics">
            <div class="pricing-metric"><span>1点あたり粗利</span><strong>${yen(grossPerUnit)}</strong></div>
            <div class="pricing-metric"><span>粗利率</span><strong class="${meetsMargin ? 'ok' : 'ng'}">${pct(marginRate)}</strong></div>
            <div class="pricing-metric"><span>原価率</span><strong class="${meetsCost ? 'ok' : 'ng'}">${pct(costRate)}</strong></div>
            <div class="pricing-metric"><span>${qty}点の粗利合計</span><strong>${yen(totalGross)}</strong></div>
        </div>
        <ul class="pricing-checks">
            <li class="${meetsMargin ? 'ok' : 'ng'}">${meetsMargin ? '✓' : '✗'} 粗利50%超の基準${meetsMargin ? 'を満たしています' : 'を下回っています'}</li>
            <li class="${meetsCost ? 'ok' : 'ng'}">${meetsCost ? '✓' : '✗'} 原価は売価の50%以下${meetsCost ? 'です' : 'を超えています'}</li>
        </ul>
        ${
            meetsMargin && meetsCost
                ? ''
                : `<p class="pricing-suggest">基準を満たすには販売価格 <strong>${yen(suggestedPrice)}</strong> 以上を検討してください。</p>`
        }
    `;
}

window.initPricing = initPricing;
window.renderPricingResult = renderPricingResult;
