from flask import Blueprint, request, jsonify
from utils.db import get_conn, dictfetchall
import mysql.connector
from datetime import datetime, date, timedelta

update_bp = Blueprint('update', __name__)
def get_current_user_id():
    raw_uid = request.headers.get("X-User-Id")
    try:
        return int(raw_uid) if raw_uid is not None else None
    except (TypeError, ValueError):
        return None

@update_bp.route('/api/inventory', methods=['GET'])
def get_inventory():
    conn = get_conn()
    cur = conn.cursor()
    try:
        query = """
        SELECT 
            b.batch_id AS id, 
            b.lot_code AS code,  
            i.name AS name, 
            b.quantity AS quantity, 
            b.unit,
            b.manufacture_date AS received_raw, 
            b.expiry_date AS useby_raw, 
            b.status AS db_status,
            inv.current_stock
        FROM batches b
        LEFT JOIN ingredients i ON b.ingredient_id = i.ingredient_id
        LEFT JOIN inventory inv ON inv.ingredient_id = b.ingredient_id
        WHERE b.status != 'UsedUp'
        ORDER BY b.created_at DESC
        """
        cur.execute(query)
        data = dictfetchall(cur)
        
        for item in data:
            # Parse dates
            for key, new_key in [('received_raw', 'received'), ('useby_raw', 'useby')]:
                if item[key]:
                    try:
                        full_date = datetime.strptime(item[key], '%a, %d %b %Y %H:%M:%S %Z')
                        item[new_key] = full_date.strftime('%Y-%m-%d')
                    except:
                        item[new_key] = 'N/A'
                else:
                    item[new_key] = 'N/A'

            # ✅ Giữ nguyên status đúng từ DB (không map)
            item['status'] = item['db_status'] or 'Valid'

            # Tính low stock theo current_stock < 1000
            current_stock = item.get('current_stock')
            is_low_stock = False
            if current_stock is not None:
                try:
                    is_low_stock = float(current_stock) < 1000
                except (TypeError, ValueError):
                    is_low_stock = False

            item['is_low_stock'] = is_low_stock
            item['stock'] = float(current_stock) if current_stock is not None else None
            item['low_stock_threshold'] = 1000  # cho FE biết ngưỡng đang dùng

            # Format quantity hiển thị
            item['quantity'] = f"{float(item['quantity'] or 0):.2f} {item['unit'] or ''}"

            # Fallback name
            item['name'] = item['name'] or 'Unknown'

            # Clean up field tạm
            del item['db_status']
            del item['received_raw']
            del item['useby_raw']
            del item['unit']
            del item['current_stock']

        print(f"Debug: {len(data)} items, first ID: {data[0]['id'] if data else 'No data'}, name: {data[0]['name'] if data else 'No data'}")
        print(f"Debug: First ID: {data[0]['id'] if data else 'No data'}")
        return jsonify(data)
    except mysql.connector.Error as err:
        print(f"DB Error: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        cur.close()
        conn.close()


@update_bp.route('/api/inventory/<string:lot_code>', methods=['PUT', 'DELETE'])
def inventory_action(lot_code):
    if request.method == 'PUT':
        return update_batch(lot_code)
    if request.method == 'DELETE':
        return delete_batch(lot_code)

def update_batch(lot_code):
    data = request.json
    print(f"Debug PUT: incoming lot_code={lot_code!r}, data={data}")
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    db_status = (data.get('status') or '').strip()
    valid_statuses = {'Valid', 'NearExpiry', 'Expired', 'Opened', 'UsedUp'}
    if db_status not in valid_statuses:
        return jsonify({'error': f'Invalid status value: {db_status}'}), 400

    try:
        received_date = datetime.strptime(data.get('received'), "%Y-%m-%d").date()
        # ban đầu dùng useby người dùng nhập
        input_useby_date = datetime.strptime(data.get('useby'), "%Y-%m-%d").date()
        useby_date = input_useby_date
    except Exception as e:
        print("Date parse error:", e)
        return jsonify({'error': 'Invalid date format. Expected YYYY-MM-DD.'}), 400

    new_lot_code = (data.get('code') or '').strip()
    new_name = (data.get('name') or '').strip()
    qty_val = float(data.get('quantity') or 0)
    unit_val = (data.get('unit') or '').strip() or 'g'

    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id = get_current_user_id()
        # 1️⃣ Lấy batch_id, ingredient_id, expiry_date, status hiện tại
        cur.execute("""
            SELECT batch_id, ingredient_id, expiry_date, status
            FROM batches
            WHERE TRIM(lot_code) = %s
        """, (lot_code.strip(),))
        row = cur.fetchone()
        if not row:
            return jsonify({'error': 'Batch not found'}), 404

        batch_id, ingredient_id, old_expiry, old_status = row
        print(f"Debug: Found batch_id={batch_id}, ingredient_id={ingredient_id}, old_status={old_status}, old_expiry={old_expiry}")

        # 2️⃣ Nếu đổi sang Opened → tính lại hạn mới & ghi opened_packages
        if db_status == 'Opened' and old_status != 'Opened':
            opened_date = date.today()

            # Rule: sau khi mở dùng tối đa 7 ngày (anh chỉnh số ngày tuỳ ý)
            SHELF_AFTER_OPEN_DAYS = 7
            proposed = opened_date + timedelta(days=SHELF_AFTER_OPEN_DAYS)

            if isinstance(old_expiry, date):
                useby_date = min(old_expiry, proposed)
            else:
                useby_date = proposed

            print(f"Debug: Opened package, opened_date={opened_date}, new_expiry={useby_date}")

            # Ghi vào opened_packages (handled_by hiện tạm fix = 1, sau anh map user thật)
            cur.execute("""
                INSERT INTO opened_packages (batch_id, opened_date, new_expiry_date, handled_by)
                VALUES (%s, %s, %s, %s)
            """, (batch_id, opened_date, useby_date, user_id))

        # 3️⃣ Cập nhật thông tin batch (dùng useby_date đã tính ở trên)
        update_query = """
            UPDATE batches
            SET lot_code=%s,
                quantity=%s,
                manufacture_date=%s,
                expiry_date=%s,
                status=%s
            WHERE batch_id=%s
        """
        cur.execute(update_query, (new_lot_code, qty_val, received_date, useby_date, db_status, batch_id))
        print(f"Debug: Rows updated in batches = {cur.rowcount}")

        # 4️⃣ Cập nhật tên nguyên liệu (nếu có)
        if new_name and ingredient_id:
            cur.execute("UPDATE ingredients SET name=%s WHERE ingredient_id=%s", (new_name, ingredient_id))
            print(f"Debug: Updated ingredients.name for ingredient_id={ingredient_id}")

        # 5️⃣ Cập nhật tồn kho
        cur.execute("""
            UPDATE inventory i
            JOIN batches b ON i.ingredient_id = b.ingredient_id
            SET i.current_stock = %s
            WHERE b.batch_id = %s
        """, (qty_val, batch_id))

        # 6️⃣ Ghi transaction
        cur.execute("""
            INSERT INTO transactions (batch_id, type, quantity, unit, created_by, note)
            VALUES (%s, 'Adjust', %s, %s, %s, %s)
        """, (batch_id, qty_val, unit_val, user_id, "Updated by employee via Update page"))

        conn.commit()
        return jsonify({'message': 'Updated successfully', 'new_expiry': useby_date.isoformat()}), 200

    except mysql.connector.Error as err:
        print(f"PUT Error: {err}")
        conn.rollback()
        return jsonify({'error': str(err)}), 500
    finally:
        cur.close()
        conn.close()

def delete_batch(lot_code):
    data = request.json or {}
    reason = (data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': 'Reason is required'}), 400

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        user_id = get_current_user_id()
        print(f"DELETE Debug: Incoming lot_code='{lot_code}'")

        # Lấy đủ thông tin batch
        cur.execute("""
            SELECT batch_id, lot_code, status, quantity, unit, ingredient_id
            FROM batches
            WHERE TRIM(lot_code) = TRIM(%s)
        """, (lot_code,))
        batch = cur.fetchone()

        if not batch:
            return jsonify({'error': 'Batch not found'}), 404

        batch_id = batch['batch_id']
        qty = float(batch['quantity'] or 0)
        unit = batch['unit']
        ingredient_id = batch['ingredient_id']
        old_status = (batch['status'] or '').strip()

        print(f"DELETE Debug: Found batch_id={batch_id}, current_status={old_status}, qty={qty} {unit}")

        # ✅ 1) Đổi trạng thái sang UsedUp
        cur.execute("""
            UPDATE batches
            SET status='UsedUp'
            WHERE batch_id=%s
        """, (batch_id,))
        print(f"DELETE Debug: Rows updated in batches = {cur.rowcount}")

        # ✅ 2) Ghi waste report
        cur.execute("""
            INSERT INTO Waste_Reports (batch_id, reported_by, reason, quantity, unit)
            VALUES (%s, %s, %s, %s, %s)
        """, (batch_id, user_id, reason, qty, unit))
        print("DELETE Debug: Inserted into Waste_Reports")

        # 🔥 3) Ghi Transaction type = 'Waste' để report admin sử dụng
        cur.execute("""
            INSERT INTO transactions (batch_id, type, quantity, unit, created_by, note)
            VALUES (%s, 'Waste', %s, %s, %s, %s)
        """, (batch_id, qty, unit, user_id, reason))
        print("DELETE Debug: Inserted Waste transaction into transactions")

        # 🔥 4) Cập nhật tồn kho inventory (trừ đi số lượng bị waste)
        if ingredient_id is not None:
            cur.execute("""
                UPDATE inventory
                SET current_stock = GREATEST(current_stock - %s, 0)
                WHERE ingredient_id = %s
            """, (qty, ingredient_id))
            print("DELETE Debug: Updated inventory.current_stock")

        # 5) Tạo ALERT Waste cho Owner (giữ logic cũ)
        cur.execute("""
            SELECT alert_id
            FROM alerts
            WHERE batch_id = %s
              AND alert_type = 'Waste'
              AND status = 'Pending'
            LIMIT 1
        """, (batch_id,))
        existing_alert = cur.fetchone()

        if not existing_alert:
            reason_lower = reason.lower()
            if 'hỏng' in reason_lower or 'hong' in reason_lower or old_status == 'Expired':
                severity = 'Red'
            else:
                severity = 'Yellow'

            cur.execute("""
                INSERT INTO alerts (batch_id, alert_type, severity, status, resolved_by)
                VALUES (%s, 'Waste', %s, 'Pending', NULL)
            """, (batch_id, severity))
            print("DELETE Debug: Inserted Waste alert into alerts")
        else:
            print("DELETE Debug: Waste alert already exists, skip insert.")

        conn.commit()
        print(f"DELETE Debug: ✅ Marked batch_id={batch_id} as UsedUp (soft delete).")

        return jsonify({
            'message': 'Deleted successfully (status changed to UsedUp).',
            'deleted_id': batch_id
        }), 200

    except mysql.connector.Error as err:
        conn.rollback()
        print(f"DELETE Error: {err}")
        return jsonify({'error': str(err)}), 500
    finally:
        cur.close()
        conn.close()






