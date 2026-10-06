# ARELM 社内専用作業ツール

過去のファッション制作情報をまとめ、**搭載AIと連携**する社内ハブです。  
（Base44型の **API Gateway** で公式APIのみ安全に利用）

## 起動方法（重要）

```bash
cd "/Users/ari/Desktop/AReGLM/web/社内専用サービス/server"
npm install
npm start
```

→ **http://localhost:8080** を開く（`python3 -m http.server` だけでは AI・SUZURI は動きません）

ログイン: `admin` / `Admin@2024!`

### Mac のデスクトップの AReGLM から開く

1. ツールのフォルダの `ホーム画面に置く.command` を一度だけダブルクリックする
   （初回は右クリック →「開く」。macOS が確認を出すため）
2. デスクトップと「アプリケーション」に新しい **AReGLM** ができる。押すとログイン画面が開く

前からある AReGLM は消さずに `~/Library/Application Support/AReGLM/使用済み/` へ移します。
フォルダを別の場所へ動かしたときは、もう一度 `ホーム画面に置く.command` を開いてください。

### デスクトップPC（Windows）のホーム画面から開く

1. Mac から同期されたツールのフォルダを開く（`ホーム画面に置く.bat` があることを確かめる）
2. `ホーム画面に置く.bat` を一度だけダブルクリックする
3. デスクトップにできた **AReGLM** を押すと、ログイン画面がアプリの窓で開く

一度置いたあとは、サインインのたびに見張りが裏で動き、アイコンが消えていれば置き直します。
Node.js（https://nodejs.org の LTS）が入っていないとサーバーが立ち上がりません。

## 必要なものをまとめて入れる（初回だけ）

| 端末 | 開くファイル | 入れるもの |
|------|------|------|
| Mac | `準備する.command`（右クリック →「開く」） | Xcode コマンドラインツール、Node.js LTS（公式配布・SHA-256 確認）、サーバーの部品、Python の部品、任意で faster-whisper・ffmpeg |
| Windows | `準備する.bat` | winget で Node.js LTS・Python 3.12・Git・Chrome、サーバーの部品、Python の部品、任意で faster-whisper・ffmpeg |

どちらも入れる前に y/N で確かめ、最後にデスクトップへ AReGLM を置きます。
揃っているかは、ツールの「設定」の一番上にある **準備の状態** でいつでも見られます。

自分で用意するもの（ツールは代わりに作りません）:

- GitHub のトークン（控え・作業ログ・ツールの更新）
- SwitchBot のトークンとシークレット（家電）
- SUZURI の API キー、Gemini の API キー（無料枠）
- 任意: Claude（有料）、Instagram・Facebook・TikTok・Google の公式開発者アカウント
- Mac と Windows の同期に Syncthing、外から開くなら Tailscale

### ログインしたら自動で起動（Mac）

`ホーム画面に置く.command` を開くと、`~/Library/LaunchAgents/jp.areglm.watcher.plist` も置き、ログインのたびに見張り（`見張り.sh`）が裏で立ち上がります。
ツールのフォルダがデスクトップ・書類・iCloud の中にあると macOS に読み込みを止められることがあるため、そのときは登録しません（`~/Developer/AReGLM` なら登録します）。

### iPhone・iPad から https で使う（Tailscale）

1. Mac と iPhone の両方で Tailscale に同じアカウントでログインする
2. Tailscale の管理画面（DNS）で MagicDNS と HTTPS Certificates を有効にする
3. `準備する.command` をもう一度開き、「Tailscale の中だけに https の入口を開きますか？」に y と答える（`tailscale serve --bg 8080`。インターネットには出ません）
4. AReGLM の 設定 →「他の端末」で「Tailscaleから使う」を入にし、合言葉を決める
5. iPhone で `https://<Macの名前>.<tailnet>.ts.net/` を開き、合言葉を入れる

https の入口を通った相手は「この端末」ではなく Tailscale の中の端末として扱うので、合言葉が要り、パソコンを操る・最新にする等の口は開きません。

### Googleスプレッドシートの進捗ログ

設定 →「Google連携」でログインしたあと、ホーム →「今日」の「Googleスプレッドシートに送る」を押すと、
進捗・投稿ログ・お金の記録のうちまだ送っていない分を、Googleドライブの「ARELM 進捗ログ」の表に足します（ブランド TUDURI・INTGLM の列つき）。行は足すだけで、消したり書き換えたりはしません。

### オフラインで読む

ツールの「まとめて取り出す」→「持ち歩ける控え（HTML）」で、やること・前回の続き・商品・お金・投稿ログ・メモを1つのファイルにします。
iPhone の「ファイル」などに入れておけば、サーバーもネットも無い所で読めます（読むだけ）。

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
