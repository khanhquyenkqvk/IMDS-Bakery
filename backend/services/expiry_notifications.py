"""Helpers to collect near-expiry batches and email staff."""
from datetime import datetime
from backend.utils.db import get_conn, dictfetchall
from backend.utils.mail import send_email


def get_near_expiry_batches(max_days: int = 7):
    """Return batches that will expire within max_days (including today)."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT 
                i.name AS ingredient_name,
                b.lot_code,
                b.expiry_date,
                DATEDIFF(b.expiry_date, CURDATE()) AS days_left
            FROM batches b
            JOIN ingredients i ON b.ingredient_id = i.ingredient_id
            WHERE b.status <> 'UsedUp'
              AND b.expiry_date IS NOT NULL
              AND DATEDIFF(b.expiry_date, CURDATE()) BETWEEN 0 AND %s
            ORDER BY days_left ASC, b.expiry_date ASC
            """,
            (max_days,),
        )
        rows = dictfetchall(cur)
        for r in rows:
            exp = r.get("expiry_date")
            if isinstance(exp, datetime):
                r["expiry_date"] = exp.date()
        return rows
    finally:
        cur.close()
        conn.close()


def get_staff_emails():
    """Return emails of owners and employees."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT u.email
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE r.role_name IN ('Owner', 'Employee')
              AND u.email IS NOT NULL
              AND u.email <> ''
            """
        )
        return [row[0] for row in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def send_near_expiry_email(max_days: int = 7):
    """Send email about near-expiry batches to owners/employees."""
    batches = get_near_expiry_batches(max_days)
    if not batches:
        return {"sent": 0, "reason": "no near-expiry batches"}

    recipients = get_staff_emails()
    if not recipients:
        return {"sent": 0, "reason": "no recipients"}

    lines = [
        f"- {b['ingredient_name']} | Lô {b['lot_code']} | Còn {b['days_left']} ngày (đến {b['expiry_date']})"
        for b in batches
    ]
    text = "Các nguyên liệu sắp hết hạn:\n" + "\n".join(lines)
    send_email(
        subject="[Bakery] Cảnh báo nguyên liệu sắp hết hạn",
        recipients=recipients,
        body=text,
    )
    return {"sent": len(recipients), "batches": len(batches)}
