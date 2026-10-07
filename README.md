# ARELM 社内専用作業ツール

過去のファッション制作情報をまとめ、**搭載AIと連携**する社内ハブです。  
（Base44型の **API Gateway** で公式APIのみ安全に利用）

## Windows にアプリを置く（メモの README ではない）

いま OneDrive の `AIツール開発プロジェクト\README.md` を開いている場合、それは**メモ用**です。アプリ本体ではありません。

1. GitHub にログインした状態で、このブランチの ZIP を落とす:  
   https://github.com/pentakobaryou0907-gif/ARELM/tree/cursor/windows-on-main-1936  
   （緑の **Code → Download ZIP**）
2. 解凍した中身を `OneDrive\デスクトップ\AReGLM\ツール本体\` へ入れる
3. `ツール本体\AReGLMをホーム画面に置く.bat` を開く → デスクトップに **AReGLM** ができる

リポジトリは非公開のため、ログインなしの `irm` は動きません。Git がある場合:

```powershell
$dest = "$env:USERPROFILE\OneDrive\デスクトップ\AReGLM\ツール本体"
git clone --branch cursor/windows-on-main-1936 --single-branch https://github.com/pentakobaryou0907-gif/ARELM.git $dest
& "$dest\AReGLMをホーム画面に置く.bat"
```

## 起動方法（重要）

```bash
cd "/Users/ari/Desktop/AReGLM/web/社内専用サービス/server"
npm install
npm start
```

→ **http://localhost:8080** を開く（`python3 -m http.server` だけでは AI・SUZURI は動きません）

ログイン: `admin` / `Admin@2024!`

## 登録するAPIキー（すべて公式・無料）

| 種類 | 取得先 |
|------|--------|
| **Gemini**（必須） | https://aistudio.google.com/apikey |
| **Groq**（任意） | https://console.groq.com/keys |
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
