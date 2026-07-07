# backend/views/warehouse_views.py
import io
from flask import Blueprint, jsonify, request, send_file
from datetime import datetime, date, timedelta
from openpyxl import Workbook
from backend.utils.db import get_conn, dictfetchall

bp_warehouse = Blueprint("bp_warehouse", __name__)

def _date_to_iso(d):
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.isoformat()
    if isinstance(d, date):
        return datetime.combine(d, datetime.min.time()).isoformat()
    return str(d)


@bp_warehouse.route("/api/warehouse/dashboard", methods=["GET"])
def get_warehouse_dashboard():
    conn = get_conn()
    cur = conn.cursor()
    try:
        # -------- 1. Activity list --------
        sql_activities = """
            SELECT
                t.transaction_id,
                t.created_at,
                t.type,
                i.name AS ingredient_name,
                b.lot_code,
                t.quantity,
                t.unit,
                COALESCE(u.full_name, u.username) AS employee_name
            FROM transactions t
            JOIN batches b ON t.batch_id = b.batch_id
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            LEFT JOIN users u ON t.created_by = u.user_id
            ORDER BY t.created_at DESC
            LIMIT 100
        """
        cur.execute(sql_activities)
        activities = dictfetchall(cur)
        for row in activities:
            row["created_at"] = _date_to_iso(row.get("created_at"))

        # -------- 2. Summary cards --------
        sql_summary_tx = """
            SELECT
                SUM(CASE WHEN t.type = 'Import' THEN 1 ELSE 0 END) AS total_imports,
                SUM(CASE WHEN t.type = 'Export' THEN 1 ELSE 0 END) AS total_exports,
                SUM(CASE WHEN t.type IN ('Use','Waste','Adjust') THEN 1 ELSE 0 END) AS total_loss
            FROM transactions t
        """
        cur.execute(sql_summary_tx)
        summary_tx = dictfetchall(cur)[0]

        sql_current_inventory = """
            SELECT COUNT(*) AS current_batches
            FROM batches
            WHERE status IN ('Valid','NearExpiry','Opened')
        """
        cur.execute(sql_current_inventory)
        current_inventory = dictfetchall(cur)[0]

        summary = {
            "total_import_batches": int(summary_tx.get("total_imports") or 0),
            "total_export_batches": int(summary_tx.get("total_exports") or 0),
            "total_loss_batches": int(summary_tx.get("total_loss") or 0),
            "current_inventory_batches": int(current_inventory.get("current_batches") or 0),
        }

        # -------- 3. Top employee --------
        sql_top_employee = """
            SELECT
                COALESCE(u.full_name, u.username) AS employee_name,
                u.username,
                u.user_id,
                COUNT(*) AS tx_count
            FROM transactions t
            JOIN users u ON t.created_by = u.user_id
            GROUP BY u.user_id
            ORDER BY tx_count DESC
            LIMIT 1
        """
        cur.execute(sql_top_employee)
        top_emp_rows = dictfetchall(cur)
        top_employee = top_emp_rows[0] if top_emp_rows else None
        if top_employee:
            top_employee["tx_count"] = int(top_employee.get("tx_count") or 0)

        # -------- 4. Top imported ingredient --------
        sql_top_import_ing = """
            SELECT
                i.ingredient_id,
                i.name AS ingredient_name,
                COUNT(*) AS import_batches
            FROM transactions t
            JOIN batches b ON t.batch_id = b.batch_id
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            WHERE t.type = 'Import'
            GROUP BY i.ingredient_id
            ORDER BY import_batches DESC
            LIMIT 1
        """
        cur.execute(sql_top_import_ing)
        top_ing_rows = dictfetchall(cur)
        top_import_ingredient = top_ing_rows[0] if top_ing_rows else None
        if top_import_ingredient:
            top_import_ingredient["import_batches"] = int(top_import_ingredient.get("import_batches") or 0)

        # -------- 5. Expiring soon (7 ngày) --------
        today = date.today()
        soon = today + timedelta(days=7)

        sql_expiring = """
            SELECT
                b.lot_code,
                i.name AS ingredient_name,
                b.expiry_date
            FROM batches b
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            WHERE b.expiry_date IS NOT NULL
              AND b.status IN ('Valid','NearExpiry','Opened')
              AND b.expiry_date BETWEEN %s AND %s
            ORDER BY b.expiry_date ASC
            LIMIT 10
        """
        cur.execute(sql_expiring, (today, soon))
        exp_rows = dictfetchall(cur)

        expiring_soon = []
        for row in exp_rows:
            exp_date = row.get("expiry_date")
            if isinstance(exp_date, datetime):
                exp_date = exp_date.date()
            days_left = (exp_date - today).days if exp_date else None
            expiring_soon.append({
                "lot_code": row["lot_code"],
                "ingredient_name": row["ingredient_name"],
                "expiry_date": exp_date.isoformat() if exp_date else None,
                "days_left": days_left,
            })

        stats = {
            "top_employee": top_employee,
            "top_import_ingredient": top_import_ingredient,
            "expiring_soon": expiring_soon,
        }

        # -------- 6. Periodic weekly summary (last 8 weeks) --------
        sql_weeks = """
            SELECT
                YEARWEEK(t.created_at, 3) AS yw,
                YEAR(t.created_at) AS year_num,
                WEEK(t.created_at, 3) AS week_num,
                MIN(DATE(t.created_at)) AS start_date,
                MAX(DATE(t.created_at)) AS end_date,
                SUM(CASE WHEN t.type = 'Import' THEN 1 ELSE 0 END) AS import_batches,
                SUM(CASE WHEN t.type = 'Export' THEN 1 ELSE 0 END) AS export_batches,
                SUM(CASE WHEN t.type IN ('Use','Waste','Adjust') THEN 1 ELSE 0 END) AS expect_batches
            FROM transactions t
            GROUP BY yw, year_num, week_num
            ORDER BY yw DESC
            LIMIT 8
        """
        cur.execute(sql_weeks)
        week_rows = dictfetchall(cur)

        periodic_summary = []
        for row in week_rows:
            start_d = row.get("start_date")
            end_d = row.get("end_date")
            if isinstance(start_d, datetime):
                start_d = start_d.date()
            if isinstance(end_d, datetime):
                end_d = end_d.date()

            # Ending balance tại cuối tuần
            sql_ending = """
                SELECT COUNT(*) AS ending_batches
                FROM batches
                WHERE status IN ('Valid','NearExpiry','Opened')
                  AND (manufacture_date IS NULL OR manufacture_date <= %s)
                  AND (expiry_date IS NULL OR expiry_date >= %s)
            """
            cur.execute(sql_ending, (end_d, end_d))
            ending_row = dictfetchall(cur)[0]
            ending_balance = int(ending_row.get("ending_batches") or 0)

            week_num = int(row["week_num"])
            year_num = int(row["year_num"])

            week_label = f"Week {week_num}/{year_num}"
            if start_d and end_d:
                time_range = f"{start_d.strftime('%d/%m')} – {end_d.strftime('%d/%m')}"
            else:
                time_range = ""

            periodic_summary.append({
                "year": year_num,
                "week": week_num,
                "week_label": week_label,
                "time_range": time_range,
                "import_batches": int(row.get("import_batches") or 0),
                "export_batches": int(row.get("export_batches") or 0),
                "expect_batches": int(row.get("expect_batches") or 0),
                "ending_balance_batches": ending_balance,
            })


        return jsonify({
            "status": "success",
            "summary": summary,
            "activities": activities,
            "stats": stats,
            "periodic_summary": periodic_summary,
        }), 200

    except Exception as e:
        print("Error in /api/warehouse/dashboard:", e)
        conn.rollback()
        return jsonify({"status": "error", "message": "Failed to load warehouse data"}), 500
    finally:
        cur.close()
        conn.close()
