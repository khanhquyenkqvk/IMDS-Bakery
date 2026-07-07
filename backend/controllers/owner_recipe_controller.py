# backend/controllers/owner_recipe_controller.py
import json
from datetime import datetime

from utils.db import get_conn, dictfetchall   # dùng giống các controller khác


class OwnerRecipeController:
    # ===== helper =====
    @staticmethod
    def _normalize_dt(dt):
        if dt is None:
            return None
        if isinstance(dt, datetime):
            return dt.isoformat(timespec="seconds")
        return str(dt)

    @staticmethod
    def _build_recipe_summary_rows(rows):
        """
        Chuẩn hóa dữ liệu list recipe trả ra cho màn Recipe Management.
        Không dùng category nữa, tách riêng các field:
        - description
        - prep_time, cook_time, serves
        - difficulty
        - image_path
        """
        data = []
        for r in rows:
            status = "active" if r.get("is_active", 1) else "archived"
            data.append({
                "recipe_id":  r["recipe_id"],
                "menu_id":    r["menu_id"],
                "name":       r["name"],
                "description": r.get("description") or "",
                "status":     status,
                "prep_time":  r.get("prep_time"),
                "cook_time":  r.get("cook_time"),
                "serves":     r.get("serves"),
                "difficulty": r.get("difficulty"),
                "created_at": OwnerRecipeController._normalize_dt(r.get("created_at")),
                "image_path": r.get("image_path"),
            })
        return data

    # ===== LIST cho màn Recipe Management =====
    @staticmethod
    def list_recipes(args):
        """
        GET /api/owner/recipe/list?search=...

        Trả về:
        {
          success: true,
          data: [
            {
              recipe_id,
              menu_id,
              name,
              description,
              status: "active"|"archived",
              prep_time,
              cook_time,
              serves,
              difficulty,
              created_at,
              image_path
            }, ...
          ]
        }
        """
        search = (args.get("search") or "").strip()

        conn = get_conn()
        cur = conn.cursor()
        try:
            sql = """
                SELECT
                    r.recipe_id,
                    m.menu_id,
                    m.name,
                    m.description,
                    m.prep_time,
                    m.cook_time,
                    m.serves,
                    m.difficulty,
                    m.is_active,
                    m.created_at,
                    m.image_path
                FROM recipes r
                JOIN menu m ON r.menu_id = m.menu_id
            """

            params = []
            if search:
                sql += " WHERE m.name LIKE %s OR m.description LIKE %s"
                like = f"%%%s%%" % search  # hoặc dùng f"%{search}%"
                like = f"%{search}%"
                params.extend([like, like])

            sql += " ORDER BY m.created_at DESC, r.recipe_id DESC"

            cur.execute(sql, params)
            rows = dictfetchall(cur)
            data = OwnerRecipeController._build_recipe_summary_rows(rows)

            return {"success": True, "data": data}, 200
        except Exception as e:
            print("ERROR OwnerRecipeController.list_recipes:", e)
            return {"success": False, "error": "Failed to load recipes"}, 500
        finally:
            cur.close()
            conn.close()

    # ===== DETAIL (nếu cần xem chi tiết) =====
    @staticmethod
    def get_recipe(recipe_id: int):
        """
        GET /api/owner/recipe/<id>

        Không dùng category. Lấy thêm:
        - prep_time, cook_time, serves, difficulty, image_path.
        """
        conn = get_conn()
        cur = conn.cursor()
        try:
            sql_recipe = """
                SELECT
                    r.recipe_id,
                    r.menu_id,
                    r.instructions,
                    m.name,
                    m.description,
                    m.prep_time,
                    m.cook_time,
                    m.serves,
                    m.difficulty,
                    m.is_active,
                    m.created_by,
                    m.created_at,
                    m.image_path
                FROM recipes r
                JOIN menu m ON r.menu_id = m.menu_id
                WHERE r.recipe_id = %s
            """
            cur.execute(sql_recipe, (recipe_id,))
            header_rows = dictfetchall(cur)
            if not header_rows:
                return {"success": False, "error": "Recipe not found"}, 404

            header = header_rows[0]

            sql_ing = """
                SELECT
                    ri.recipe_ingredient_id,
                    i.ingredient_id,
                    i.name,
                    ri.quantity,
                    ri.unit
                FROM recipe_ingredients ri
                JOIN ingredients i ON ri.ingredient_id = i.ingredient_id
                WHERE ri.recipe_id = %s
                ORDER BY i.name
            """
            cur.execute(sql_ing, (recipe_id,))
            ingredients = dictfetchall(cur)

            instructions_raw = header.get("instructions")
            try:
                instructions = json.loads(instructions_raw) if instructions_raw else []
            except Exception:
                instructions = []

            data = {
                "recipe_id": header["recipe_id"],
                "menu_id": header["menu_id"],
                "name": header["name"],
                "description": header.get("description") or "",
                "prep_time": header.get("prep_time"),
                "cook_time": header.get("cook_time"),
                "serves": header.get("serves"),
                "difficulty": header.get("difficulty"),
                "status": "active" if header.get("is_active", 1) else "archived",
                "created_by": header.get("created_by"),
                "created_at": OwnerRecipeController._normalize_dt(header.get("created_at")),
                "image_path": header.get("image_path"),
                "ingredients": ingredients,
                "instructions": instructions,
            }
            return {"success": True, "data": data}, 200
        except Exception as e:
            print("ERROR OwnerRecipeController.get_recipe:", e)
            return {"success": False, "error": "Failed to load recipe detail"}, 500
        finally:
            cur.close()
            conn.close()

    # ===== PB15: CREATE FULL RECIPE =====
    @staticmethod
    def create_recipe(payload: dict):
        """
        POST /api/owner/recipe/create

        Frontend gửi dạng (ĐÃ BỎ CATEGORY):

        {
          "menu_name": "...",
          "description": "...",
          "difficulty": "easy|medium|hard",
          "prep_time": 30,
          "cook_time": 45,
          "serves": 6,
          "created_by": 1,
          "image_path": "/static/recipe_images/xxx.jpg",
          "ingredients": [
             {"ingredient_name": "Flour", "quantity": 1.2, "unit": "Kg"},
             ...
          ],
          "instructions": ["Step 1 ...", "Step 2 ..."]
        }
        """
        name        = (payload.get("menu_name") or payload.get("name") or "").strip()
        description = (payload.get("description") or "").strip()
        difficulty  = (payload.get("difficulty") or "").strip() or None
        prep_time   = payload.get("prep_time")
        cook_time   = payload.get("cook_time")
        serves      = payload.get("serves")
        created_by  = payload.get("created_by") or payload.get("approved_by")
        ingredients = payload.get("ingredients") or []
        instructions = payload.get("instructions") or []
        image_path  = payload.get("image_path")

        if not name:
            return {"success": False, "error": "menu_name is required"}, 400
        if not created_by:
            return {"success": False, "error": "created_by is required"}, 400
        if not description:
            return {"success": False, "error": "description is required"}, 400
        if not prep_time or not cook_time:
            return {"success": False, "error": "prep_time and cook_time are required"}, 400
        if not difficulty:
            return {"success": False, "error": "difficulty is required"}, 400

        conn = get_conn()
        cur = conn.cursor()
        try:
            # 1. Tạo menu — KHÔNG GỘP VÀO description nữa
            cur.execute(
                """
                INSERT INTO menu
                    (name, description,
                     prep_time, cook_time, serves, difficulty,
                     is_active, created_by, image_path)
                VALUES (%s, %s,
                        %s, %s, %s, %s,
                        1, %s, %s)
                """,
                (
                    name,
                    description,
                    prep_time,
                    cook_time,
                    serves,
                    difficulty,
                    created_by,
                    image_path,
                ),
            )
            menu_id = cur.lastrowid

            # 2. Tạo Recipe với instructions (JSON)
            try:
                instructions_json = json.dumps(instructions, ensure_ascii=False)
            except Exception:
                instructions_json = "[]"

            cur.execute(
                """
                INSERT INTO recipes (menu_id, approved_by, instructions)
                VALUES (%s, %s, %s)
                """,
                (menu_id, created_by, instructions_json),
            )
            recipe_id = cur.lastrowid

            # 3. Thêm từng ingredient
            for ing in ingredients:
                ing_name = (ing.get("ingredient_name") or "").strip()
                ing_id   = ing.get("ingredient_id")
                qty      = ing.get("quantity")
                unit     = (ing.get("unit") or "").strip() or "g"

                if qty is None or (not ing_name and not ing_id):
                    continue

                if not ing_id:
                    # tìm theo tên, nếu chưa có thì tạo
                    cur.execute(
                        "SELECT ingredient_id FROM ingredients WHERE name = %s LIMIT 1",
                        (ing_name,),
                    )
                    row = cur.fetchone()
                    if row:
                        ing_id = row[0]
                    else:
                        cur.execute(
                            "INSERT INTO ingredients (name, unit) VALUES (%s, %s)",
                            (ing_name, unit),
                        )
                        ing_id = cur.lastrowid

                cur.execute(
                    """
                    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (recipe_id, ing_id, float(qty), unit),
                )

            conn.commit()
            return {
                "success": True,
                "data": {
                    "recipe_id": recipe_id,
                    "menu_id": menu_id,
                    "name": name,
                    "description": description,
                },
            }, 201

        except Exception as e:
            conn.rollback()
            print("ERROR OwnerRecipeController.create_recipe:", e)
            return {"success": False, "error": str(e)}, 500
        finally:
            cur.close()
            conn.close()
    # ===== PB15: UPDATE FULL RECIPE =====
    @staticmethod
    def update_recipe(recipe_id: int, payload: dict):
        """
        PUT /api/owner/recipe/<id>

        Frontend gửi giống create_recipe, nhưng không bắt buộc upload lại ảnh:
        {
          "menu_name": "...",
          "description": "...",
          "difficulty": "easy|medium|hard",
          "prep_time": 30,
          "cook_time": 45,
          "serves": 6,
          "created_by": 1,
          "image_path": "/static/recipe_images/xxx.jpg" (cũ hoặc mới),
          "status": "active" | "archived",
          "ingredients": [
             {"ingredient_name": "Flour", "quantity": 1.2, "unit": "Kg", "ingredient_id": null},
             ...
          ],
          "instructions": ["Step 1 ...", "Step 2 ..."]
        }
        """
        name        = (payload.get("menu_name") or payload.get("name") or "").strip()
        description = (payload.get("description") or "").strip()
        difficulty  = (payload.get("difficulty") or "").strip() or None
        prep_time   = payload.get("prep_time")
        cook_time   = payload.get("cook_time")
        serves      = payload.get("serves")
        image_path  = payload.get("image_path")
        status_str  = (payload.get("status") or "active").strip().lower()
        ingredients = payload.get("ingredients") or []
        instructions = payload.get("instructions") or []

        if not name:
            return {"success": False, "error": "menu_name is required"}, 400
        if not description:
            return {"success": False, "error": "description is required"}, 400
        if not prep_time or not cook_time:
            return {"success": False, "error": "prep_time and cook_time are required"}, 400
        if not difficulty:
            return {"success": False, "error": "difficulty is required"}, 400

        is_active = 1 if status_str == "active" else 0

        conn = get_conn()
        cur = conn.cursor()
        try:
            # 0. Lấy thông tin hiện tại để biết menu_id
            cur.execute(
                "SELECT menu_id FROM recipes WHERE recipe_id = %s",
                (recipe_id,)
            )
            row = cur.fetchone()
            if not row:
                return {"success": False, "error": "Recipe not found"}, 404
            menu_id = row[0]

            # 1. Update menu
            cur.execute(
                """
                UPDATE menu
                   SET name = %s,
                       description = %s,
                       prep_time = %s,
                       cook_time = %s,
                       serves = %s,
                       difficulty = %s,
                       is_active = %s,
                       image_path = %s
                 WHERE menu_id = %s
                """,
                (
                    name,
                    description,
                    prep_time,
                    cook_time,
                    serves,
                    difficulty,
                    is_active,
                    image_path,
                    menu_id,
                ),
            )

            # 2. Update instructions JSON trong recipes
            try:
                instructions_json = json.dumps(instructions, ensure_ascii=False)
            except Exception:
                instructions_json = "[]"

            cur.execute(
                """
                UPDATE recipes
                   SET instructions = %s
                 WHERE recipe_id = %s
                """,
                (instructions_json, recipe_id),
            )

            # 3. Xóa toàn bộ recipe_ingredients cũ, insert lại
            cur.execute(
                "DELETE FROM recipe_ingredients WHERE recipe_id = %s",
                (recipe_id,)
            )

            for ing in ingredients:
                ing_name = (ing.get("ingredient_name") or ing.get("name") or "").strip()
                ing_id   = ing.get("ingredient_id")
                qty      = ing.get("quantity")
                unit     = (ing.get("unit") or "").strip() or "g"

                if qty is None or (not ing_name and not ing_id):
                    continue

                if not ing_id:
                    # tìm theo tên, nếu chưa có thì tạo
                    cur.execute(
                        "SELECT ingredient_id FROM ingredients WHERE name = %s LIMIT 1",
                        (ing_name,),
                    )
                    row = cur.fetchone()
                    if row:
                        ing_id = row[0]
                    else:
                        cur.execute(
                            "INSERT INTO ingredients (name, unit) VALUES (%s, %s)",
                            (ing_name, unit),
                        )
                        ing_id = cur.lastrowid

                cur.execute(
                    """
                    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (recipe_id, ing_id, float(qty), unit),
                )

            conn.commit()
            return {
                "success": True,
                "data": {
                    "recipe_id": recipe_id,
                    "menu_id": menu_id,
                    "name": name,
                    "description": description,
                    "status": "active" if is_active else "archived",
                },
            }, 200

        except Exception as e:
            conn.rollback()
            print("ERROR OwnerRecipeController.update_recipe:", e)
            return {"success": False, "error": str(e)}, 500
        finally:
            cur.close()
            conn.close()

    # ===== PB15: DELETE RECIPE (Xoá cả menu) =====
    @staticmethod
    def delete_recipe(recipe_id: int):
        """
        DELETE /api/owner/recipe/<id>

        Xoá:
        - recipe_ingredients
        - recipes
        - menu (1-1 với recipes trong hệ thống này)
        """
        conn = get_conn()
        cur = conn.cursor()
        try:
            # Lấy menu_id
            cur.execute(
                "SELECT menu_id FROM recipes WHERE recipe_id = %s",
                (recipe_id,)
            )
            row = cur.fetchone()
            if not row:
                return {"success": False, "error": "Recipe not found"}, 404
            menu_id = row[0]

            # Xoá chi tiết nguyên liệu
            cur.execute(
                "DELETE FROM recipe_ingredients WHERE recipe_id = %s",
                (recipe_id,)
            )

            # Xoá recipe
            cur.execute(
                "DELETE FROM recipes WHERE recipe_id = %s",
                (recipe_id,)
            )

            # Xoá menu (do 1-1)
            cur.execute(
                "DELETE FROM menu WHERE menu_id = %s",
                (menu_id,)
            )

            conn.commit()
            return {"success": True}, 200

        except Exception as e:
            conn.rollback()
            print("ERROR OwnerRecipeController.delete_recipe:", e)
            return {"success": False, "error": str(e)}, 500
        finally:
            cur.close()
            conn.close()
