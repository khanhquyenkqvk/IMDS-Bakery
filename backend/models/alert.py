# backend/models/alert.py (Updated: Direct low stock from inventory, no ingredient_id needed)
from utils.db import get_conn, dictfetchall
from datetime import date

class Alert:
    @staticmethod
    def create_alert(alert_type, severity, status, created_by, batch_id=None):
        """Create a new alert"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO alerts (batch_id, alert_type, severity, status, created_by) 
                VALUES (%s, %s, %s, %s, %s)
            """, (batch_id, alert_type, severity, status, created_by))
            conn.commit()
            return cur.lastrowid
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def get_alerts_by_ingredient(ingredient_id):
        """Get alerts for an ingredient (via batches)"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT a.* 
                FROM alerts a
                JOIN batches b ON a.batch_id = b.batch_id
                WHERE b.ingredient_id = %s
            """, (ingredient_id,))
            return dictfetchall(cur)
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def get_pending_red_alerts(limit=5):
        """Get pending Red alerts (batch-based: Expired/NearExpiry) with details"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    i.name as ingredient_name, 
                    b.lot_code, 
                    b.expiry_date, 
                    a.alert_type,
                    DATEDIFF(b.expiry_date, CURDATE()) as days_left
                FROM alerts a
                JOIN batches b ON a.batch_id = b.batch_id
                JOIN ingredients i ON b.ingredient_id = i.ingredient_id
                WHERE a.severity = 'Red' 
                  AND a.status = 'Pending'
                  AND b.status != 'UsedUp'
                ORDER BY days_left ASC, b.expiry_date ASC
                LIMIT %s
            """, (limit,))
            return dictfetchall(cur)
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def get_pending_yellow_batch_alerts(limit=5):
        """Get pending Yellow batch-based alerts (e.g., NearExpiry)"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    i.name as ingredient_name, 
                    b.lot_code, 
                    b.expiry_date, 
                    a.alert_type,
                    DATEDIFF(b.expiry_date, CURDATE()) as days_left
                FROM alerts a
                JOIN batches b ON a.batch_id = b.batch_id
                JOIN ingredients i ON b.ingredient_id = i.ingredient_id
                WHERE a.severity = 'Yellow' 
                  AND a.status = 'Pending'
                  AND a.alert_type != 'LowStock'  -- Exclude LowStock
                  AND b.status != 'UsedUp'
                ORDER BY days_left ASC
                LIMIT %s
            """, (limit,))
            return dictfetchall(cur)
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def get_low_stock_ingredients(limit=5):
        """Get low stock ingredients directly from inventory (threshold < 100 units)"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    i.name as ingredient_name, 
                    'N/A' as lot_code,
                    NULL as expiry_date,
                    'LowStock' as alert_type,
                    inv.current_stock,
                    inv.unit as stock_unit,
                    0 as days_left
                FROM inventory inv
                JOIN ingredients i ON inv.ingredient_id = i.ingredient_id
                WHERE inv.current_stock < 100
                ORDER BY inv.current_stock ASC
                LIMIT %s
            """, (limit,))
            return dictfetchall(cur)
        finally:
            cur.close()
            conn.close()