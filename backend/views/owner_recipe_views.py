# backend/views/owner_recipe_views.py
import os
import time
from flask import Blueprint, jsonify, request
from controllers.owner_recipe_controller import OwnerRecipeController
from werkzeug.utils import secure_filename

bp_owner_recipe = Blueprint('bp_owner_recipe', __name__, url_prefix='/api/owner/recipe')

@bp_owner_recipe.route('/list', methods=['GET'])
def owner_list_recipes():
    result, status = OwnerRecipeController.list_recipes(request.args)
    return jsonify(result), status

@bp_owner_recipe.route('/<int:recipe_id>', methods=['GET'])
def owner_get_recipe(recipe_id):
    result, status = OwnerRecipeController.get_recipe(recipe_id)
    return jsonify(result), status

@bp_owner_recipe.route('/create', methods=['POST'])
def owner_create_recipe():
    data = request.get_json(silent=True) or {}
    result, status = OwnerRecipeController.create_recipe(data)
    return jsonify(result), status

@bp_owner_recipe.route('/<int:recipe_id>', methods=['PUT', 'PATCH'])
def owner_update_recipe(recipe_id):
    data = request.get_json(silent=True) or {}
    result, status = OwnerRecipeController.update_recipe(recipe_id, data)
    return jsonify(result), status

@bp_owner_recipe.route('/<int:recipe_id>', methods=['DELETE'])
def owner_delete_recipe(recipe_id):
    result, status = OwnerRecipeController.delete_recipe(recipe_id)
    return jsonify(result), status

# ====== UPLOAD IMAGE ======
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'recipe_images')

def _allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@bp_owner_recipe.route('/upload-image', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400

    if not _allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'Invalid file type'}), 400

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    filename = secure_filename(file.filename)
    name, ext = os.path.splitext(filename)
    filename = f"{name}_{int(time.time())}{ext}"

    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    image_path = f"/static/recipe_images/{filename}"

    return jsonify({'success': True, 'image_path': image_path}), 201
