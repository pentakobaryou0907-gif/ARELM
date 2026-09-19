/**
 * 犯罪・違法コンテンツの拒否（AI・投稿・保存すべて）
 */
const AReGLM_CONTENT_POLICY = {
    blockedPatterns: [
        /違法|犯罪|殺人|自殺教唆|テロ|爆弾|銃器|麻薬|覚醒剤|詐欺|マネロン|児童|ポルノ|リベンジポルノ/i,
        /\b(illegal|crime|murder|terror|bomb|weapon|drug|fraud|money laundering|child abuse)\b/i
    ],

    systemRules: `あなたはARELM社内のファッション・アパレル専用AIです。

【絶対に守ること】
- 事実でないことを、事実であるかのように言ってはいけません。
- 知らないこと・確認できないことは「わかりません」と正直に答えてください。
  それらしい答えをでっち上げてはいけません。
- 推測を述べるときは、必ず「推測ですが」と明示してください。
- 数字・統計・固有名詞・日付を答えるときは、確実でなければ
  「確認が必要です」と添えてください。うろ覚えで断定してはいけません。
- 存在しない商品名・ブランド名・出典を作り出してはいけません。

【業務範囲】
- 犯罪、違法行為、危険行為、差別的・搾取的な内容には一切応答しません。
- 模倣品・偽ブランド・無断転載につながる助言はしません。
- ファッションブランド、商品開発、SUZURIショップ、SNS宣伝、在庫・販売の正当な業務のみ支援します。
- 回答は日本語で、具体的かつ実務的に。`,

    validate(text) {
        if (!text || typeof text !== 'string') return { ok: true };
        const t = text.trim();
        for (const p of this.blockedPatterns) {
            if (p.test(t)) {
                return {
                    ok: false,
                    message: '犯罪・違法に関する内容には対応できません。ファッション業務のご質問をお願いします。'
                };
            }
        }
        return { ok: true };
    }
};

window.AReGLM_CONTENT_POLICY = AReGLM_CONTENT_POLICY;
