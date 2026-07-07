import os
from dotenv import load_dotenv

# Load environment variables from config folder (works regardless of cwd)
_ENV_PATH = os.path.join(os.path.dirname(__file__), "database.env")
load_dotenv(_ENV_PATH)

class Config:
    """Configuration class for the application"""
    
    # Database Configuration
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = int(os.getenv('DB_PORT', os.getenv('MYSQL_TCP_PORT', 3306)))
    DB_USER = os.getenv('DB_USER', 'bakery_user')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'Imdsbakery123123@')
    DB_NAME = os.getenv('DB_NAME', 'bakery_inventory')
    
    # JWT Configuration
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'your-secret-key-here')
    JWT_ACCESS_TOKEN_EXPIRES = 3600  # 1 hour
    
    # Flask Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-flask-secret-key')
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    
    # CORS Configuration
    CORS_ORIGINS = [
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        "https://imdsbakery.id.vn",
        "https://www.imdsbakery.id.vn"
    ]

    # AI Configuration (LongCat)
    LONGCAT_API_KEY = os.getenv('LONGCAT_API_KEY', 'ak_10D8dh0Gr0NY8Fg1uG4Ov1Dw2kg3T')
    LONGCAT_MODEL = os.getenv('LONGCAT_MODEL', 'LongCat-Flash-Thinking')
    LONGCAT_BASE_URL = os.getenv('LONGCAT_BASE_URL', 'https://api.longcat.chat/openai/v1/chat/completions')

    # Mail Configuration
    MAIL_SERVER = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.getenv('MAIL_PORT', 587))
    MAIL_USE_TLS = os.getenv('MAIL_USE_TLS', 'True').lower() == 'true'
    MAIL_USE_SSL = os.getenv('MAIL_USE_SSL', 'False').lower() == 'true'
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.getenv('MAIL_DEFAULT_SENDER', MAIL_USERNAME)
    
    @property
    def database_url(self):
        """Get database connection URL"""
        return f"mysql+mysqlconnector://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
