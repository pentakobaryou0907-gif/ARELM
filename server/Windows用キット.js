/**
 * Windows PC用の起動アプリ（Windows用/）を、ZIPにして渡す
 *
 * なぜサーバーから渡すのか:
 *   Macのデスクトップにファイルを置いても、Windows PC側に自動では届かない
 *   （iCloud等の同期に頼ると、「何もない」状態になる）。
 *   Windows PCのブラウザで、このMacのアドレスを開けば、そこから直接受け取れるようにする。
 *
 * 接続先の一覧（ARELM-target.txt）は、受け取る瞬間のこのMacの名前と番号で作る。
 * 外部のライブラリは使わず、圧縮しないZIP（保存のみ）を自前で組み立てる。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const 元の場所 = path.join(__dirname, '..', 'Windows用');
const 入れるファイル = ['ARELM-install.bat', 'ARELM-open.bat', 'ARELM-uninstall.bat', 'ARELM-report.ps1', 'ARELM.ico', 'README.txt'];

function Macの名前() {
    try {
        const n = execFileSync('/usr/sbin/scutil', ['--get', 'LocalHostName'], { encoding: 'utf8', timeout: 3000 }).trim();
        if (/^[A-Za-z0-9-]+$/.test(n)) return n + '.local';
    } catch { /* 取れなければ番号だけ */ }
    return null;
}

function 接続先の一覧(ポート, 番号たち) {
    const 一覧 = [];
    const 名 = Macの名前();
    if (名) 一覧.push(`${名}:${ポート}`);
    番号たち.forEach((ip) => 一覧.push(`${ip}:${ポート}`));
    return 一覧.join('\r\n') + '\r\n';
}

function 日時(d = new Date()) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
}

/** 圧縮しないZIPを作る。名前はUTF-8。 */
function zipにする(項目たち) {
    const { time, date } = 日時();
    const 局所 = [];
    const 中央 = [];
    let 位置 = 0;

    項目たち.forEach(({ 名前, 中身 }) => {
        const 名 = Buffer.from(名前, 'utf8');
        const crc = zlib.crc32(中身) >>> 0;

        const h = Buffer.alloc(30);
        h.writeUInt32LE(0x04034b50, 0);
        h.writeUInt16LE(20, 4);
        h.writeUInt16LE(0x0800, 6);       // 名前はUTF-8
        h.writeUInt16LE(0, 8);            // 圧縮なし
        h.writeUInt16LE(time, 10);
        h.writeUInt16LE(date, 12);
        h.writeUInt32LE(crc, 14);
        h.writeUInt32LE(中身.length, 18);
        h.writeUInt32LE(中身.length, 22);
        h.writeUInt16LE(名.length, 26);
        h.writeUInt16LE(0, 28);
        局所.push(h, 名, 中身);

        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0);
        c.writeUInt16LE(20, 4);
        c.writeUInt16LE(20, 6);
        c.writeUInt16LE(0x0800, 8);
        c.writeUInt16LE(0, 10);
        c.writeUInt16LE(time, 12);
        c.writeUInt16LE(date, 14);
        c.writeUInt32LE(crc, 16);
        c.writeUInt32LE(中身.length, 20);
        c.writeUInt32LE(中身.length, 24);
        c.writeUInt16LE(名.length, 28);
        c.writeUInt32LE(位置, 42);
        中央.push(c, 名);

        位置 += 30 + 名.length + 中身.length;
    });

    const 中央の大きさ = 中央.reduce((a, b) => a + b.length, 0);
    const 終わり = Buffer.alloc(22);
    終わり.writeUInt32LE(0x06054b50, 0);
    終わり.writeUInt16LE(項目たち.length, 8);
    終わり.writeUInt16LE(項目たち.length, 10);
    終わり.writeUInt32LE(中央の大きさ, 12);
    終わり.writeUInt32LE(位置, 16);
    return Buffer.concat([...局所, ...中央, 終わり]);
}

function キットを作る(ポート, 番号たち, 報告の印 = '') {
    const 項目 = 入れるファイル.map((f) => ({
        名前: 'ARELM-Windows/' + f,
        中身: fs.readFileSync(path.join(元の場所, f)),
    }));
    項目.push({
        名前: 'ARELM-Windows/ARELM-target.txt',
        中身: Buffer.from(接続先の一覧(ポート, 番号たち), 'ascii'),
    });
    // 入れた場所を、ARELMへ報告するための使い捨ての印（このZIPだけのもの）
    項目.push({ 名前: 'ARELM-Windows/ARELM-report.txt', 中身: Buffer.from(String(報告の印 || ''), 'ascii') });
    return zipにする(項目);
}

module.exports = { キットを作る, Macの名前, zipにする };
