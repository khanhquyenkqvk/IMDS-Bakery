# backend/views/admin_report_views.py
from flask import Blueprint, jsonify
from datetime import date, datetime, timedelta

from backend.utils.db import get_conn, dictfetchall

bp_admin_report = Blueprint('bp_admin_report', __name__)


# ==============
# Helper
# ==============

def _safe_percent(numerator, denominator):
    if not denominator or denominator == 0:
        return 0.0
    return round(float(numerator) * 100.0 / float(denominator), 1)


# ============================================
# 1) SUMMARY CARDS
# ============================================

@bp_admin_report.route('/api/admin/report/summary', methods=['GET'])
def admin_report_summary():
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1. total inventory lots (all batches not UsedUp)
        cur.execute("""
            SELECT COUNT(*) 
            FROM batches 
            WHERE status <> 'UsedUp'
        """)
        row = cur.fetchone()
        total_lots = int(row[0]) if row else 0

        # 2. trend: compare import quantity last 30d vs previous 30d
        today = date.today()
        last_30_from = today - timedelta(days=30)
        prev_30_from = today - timedelta(days=60)

        cur.execute("""
            SELECT COALESCE(SUM(quantity), 0) 
            FROM transactions
            WHERE type = 'Import'
              AND created_at >= %s
              AND created_at < %s
        """, (last_30_from, today))
        last_30_import = float(cur.fetchone()[0])

        cur.execute("""
            SELECT COALESCE(SUM(quantity), 0) 
            FROM transactions
            WHERE type = 'Import'
              AND created_at >= %s
              AND created_at < %s
        """, (prev_30_from, last_30_from))
        prev_30_import = float(cur.fetchone()[0])

        trend_percent = _safe_percent(last_30_import - prev_30_import,
                                      prev_30_import if prev_30_import > 0 else last_30_import)
        if trend_percent > 5:
            trend_label = "Up"
        elif trend_percent < -5:
            trend_label = "Down"
        else:
            trend_label = "Stable"

        # 3. waste rate 30 days: Waste / (Use + Export + Waste)
        cur.execute("""
            SELECT 
                SUM(CASE WHEN type = 'Waste' THEN quantity ELSE 0 END) AS waste_qty,
                SUM(CASE WHEN type IN ('Use','Export','Waste') THEN quantity ELSE 0 END) AS total_used
            FROM transactions
            WHERE created_at >= %s
        """, (last_30_from,))
        waste_row = cur.fetchone()
        waste_qty = float(waste_row[0] or 0)
        total_used = float(waste_row[1] or 0)
        waste_rate = _safe_percent(waste_qty, total_used)

        result = {
            "total_inventory_lots": total_lots,
            "trend_percent": trend_percent,
            "trend_label": trend_label,
            "waste_rate": waste_rate,
            # tạm thời cấu hình cứng
            "auto_reporting_enabled": True,
            "auto_reporting_frequency": "Daily"
        }
        return jsonify({"success": True, "data": result})
    except Exception as e:
        print("Error in admin_report_summary:", e)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()


# ============================================
# 2) INVENTORY KPI CARDS
# ============================================

