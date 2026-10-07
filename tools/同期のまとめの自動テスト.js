/**
 * 同期のまとめ（id ごとの統合）が期待どおりか
 * 使い方: node tools/同期のまとめの自動テスト.js
 */
const assert = require('assert');
const { まとめる, 文字でまとめる, 同じか } = require('../server/同期のまとめ');

let 失敗 = 0;
function 試す(名, fn) {
    try {
        fn();
        console.log('  ✓', 名);
    } catch (e) {
        失敗 += 1;
        console.log('  ✗', 名, '—', e.message);
    }
}

console.log('同期のまとめの自動テスト');

試す('同じ中身ならそのまま', () => {
    const a = [{ id: 1, title: 'A' }];
    assert.strictEqual(まとめる(a, a, a, { ぶつかった: [], 外した: [] }), a);
});

試す('片方で足したタスクが両方残る', () => {
    const base = [{ id: 't1', title: '元', done: false }];
    const server = [{ id: 't1', title: '元', done: false }, { id: 't2', title: 'Macで足した', done: false }];
    const client = [{ id: 't1', title: '元', done: false }, { id: 't3', title: 'iPadで足した', done: false }];
    const 記録 = { ぶつかった: [], 外した: [] };
    const 出 = まとめる(base, server, client, 記録);
    assert.strictEqual(出.length, 3);
    assert.ok(出.find((x) => x.id === 't2'));
    assert.ok(出.find((x) => x.id === 't3'));
});

試す('片方で完了・片方で題名変更が両方残る', () => {
    const base = [{ id: 't1', title: '買う', done: false }];
    const server = [{ id: 't1', title: '買う', done: true }];
    const client = [{ id: 't1', title: '牛乳を買う', done: false }];
    const 記録 = { ぶつかった: [], 外した: [] };
    const 出 = まとめる(base, server, client, 記録);
    assert.strictEqual(出.length, 1);
    assert.strictEqual(出[0].title, '牛乳を買う');
    assert.strictEqual(出[0].done, true);
    assert.strictEqual(記録.ぶつかった.length, 0);
});

試す('同じ欄を両方で直したら届いた方を採り、もう片方は記録に残る', () => {
    const base = [{ id: 't1', title: '買う' }];
    const server = [{ id: 't1', title: 'パンを買う' }];
    const client = [{ id: 't1', title: '牛乳を買う' }];
    const 記録 = { ぶつかった: [], 外した: [] };
    const 出 = まとめる(base, server, client, 記録);
    assert.strictEqual(出[0].title, '牛乳を買う');
    assert.strictEqual(記録.ぶつかった.length, 1);
});

試す('片方で外したものは外れる（もう片方で直していなければ）', () => {
    const base = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
    const server = [{ id: 't1', title: 'A' }];
    const client = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
    const 記録 = { ぶつかった: [], 外した: [] };
    const 出 = まとめる(base, server, client, 記録);
    assert.strictEqual(出.length, 1);
    assert.strictEqual(出[0].id, 't1');
    // 端末側が元のままなら、サーバー側の「外した」結果がそのまま残る
});

試す('端末側で外したものは外れる（サーバーが直していなければ）', () => {
    const base = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
    const server = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
    const client = [{ id: 't1', title: 'A' }];
    const 記録 = { ぶつかった: [], 外した: [] };
    const 出 = まとめる(base, server, client, 記録);
    assert.strictEqual(出.length, 1);
    assert.strictEqual(出[0].id, 't1');
});

試す('サーバーで直した項目を残しつつ、端末で外したものは外れる', () => {
    const base = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
    const server = [{ id: 't1', title: 'サーバーで直した' }, { id: 't2', title: 'B' }];
    const client = [{ id: 't1', title: 'A' }];
    const 記録 = { ぶつかった: [], 外した: [] };
    const 出 = まとめる(base, server, client, 記録);
    assert.strictEqual(出.length, 1);
    assert.strictEqual(出[0].title, 'サーバーで直した');
    assert.strictEqual(記録.外した.length, 1);
});

試す('外した側と直した側がぶつかったら、直した方を残す', () => {
    const base = [{ id: 't1', title: 'A' }];
    const server = [];
    const client = [{ id: 't1', title: '直したA' }];
    const 記録 = { ぶつかった: [], 外した: [] };
    const 出 = まとめる(base, server, client, 記録);
    assert.strictEqual(出.length, 1);
    assert.strictEqual(出[0].title, '直したA');
});

試す('元の版が無いときは外さず足すだけ', () => {
    const server = [{ id: 't1', title: 'サーバー' }];
    const client = [{ id: 't2', title: '端末' }];
    const 記録 = { ぶつかった: [], 外した: [] };
    const 出 = まとめる(undefined, server, client, 記録);
    assert.strictEqual(出.length, 2);
});

試す('文字のまままとめても同じ', () => {
    const base = JSON.stringify([{ id: 1, title: 'a', done: false }]);
    const server = JSON.stringify([{ id: 1, title: 'a', done: true }, { id: 2, title: 'b' }]);
    const client = JSON.stringify([{ id: 1, title: 'aa', done: false }]);
    const 出 = 文字でまとめる(base, server, client);
    const 中 = JSON.parse(出.値);
    assert.strictEqual(中.length, 2);
    assert.strictEqual(中.find((x) => x.id === 1).title, 'aa');
    assert.strictEqual(中.find((x) => x.id === 1).done, true);
    assert.ok(出.変わった);
});

試す('同じか: 鍵の順番が違っても同じ', () => {
    assert.ok(同じか({ a: 1, b: 2 }, { b: 2, a: 1 }));
});

if (失敗) {
    console.log(`結果: ${失敗} 件が期待と違います`);
    process.exit(1);
}
console.log(`結果: ${11 - 失敗}/11 件が期待どおり`);
