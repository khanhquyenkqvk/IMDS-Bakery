"""Views package for API endpoints"""

from .auth_views import auth_bp
from .user_views import user_bp
from .health_views import health_bp
from .recipe_views import bp_recipe
from .ai_views import bp_ai
from .owner_inventory_views import bp_owner_inventory
from .owner_recipe_substitute_views import bp_owner_recipe_substitute
from .employee_recipe_substitute_views import bp_employee_recipe_substitute


__all__ = ['auth_bp', 'user_bp', 'health_bp', 'bp_ai']
