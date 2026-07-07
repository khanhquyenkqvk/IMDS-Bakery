# backend/controllers/recipe_controller.py
from models.recipe import Recipe
from models.menu import menu
from models.recipe_ingredient import RecipeIngredient
from models.ingredient import Ingredient
from utils.db import get_conn, dictfetchall
from datetime import date
from backend.controllers.inventory_controller import consume_ingredient_batches


class RecipeController:
    # ===== HELPER: build meta từ các cột tách riêng =====
    @staticmethod
    def _build_meta_from_row(row: dict):
        """
        row là dict trả về từ model Recipe / menu.
        Mục tiêu: build field meta = [description, 'Prep: xx minutes', ...]
        để FE (recipe.js) hiển thị.
        """
        # các key khả dĩ
        description = (row.get("description") or row.get("menu_description") or "").strip()
        prep_time = row.get("prep_time")
        cook_time = row.get("cook_time")
        serves = row.get("serves")
        difficulty = (row.get("difficulty") or "").strip()

        # nếu không có dữ liệu mới -> dùng meta cũ (nếu có) hoặc rỗng
        has_new = any([
            description,
            prep_time is not None,
            cook_time is not None,
            serves is not None,
            bool(difficulty),
        ])
        if not has_new:
            return row.get("meta") or []

        meta = []
        if description:
            meta.append(description)
        if prep_time is not None:
            meta.append(f"Prep: {prep_time} minutes")
        if cook_time is not None:
            meta.append(f"Cook: {cook_time} minutes")
        if serves is not None:
            meta.append(f"Serves: {serves}")
        if difficulty:
            meta.append(f"Difficulty: {difficulty.capitalize()}")

        return meta

    @staticmethod
    def _normalize_name_field(row: dict):
        """
        Đảm bảo luôn có cả menu_name và name cho FE dùng.
        """
        name = row.get("menu_name") or row.get("name") or ""
        row["menu_name"] = name
        row["name"] = name

    # ===== LIST cho employee =====
    @staticmethod
    def list_recipes():
        """List all recipes (employee view)"""
        try:
            recipes = Recipe.get_all_recipes()  # vẫn dùng model cũ

            # Hậu xử lý: đảm bảo có meta + name
            for r in recipes:
                RecipeController._normalize_name_field(r)
                r["meta"] = RecipeController._build_meta_from_row(r)

            return {'success': True, 'data': recipes}, 200
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

    # ===== DETAIL cho employee =====
    @staticmethod
    def get_recipe(recipe_id):
        """Get detailed recipe by ID"""
        try:
            recipe = Recipe.get_recipe_by_id(recipe_id)
            if not recipe:
                return {'success': False, 'error': 'Recipe not found'}, 404

            # Đảm bảo menu_name / name
            RecipeController._normalize_name_field(recipe)
            # Build lại meta từ cột mới
            recipe["meta"] = RecipeController._build_meta_from_row(recipe)

            RecipeController._enrich_recipe_ingredients_with_stock(recipe)

            return {'success': True, 'data': recipe}, 200
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

    @staticmethod
    def create_recipe(menu_id, approved_by):
        """Create a new recipe"""
        try:
            menu = menu.get_menu_by_id(menu_id)
            if not menu:
                return {'success': False, 'error': 'menu not found'}, 404
            recipe_id = Recipe.create_recipe(menu_id, approved_by)
            return {'success': True, 'data': {'recipe_id': recipe_id}}, 201
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

    @staticmethod
    def add_ingredient(recipe_id, ingredient_id, quantity, unit):
        """Add ingredient to recipe"""
        try:
            ingredient = Ingredient.get_by_id(ingredient_id)
            if not ingredient:
                return {'success': False, 'error': 'Ingredient not found'}, 404
            # Check for existing entry to avoid duplication
            conn = get_conn()
            cur = conn.cursor()
            cur.execute("""
                SELECT recipe_ingredient_id FROM recipe_ingredients 
                WHERE recipe_id = %s AND ingredient_id = %s
            """, (recipe_id, ingredient_id))
            if cur.fetchone():
                cur.close()
                conn.close()
                return {'success': False, 'error': 'Ingredient already exists in this recipe'}, 400
            cur.close()
            conn.close()
            ri_id = RecipeIngredient.add_ingredient_to_recipe(recipe_id, ingredient_id, quantity, unit)
            return {'success': True, 'data': {'recipe_ingredient_id': ri_id}}, 201
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

    @staticmethod
    def submit_report(ingredient_id, report_type, user_id):
        """Submit a report for an ingredient (creates alert)"""
        try:
            alert_type_map = {
                'expiring-soon': 'NearExpiry',
                'expired': 'Expired',
                'low-stock': 'LowStock'
            }
            alert_type = alert_type_map.get(report_type)
            if not alert_type:
                return {'success': False, 'error': 'Invalid report type'}, 400

            severity = 'Red' if alert_type == 'Expired' else 'Yellow'

            conn = get_conn()
            cur = conn.cursor()
            # Find a valid batch for the ingredient
            cur.execute("""
                SELECT batch_id FROM batches 
                WHERE ingredient_id = %s AND status = 'Valid' 
                LIMIT 1
            """, (ingredient_id,))
            batch_row = cur.fetchone()
            if not batch_row:
                cur.close()
                conn.close()
                return {'success': False, 'error': 'No valid batch found for this ingredient'}, 404
            batch_id = batch_row[0]

            cur.execute("""
                INSERT INTO alerts (batch_id, alert_type, severity, status) 
                VALUES (%s, %s, %s, 'Pending')
            """, (batch_id, alert_type, severity))
            conn.commit()
            cur.close()
            conn.close()
            return {'success': True, 'message': 'Report submitted successfully'}, 201
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500
    @staticmethod
    def _update_production_reports_after_full_recipe(cur, recipe_id: int):
        """
        Sau khi 1 lần dùng ĐỦ tất cả nguyên liệu của 1 recipe:
        - Xác định menu_id từ recipes
        - Tìm record trong production_reports cho menu_id đó, ngày hôm nay
        - Nếu status là 'Haven\'t done' hoặc 'Doing' và produced_quantity > 0
          -> giảm produced_quantity đi 1
          -> nếu về 0 thì set status = 'Done'
        - Nếu đã Done hoặc hết số lượng thì không làm gì.
        """
        if not recipe_id:
            print("DEBUG PR: no recipe_id, skip update")
            return

        today = date.today()

        # 1. Lấy menu_id từ recipes
        cur.execute(
            "SELECT menu_id FROM recipes WHERE recipe_id = %s",
            (recipe_id,)
        )
        row = cur.fetchone()
        if not row:
            print("DEBUG PR: recipe not found, skip")
            return

        # cursor đang dùng dictionary=True
        menu_id = row["menu_id"] if isinstance(row, dict) else row[0]
        print(f"DEBUG PR: recipe_id={recipe_id}, menu_id={menu_id}")

        # 2. Tìm bản ghi Today's menu tương ứng trong production_reports hôm nay
        cur.execute(
            """
            SELECT report_id, produced_quantity, status
            FROM production_reports
            WHERE menu_id = %s
              AND report_date = %s
              AND status IN (%s, %s)
            ORDER BY report_id DESC
            LIMIT 1
            """,
            (menu_id, today, "Haven't done", "Doing")
        )
        pr = cur.fetchone()
        if not pr:
            print("DEBUG PR: no production_reports row for today, or already Done")
            return

        if isinstance(pr, dict):
            report_id = pr["report_id"]
            produced_qty = pr["produced_quantity"] or 0
            status = pr["status"]
        else:
            report_id, produced_qty, status = pr

        print(f"DEBUG PR row: id={report_id}, qty={produced_qty}, status={status}")

        # Nếu đã hết số lượng thì thôi, không update nữa
        if produced_qty <= 0:
            print("DEBUG PR: produced_qty <= 0, skip update")
            return

        # 3. Giảm đi 1 chiếc bánh (1 lần làm đủ công thức)
        new_qty = produced_qty - 1
        if new_qty <= 0:
            new_qty = 0
            new_status = "Done"
        else:
            # Nếu đang 'Haven't done' mà đã làm ít nhất 1 cái -> chuyển sang 'Doing'
            new_status = "Doing" if status == "Haven't done" else status

        print(f"DEBUG PR update: new_qty={new_qty}, new_status={new_status}")

        cur.execute(
            """
            UPDATE production_reports
            SET produced_quantity = %s,
                status = %s
            WHERE report_id = %s
            """,
            (new_qty, new_status, report_id)
        )

    @staticmethod
    def use_ingredients(usage, user_id,recipe_id=None, used_all_ingredients=False):
        """
        Use ingredients for production:
        - Trừ stock theo FIFO trên batches
        - Ghi transactions type='Export' cho từng batch
        - Trừ inventory.current_stock tương ứng
        - Nếu dùng ĐỦ toàn bộ nguyên liệu của 1 recipe, giảm số lượng trong Today's menu
        """
        if not usage:
            return {'success': False, 'error': 'No usage data provided'}, 400

        conn = get_conn()
        cur = None
        try:
            cur = conn.cursor(dictionary=True)

            for item in usage:
                ingredient_id = item.get('ingredient_id')
                quantity = item.get('quantity')

                if not ingredient_id or quantity is None:
                    continue

                qty_to_use = float(quantity)
                if qty_to_use <= 0:
                    continue

                # 1) Kiểm tra tổng tồn **chỉ lô còn hạn**
                cur.execute("""
                    SELECT COALESCE(SUM(quantity), 0) AS total_qty
                    FROM batches
                    WHERE ingredient_id = %s
                    AND status IN ('Valid', 'NearExpiry')
                    AND (expiry_date IS NULL OR expiry_date >= %s)
                """, (ingredient_id, date.today()))
                total_row = cur.fetchone()
                total_available = float(total_row['total_qty'] or 0)

                if total_available < qty_to_use:
                    raise Exception(
                        f'Insufficient stock for ingredient {ingredient_id}: '
                        f'requested {qty_to_use}, available {total_available}'
                    )

                # 2) Lấy danh sách batch theo FIFO, **chỉ lô còn hạn**, ưu tiên expiry_date
                cur.execute("""
                    SELECT batch_id, quantity, unit, expiry_date
                    FROM batches
                    WHERE ingredient_id = %s
                    AND status IN ('Valid', 'NearExpiry')
                    AND (expiry_date IS NULL OR expiry_date >= %s)
                    ORDER BY 
                    expiry_date ASC,           -- lô gần hết hạn trước
                    manufacture_date ASC, 
                    batch_id ASC
                """, (ingredient_id, date.today()))
                batches = cur.fetchall()


                remaining = qty_to_use

                for b in batches:
                    if remaining <= 0:
                        break

                    batch_id = b['batch_id']
                    batch_qty = float(b['quantity'] or 0)
                    unit = b['unit']

                    if batch_qty <= 0:
                        continue

                    use_from_batch = min(remaining, batch_qty)
                    new_qty = batch_qty - use_from_batch

                    # 2a) Update batches
                    if new_qty <= 0:
                        # dùng hết batch -> đánh dấu UsedUp
                        cur.execute("""
                            UPDATE batches
                            SET quantity = 0, status = 'UsedUp'
                            WHERE batch_id = %s
                        """, (batch_id,))
                    else:
                        cur.execute("""
                            UPDATE batches
                            SET quantity = %s
                            WHERE batch_id = %s
                        """, (new_qty, batch_id))

                    # 2b) Ghi transactions (Export)
                    cur.execute("""
                        INSERT INTO transactions (batch_id, type, quantity, unit, created_by, note)
                        VALUES (%s, 'Export', %s, %s, %s, %s)
                    """, (batch_id, use_from_batch, unit, user_id,
                          "Used in recipe"))

                    remaining -= use_from_batch

                # safety check, không nên xảy ra vì đã check total_available
                if remaining > 0.0001:
                    raise Exception(
                        f'Could not allocate full quantity for ingredient {ingredient_id}. '
                        f'Remaining: {remaining}'
                    )

                # 3) Trừ inventory.current_stock (aggregated)
                cur.execute("""
                    UPDATE inventory
                    SET current_stock = GREATEST(current_stock - %s, 0)
                    WHERE ingredient_id = %s
                """, (qty_to_use, ingredient_id))

             # 4) Sau khi trừ kho xong, nếu có recipe_id và đã dùng đủ tất cả nguyên liệu,
            #    thì thử cập nhật Today's menu (production_reports).
            if recipe_id is not None and used_all_ingredients:
                try:
                    RecipeController._update_production_reports_after_full_recipe(cur, recipe_id)
                except Exception as e2:
                    # Không rollback inventory chỉ vì lỗi hôm nay menu,
                    # nhưng log ra để debug nếu cần.
                    print("Error updating production_reports:", e2)

            conn.commit()
            return {
                'success': True,
                'message': "Successfully used ingredients and recorded transactions (Today's menu updated if applicable)"
            }, 200

        except Exception as e:
            if conn:
                conn.rollback()
            return {'success': False, 'error': str(e)}, 400

        finally:
            if cur:
                cur.close()
            conn.close()
    @staticmethod
    def _calculate_stock_flags_for_ingredient(ingredient_id: int, needed_quantity: float | None = None):
        """
        Đọc tất cả lô của 1 nguyên liệu và trả về:
        - tổng tồn (tất cả lô chưa UsedUp)
        - tồn khả dụng (chỉ lô chưa hết hạn)
        - is_expired / is_low_stock / expiry_status / days_left

        Đây là nguồn SỰ THẬT cho FE (recipe.js).
        """
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        try:
            today = date.today()

            # Lấy tất cả batch chưa UsedUp
            cur.execute("""
                SELECT batch_id, quantity, unit, expiry_date, status
                FROM batches
                WHERE ingredient_id = %s
                  AND status <> 'UsedUp'
            """, (ingredient_id,))
            batches = cur.fetchall()

            if not batches:
                # Không có lô nào → coi như low stock = 0
                return {
                    "stock": 0.0,
                    "stock_unit": None,
                    "total_all": 0.0,
                    "total_valid": 0.0,
                    "is_expired": False,
                    "is_low_stock": True if (needed_quantity or 0) > 0 else False,
                    "expiry_status": "LowStock" if (needed_quantity or 0) > 0 else "Normal",
                    "days_left": None,
                    "batch_status": None,
                }

            total_all = sum(float(b["quantity"] or 0) for b in batches)

            # Lô còn hạn (expiry_date >= hôm nay)
            valid_batches = []
            for b in batches:
                exp = b.get("expiry_date")
                if not exp:
                    # không có expiry_date → tùy hệ thống, tạm coi là còn hạn
                    valid_batches.append(b)
                    continue
                if exp >= today:
                    valid_batches.append(b)

            total_valid = sum(float(b["quantity"] or 0) for b in valid_batches)
            stock_unit = batches[0]["unit"]

            if not valid_batches:
                # Tất cả lô đều hết hạn
                return {
                    "stock": total_all,
                    "stock_unit": stock_unit,
                    "total_all": total_all,
                    "total_valid": 0.0,
                    "is_expired": True,
                    "is_low_stock": False,
                    "expiry_status": "Expired",
                    "days_left": -1,
                    "batch_status": "Expired",
                }

            # Có ít nhất 1 lô còn hạn
            # Tính số ngày tới lô gần hết hạn nhất
            min_exp = None
            for b in valid_batches:
                exp = b.get("expiry_date")
                if not exp:
                    continue
                if min_exp is None or exp < min_exp:
                    min_exp = exp

            days_left = None
            if min_exp is not None:
                days_left = (min_exp - today).days

            is_expired = False
            expiry_status = "Normal"

            if days_left is not None and days_left < 0:
                is_expired = True
                expiry_status = "Expired"
            elif days_left is not None and days_left <= 3:
                expiry_status = "NearExpiry"

            # Low stock = tổng tồn khả dụng < lượng cần cho 1 mẻ
            is_low_stock = False
            if needed_quantity is not None:
                is_low_stock = float(total_valid) < float(needed_quantity)

            return {
                "stock": total_valid,
                "stock_unit": stock_unit,
                "total_all": total_all,
                "total_valid": total_valid,
                "is_expired": is_expired,
                "is_low_stock": is_low_stock,
                "expiry_status": expiry_status,
                "days_left": days_left,
                "batch_status": "Valid" if not is_expired else "Expired",
            }
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def _enrich_recipe_ingredients_with_stock(recipe: dict):
        """
        Gắn thêm các field:
        - stock, stock_unit
        - is_expired, is_low_stock, expiry_status, days_left, batch_status
        vào từng ingredient trong recipe['ingredients'].
        """
        ingredients = recipe.get("ingredients") or []
        for ing in ingredients:
            ing_id = ing.get("ingredient_id")
            if not ing_id:
                continue
            needed = float(ing.get("quantity") or 0)
            info = RecipeController._calculate_stock_flags_for_ingredient(ing_id, needed_quantity=needed)
            ing.update(info)


