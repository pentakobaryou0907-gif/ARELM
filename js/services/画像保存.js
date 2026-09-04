/**
 * 画像保存 ― チャットの画像を、localStorageの外に置く
 *
 * なぜこれが要るのか:
 *
 *   これまで、チャットの画像（base64）を会話の履歴と同じ localStorage に
 *   直接入れていた。localStorage は容量が小さい（多くのブラウザで5〜10MB）。
 *
 *   画像が2〜3枚たまるだけで上限に触れ、保存（setItem）がエラーで失敗する。
 *   しかもそこに try/catch が無かったため、失敗が静かに握りつぶされ、
 *   「名前の文字だけが残り、画像本体だけが消える」という壊れ方をしていた。
 *
 *   IndexedDB は同じ「この端末の中だけ」の保存先だが、
 *   容量がずっと大きい（数十MB〜、ブラウザやディスクの空きによる）。
 *   画像の本体はこちらに置き、会話の履歴には「どの画像か」の
 *   短い番号（id）だけを持たせる。
 *
 * 外部へは一切送らない。ブラウザの中だけで完結する。
 */

const DB名 = 'areglm_images';
const ストア名 = 'images';

let DBの約束 = null;

function DBを開く() {
    if (DBの約束) return DBの約束;
    DBの約束 = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('この端末ではIndexedDBが使えません'));
            return;
        }
        const 要求 = indexedDB.open(DB名, 1);
        要求.onupgradeneeded = () => {
            if (!要求.result.objectStoreNames.contains(ストア名)) {
                要求.result.createObjectStore(ストア名);
            }
        };
        要求.onsuccess = () => resolve(要求.result);
        要求.onerror = () => reject(要求.error);
    });
    return DBの約束;
}

/**
 * 画像（data URL）を保存し、後で引ける番号を返す。
 *
 * js/modules/camera.js にも同名の関数（撮った写真をこの端末へ保存する、
 * 引数なし・ボタン直結）があり、どちらもトップレベルのグローバル関数
 * だったため、名前だけを見ると衝突していた。呼び出す側は必ず
 * AReGLM_IMAGES.画像を保存する(...) の形で使っているため実害は無かったが、
 * 素の名前も分けておく（外から見える名前 AReGLM_IMAGES.画像を保存する は
 * そのまま変えない）。
 */
async function 画像データを保存する(dataUrl) {
    const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const db = await DBを開く();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(ストア名, 'readwrite');
        tx.objectStore(ストア名).put(dataUrl, id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
    return id;
}

/** 番号から、画像（data URL）を読む。無ければ null */
async function 画像を読む(id) {
    if (!id) return null;
    try {
        const db = await DBを開く();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(ストア名, 'readonly');
            const 要求 = tx.objectStore(ストア名).get(id);
            要求.onsuccess = () => resolve(要求.result || null);
            要求.onerror = () => reject(要求.error);
        });
    } catch {
        return null;
    }
}

async function 画像を消す(id) {
    if (!id) return;
    try {
        const db = await DBを開く();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(ストア名, 'readwrite');
            tx.objectStore(ストア名).delete(id);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        /* 消せなくても、会話自体は続けられるようにする */
    }
}

window.AReGLM_IMAGES = { 画像を保存する: 画像データを保存する, 画像を読む, 画像を消す };