@bp_admin_report.route('/api/admin/report/inventory-kpi', methods=['GET'])
def admin_report_inventory_kpi():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                COUNT(*) AS total_lots,
                SUM(CASE WHEN status IN ('Valid','Opened') THEN 1 ELSE 0 END) AS good_lots,
                SUM(CASE WHEN status = 'NearExpiry' THEN 1 ELSE 0 END) AS warning_lots,
                SUM(CASE WHEN status = 'Expired' THEN 1 ELSE 0 END) AS danger_lots
            FROM batches
            WHERE quantity > 0
        """)
        row = cur.fetchone()
        total = float(row[0] or 0)
        good = float(row[1] or 0)
        warning = float(row[2] or 0)
        danger = float(row[3] or 0)

        data = {
            "total_lots": int(total),
            "good": {
                "count": int(good),
                "percent": _safe_percent(good, total),
            },
            "warning": {
                "count": int(warning),
                "percent": _safe_percent(warning, total),
            },
            "danger": {
                "count": int(danger),
                "percent": _safe_percent(danger, total),
            },
        }
        return jsonify({"success": True, "data": data})
    except Exception as e:
        print("Error in admin_report_inventory_kpi:", e)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()


# ============================================
# 3) INVENTORY OVERVIEW (BAR + DOUGHNUT)
# ============================================

@bp_admin_report.route('/api/admin/report/inventory-overview', methods=['GET'])
def admin_report_inventory_overview():
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Top 5 ingredients by current stock
        cur.execute("""
            SELECT i.name, inv.current_stock
            FROM inventory inv
            JOIN ingredients i ON inv.ingredient_id = i.ingredient_id
            ORDER BY inv.current_stock DESC
        """)
        rows = cur.fetchall()
        labels, data = [], []
        others_total = 0.0

        for idx, (name, qty) in enumerate(rows):
            qty = float(qty or 0)
            if idx < 5:
                labels.append(name)
                data.append(qty)
            else:
                others_total += qty
        if others_total > 0:
            labels.append("Others")
            data.append(others_total)

        # Đếm trạng thái theo batches
        cur.execute("""
            SELECT
                SUM(CASE WHEN status = 'Expired'    AND quantity > 0 THEN 1 ELSE 0 END) AS critical,
                SUM(CASE WHEN status = 'NearExpiry' AND quantity > 0 THEN 1 ELSE 0 END) AS low,
                SUM(CASE WHEN status IN ('Valid','Opened') AND quantity > 0 THEN 1 ELSE 0 END) AS good
            FROM batches
        """)
        critical, low, good = cur.fetchone()
        status_data = {
            "critical": int(critical or 0),
            "low": int(low or 0),
            "good": int(good or 0),
        }

        return jsonify({
            "success": True,
            "data": {
                "distribution": {"labels": labels, "values": data},
                "status": status_data
            }
        })
    except Exception as e:
        print("Error in admin_report_inventory_overview:", e)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

# ============================================
# 4) INVENTORY DETAIL TABLE
# ============================================

@bp_admin_report.route('/api/admin/report/inventory-detail', methods=['GET'])
def admin_report_inventory_detail():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                i.ingredient_id,
                i.name AS ingredient_name,
                inv.current_stock,
                inv.unit,
                COUNT(b.batch_id) AS lot_count
            FROM inventory inv
            JOIN ingredients i ON inv.ingredient_id = i.ingredient_id
            LEFT JOIN batches b 
                ON b.ingredient_id = i.ingredient_id
               AND b.quantity > 0
               AND b.status <> 'UsedUp'
            GROUP BY i.ingredient_id, i.name, inv.current_stock, inv.unit
            ORDER BY i.name
        """)
        rows = dictfetchall(cur)

        items = []
        for r in rows:
            stock = float(r["current_stock"] or 0)
            unit = r["unit"]

            status_text = "Full stock"
            status_level = "green"

            if stock <= 0:
                status_text = "Empty"
                status_level = "red"
            else:
                if unit in ("g", "ml"):
                    if stock < 1000:
                        status_text = "Nearly empty"
                        status_level = "yellow"
                elif unit == "each":
                    if stock < 30:
                        status_text = "Nearly empty"
                        status_level = "yellow"

            items.append({
                "ingredient_id": r["ingredient_id"],
                "ingredient_name": r["ingredient_name"],
                "current_stock": stock,
                "unit": unit,
                "lot_count": int(r["lot_count"] or 0),
                "status_text": status_text,
                "status_level": status_level
            })

        return jsonify({"success": True, "items": items})
    except Exception as e:
        print("Error in admin_report_inventory_detail:", e)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()


# ============================================
# 5) TREND (IMPORT / EXPORT / WASTE)
# ============================================

