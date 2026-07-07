"""Authentication controller for login/logout functionality"""

import jwt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from models.user import User
from models.role import Role
from config.config import Config

class AuthController:
    """Authentication controller class"""
    
    def __init__(self):
        self.config = Config()
    
    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Authenticate user login via email"""
        try:
            # Find user by email
            user = User.find_by_email(email)
            if not user:
                return {
                    'success': False,
                    'message': 'Invalid email or password',
                    'status': 'error'
                }
            # Nếu tài khoản bị khóa thì không cho login
            if getattr(user, 'status', None) == 'Locked':
                return {
                    'success': False,
                    'message': 'Your account is locked. Please contact administrator.',
                    'status': 'error'
                }
            # Verify password
            if not user.verify_password(password):
                return {
                    'success': False,
                    'message': 'Invalid email or password',
                    'status': 'error'
                }
                        # Update last_login
            try:
                User.update_last_login(user.user_id)
                # Reload user để lấy last_login mới nhất (optional)
                refreshed = User.find_by_id(user.user_id)
                if refreshed:
                    user = refreshed
            except Exception as e:
                # Không bắt buộc, log lỗi nhưng không chặn login
                print("Failed to update last_login:", e)

            # Get user role
            role = Role.find_by_id(user.role_id)
            role_name = role.role_name if role else 'Unknown'
            
            # Generate JWT token
            token = self._generate_token(user)
            
            return {
                'success': True,
                'message': 'Login successful',
                'status': 'success',
                'data': {
                    'token': token,
                    'user': user.to_dict(),
                    'role': role_name
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'Login failed: {str(e)}',
                'status': 'error'
            }
    
    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify JWT token"""
        try:
            payload = jwt.decode(token, self.config.JWT_SECRET_KEY, algorithms=['HS256'])
            user_id = payload.get('user_id')
            
            if not user_id:
                return {
                    'success': False,
                    'message': 'Invalid token',
                    'status': 'error'
                }
            
            user = User.find_by_id(user_id)
            if not user:
                return {
                    'success': False,
                    'message': 'User not found',
                    'status': 'error'
                }
            
            return {
                'success': True,
                'message': 'Token valid',
                'status': 'success',
                'data': {
                    'user': user.to_dict()
                }
            }
            
        except jwt.ExpiredSignatureError:
            return {
                'success': False,
                'message': 'Token expired',
                'status': 'error'
            }
        except jwt.InvalidTokenError:
            return {
                'success': False,
                'message': 'Invalid token',
                'status': 'error'
            }
        except Exception as e:
            return {
                'success': False,
                'message': f'Token verification failed: {str(e)}',
                'status': 'error'
            }
    
    def _generate_token(self, user: User) -> str:
        """Generate JWT token for user"""
        payload = {
            'user_id': user.user_id,
            'username': user.username,
            'role_id': user.role_id,
            'exp': datetime.utcnow() + timedelta(seconds=self.config.JWT_ACCESS_TOKEN_EXPIRES),
            'iat': datetime.utcnow()
        }
        
        return jwt.encode(payload, self.config.JWT_SECRET_KEY, algorithm='HS256')
