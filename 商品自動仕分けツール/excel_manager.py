"""
統合Excel管理システム
全てのデータを一つのExcelファイルで管理します
"""
import pandas as pd
import os
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime

# ==========================
# 設定
# ==========================
MASTER_EXCEL_FILE = "商品管理マスター.xlsx"  # 統合Excelファイル名

# ==========================
# 箱クラス
# ==========================
class Box:
    def __init__(self, prefix, number, suffix, capacity):
        self.prefix = prefix
        self.number = number
        self.suffix = suffix
        self.capacity = capacity
        self.items = []

    def add_item(self, item):
        if len(self.items) < self.capacity:
            self.items.append(item)
            return True
        return False

    def is_full(self):
        return len(self.items) >= self.capacity

    def label(self):
        return f"{self.prefix}-{self.number}{self.suffix}"

# シート名の定義
SHEET_PRODUCTS = "商品一覧"           # 仕分け済み商品一覧
SHEET_BARCODE_MASTER = "バーコードマスター"  # バーコードと商品名のマッピング
SHEET_SUMMARY = "集計・ダッシュボード"      # 集計情報
SHEET_RAW_INPUT = "入力データ"         # 元の入力データ（参照用）
SHEET_CATEGORIES = "分類管理"          # 商品分類のマスター


# ==========================
# Excelファイル初期化
# ==========================
def init_master_excel():
    """統合Excelファイルを初期化（存在しない場合）"""
    if not os.path.exists(MASTER_EXCEL_FILE):
        # 新しいExcelファイルを作成
        with pd.ExcelWriter(MASTER_EXCEL_FILE, engine='openpyxl') as writer:
            # 各シートを初期化
            pd.DataFrame(columns=["商品名", "商品番号", "箱名", "バーコード", "登録日時"]).to_excel(
                writer, sheet_name=SHEET_PRODUCTS, index=False
            )
            pd.DataFrame(columns=["バーコード", "商品名", "登録日時"]).to_excel(
                writer, sheet_name=SHEET_BARCODE_MASTER, index=False
            )
            pd.DataFrame(columns=["項目", "値"]).to_excel(
                writer, sheet_name=SHEET_SUMMARY, index=False
            )
            pd.DataFrame(columns=["商品名"]).to_excel(
                writer, sheet_name=SHEET_RAW_INPUT, index=False
            )
            pd.DataFrame(columns=["カテゴリ", "説明", "色コード"]).to_excel(
                writer, sheet_name=SHEET_CATEGORIES, index=False
            )
        
        # 見た目を整える
        format_excel_file()
        print(f"✅ 統合Excelファイルを作成しました: {MASTER_EXCEL_FILE}")
        return True
    return False


# ==========================
# Excelファイルの書式設定
# ==========================
def format_excel_file():
    """Excelファイルの見た目を整える"""
    try:
        wb = load_workbook(MASTER_EXCEL_FILE)
        
        # ヘッダーのスタイル
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=11)
        border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        
        # 各シートをフォーマット
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            
            # ヘッダー行をフォーマット
            if ws.max_row > 0:
                for cell in ws[1]:
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    cell.border = border
            
            # 列幅を自動調整
            for column in ws.columns:
                max_length = 0
                column_letter = get_column_letter(column[0].column)
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                ws.column_dimensions[column_letter].width = adjusted_width
            
            # データ行に罫線を追加
            for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
                for cell in row:
                    cell.border = border
                    cell.alignment = Alignment(horizontal="left", vertical="center")
        
        wb.save(MASTER_EXCEL_FILE)
        wb.close()
    except Exception as e:
        print(f"⚠️  書式設定エラー: {str(e)}")