@bp_admin_report.route('/api/admin/report/trend', methods=['GET'])
def admin_report_trend():
    conn = get_conn()
    cur = conn.cursor()
    try:
        today = date.today()
        start_date = today - timedelta(days=6)  # last 7 days

        cur.execute("""
            SELECT 
                DATE(created_at) AS d,
                SUM(CASE WHEN type = 'Import' THEN quantity ELSE 0 END) AS import_qty,
                SUM(CASE WHEN type = 'Export' THEN quantity ELSE 0 END) AS export_qty,
                SUM(CASE WHEN type = 'Waste' THEN quantity ELSE 0 END) AS waste_qty
            FROM transactions
            WHERE created_at >= %s
            GROUP BY DATE(created_at)
        """, (start_date,))
        rows = dictfetchall(cur)

        # Map date -> values
        data_by_date = {r["d"].isoformat(): r for r in rows}

        labels = []
        import_list = []
        export_list = []
        deduct_list = []

        for i in range(7):
            d = start_date + timedelta(days=i)
            key = d.isoformat()
            labels.append(d.strftime("%a"))  # Mon, Tue, ...
            row = data_by_date.get(key)
            if row:
                import_list.append(float(row["import_qty"] or 0))
                export_list.append(float(row["export_qty"] or 0))
                deduct_list.append(float(row["waste_qty"] or 0))
            else:
                import_list.append(0)
                export_list.append(0)
                deduct_list.append(0)

        summary = {
            "import": round(sum(import_list), 1),
            "export": round(sum(export_list), 1),
            "deduct": round(sum(deduct_list), 1)
        }

        return jsonify({
            "success": True,
            "data": {
                "labels": labels,
                "import": import_list,
                "export": export_list,
                "deduct": deduct_list,
                "summary": summary
            }
        })
    except Exception as e:
        print("Error in admin_report_trend:", e)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()


# ============================================
# 6) ANALYSIS (PERFORMANCE + RECOMMENDATIONS)
# ============================================

