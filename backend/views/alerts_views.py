# backend/views/alerts_views.py
from flask import Blueprint, jsonify, request
from utils.db import get_conn, dictfetchall
from datetime import datetime
from backend.services.expiry_notifications import send_near_expiry_email

bp_alerts = Blueprint('alerts', __name__, url_prefix='/api')


@bp_alerts.route('/alerts', methods=['GET'])
def get_alerts():
    """
    Get real-time alerts from batches/inventory:
    - RED (expiringSoon): batches còn hạn <= 3 ngày hoặc đã hết hạn, status != 'UsedUp'
    - YELLOW (earlyWarnings):
        + Low Stock: inventory.current_stock < 1000
        + Near Expiry: batches còn hạn từ 4 đến 7 ngày, status != 'UsedUp'
    => Không bị trùng lặp giữa Red và Yellow.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # 🔴 RED: Expiring soon (<= 3 ngày nữa hoặc đã hết hạn), bỏ UsedUp
        cur.execute("""
            SELECT 
                i.name AS ingredient_name,
                b.lot_code,
                b.expiry_date,
                b.status,
                DATEDIFF(b.expiry_date, CURDATE()) AS days_left
            FROM batches b
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            WHERE b.status <> 'UsedUp'
              AND (
                    -- đã hết hạn (ngày âm)
                    DATEDIFF(b.expiry_date, CURDATE()) < 0
                    -- hoặc còn hạn nhưng <= 3 ngày nữa
                    OR DATEDIFF(b.expiry_date, CURDATE()) BETWEEN 0 AND 3
                  )
            ORDER BY days_left ASC, b.expiry_date ASC
        """)
        expiring_soon = dictfetchall(cur)

        # 🟡 YELLOW: Low Stock trực tiếp từ inventory (< 100 đơn vị)
        cur.execute("""
            SELECT 
                i.name AS ingredient_name,
                'N/A' AS lot_code,
                NULL AS expiry_date, 
                inv.current_stock,
                inv.unit AS stock_unit,
                0 AS days_left,
                'Low Stock' AS warning_type
            FROM inventory inv
            JOIN ingredients i ON inv.ingredient_id = i.ingredient_id
            WHERE inv.current_stock < 1000
            ORDER BY inv.current_stock ASC
        """)
        low_stock = dictfetchall(cur)

        # 🟡 YELLOW: Near Expiry (4–7 ngày nữa hết hạn, không UsedUp)
        # Lưu ý: không lấy <= 3 ngày để tránh trùng với RED
        cur.execute("""
            SELECT 
                i.name AS ingredient_name,
                b.lot_code,
                b.expiry_date,
                NULL AS current_stock,
                NULL AS stock_unit,
                DATEDIFF(b.expiry_date, CURDATE()) AS days_left,
                'Near Expiry' AS warning_type
            FROM batches b
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            WHERE b.status <> 'UsedUp'
              AND DATEDIFF(b.expiry_date, CURDATE()) BETWEEN 4 AND 7
            ORDER BY days_left ASC
        """)
        near_expiry = dictfetchall(cur)

        # 🟡 Gộp Yellow: Low Stock trước, rồi Near Expiry, sort nhẹ lại
        early_warnings = low_stock + near_expiry
        early_warnings.sort(
            key=lambda x: (
                x['warning_type'] != 'Low Stock',  # Low Stock ưu tiên lên trên
                x.get('days_left', 999)
            )
        )

        total_alerts = len(expiring_soon) + len(early_warnings)

        # Chuẩn hoá định dạng ngày -> yyyy-mm-dd
        for item in expiring_soon + early_warnings:
            if item.get('expiry_date') and isinstance(item['expiry_date'], datetime):
                item['expiry_date'] = item['expiry_date'].strftime('%Y-%m-%d')

        # Debug để kiểm tra logic trên server
        print("DEBUG Red:", [
            f"{item['ingredient_name']} - {item['lot_code']} ({item['days_left']} days)"
            for item in expiring_soon
        ])
        print("DEBUG Yellow Low:", [
            f"{item['ingredient_name']} - {item['lot_code']} (Low Stock, {item['current_stock']} {item['stock_unit']})"
            for item in low_stock
        ])
        print("DEBUG Yellow Near:", [
            f"{item['ingredient_name']} - {item['lot_code']} (Near Expiry, {item['days_left']} days)"
            for item in near_expiry
        ])

        return jsonify({
            'success': True,
            'data': {
                'expiringSoon': expiring_soon,
                'earlyWarnings': early_warnings,
                'totalAlerts': total_alerts
            }
        }), 200

    except Exception as e:
        print(f"Alert API error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

    finally:
        cur.close()
        conn.close()


@bp_alerts.route('/alerts/email/near-expiry', methods=['POST'])
def trigger_near_expiry_email():
    """Send email to owners/employees about near-expiry batches."""
    payload = request.get_json(silent=True) or {}
    max_days = int(payload.get('days', 7))
    try:
        result = send_near_expiry_email(max_days)
        return jsonify({'success': True, **result}), 200
    except Exception as e:
        print(f"Send near-expiry email error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
