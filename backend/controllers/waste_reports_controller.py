# waste_reports_controller.py
from flask import Blueprint, request, jsonify
from utils.db import get_conn
import mysql.connector

waste_bp = Blueprint('waste_bp', __name__)

@waste_bp.route('/api/waste-reports/recent', methods=['GET'])
def recent_waste_reports():
    """
    Lấy danh sách waste thực tế từ bảng Waste_Reports + thông tin lô/ nguyên liệu.
    Query params:
      - days: số ngày gần đây (mặc định 7)
      - limit: số bản ghi trả về tối đa (mặc định 50)
      - include_transactions: 0/1, có gộp thêm transactions.type='Waste' hay không (mặc định 0)
    """
    try:
        days = int(request.args.get('days', 7))
        limit = int(request.args.get('limit', 50))
        include_tx = request.args.get('include_transactions', '0') in ('1', 'true', 'True')

        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        # A) Waste_Reports (thực tế hủy)
        query_wr = """
            SELECT
                wr.report_date AS time,
                i.name         AS raw_material,
                b.lot_code     AS batch_code,
                wr.quantity    AS quantity,
                COALESCE(wr.unit, b.unit) AS unit,
                COALESCE(wr.reason, '')   AS reason,
                u.username     AS reported_by,
                'WasteReport'  AS source
            FROM Waste_Reports wr
            JOIN batches b       ON wr.batch_id = b.batch_id
            JOIN ingredients i   ON b.ingredient_id = i.ingredient_id
            LEFT JOIN users u    ON wr.reported_by = u.user_id
            WHERE wr.report_date >= (NOW() - INTERVAL %s DAY)
        """

        params = [days]

        if include_tx:
            # B) transactions.type='Waste' (nếu muốn gộp)
            query_tx = """
                SELECT
                    t.created_at       AS time,
                    i.name             AS raw_material,
                    b.lot_code         AS batch_code,
                    t.quantity         AS quantity,
                    t.unit             AS unit,
                    COALESCE(t.note,'') AS reason,
                    u.username         AS reported_by,
                    'TransactionWaste' AS source
                FROM transactions t
                JOIN batches b       ON t.batch_id = b.batch_id
                JOIN ingredients i   ON b.ingredient_id = i.ingredient_id
                LEFT JOIN users u    ON t.created_by = u.user_id
                WHERE t.type = 'Waste'
                  AND t.created_at >= (NOW() - INTERVAL %s DAY)
            """
            query = f"""
                ({query_wr})
                UNION ALL
                ({query_tx})
                ORDER BY time DESC
                LIMIT %s
            """
            params.extend([days, limit])
        else:
            query = f"""
                {query_wr}
                ORDER BY time DESC
                LIMIT %s
            """
            params.append(limit)

        cur.execute(query, params)
        rows = cur.fetchall()

        return jsonify({"success": True, "data": rows}), 200

    except mysql.connector.Error as err:
        return jsonify({"success": False, "error": str(err)}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        try:
            if conn.is_connected():
                cur.close()
                conn.close()
        except:
            pass