@bp_admin_report.route('/api/admin/report/analysis', methods=['GET'])
def admin_report_analysis():
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Waste rate (30 days)
        today = date.today()
        last_30_from = today - timedelta(days=30)
        cur.execute("""
            SELECT 
                SUM(CASE WHEN type = 'Waste' THEN quantity ELSE 0 END) AS waste_qty,
                SUM(CASE WHEN type IN ('Use','Export','Waste') THEN quantity ELSE 0 END) AS total_used
            FROM transactions
            WHERE created_at >= %s
        """, (last_30_from,))
        row = cur.fetchone()
        waste_qty = float(row[0] or 0)
        total_used = float(row[1] or 0)
        waste_rate = _safe_percent(waste_qty, total_used)

        # Good inventory ratio: % stock in batches Valid + Opened
        cur.execute("""
            SELECT
                SUM(CASE WHEN b.status IN ('Valid','Opened') THEN b.quantity ELSE 0 END) AS good_qty,
                SUM(b.quantity) AS total_qty
            FROM batches b
            WHERE b.quantity > 0
        """)
        row = cur.fetchone()
        good_qty = float(row[0] or 0)
        total_qty = float(row[1] or 0)
        good_ratio = _safe_percent(good_qty, total_qty)

                # ============================
        # FIFO performance (chuẩn hơn)
        # ============================
        # Ý tưởng:
        # - Ước lượng "initial_qty" cho từng batch:
        #       initial = current_qty + sum(Use/Export/Waste đã ghi vào transactions)
        # - Duyệt tất cả giao dịch Use/Export theo thời gian cho từng ingredient
        # - Với mỗi transaction:
        #       + Xem còn batch nào CŨ HƠN (manufacture_date nhỏ hơn) mà vẫn còn "remaining" > 0 không
        #       + Nếu KHÔNG còn batch cũ hơn nào có remaining > 0 -> đây là dùng ĐÚNG FIFO
        #       + Nếu CÒN -> đây là dùng SAI FIFO
        #
        # FIFO_rate = (tổng lượng dùng đúng FIFO) / (tổng lượng dùng)

        # 1) Lấy thông tin batches + ước lượng initial_qty cho mỗi batch
        cur.execute("""
            SELECT
                b.batch_id,
                b.ingredient_id,
                b.manufacture_date,
                b.quantity AS current_qty,
                COALESCE(SUM(
                    CASE 
                        WHEN t.type IN ('Use', 'Export', 'Waste') THEN t.quantity
                        ELSE 0
                    END
                ), 0) AS used_qty
            FROM batches b
            LEFT JOIN transactions t ON t.batch_id = t.batch_id
            GROUP BY b.batch_id, b.ingredient_id, b.manufacture_date, b.quantity
        """)
        batch_rows = cur.fetchall()

        from collections import defaultdict

        batches_by_ing = defaultdict(list)

        for batch_id, ing_id, md, current_qty, used_qty in batch_rows:
            ing_id = int(ing_id)
            current_qty = float(current_qty or 0)
            used_qty = float(used_qty or 0)

            # Ước lượng quantity ban đầu = hiện tại + đã dùng + đã waste
            initial_qty = current_qty + used_qty

            batches_by_ing[ing_id].append({
                "batch_id": int(batch_id),
                "md": md,                      # manufacture_date (datetime/date)
                "initial": initial_qty,
                "remaining": initial_qty
            })

        # Sắp xếp batches mỗi ingredient theo ngày sản xuất (FIFO)
        for ing_id, lst in batches_by_ing.items():
            lst.sort(key=lambda x: (x["md"] or date(1900, 1, 1), x["batch_id"]))

        # Map batch_id -> (ingredient_id, index trong FIFO list)
        batch_index = {}
        for ing_id, lst in batches_by_ing.items():
            for idx, info in enumerate(lst):
                batch_index[info["batch_id"]] = (ing_id, idx)

        # 2) Lấy tất cả giao dịch Use/Export theo thời gian
        cur.execute("""
            SELECT 
                t.transaction_id,
                t.batch_id,
                t.quantity,
                t.created_at
            FROM transactions t
            WHERE t.type IN ('Use', 'Export')
            ORDER BY t.created_at ASC, t.transaction_id ASC
        """)
        tx_rows = cur.fetchall()

        total_use = 0.0    # tổng lượng dùng (Use + Export)
        fifo_use = 0.0     # tổng lượng dùng ĐÚNG FIFO

        for tx_id, batch_id, qty, created_at in tx_rows:
            qty = float(qty or 0)
            if qty <= 0:
                continue

            batch_id = int(batch_id)
            if batch_id not in batch_index:
                total_use += qty
                continue

            ing_id, idx = batch_index[batch_id]
            batch_list = batches_by_ing[ing_id]
            this_batch = batch_list[idx]

            if this_batch["remaining"] <= 0:
                total_use += 0  
                continue

            # Số lượng thực tế trừ được từ batch này
            used_from_this = min(qty, this_batch["remaining"])

            # Kiểm tra xem CÒN batch nào CŨ HƠN mà vẫn còn hàng không:
            older_remaining = 0.0
            for older in batch_list[:idx]:  # tất cả batch có index < idx => cũ hơn
                older_remaining += max(older["remaining"], 0.0)

            total_use += used_from_this

            if older_remaining <= 0:
                # Không còn batch cũ hơn còn hàng -> dùng ĐÚNG FIFO
                fifo_use += used_from_this
            else:
                # Vẫn còn batch cũ hơn chưa dùng hết -> dùng SAI FIFO (không cộng vào fifo_use)
                pass

            # Trừ tồn của batch hiện tại
            this_batch["remaining"] -= used_from_this
            if this_batch["remaining"] < 0:
                this_batch["remaining"] = 0.0

        fifo_rate = _safe_percent(fifo_use, total_use)

        performance = {
            "wasteRate": waste_rate,
            "goodRatio": good_ratio,
            "fifo": fifo_rate
        }


        # Recommendations (simple rules)
        recs = []

        # Waste
        if waste_rate <= 5:
            recs.append({
                "type": "good",
                "title": "Good",
                "text": "Waste rate is currently below the 5% target."
            })
        else:
            recs.append({
                "type": "urgent",
                "title": "Urgent",
                "text": "Waste rate exceeds 5%. Review low-turnover ingredients and near-expiry batches."
            })

        # inventory health
        if good_ratio >= 70:
            recs.append({
                "type": "note",
                "title": "inventory balance",
                "text": "Good inventory ratio is above 70%, stock is generally healthy."
            })
        else:
            recs.append({
                "type": "suggest",
                "title": "Re-balance stock",
                "text": "Good inventory ratio is low. Consider importing more for key ingredients and clearing expired ones."
            })

        # FIFO
        if fifo_rate >= 90:
            recs.append({
                "type": "good",
                "title": "FIFO performance",
                "text": "Most usage follows FIFO principle, helping reduce expiry waste."
            })
        else:
            recs.append({
                "type": "suggest",
                "title": "Improve FIFO usage",
                "text": "Some usage is not from the oldest batches. Remind staff to always pick the earliest lot."
            })

        # Extra general suggestion
        recs.append({
            "type": "suggest",
            "title": "Inspection",
            "text": "Increase routine checks for batches that are NearExpiry or frequently wasted."
        })

        return jsonify({
            "success": True,
            "data": {
                "performance": performance,
                "recommendations": recs
            }
        })
    except Exception as e:
        print("Error in admin_report_analysis:", e)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()
