#!/bin/bash
# 商品管理システム 起動スクリプト

# スクリプトのディレクトリに移動
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Pythonでランチャーを起動
python3 launcher.py
