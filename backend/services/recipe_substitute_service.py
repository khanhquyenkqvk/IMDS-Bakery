# backend/services/recipe_substitute_service.py
import json
import math
from datetime import date, datetime
from services.ai_recipe_substitute_service import build_context_hash, call_ai_substitution, call_ai_rewrite_instructions



def normalize_unit(u: str) -> str:
    u = (u or "").strip().lower()
    # common aliases
    if u in ("liter", "litre", "lt", "l", "ℓ"):
        return "l"
    if u in ("milliliter", "millilitre", "ml"):
        return "ml"
    if u in ("kilogram", "kg"):
        return "kg"
    if u in ("gram", "g"):
        return "g"
    if u in ("piece", "pieces", "pcs", "pc", "each"):
        return "pcs"
    return u
# ===== Unit conversion (cho phép khác unit) =====
UNIT_FACTORS = {
    # weight
    ("g", "kg"): 1 / 1000,
    ("kg", "g"): 1000,
    # volume
    ("ml", "l"): 1 / 1000,
    ("l", "ml"): 1000,
    # count
    ("pcs", "each"): 1,
    ("each", "pcs"): 1,

    # identity
    ("g", "g"): 1,
    ("kg", "kg"): 1,
    ("ml", "ml"): 1,
    ("l", "l"): 1,
    ("pcs", "pcs"): 1,
    ("each", "each"): 1,
}

def to_float(x, default=0.0):
    try:
        return float(x)
    except Exception:
        return default

def convert_qty(qty, from_unit, to_unit):
    if qty is None:
        return None
    fu = normalize_unit(from_unit)
    tu = normalize_unit(to_unit)
    if not fu or not tu:
        return None
    factor = UNIT_FACTORS.get((fu, tu))
    if factor is None:
        return None
    return float(qty) * factor

def days_left(expiry_date):
    if not expiry_date:
        return None
    if isinstance(expiry_date, str):
        expiry_date = date.fromisoformat(expiry_date)
    return (expiry_date - date.today()).days
def get_ingredient_base_unit(conn, ingredient_id: int) -> str:
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT unit FROM ingredients WHERE ingredient_id=%s LIMIT 1", (ingredient_id,))
    row = cur.fetchone() or {}
    cur.close()
    return (row.get("unit") or "").strip()


# ===== Simple substitute rules (rule-based) =====
# Bạn có thể mở rộng dần. Rule ưu tiên theo “tương đương nguyên liệu” trong làm bánh.
SUBSTITUTE_RULES = {
    "cream cheese": [
        ("mascarpone cheese", 1.0, "Similar dairy base; common substitute in cheesecake/tiramisu"),
        ("whipping cream", 0.8, "Texture substitute; may change structure, use with gelatin if needed"),
    ],
    "mascarpone cheese": [
        ("cream cheese", 1.0, "Similar dairy base; common substitute"),
    ],
    "strawberries": [
        ("blueberries", 1.0, "Same fruit category; similar moisture and flavor profile"),
    ],
    "blueberries": [
        ("strawberries", 1.0, "Same fruit category; similar moisture and flavor profile"),
    ],
    "butter": [
        ("oil", 0.8, "Fat substitute; adjust texture (rule-of-thumb)"),
    ],
    "sugar": [
        ("powdered sugar", 1.0, "Same sweetness base; may affect texture"),
    ]
}

def normalize_name(s: str) -> str:
    return (s or "").strip().lower()
SUBSTITUTE_RULES_BY_ID = {
    # Granulated sugar (id=4)
    4: [
        (99, 1.0, "Replace granulated sugar with powdered sugar"),
    ],

    # Mascarpone (id=17)
    17: [
        (18, 1.0, "Replace mascarpone with cream cheese"),
        (19, 0.8, "Replace mascarpone with whipping cream (adjust texture)"),
    ],

    # Coffee beans (id=30)
    30: [
        (31, 1.0, "Replace coffee beans with instant coffee powder"),
    ],

    # Instant yeast (id=9)
    9: [
        (32, 0.8, "Replace instant yeast with active dry yeast"),
    ],
}


def pick_candidates(conn, ingredient_id: int, ingredient_name_norm: str):
    # ưu tiên theo ID
    if ingredient_id in SUBSTITUTE_RULES_BY_ID:
        out = []
        cur = conn.cursor(dictionary=True)
        for (to_id, ratio, reason) in SUBSTITUTE_RULES_BY_ID[ingredient_id]:
            cur.execute(
                "SELECT ingredient_id, name, unit FROM ingredients WHERE ingredient_id=%s LIMIT 1",
                (to_id,)
            )
            cand = cur.fetchone()
            if cand:
                out.append({
                    "ingredient_id": cand["ingredient_id"],
                    "name": cand["name"],
                    "unit": cand.get("unit"),
                    "ratio": ratio,
                    "reason": reason
                })
        cur.close()
        return out

    # fallback theo name
    # format giống trên để build_substitute_formulas dùng chung
    out = []
    for (cand_name, ratio, reason) in SUBSTITUTE_RULES.get(ingredient_name_norm, []):
        cand = find_ingredient_by_name(conn, normalize_name(cand_name))
        if cand:
            out.append({
                "ingredient_id": cand["ingredient_id"],
                "name": cand["name"],
                "unit": cand.get("unit"),
                "ratio": ratio,
                "reason": reason
            })
    return out


