/**
 * 競合ブランド調査データ（自作Djangoアプリ brand_project より移植）
 * インフルエンサー系ストリートブランドを中心とした12件。
 * 「競合ブランドを読み込む」ボタンから localStorage の brands へ取り込む。
 * 外部APIは使わず、この端末内のデータのみで完結する。
 */
const AReGLM_COMPETITOR_BRANDS_SEED = [
    { name: 'UNDERCOVER（アンダーカバー）', description: 'UNDERCOVER（アンダーカバー）は、日本のファッションブランドであり、デザイナー高橋盾（たかはし じゅん）によって1990年に設立されました。ストリートファッションとハイファッションの要素を融合させた独自のデザインが特徴で、国内外で高い評価を受けている', url: 'https://undercoverism.com/', category: 'ストリート', country: '日本', price: 'ハイブランド' },
    { name: 'SOUAIRE（ソアール）', description: 'SOUAIREは、洗練されたスタイルと高品質な素材を組み合わせた日本のアパレルブランド。ファッショントレンドにとらわれず、独自のアイデンティティを追求し、個性とエレガンスを表現する洋服を提供している。ユニセックスのアイテムにも力を入れている。', url: 'https://souaire.jp/', category: 'アパレル', country: '日本', price: 'ミドル' },
    { name: 'muguet（ミュゲ）', description: 'muguetは、インフルエンサーのなみさんがディレクターを務めるブランド。あざとフェミニンなコーディネートが特徴で、淡いピンクやアイボリーのアイテムを中心に、20代後半の女性に人気。', url: 'https://muguetofficial.store/', category: 'アパレル', country: '日本', price: 'ミドル' },
    { name: 'Alia（アリア）', description: 'Aliaは、小林花織さんと石原美耶さんがディレクターを務めるブランドで、20代後半の女性に人気。使いまわしがしやすいアイテムが多く、きれいめなデザインが特徴。', url: 'https://alia-jp.myshopify.com/', category: 'アパレル', country: '日本', price: 'ミドル' },
    { name: 'Acka（アッカ）', description: 'Ackaは、kitakaze asukaさんがディレクターを務めるブランド。一癖ある淡色コーデを提案しており、個性的なデザインが特徴。', url: 'https://acka.shop/', category: 'ストリート', country: '日本', price: 'ミドル' },
    { name: 'mideal（ミディアル）', description: 'midealは、みなまつさんがディレクターを務めるブランドで、もう一歩大人になりたい20〜30代の女性に評判。女性らしいシルエットで、大人っぽく見せたい人におすすめ。', url: 'https://store.favclo.jp/pages/mideal', category: 'アパレル', country: '日本', price: 'ミドル' },
    { name: 'remer（リメル）', description: 'remerは、Jun yohukasiさんがディレクターを務めるブランドで、シンプルでルーズなシルエットのアイテムが人気。新感覚のシンプルメンズファッションブランドで、モノトーンが好きな人におすすめ。', url: 'https://www.remer-store.com/', category: 'ストリート', country: '日本', price: 'ミドル' },
    { name: 'KUUUPY（クーピー）', description: 'KUUUPYは、ぴたんさんがディレクターを務めるブランドで、シンプルながらもトレンドを抑えたアイテムや個性のあるデザインが特徴。他の人と被りたくない人におすすめ。', url: 'https://www.instagram.com/kuuupy_official/', category: 'ストリート', country: '日本', price: 'ミドル' },
    { name: 'CLESSTE（クレステ）', description: 'CLESSTEは、髙島涼さんがディレクターを務めるブランドで、「現代ファッションのネガティブな視点をポジティブに変える」というテーマのもと、SDGsや日本の伝統工芸にも目を向けている。受注生産・適量生産。', url: 'https://clesste.com/', category: 'アパレル', country: '日本', price: 'ミドル' },
    { name: 'y/m（ワイエム）', description: 'y/mは、10名以上のインフルエンサーがそれぞれアイテムを展開するブランド。シンプルなアイテムから個性的なアイテムまで幅広く取り揃えている。', url: 'https://ym-official.jp/', category: 'アパレル', country: '日本', price: 'ミドル' },
    { name: 'DOOPZ（ドープス）', description: 'DOOPZは、とっしーさんがディレクターを務めるブランドで、シンプルで着回しのしやすいアイテムが多く、手の出しやすい価格帯が特徴。トレンドを取り入れた質の高いアイテムが多い。', url: 'https://www.instagram.com/doopz_jp/', category: 'ストリート', country: '日本', price: 'プチプラ' },
    { name: 'Èaphi（エアフィ）', description: 'Èaphiは、神﨑蓮音さんがディレクターを務めるブランドで、トレンドを抑えつつも他の人と被らないユニークなデザインが特徴。レイヤードで着こなすことでさらにおしゃれを楽しめる。', url: 'https://eaphi.co.jp/', category: 'ストリート', country: '日本', price: 'ミドル' }
];

function importCompetitorBrands() {
    const brands = JSON.parse(localStorage.getItem('brands') || '[]');
    const existingNames = new Set(brands.map((b) => b.name));
    let added = 0;

    AReGLM_COMPETITOR_BRANDS_SEED.forEach((seed) => {
        if (existingNames.has(seed.name)) return;
        brands.push({
            ...seed,
            id: Date.now() + added,
            tags: ['競合調査'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        added += 1;
    });

    localStorage.setItem('brands', JSON.stringify(brands));
    if (typeof refreshBrands === 'function') refreshBrands();
    if (window.logActivity) {
        logActivity(`競合ブランドを${added}件読み込みました`, { category: 'brands', text: '競合ブランド調査 読み込み' });
    }
    showNotification(added ? `競合ブランド${added}件を追加しました` : '追加できる新規データはありませんでした（既に登録済み）', added ? 'success' : 'info');
}

window.importCompetitorBrands = importCompetitorBrands;
