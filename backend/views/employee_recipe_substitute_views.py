from flask import Blueprint, request, jsonify
from controllers.employee_recipe_substitute_controller import EmployeeRecipeSubstituteController

bp_employee_recipe_substitute = Blueprint(
    "bp_employee_recipe_substitute",
    __name__,
    url_prefix="/api/employee/recipe-substitutes"
)

def _get_employee_id_from_session():
    try:
        # nếu bạn decode token ở middleware thì đổi sang current_user_id
        return int(request.headers.get("X-User-Id", "1"))
    except Exception:
        return 1

@bp_employee_recipe_substitute.route("/approved", methods=["GET"])
def get_approved_for_recipe():
    recipe_id = request.args.get("recipe_id", type=int)
    result, status = EmployeeRecipeSubstituteController.get_approved(recipe_id=recipe_id)
    return jsonify(result), status

@bp_employee_recipe_substitute.route("/<int:suggestion_id>/apply", methods=["POST"])
def apply_approved(suggestion_id):
    employee_id = _get_employee_id_from_session()
    result, status = EmployeeRecipeSubstituteController.apply(suggestion_id, employee_id)
    return jsonify(result), status
