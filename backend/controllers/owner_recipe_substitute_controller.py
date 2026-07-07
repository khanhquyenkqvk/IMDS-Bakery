# backend/controllers/owner_recipe_substitute_controller.py
from utils.db import get_db_connection
from services.recipe_substitute_service import (
    fetch_all_recipes_basic,
    check_problem_for_recipe,
    build_substitute_formulas,
    build_substitute_formulas_ai,
    upsert_recipe_substitute_suggestions,
    list_recipe_substitute_suggestions,
    approve_recipe_substitute,
    reject_recipe_substitute
)

class OwnerRecipeSubstituteController:
    @staticmethod
    def generate(owner_id: int, max_formulas_per_recipe: int = 3, use_ai: bool = False):
        conn = get_db_connection()
        try:
            print("[GEN] use_ai =", use_ai)
            print("[GEN] owner_id =", owner_id)

            recipes = fetch_all_recipes_basic(conn)
            print("[GEN] total recipes =", len(recipes))

            created = 0
            updated = 0

            for r in recipes:
                problems, ingredients, materials_check = check_problem_for_recipe(conn, r["recipe_id"])

                # ✅ log luôn để biết recipe nào đang scan (kể cả không có problem)
                print("[GEN] recipe:", r["recipe_id"], r["recipe_name"],
                      "problems:", [p.get("issue") for p in (problems or [])])

                if not problems:
                    continue

                if use_ai:
                    formulas = build_substitute_formulas_ai(
                        conn,
                        recipe_id=r["recipe_id"],
                        recipe_name=r["recipe_name"],
                        problems=problems,
                        materials_check=materials_check,
                        max_formulas=max_formulas_per_recipe
                    )

                    print("[GEN][AI]", r["recipe_name"], "AI formulas:", len(formulas or []))

                    if not formulas:
                        formulas = build_substitute_formulas(
                            conn,
                            recipe_id=r["recipe_id"],
                            recipe_name=r["recipe_name"],
                            problems=problems,
                            materials_check=materials_check,
                            max_formulas=max_formulas_per_recipe
                        )
                else:
                    formulas = build_substitute_formulas(
                        conn,
                        recipe_id=r["recipe_id"],
                        recipe_name=r["recipe_name"],
                        problems=problems,
                        materials_check=materials_check,
                        max_formulas=max_formulas_per_recipe
                    )

                c, u = upsert_recipe_substitute_suggestions(conn, owner_id, r, formulas)
                print("[GEN][UPSERT]", r["recipe_name"], "created:", c, "updated:", u)

                created += c
                updated += u

            # ✅ DONE phải nằm ngoài vòng for
            print("[GEN] DONE => created:", created, "updated:", updated)
            return {"success": True, "created": created, "updated": updated, "use_ai": use_ai}, 200

        finally:
            conn.close()


    @staticmethod
    def list(status=None):
        conn = get_db_connection()
        try:
            data = list_recipe_substitute_suggestions(conn, status=status)
            return {"success": True, "data": data}, 200
        finally:
            conn.close()

    @staticmethod
    def approve(suggestion_id: int, owner_id: int):
        conn = get_db_connection()
        try:
            ok, err = approve_recipe_substitute(conn, suggestion_id, owner_id)
            if not ok:
                return {"success": False, "error": err}, 404
            return {"success": True}, 200
        finally:
            conn.close()

    @staticmethod
    def reject(suggestion_id: int, owner_id: int = None):
        conn = get_db_connection()
        try:
            reject_recipe_substitute(conn, suggestion_id, owner_id)
            return {"success": True}, 200
        finally:
            conn.close()
