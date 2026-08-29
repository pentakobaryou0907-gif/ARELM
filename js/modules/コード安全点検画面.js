/**
 * コードの安全点検の画面
 *
 * 押すと、このツール自身のコードだけを見て、疑わしい箇所を一覧にする。
 * 「見つけたもの」ごとに、この端末のAIに直し方を聞くこともできる
 * （聞く内容は、その箇所のコードの一部だけ。外部へは出さない）。
 */

let 直近の点検結果 = null;

function 円かっこ付き(n) {
    return n ? `（${n}）` : '';
}

async function 点検を実行する() {
    const ボタン = document.getElementById('security-scan-run');
    const 箱 = document.getElementById('security-scan-result');
    if (ボタン) { ボタン.disabled = true; ボタン.textContent = '見ています…'; }
    if (箱) 箱.innerHTML = '<p class="hint">このツール自身のコードだけを見ています…</p>';

    try {
        const r = await fetch('/api/security-scan').then((x) => x.json());
        直近の点検結果 = r;
        render点検結果(r);
        if (window.logActivity) {
            logActivity(`コードの安全点検（${r.見つかった数}件）`, { category: 'security' });
        }
    } catch (e) {
        if (箱) {
            箱.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'guard-off';
            p.textContent = `点検できませんでした: ${e.message}`;
            箱.appendChild(p);
        }
    } finally {
        if (ボタン) { ボタン.disabled = false; ボタン.textContent = '点検する'; }
    }
}

function render点検結果(r) {
    const 箱 = document.getElementById('security-scan-result');
    if (!箱) return;
    箱.innerHTML = '';

    const 要点 = document.createElement('p');
    要点.className = r.見つかった数 ? 'guard-off' : 'guard-on';
    要点.textContent = `${r.見た数}ファイルを見て、${r.見つかった数}件の疑わしい箇所が見つかりました`
        + `（${new Date(r.点検した日).toLocaleString('ja-JP')}）`;
    箱.appendChild(要点);

    箱.appendChild((() => {
        const p = document.createElement('p');
        p.className = 'notice-strict';
        p.textContent = 'これはパターン一致による目安です。見つかった箇所が必ず問題というわけではありません。'
            + '実際に直すかどうかは、コードを読んで判断してください。';
        return p;
    })());

    if (!r.見つかった数) return;

    r.ファイルごと.forEach((f) => {
        const 節 = document.createElement('details');
        節.className = 'security-file';
        節.open = true;

        const 見出し = document.createElement('summary');
        見出し.textContent = `${f.道} ${円かっこ付き(f.件数 + '件')}`;
        節.appendChild(見出し);

        f.見つかった.forEach((x, i) => {
            const 行 = document.createElement('div');
            行.className = `security-finding sev-${x.重さ}`;

            const 頭 = document.createElement('div');
            頭.className = 'security-finding-head';
            const 重さ札 = document.createElement('span');
            重さ札.className = 'security-sev';
            重さ札.textContent = x.重さ;
            const 名 = document.createElement('b');
            名.textContent = x.名;
            const 位置 = document.createElement('small');
            位置.textContent = `L${x.行番号}`;
            頭.appendChild(重さ札);
            頭.appendChild(名);
            頭.appendChild(位置);
            行.appendChild(頭);

            const コード = document.createElement('pre');
            コード.className = 'security-snippet';
            コード.textContent = x.行の中身;
            行.appendChild(コード);

            const 説明 = document.createElement('p');
            説明.className = 'hint';
            説明.textContent = x.説;
            行.appendChild(説明);

            const 直し = document.createElement('p');
            直し.className = 'hint';
            直し.innerHTML = `<b>直し方の目安:</b> `;
            直し.appendChild(document.createTextNode(x.直し方));
            行.appendChild(直し);

            const AI欄 = document.createElement('div');
            AI欄.className = 'security-ai';
            const AIボタン = document.createElement('button');
            AIボタン.type = 'button';
            AIボタン.className = 'btn btn-sm btn-secondary';
            AIボタン.textContent = 'この箇所の直し方をAIに聞く';
            AIボタン.addEventListener('click', () => AIに聞く(f.道, x, AI欄, AIボタン));
            AI欄.appendChild(AIボタン);
            行.appendChild(AI欄);

            節.appendChild(行);
        });

        箱.appendChild(節);
    });
}

/**
 * 見つかった1箇所について、直し方をこの端末のAIに聞く。
 *
 * 渡すのは、その1行の中身と、決めておいた説明文だけ。
 * ファイル全体もプロジェクト全体も渡さない。
 */
async function AIに聞く(ファイル, x, 欄, ボタン) {
    ボタン.disabled = true;
    ボタン.textContent = '聞いています…';

    const 既存の答え = 欄.querySelector('.security-ai-answer');
    if (既存の答え) 既存の答え.remove();

    const 頼み = `次のコードの一部に、静的解析で「${x.名}」の疑いが見つかりました。\n\n`
        + `ファイル: ${ファイル}（${x.行番号}行目）\n`
        + `コード: ${x.行の中身}\n\n`
        + `懸念点: ${x.説}\n\n`
        + `このコードが実際に危ういかどうかを判断した上で、`
        + `危ういと思う場合だけ、安全な直し方（修正案のコード）を短く示してください。`
        + `攻撃の手順は書かず、防御・修正の観点だけで答えてください。`;

    try {
        // 通常の会話窓口（/api/ai-local/chat）は在庫・SNS等の話題分類を
        // 通ってしまい、コードの話をしても見当違いの業務回答が返ってきた。
        // ここは分類を挟まず、ローカルLLMに直接聞く専用の入口を使う。
        const r = await fetch('/api/ai-local/code-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 頼み }),
        }).then((x) => x.json());

        const 枠 = document.createElement('div');
        枠.className = 'security-ai-answer bubble-text';
        枠.style.whiteSpace = 'pre-wrap';
        枠.textContent = r.answer || '答えが空でした。';
        if (r.ok === false) 枠.className += ' hint';
        欄.appendChild(枠);
    } catch (e) {
        const p = document.createElement('p');
        p.className = 'guard-off security-ai-answer';
        p.textContent = `聞けませんでした: ${e.message}`;
        欄.appendChild(p);
    } finally {
        ボタン.disabled = false;
        ボタン.textContent = 'この箇所の直し方をAIに聞く';
    }
}

function initコード安全点検() {
    const ボタン = document.getElementById('security-scan-run');
    if (!ボタン || ボタン.dataset.配線済み) return;
    ボタン.dataset.配線済み = '1';
    ボタン.addEventListener('click', 点検を実行する);
}

window.initコード安全点検 = initコード安全点検;
