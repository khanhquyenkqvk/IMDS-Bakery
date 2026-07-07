from flask import Blueprint, jsonify, request
from utils.db import get_conn
import mysql.connector

history_bp = Blueprint('history_bp', __name__)

@history_bp.route('/api/history/implementers', methods=['GET'])
def get_implementers():
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        # Lấy danh sách user có xuất hiện trong transactions / production_reports
        query = """
            SELECT DISTINCT u.full_name AS implementer
            FROM (
                SELECT t.created_by AS user_id
                FROM transactions t
                WHERE t.created_by IS NOT NULL

                UNION ALL

                SELECT pr.created_by AS user_id
                FROM production_reports pr
                WHERE pr.created_by IS NOT NULL
            ) AS x
            JOIN users u ON u.user_id = x.user_id
            WHERE u.full_name IS NOT NULL AND u.full_name <> ''
            ORDER BY u.full_name
        """
        cur.execute(query)
        rows = cur.fetchall()

        # Trả về list username đơn giản
        implementers = [r['implementer'] for r in rows]

        return jsonify({"success": True, "data": implementers}), 200

    except mysql.connector.Error as err:
        return jsonify({"success": False, "error": str(err)}), 500
    finally:
        try:
            if cur:
                cur.close()
            if conn and conn.is_connected():
                conn.close()
        except Exception:
            pass

@history_bp.route('/api/history', methods=['GET'])
def get_history():
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        # Lấy bộ lọc
        from_date   = request.args.get('from')
        to_date     = request.args.get('to')
        act         = (request.args.get('act') or '').strip()
        status      = (request.args.get('status') or '').strip()
        implementer = (request.args.get('implementer') or '').strip()

        query = """
        SELECT * FROM (
            SELECT 
                t.created_at AS time,
                t.`type`     AS act,
                i.name       AS raw_material,
                b.lot_code   AS batch_code,
                t.quantity,
                t.unit,
                b.status     AS status,
                u.full_name   AS implementer,
                t.note       AS note
            FROM transactions t
            LEFT JOIN batches     b ON t.batch_id = b.batch_id
            LEFT JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            LEFT JOIN users       u ON t.created_by = u.user_id

            UNION ALL

            SELECT
                pr.created_at                                AS time,
                'Make cakes'                                 AS act,
                m.name                                       AS raw_material,
                NULL                                         AS batch_code,
                pr.produced_quantity                         AS quantity,
                'cake'                                       AS unit,
                CASE WHEN pr.status='Done' THEN 'Complete' ELSE pr.status END AS status,
                u2.full_name                                  AS implementer,
                'See ingredients'                            AS note
            FROM production_reports pr
            JOIN menu m     ON pr.menu_id  = m.menu_id
            LEFT JOIN users u2 ON pr.created_by = u2.user_id
        ) AS all_hist
        WHERE 1=1
        """

        params = []

        if from_date:
            query += " AND DATE(time) >= %s"
            params.append(from_date)
        if to_date:
            query += " AND DATE(time) <= %s"
            params.append(to_date)
        if act and act.lower() != 'all':
            query += " AND act = %s"
            params.append(act)
        if status and status.lower() != 'all':
            query += " AND status = %s"
            params.append(status)
        if implementer and implementer.lower() != 'all':
            query += " AND implementer = %s"
            params.append(implementer)

        query += " ORDER BY time DESC"

        cur.execute(query, params)
        rows = cur.fetchall()

        return jsonify(rows), 200

    except mysql.connector.Error as err:
        # log chi tiết để debug
        return jsonify({"error": str(err)}), 500
    finally:
        try:
            if cur: cur.close()
            if conn and conn.is_connected():
                conn.close()  # dùng # thay cho // khi cần chú thích
        except Exception:
            pass
