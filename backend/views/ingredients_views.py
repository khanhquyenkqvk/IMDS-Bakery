from flask import Blueprint, request, jsonify
from flask_cors import cross_origin

from backend.controllers.import_controller import import_ingredients
from flask import render_template
from flask import Blueprint
from backend.controllers.inventory_controller import get_inventory, get_lot_details
from backend.controllers.recipe_controller import RecipeController
from backend.utils.db import get_conn

bp_ingredients = Blueprint("ingredients", __name__, url_prefix="/api")

@bp_ingredients.route("/imports", methods=["POST"])
@cross_origin()
def create_import():
    user_id = (request.headers.get("X-User-Id") and int(request.headers["X-User-Id"])) or 1

    data = request.get_json(force=True, silent=True) or {}
    if not data.get("batch_code") or not data.get("received_date") or not data.get("items"):
        return jsonify({"error":"Invalid payload"}), 400

    try:
        result = import_ingredients(data, user_id)
        return jsonify({"ok": True, "data": result["saved"]}), 201
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
# Route để lấy tất cả inventory
@bp_ingredients.route("/inventory", methods=["GET"])
def inventory():
    return get_inventory()

# Route để lấy chi tiết lot theo lot_code
@bp_ingredients.route("/inventory/<lot_code>", methods=["GET"])
def inventory_details(lot_code):
    return get_lot_details(lot_code)

@bp_ingredients.route("/import-suggestions", methods=["GET"])
def import_suggestions():
    """
    Gợi ý các nguyên liệu nên nhập thêm:
    - Dựa trên tất cả công thức (recipe_ingredients)
    - Nếu nguyên liệu đó đang Expired hoặc LowStock theo logic mới
    - Gộp theo ingredient, ưu tiên lý do Expired
    """
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        # Lấy tất cả ingredient trong công thức
        cur.execute("""
            SELECT ri.ingredient_id,
                   i.name,
                   i.unit,
                   ri.quantity AS needed_per_batch
            FROM recipe_ingredients ri
            JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        suggestions = {}
        for r in rows:
            ing_id = r["ingredient_id"]
            needed = float(r["needed_per_batch"] or 0)

            stock_info = RecipeController._calculate_stock_flags_for_ingredient(
                ing_id, needed_quantity=needed
            )

            # Quy ước:
            #  - Expired: tất cả lô valid hết hạn → bắt buộc nhập mới
            #  - LowStock: còn hạn nhưng tổng tồn < needed
            if stock_info["is_expired"]:
                reason = "Expired"
            elif stock_info["is_low_stock"]:
                reason = "LowStock"
            else:
                continue  # đủ hàng + còn hạn => không cần gợi ý

            missing = max(needed - stock_info["total_valid"], 0.0)
            if missing <= 0 and reason == "Expired":
                # hết hạn toàn bộ thì đề nghị ít nhất = lượng của 1 mẻ
                missing = needed

            s = suggestions.get(ing_id)
            if not s:
                suggestions[ing_id] = {
                    "ingredient_id": ing_id,
                    "name": r["name"],
                    "unit": r["unit"],
                    "reason": reason,
                    "needed_per_batch": needed,
                    "current_stock": stock_info["total_valid"],
                    "recommended_quantity": round(missing, 2),
                }
            else:
                # Nếu nhiều recipe dùng cùng nguyên liệu → lấy max
                s["needed_per_batch"] = max(s["needed_per_batch"], needed)
                s["recommended_quantity"] = max(s["recommended_quantity"], round(missing, 2))
                # Expired ưu tiên hơn LowStock
                if reason == "Expired":
                    s["reason"] = "Expired"

        return jsonify({"success": True, "data": list(suggestions.values())}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    
@bp_ingredients.route("/ingredients", methods=["GET"])
def list_ingredients():
    q = (request.args.get("q") or "").strip()
    limit = int(request.args.get("limit") or 20)

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        sql = """
            SELECT ingredient_id, name, unit
            FROM ingredients
        """
        params = []
        if q:
            sql += " WHERE name LIKE %s"
            params.append(f"%{q}%")
        sql += " ORDER BY name ASC LIMIT %s"
        params.append(limit)

        cur.execute(sql, params)
        rows = cur.fetchall()
        return jsonify({"success": True, "data": rows}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()
@bp_ingredients.route("/ingredients/suggest", methods=["GET"])
def suggest_ingredients():
    q = (request.args.get("q") or "").strip()
    limit = int(request.args.get("limit") or 8)

    if not q:
        return jsonify({"success": True, "data": []}), 200

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # ưu tiên prefix match (q%) trước, rồi mới tới contains (%q%)
        sql = """
            SELECT ingredient_id, name, unit, shelf_life_days
            FROM ingredients
            WHERE name LIKE %s
            ORDER BY
                CASE WHEN LOWER(name) LIKE LOWER(%s) THEN 0 ELSE 1 END,
                name ASC
            LIMIT %s
        """
        like_any = f"%{q}%"
        like_prefix = f"{q}%"
        cur.execute(sql, (like_any, like_prefix, limit))
        rows = cur.fetchall()
        return jsonify({"success": True, "data": rows}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cur.close()
        conn.close()
