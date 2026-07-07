"""Health check and development API views"""

from flask import Blueprint, jsonify
import mysql.connector
from config.config import Config

# Create blueprint
health_bp = Blueprint('health', __name__, url_prefix='/api')

@health_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Bakery inventory System API is running',
        'version': '1.0.0'
    }), 200

@health_bp.route('/dev/test-db', methods=['GET'])
def test_database():
    """Test database connection"""
    try:
        config = Config()
        connection = mysql.connector.connect(
            host=config.DB_HOST,
            port=config.DB_PORT,
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            database=config.DB_NAME
        )
        
        if connection.is_connected():
            cursor = connection.cursor()
            cursor.execute("SELECT COUNT(*) FROM users")
            user_count = cursor.fetchone()[0]
            
            cursor.close()
            connection.close()
            
            return jsonify({
                'database': 'connected',
                'message': 'Database connection successful',
                'user_count': user_count,
                'status': 'success'
            }), 200
        else:
            return jsonify({
                'database': 'connection_failed',
                'error': 'Database connection failed',
                'status': 'error'
            }), 500
            
    except mysql.connector.Error as e:
        return jsonify({
            'database': 'connection_failed',
            'error': f'Database connection failed: {str(e)}',
            'status': 'error'
        }), 500
    except Exception as e:
        return jsonify({
            'database': 'connection_failed',
            'error': f'Unexpected error: {str(e)}',
            'status': 'error'
        }), 500
