#!/usr/bin/env node
/**
 * 記録を片づける
 *
 * なぜこれが要るのか:
 *
 *   記録は、増え続ける。
 *   いまは0.1MBだが、使うほど大きくなる。
 *
 *   大きくなること自体は困らない。
 *   困るのは、<b>古い記録が漏れどころとして残り続ける</b>こと。
 *
 *   記録には、いつ何をしたかが書いてある。
 *   一年前の分まで持っている理由はない。
 *   持っていなければ、漏れようがない。
 *
 * どうするか:
 *   ・古い行から落とす（各ファイル、直近2000行まで）
 *   ・かぎや合言葉が混ざっていたら伏せる
 *   ・消すのではなく、削って残す
 *     全部消すと、何が起きていたか分からなくなる
 *
 * 外部へは一切問い合わせません。
 */

const fs = require('fs');
const path = require('path');

const 記録の場所 = path.join(process.env.HOME || '', 'Library', 'Logs', 'AReGLM');

/** 各ファイルで残す行数 */
const 残す行数 = 2000;

/** これより古い記録は持たない（日） */
const 残す日数 = 60;

function 伏せる(文) {
    let 出 = String(文 || '');
    [
        [/\b(sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{16,}\b/g, '（かぎ）'],
        [/\bAIza[A-Za-z0-9_-]{20,}\b/g, '（かぎ）'],
        [/((api[_-]?key|token|secret|password|合言葉)\s*[:=]\s*)\S+/gi, '$1（伏せました）'],
        [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '（メール）'],
    ].forEach(([型, 代]) => { 出 = 出.replace(型, 代); });
    return 出;
}

function 片づける() {
    if (!fs.existsSync(記録の場所)) {
        return { ok: false, 訳: '記録の置き場所がありません' };
    }

    const 結果 = [];
    const 期限 = Date.now() - 残す日数 * 86400000;

    fs.readdirSync(記録の場所).forEach((名) => {
        if (!/\.log$/.test(名)) return;
        const 道 = path.join(記録の場所, 名);

        try {
            const 情報 = fs.statSync(道);

            // 古すぎるものは、丸ごと空にする（消さずに残す）
            if (情報.mtimeMs < 期限) {
                fs.writeFileSync(道, `（${残す日数}日より前の記録は、持ち続けない決まりで片づけました）\n`);
                結果.push({ 名, した: '古いので空にしました' });
                return;
            }

            const 中身 = fs.readFileSync(道, 'utf8');
            const 行 = 中身.split('\n');

            const 削る = 行.length > 残す行数;
            const 残り = 削る ? 行.slice(-残す行数) : 行;
            const 伏せた = 残り.map(伏せる);

            const 変わった = 削る || 伏せた.join('\n') !== 残り.join('\n');
            if (変わった) {
                const 頭 = 削る
                    ? [`（古い ${行.length - 残す行数}行 は片づけました）`]
                    : [];
                fs.writeFileSync(道, 頭.concat(伏せた).join('\n'));
                結果.push({
                    名,
                    した: 削る
                        ? `${行.length}行 → ${残す行数}行 に削りました`
                        : '危ないものを伏せました',
                });
            }
        } catch (e) {
            結果.push({ 名, した: '触れませんでした: ' + e.message });
        }
    });

    return {
        ok: true,
        訳: 結果.length
            ? `${結果.length}件を片づけました`
            : '片づけるものはありませんでした',
        中身: 結果,
    };
}

if (require.main === module) {
    const r = 片づける();
    console.log('='.repeat(48));
    console.log(' 記録を片づける');
    console.log('='.repeat(48));
    console.log('  ' + r.訳);
    (r.中身 || []).forEach((x) => console.log(`    ${x.名}: ${x.した}`));
    console.log();
}

module.exports = { 片づける, 伏せる };
