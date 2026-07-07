from flask import Blueprint, jsonify, request
from datetime import date, datetime, timedelta
from decimal import Decimal

from backend.utils.db import get_conn, dictfetchall

bp_batches = Blueprint("bp_batches", __name__)


def _normalize_date(d):
    """Convert MySQL date/datetime -> iso string yyyy-mm-dd."""
    if d is None:
        return None
    if isinstance(d, datetime):
        d = d.date()
    return d.isoformat()


# =======================
# 1) Danh sách batch theo FIFO (PB05)
# =======================
@bp_batches.route("/api/batches/fifo", methods=["GET"])
def get_batches_fifo():
    ingredient_id = request.args.get("ingredient_id", type=int)

    conn = get_conn()
    cur = conn.cursor()
    try:
        sql = """
            SELECT
                b.batch_id,
                b.ingredient_id,
                i.name AS ingredient_name,
                b.lot_code,
                b.quantity,
                b.unit,
                b.manufacture_date,
                b.expiry_date,
                b.status,
                b.created_at
            FROM batches b
            INNER JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            WHERE b.quantity > 0
              AND b.status <> 'UsedUp'
        """
        params = []
        if ingredient_id:
            sql += " AND b.ingredient_id = %s"
            params.append(ingredient_id)

        sql += " ORDER BY i.name ASC, b.manufacture_date ASC, b.batch_id ASC"
        cur.execute(sql, params)
        rows = dictfetchall(cur)
    finally:
        cur.close()
        conn.close()

    today = date.today()
    summary = {"total": 0, "active": 0, "nearly_expired": 0, "expired": 0}
    fifo_rows = []

    for r in rows:
        manuf_iso = _normalize_date(r.get("manufacture_date"))
        expiry_iso = _normalize_date(r.get("expiry_date"))

        db_status = r.get("status")
        expiry_date = date.fromisoformat(expiry_iso) if expiry_iso else None

        if expiry_date:
            days_to_expiry = (expiry_date - today).days
        else:
            days_to_expiry = None

        # Phân loại status theo thực tế ngày hiện tại
        if days_to_expiry is None:
            ui_status = "active"
        elif days_to_expiry < 0:
            ui_status = "expired"
        elif days_to_expiry <= 7:  # ví dụ <=7 ngày coi là sắp hết hạn
            ui_status = "nearly-expired"
        else:
            ui_status = "active"

        summary["total"] += 1
        if ui_status == "active":
            summary["active"] += 1
        elif ui_status == "nearly-expired":
            summary["nearly_expired"] += 1
        elif ui_status == "expired":
            summary["expired"] += 1

        fifo_rows.append(
            {
                "batch_id": r["batch_id"],
                "ingredient_id": r["ingredient_id"],
                "ingredient_name": r["ingredient_name"],
                "lot_code": r["lot_code"],
                "quantity": float(r["quantity"]) if r["quantity"] is not None else 0,
                "unit": r["unit"],
                "manufacture_date": manuf_iso,
                "expiry_date": expiry_iso,
                "db_status": db_status,
                "ui_status": ui_status,
                "days_to_expiry": days_to_expiry,
            }
        )

    return jsonify({"status": "success", "batches": fifo_rows, "summary": summary}), 200


