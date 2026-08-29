#!/bin/bash
# 商品管理システム インストールスクリプト

echo "=========================================="
echo "📦 商品管理システム インストール"
echo "=========================================="
echo ""

# 現在のディレクトリを保存
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Pythonがインストールされているか確認
if ! command -v python3 &> /dev/null; then
    echo "❌ エラー: Python3がインストールされていません。"
    echo "   まずPython3をインストールしてください。"
    exit 1
fi

echo "✅ Python3が見つかりました: $(python3 --version)"
echo ""

# 必要なライブラリをインストール
echo "📚 必要なライブラリをインストールしています..."
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ ライブラリのインストールに失敗しました。"
    exit 1
fi

echo ""
echo "✅ ライブラリのインストールが完了しました。"
echo ""

# macOSの場合、zbarの確認
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 macOSを検出しました。"
    if ! command -v zbarimg &> /dev/null; then
        echo "⚠️  zbarがインストールされていません。"
        echo "   カメラ機能を使用する場合は、以下を実行してください:"
        echo "   brew install zbar"
        echo ""
    else
        echo "✅ zbarがインストールされています。"
    fi
fi

# 実行権限を付与
echo "🔧 スクリプトに実行権限を付与しています..."
chmod +x launcher.py
chmod +x install.sh

# macOS用のランチャースクリプトも作成
if [[ "$OSTYPE" == "darwin"* ]]; then
    cat > start.sh << 'EOF'
#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"
python3 launcher.py
EOF
    chmod +x start.sh
    echo "✅ macOS用ランチャー (start.sh) を作成しました。"
fi

echo ""
echo "=========================================="
echo "✅ インストールが完了しました！"
echo "=========================================="
echo ""
echo "【起動方法】"
echo "  方法1: python3 launcher.py"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  方法2: ./start.sh"
fi
echo ""
echo "ご利用ありがとうございます！"
