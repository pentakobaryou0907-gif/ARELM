#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
商品管理システム メインランチャー
すべての機能に簡単にアクセスできます
"""
import os
import sys
import subprocess

def print_header():
    """ヘッダーを表示"""
    print("\n" + "=" * 60)
    print("📦 商品管理システム")
    print("=" * 60)
    print()

def check_dependencies():
    """必要なライブラリがインストールされているか確認"""
    missing = []
    try:
        import pandas
    except ImportError:
        missing.append("pandas")
    
    try:
        import openpyxl
    except ImportError:
        missing.append("openpyxl")
    
    if missing:
        print("⚠️  以下のライブラリがインストールされていません:")
        for lib in missing:
            print(f"   - {lib}")
        print("\nインストール方法:")
        print("  pip install -r requirements.txt")
        print("\n続行しますか？ (y/n): ", end="")
        response = input().strip().lower()
        if response != 'y':
            sys.exit(0)
        return False
    return True

def run_script(script_name):
    """Pythonスクリプトを実行"""
    if not os.path.exists(script_name):
        print(f"❌ エラー: {script_name} が見つかりません。")
        return
    
    try:
        print(f"\n🚀 {script_name} を起動しています...\n")
        subprocess.run([sys.executable, script_name])
    except KeyboardInterrupt:
        print("\n\n⚠️  処理が中断されました。")
    except Exception as e:
        print(f"\n❌ エラーが発生しました: {str(e)}")

def main_menu():
    """メインメニューを表示"""
    print_header()
    
    # 依存関係を確認
    check_dependencies()
    
    while True:
        print("\n" + "-" * 60)
        print("メニューを選択してください:")
        print("-" * 60)
        print("1. 📦 バーコードスキャナー（リアルタイム商品登録）")
        print("2. 📋 Excel一括処理（商品リストから自動仕分け）")
        print("3. ✏️  商品分類編集ツール")
        print("4. 📊 Excel管理システム（初期化・管理）")
        print("5. 📖 ヘルプ・使い方")
        print("6. ❌ 終了")
        print("-" * 60)
        
        choice = input("\n選択 (1-6): ").strip()
        
        if choice == "1":
            run_script("barcode_scanner.py")
        elif choice == "2":
            run_script("auto_box_sorter.py")
        elif choice == "3":
            run_script("product_editor.py")
        elif choice == "4":
            run_script("excel_manager.py")
        elif choice == "5":
            show_help()
        elif choice == "6":
            print("\n👋 ご利用ありがとうございました！\n")
            break
        else:
            print("\n❌ 無効な選択です。1-6の数字を入力してください。")

def show_help():
    """ヘルプを表示"""
    print("\n" + "=" * 60)
    print("📖 使い方ガイド")
    print("=" * 60)
    print("""
【機能一覧】

1. バーコードスキャナー
   - USBバーコードリーダーまたはカメラで商品を登録
   - リアルタイムでExcelに追加

2. Excel一括処理
   - products.xlsxから商品リストを読み込み
   - 自動的に箱に分類して出力

3. 商品分類編集ツール
   - 商品のカテゴリ、タグ、メモを編集
   - 分類情報を管理

4. Excel管理システム
   - 統合Excelファイルの初期化
   - データの管理・確認

【初回セットアップ】
1. pip install -r requirements.txt を実行
2. macOSでカメラ機能を使う場合: brew install zbar

【詳細情報】
README.md ファイルをご確認ください。
""")
    input("\nEnterキーを押してメニューに戻ります...")

if __name__ == "__main__":
    try:
        main_menu()
    except KeyboardInterrupt:
        print("\n\n👋 ご利用ありがとうございました！\n")
        sys.exit(0)
