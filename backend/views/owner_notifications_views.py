# backend/views/owner_notifications_views.py
from flask import Blueprint, jsonify, request
from datetime import datetime, timezone
from backend.utils.db import get_conn, dictfetchall

bp_owner_notifications = Blueprint("bp_owner_notifications", __name__)

# -------- helpers ----------

def _time_ago(dt: datetime) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    minutes = seconds // 60
    hours = seconds // 3600
    days = diff.days

    if seconds < 60:
        return "Just now"
    if minutes < 60:
        return f"{minutes} mins ago"
    if hours < 24:
        return f"{hours} hours ago"
    return f"{days} days ago"


def _safe_qty(q):
    if q is None:
        return 0
    try:
        return float(q)
    except Exception:
        return 0


def _map_alert_to_notification(row: dict) -> dict:
    alert_type = row["alert_type"]          # NearExpiry / Expired / LowStock / Waste
    severity = row["severity"]             # Yellow / Red
    status = row["status"]                 # Pending / Resolved
    ingredient = row["ingredient_name"]
    lot_code = row["lot_code"]
    qty = _safe_qty(row["quantity"])
    unit = row["unit"]
    expiry_date = row["expiry_date"]
    manufacture_date = row["manufacture_date"]
    created_at = row["created_at"]

    # title
    if alert_type == "Expired":
        title = f"CRITICAL: Item Expired"
    elif alert_type == "NearExpiry":
        title = "Near Expiry Warning"
    elif alert_type == "LowStock":
        title = "Low Stock Alert"
    elif alert_type == "Waste":
        title = "Waste Reported"
    else:
        title = f"{alert_type} Alert"

    # message (ngắn, dùng cho list)
    exp_text = expiry_date.isoformat() if expiry_date else "N/A"
    if alert_type == "Expired":
        msg = f"{ingredient} batch {lot_code} has expired on {exp_text}. Remove from inventory immediately."
    elif alert_type == "NearExpiry":
        msg = f"{ingredient} batch {lot_code} will expire soon on {exp_text}."
    elif alert_type == "LowStock":
        msg = f"{ingredient} is running low. Current quantity: {qty:g} {unit}."
    elif alert_type == "Waste":
        msg = f"Waste has been recorded for {ingredient} batch {lot_code} ({qty:g} {unit})."
    else:
        msg = row.get("note") or "inventory alert requires your review."

    # type / impact cho chip
    if alert_type == "Expired" or severity == "Red":
        notif_type = "critical"
        impact = "High"
    elif alert_type in ("NearExpiry", "LowStock"):
        notif_type = "high"
        impact = "High"
    elif alert_type == "Waste":
        notif_type = "medium"
        impact = "Medium"
    else:
        notif_type = "low"
        impact = "Low"

    # primary action (text trên nút)
    if alert_type == "Expired":
        primary_action = "Handle Waste"
    elif alert_type == "NearExpiry":
        primary_action = "Review Batch"
    elif alert_type == "LowStock":
        primary_action = "Review inventory"
    elif alert_type == "Waste":
        primary_action = "Review Waste Report"
    else:
        primary_action = "View Details"

    time_ago = _time_ago(created_at) if created_at else ""

    return {
        "id": row["alert_id"],
        "alert_id": row["alert_id"],
        "alert_type": alert_type,
        "severity": severity,
        "status": status,
        "title": title,
        "message": msg,
        "type": notif_type,
        "category": "inventory",
        "timeAgo": time_ago,
        "impact": impact,
        "primaryAction": primary_action,
        # thêm info để hiện trong modal
        "batch_id": row["batch_id"],
        "ingredient_name": ingredient,
        "lot_code": lot_code,
        "expiry_date": expiry_date.isoformat() if expiry_date else None,
        "manufacture_date": manufacture_date.isoformat() if manufacture_date else None,
        "quantity": qty,
        "unit": unit,
        "created_at": created_at.isoformat() if created_at else None,
    }


# =============== 1) LIST =================

@bp_owner_notifications.route("/api/owner/notifications", methods=["GET"])
def get_owner_notifications():
    conn = get_conn()
    cur = conn.cursor()
    try:
        sql = """
            SELECT
                a.alert_id,
                a.alert_type,
                a.severity,
                a.status,
                a.created_at,
                b.batch_id,
                b.lot_code,
                b.quantity,
                b.unit,
                b.expiry_date,
                b.manufacture_date,
                i.name AS ingredient_name
            FROM alerts a
            JOIN batches b ON a.batch_id = b.batch_id
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            ORDER BY a.created_at DESC
        """
        cur.execute(sql)
        rows = dictfetchall(cur)
        notifications = [_map_alert_to_notification(r) for r in rows]
        return jsonify({"success": True, "data": notifications})
    except Exception as e:
        print("Error loading owner notifications:", e)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()


# =============== 2) MARK ALL READ =================

@bp_owner_notifications.route(
    "/api/owner/notifications/mark-all-read", methods=["POST"]
)
def mark_all_notifications_read():
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("user_id")

    conn = get_conn()
    cur = conn.cursor()
    try:
        now = datetime.utcnow()
        sql = """
            UPDATE alerts
            SET status = 'Resolved',
                resolved_at = %s,
                resolved_by = %s
            WHERE status = 'Pending'
        """
        cur.execute(sql, (now, user_id))
        conn.commit()
        updated = cur.rowcount or 0
        return jsonify({"success": True, "updated": updated})
    except Exception as e:
        print("Error mark-all-read:", e)
        conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()


# =============== 3) MARK SINGLE READ =================

@bp_owner_notifications.route(
    "/api/owner/notifications/<int:alert_id>/mark-read", methods=["POST"]
)
def mark_notification_read(alert_id: int):
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("user_id")

    conn = get_conn()
    cur = conn.cursor()
    try:
        now = datetime.utcnow()
        sql = """
            UPDATE alerts
            SET status = 'Resolved',
                resolved_at = %s,
                resolved_by = %s
            WHERE alert_id = %s
        """
        cur.execute(sql, (now, user_id, alert_id))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        print("Error mark-read:", e)
        conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()
