from backend.utils.db import get_conn, dictfetchall
from utils.db import get_conn, dictfetchall

def get_or_create_ingredient(name: str, unit: str, shelf_life_days=None):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT ingredient_id, shelf_life_days FROM ingredients
            WHERE name=%s AND unit=%s LIMIT 1
        """, (name, unit))
        row = cur.fetchone()
        if row:
            ingredient_id, current_shelf = row[0], row[1]
            if current_shelf is None and shelf_life_days is not None:
                cur.execute("""
                    UPDATE ingredients SET shelf_life_days=%s
                    WHERE ingredient_id=%s
                """, (int(shelf_life_days), ingredient_id))
        else:
            cur.execute("""
                INSERT INTO ingredients(name, unit, shelf_life_days)
                VALUES (%s, %s, %s)
            """, (name, unit, int(shelf_life_days) if shelf_life_days is not None else None))
            ingredient_id = cur.lastrowid
        conn.commit()
        return ingredient_id
    finally:
        conn.close()

def upsert_inventory(ingredient_id: int, unit: str, delta_qty: float):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT inventory_id FROM inventory WHERE ingredient_id=%s LIMIT 1", (ingredient_id,))
        row = cur.fetchone()
        if row:
            cur.execute("""
                UPDATE inventory
                SET current_stock = current_stock + %s, unit=%s
                WHERE inventory_id=%s
            """, (delta_qty, unit, row[0]))
        else:
            cur.execute("""
                INSERT INTO inventory(ingredient_id, current_stock, unit)
                VALUES (%s, %s, %s)
            """, (ingredient_id, delta_qty, unit))
        conn.commit()
    finally:
        conn.close()

class Ingredient:
    @staticmethod
    def get_by_id(ingredient_id):
        """Get ingredient by ID"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT ingredient_id, name, unit, shelf_life_days, created_at 
                FROM ingredients 
                WHERE ingredient_id = %s
            """, (ingredient_id,))
            return dictfetchall(cur)[0] if cur.rowcount > 0 else None
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def get_all():
        """Get all ingredients"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT ingredient_id, name, unit, shelf_life_days, created_at 
                FROM ingredients 
                ORDER BY name
            """)
            return dictfetchall(cur)
        finally:
            cur.close()
            conn.close()