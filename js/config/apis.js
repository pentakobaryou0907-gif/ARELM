/**
 * ARELM — 公式・無料APIのみ
 */
const AReGLM_API_REGISTRY = {
    ai: {
        gemini: {
            name: 'Google Gemini',
            docs: 'https://aistudio.google.com/apikey',
            official: true,
            freeTier: true,
            qualityScore: 95,
            subRoles: ['chat', 'vision', 'url_analysis', 'image_gen', 'learn', 'mockup'],
            features: ['会話', '画像理解', 'URL分析', '学習', 'Imagen']
        },
        groq: {
            name: 'Groq',
            docs: 'https://console.groq.com/keys',
            official: true,
            freeTier: true,
            qualityScore: 85,
            subRoles: ['chat', 'learn'],
            features: ['会話', '高速']
        },
        grok: {
            name: 'Grok（xAI）',
            docs: 'https://console.x.ai/',
            official: true,
            freeTier: false,
            qualityScore: 92,
            subRoles: ['chat', 'learn', 'agent'],
            features: ['会話', '制作相談', 'エージェント']
        },
        huggingface: {
            name: 'Hugging Face',
            docs: 'https://huggingface.co/settings/tokens',
            official: true,
            freeTier: true,
            qualityScore: 78,
            subRoles: ['image_gen'],
            features: ['画像生成']
        },
        cloudflare_workers_ai: {
            name: 'Cloudflare Workers AI',
            docs: 'https://developers.cloudflare.com/workers-ai',
            official: true,
            freeTier: true,
            qualityScore: 72,
            subRoles: ['chat', 'image_gen'],
            features: ['会話', '画像']
        }
    },
    media: {
        google_picker: {
            name: 'Google Picker / Drive（写真選択）',
            docs: 'https://developers.google.com/drive/picker/guides/overview',
            official: true,
            freeTier: true,
            qualityScore: 90,
            subRoles: ['photos'],
            features: ['写真・資料選択'],
            settingKey: 'google_client_id'
        }
    },
    sns: {
        instagram: {
            name: 'Instagram Graph API',
            docs: 'https://developers.facebook.com/docs/instagram-api',
            official: true,
            freeTier: true,
            qualityScore: 90,
            profileUrl: 'https://www.instagram.com/areglm/',
            subRoles: ['publish'],
            features: ['投稿']
        },
        facebook: {
            name: 'Facebook Graph API',
            docs: 'https://developers.facebook.com/docs/graph-api',
            official: true,
            freeTier: true,
            qualityScore: 88,
            profileUrl: 'https://www.facebook.com/profile.php?id=61577637205103',
            subRoles: ['publish'],
            features: ['投稿']
        },
        tiktok: {
            name: 'TikTok for Developers',
            docs: 'https://developers.tiktok.com',
            official: true,
            freeTier: true,
            qualityScore: 86,
            profileUrl: 'https://www.tiktok.com/@areglm.jp',
            subRoles: ['publish'],
            features: ['投稿']
        },
        youtube: {
            name: 'YouTube Data API v3',
            docs: 'https://console.cloud.google.com',
            official: true,
            freeTier: true,
            qualityScore: 84,
            profileUrl: 'https://www.youtube.com/@areglm',
            subRoles: ['publish'],
            features: ['動画・分析']
        }
    },
    suzuri: {
        api: {
            name: 'SUZURI API',
            docs: 'https://suzuri.jp/developer/documentation/v1',
            shopUrl: 'https://suzuri.jp/areglm',
            official: true,
            freeTier: true,
            qualityScore: 100,
            subRoles: ['products', 'materials', 'inventory', 'publish'],
            features: ['商品CRUD', '素材', '在庫', '販売']
        }
    }
};

function getApiConfig() {
    try {
        return JSON.parse(localStorage.getItem('areglm_api_config') || '{}');
    } catch {
        return {};
    }
}

function saveApiConfig(config) {
    localStorage.setItem('areglm_api_config', JSON.stringify(config));
}

function isApiConfigured(cat, id) {
    return !!getApiConfig()[cat]?.[id]?.connected;
}

window.AReGLM_API_REGISTRY = AReGLM_API_REGISTRY;
window.getApiConfig = getApiConfig;
window.saveApiConfig = saveApiConfig;
window.isApiConfigured = isApiConfigured;
