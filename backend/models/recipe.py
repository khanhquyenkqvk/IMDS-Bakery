# backend/models/recipe.py
from utils.db import get_conn, dictfetchall
import json
from datetime import datetime, timedelta

class Recipe:
    # ===== helper build meta cho employee UI =====
    @staticmethod
    def _build_meta_from_menu(row):
        """
        Tạo list meta để hiển thị chip ở header:
        vd: ["Easy", "Prep: 45 minutes • Cook: 20 minutes", "Serves: 4"]
        """
        meta = []

        # difficulty
        diff = (row.get("difficulty") or "").strip()
        if diff:
            meta.append(diff.capitalize())  # easy -> Easy

        # prep / cook
        prep = row.get("prep_time")
        cook = row.get("cook_time")
        if prep is not None or cook is not None:
            parts = []
            if prep is not None:
                parts.append(f"Prep: {prep} minutes")
            if cook is not None:
                parts.append(f"Cook: {cook} minutes")
            if parts:
                meta.append(" • ".join(parts))

        # serves
        serves = row.get("serves")
        if serves is not None:
            meta.append(f"Serves: {serves}")

        # fallback nếu không có gì
        if not meta:
            meta = ["General dessert"]

        return meta

    @staticmethod
    def get_recipe_by_id(recipe_id):
        """Fetch a specific recipe with its menu and ingredients"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            # LẤY THÊM prep_time, cook_time, serves, difficulty từ menu
            cur.execute("""
                SELECT 
                    r.recipe_id,
                    m.name AS menu_name,
                    m.description,
                    m.image_path,  
                    m.prep_time,
                    m.cook_time,
                    m.serves,
                    m.difficulty,
                    r.approved_by,
                    r.created_at,
                    r.instructions
                FROM recipes r
                JOIN menu m ON r.menu_id = m.menu_id
                WHERE r.recipe_id = %s
            """, (recipe_id,))
            recipe_data = dictfetchall(cur)
            recipe = recipe_data[0] if recipe_data else None
            if not recipe:
                return None

            # instructions JSON
            if recipe.get('instructions'):
                try:
                    recipe['instructions'] = json.loads(recipe['instructions'])
                    if not isinstance(recipe['instructions'], list):
                        recipe['instructions'] = ["No valid instructions available"]
                except json.JSONDecodeError:
                    recipe['instructions'] = ["No valid instructions available"]
            else:
                recipe['instructions'] = ["No instructions available"]

            # ✅ meta KHÔNG lấy từ description nữa, mà build từ cột riêng
            recipe['meta'] = Recipe._build_meta_from_menu(recipe)

            # Lấy ingredients cho recipe (giữ y nguyên logic cũ)
            cur.execute("""
                SELECT 
                    ri.quantity, 
                    ri.unit, 
                    i.name, 
                    i.ingredient_id, 
                    i.shelf_life_days, 
                    i.created_at AS ingredient_created_at
                FROM recipe_ingredients ri
                JOIN ingredients i ON ri.ingredient_id = i.ingredient_id
                WHERE ri.recipe_id = %s
                ORDER BY i.name
            """, (recipe_id,))
            recipe['ingredients'] = dictfetchall(cur)

            # Enrich từng ingredient với stock, expiry, flags
            for ing in recipe['ingredients']:
                # STOCK
                cur.execute("""
                    SELECT current_stock, unit 
                    FROM inventory 
                    WHERE ingredient_id = %s
                """, (ing['ingredient_id'],))
                stock_data = dictfetchall(cur)
                if stock_data:
                    ing['stock'] = stock_data[0]['current_stock']
                    ing['stock_unit'] = stock_data[0]['unit']
                else:
                    ing['stock'] = 0
                    ing['stock_unit'] = ing['unit']

                # BATCH - ưu tiên Valid
                cur.execute("""
                    SELECT expiry_date, created_at, status
                    FROM batches 
                    WHERE ingredient_id = %s AND status = 'Valid'
                    ORDER BY expiry_date ASC
                    LIMIT 1
                """, (ing['ingredient_id'],))
                batch_row = cur.fetchone()
                if batch_row:
                    ing['expiry_date'] = batch_row[0].isoformat() if batch_row[0] else None
                    ing['created_at'] = batch_row[1].isoformat() if batch_row[1] else None
                    ing['batch_status'] = batch_row[2]  # 'Valid'
                else:
                    # Không có Valid → check NearExpiry/Opened
                    cur.execute("""
                        SELECT expiry_date, created_at, status
                        FROM batches 
                        WHERE ingredient_id = %s AND status IN ('NearExpiry', 'Opened')
                        ORDER BY expiry_date ASC
                        LIMIT 1
                    """, (ing['ingredient_id'],))
                    secondary_row = cur.fetchone()
                    if secondary_row:
                        ing['expiry_date'] = secondary_row[0].isoformat() if secondary_row[0] else None
                        ing['created_at'] = secondary_row[1].isoformat() if secondary_row[1] else None
                        ing['batch_status'] = secondary_row[2]
                    else:
                        # FIX: Không có active batches, check Expired
                        cur.execute("""
                            SELECT COUNT(*) FROM batches 
                            WHERE ingredient_id = %s AND status = 'Expired'
                        """, (ing['ingredient_id'],))
                        expired_count = cur.fetchone()[0]
                        if expired_count > 0:
                            # Chỉ có Expired
                            ing['expiry_date'] = None
                            ing['created_at'] = None
                            ing['batch_status'] = 'Only Expired'
                        else:
                            # Không có batch nào → fallback shelf_life
                            ing['expiry_date'] = None
                            ing['batch_status'] = 'No batches'
                            if ing.get('ingredient_created_at'):
                                ing['created_at'] = ing['ingredient_created_at'].isoformat()
                            else:
                                ing['created_at'] = None

                # TÍNH is_expired, expiry_status, is_low_stock, days_left
                today = datetime.now().date()
                is_expired = False
                expiry_status = 'Normal'
                is_low_stock = (float(ing['stock']) < float(ing['quantity'])) and (ing['unit'] == ing['stock_unit'])
                days_left = None

                if ing['batch_status'] == 'Only Expired':
                    is_expired = True
                    expiry_status = 'Expired'
                    cur.execute("""
                        SELECT expiry_date FROM batches 
                        WHERE ingredient_id = %s AND status = 'Expired'
                        ORDER BY expiry_date ASC
                        LIMIT 1
                    """, (ing['ingredient_id'],))
                    exp_row = cur.fetchone()
                    if exp_row and exp_row[0]:
                        exp_date = exp_row[0]
                        days_left = (exp_date - today).days  # âm
                elif ing.get('expiry_date'):
                    exp_date = datetime.fromisoformat(ing['expiry_date']).date()
                    days_left = (exp_date - today).days
                    is_expired = days_left < 0
                    if is_expired:
                        expiry_status = 'Expired'
                    elif days_left <= 3:
                        expiry_status = 'NearExpiry'
                    else:
                        expiry_status = 'Normal'
                elif ing.get('shelf_life_days') is not None and ing.get('created_at'):
                    created_date = datetime.fromisoformat(ing['created_at']).date()
                    exp_date = created_date + timedelta(days=ing['shelf_life_days'])
                    days_left = (exp_date - today).days
                    is_expired = days_left < 0 or ing['shelf_life_days'] < 0
                    if is_expired:
                        expiry_status = 'Expired'
                    elif days_left <= 3:
                        expiry_status = 'NearExpiry'
                    else:
                        expiry_status = 'Normal'

                ing['is_expired'] = is_expired
                ing['expiry_status'] = expiry_status
                ing['is_low_stock'] = is_low_stock
                ing['days_left'] = days_left

                # Debug (nếu nhiều log quá thì comment lại)
                print(
                    f"DEBUG Ingredient: {ing['name']} (ID: {ing['ingredient_id']}) "
                    f"- batch_status: {ing.get('batch_status')}, expiry_date: {ing.get('expiry_date')}, "
                    f"shelf_life_days: {ing.get('shelf_life_days')}, days_left: {days_left}, "
                    f"is_expired: {is_expired}, is_low_stock: {is_low_stock}"
                )

            return recipe
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def get_all_recipes():
        """Fetch all recipes with basic info and ingredient count"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    r.recipe_id, 
                    m.name AS menu_name,
                    m.image_path,   
                    r.approved_by, 
                    r.created_at,
                    (SELECT COUNT(*) 
                     FROM recipe_ingredients ri 
                     WHERE ri.recipe_id = r.recipe_id) AS ingredients_count
                FROM recipes r
                JOIN menu m ON r.menu_id = m.menu_id
                ORDER BY m.name
            """)
            return dictfetchall(cur)
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def create_recipe(menu_id, approved_by):
        """Create a new recipe"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO recipes (menu_id, approved_by) 
                VALUES (%s, %s)
            """, (menu_id, approved_by))
            conn.commit()
            return cur.lastrowid
        finally:
            cur.close()
            conn.close()
