#!/usr/bin/env node
/**
 * 門番の自動テスト — 悪いつもりの送り方で、実際に断られるかを確かめる。
 *
 *   node tools/門番の自動テスト.js
 *
 * 動いているサーバー（8080）と自作AI（8765）に、この端末から送る。
 * どれも読むだけ・断られるはずのもので、データは書き換えない
 * （通ってしまったときに害が出ないよう、中身の無い送り方にしてある）。
 */
const http = require('http');

function 送る(port, path, { method = 'GET', headers = {}, body = '' } = {}) {
    return new Promise((resolve) => {
        const req = http.request({ host: '127.0.0.1', port, path: encodeURI(path), method, headers, timeout: 8000 }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
        });
        req.on('timeout', () => { req.destroy(); resolve(0); });
        req.on('error', () => resolve(0));
        if (body) req.write(body);
        req.end();
    });
}

const よそ = { Origin: 'https://evil.example.com' };
const 中継 = { 'X-Forwarded-For': '100.101.2.3', 'Tailscale-User-Login': 'someone@example.com' };
const フォーム = { 'Content-Type': 'application/x-www-form-urlencoded' };

const 試すもの = [
    ['この端末からの health は通る', 8080, '/api/health', {}, 200],
    ['よその名前（DNS rebinding）で同期の中身を読めない', 8080, '/api/sync/all', { headers: { Host: 'evil.example.com:8080' } }, 403],
    ['よそのサイトのフォームでパソコンを操れない', 8080, '/api/computer/type', { method: 'POST', headers: { ...よそ, ...フォーム }, body: 'x=1' }, 403],
    ['よそのサイトから最新にさせられない', 8080, '/api/self-update', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
    ['Origin: null（ファイルや隔離された枠）から書き換えられない', 8080, '/api/sync/push', { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json' }, body: '{}' }, 403],
    ['よそのサイトから text/plain で同期を書き換えられない', 8080, '/api/sync/push', { method: 'POST', headers: { ...よそ, 'Content-Type': 'text/plain' }, body: '{}' }, 403],
    ['tailscale serve の中継は「この端末」扱いにならない', 8080, '/api/sync/all', { headers: 中継 }, [401, 403]],
    ['中継の印だけで中継元が無いものは外として断る', 8080, '/api/health', { headers: { 'Tailscale-User-Login': 'x' } }, 403],
    ['インターネットの住所を名乗る中継は断る', 8080, '/api/health', { headers: { 'X-Forwarded-For': '8.8.8.8' } }, 403],
    ['中継経由で他の端末の設定を変えられない', 8080, '/api/other-devices', { method: 'POST', headers: { ...中継, 'Content-Type': 'application/json' }, body: '{}' }, 403],
    ['中継経由で覚えた知識を忘れさせられない', 8080, '/api/ai-local/knowledge/forget', { method: 'POST', headers: { ...中継, 'Content-Type': 'application/json' }, body: '{}' }, [401, 403]],
    ['シートの中継は消す操作を通さない', 8080, '/api/sheets-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Google-Access-Token': 'x' }, body: JSON.stringify({ method: 'POST', path: '/v4/spreadsheets/abc:batchUpdate' }) }, 400],
    ['SwitchBot の解錠は確認なしでは通らない', 8080, '/api/switchbot/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: 'abc', command: 'unlock' }) }, [401, 403]],
    ['自作AIはよそのサイトから直接書き換えられない', 8765, '/forget', { method: 'POST', headers: { ...よそ, 'Content-Type': 'text/plain' }, body: '{}' }, 403],
    ['自作AIはよその名前で読めない', 8765, '/health', { headers: { Host: 'evil.example.com:8765' } }, 403],
    ['自作AIはこの端末からは通る', 8765, '/health', {}, 200],
];

(async () => {
    let 失敗 = 0;
    let 飛ばした = 0;
    for (const [名, port, path, 送り方, 期待] of 試すもの) {
        const 結果 = await 送る(port, path, 送り方);
        if (結果 === 0) { 飛ばした++; console.log(`  －  ${名}（${port}番が動いていません）`); continue; }
        const 合う = Array.isArray(期待) ? 期待.includes(結果) : 結果 === 期待;
        if (!合う) 失敗++;
        console.log(`  ${合う ? '✓' : '✗'}  ${名}（${結果}${合う ? '' : `、期待 ${期待}`}）`);
    }
    const 数 = 試すもの.length - 飛ばした;
    console.log(`結果: ${数 - 失敗}/${数} 件が期待どおり${飛ばした ? `（${飛ばした}件はサーバーが止まっていて未確認）` : ''}`);
    process.exit(失敗 ? 1 : 0);
})();
