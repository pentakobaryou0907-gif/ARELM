# Tailscale セットアップガイド

## Tailscale とは

Tailscale は、あなた専用の安全なプライベートネットワーク（VPN）を簡単に作れるサービスです。

**メリット:**
- 🔒 自分が承認した端末だけがつながる閉じたネットワーク
- 🌐 外出先からでも自宅のMacに安全にアクセスできる
- 🆓 個人利用は無料（最大100台まで）
- ⚡ 設定が簡単（約5分で完了）
- 🔐 通信は自動的に暗号化される

**同じWi-Fiとの違い:**
- 同じWi-Fiは同じネットワーク内の全員がアクセスできる（来客・家族・IoT機器など）
- Tailscaleはあなたが明示的に許可した端末だけが接続できる

---

## セットアップ手順

### 1. Macでの設定（サーバー側）

#### 1-1. Tailscaleをインストール

1. [Tailscale公式サイト](https://tailscale.com/download)にアクセス
2. 「Download for macOS」をクリック
3. ダウンロードした `.dmg` ファイルを開いてインストール

#### 1-2. Tailscaleにログイン

1. メニューバーのTailscaleアイコンをクリック
2. 「Log in」を選択
3. ブラウザが開くので、Googleアカウントなどでサインイン
4. 「Connect」をクリックして承認

#### 1-3. TailscaleのIPアドレスを確認

1. メニューバーのTailscaleアイコンをクリック
2. 自分のMacの名前の下に `100.x.x.x` のようなIPアドレスが表示される
3. このアドレスをメモする（例: `100.64.1.5`）

#### 1-4. ARELMでTailscaleを有効化

1. ARELMを開く（Mac側）
2. 設定（⚙）→「他の端末から使う」を開く
3. 「Tailscaleから使う」を**オン**にする
4. 「合言葉」を設定する（8文字以上、他では使っていない強力なもの）
5. 保存する

---

### 2. iPhone/iPadでの設定

#### 2-1. Tailscaleアプリをインストール

1. App Storeで「Tailscale」を検索してインストール
2. アプリを開いて「Get Started」をタップ
3. Mac側と**同じアカウント**でログイン
4. 「Connect」をタップして承認

#### 2-2. ARELMにアクセス

1. Safariを開く
2. アドレスバーに以下を入力（Macで確認したIPアドレス）:
   ```
   http://100.64.1.5:8080
   ```
   （`100.64.1.5` の部分は、自分のMacのTailscale IPアドレスに置き換える）

3. 合言葉の入力画面が表示されたら、Mac側で設定した合言葉を入力
4. 端末の名前（例: 「iPhone」）を入力して「入る」をタップ

#### 2-3. ホーム画面に追加（PWAとしてインストール）

1. Safariの画面下部の「共有」ボタン（□に↑）をタップ
2. 「ホーム画面に追加」を選択
3. 名前は「ARELM」のままでOK
4. 「追加」をタップ

これでホーム画面にARELMのアイコンが追加され、アプリのように使えます。

---

### 3. 他のPC（Windows/Mac）からの設定

#### 3-1. Tailscaleをインストール

- **Windows**: [Tailscale公式サイト](https://tailscale.com/download)から「Download for Windows」
- **別のMac**: 同様に「Download for macOS」

#### 3-2. ログインして接続

1. Tailscaleアプリを起動
2. Mac側と**同じアカウント**でログイン
3. 接続が完了すると、メニュー/タスクバーにTailscaleアイコンが表示される

#### 3-3. ARELMにアクセス

1. ブラウザ（Chrome推奨）で以下を開く:
   ```
   http://100.64.1.5:8080
   ```
   （Mac側のTailscale IPアドレス）

2. 合言葉を入力して「入る」

---

## トラブルシューティング

### 接続できない場合

1. **Tailscaleが起動しているか確認**
   - Mac側: メニューバーにTailscaleアイコンがあるか
   - スマホ/他PC: Tailscaleアプリを開いて「Connected」になっているか

2. **IPアドレスが正しいか確認**
   - Mac側のメニューバーでTailscale IPアドレスを再確認
   - `100.64.x.x` 〜 `100.127.x.x` の範囲のはず

3. **ARELMサーバーが起動しているか確認**
   - Mac側でARELMを一度開いてみる
   - ターミナルで以下を実行:
     ```bash
     curl -s http://127.0.0.1:8080/api/health
     ```
   - `{"ok":true}` と表示されればOK

4. **設定を確認**
   - Mac側のARELM設定で「Tailscaleから使う」がオンになっているか
   - 合言葉が設定されているか

### 「合言葉が違います」と表示される

- 入力した合言葉が間違っている可能性があります
- Mac側のARELM設定で合言葉を再設定してみてください
- 合言葉は8文字以上必要です

### マイクが使えない

- Tailscale経由ではHTTP接続になるため、ブラウザのセキュリティ上マイクが使えません
- マイクを使いたい場合は、HTTPS化が必要です（次のセクション参照）

---

## HTTPS化（オプション・マイク対応）

マイク機能を他の端末から使いたい場合は、HTTPS化が必要です。

### 方法1: mkcert を使った自己署名証明書（推奨）

#### 1. mkcert をインストール

```bash
brew install mkcert
brew install nss  # Firefoxを使う場合のみ
```

#### 2. ローカル認証局を作成

```bash
mkcert -install
```

#### 3. ARELMの証明書を生成

```bash
cd /Users/ari/Developer/AReGLM/server
mkdir -p certs

# Mac本体のTailscale IPアドレスを確認してから実行
# 例: 100.64.1.5 の場合
mkcert -cert-file certs/cert.pem -key-file certs/key.pem \
  localhost 127.0.0.1 ::1 \
  100.64.1.5 \
  $(hostname).local
```

#### 4. ARELMを再起動

証明書ファイルが `server/certs/` に作成されると、ARELMは自動的にHTTPSモードで起動します（ポート8443）。

#### 5. 他の端末から証明書をインストール

他の端末で `mkcert -install` を実行し、生成された `rootCA.pem` を共有します。

詳しくは [mkcert公式ドキュメント](https://github.com/FiloSottile/mkcert) を参照してください。

---

## セキュリティ上の注意

1. **合言葉は強力なものを使用**
   - 8文字以上
   - 他のサービスで使っていないもの
   - 英数字と記号を混ぜる

2. **Tailscaleのログイン情報を守る**
   - Googleアカウントなどに二段階認証を設定する

3. **不要な端末は削除**
   - Tailscaleの管理画面から、使わなくなった端末を削除する
   - [https://login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines)

4. **定期的に端末一覧を確認**
   - ARELM設定 →「他の端末から使う」で、許可された端末を確認
   - 不明な端末があれば削除する

---

## よくある質問

**Q: Tailscaleは無料ですか？**  
A: 個人利用は無料です（最大100台まで）。商用利用の場合は有料プランが必要です。

**Q: 通信速度は遅くなりますか？**  
A: Tailscaleは可能な限り直接接続（ピアツーピア）を使うため、通常のVPNより高速です。

**Q: 外出先から使えますか？**  
A: はい。Tailscaleに接続している限り、どこからでもアクセスできます。

**Q: Mac側がスリープ状態でも使えますか？**  
A: いいえ。Mac側が起動していて、ARELMサーバーが動いている必要があります。

**Q: 同じWi-Fiからのアクセスは止めたほうが良いですか？**  
A: Tailscaleだけで十分な場合は、ARELM設定で「他の端末から使う」をオフにすることで、同じWi-Fiからのアクセスを完全に遮断できます。

---

## サポート

- Tailscale公式ドキュメント: [https://tailscale.com/kb/](https://tailscale.com/kb/)
- ARELM設定: 設定（⚙）→「他の端末から使う」
