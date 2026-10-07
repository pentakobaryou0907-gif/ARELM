# ARELM — 開発する人・AI（Cursor / Claude Code など）への案内

一人で運営するアパレルブランドの作業ツール。利用者は本人1人。Mac・iPad・Windowsで使う。
構成: 画面（ビルドなしのJS: `index.html` と `js/`）／Node（`server/index.js`）／自作AI（Python: `server/ai/`）／ローカルLLM（Ollama）。

## 必ず守る（外すと、別の道具になる）
- **消さない。** 取り除くのではなく、移す（整理済み・見送り・永久の記憶）。データを空にする操作を、確認なしで置かない。
- **外へ送らない。** 外部通信は `js/core/外に出さない.js` と `server/ai/rules.py` の関所を通す。外部サービスは公式・無料のAPIだけ。非公式の自動操作・規約違反はしない。
- **SUZURIの「商品を公開する」ボタンは本人が押す。** お金が絡む操作は、必ず本人に確認する。
- **鍵・パスワード・合言葉を、コード・ログ・コミット・画面に書かない。** 固定の初期パスワードを作らない。本人のパスワードを、開発側が決めない。
- **「できた」と言う前に、動かして確かめる。** 確かめていないものは「未確認」と書く。失敗を成功と報告しない（手の実行結果は、必ず直接見る）。
- 直した不具合には、**なぜ壊れていたか**を、日本語のコメント1〜2行で残す（コードの説明は書かない）。

## 変更のたびに
1. `./check.sh` を実行し、**全項目OK**にする。
2. AI側（`server/ai/`）を触ったら `cd server/ai && python3 test_ai.py`（全件成功）。新しい技能や決まりには、表のテストを足す。
3. 画面を変えたら、実際に開いて確かめる（ログイン前の画面だけで済ませない）。

## 構造の要点
- **画面はビルドなし。** 新しいJSは `index.html` に `<script defer>` で足す。トップレベルの名前は、ページ全体で共有される。**同じ名前があると、ページ全体が止まる**（`check.sh` の [5a] が見つける）。`hidden` 属性は、CSSの `display` に負けることがある。
- **状態**: ブラウザの localStorage → `js/core/sync.js` → `server/data/sync_store.json`（端末間で同期）。端末ごとの値は、`sync.js` の除外キーに入れる。配列から外れた項目は、永久の記憶に残る（`server/永久の記憶.js`・`server/ai/永久の記憶.py`）。
- **エージェント**: 技能は `server/ai/skills.py`、会話は `chat_engine.py`、決まった段取りは `段取り.py`、一文の複数の頼みは `頼みを分ける.py`。実行は `js/modules/executor.js` と `agent-run.js`。**新しい技能は、`skills.py` と `executor.js` の両方に足し、`test_ai.py` に表を足す。**
- **認証**: `server/アカウント.js`（サーバー検証・指紋/Face ID・ログインなし）、`server/門番.js`（他の端末は合言葉）。
- **日本語のファイル名**: Syncthing が分解形（NFD）に戻すことがある。`server/ai/nfc_fix.py` が、起動時とテスト時に直す。

## 動かす・試す・再起動（ここでの失敗が多い）
- 開く: アプリのアイコン、または `http://localhost:8090`。**`8080` は、Cursor など別のアプリが 127.0.0.1 で先に持つことがあり、古い画面に当たる。**
- 再起動: ARELM本体は `kill $(lsof -nP -iTCP:8090 -sTCP:LISTEN -t | head -1)`（見張りが約6秒で立て直す）。AIは 8765 を同様に。**8080 を `lsof` で探して全部 kill しない（Cursor 等を巻き込む）。**
- 検証は、**本物のデータを汚さない別サーバー**で:
  `ARELM_DATA_DIR=… ARELM_ACCOUNTS_FILE=… ARELM_NOLOGIN_FILE=… ARELM_LOGIN_HINT_FILE=… ARELM_MEMORY_DIR=… ARELM_BACKUP_DIR=… PORT=8099 node server/index.js`
- 直したあと、AIエンジン（Python）は、再起動しないと古いコードのまま動く。

## 触らない・コミットしない・AIに渡さない
- `server/data/`（本人のデータ・アカウント・合言葉・学習データ）、`*.log`
- `server/certs/` の秘密鍵（いまはGitに入っている。Cursor等のクラウドのAIに渡さない）

## コミット
日本語で、**なぜ**を中心に書く。1つの変更を、小さく分ける。作業前に `git status` を見て、ほかの人・AIが作業中のファイルを上書きしない。

## 分担の目安（Cursor と Claude Code）
- **Cursor**: その場の小さな編集、見た目の調整、1〜2ファイルのリファクタ、コードの読み解き、質問。
- **Claude Code**: 複数ファイルにまたがる変更、テストの実行、再起動・本番に近い確認、コミット。
- **同時に同じファイルを触らない。** どちらかが大きな変更を始めるときは、先に `git status` と `git log -3` で、相手の作業を確かめる。

## ブラウザの作業は Claude in Chrome で行う
本人のChrome（ログイン済みの実際のブラウザ）で、拡張機能の「Claude in Chrome」から作業する。
2026-10-07 の時点で、**Mac のChromeと Windows のChromeの両方**が、同じアカウントにつながっている
（`list_connected_browsers` で確認できる）。iPad は、Chromeではないので、対象外。

**向いている作業**: SUZURI・Gemini・ChatGPT・Googleドライブなど、ログインが要るサイトの作業（TUDURI／INTGLMの制作）。
実データでの、ARELMの画面の確認（Macなら `http://localhost:8090`、Windowsなら `http://192.168.1.9:8080`）。
Windows が MacのARELMに届くかの確認。

**始め方**: `tabs_context_mcp` で、いまのタブを確かめる → `tabs_create_mcp` で、**自分用の新しいタブ**を開く → 終わったら、開いたタブを閉じる。
別の端末のブラウザ（Windows など）を使うときは、先に本人に確認する（`select_browser`）。終わったら、Mac 側に戻す。

**守ること**（ブラウザでも同じ）:
- ログイン・合言葉・パスワード・カード番号などの**秘密は、入力しない**。入れるのは本人（画面が出ていれば、本人に頼む）。
- **SUZURIの「商品を公開する」ボタンは、押さない。** 本人が押す。お金が絡む操作、送信・投稿・削除も、本人が確認してから。
- ダウンロードは、名前・出どころ・大きさを伝えて、了承を得てから。
- 確認の窓（alert・confirm）が出そうな操作は、先に知らせる（出ると、拡張機能が止まる）。
- 実データ（本物のARELM）では、**読むだけ**にする。書き換える確認は、検証用サーバー（`PORT=8099`・`ARELM_*` で分離）で行う。
- 2〜3回続けて失敗したら、同じことを繰り返さず、本人に状況を伝えて止める。

**できないこと**: Chromeの外（Windowsの「ARELM-install.bat」の実行、iPadの設定、Chromeのメニューそのもの）。