@bp_warehouse.route("/api/warehouse/summary-export", methods=["GET"])
def export_weekly_summary_excel():
    """
    Export Excel: chi tiết transaction của 1 tuần (Year + Week).
    Query params:
      - year: 2025
      - week: 43   (ISO week, trùng với WEEK(...,3) trong MySQL)
    """
    year = request.args.get("year", type=int)
    week = request.args.get("week", type=int)

    if not year or not week:
        return jsonify({
            "status": "error",
            "message": "Missing year or week query parameters"
        }), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        # Lấy chi tiết transaction trong tuần đó
        sql = """
            SELECT
                t.created_at,
                t.type,
                i.name AS ingredient_name,
                b.lot_code,
                t.quantity,
                t.unit,
                COALESCE(u.full_name, u.username) AS employee_name,
                t.note
            FROM transactions t
            JOIN batches b ON t.batch_id = b.batch_id
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            LEFT JOIN users u ON t.created_by = u.user_id
            WHERE YEAR(t.created_at) = %s
              AND WEEK(t.created_at, 3) = %s
            ORDER BY t.created_at ASC
        """
        cur.execute(sql, (year, week))
        rows = dictfetchall(cur)

        # Tạo workbook Excel
        wb = Workbook()
        ws = wb.active
        ws.title = f"Week {week}-{year}"

        # Header
        headers = [
            "Time",
            "Operation type",
            "Product Name",
            "Batch code",
            "Quantity",
            "Unit",
            "Employee",
            "Note",
        ]
        ws.append(headers)

        # Ghi data
        for r in rows:
            created_at = r.get("created_at")
            if isinstance(created_at, (datetime, date)):
                time_str = created_at.strftime("%Y-%m-%d %H:%M")
            else:
                time_str = str(created_at) if created_at is not None else ""

            ws.append([
                time_str,
                r.get("type") or "",
                r.get("ingredient_name") or "",
                r.get("lot_code") or "",
                float(r.get("quantity") or 0),
                r.get("unit") or "",
                r.get("employee_name") or "",
                r.get("note") or "",
            ])

        # Auto width đơn giản
        for col in ws.columns:
            max_length = 0
            col_letter = col[0].column_letter
            for cell in col:
                val = str(cell.value) if cell.value is not None else ""
                if len(val) > max_length:
                    max_length = len(val)
            ws.column_dimensions[col_letter].width = max_length + 2

        # Ghi vào buffer
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        filename = f"warehouse_week_{week}_{year}.xlsx"

        return send_file(
            output,
            as_attachment=True,
            download_name=filename,
            mimetype=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            ),
        )

    except Exception as e:
        print("Error in /api/warehouse/summary-export:", e)
        conn.rollback()
        return jsonify({
            "status": "error",
            "message": "Failed to export weekly summary"
        }), 500
    finally:
        cur.close()
        conn.close()
