"""User management API views"""

from flask import Blueprint, request, jsonify
from controllers.user_controller import UserController
from controllers.auth_controller import AuthController
from models.user import User

# Create blueprint
user_bp = Blueprint('user', __name__, url_prefix='/api/user')

# Initialize controller
user_controller = UserController()
auth_controller = AuthController()

@user_bp.route('/profile/<int:user_id>', methods=['GET'])
def get_user_profile(user_id):
    """Get user profile by ID"""
    try:
        result = user_controller.get_user_profile(user_id)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get user profile: {str(e)}',
            'status': 'error'
        }), 500

@user_bp.route('/current', methods=['GET'])
def get_current_user():
    """Get current user from Authorization token"""
    try:
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.split('Bearer ')
        token = token[1] if len(token) == 2 else None
        if not token:
            return jsonify({'success': False, 'message': 'Missing token', 'status': 'error'}), 401
        verify = auth_controller.verify_token(token)
        if not verify.get('success'):
            return jsonify(verify), 401
        user_data = verify['data']['user']
        return jsonify({'success': True, 'data': user_data}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to get current user: {str(e)}', 'status': 'error'}), 500

@user_bp.route('/update-profile', methods=['PUT'])
def update_profile():
    """Update current user's username/email/phone using token"""
    try:
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.split('Bearer ')
        token = token[1] if len(token) == 2 else None
        if not token:
            return jsonify({'success': False, 'message': 'Missing token', 'status': 'error'}), 401
        verify = auth_controller.verify_token(token)
        if not verify.get('success'):
            return jsonify(verify), 401
        user_id = verify['data']['user']['user_id']
        payload = request.get_json() or {}
        username = payload.get('username')
        email = payload.get('email')
        phone = payload.get('phone')
        ok = User.update_profile(user_id=user_id, username=username, email=email, phone=phone)
        if not ok:
            return jsonify({'success': False, 'message': 'No changes or update failed', 'status': 'error'}), 400
        # Return fresh user
        updated = User.find_by_id(user_id)
        return jsonify({'success': True, 'data': {'user': updated.to_dict()}}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to update profile: {str(e)}', 'status': 'error'}), 500

@user_bp.route('/list', methods=['GET'])
def get_all_users():
    """Get all users"""
    try:
        result = user_controller.get_all_users()
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get users: {str(e)}',
            'status': 'error'
        }), 500

@user_bp.route('/roles', methods=['GET'])
def get_all_roles():
    """Get all roles"""
    try:
        result = user_controller.get_all_roles()
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get roles: {str(e)}',
            'status': 'error'
        }), 500
