# ARELM 社内専用作業ツール

過去のファッション制作情報をまとめ、**搭載AIと連携**する社内ハブです。  
（Base44型の **API Gateway** で公式APIのみ安全に利用）

> **この README.md は説明文です。アプリではありません。**  
> Mac のホーム画面／デスクトップの自作アプリにするときは、ツールのフォルダで  
> **`ホーム画面に置く.command`** を一度開いてください → **AReGLM.app** ができます。  
> そのアプリを押すと、アプリツール画面（黒い枠の中に本編）が開きます。

## 起動方法（重要）

ふだんはデスクトップの **AReGLM** を押すだけです（見張りがサーバーと自作AIを起こし、落ちたら立て直します）。
手で起こすときは、ツールのフォルダ（例: `~/Applications/AReGLM.app/Contents/Resources/ツール本体`）で:

```bash
bash ./start_server.sh            # サーバー（8080）。部品が無ければ npm install もする
cd server/ai && python3 server.py # 自作AI（8765）
```

→ **http://127.0.0.1:8080** を開く（`python3 -m http.server` だけでは AI・SUZURI は動きません）

ログイン: `admin` / `Admin@2024!`

### Mac のデスクトップ／ホーム画面の AReGLM から開く

1. ツールのフォルダの **`ホーム画面に置く.command`** を一度だけダブルクリックする
   （初回は右クリック →「開く」。macOS が確認を出すため）
2. デスクトップと「アプリケーション」に新しい **AReGLM.app** ができる  
   ← これがホーム画面用の自作アプリです（`README.md` をアプリに変えたものではありません）
3. **AReGLM** を押すと、アプリツール画面（黒い枠の中に本編／ログイン）が開く

前からある AReGLM は消さずに `~/Library/Application Support/AReGLM/使用済み/` へ移します。
フォルダを別の場所へ動かしたときや、画面の枠を新しくしたいときは、もう一度 `ホーム画面に置く.command` を開いてください。

### デスクトップPC（Windows）のホーム画面から開く

**`README.md` は説明文です。アプリのアイコンにはなりません。**

Mac のホーム画面に **AReGLM.app** があるのと同じことを、Windows では次でやります。

| Mac | Windows（同じ役割） |
|------|------|
| `ホーム画面に置く.command` | **`AReGLMをホーム画面に置く.bat`** |
| デスクトップの **AReGLM.app** | デスクトップの **AReGLM**（アイコン付き） |
| 押すとアプリ枠が開く | 押すとアプリ枠が開く |

**手順（いちばんかんたん）**

1. Syncthing 等で同期された**ツールのフォルダ**を開く  
   （中に `見張り.ps1` と `server` フォルダがあること。`README.md` だけのフォルダではない）
2. **`AReGLMをホーム画面に置く.bat`** を一度ダブルクリックする
3. Windows のデスクトップ（ホーム画面）に **AReGLM** のアイコンができる
4. あとは Mac と同じく、そのアイコンを押すだけで開く

開く・置くを一度にやるなら **`AReGLM.bat`** でも同じです。  
サーバーが動くと、デスクトップにアイコンが無ければ自動でも置きます。

ツールのフォルダのファイルは、**デスクトップへ移さないでください**。隣の `server` を見失います。誤って置いた `.bat` は消さず「使用済み」へ移し、正しいアイコンに差し替えます。

一度置いたあとは、サインインのたびに見張りが裏で動き、落ちていれば約1分以内に立ち上がり直します。
Node.js（https://nodejs.org の LTS）が入っていないとサーバーが立ち上がりません。

#### Windows にアプリがどこにも無いとき

よくある取り違え:

| ここはアプリではない | ここがアプリ本体 |
|------|------|
| `OneDrive\デスクトップ\AReGLM\AIツール開発プロジェクト\README.md`（メモ用） | `C:\Users\<名前>\AReGLM\`（中に `見張り.ps1` と `server` がある） |

**PowerShell を開いて、次をそのまま貼り付けて Enter**（Git が入っていること）:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
irm https://raw.githubusercontent.com/pentakobaryou0907-gif/ARELM/cursor/windows-app-shell-1936/Windows%E3%81%AB%E3%82%A2%E3%83%97%E3%83%AA%E3%82%92%E5%85%A5%E3%82%8C%E3%82%8B.ps1 | iex
```

