# backend/views/recipe_views.py (Updated)
from flask import Blueprint, jsonify, request
from controllers.recipe_controller import RecipeController

bp_recipe = Blueprint('recipe', __name__, url_prefix='/api/recipe')
def _get_current_user_id():
    raw = request.headers.get("X-User-Id")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None
@bp_recipe.route('/list', methods=['GET'])
def list_recipes():
    """List all recipes"""
    result, status = RecipeController.list_recipes()
    return jsonify(result), status

@bp_recipe.route('/<int:recipe_id>', methods=['GET'])
def get_recipe(recipe_id):
    """Get detailed recipe by ID"""
    result, status = RecipeController.get_recipe(recipe_id)
    return jsonify(result), status

@bp_recipe.route('/create', methods=['POST'])
def create_recipe():
    """Create a new recipe"""
    data = request.json
    menu_id = data.get('menu_id')
    approved_by = data.get('approved_by')
    if not menu_id or not approved_by:
        return jsonify({'success': False, 'error': 'Missing menu_id or approved_by'}), 400
    result, status = RecipeController.create_recipe(menu_id, approved_by)
    return jsonify(result), status

@bp_recipe.route('/add-ingredient', methods=['POST'])
def add_ingredient():
    """Add ingredient to recipe"""
    data = request.json
    recipe_id = data.get('recipe_id')
    ingredient_id = data.get('ingredient_id')
    quantity = data.get('quantity')
    unit = data.get('unit')
    if not all([recipe_id, ingredient_id, quantity, unit]):
        return jsonify({'success': False, 'error': 'Missing required fields'}), 400
    result, status = RecipeController.add_ingredient(recipe_id, ingredient_id, quantity, unit)
    return jsonify(result), status

@bp_recipe.route('/report', methods=['POST'])
def submit_report():
    """Submit a report for an ingredient"""
    data = request.json
    ingredient_id = data.get('ingredient_id')
    report_type = data.get('report_type')
    user_id = data.get('user_id')  # From auth context
    if not ingredient_id or not report_type or not user_id:
        return jsonify({'success': False, 'error': 'Missing required fields'}), 400
    result, status = RecipeController.submit_report(ingredient_id, report_type, user_id)
    return jsonify(result), status

@bp_recipe.route('/use', methods=['POST'])
def use_ingredients():
    """Use ingredients for production (update stock)"""
    data = request.json
    usage = data.get('usage', [])
    user_id = data.get('user_id') or _get_current_user_id()
    recipe_id = data.get('recipe_id')
    used_all = data.get('used_all_ingredients', False)
    if not usage or not user_id:
        return jsonify({'success': False, 'error': 'Missing usage data or user_id'}), 400
    result, status = RecipeController.use_ingredients(usage, user_id, recipe_id=recipe_id, used_all_ingredients=used_all)
    return jsonify(result), status