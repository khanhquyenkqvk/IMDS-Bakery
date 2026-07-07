"""User controller for user management functionality"""

from typing import Dict, Any, List
from models.user import User
from models.role import Role

class UserController:
    """User controller class"""
    
    def get_user_profile(self, user_id: int) -> Dict[str, Any]:
        """Get user profile by ID"""
        try:
            user = User.find_by_id(user_id)
            if not user:
                return {
                    'success': False,
                    'message': 'User not found',
                    'status': 'error'
                }
            
            role = Role.find_by_id(user.role_id)
            role_name = role.role_name if role else 'Unknown'
            
            return {
                'success': True,
                'message': 'User profile retrieved',
                'status': 'success',
                'data': {
                    'user': user.to_dict(),
                    'role': role_name
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'Failed to get user profile: {str(e)}',
                'status': 'error'
            }
    
    def get_all_users(self) -> Dict[str, Any]:
        """Get all users"""
        try:
            # This would need to be implemented in the User model
            # For now, return a placeholder
            return {
                'success': True,
                'message': 'users retrieved',
                'status': 'success',
                'data': {
                    'users': []
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'Failed to get users: {str(e)}',
                'status': 'error'
            }
    
    def get_all_roles(self) -> Dict[str, Any]:
        """Get all roles"""
        try:
            roles = Role.get_all()
            roles_data = [role.to_dict() for role in roles]
            
            return {
                'success': True,
                'message': 'roles retrieved',
                'status': 'success',
                'data': {
                    'roles': roles_data
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'Failed to get roles: {str(e)}',
                'status': 'error'
            }