# =======================
# 2) API lấy danh sách nguyên liệu cho dropdown Add New
# =======================
@bp_batches.route("/api/batches/ingredients", methods=["GET"])
def get_ingredients_for_batch():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT ingredient_id, name, unit, shelf_life_days
            FROM ingredients
            ORDER BY name ASC
        """
        )
        rows = dictfetchall(cur)
    finally:
        cur.close()
        conn.close()

    return jsonify({"status": "success", "ingredients": rows}), 200


# =======================
# 3) API tạo batch mới (Add New)
# =======================
@bp_batches.route("/api/batches", methods=["POST"])
def create_batch():
    data = request.get_json() or {}
    raw_uid = request.headers.get("X-User-Id")
    try:
        created_by = int(raw_uid) if raw_uid is not None else None
    except (TypeError, ValueError):
        created_by = None  

    ingredient_id = data.get("ingredient_id")
    quantity = data.get("quantity")

    # manufacture_date: ưu tiên ngày client gửi, nếu không thì dùng hôm nay
    manufacture_date_str = data.get("manufacture_date")

    if ingredient_id is None or quantity is None:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "ingredient_id and quantity are required",
                }
            ),
            400,
        )

    try:
        ingredient_id = int(ingredient_id)
        quantity = float(quantity)
        if quantity <= 0:
            raise ValueError("Quantity must be positive")
    except Exception:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Invalid ingredient_id or quantity",
                }
            ),
            400,
        )

    if manufacture_date_str:
        try:
            manufacture_date = datetime.strptime(
                manufacture_date_str, "%Y-%m-%d"
            ).date()
        except Exception:
            manufacture_date = date.today()
    else:
        manufacture_date = date.today()

    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1. Lấy unit & shelf life từ ingredients
        cur.execute(
            "SELECT unit, shelf_life_days FROM ingredients WHERE ingredient_id = %s",
            (ingredient_id,),
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return (
                jsonify({"status": "error", "message": "Ingredient not found"}),
                404,
            )

        unit, shelf_life_days = row

        expiry_date = None
        if shelf_life_days is not None:
            try:
                expiry_date = manufacture_date + timedelta(days=int(shelf_life_days))
            except Exception:
                expiry_date = None

        # 2. Sinh lot_code theo NGÀY (không phụ thuộc ingredient)
        cur.execute(
            "SELECT COUNT(*) FROM batches WHERE manufacture_date = %s",
            (manufacture_date,),
        )
        seq = cur.fetchone()[0] + 1
        lot_code = f"L{manufacture_date.year}-{manufacture_date.month:02d}-{manufacture_date.day:02d}-{seq:02d}"


        # 3. Insert batches
        cur.execute(
            """
            INSERT INTO batches
            (ingredient_id, lot_code, quantity, unit,
             manufacture_date, expiry_date, status, created_by, created_at)
            VALUES (%s, %s, %s, %s,
                    %s, %s, 'Valid', %s, NOW())
        """,
            (
                ingredient_id,
                lot_code,
                quantity,
                unit,
                manufacture_date,
                expiry_date,
                created_by,
            ),
        )
        batch_id = cur.lastrowid

        # 3b. Ghi history vào transactions (Import)
        cur.execute(
            """
            INSERT INTO transactions (batch_id, type, quantity, unit, created_by, note)
            VALUES (%s, 'Import', %s, %s, %s, %s)
        """,
            (
                batch_id,
                Decimal(str(quantity)),
                unit,
                created_by,
                "Admin created batch via Batch Management (PB05)",
            ),
        )

        # 4. Cập nhật / tạo inventory (Decimal an toàn)
        cur.execute(
            "SELECT inventory_id, current_stock FROM inventory WHERE ingredient_id = %s",
            (ingredient_id,),
        )
        inv = cur.fetchone()
        if inv:
            inventory_id, current_stock = inv
            if current_stock is None:
                current_stock = Decimal("0")
            else:
                current_stock = Decimal(str(current_stock))
            new_stock = current_stock + Decimal(str(quantity))
            cur.execute(
                "UPDATE inventory SET current_stock = %s WHERE inventory_id = %s",
                (new_stock, inventory_id),
            )
        else:
            new_stock = Decimal(str(quantity))
            cur.execute(
                """
                INSERT INTO inventory (ingredient_id, current_stock, unit)
                VALUES (%s, %s, %s)
            """,
                (ingredient_id, new_stock, unit),
            )

        conn.commit()

        return (
            jsonify(
                {
                    "status": "success",
                    "message": "Batch created successfully",
                    "batch": {
                        "batch_id": batch_id,
                        "ingredient_id": ingredient_id,
                        "lot_code": lot_code,
                        "quantity": quantity,
                        "unit": unit,
                        "manufacture_date": manufacture_date.isoformat(),
                        "expiry_date": expiry_date.isoformat()
                        if expiry_date
                        else None,
                        "status": "Valid",
                    },
                }
            ),
            201,
        )

    except Exception as e:
        conn.rollback()
        print("[create_batch] ERROR:", e)
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        cur.close()
        conn.close()


# =======================
# 4) API chi tiết batch
# =======================
@bp_batches.route("/api/batches/<int:batch_id>", methods=["GET"])
def get_batch_detail(batch_id):
    conn = get_conn()
    cur = conn.cursor()
    try:
        sql = """
            SELECT
                b.batch_id,
                b.ingredient_id,
                i.name AS ingredient_name,
                b.lot_code,
                b.quantity,
                b.unit,
                b.manufacture_date,
                b.expiry_date,
                b.status,
                b.created_by,
                u.username AS creator_name,
                b.created_at
            FROM batches b
            INNER JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            LEFT JOIN users u ON u.user_id = b.created_by
            WHERE b.batch_id = %s
        """
        cur.execute(sql, (batch_id,))
        rows = dictfetchall(cur)
        if not rows:
            return (
                jsonify({"status": "error", "message": "Batch not found"}),
                404,
            )

        r = rows[0]
        manuf_iso = _normalize_date(r.get("manufacture_date"))
        expiry_iso = _normalize_date(r.get("expiry_date"))

        today = date.today()
        expiry_date = date.fromisoformat(expiry_iso) if expiry_iso else None
        days_remaining = (expiry_date - today).days if expiry_date else None

        db_status = r.get("status")
        if days_remaining is None:
            ui_status = "active"
        elif days_remaining < 0:
            ui_status = "expired"
        elif days_remaining <= 7:
            ui_status = "nearly-expired"
        else:
            ui_status = "active"

        return (
            jsonify(
                {
                    "status": "success",
                    "batch": {
                        "batch_id": r["batch_id"],
                        "ingredient_id": r["ingredient_id"],
                        "ingredient_name": r["ingredient_name"],
                        "lot_code": r["lot_code"],
                        "quantity": float(r["quantity"])
                        if r["quantity"] is not None
                        else 0,
                        "unit": r["unit"],
                        "manufacture_date": manuf_iso,
                        "expiry_date": expiry_iso,
                        "db_status": db_status,
                        "ui_status": ui_status,
                        "created_by": r.get("created_by"),
                        "creator_name": r.get("creator_name"),
                        "days_remaining": days_remaining,
                    },
                }
            ),
            200,
        )
    finally:
        cur.close()
        conn.close()


# =======================
# 5) API update batch
# =======================
@bp_batches.route("/api/batches/<int:batch_id>", methods=["PUT"])
def update_batch(batch_id):
    data = request.get_json() or {}
    raw_uid = request.headers.get("X-User-Id")
    try:
        created_by = int(raw_uid) if raw_uid is not None else None
    except (TypeError, ValueError):
        created_by = None

    conn = get_conn()
    cur = conn.cursor()
    try:
        # Lấy quantity & unit hiện tại để tính chênh lệch
        cur.execute("SELECT quantity, unit FROM batches WHERE batch_id = %s", (batch_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return (
                jsonify({"status": "error", "message": "Batch not found"}),
                404,
            )

        old_quantity, unit = row
        if old_quantity is None:
            old_quantity = Decimal("0")
        else:
            old_quantity = Decimal(str(old_quantity))

        allowed_fields = ["quantity", "manufacture_date", "expiry_date"]
        set_clauses = []
        params = []

        new_quantity = None
        if "quantity" in data:
            new_quantity = Decimal(str(data["quantity"]))
            set_clauses.append("quantity = %s")
            params.append(new_quantity)
        if "manufacture_date" in data:
            set_clauses.append("manufacture_date = %s")
            params.append(data["manufacture_date"])
        if "expiry_date" in data:
            set_clauses.append("expiry_date = %s")
            params.append(data["expiry_date"])

        if not set_clauses:
            cur.close()
            conn.close()
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "No updatable fields provided",
                    }
                ),
                400,
            )

        sql = f"UPDATE batches SET {', '.join(set_clauses)} WHERE batch_id = %s"
        params.append(batch_id)

        # 1. Cập nhật batch
        cur.execute(sql, params)
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            conn.close()
            return (
                jsonify({"status": "error", "message": "Batch not found"}),
                404,
            )

        # 2. Nếu có thay đổi quantity -> ghi transaction Adjust
        created_by = data.get("created_by")

        if new_quantity is not None:
            delta = new_quantity - old_quantity
            if delta != 0:
                cur.execute(
                    """
                    INSERT INTO transactions (batch_id, type, quantity, unit, created_by, note)
                    VALUES (%s, 'Adjust', %s, %s, %s, %s)
                """,
                    (
                        batch_id,
                        delta,
                        unit,
                        created_by,
                        "Admin adjusted batch via Batch Management (PB05)",
                    ),
                )

        conn.commit()
        return jsonify({"status": "success", "message": "Batch updated successfully"}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500

    finally:
        cur.close()
        conn.close()
