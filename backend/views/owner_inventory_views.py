# backend/views/owner_inventory_views.py
from flask import Blueprint, jsonify, request
from datetime import date, datetime, timedelta
from backend.utils.db import get_conn, dictfetchall
import mysql.connector

bp_owner_inventory = Blueprint('bp_owner_inventory', __name__)


def _normalize_date(d):
    if d is None:
        return None
    if isinstance(d, datetime):
        d = d.date()
    return d.isoformat()
def _get_current_user_id():
    raw_uid = request.headers.get("X-User-Id")
    try:
        return int(raw_uid) if raw_uid is not None else None
    except (TypeError, ValueError):
        return None


# ============================
# 1) Summary cho dòng cảnh báo
# ============================
@bp_owner_inventory.route('/api/owner/inventory/summary', methods=['GET'])
def owner_inventory_summary():
    conn = get_conn()
    cur = conn.cursor()
    try:
        today = date.today()
        in_2_days = today + timedelta(days=2)

        # 1) Số batch đã hết hạn
        cur.execute("""
            SELECT COUNT(*) AS cnt
            FROM batches
            WHERE (expiry_date IS NOT NULL AND expiry_date < %s)
               OR status = 'Expired'
        """, (today,))
        expired = cur.fetchone()[0] or 0

        # 2) Số batch sẽ hết hạn trong 48h
        cur.execute("""
            SELECT COUNT(*) AS cnt
            FROM batches
            WHERE expiry_date IS NOT NULL
              AND expiry_date BETWEEN %s AND %s
              AND status <> 'Expired'
        """, (today, in_2_days))
        expiring_48h = cur.fetchone()[0] or 0

        # 3) Số nguyên liệu low stock (sử dụng rule current_stock < 1000)
        cur.execute(""" 
            SELECT COUNT(*) AS cnt 
            FROM inventory 
            WHERE current_stock < 1000 
        """) 
        low_stock = cur.fetchone()[0] or 0

        return jsonify({
            "success": True,
            "expired": int(expired),
            "expiring_48h": int(expiring_48h),
            "low_stock": int(low_stock)
        })
    except Exception as e:
        print("owner_inventory_summary error:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()


# ============================
# 2) Danh sách batch cho bảng
# ============================
@bp_owner_inventory.route('/api/owner/inventory/batches', methods=['GET'])
def owner_inventory_batches():
    """
    Trả về toàn bộ batch + ingredient để Owner xem kho.
    Frontend sẽ tự filter/search/sort.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        sql = """
            SELECT
                b.batch_id,
                b.lot_code,
                b.quantity,
                b.unit,
                b.manufacture_date,
                b.expiry_date,
                b.status AS status_db,
                b.ingredient_id,
                i.name AS ingredient_name,
                inv.current_stock
            FROM batches b
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            LEFT JOIN inventory inv ON inv.ingredient_id = b.ingredient_id
            ORDER BY b.expiry_date IS NULL, b.expiry_date ASC, b.batch_id ASC
        """
        cur.execute(sql)
        rows = dictfetchall(cur)

        today = date.today()
         # Tổng quantity cho từng ingredient dùng làm mốc 100% stock
        total_by_ingredient = {}
        for r in rows:
            ing_id = r.get("ingredient_id")
            qty = r.get("quantity") or 0
            try:
                qty = float(qty)
            except (TypeError, ValueError):
                qty = 0.0
            if ing_id is not None:
                total_by_ingredient[ing_id] = total_by_ingredient.get(ing_id, 0.0) + qty

        items = []

        for r in rows:
            m_date = r.get("manufacture_date")
            e_date = r.get("expiry_date")

            m_str = _normalize_date(m_date) if m_date else None
            e_str = _normalize_date(e_date) if e_date else None

            days_to_expiry = None
            if isinstance(e_date, (date, datetime)):
                d = e_date.date() if isinstance(e_date, datetime) else e_date
                days_to_expiry = (d - today).days

            current_stock = r.get("current_stock")
            status_db = r.get("status_db")  # Valid / NearExpiry / Expired / Opened / UsedUp
            ingredient_id = r.get("ingredient_id")

            # Tính % tồn kho cho nguyên liệu này
            total_import = total_by_ingredient.get(ingredient_id) or 0.0
            stock_ratio = None
            is_low_stock = False
            if current_stock is not None and total_import > 0:
                try:
                    stock_ratio = float(current_stock) / float(total_import)
                    is_low_stock = stock_ratio < 0.1  # < 10%
                except (TypeError, ValueError, ZeroDivisionError):
                    is_low_stock = False

            # ===========================
            # STATUS TÍNH THEO THỜI GIAN HIỆN TẠI
            # ===========================
            status_tag = "in_stock"
            status_label = "In Stock"
            priority_color = "green"

            # 1) Nếu batch đã UsedUp thì luôn ưu tiên, không cần quan tâm ngày & stock
            if status_db == "UsedUp":
                status_tag = "usedup"
                status_label = "Used Up"
                priority_color = "gray"
            else:
                # 2) Tính theo expiry_date
                if days_to_expiry is not None:
                    if days_to_expiry < 0:
                        status_tag = "expired"
                        status_label = "Expired"
                        priority_color = "red"
                    elif days_to_expiry <= 2:
                        status_tag = "expiring_48h"
                        status_label = "Expiring in 48h"
                        priority_color = "red"
                    elif days_to_expiry <= 7:
                        status_tag = "near_expiry"
                        status_label = "Expiring Soon"
                        priority_color = "orange"

                # 3) Nếu chưa expired/expiring_48h, giữ trạng thái Opened nếu có
                if status_db == "Opened" and status_tag not in ("expired", "expiring_48h"):
                    status_tag = "opened"
                    status_label = "Opened"
                    priority_color = "green"

                # 4) Low stock < 10% chỉ override khi đang là in_stock hoặc opened
                if status_tag in ("in_stock", "opened") and is_low_stock:
                    status_tag = "low_stock"
                    status_label = "Low Stock"
                    priority_color = "yellow"



            items.append({
                "batch_id": r["batch_id"],
                "lot_code": r["lot_code"],
                "ingredient_id": r["ingredient_id"],
                "ingredient_name": r["ingredient_name"],
                "quantity": float(r["quantity"]) if r["quantity"] is not None else None,
                "unit": r["unit"],
                "manufacture_date": m_str,
                "expiry_date": e_str,
                "status_db": status_db,
                "status_tag": status_tag,
                "status_label": status_label,
                "priority_color": priority_color,
                "days_to_expiry": days_to_expiry,
            })

        return jsonify({"success": True, "items": items})
    except Exception as e:
        print("owner_inventory_batches error:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()


# ============================
# 3) Ingredient list cho dropdown
# ============================
@bp_owner_inventory.route('/api/owner/inventory/ingredients', methods=['GET'])
def owner_inventory_ingredients():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT ingredient_id, name, unit, shelf_life_days
            FROM ingredients
            ORDER BY name
        """)
        rows = dictfetchall(cur)
        return jsonify({"success": True, "items": rows})
    except Exception as e:
        print("owner_inventory_ingredients error:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()


# ============================
# 4) Thêm batch (Add New Item)
# ============================
@bp_owner_inventory.route('/api/owner/inventory/batches', methods=['POST'])
def owner_inventory_create_batch():
    data = request.get_json() or {}

    required = ["ingredient_id", "lot_code", "quantity", "unit",
                "manufacture_date", "expiry_date"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({
            "success": False,
            "message": "Missing fields: " + ", ".join(missing)
        }), 400

    ingredient_id = int(data["ingredient_id"])
    lot_code = data["lot_code"].strip()
    quantity = float(data["quantity"])
    unit = data["unit"].strip()
    manufacture_date = data["manufacture_date"]
    expiry_date = data["expiry_date"]
    status = data.get("status", "Valid")

    # 👇 tạm thời, nếu FE không gửi thì default = 1 (Owner)
    created_by = int(data.get("created_by") or 1)

    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1) Insert batch
        cur.execute("""
            INSERT INTO batches
                (ingredient_id, lot_code, quantity, unit,
                 manufacture_date, expiry_date, status, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (ingredient_id, lot_code, quantity, unit,
              manufacture_date, expiry_date, status, created_by))
        batch_id = cur.lastrowid

        # 2) Cập nhật inventory
        cur.execute("""
            SELECT inventory_id, current_stock
            FROM inventory
            WHERE ingredient_id = %s
        """, (ingredient_id,))
        row = cur.fetchone()
        if row:
            inventory_id, current_stock = row
            cur.execute("""
                UPDATE inventory
                SET current_stock = current_stock + %s, unit = %s
                WHERE inventory_id = %s
            """, (quantity, unit, inventory_id))
        else:
            cur.execute("""
                INSERT INTO inventory (ingredient_id, current_stock, unit)
                VALUES (%s, %s, %s)
            """, (ingredient_id, quantity, unit))

        # 3) 🔥 Ghi log Import vào transactions
        cur.execute("""
            INSERT INTO transactions (batch_id, type, quantity, unit, created_by, note)
            VALUES (%s, 'Import', %s, %s, %s, %s)
        """, (batch_id, quantity, unit, created_by, "Owner imported new batch"))

        conn.commit()
        return jsonify({"success": True, "batch_id": batch_id})
    except Exception as e:
        conn.rollback()
        print("owner_inventory_create_batch error:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()



# ============================
# 5) Cập nhật batch
# ============================
@bp_owner_inventory.route('/api/owner/inventory/batches/<int:batch_id>', methods=['PUT'])
def owner_inventory_update_batch(batch_id):
    data = request.get_json() or {}

    # 👇 ai sửa – lấy từ client hoặc default = 1
    created_by = int(data.get("updated_by") or data.get("created_by") or 1)

    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1) Lấy thông tin cũ
        cur.execute("""
            SELECT ingredient_id, quantity, unit
            FROM batches
            WHERE batch_id = %s
        """, (batch_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "message": "Batch not found"}), 404

        old_ingredient_id, old_qty, old_unit = row

        ingredient_id = int(data.get("ingredient_id", old_ingredient_id))
        lot_code = data.get("lot_code")
        quantity = float(data.get("quantity", old_qty))
        unit = data.get("unit", old_unit)
        manufacture_date = data.get("manufacture_date")
        expiry_date = data.get("expiry_date")
        status = data.get("status", "Valid")

        # 2) Update batch
        cur.execute("""
            UPDATE batches
            SET ingredient_id = %s,
                lot_code = %s,
                quantity = %s,
                unit = %s,
                manufacture_date = %s,
                expiry_date = %s,
                status = %s
            WHERE batch_id = %s
        """, (ingredient_id, lot_code, quantity, unit,
              manufacture_date, expiry_date, status, batch_id))

        # 3) Điều chỉnh inventory
        qty_diff = float(quantity) - float(old_qty)

        if ingredient_id != old_ingredient_id:
            # Trừ stock cũ
            cur.execute("""
                UPDATE inventory
                SET current_stock = GREATEST(current_stock - %s, 0)
                WHERE ingredient_id = %s
            """, (old_qty, old_ingredient_id))

            # Cộng stock mới
            cur.execute("""
                SELECT inventory_id FROM inventory WHERE ingredient_id = %s
            """, (ingredient_id,))
            row = cur.fetchone()
            if row:
                inv_id = row[0]
                cur.execute("""
                    UPDATE inventory
                    SET current_stock = current_stock + %s, unit = %s
                    WHERE inventory_id = %s
                """, (quantity, unit, inv_id))
            else:
                cur.execute("""
                    INSERT INTO inventory (ingredient_id, current_stock, unit)
                    VALUES (%s, %s, %s)
                """, (ingredient_id, quantity, unit))
        else:
            cur.execute("""
                UPDATE inventory
                SET current_stock = GREATEST(current_stock + %s, 0),
                    unit = %s
                WHERE ingredient_id = %s
            """, (qty_diff, unit, ingredient_id))

        # 4) 🔥 Ghi log Adjust (kể cả qty_diff âm hay dương)
        cur.execute("""
            INSERT INTO transactions (batch_id, type, quantity, unit, created_by, note)
            VALUES (%s, 'Adjust', %s, %s, %s, %s)
        """, (batch_id, qty_diff, unit, created_by, "Owner adjusted batch"))

        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        print("owner_inventory_update_batch error:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()



# ============================
# 6) Xóa batch
# ============================
@bp_owner_inventory.route('/api/owner/inventory/batches/<int:batch_id>', methods=['DELETE'])
def owner_inventory_delete_batch(batch_id):
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Lấy batch (thêm unit vào)
        cur.execute("""
            SELECT ingredient_id, quantity, unit, status
            FROM batches
            WHERE batch_id = %s
        """, (batch_id,))
        row = cur.fetchone()

        if not row:
            return jsonify({"success": False, "message": "Batch not found"}), 404

        ingredient_id, quantity, unit, old_status = row

        # Nếu đã UsedUp thì thôi
        if old_status == "UsedUp":
            return jsonify({"success": True, "message": "Batch already marked as used up"})

        # Trừ tồn kho
        cur.execute("""
            UPDATE inventory
            SET current_stock = GREATEST(current_stock - %s, 0)
            WHERE ingredient_id = %s
        """, (quantity, ingredient_id))

        # Soft delete = UsedUp
        cur.execute("""
            UPDATE batches
            SET status = 'UsedUp'
            WHERE batch_id = %s
        """, (batch_id,))

        # 🔥 Ghi log Use vào transactions
        created_by = _get_current_user_id() or 1
        cur.execute("""
            INSERT INTO transactions (batch_id, type, quantity, unit, created_by, note)
            VALUES (%s, 'Use', %s, %s, %s, %s)
        """, (batch_id, quantity, unit, created_by, 'Owner marked batch as UsedUp'))

        conn.commit()
        return jsonify({"success": True, "message": "Batch marked as Used Up"})

    except Exception as e:
        conn.rollback()
        print("soft delete error:", e)
        return jsonify({"success": False, "message": "Server error"}), 500

    finally:
        cur.close()
        conn.close()



@bp_owner_inventory.route('/api/owner/inventory/generate-lotcode', methods=['GET'])
def owner_inventory_generate_lotcode():
    """
    Sinh mã Lot code dạng LYYYY-MM-DD-XX
    XX là số thứ tự trong ngày
    """
    conn = get_conn()
    cur = conn.cursor()

    try:
        today = date.today()
        today_str = today.strftime("%Y-%m-%d")

        cur.execute("""
            SELECT lot_code
            FROM batches
            WHERE manufacture_date = %s
            ORDER BY batch_id DESC
            LIMIT 1
        """, (today,))

        row = cur.fetchone()

        if not row:
            next_number = 1
        else:
            last_lot = row[0]  # ví dụ: L2025-11-27-03
            try:
                last_num = int(last_lot.split("-")[-1])
                next_number = last_num + 1
            except:
                next_number = 1

        lot_code = f"L{today_str}-{next_number:02d}"

        return jsonify({"success": True, "lot_code": lot_code})

    except Exception as e:
        print("generate_lotcode error:", e)
        return jsonify({"success": False, "message": "Server error"}), 500

    finally:
        cur.close()
        conn.close()
