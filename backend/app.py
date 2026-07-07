"""Main Flask application for the Bakery inventory System"""

# --- ensure project root on sys.path ---
import os, sys
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))          #
ROOT_DIR = os.path.dirname(BACKEND_DIR)                           
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
# --------------------------------------

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from backend.config.config import Config
from backend.views import auth_bp, user_bp, health_bp, bp_ai
from backend.views.ingredients_views import bp_ingredients
from backend.views.recipe_views import bp_recipe
from views.alerts_views import bp_alerts
from controllers.update_controller import update_bp
from controllers.history_controller import history_bp
from controllers.today_menu_controller import today_menu_bp
from controllers.waste_reports_controller import waste_bp
from backend.views.batch_views import bp_batches
from backend.views.warehouse_views import bp_warehouse
from backend.views.owner_recipe_views import bp_owner_recipe
from views.owner_production_plan_views import bp_owner_production_plan
from backend.views.owner_dashboard_views import bp_owner_dashboard
from backend.views.owner_notifications_views import bp_owner_notifications
from backend.views.owner_inventory_views import bp_owner_inventory
from backend.views.admin_user_views import bp_admin_users
from backend.views.admin_report_views import bp_admin_report
from backend.views.owner_report_views import bp_owner_reports
from backend.utils.mail import init_mail
from backend.utils.scheduler import start_scheduler
from views.smart_suggestions_views import smart_suggestions_bp
from views.barcode_views import bp_barcode
from views.owner_recipe_substitute_views import bp_owner_recipe_substitute
from views.employee_recipe_substitute_views import bp_employee_recipe_substitute




def create_app():
    """Create and configure Flask application"""
    app = Flask(__name__)
    frontend_dir = os.path.join(ROOT_DIR, "frontend")

    # Load configuration
    config = Config()
    app.config['SECRET_KEY'] = config.SECRET_KEY
    app.config['DEBUG'] = config.DEBUG
    app.config['SQLALCHEMY_DATABASE_URI'] = config.database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    # Mail config
    app.config['MAIL_SERVER'] = config.MAIL_SERVER
    app.config['MAIL_PORT'] = config.MAIL_PORT
    app.config['MAIL_USE_TLS'] = config.MAIL_USE_TLS
    app.config['MAIL_USE_SSL'] = config.MAIL_USE_SSL
    app.config['MAIL_USERNAME'] = config.MAIL_USERNAME
    app.config['MAIL_PASSWORD'] = config.MAIL_PASSWORD
    app.config['MAIL_DEFAULT_SENDER'] = config.MAIL_DEFAULT_SENDER
    init_mail(app)
    # Configure CORS
    CORS(
        app,
        resources={r"/api/*": {"origins": config.CORS_ORIGINS}},
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization", "X-User-Id"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )
    # Start APScheduler (guarded to avoid double-start in debug reload)
    if not app.config.get("SCHEDULER_STARTED"):
        start_scheduler(app)
        app.config["SCHEDULER_STARTED"] = True

    # Register blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(bp_ingredients)
    app.register_blueprint(bp_recipe)
    app.register_blueprint(bp_alerts)
    app.register_blueprint(bp_ai)
    app.register_blueprint(update_bp)
    app.register_blueprint(history_bp)
    app.register_blueprint(today_menu_bp)
    app.register_blueprint(waste_bp)
    app.register_blueprint(bp_batches)
    app.register_blueprint(bp_warehouse)
    app.register_blueprint(bp_owner_recipe) 
    app.register_blueprint(bp_owner_production_plan)
    app.register_blueprint(bp_owner_dashboard)
    app.register_blueprint(bp_owner_notifications)
    app.register_blueprint(bp_owner_inventory)
    app.register_blueprint(bp_admin_users)
    app.register_blueprint(bp_admin_report)
    app.register_blueprint(bp_owner_reports)
    app.register_blueprint(smart_suggestions_bp)
    app.register_blueprint(bp_barcode)
    app.register_blueprint(bp_owner_recipe_substitute)
    app.register_blueprint(bp_employee_recipe_substitute)




    # Root -> login page
    @app.route('/')
    def root():
        return send_from_directory(frontend_dir, 'login/index.html')

    # Serve frontend static files
    @app.route('/<path:path>')
    def serve_frontend(path):
        file_path = os.path.join(frontend_dir, path)
        if os.path.isfile(file_path):
            return send_from_directory(frontend_dir, path)
        return jsonify({'message': 'Endpoint not found', 'status': 'error'}), 404
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'message': 'Endpoint not found', 'status': 'error'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'message': 'Internal server error', 'status': 'error'}), 500
    
    return app

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

