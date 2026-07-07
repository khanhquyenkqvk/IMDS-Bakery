from backend.utils.db import get_conn

def create_batch(ingredient_id:int, lot_code:str, qty:float, unit:str,
                 received_date:str, expiry_date:str, created_by:int, note:str=None):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO batches(ingredient_id, lot_code, quantity, unit, manufacture_date, expiry_date, status, created_by)
            VALUES (%s, %s, %s, %s, %s, %s,
                    CASE
                        WHEN %s < CURDATE() THEN 'Expired'
                        WHEN DATEDIFF(%s, CURDATE()) <= 7 THEN 'NearExpiry'
                        ELSE 'Valid'
                    END,
                    %s)
        """, (ingredient_id, lot_code, qty, unit, received_date, expiry_date,
              expiry_date, expiry_date, created_by))
        batch_id = cur.lastrowid

        cur.execute("""
            INSERT INTO transactions(batch_id, type, quantity, unit, created_by, note)
            VALUES (%s, 'Import', %s, %s, %s, %s)
        """, (batch_id, qty, unit, created_by, note))

        conn.commit()
        return batch_id
    finally:
        conn.close()
def lot_code_exists(lot_code: str) -> bool:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM batches WHERE lot_code=%s LIMIT 1", (lot_code,))
        return cur.fetchone() is not None
    finally:
        conn.close()