# ===== DB queries =====
def fetch_all_recipes_basic(conn):
    """
    Lấy danh sách recipes + menu meta (name, difficulty, etc.)
    """
    sql = """
    SELECT
      r.recipe_id,
      m.menu_id,
      m.name AS recipe_name,
      m.description,
      m.prep_time, m.cook_time, m.serves, m.difficulty,
      m.image_path
    FROM recipes r
    JOIN menu m ON m.menu_id = r.menu_id
    """
    cur = conn.cursor(dictionary=True)
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    return rows or []

def fetch_recipe_ingredients(conn, recipe_id):
    sql = """
    SELECT
      ri.ingredient_id,
      i.name AS ingredient_name,
      ri.quantity,
      ri.unit AS recipe_unit
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
    WHERE ri.recipe_id = %s
    """
    cur = conn.cursor(dictionary=True)
    cur.execute(sql, (recipe_id,))
    rows = cur.fetchall()
    cur.close()
    return rows or []

def fetch_inventory_by_ingredient_id(conn, ingredient_id):
    """
    Lấy tổng tồn kho theo ingredient_id.
    inventory có thể nhiều dòng -> phải SUM.
    Unit: ưu tiên unit trong inventory, fallback ingredient.unit
    """
    cur = conn.cursor(dictionary=True)

    cur.execute("""
        SELECT ingredient_id,
               SUM(current_stock) AS current_stock,
               MAX(unit) AS unit
        FROM inventory
        WHERE ingredient_id = %s
        GROUP BY ingredient_id
    """, (ingredient_id,))
    row = cur.fetchone()

    # fallback unit nếu inventory unit null
    if row and (not row.get("unit")):
        cur.execute("SELECT unit FROM ingredients WHERE ingredient_id=%s LIMIT 1", (ingredient_id,))
        ing = cur.fetchone()
        if ing and ing.get("unit"):
            row["unit"] = ing["unit"]

    cur.close()
    return row

def fetch_soonest_expiry_batch(conn, ingredient_id):
    """
    Lấy batch có expiry_date gần nhất (Valid/NearExpiry) để tính days_left.
    """
    sql = """
    SELECT batch_id, lot_code, quantity, unit, expiry_date, status
    FROM batches
    WHERE ingredient_id = %s
      AND status IN ('Valid','NearExpiry','Opened')
      AND expiry_date IS NOT NULL
    ORDER BY expiry_date ASC
    LIMIT 1
    """
    cur = conn.cursor(dictionary=True)
    cur.execute(sql, (ingredient_id,))
    row = cur.fetchone()
    cur.close()
    return row

