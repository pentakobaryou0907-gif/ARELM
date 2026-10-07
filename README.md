# ARELM 社内専用作業ツール

過去のファッション制作情報をまとめ、**搭載AIと連携**する社内ハブです。  
（Base44型の **API Gateway** で公式APIのみ安全に利用）

## 三端末（Mac / Windows / iPad）で使う

いま OneDrive の `AIツール開発プロジェクト\README.md` を開いている場合、それは**メモ用**です。アプリ本体ではありません。

| 端末 | ホーム画面への置き方 | 開き方 |
|------|----------------------|--------|
| **Mac** | `三端末に置く.command` または `ホーム画面に置く.command` | デスクトップの **AReGLM.app** |
| **Windows** | `AReGLMをホーム画面に置く.bat` | デスクトップの **AReGLM** |
| **iPad** | Safari で開く → 共有 → **ホーム画面に追加** | ホーム画面の **AReGLM** |

詳しい手順は `三端末に置く.txt` を見てください。  
ブランチ: https://github.com/pentakobaryou0907-gif/ARELM/tree/cursor/three-devices-home-1936

### Windows（ZIP）

1. GitHub ログイン済みで **Code → Download ZIP**（上のブランチ）
2. `OneDrive\デスクトップ\AReGLM\ツール本体\` へ解凍
3. `AReGLMをホーム画面に置く.bat` を開く

### iPad（要点）

1. Mac と iPad に Tailscale（同じアカウント）
2. Mac の設定 → 他の端末 → Tailscale を入
3. Safari で表示された `https://100.x.x.x:8443` を開く → ホーム画面に追加

## 起動方法（重要）

```bash
cd "/Users/ari/Desktop/AReGLM/web/社内専用サービス/server"
npm install
npm start
```

→ **http://localhost:8080** を開く（`python3 -m http.server` だけでは AI・SUZURI は動きません）

ログイン: `admin` / `Admin@2024!`

## 登録するAPIキー（公式のみ。Grok / Claude は従量課金）

| 種類 | 取得先 |
|------|--------|
| **Gemini**（必須） | https://aistudio.google.com/apikey |
| **Groq**（任意） | https://console.groq.com/keys |
| **Grok / xAI**（任意・従量課金） | https://console.x.ai/ |
| **Hugging Face**（画像・任意） | https://huggingface.co/settings/tokens |
| **SUZURI**（在庫・開発） | https://suzuri.jp/developer |
| **Instagram / Facebook / TikTok / YouTube** | 各公式開発者コンソール |
| **Google Client ID**（写真・任意） | Google Cloud Console |

設定（⚙）で入力 → **暗号化保存**。劣るAPIは自動除外。

## 4つの機能 + 商品開発

1. **AIチャット** — ChatGPT風1画面（会話・分析・学習・制作・画像・モック・TP）
2. **ブランドハブ** — ロゴ・国・ジャンル・AI調査
3. **SNS** — [@areglm](https://www.instagram.com/areglm/) 等4公式アカウント連携
4. **在庫・売上** — [suzuri.jp/areglm](https://suzuri.jp/areglm) の商品のみ
5. **商品開発** — SUZURI公式APIでグッズ作成 → 在庫へ同期

## 販売先

**SUZURIのみ:** https://suzuri.jp/areglm（他ECは使用しません）

## セキュリティ

- 犯罪・違法コンテンツは拒否
- APIキーはブラウザ内暗号化 + Gateway経由で外部送信
- 非公式APIは不使用

## 全自動モード

ホームの「全自動」ON + ヘッダー「↻」で SUZURI同期 · SNS宣伝 · AIニュース を実行
