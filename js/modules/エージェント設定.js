/**
 * エージェントの進め方（設定ページ）
 *
 * 「新商品を出す準備をして」のような、いくつもの手順がある頼みを、
 *   ・確認なしで、最後まで進める（既定）
 *   ・順番を見せて、「実行して」と言ってから進める
 * のどちらにするか。
 *
 * どちらでも変わらないこと:
 *   ・足りない中身（商品名など）は、勝手に埋めず、その手順のところで聞く
 *   ・失敗したら、そこで止めて理由を言う（残りを飛ばして終わったとは言わない）
 *   ・消す・外へ送る・公開する、といったことは、どちらでも行わない
 *
 * 値は localStorage の areglm_agent_auto（'0' のときだけ確認を挟む）。
 * 端末間の同期の対象なので、サーバー側（AIへ中継するとき）も同じ値を読む。
 */

const エージェント自動の鍵 = 'areglm_agent_auto';

function エージェントは自動で進めるか() {
    const v = localStorage.getItem(エージェント自動の鍵);
    return !(v === '0' || v === 'false');
}

function renderエージェント設定() {
    const 箱 = document.getElementById('agent-auto-panel');
    if (!箱) return;
    箱.textContent = '';

    const 行 = (タグ, 文字, クラス) => { const e = document.createElement(タグ); e.textContent = 文字; if (クラス) e.className = クラス; return e; };
    const 自動 = エージェントは自動で進めるか();

    箱.appendChild(行('p', 自動
        ? '現在: 頼んだら、確認なしで最後まで進めます。'
        : '現在: 順番を見せて、「実行して」と言ってから進めます。', 自動 ? 'guard-off' : 'guard-on'));
    箱.appendChild(行('p',
        'どちらでも、足りない中身は聞きます。失敗したら、そこで止めて理由を言います。'
        + '消す・外へ送る・公開する、は、どちらでも行いません。', 'hint'));

    const b = 行('button', 自動 ? '順番を見せて、確認してから進める' : '確認なしで、最後まで進める', 'btn btn-secondary');
    b.type = 'button';
    b.addEventListener('click', () => {
        localStorage.setItem(エージェント自動の鍵, 自動 ? '0' : '1');
        showNotification?.(自動 ? '確認してから進めるようにしました' : '確認なしで最後まで進めるようにしました', 'success');
        renderエージェント設定();
    });
    箱.appendChild(b);
}

window.エージェントは自動で進めるか = エージェントは自動で進めるか;
window.renderエージェント設定 = renderエージェント設定;
