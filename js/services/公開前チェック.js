/**
 * 公開前チェックの判定（画面に依存しない部分）
 *
 * SUZURIの「商品を公開する」ボタンは、必ずあなた自身が押す。
 * ここは、その前に「決めた約束を守れているか」を確かめるだけで、
 * 公開そのものには一切触れない。
 *
 * 約束の出どころ（TUDURI/INTGLMの運用ルール）:
 *   ・TUDURI: 5点ごとの回で、系統A（Drive資料を参照）と系統B（完全オリジナル）を
 *     両方入れる。固定の3要素は各1回まで。ブランドタグは付けない。
 *     次の番号は、進捗ログの続き（既定では21番から）。
 *   ・INTGLM: 品目・素材・シルエット・装飾技法を、直前と続けて同じにしない。
 *     過去の組み合わせ（品目＋シルエット＋配色＋装飾）とほぼ同じものは作らない。
 *     ブランドタグの形は変えない。
 *   ・どちらも: 実在ブランドのロゴ・柄・商品の構図を真似ない。
 */

const AREGLM_PREPUBLISH = {
    TUDURIの最初の番号: 21,
    バッチの大きさ: 5,

    /** 目で確かめてもらう項目（自動では判定できないもの） */
    手動の項目(series) {
        const 共通 = [
            { id: 'real_brand', 文: '実在ブランドの名前・ロゴ・柄・商品の構図を真似していない' },
            { id: 'quality', 文: 'ZOZOTOWN級の品質を、目で見て確かめた' },
            { id: 'drive_private', 文: 'Drive側の共有が「非公開」になっている' },
        ];
        if (series === 'TUDURI') {
            return [
                { id: 'three_elements', 文: '固定の3要素（TUDURIロゴ・赤いAの記号・AReGLMの文字）が揃い、形が変わっておらず、1つの商品に各1回までしか入っていない' },
                { id: 'no_brand_tag', 文: 'ブランドタグは付いていない（TUDURIは付けない決まり）' },
                ...共通,
            ];
        }
        return [
            { id: 'tag_shape', 文: 'ブランドタグの形が変わっていない（色だけが変わっている）' },
            { id: 'tag_symbol_wordmark', 文: 'AReGLMのタグ・INTGLMの文字・INTGLMの記号が入っている' },
            { id: 'flat_lay', 文: 'モックアップは平置きのみ（モデル・マネキン・ハンガーなし）' },
            ...共通,
        ];
    },

    /** 次のTUDURIの番号（記録のいちばん大きい番号の次。無ければ21番） */
    次のTUDURIの番号(全部) {
        const 番号たち = 全部.filter((x) => x.series === 'TUDURI' && Number.isInteger(x.no)).map((x) => x.no);
        return Math.max(this.TUDURIの最初の番号 - 1, ...番号たち) + 1;
    },

    _同じ(a, b) {
        return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    },

    /** 同じ系列を、作った順に並べる */
    _系列(全部, series) {
        return 全部.filter((x) => x.series === series)
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    },

    /**
     * 自動で確かめられる項目。
     * 結果: 'ok'（問題なし）｜'ng'（直すべき）｜'info'（参考）
     */
    自動の確認(作品, 全部) {
        const 結果 = [];
        const 追加 = (id, 件, 状態, 訳) => 結果.push({ id, 件, 状態, 訳 });
        const 系列 = this._系列(全部, 作品.series);
        const 自分の位置 = 系列.findIndex((x) => x.id === 作品.id);
        const 直前 = 自分の位置 > 0 ? 系列[自分の位置 - 1] : null;

        const 抜け = [];
        if (!作品.name) 抜け.push('名前');
        if (!作品.item) 抜け.push('品目');
        if (!(Number(作品.price) > 0)) 抜け.push('価格');
        追加('filled', '名前・品目・価格が入っている', 抜け.length ? 'ng' : 'ok',
            抜け.length ? `入っていません: ${抜け.join('、')}` : '入っています');

        if (作品.series === 'TUDURI') {
            追加('keitou', '系統（A／B）が選ばれている', 作品.keitou ? 'ok' : 'ng',
                作品.keitou ? `系統${作品.keitou}` : '系統Aか系統Bを選んでください');

            const 同番号 = 全部.filter((x) => x.series === 'TUDURI' && x.id !== 作品.id && x.no === 作品.no);
            追加('no_unique', '番号が他と重ならない', !Number.isInteger(作品.no) ? 'ng' : (同番号.length ? 'ng' : 'ok'),
                !Number.isInteger(作品.no) ? '番号がありません' : (同番号.length ? `No.${作品.no} は他にもあります` : `No.${作品.no}`));
            追加('no_range', '番号が、進捗ログの続き（No.21以降）にある',
                Number.isInteger(作品.no) && 作品.no >= this.TUDURIの最初の番号 ? 'ok' : 'ng',
                `No.${作品.no ?? '？'}（記録済みは1〜${this.TUDURIの最初の番号 - 1}）`);

            // 5点ごとの回に、系統AとBが両方あるか
            if (Number.isInteger(作品.no) && 作品.no >= this.TUDURIの最初の番号) {
                const 回 = Math.floor((作品.no - this.TUDURIの最初の番号) / this.バッチの大きさ);
                const 回の作品 = 系列.filter((x) => Number.isInteger(x.no) && x.no >= this.TUDURIの最初の番号
                    && Math.floor((x.no - this.TUDURIの最初の番号) / this.バッチの大きさ) === 回);
                const 系統たち = new Set(回の作品.map((x) => x.keitou).filter(Boolean));
                const 初 = this.TUDURIの最初の番号 + 回 * this.バッチの大きさ;
                const 範囲 = `No.${初}〜${初 + this.バッチの大きさ - 1}の回`;
                if (回の作品.length < this.バッチの大きさ) {
                    追加('batch', '5点の回に系統AとBの両方が入る',
                        系統たち.size === 2 ? 'ok' : 'info',
                        `${範囲}は${回の作品.length}/${this.バッチの大きさ}点。いまのところ ${[...系統たち].map((k) => '系統' + k).join('・') || '系統なし'}`);
                } else {
                    追加('batch', '5点の回に系統AとBの両方が入る', 系統たち.size === 2 ? 'ok' : 'ng',
                        系統たち.size === 2 ? `${範囲}: 両方入っています` : `${範囲}: ${[...系統たち].map((k) => '系統' + k).join('・') || '系統なし'} だけです`);
                }
            }
        } else {
            // INTGLM: 直前と、品目・素材・シルエット・装飾技法を続けて同じにしない
            const かぶり = [];
            if (直前) {
                if (this._同じ(作品.item, 直前.item)) かぶり.push('品目');
                if (this._同じ(作品.material, 直前.material)) かぶり.push('素材');
                if (this._同じ(作品.silhouette, 直前.silhouette)) かぶり.push('シルエット');
                if (this._同じ(作品.decoration, 直前.decoration)) かぶり.push('装飾技法');
            }
            追加('no_repeat', '直前の作品と、品目・素材・シルエット・装飾技法が続けて同じでない',
                かぶり.length ? 'ng' : 'ok',
                直前 ? (かぶり.length ? `直前「${直前.name}」と同じ: ${かぶり.join('、')}` : `直前「${直前.name}」とは違います`) : '直前の作品はありません');

            const 同組 = 系列.filter((x) => x.id !== 作品.id
                && this._同じ(x.item, 作品.item) && this._同じ(x.silhouette, 作品.silhouette)
                && this._同じ(x.palette, 作品.palette) && this._同じ(x.decoration, 作品.decoration));
            const 組が空 = !作品.item || !作品.silhouette || !作品.palette || !作品.decoration;
            追加('no_dup', '過去と同じ組み合わせ（品目＋シルエット＋配色＋装飾）でない',
                組が空 ? 'ng' : (同組.length ? 'ng' : 'ok'),
                組が空 ? '品目・シルエット・配色・装飾技法を、すべて入れてください'
                    : (同組.length ? `「${同組[0].name}」とほぼ同じです` : '重なるものはありません'));
        }
        return 結果;
    },

    /** 全体の判定: 自動に'ng'が無く、手動の項目がすべて確認済みなら、公開前チェックは完了 */
    判定(作品, 全部) {
        const 自動 = this.自動の確認(作品, 全部);
        const 手動 = this.手動の項目(作品.series).map((m) => ({ ...m, 済み: !!(作品.確認 && 作品.確認[m.id]) }));
        const 直すところ = 自動.filter((x) => x.状態 === 'ng').length;
        const 未確認 = 手動.filter((m) => !m.済み).length;
        return { 自動, 手動, 直すところ, 未確認, 完了できる: 直すところ === 0 && 未確認 === 0 };
    },
};

window.AREGLM_PREPUBLISH = AREGLM_PREPUBLISH;
