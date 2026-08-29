/**
 * 日付の扱い
 *
 * なぜこれが要るのか:
 *   日付を出すのに toISOString().slice(0,10) を使っていた。
 *   これは世界標準時に直してから文字にするため、
 *   日本時間では朝9時より前が「前の日」になってしまう。
 *
 *   実際に起きたこと:
 *     ・「毎週」の次回が1日早く出た（8月27日のはずが8月26日）
 *     ・夜に使うと「今日」が前日として扱われる
 *
 *   17個のファイルで同じ書き方をしていたので、
 *   ここに一本化する。同じ間違いを別の場所で繰り返さないため。
 *
 * この端末の時計をそのまま使う。外部へは一切問い合わせない。
 */

/**
 * 日付を YYYY-MM-DD の形にする。
 * 引数を省くと今日。
 *
 * 世界標準時に直さず、この端末の時計のまま文字にする。
 */
function 日付文字(d) {
    const t = d instanceof Date ? d : (d ? new Date(d) : new Date());
    if (isNaN(t.getTime())) return '';
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const 日 = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${日}`;
}

/** 今日の日付（YYYY-MM-DD） */
function 今日() {
    return 日付文字(new Date());
}

/** 何日か前後の日付 */
function 日をずらす(日数, 起点) {
    const d = 起点 ? new Date(起点) : new Date();
    d.setDate(d.getDate() + 日数);
    return 日付文字(d);
}

/**
 * 2つの日付が何日離れているか。
 *
 * 時刻の影響を受けないよう、どちらも日付だけにしてから数える。
 * 時刻が混ざると、23時と翌0時が「1日」ではなく「0日」になることがある。
 */
function 日数の差(あと, まえ) {
    const a = new Date(`${日付文字(あと)}T00:00`);
    const b = new Date(`${日付文字(まえ)}T00:00`);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.round((a - b) / 86400000);
}

window.日付文字 = 日付文字;
window.今日 = 今日;
window.日をずらす = 日をずらす;
window.日数の差 = 日数の差;
