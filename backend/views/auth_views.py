"""Authentication API views"""

from flask import Blueprint, request, jsonify
from controllers.auth_controller import AuthController

# Create blueprint
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Initialize controller
auth_controller = AuthController()

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login endpoint"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided',
                'status': 'error'
            }), 400
        
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({
                'success': False,
                'message': 'Email and password are required',
                'status': 'error'
            }), 400
        
        result = auth_controller.login(email, password)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 401
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Login failed: {str(e)}',
            'status': 'error'
        }), 500

@auth_bp.route('/verify', methods=['POST'])
def verify_token():
    """Verify token endpoint"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided',
                'status': 'error'
            }), 400
        
        token = data.get('token')
        
        if not token:
            return jsonify({
                'success': False,
                'message': 'Token is required',
                'status': 'error'
            }), 400
        
        result = auth_controller.verify_token(token)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 401
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Token verification failed: {str(e)}',
            'status': 'error'
        }), 500