終わると `C:\Users\<名前>\AReGLM` に本体が入り、デスクトップに **AReGLM** アイコンができます。

#### Windows に新しい版が来ないとき（すでに本体がある場合）

`AReGLMをホーム画面に置く.bat` などは、取り込む前の `main` には入っていません。

1. Mac 側のツールのフォルダに新しいコードがあるか確かめる
2. Syncthing の同期を待つ（または上の PowerShell で入れる）
3. `AReGLMをホーム画面に置く.bat` をもう一度開く

ツールのフォルダがデスクトップ・書類・OneDrive の中にあると、自動起動は登録しません。`C:\Users\<名前>\AReGLM` なら登録します。

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

## 止まったとき・壊れたとき

| 症状 | 直し方 |
|------|------|
| 画面が開かない | `~/Library/Logs/AReGLM/見張り.log`・`server.log` を見る。`bash ./start_server.sh` を手で動かすと理由が出ます |
| 自作AIが止まっている | `cd server/ai && python3 server.py`。`./check.sh` の [6]・[6b] で確かめられます |
| 見張りが二重に動いている | `~/Library/Logs/AReGLM/見張り.lock/pid` の番号だけが本物。古い見張りは自分で終わります |
| 直したのに画面が変わらない | ホーム →「設定」の「自己点検と修復」で「点検する」→「まとめて直す」 |
| デスクトップの AReGLM が無い | `ホーム画面に置く.command`（Mac）／`ホーム画面に置く.bat`（Windows）をもう一度開く |
| コードの変更で壊れた | 設定 →「自己修正の安全装置」で、前の記録へ戻す（この Mac からだけ） |

## バックアップと復元

- 設定 →「データのバックアップ」で1つのファイルに書き出します（鍵は入りません）
- 復元は「消さない」: 今あるものは残し、無かったものだけ足します。バックアップの対象の項目以外は、ファイルに入っていても戻しません
- サーバー側にも毎日の控え（`server/data/snapshots/`）があります
- **復元訓練（月1回）**: 最新の控えを別の場所へ写し、中身が読めるかを自動で確かめます。設定の「復元訓練を今すぐ走る」でもできます
- 大きいデータはブラウザ内の IndexedDB へ移し、容量が近いときは知らせます。正はサーバーなので、iPhone の Safari がデータを消しても次に開くと戻ります
- Mac と iPad で同じ一覧を別々に直しても、id ごとにまとまります（後から書いた一覧で丸ごと消えない）
- ネットが無い所で見るだけなら「まとめて取り出す」→「持ち歩ける控え（HTML）」

## 合言葉を決め直す

- 他の端末（同じWi-Fi・Tailscale）から入るときの合言葉は、**本体の Mac の画面で** 設定 →「他の端末」から決め直します。外の端末からは変えられません
- 許した端末を全部忘れさせるのも同じ場所です（次からまた合言葉を聞きます）
- 合言葉はこのファイルにもコードにも書きません。忘れたときは本体の Mac で決め直してください

## 検査

```bash
./check.sh                         # 全部。変更のたびに実行する
cd tools && npm install && cd ..   # 初回だけ。画面の自動テストに使う puppeteer-core を入れる
node tools/画面の自動テスト.js --全部押す   # 全ページの全ボタンを押す（数分）
```

`check.sh` の [10] は、よそのサイト・よその名前（DNS rebinding）・tailscale serve の中継から送られたものが断られるかを、[11] はログイン・商品登録・やること・進捗・バックアップの復元を、実際の画面で確かめます。
画面のテストは空のブラウザで開き、サーバーへの書き込みと同期をテストの中で止めるので、本物のデータは変わりません。

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
