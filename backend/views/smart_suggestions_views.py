# backend/views/smart_suggestions_views.py
from flask import Blueprint, request, jsonify
from controllers.smart_suggestion_controller import SmartSuggestionController

smart_suggestions_bp = Blueprint("smart_suggestions", __name__)

def get_current_user_id():
    raw_uid = request.headers.get("X-User-Id")
    try:
        return int(raw_uid) if raw_uid is not None else None
    except (TypeError, ValueError):
        return None

@smart_suggestions_bp.route("/api/admin/smart-suggestions/warehouse", methods=["GET"])
def api_admin_warehouse_suggestions():
    result = SmartSuggestionController.list_warehouse_suggestions(request.args)
    status = 200
    if isinstance(result, tuple):
        result, status = result
    return jsonify(result), status

@smart_suggestions_bp.route("/api/admin/smart-suggestions/history", methods=["GET"])
def api_admin_ai_history():
    result = SmartSuggestionController.list_ai_history(request.args)
    status = 200
    if isinstance(result, tuple):
        result, status = result
    return jsonify(result), status

@smart_suggestions_bp.route("/api/admin/smart-suggestions/send", methods=["POST"])
def api_admin_send_suggestion_to_owner():
    actor_id = get_current_user_id()
    if not actor_id:
        return jsonify({"success": False, "error": "Missing X-User-Id header"}), 401

    payload = request.get_json(silent=True) or {}
    result = SmartSuggestionController.create_purchase_suggestion(payload, actor_id)
    status = 200
    if isinstance(result, tuple):
        result, status = result
    return jsonify(result), status

@smart_suggestions_bp.route("/api/owner/ai/recommendations", methods=["GET"])
def api_owner_ai_recommendations():
    owner_id = get_current_user_id()
    result = SmartSuggestionController.list_owner_purchase_recommendations(owner_id)
    status = 200
    if isinstance(result, tuple):
        result, status = result
    return jsonify(result), status

@smart_suggestions_bp.route("/api/owner/ai/recommendations/<int:suggestion_id>/status", methods=["POST"])
def api_owner_update_suggestion_status(suggestion_id):
    owner_id = get_current_user_id()
    if not owner_id:
        return jsonify({"success": False, "error": "Missing X-User-Id header"}), 401

    payload = request.get_json(silent=True) or {}
    new_status = (payload.get("status") or "").strip()
    result = SmartSuggestionController.update_suggestion_status(suggestion_id, new_status, owner_id)
    status = 200
    if isinstance(result, tuple):
        result, status = result
    return jsonify(result), status
@smart_suggestions_bp.route(
    "/api/owner/ai/recommendations/<int:suggestion_id>",
    methods=["DELETE"]
)
def api_owner_archive_suggestion(suggestion_id):
    """
    Owner 'Remove from dashboard' – chỉ ẩn suggestion, không xóa data.
    """
    owner_id = get_current_user_id()
    if not owner_id:
        return jsonify({"success": False, "error": "Missing X-User-Id header"}), 401

    result = SmartSuggestionController.archive_suggestion_for_owner(
        suggestion_id, owner_id
    )
    status = 200
    if isinstance(result, tuple):
        result, status = result
    return jsonify(result), status
