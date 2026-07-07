from backend.utils.db import get_conn, dictfetchall
from flask import jsonify
from datetime import date

def get_inventory():
    """
    Trả về danh sách tất cả các lô cho màn lot-list (Check inventory).
    Status được tính động theo:
      - Expired    : expiry_date < hôm nay
      - NearExpiry : hôm nay <= expiry_date < hôm nay + 7 ngày
      - LowStock   : tồn kho thực tế (current_stock) <= 10% so với quantity của lô
      - In Stock   : các trường hợp còn lại
    Ưu tiên: Expired > NearExpiry > LowStock > In Stock
    """
    conn = get_conn()
    cursor = conn.cursor()

    query = """
        SELECT 
            b.lot_code,
            i.name AS ingredient_name,
            b.quantity,
            inv.current_stock AS quantity_left,
            b.unit,
            b.manufacture_date,
            b.expiry_date,
            CASE
                -- 1. Hết hạn
                WHEN b.expiry_date IS NOT NULL 
                     AND b.expiry_date < CURDATE()
                    THEN 'Expired'

                -- 2. Gần hết hạn (trong vòng 7 ngày tới)
                WHEN b.expiry_date IS NOT NULL
                     AND b.expiry_date >= CURDATE()
                     AND b.expiry_date < DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                    THEN 'NearExpiry'

                -- 3. Tồn kho thấp: tồn kho thực tế < 1000
                --    COALESCE để nếu chưa có dòng inventory thì coi như 0
                WHEN COALESCE(inv.current_stock, 0) < 1000
                    THEN 'LowStock'

                -- 4. Mặc định còn hàng
                ELSE 'In Stock'
            END AS status
        FROM batches b
        JOIN ingredients i 
            ON b.ingredient_id = i.ingredient_id
        LEFT JOIN inventory inv 
            ON i.ingredient_id = inv.ingredient_id
    """

    cursor.execute(query)
    inventory_data = dictfetchall(cursor)

    cursor.close()
    conn.close()

    return jsonify(inventory_data), 200

def get_lot_details(lot_code):
    """
    Lấy chi tiết tất cả các lô có cùng prefix lot_code cho màn ingredient-list.
    - quantity_left: lấy từ inventory.current_stock (tồn thực tế của nguyên liệu)
    - status: tính động theo expiry_date + tồn kho, ưu tiên:
        Expired > NearExpiry > LowStock > In Stock
    """
    conn = get_conn()
    cursor = conn.cursor()

    query = """
        SELECT 
            b.lot_code,
            i.name AS ingredient_name,
            b.quantity,
            -- Tồn kho thực tế hiện tại (tổng cho nguyên liệu đó)
            inv.current_stock AS quantity_left,
            b.unit,
            b.manufacture_date,
            b.expiry_date,
            CASE
                -- 1. Hết hạn
                WHEN b.expiry_date IS NOT NULL
                     AND b.expiry_date < CURDATE()
                    THEN 'Expired'

                -- 2. Gần hết hạn (trong 7 ngày tới)
                WHEN b.expiry_date IS NOT NULL
                     AND b.expiry_date >= CURDATE()
                     AND b.expiry_date < DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                    THEN 'NearExpiry'

                -- 3. Tồn kho thấp: current_stock < 1000
                WHEN COALESCE(inv.current_stock, 0) < 1000
                    THEN 'LowStock'

                -- 4. Còn hàng
                ELSE 'In Stock'
            END AS status
        FROM batches b
        JOIN ingredients i 
            ON b.ingredient_id = i.ingredient_id
        LEFT JOIN inventory inv 
            ON i.ingredient_id = inv.ingredient_id
        WHERE b.lot_code LIKE %s
    """

    cursor.execute(query, (f"{lot_code}%",))
    lot_data = dictfetchall(cursor)

    cursor.close()
    conn.close()

    return jsonify(lot_data), 200
class InventoryController:
    @staticmethod
    def list_inventory():
        """List all inventory items"""
        try:
            from models.ingredient import Ingredient
            from models.batch import get_all_batches  # If exists, or implement
            inventory = Ingredient.get_all()  # Assuming method exists
            return {'success': True, 'data': inventory}, 200
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

    @staticmethod
    def get_inventory_by_id(inventory_id):
        """Get specific inventory item"""
        try:
            from models.ingredient import Ingredient
            item = Ingredient.get_by_id(inventory_id)  # Assuming method exists
            if not item:
                return {'success': False, 'error': 'inventory not found'}, 404
            return {'success': True, 'data': item}, 200
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

    @staticmethod
    def update_stock(ingredient_id, quantity, unit):
        """Update stock quantity"""
        try:
            from utils.db import get_conn
            conn = get_conn()
            cur = conn.cursor()
            cur.execute("""
                UPDATE inventory 
                SET current_stock = %s, unit = %s 
                WHERE ingredient_id = %s
            """, (quantity, unit, ingredient_id))
            conn.commit()
            cur.close()
            conn.close()
            return {'success': True, 'message': 'Stock updated'}, 200
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

def consume_ingredient_batches(ingredient_id: int, required_qty: float):
    """
    Trừ kho theo lô cho 1 nguyên liệu:
    - Chỉ dùng các lô còn hạn (expiry_date >= today)
    - Ưu tiên lô có expiry_date nhỏ nhất (sắp hết hạn trước)
    - Nếu không đủ từ các lô còn hạn -> raise error (KHÔNG lấy từ lô hết hạn)
    """
    today = date.today()
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)

        # 1) Lấy tất cả lô còn hạn, còn qty > 0
        cur.execute("""
            SELECT batch_id, lot_code, qty, expiry_date
            FROM batches
            WHERE ingredient_id = %s
              AND qty > 0
              AND expiry_date >= %s
            ORDER BY expiry_date ASC, batch_id ASC
        """, (ingredient_id, today))
        batches = cur.fetchall()

        remaining = required_qty
        used_batches = []

        for b in batches:
            if remaining <= 0:
                break

            available = float(b["qty"])
            take = min(available, remaining)
            if take <= 0:
                continue

            new_qty = available - take

            # 2) Cập nhật lại qty cho lô
            cur.execute("""
                UPDATE batches
                SET qty = %s
                WHERE batch_id = %s
            """, (new_qty, b["batch_id"]))

            used_batches.append({
                "batch_id": b["batch_id"],
                "lot_code": b["lot_code"],
                "used_qty": take
            })
            remaining -= take

        # 3) Nếu sau khi đi hết các lô còn hạn mà vẫn thiếu -> báo lỗi, KHÔNG lấy lô hết hạn
        if remaining > 1e-6:
            conn.rollback()
            raise ValueError("Not enough non-expired stock for ingredient_id=%s" % ingredient_id)

        # 4) Cập nhật inventory tổng
        cur.execute("""
            UPDATE inventory
            SET current_stock = current_stock - %s
            WHERE ingredient_id = %s
        """, (required_qty, ingredient_id))

        conn.commit()
        return used_batches
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


















