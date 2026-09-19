#!/bin/bash
# HTTPS用の自己署名証明書を作る
#
# なぜ必要か:
#   ブラウザはマイク・カメラ・録音を「安全な接続」でしか許可しない。
#   127.0.0.1 と localhost だけが例外で、
#   arinoMacBook-Pro.local のようなURLでは使えない。
#   HTTPS にすればどのURLでも使えるようになる。
#
# この証明書はこの端末の中だけで使うもので、外部には出ない。
# ブラウザは初回に警告を出すが、一度許可すれば以後は出ない。

cd "$(dirname "$0")" || exit 1

HOSTNAME_LOCAL=$(scutil --get LocalHostName 2>/dev/null || echo "localhost")
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo "証明書を作ります"
echo "  対象: ${HOSTNAME_LOCAL}.local / localhost / 127.0.0.1 / ${LAN_IP}"

# 対象ホストをまとめて書いた設定を作る。
# ここに書いたものだけが「正しい接続先」として扱われる。
cat > openssl.cnf <<CONF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no

[dn]
CN = ${HOSTNAME_LOCAL}.local
O = ARELM
C = JP

[ext]
subjectAltName = @alt
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt]
DNS.1 = ${HOSTNAME_LOCAL}.local
DNS.2 = localhost
DNS.3 = ${HOSTNAME_LOCAL}
IP.1 = 127.0.0.1
IP.2 = ${LAN_IP}
IP.3 = ::1
CONF

openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout key.pem -out cert.pem \
    -days 3650 -config openssl.cnf 2>/dev/null

if [ -f cert.pem ] && [ -f key.pem ]; then
    chmod 600 key.pem
    echo "できました:"
    echo "  $(pwd)/cert.pem"
    echo "  $(pwd)/key.pem"
    echo
    echo "有効期限:"
    openssl x509 -in cert.pem -noout -enddate | sed 's/notAfter=/  /'
    echo "対象のホスト名:"
    openssl x509 -in cert.pem -noout -ext subjectAltName | tail -1 | sed 's/^/  /'
else
    echo "作成に失敗しました"
    exit 1
fi
