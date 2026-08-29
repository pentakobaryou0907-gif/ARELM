"""
商品分類編集ツール
Excel内で商品を細かく分類できるインターフェース
"""
import pandas as pd
import sys
from excel_manager import (
    init_master_excel, get_products_sheet, save_products_sheet,
    get_categories_sheet, add_category, update_product_category,
    update_summary_sheet, MASTER_EXCEL_FILE
)

def show_products():
    """商品一覧を表示"""
    df = get_products_sheet()
    if df.empty:
        print("商品が登録されていません。")
        return
    
    print("\n" + "=" * 80)
    print("商品一覧")
    print("=" * 80)
    
    # 分類情報を含めて表示
    display_columns = ["商品番号", "商品名", "箱名", "カテゴリ", "サブカテゴリ", "タグ", "メモ"]
    available_columns = [col for col in display_columns if col in df.columns]
    
    for idx, row in df.iterrows():
        print(f"\n[{idx + 1}] 商品番号: {row.get('商品番号', 'N/A')}")
        print(f"    商品名: {row.get('商品名', 'N/A')}")
        print(f"    箱名: {row.get('箱名', 'N/A')}")
        if row.get('カテゴリ'):
            print(f"    カテゴリ: {row.get('カテゴリ', '')}")
        if row.get('サブカテゴリ'):
            print(f"    サブカテゴリ: {row.get('サブカテゴリ', '')}")
        if row.get('タグ'):
            print(f"    タグ: {row.get('タグ', '')}")
        if row.get('メモ'):
            print(f"    メモ: {row.get('メモ', '')}")


def edit_product():
    """商品の分類情報を編集"""
    df = get_products_sheet()
    if df.empty:
        print("商品が登録されていません。")
        return
    
    show_products()
    
    try:
        product_num = input("\n編集する商品番号を入力 (例: 001): ").strip()
        
        # 商品番号で検索
        mask = df["商品番号"].astype(str) == str(product_num).zfill(3)
        if not mask.any():
            print(f"❌ 商品番号 {product_num} が見つかりません。")
            return
        
        product = df[mask].iloc[0]
        print(f"\n現在の情報:")
        print(f"  商品名: {product.get('商品名', 'N/A')}")
        print(f"  カテゴリ: {product.get('カテゴリ', '')}")
        print(f"  サブカテゴリ: {product.get('サブカテゴリ', '')}")
        print(f"  タグ: {product.get('タグ', '')}")
        print(f"  メモ: {product.get('メモ', '')}")
        
        print("\n新しい分類情報を入力してください（空欄でEnterを押すと変更なし）:")
        
        category = input(f"カテゴリ [{product.get('カテゴリ', '')}]: ").strip()
        subcategory = input(f"サブカテゴリ [{product.get('サブカテゴリ', '')}]: ").strip()
        tags = input(f"タグ [{product.get('タグ', '')}]: ").strip()
        memo = input(f"メモ [{product.get('メモ', '')}]: ").strip()
        
        # 更新
        product_num_int = int(product_num)
        update_product_category(
            product_num_int,
            category if category else None,
            subcategory if subcategory else None,
            tags if tags else None,
            memo if memo else None
        )
        
        update_summary_sheet()
        print(f"\n✅ 商品番号 {product_num} の分類情報を更新しました。")
        
    except ValueError:
        print("❌ 無効な商品番号です。")
    except Exception as e:
        print(f"❌ エラー: {str(e)}")


def manage_categories():
    """カテゴリを管理"""
    print("\n" + "=" * 50)
    print("カテゴリ管理")
    print("=" * 50)
    
    df = get_categories_sheet()
    if not df.empty:
        print("\n登録されているカテゴリ:")
        for idx, row in df.iterrows():
            print(f"  - {row.get('カテゴリ', 'N/A')}: {row.get('説明', '')}")
    else:
        print("\n登録されているカテゴリはありません。")
    
    print("\n新規カテゴリを追加しますか？")
    response = input("追加する場合、カテゴリ名を入力（空欄でキャンセル）: ").strip()
    
    if response:
        description = input("説明（オプション）: ").strip()
        color_code = input("色コード（オプション、例: #FF0000）: ").strip()
        add_category(response, description, color_code)


def filter_by_category():
    """カテゴリでフィルタして表示"""
    df = get_products_sheet()
    if df.empty:
        print("商品が登録されていません。")
        return
    
    # カテゴリ一覧を取得
    if "カテゴリ" in df.columns:
        categories = df[df["カテゴリ"] != ""]["カテゴリ"].unique()
        if len(categories) > 0:
            print("\n利用可能なカテゴリ:")
            for i, cat in enumerate(categories, 1):
                print(f"  {i}. {cat}")
            
            try:
                choice = input("\nカテゴリ番号を選択（空欄で全表示）: ").strip()
                if choice:
                    idx = int(choice) - 1
                    if 0 <= idx < len(categories):
                        selected_category = categories[idx]
                        filtered_df = df[df["カテゴリ"] == selected_category]
                        
                        print(f"\n【カテゴリ: {selected_category}】の商品一覧:")
                        print(filtered_df[["商品番号", "商品名", "箱名", "サブカテゴリ", "タグ"]].to_string(index=False))
                    else:
                        print("❌ 無効な選択です。")
                else:
                    show_products()
            except ValueError:
                print("❌ 無効な入力です。")
        else:
            print("カテゴリが設定されている商品がありません。")
            show_products()
    else:
        print("カテゴリ列が存在しません。")
        show_products()


def main():
    init_master_excel()
    
    while True:
        print("\n" + "=" * 50)
        print("商品分類編集ツール")
        print("=" * 50)
        print("1. 商品一覧を表示")
        print("2. 商品の分類情報を編集")
        print("3. カテゴリでフィルタ")
        print("4. カテゴリ管理")
        print("5. Excelファイルを開く")
        print("6. 終了")
        
        try:
            choice = input("\n選択 (1-6): ").strip()
            
            if choice == "1":
                show_products()
            elif choice == "2":
                edit_product()
            elif choice == "3":
                filter_by_category()
            elif choice == "4":
                manage_categories()
            elif choice == "5":
                print(f"\n📁 {MASTER_EXCEL_FILE} を開いてください。")
                print("   Excelで直接編集することもできます。")
            elif choice == "6":
                print("\n👋 終了します。")
                sys.exit(0)
            else:
                print("❌ 無効な選択です。")
        
        except KeyboardInterrupt:
            print("\n\n👋 終了します。")
            sys.exit(0)
        except Exception as e:
            print(f"❌ エラー: {str(e)}")


if __name__ == "__main__":
    main()