# ==========================
# 商品一覧シートの操作
# ==========================
def get_products_sheet():
    """商品一覧シートを読み込む"""
    try:
        df = pd.read_excel(MASTER_EXCEL_FILE, sheet_name=SHEET_PRODUCTS)
        if df.empty:
            return pd.DataFrame(columns=["商品名", "商品番号", "箱名", "バーコード", "カテゴリ", "サブカテゴリ", "タグ", "メモ", "登録日時"])
        # 古い形式の列がない場合は追加
        required_columns = ["商品名", "商品番号", "箱名", "バーコード", "カテゴリ", "サブカテゴリ", "タグ", "メモ", "登録日時"]
        for col in required_columns:
            if col not in df.columns:
                df[col] = ""
        return df
    except Exception as e:
        print(f"⚠️  商品一覧の読み込みエラー: {str(e)}")
        return pd.DataFrame(columns=["商品名", "商品番号", "箱名", "バーコード", "カテゴリ", "サブカテゴリ", "タグ", "メモ", "登録日時"])


def save_products_sheet(df):
    """商品一覧シートを保存"""
    try:
        wb = load_workbook(MASTER_EXCEL_FILE)
        
        # 既存のシートを削除
        if SHEET_PRODUCTS in wb.sheetnames:
            wb.remove(wb[SHEET_PRODUCTS])
        
        wb.save(MASTER_EXCEL_FILE)
        wb.close()
        
        # 新しいシートを作成
        with pd.ExcelWriter(MASTER_EXCEL_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
            df.to_excel(writer, sheet_name=SHEET_PRODUCTS, index=False)
        
        # 商品番号列を文字列として設定
        wb = load_workbook(MASTER_EXCEL_FILE)
        if SHEET_PRODUCTS in wb.sheetnames:
            ws = wb[SHEET_PRODUCTS]
            
            # 商品番号列（B列）を文字列として設定
            for row in range(2, len(df) + 2):
                cell = ws[f'B{row}']
                if cell.value:
                    cell.value = str(cell.value).zfill(3)
                    cell.number_format = '@'
        
        wb.save(MASTER_EXCEL_FILE)
        wb.close()
        
        # 書式を整える
        format_excel_file()
        return True
    except Exception as e:
        print(f"❌ 商品一覧の保存エラー: {str(e)}")
        return False


def add_product_to_sheet(product_name, product_number, box_name, barcode="", category="", subcategory="", tags="", memo="", timestamp=""):
    """商品一覧シートに商品を追加"""
    df = get_products_sheet()
    
    if not timestamp:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    new_row = pd.DataFrame({
        "商品名": [product_name],
        "商品番号": [f"{product_number:03}"],
        "箱名": [box_name],
        "バーコード": [barcode],
        "カテゴリ": [category],
        "サブカテゴリ": [subcategory],
        "タグ": [tags],
        "メモ": [memo],
        "登録日時": [timestamp]
    })
    
    df = pd.concat([df, new_row], ignore_index=True)
    return save_products_sheet(df)


# ==========================
# バーコードマスターシートの操作
# ==========================
def get_barcode_master_sheet():
    """バーコードマスターシートを読み込む"""
    try:
        df = pd.read_excel(MASTER_EXCEL_FILE, sheet_name=SHEET_BARCODE_MASTER)
        if df.empty:
            return pd.DataFrame(columns=["バーコード", "商品名", "登録日時"])
        return df
    except Exception as e:
        print(f"⚠️  バーコードマスターの読み込みエラー: {str(e)}")
        return pd.DataFrame(columns=["バーコード", "商品名", "登録日時"])


def get_barcode_dict():
    """バーコードマスターを辞書形式で取得"""
    df = get_barcode_master_sheet()
    barcode_dict = {}
    if "バーコード" in df.columns and "商品名" in df.columns:
        for _, row in df.iterrows():
            barcode = str(row["バーコード"]).strip()
            product_name = str(row["商品名"]).strip()
            if barcode and product_name:
                barcode_dict[barcode] = product_name
    return barcode_dict


def add_to_barcode_master(barcode, product_name):
    """バーコードマスターに追加"""
    try:
        df = get_barcode_master_sheet()
        
        # 既に存在するかチェック
        if "バーコード" in df.columns:
            if barcode in df["バーコード"].astype(str).values:
                print(f"⚠️  バーコード {barcode} は既に登録されています。")
                return False
        
        # 新しい行を追加
        new_row = pd.DataFrame({
            "バーコード": [barcode],
            "商品名": [product_name],
            "登録日時": [datetime.now().strftime("%Y-%m-%d %H:%M:%S")]
        })
        
        df = pd.concat([df, new_row], ignore_index=True)
        
        # 保存
        wb = load_workbook(MASTER_EXCEL_FILE)
        if SHEET_BARCODE_MASTER in wb.sheetnames:
            wb.remove(wb[SHEET_BARCODE_MASTER])
        
        wb.save(MASTER_EXCEL_FILE)
        wb.close()
        
        with pd.ExcelWriter(MASTER_EXCEL_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
            df.to_excel(writer, sheet_name=SHEET_BARCODE_MASTER, index=False)
        
        format_excel_file()
        print(f"✅ バーコードマスターに追加: {barcode} → {product_name}")
        return True
    except Exception as e:
        print(f"❌ バーコードマスターへの追加エラー: {str(e)}")
        return False


# ==========================
# 集計シートの更新
# ==========================
def update_summary_sheet():
    """集計・ダッシュボードシートを更新"""
    try:
        products_df = get_products_sheet()
        barcode_df = get_barcode_master_sheet()
        
        # 集計データを作成
        summary_data = []
        
        # 基本統計
        total_products = len(products_df) if not products_df.empty else 0
        total_barcodes = len(barcode_df) if not barcode_df.empty else 0
        
        summary_data.append({"項目": "登録商品総数", "値": total_products})
        summary_data.append({"項目": "登録バーコード数", "値": total_barcodes})
        
        if not products_df.empty and "箱名" in products_df.columns:
            # 箱ごとの集計
            box_counts = products_df["箱名"].value_counts()
            summary_data.append({"項目": "---", "値": "---"})
            summary_data.append({"項目": "【箱別商品数】", "値": ""})
            for box_name, count in box_counts.items():
                summary_data.append({"項目": f"  {box_name}", "値": int(count)})
        
        if not products_df.empty and "商品名" in products_df.columns:
            # 商品別集計
            product_counts = products_df["商品名"].value_counts()
            summary_data.append({"項目": "---", "値": "---"})
            summary_data.append({"項目": "【商品別登録数】", "値": ""})
            for product_name, count in product_counts.head(10).items():
                summary_data.append({"項目": f"  {product_name}", "値": int(count)})
        
        # カテゴリ別集計
        if not products_df.empty and "カテゴリ" in products_df.columns:
            category_counts = products_df[products_df["カテゴリ"] != ""]["カテゴリ"].value_counts()
            if not category_counts.empty:
                summary_data.append({"項目": "---", "値": "---"})
                summary_data.append({"項目": "【カテゴリ別商品数】", "値": ""})
                for category, count in category_counts.items():
                    summary_data.append({"項目": f"  {category}", "値": int(count)})
        
        # 最終更新日時
        summary_data.append({"項目": "---", "値": "---"})
        summary_data.append({"項目": "最終更新日時", "値": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
        
        # 保存
        summary_df = pd.DataFrame(summary_data)
        
        wb = load_workbook(MASTER_EXCEL_FILE)
        if SHEET_SUMMARY in wb.sheetnames:
            wb.remove(wb[SHEET_SUMMARY])
        
        wb.save(MASTER_EXCEL_FILE)
        wb.close()
        
        with pd.ExcelWriter(MASTER_EXCEL_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
            summary_df.to_excel(writer, sheet_name=SHEET_SUMMARY, index=False)
        
        format_excel_file()
        return True
    except Exception as e:
        print(f"⚠️  集計シートの更新エラー: {str(e)}")
        return False


# ==========================
# 既存データの移行
# ==========================
def migrate_existing_data():
    """既存のExcelファイルから統合ファイルにデータを移行"""
    migrated = False
    
    # sorted_products.xlsxから移行
    if os.path.exists("sorted_products.xlsx"):
        try:
            df = pd.read_excel("sorted_products.xlsx")
            if not df.empty:
                existing_df = get_products_sheet()
                # 既に存在するデータとマージ（重複を避ける）
                if existing_df.empty:
                    save_products_sheet(df)
                    print("✅ sorted_products.xlsxからデータを移行しました")
                    migrated = True
                else:
                    # 重複チェック
                    combined_df = pd.concat([existing_df, df]).drop_duplicates(
                        subset=["商品名", "商品番号", "箱名"], keep='first'
                    )
                    save_products_sheet(combined_df)
                    print("✅ sorted_products.xlsxからデータを統合しました")
                    migrated = True
        except Exception as e:
            print(f"⚠️  sorted_products.xlsxの移行エラー: {str(e)}")
    
    # barcode_master.xlsxから移行
    if os.path.exists("barcode_master.xlsx"):
        try:
            df = pd.read_excel("barcode_master.xlsx")
            if not df.empty and "バーコード" in df.columns and "商品名" in df.columns:
                existing_df = get_barcode_master_sheet()
                if existing_df.empty:
                    # 登録日時列を追加
                    df["登録日時"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    wb = load_workbook(MASTER_EXCEL_FILE)
                    if SHEET_BARCODE_MASTER in wb.sheetnames:
                        wb.remove(wb[SHEET_BARCODE_MASTER])
                    wb.save(MASTER_EXCEL_FILE)
                    wb.close()
                    with pd.ExcelWriter(MASTER_EXCEL_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                        df.to_excel(writer, sheet_name=SHEET_BARCODE_MASTER, index=False)
                    print("✅ barcode_master.xlsxからデータを移行しました")
                    migrated = True
                else:
                    # 既存データと統合
                    for _, row in df.iterrows():
                        add_to_barcode_master(str(row["バーコード"]), str(row["商品名"]))
                    print("✅ barcode_master.xlsxからデータを統合しました")
                    migrated = True
        except Exception as e:
            print(f"⚠️  barcode_master.xlsxの移行エラー: {str(e)}")
    
    # products.xlsxから移行（入力データシート）
    if os.path.exists("products.xlsx"):
        try:
            df = pd.read_excel("products.xlsx")
            if not df.empty:
                wb = load_workbook(MASTER_EXCEL_FILE)
                if SHEET_RAW_INPUT in wb.sheetnames:
                    wb.remove(wb[SHEET_RAW_INPUT])
                wb.save(MASTER_EXCEL_FILE)
                wb.close()
                with pd.ExcelWriter(MASTER_EXCEL_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                    df.to_excel(writer, sheet_name=SHEET_RAW_INPUT, index=False)
                print("✅ products.xlsxからデータを移行しました")
                migrated = True
        except Exception as e:
            print(f"⚠️  products.xlsxの移行エラー: {str(e)}")
    
    if migrated:
        format_excel_file()
        update_summary_sheet()
    
    return migrated


# ==========================
# ヘルパー関数（箱管理用）
# ==========================
def get_next_product_number_helper():
    """次の商品番号を取得"""
    df = get_products_sheet()
    if df.empty or "商品番号" not in df.columns:
        return 1
    
    max_num = 0
    for num_str in df["商品番号"].astype(str):
        try:
            num = int(num_str)
            max_num = max(max_num, num)
        except:
            pass
    
    return max_num + 1


def get_or_create_box_helper(boxes, product_name, category_rules, box_capacity):
    """商品を適切な箱に割り当て、新しい箱が必要なら作成"""
    prefix = category_rules.get(product_name, "00")
    
    if prefix not in boxes:
        boxes[prefix] = [Box(prefix, 1, "A", box_capacity)]
    
    current_box = boxes[prefix][-1]
    
    if not current_box.add_item(product_name):
        # 箱が満杯なので新しい箱を作成
        new_suffix = chr(ord(current_box.suffix) + 1)
        new_box = Box(prefix, current_box.number, new_suffix, box_capacity)
        new_box.add_item(product_name)
        boxes[prefix].append(new_box)
        current_box = new_box
    
    return current_box


def get_box_state_from_products():
    """商品一覧から箱の状態を復元"""
    df = get_products_sheet()
    boxes = {}
    
    if not df.empty and "箱名" in df.columns and "商品名" in df.columns:
        # カテゴリルールを取得（外部から渡す必要がある）
        from barcode_scanner import CATEGORY_RULES, BOX_CAPACITY
        
        for _, row in df.iterrows():
            product = row["商品名"]
            box_name = row["箱名"]
            if product and box_name:
                prefix = CATEGORY_RULES.get(product, "00")
                if prefix not in boxes:
                    boxes[prefix] = []
                # 箱名から既存の箱を特定（簡易版）
                # 実際には箱の状態を完全に復元するにはより複雑な処理が必要
    return boxes


# ==========================
# 分類管理機能
# ==========================
def get_categories_sheet():
    """分類管理シートを読み込む"""
    try:
        df = pd.read_excel(MASTER_EXCEL_FILE, sheet_name=SHEET_CATEGORIES)
        if df.empty:
            return pd.DataFrame(columns=["カテゴリ", "説明", "色コード"])
        return df
    except Exception as e:
        print(f"⚠️  分類管理の読み込みエラー: {str(e)}")
        return pd.DataFrame(columns=["カテゴリ", "説明", "色コード"])


def add_category(category, description="", color_code=""):
    """分類を追加"""
    try:
        df = get_categories_sheet()
        
        # 既に存在するかチェック
        if not df.empty and "カテゴリ" in df.columns:
            if category in df["カテゴリ"].astype(str).values:
                print(f"⚠️  カテゴリ '{category}' は既に登録されています。")
                return False
        
        new_row = pd.DataFrame({
            "カテゴリ": [category],
            "説明": [description],
            "色コード": [color_code]
        })
        
        df = pd.concat([df, new_row], ignore_index=True)
        
        wb = load_workbook(MASTER_EXCEL_FILE)
        if SHEET_CATEGORIES in wb.sheetnames:
            wb.remove(wb[SHEET_CATEGORIES])
        wb.save(MASTER_EXCEL_FILE)
        wb.close()
        
        with pd.ExcelWriter(MASTER_EXCEL_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
            df.to_excel(writer, sheet_name=SHEET_CATEGORIES, index=False)
        
        format_excel_file()
        print(f"✅ カテゴリを追加: {category}")
        return True
    except Exception as e:
        print(f"❌ カテゴリ追加エラー: {str(e)}")
        return False


def update_product_category(product_number, category="", subcategory="", tags="", memo=""):
    """商品の分類情報を更新"""
    try:
        df = get_products_sheet()
        
        # 商品番号で検索
        mask = df["商品番号"].astype(str) == str(product_number).zfill(3)
        
        if not mask.any():
            print(f"❌ 商品番号 {product_number:03} が見つかりません。")
            return False
        
        # 分類情報を更新
        if category:
            df.loc[mask, "カテゴリ"] = category
        if subcategory:
            df.loc[mask, "サブカテゴリ"] = subcategory
        if tags:
            df.loc[mask, "タグ"] = tags
        if memo:
            df.loc[mask, "メモ"] = memo
        
        save_products_sheet(df)
        print(f"✅ 商品番号 {product_number:03} の分類情報を更新しました。")
        return True
    except Exception as e:
        print(f"❌ 分類情報の更新エラー: {str(e)}")
        return False


if __name__ == "__main__":
    # 初期化と移行のテスト
    print("=" * 50)
    print("統合Excel管理システム - 初期化")
    print("=" * 50)
    
    init_master_excel()
    migrate_existing_data()
    update_summary_sheet()
    
    print("\n✅ 初期化完了！")
    print(f"📁 統合ファイル: {MASTER_EXCEL_FILE}")

