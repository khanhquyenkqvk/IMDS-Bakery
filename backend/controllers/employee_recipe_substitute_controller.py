from utils.db import get_db_connection
from services.employee_recipe_substitute_service import (
    get_approved_recipe_substitute_for_recipe,
    apply_recipe_substitute_for_employee
)

class EmployeeRecipeSubstituteController:
    @staticmethod
    def get_approved(recipe_id=None):
        conn = get_db_connection()
        try:
            data = get_approved_recipe_substitute_for_recipe(conn, recipe_id=recipe_id)
            return {"success": True, "data": data}, 200
        finally:
            conn.close()

    @staticmethod
    def apply(suggestion_id: int, employee_id: int):
        conn = get_db_connection()
        try:
            ok, err = apply_recipe_substitute_for_employee(conn, suggestion_id, employee_id)
            if not ok:
                return {"success": False, "error": err}, 400
            return {"success": True}, 200
        finally:
            conn.close()
