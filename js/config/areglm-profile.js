/** ARELM 公式アカウント・ショップ */
const AREGLM_PROFILE = {
    brand: 'ARELM',
    suzuriShop: 'https://suzuri.jp/areglm',
    suzuriShopName: 'areglm',
    shops: {
        suzuri: { name: 'SUZURI', url: 'https://suzuri.jp/areglm' },
        base: { name: 'BASE', url: 'https://AReGLM.base.shop' }
    },
    sns: {
        instagram: {
            name: 'Instagram',
            url: 'https://www.instagram.com/areglm/',
            handle: '@areglm',
            apiId: 'instagram'
        },
        facebook: {
            name: 'Facebook',
            url: 'https://www.facebook.com/profile.php?id=61577637205103&locale=ja_JP',
            handle: 'ARELM',
            apiId: 'facebook'
        },
        tiktok: {
            name: 'TikTok',
            url: 'https://www.tiktok.com/@areglm.jp',
            handle: '@areglm.jp',
            apiId: 'tiktok'
        },
        youtube: {
            name: 'YouTube',
            url: 'https://www.youtube.com/@areglm',
            handle: '@areglm',
            apiId: 'youtube'
        }
    }
};

// SNSの媒体一覧は、以前はここに書いたものが全てだった。
// Instagram/Facebook/TikTok/YouTube 以外を使いたいときに、
// コードを直すしかなかった（設定画面から増やせなかった）。
// この端末の中に保存して、設定画面から追加・削除できるようにする。
(function () {
    try {
        const 保存済み = localStorage.getItem('areglm_sns_platforms');
        if (保存済み) {
            AREGLM_PROFILE.sns = JSON.parse(保存済み);
        } else {
            // 初回だけ、もとの4つを保存しておく（次回からはこちらが正）
            localStorage.setItem('areglm_sns_platforms', JSON.stringify(AREGLM_PROFILE.sns));
        }
    } catch {
        // 読めなくても、上のもとの4つのままで動く
    }
})();

/** SNSの媒体一覧を保存する（設定画面の追加・編集・削除から呼ぶ） */
function SNS媒体を保存する(sns) {
    AREGLM_PROFILE.sns = sns;
    try {
        localStorage.setItem('areglm_sns_platforms', JSON.stringify(sns));
    } catch {
        /* 保存できなくても、この端末を使っている間は反映されている */
    }
}
window.SNS媒体を保存する = SNS媒体を保存する;

window.AREGLM_PROFILE = AREGLM_PROFILE;
