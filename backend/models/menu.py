# backend/models/menu.py (New file)
from utils.db import get_conn, dictfetchall

class menu:
    @staticmethod
    def get_all_menus():
        """Fetch all active menus"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT menu_id, name, description, is_active, created_by, created_at 
                FROM menu 
                WHERE is_active = TRUE 
                ORDER BY name
            """)
            return dictfetchall(cur)
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def get_menu_by_id(menu_id):
        """Fetch a specific menu by ID"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT menu_id, name, description, is_active, created_by, created_at 
                FROM menu 
                WHERE menu_id = %s
            """, (menu_id,))
            return dictfetchall(cur)[0] if cur.rowcount > 0 else None
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def create_menu(name, description, created_by):
        """Create a new menu"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO menu (name, description, created_by) 
                VALUES (%s, %s, %s)
            """, (name, description, created_by))
            conn.commit()
            return cur.lastrowid
        finally:
            cur.close()
            conn.close()