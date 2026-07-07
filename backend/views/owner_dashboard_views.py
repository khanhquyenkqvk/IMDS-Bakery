# backend/views/owner_dashboard_views.py
from flask import Blueprint, jsonify
from datetime import date, timedelta
from backend.utils.db import get_conn, dictfetchall

bp_owner_dashboard = Blueprint('bp_owner_dashboard', __name__)


@bp_owner_dashboard.route('/api/owner/dashboard/summary', methods=['GET'])
def owner_dashboard_summary():
    """
    Trả về số liệu tổng quan cho dashboard Owner:
      - expired_items: số batch đã hết hạn
      - expiring_48h: số batch sẽ hết hạn trong 48h tới
      - low_stock_items: số nguyên liệu đang low stock
      - restock_frequency: số lần nhập kho (Import) trong 30 ngày gần nhất
      - active_products: số menu đang active
      - expiring_soon_7d: số batch hết hạn trong 7 ngày
    """

    conn = get_conn()
    cur = conn.cursor()

    try:
        today = date.today()
        in_2_days = today + timedelta(days=2)
        in_7_days = today + timedelta(days=7)

        # 1. Hết hạn
        sql_expired = """
            SELECT COUNT(*)
            FROM batches
            WHERE expiry_date IS NOT NULL
              AND expiry_date < CURDATE()
              AND status <> 'UsedUp'
        """
        cur.execute(sql_expired)
        expired_items = cur.fetchone()[0]

        # 2. Hết hạn trong 48 giờ
        sql_exp_48 = """
            SELECT COUNT(*)
            FROM batches
            WHERE expiry_date IS NOT NULL
              AND expiry_date >= CURDATE()
              AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 2 DAY)
              AND status <> 'UsedUp'
        """
        cur.execute(sql_exp_48)
        expiring_48h = cur.fetchone()[0]

        # 3. Low stock (tạm dùng ngưỡng 1000 đơn vị – có thể chỉnh sau)
        sql_low_stock = """
            SELECT COUNT(*)
            FROM inventory
            WHERE current_stock < 1000
        """
        cur.execute(sql_low_stock)
        low_stock_items = cur.fetchone()[0]

        # 4. Restock frequency: số transaction Import trong 30 ngày gần đây
        sql_restock = """
            SELECT COUNT(*)
            FROM transactions
            WHERE type = 'Import'
              AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        """
        cur.execute(sql_restock)
        restock_frequency = cur.fetchone()[0]

        # 5. Active products: menu is_active = 1
        sql_active_products = """
            SELECT COUNT(*)
            FROM menu
            WHERE is_active = TRUE
        """
        cur.execute(sql_active_products)
        active_products = cur.fetchone()[0]

        # 6. Expiring soon (7 ngày)
        sql_expiring_7d = """
            SELECT COUNT(*)
            FROM batches
            WHERE expiry_date IS NOT NULL
              AND expiry_date >= CURDATE()
              AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
              AND status <> 'UsedUp'
        """
        cur.execute(sql_expiring_7d)
        expiring_soon_7d = cur.fetchone()[0]

        data = {
            "expired_items": expired_items,
            "expiring_48h": expiring_48h,
            "low_stock_items": low_stock_items,
            "restock_frequency": restock_frequency,
            "active_products": active_products,
            "expiring_soon_7d": expiring_soon_7d
        }

        return jsonify({"success": True, "data": data}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        cur.close()
        conn.close()
@bp_owner_dashboard.route('/api/owner/today-menu', methods=['GET'])
def owner_today_menu():
    """
    Today's menu Details cho Owner:
      - Lấy từ bảng report (report_date = hôm nay)
      - JOIN với menu để lấy tên bánh
    """
    conn = get_conn()
    cur = conn.cursor()

    try:
        today = date.today()


        sql = """
            SELECT
                r.report_id,
                r.menu_id,
                m.name AS product_name,              
                r.produced_quantity AS quantity,     
                r.note,
                r.status
            FROM production_reports r                 
            JOIN menu m ON r.menu_id = m.menu_id
            WHERE r.report_date = %s
            ORDER BY m.name ASC, r.report_id ASC
        """
        cur.execute(sql, (today,))
        rows = dictfetchall(cur)

        # Chuẩn hoá note
        for r in rows:
            if r.get('note') is None:
                r['note'] = ''

        return jsonify({"success": True, "data": rows}), 200

    except Exception as e:
        conn.rollback()
        print("owner_today_menu ERROR:", e)
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@bp_owner_dashboard.route("/api/owner/dashboard/forecast", methods=["GET"])
def api_owner_dashboard_forecast():
  """
  Đọc bảng forecasts + inventory để trả về list cho 7 ngày tới.
  """
  conn = get_conn()
  cur = conn.cursor(dictionary=True)

  # Weekly forecast gần nhất cho mỗi ingredient
  sql = """
    SELECT 
      f.ingredient_id,
      i.name AS ingredient_name,
      f.predicted_quantity AS forecast_qty,
      f.unit,
      inv.current_stock
    FROM forecasts f
    JOIN (
      SELECT ingredient_id, MAX(forecast_date) AS max_date
      FROM forecasts
      WHERE forecast_type = 'Weekly'
      GROUP BY ingredient_id
    ) latest ON latest.ingredient_id = f.ingredient_id
            AND latest.max_date = f.forecast_date
    JOIN ingredients i ON i.ingredient_id = f.ingredient_id
    JOIN inventory inv ON inv.ingredient_id = f.ingredient_id
    ORDER BY i.name
    LIMIT 10
  """
  cur.execute(sql)
  rows = cur.fetchall()
  cur.close()
  conn.close()

  data = []
  for r in rows:
    current_stock = float(r["current_stock"] or 0)
    forecast_qty = float(r["forecast_qty"] or 0.01)  # tránh chia 0
    coverage_pct = round(min(100.0, max(0.0, (current_stock / forecast_qty) * 100)))
    # delta: chênh lệch so với 100% nhu cầu
    delta_pct = coverage_pct - 100
    data.append({
      "ingredient_name": r["ingredient_name"],
      "current_stock": current_stock,
      "forecast_qty": forecast_qty,
      "unit": r["unit"],
      "coverage_pct": coverage_pct,
      "delta_pct": delta_pct,
    })

  return jsonify({"success": True, "data": data})