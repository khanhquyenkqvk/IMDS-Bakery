# backend/views/owner_production_plan_views.py
from flask import Blueprint, jsonify, request
from controllers.owner_production_plan_controller import OwnerProductionPlanController

bp_owner_production_plan = Blueprint(
    "bp_owner_production_plan", __name__, url_prefix="/api/owner/production-reports"
)


@bp_owner_production_plan.route("", methods=["GET"])
def owner_list_production_reports():
    result, status = OwnerProductionPlanController.list_by_date(request.args)
    return jsonify(result), status


@bp_owner_production_plan.route("/bulk-save", methods=["POST"])
def owner_bulk_save_production_reports():
    data = request.get_json(silent=True) or {}
    result, status = OwnerProductionPlanController.bulk_save(data)
    return jsonify(result), status
