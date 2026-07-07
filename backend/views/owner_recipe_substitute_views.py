# backend/views/owner_recipe_substitute_views.py
from flask import Blueprint, request, jsonify
from controllers.owner_recipe_substitute_controller import OwnerRecipeSubstituteController

bp_owner_recipe_substitute = Blueprint(
    "bp_owner_recipe_substitute",
    __name__,
    url_prefix="/api/owner/recipe-substitutes"
)

def _get_owner_id_from_session():
    try:
        return int(request.headers.get("X-User-Id"))
    except Exception:
        return None


@bp_owner_recipe_substitute.route("/generate", methods=["POST"])
def generate_suggestions():
    owner_id = _get_owner_id_from_session()
    if not owner_id:
        return jsonify({"success": False, "error": "Missing X-User-Id"}), 401
    payload = request.json or {}

    print("[VIEW] HIT /generate", "owner_id=", owner_id, "payload=", payload, flush=True)

    max_per_recipe = int(payload.get("max_per_recipe", 3))
    use_ai = bool(payload.get("use_ai", False))

    result, status = OwnerRecipeSubstituteController.generate(owner_id, max_per_recipe, use_ai=use_ai)
    return jsonify(result), status



@bp_owner_recipe_substitute.route("/list", methods=["GET"])
def list_suggestions():
    status_q = request.args.get("status")  # Pending/Approved/Rejected
    result, status = OwnerRecipeSubstituteController.list(status=status_q)
    return jsonify(result), status

@bp_owner_recipe_substitute.route("/<int:suggestion_id>/approve", methods=["POST"])
def approve_suggestion(suggestion_id):
    owner_id = _get_owner_id_from_session()
    result, status = OwnerRecipeSubstituteController.approve(suggestion_id, owner_id)
    return jsonify(result), status

@bp_owner_recipe_substitute.route("/<int:suggestion_id>/reject", methods=["POST"])
def reject_suggestion(suggestion_id):
    owner_id = _get_owner_id_from_session()
    result, status = OwnerRecipeSubstituteController.reject(suggestion_id, owner_id)
    return jsonify(result), status