def find_ingredient_by_name(conn, name_norm):
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT ingredient_id, name, unit
        FROM ingredients
        WHERE LOWER(name) LIKE %s
        ORDER BY LENGTH(name) ASC
        LIMIT 1
    """, (f"%{name_norm}%",))
    row = cur.fetchone()
    cur.close()
    return row


def check_problem_for_recipe(conn, recipe_id):
    ingredients = fetch_recipe_ingredients(conn, recipe_id)
    problems = []

    for ing in ingredients:
        if normalize_name(ing["ingredient_name"]) in ("parchment paper", "baking paper", "wax paper"):
            continue

        need_qty = to_float(ing["quantity"], 0)
        need_unit = (ing["recipe_unit"] or "").strip()

        base_unit = get_ingredient_base_unit(conn, ing["ingredient_id"])
        need_in_base = convert_qty(need_qty, need_unit, base_unit)

        if need_in_base is None:
            problems.append({
                "ingredient_id": ing["ingredient_id"],
                "ingredient_name": ing["ingredient_name"],
                "issue": "UnitMismatch",
                "need": {"qty": need_qty, "unit": need_unit},
                "inventory": {"qty": None, "unit": base_unit},
                "note": "Cannot convert recipe unit to ingredient base unit"
            })
            continue

        stock_info = calculate_owner_stock_flags(conn, ing["ingredient_id"], need_in_base, base_unit)

        if stock_info["has_unit_issue"]:
            problems.append({
                "ingredient_id": ing["ingredient_id"],
                "ingredient_name": ing["ingredient_name"],
                "issue": "UnitMismatch",
                "need": {"qty": need_qty, "unit": need_unit},
                "inventory": {"qty": stock_info["total_valid"], "unit": base_unit},
                "note": "Some batch units cannot be converted (e.g., pack/bag/box). Manual check required."
            })
            continue

        if stock_info["is_expired"]:
            problems.append({
                "ingredient_id": ing["ingredient_id"],
                "ingredient_name": ing["ingredient_name"],
                "issue": "Expired",
                "days_left": stock_info["days_left"]
            })
        elif stock_info["expiry_status"] == "NearExpiry":
            problems.append({
                "ingredient_id": ing["ingredient_id"],
                "ingredient_name": ing["ingredient_name"],
                "issue": "NearExpiry",
                "days_left": stock_info["days_left"]
            })
        elif stock_info["is_low_stock"]:
            problems.append({
                "ingredient_id": ing["ingredient_id"],
                "ingredient_name": ing["ingredient_name"],
                "issue": "LowStock",
                "need": {"qty": need_qty, "unit": need_unit},
                "inventory": {"qty": stock_info["total_valid"], "unit": base_unit}
            })

    materials_check = build_materials_check_rows(conn, ingredients)
    return problems, ingredients, materials_check


def build_substitute_formulas(conn, recipe_id, recipe_name, problems, materials_check, max_formulas=3):
    if not problems:
        return []

    priority = {"Expired": 1, "LowStock": 2, "NearExpiry": 3, "UnitMismatch": 4}
    problems_sorted = sorted(problems, key=lambda p: priority.get(p.get("issue"), 99))

    base_ingredients = fetch_recipe_ingredients(conn, recipe_id)
    base_instructions = fetch_recipe_instructions(conn, recipe_id)

    def find_base_row_by_ing_id(ing_id: int):
        for x in base_ingredients:
            if int(x["ingredient_id"]) == int(ing_id):
                return x
        return None

    def choose_best_candidate(old_qty, old_unit, candidates):
        """
        Pick the most realistic candidate based on:
        - unit convertible to candidate base unit
        - not expired
        - prefer enough stock
        - prefer not NearExpiry
        """
        best = None
        best_score = None

        for cand in candidates:
            cand_id = int(cand["ingredient_id"])
            cand_base_unit = get_ingredient_base_unit(conn, cand_id)
            if not cand_base_unit:
                continue

            ratio = float(cand.get("ratio") or 1.0)
            new_qty_in_old_unit = float(old_qty) * ratio

            # Convert needed qty -> candidate base unit for realistic batch check
            need_in_cand_base = convert_qty(new_qty_in_old_unit, old_unit, cand_base_unit)
            if need_in_cand_base is None:
                # Cannot verify realistically -> skip
                continue

            stock = calculate_owner_stock_flags(conn, cand_id, need_in_cand_base, cand_base_unit)
            if stock["is_expired"]:
                continue
            if stock["has_unit_issue"]:
                # candidate has batches with non-convertible units -> unreliable
                continue

            enough = (not stock["is_low_stock"])
            near = (stock["expiry_status"] == "NearExpiry")

            # Lower score is better
            #   prefer enough=True, near=False, larger days_left, larger total_valid
            days_left = stock["days_left"]
            days_left_val = 9999 if days_left is None else int(days_left)
            score = (
                0 if enough else 1,
                0 if not near else 1,
                -days_left_val,
                -float(stock["total_valid"] or 0.0),
            )

            if best is None or score < best_score:
                best = (cand, ratio, new_qty_in_old_unit, stock, cand_base_unit)
                best_score = score

        return best  # (cand, ratio, new_qty_in_old_unit, stock, cand_base_unit) or None

    # ===== MULTI-REPLACE: replace all problematic ingredients that have a valid substitute =====
    replacements = []

    for p in problems_sorted:
        issue = p.get("issue")

        # Only replace when Expired or LowStock (realistic policy)
        if issue not in ("Expired", "LowStock"):
            continue

        old_ing_id = int(p.get("ingredient_id"))
        old_row = find_base_row_by_ing_id(old_ing_id)
        if not old_row:
            continue

        old_qty = to_float(old_row.get("quantity"), 0)
        old_unit = (old_row.get("recipe_unit") or "").strip()

        bad_name_norm = normalize_name(old_row.get("ingredient_name"))
        cands = pick_candidates(conn, old_ing_id, bad_name_norm)
        print("[RULE] recipe", recipe_name, "old_ing_id", old_ing_id, "cands", len(cands), flush=True)

        if not cands:
            continue

        picked = choose_best_candidate(old_qty, old_unit, cands)
        if not picked:
            # No realistic candidate (unit mismatch or all expired) -> skip this ingredient
            continue

        cand, ratio, new_qty_in_old_unit, stock, cand_base_unit = picked
        cand_id = int(cand["ingredient_id"])

        # For UI/instructions: keep recipe unit (old_unit) to remain consistent in recipe steps
        # Stock check is already done in candidate base unit.
        replacements.append({
            "issue": issue,
            "from": {
                "ingredient_id": int(old_row["ingredient_id"]),
                "name": old_row["ingredient_name"],
                "qty": float(old_qty),
                "unit": old_unit
            },
            "to": {
                "ingredient_id": cand_id,
                "name": cand["name"],
                "qty": round(float(new_qty_in_old_unit), 2),
                "unit": old_unit  # keep recipe unit
            },
            "ratio": float(ratio),
            "reason": cand.get("reason"),
            "inventory_check": {
                "enough": (not stock["is_low_stock"]),
                "inventory_qty": float(stock["total_valid"]),
                "inventory_unit": cand_base_unit,
                "expiry_status": stock["expiry_status"],
                "days_left": stock["days_left"]
            }
        })

        if len(replacements) >= int(max_formulas or 3):
            break

    if not replacements:
        return []

    rep_by_old_id = {int(r["from"]["ingredient_id"]): r for r in replacements}

    # ===== build new_ings: apply all replacements =====
    new_ings = []
    for ing in base_ingredients:
        ing_id = int(ing["ingredient_id"])
        if ing_id in rep_by_old_id:
            r = rep_by_old_id[ing_id]
            new_ings.append({
                "ingredient_id": r["to"]["ingredient_id"],
                "name": r["to"]["name"],
                "quantity": r["to"]["qty"],
                "unit": r["to"]["unit"]
            })
        else:
            new_ings.append({
                "ingredient_id": ing_id,
                "name": ing["ingredient_name"],
                "quantity": float(ing["quantity"]),
                "unit": ing["recipe_unit"]
            })

    # ===== build alternative_ingredients: status based on batches (real stock) =====
    alternative_ingredients = []
    for ing in base_ingredients:
        ing_id = int(ing["ingredient_id"])
        ing_name = ing["ingredient_name"]
        ing_qty = to_float(ing["quantity"], 0)
        ing_unit = (ing["recipe_unit"] or "").strip()

        base_unit = get_ingredient_base_unit(conn, ing_id)
        need_in_base = convert_qty(ing_qty, ing_unit, base_unit)

        if need_in_base is None:
            wh = "UnitMismatch"
            stock_info = None
        else:
            stock_info = calculate_owner_stock_flags(conn, ing_id, need_in_base, base_unit)
            if stock_info["has_unit_issue"]:
                wh = "UnitMismatch"
            elif stock_info["is_expired"]:
                wh = "Expired"
            elif stock_info["expiry_status"] == "NearExpiry":
                wh = "ExpiringSoon"
            elif stock_info["is_low_stock"]:
                wh = "NotEnough"
            else:
                wh = "InStock"

        if ing_id in rep_by_old_id:
            r = rep_by_old_id[ing_id]
            alternative_ingredients.append({
                "ingredient_id": ing_id,
                "name": ing_name,
                "type": "Replaced",
                "original": {"qty": ing_qty, "unit": ing_unit},
                "new": {"name": r["to"]["name"], "qty": r["to"]["qty"], "unit": r["to"]["unit"]},
                "warehouse_status": wh
            })
        else:
            alternative_ingredients.append({
                "ingredient_id": ing_id,
                "name": ing_name,
                "type": "Original",
                "original": {"qty": ing_qty, "unit": ing_unit},
                "new": {"qty": ing_qty, "unit": ing_unit},
                "warehouse_status": wh
            })

    # ===== instructions: list replacements + original steps =====
    ai_instructions = []
    for r in replacements:
        ai_instructions.append(
            f"Substitute {r['from']['name']} → {r['to']['name']} (ratio {r['ratio']})."
        )
        if float(r["ratio"]) != 1:
            ai_instructions.append(
                f"Adjust quantity from {r['from']['qty']} {r['from']['unit']} → {r['to']['qty']} {r['to']['unit']}."
            )
    if base_instructions:
        ai_instructions.extend(base_instructions)

    formulas = [{
        "target_recipe_id": recipe_id,
        "target_recipe_name": recipe_name,
        "reasons": problems_sorted[:3],
        "materials_check": materials_check,

        "substitutions": replacements,
        "substitution": (replacements[0] if replacements else None),

        "alternative_ingredients": alternative_ingredients,
        "ai_instructions": ai_instructions,
        "new_recipe": {
            "ingredients": new_ings,
            "notes": "Review texture/flavor impacts before approval."
        }
    }]
    context_hash = build_context_hash(recipe_id, problems_sorted, materials_check)
    formulas[0]["context_hash"] = context_hash

    return formulas

def upsert_recipe_substitute_suggestions(conn, owner_id, recipe, formulas):
    """
    Return (created_count, updated_count)
    - created_count: số suggestions mới INSERT
    - updated_count: số pending cũ bị archive (0/1)
    """
    if not formulas:
        return 0, 0

    new_hash = (formulas[0] or {}).get("context_hash")

    cur = conn.cursor(dictionary=True)
    cur.execute("""
      SELECT suggestion_id, details
      FROM suggestions
      WHERE suggestion_type='Recipe_Substitute'
        AND status='Pending'
        AND is_archived=0
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(details, '$.target_recipe_id')) AS UNSIGNED) = %s
      ORDER BY created_at DESC
      LIMIT 1
    """, (recipe["recipe_id"],))
    existing = cur.fetchone()

    updated = 0

    if existing:
        try:
            old_details = json.loads(existing["details"] or "{}")
            old_hash = old_details.get("context_hash")
        except Exception:
            old_hash = None

        # Nếu hash giống nhau -> khỏi tạo
        if old_hash and new_hash and old_hash == new_hash:
            cur.close()
            return 0, 0

        # Hash khác -> archive pending cũ
        cur.execute(
            "UPDATE suggestions SET is_archived=1 WHERE suggestion_id=%s",
            (existing["suggestion_id"],)
        )
        updated = 1

    created = 0
    for f in formulas[:3]:
        details = json.dumps(f, ensure_ascii=False)
        cur.execute("""
          INSERT INTO suggestions (suggestion_type, created_by, details, status, is_archived)
          VALUES ('Recipe_Substitute', %s, %s, 'Pending', 0)
        """, (owner_id, details))
        created += 1

    conn.commit()
    cur.close()
    return created, updated



def list_recipe_substitute_suggestions(conn, status=None):
    """
    Trả về suggestions Recipe_Substitute để render tab.
    """
    params = []
    where = ["suggestion_type='Recipe_Substitute'", "is_archived=0"]
    if status:
        where.append("status=%s")
        params.append(status)

    sql = f"""
    SELECT suggestion_id, details, status, created_at, approved_by, created_by
    FROM suggestions
    WHERE {" AND ".join(where)}
    ORDER BY created_at DESC
    """
    cur = conn.cursor(dictionary=True)
    cur.execute(sql, tuple(params))
    rows = cur.fetchall() or []
    cur.close()

    # parse details json
    out = []
    for r in rows:
        try:
            d = json.loads(r["details"]) if r.get("details") else {}
        except Exception:
            d = {}
        out.append({
            "suggestion_id": r["suggestion_id"],
            "status": r["status"],
            "created_at": str(r["created_at"]) if r.get("created_at") else None,
            "approved_by": r.get("approved_by"),
            "created_by": r.get("created_by"),
            "details": d
        })
    return out

def approve_recipe_substitute(conn, suggestion_id, owner_id):
    """
    Approve 1 suggestion; archive các pending khác cùng recipe để employee chỉ thấy 1 bản “được chọn”.
    """
    cur = conn.cursor(dictionary=True)

    cur.execute("SELECT details FROM suggestions WHERE suggestion_id=%s", (suggestion_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        return False, "Suggestion not found"

    try:
        d = json.loads(row["details"])
        recipe_id = d.get("target_recipe_id")
    except Exception:
        recipe_id = None

    # Approve selected
    cur.execute("""
      UPDATE suggestions
      SET status='Approved', approved_by=%s
      WHERE suggestion_id=%s
    """, (owner_id, suggestion_id))

    # Archive other pending for same recipe
    if recipe_id:
        cur.execute("""
          UPDATE suggestions
          SET is_archived=1
          WHERE suggestion_type='Recipe_Substitute'
            AND status='Pending'
            AND is_archived=0
            AND CAST(JSON_UNQUOTE(JSON_EXTRACT(details, '$.target_recipe_id')) AS UNSIGNED) = %s
        """, (recipe_id,))

    conn.commit()
    cur.close()
    return True, None

def reject_recipe_substitute(conn, suggestion_id, owner_id=None):
    cur = conn.cursor()
    cur.execute("""
      UPDATE suggestions
      SET status='Rejected'
      WHERE suggestion_id=%s
    """, (suggestion_id,))
    conn.commit()
    cur.close()
    return True
def build_materials_check_rows(conn, ingredients):
    rows = []
    for ing in ingredients:
        need_qty = to_float(ing["quantity"], 0)
        need_unit = (ing["recipe_unit"] or "").strip()

        base_unit = get_ingredient_base_unit(conn, ing["ingredient_id"])
        need_in_base = convert_qty(need_qty, need_unit, base_unit)

        if need_in_base is None:
            rows.append({
                "ingredient_id": ing["ingredient_id"],
                "ingredient_name": ing["ingredient_name"],
                "need_qty": need_qty,
                "need_unit": need_unit,
                "inventory_qty": None,
                "inventory_unit": base_unit,
                "status": "UnitMismatch",
                "days_left": None,
                "lot_code": None
            })
            continue

        stock_info = calculate_owner_stock_flags(conn, ing["ingredient_id"], need_in_base, base_unit)

        status = "Enough"
        if stock_info["has_unit_issue"]:
            status = "UnitMismatch"
        elif stock_info["is_expired"]:
            status = "Expired"
        elif stock_info["expiry_status"] == "NearExpiry":
            status = "NearExpiry"
        elif stock_info["is_low_stock"]:
            status = "NotEnough"

        rows.append({
            "ingredient_id": ing["ingredient_id"],
            "ingredient_name": ing["ingredient_name"],
            "need_qty": need_qty,
            "need_unit": need_unit,
            "inventory_qty": stock_info["total_valid"],   # in base unit
            "inventory_unit": stock_info["unit"],         # base unit
            "status": status,
            "days_left": stock_info["days_left"],
            "lot_code": None
        })

    return rows

def calculate_owner_stock_flags(conn, ingredient_id, needed_qty_in_base, base_unit: str):
    """
    Realistic stock check:
    - Source of truth: batches (Valid/NearExpiry/Opened)
    - Convert each batch quantity -> ingredient base_unit before summing
    - If a batch unit cannot be converted -> flag UnitMismatch risk (manual check)
    """
    today = date.today()
    base_u = (base_unit or "").strip()

    cur = conn.cursor(dictionary=True)

    # Active batches only (exclude UsedUp)
    cur.execute("""
        SELECT quantity, unit, expiry_date, status
        FROM batches
        WHERE ingredient_id = %s
          AND status IN ('Valid', 'NearExpiry', 'Opened')
    """, (ingredient_id,))
    batches = cur.fetchall() or []

    # Expired batches count (to distinguish "no stock" vs "all expired")
    cur.execute("""
        SELECT COUNT(*) AS c
        FROM batches
        WHERE ingredient_id = %s
          AND status = 'Expired'
    """, (ingredient_id,))
    expired_count = int((cur.fetchone() or {}).get("c") or 0)
    cur.close()

    if not base_u:
        return {
            "unit": base_u,
            "total_valid": 0.0,
            "is_expired": False,
            "is_low_stock": True,
            "expiry_status": "UnitMismatch",
            "days_left": None,
            "has_unit_issue": True,
        }

    if not batches:
        if expired_count > 0:
            return {
                "unit": base_u,
                "total_valid": 0.0,
                "is_expired": True,
                "is_low_stock": False,
                "expiry_status": "Expired",
                "days_left": -1,
                "has_unit_issue": False,
            }
        return {
            "unit": base_u,
            "total_valid": 0.0,
            "is_expired": False,
            "is_low_stock": (float(needed_qty_in_base or 0) > 0),
            "expiry_status": "LowStock",
            "days_left": None,
            "has_unit_issue": False,
        }

    total_valid = 0.0
    valid_exp_dates = []
    has_unit_issue = False

    for b in batches:
        qty = float(b.get("quantity") or 0)
        if qty <= 0:
            continue

        b_unit = (b.get("unit") or "").strip()
        qty_in_base = convert_qty(qty, b_unit, base_u)

        # Cannot convert pack/bag/box -> base unit realistically
        if qty_in_base is None:
            has_unit_issue = True
            continue

        exp = b.get("expiry_date")
        if exp is None or exp >= today:
            total_valid += qty_in_base
            if exp:
                valid_exp_dates.append(exp)

    if total_valid <= 0:
        if expired_count > 0:
            return {
                "unit": base_u,
                "total_valid": 0.0,
                "is_expired": True,
                "is_low_stock": False,
                "expiry_status": "Expired",
                "days_left": -1,
                "has_unit_issue": has_unit_issue,
            }
        return {
            "unit": base_u,
            "total_valid": 0.0,
            "is_expired": False,
            "is_low_stock": (float(needed_qty_in_base or 0) > 0),
            "expiry_status": "LowStock",
            "days_left": None,
            "has_unit_issue": has_unit_issue,
        }

    days_left = None
    if valid_exp_dates:
        days_left = (min(valid_exp_dates) - today).days

    expiry_status = "Normal"
    if days_left is not None and days_left <= 3:
        expiry_status = "NearExpiry"

    need = float(needed_qty_in_base or 0)
    is_low_stock = total_valid < need

    return {
        "unit": base_u,
        "total_valid": float(total_valid),
        "is_expired": False,
        "is_low_stock": bool(is_low_stock),
        "expiry_status": expiry_status,
        "days_left": days_left,
        "has_unit_issue": has_unit_issue,
    }


def fetch_recipe_instructions(conn, recipe_id):
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT instructions FROM recipes WHERE recipe_id=%s LIMIT 1", (recipe_id,))
    row = cur.fetchone()
    cur.close()

    if not row or not row.get("instructions"):
        return []

    try:
        ins = json.loads(row["instructions"])
        return ins if isinstance(ins, list) else []
    except Exception:
        return []

def apply_recipe_substitute(conn, suggestion_id, employee_id):
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT details, status FROM suggestions WHERE suggestion_id=%s", (suggestion_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        return False, "Suggestion not found"
    if row["status"] != "Approved":
        cur.close()
        return False, "Only Approved suggestion can be applied"

    d = json.loads(row["details"] or "{}")
    recipe_id = d.get("target_recipe_id")
    new_ings = (d.get("new_recipe") or {}).get("ingredients") or []
    ai_steps = d.get("ai_instructions") or []
    if isinstance(ai_steps, str):
        try:
            ai_steps = json.loads(ai_steps)
        except Exception:
            ai_steps = []
    if not recipe_id or not new_ings:
        cur.close()
        return False, "Invalid suggestion details"

    # replace recipe ingredients
    cur.execute("DELETE FROM recipe_ingredients WHERE recipe_id=%s", (recipe_id,))
    for ing in new_ings:
        cur.execute("""
          INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
          VALUES (%s, %s, %s, %s)
        """, (recipe_id, ing["ingredient_id"], ing["quantity"], ing["unit"]))
        
    if isinstance(ai_steps, list) and len(ai_steps) > 0:
        cur.execute("""
          UPDATE recipes
          SET instructions=%s
          WHERE recipe_id=%s
        """, (json.dumps(ai_steps, ensure_ascii=False), recipe_id))

    # mark applied
    cur.execute("""
    UPDATE suggestions
    SET status='Applied', applied_by=%s, applied_at=NOW()
    WHERE suggestion_id=%s
    """, (employee_id, suggestion_id))


    conn.commit()
    cur.close()
    return True, None

def fetch_candidate_pool(conn, prefer_unit: str = None, limit: int = 60):
    """
    Candidate = nguyên liệu còn usable (có batch Valid/NearExpiry/Opened và chưa hết qty),
    ưu tiên cùng unit để ratio dễ.
    """
    prefer_unit = (prefer_unit or "").strip()

    cur = conn.cursor(dictionary=True)
    # Lấy các ingredient có tổng qty batch > 0 và chưa expired
    cur.execute("""
        SELECT
            i.ingredient_id,
            i.name,
            COALESCE(i.unit,'') AS unit,
            SUM(CASE
                WHEN b.quantity > 0 AND (b.expiry_date IS NULL OR b.expiry_date >= CURDATE())
                     AND b.status IN ('Valid','NearExpiry','Opened')
                THEN b.quantity ELSE 0 END
            ) AS total_valid
        FROM ingredients i
        LEFT JOIN batches b ON b.ingredient_id = i.ingredient_id
        GROUP BY i.ingredient_id, i.name, i.unit
        HAVING total_valid > 0
        ORDER BY (COALESCE(i.unit,'') = %s) DESC, i.name ASC
        LIMIT %s
    """, (prefer_unit, int(limit)))

    rows = cur.fetchall() or []
    cur.close()

    # Trả về ít field để giảm token gửi AI
    return [{
        "ingredient_id": int(r["ingredient_id"]),
        "name": r["name"],
        "unit": (r.get("unit") or "").strip()
    } for r in rows]
def build_substitute_formulas_ai(conn, recipe_id, recipe_name, problems, materials_check, max_formulas=3):
    if not problems:
        return []

    priority = {"Expired": 1, "LowStock": 2, "NearExpiry": 3, "UnitMismatch": 4}
    problems_sorted = sorted(problems, key=lambda p: priority.get(p.get("issue"), 99))

    base_ingredients = fetch_recipe_ingredients(conn, recipe_id)
    base_instructions = fetch_recipe_instructions(conn, recipe_id)

    def find_base_row_by_ing_id(ing_id: int):
        for x in base_ingredients:
            if int(x["ingredient_id"]) == int(ing_id):
                return x
        return None

    # ===== build target_problems for AI =====
    target_problems = []
    for p in problems_sorted:
        if p.get("issue") not in ("Expired", "LowStock"):
            continue
        old_id = int(p.get("ingredient_id"))
        old_row = find_base_row_by_ing_id(old_id)
        if not old_row:
            continue

        old_qty = to_float(old_row.get("quantity"), 0)
        old_unit = (old_row.get("recipe_unit") or "").strip()

        target_problems.append({
            "from_ingredient_id": old_id,
            "from_name": old_row["ingredient_name"],
            "from_qty": old_qty,
            "from_unit": old_unit,
            "issue": p.get("issue")
        })

    if not target_problems:
        return []

    # Prefer unit: lấy unit của nguyên liệu lỗi đầu tiên (để candidate_pool ưu tiên cùng unit)
    prefer_unit = normalize_unit(target_problems[0].get("from_unit"))
    candidate_pool = fetch_candidate_pool(conn, prefer_unit=prefer_unit, limit=120)


    # Loại bỏ “tự thay chính nó”
    bad_ids = set(int(x["from_ingredient_id"]) for x in target_problems)
    candidate_pool = [c for c in candidate_pool if int(c["ingredient_id"]) not in bad_ids]

    print("[AI] target_problems =", len(target_problems), flush=True)
    print("[AI] candidate_pool =", len(candidate_pool), "prefer_unit=", prefer_unit, flush=True)

    ai, err = call_ai_substitution(recipe_name, target_problems, candidate_pool)
    if err or not ai:
        print("[AI] call failed:", err, "recipe=", recipe_name, flush=True)
        return []  # controller sẽ fallback rule-based nếu bạn muốn

    subs = ((ai.get("data") or {}).get("substitutions") or [])
    if not subs:
        return []

    cand_by_id = {int(c["ingredient_id"]): c for c in candidate_pool}

    # ===== build replacements from AI output =====
    replacements = []
    for s in subs:
        try:
            from_id = int(s.get("from_ingredient_id"))
            to_id = int(s.get("to_ingredient_id"))
            ratio = float(s.get("ratio", 1.0))
        except Exception:
            continue

        if from_id not in bad_ids:
            continue
        if to_id not in cand_by_id:
            continue
        if ratio <= 0:
            continue

        old_row = find_base_row_by_ing_id(from_id)
        if not old_row:
            continue

        old_qty = to_float(old_row.get("quantity"), 0)
        old_unit = (old_row.get("recipe_unit") or "").strip()

        new_qty_in_old_unit = old_qty * ratio

        # check inventory candidate (optional, để UI có inventory_check)
        cand_base_unit = get_ingredient_base_unit(conn, to_id)
        need_in_cand_base = convert_qty(new_qty_in_old_unit, old_unit, cand_base_unit)
        stock = calculate_owner_stock_flags(conn, to_id, need_in_cand_base or 0, cand_base_unit) if cand_base_unit else None

        issue = next((p.get("issue") for p in problems_sorted if int(p.get("ingredient_id")) == from_id), "LowStock")

        replacements.append({
            "issue": issue,
            "from": {
                "ingredient_id": int(from_id),
                "name": old_row["ingredient_name"],
                "qty": float(old_qty),
                "unit": old_unit
            },
            "to": {
                "ingredient_id": int(to_id),
                "name": cand_by_id[to_id]["name"],
                "qty": round(float(new_qty_in_old_unit), 2),
                "unit": old_unit  # giữ unit theo recipe cho đồng nhất
            },
            "ratio": float(ratio),
            "reason": (s.get("reason") or "AI-selected substitute"),
            "notes": (s.get("notes") or ""),
            "inventory_check": {
                "enough": (None if stock is None else (not stock["is_low_stock"])),
                "inventory_qty": (None if stock is None else float(stock["total_valid"])),
                "inventory_unit": (None if stock is None else stock["unit"]),
                "expiry_status": (None if stock is None else stock["expiry_status"]),
                "days_left": (None if stock is None else stock["days_left"])
            }
        })

        if len(replacements) >= int(max_formulas or 3):
            break

    if not replacements:
        return []

    rep_by_old_id = {int(r["from"]["ingredient_id"]): r for r in replacements}

    # ===== apply replacements -> new_ings =====
    new_ings = []
    for ing in base_ingredients:
        ing_id = int(ing["ingredient_id"])
        if ing_id in rep_by_old_id:
            r = rep_by_old_id[ing_id]
            new_ings.append({
                "ingredient_id": r["to"]["ingredient_id"],
                "name": r["to"]["name"],
                "quantity": r["to"]["qty"],
                "unit": r["to"]["unit"]
            })
        else:
            new_ings.append({
                "ingredient_id": ing_id,
                "name": ing["ingredient_name"],
                "quantity": float(ing["quantity"]),
                "unit": ing["recipe_unit"]
            })

    # ===== alternative_ingredients =====
    alternative_ingredients = []
    for ing in base_ingredients:
        ing_id = int(ing["ingredient_id"])
        ing_name = ing["ingredient_name"]
        ing_qty = to_float(ing["quantity"], 0)
        ing_unit = (ing["recipe_unit"] or "").strip()

        base_unit = get_ingredient_base_unit(conn, ing_id)
        need_in_base = convert_qty(ing_qty, ing_unit, base_unit)

        if need_in_base is None:
            wh = "UnitMismatch"
        else:
            stock_info = calculate_owner_stock_flags(conn, ing_id, need_in_base, base_unit)
            if stock_info["has_unit_issue"]:
                wh = "UnitMismatch"
            elif stock_info["is_expired"]:
                wh = "Expired"
            elif stock_info["expiry_status"] == "NearExpiry":
                wh = "ExpiringSoon"
            elif stock_info["is_low_stock"]:
                wh = "NotEnough"
            else:
                wh = "InStock"

        if ing_id in rep_by_old_id:
            r = rep_by_old_id[ing_id]
            alternative_ingredients.append({
                "ingredient_id": ing_id,
                "name": ing_name,
                "type": "Replaced",
                "original": {"qty": ing_qty, "unit": ing_unit},
                "new": {"name": r["to"]["name"], "qty": r["to"]["qty"], "unit": r["to"]["unit"]},
                "warehouse_status": wh
            })
        else:
            alternative_ingredients.append({
                "ingredient_id": ing_id,
                "name": ing_name,
                "type": "Original",
                "original": {"qty": ing_qty, "unit": ing_unit},
                "new": {"qty": ing_qty, "unit": ing_unit},
                "warehouse_status": wh
            })

    # ===== instructions: AI rewrite full steps for the new recipe =====
    ai_instructions = []

    rewrite, rewrite_err = call_ai_rewrite_instructions(
        recipe_name=recipe_name,
        base_instructions=base_instructions,
        substitutions=replacements,
        new_ingredients=new_ings
    )

    if rewrite and not rewrite_err:
        ai_instructions = rewrite["steps"]
    else:
        # fallback nếu AI rewrite fail: vẫn dùng cách cũ (nhưng bỏ "Note:" để đỡ rác)
        for r in replacements:
            ai_instructions.append(f"Replace {r['from']['name']} with {r['to']['name']} and continue the recipe.")
        if base_instructions:
            ai_instructions.extend(base_instructions)


    context_hash = build_context_hash(recipe_id, problems_sorted, materials_check)

    return [{
        "context_hash": context_hash,
        "target_recipe_id": recipe_id,
        "target_recipe_name": recipe_name,
        "reasons": problems_sorted[:3],
        "materials_check": materials_check,

        "substitutions": replacements,
        "substitution": (replacements[0] if replacements else None),

        "alternative_ingredients": alternative_ingredients,
        "ai_instructions": ai_instructions,
        "new_recipe": {
            "ingredients": new_ings,
            "notes": "Review texture/flavor impacts before approval."
        }
    }]


