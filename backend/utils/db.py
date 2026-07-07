# backend/utils/db.py
import mysql.connector
from config.config import Config

_cfg = Config()

def get_conn():
    """Get a new connection to the MySQL database"""
    return mysql.connector.connect(
        host=_cfg.DB_HOST,
        port=_cfg.DB_PORT,
        user=_cfg.DB_USER,
        password=_cfg.DB_PASSWORD,
        database=_cfg.DB_NAME,
        autocommit=False
    )
def get_db_connection():
    return get_conn()

def dictfetchall(cursor):
    """Return all rows from a cursor as a dict"""
    columns = [col[0].lower() for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


