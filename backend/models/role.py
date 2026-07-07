"""Role model for user roles and permissions"""

import mysql.connector
from typing import Optional, List, Dict, Any
from config.config import Config

class Role:
    """Role model class"""
    
    def __init__(self, role_id: int = None, role_name: str = None, 
                 description: str = None):
        self.role_id = role_id
        self.role_name = role_name
        self.description = description
    
    @staticmethod
    def get_connection():
        """Get database connection"""
        config = Config()
        try:
            connection = mysql.connector.connect(
                host=config.DB_HOST,
                port=config.DB_PORT,
                user=config.DB_USER,
                password=config.DB_PASSWORD,
                database=config.DB_NAME
            )
            return connection
        except mysql.connector.Error as e:
            print(f"Database connection error: {e}")
            return None
    
    @classmethod
    def find_by_id(cls, role_id: int) -> Optional['Role']:
        """Find role by ID"""
        connection = cls.get_connection()
        if not connection:
            return None
        
        try:
            cursor = connection.cursor(dictionary=True)
            query = "SELECT * FROM roles WHERE role_id = %s"
            cursor.execute(query, (role_id,))
            result = cursor.fetchone()
            
            if result:
                return cls(
                    role_id=result['role_id'],
                    role_name=result['role_name'],
                    description=result.get('description')
                )
            return None
        except mysql.connector.Error as e:
            print(f"Database query error: {e}")
            return None
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
    
    @classmethod
    def get_all(cls) -> List['Role']:
        """Get all roles"""
        connection = cls.get_connection()
        if not connection:
            return []
        
        try:
            cursor = connection.cursor(dictionary=True)
            query = "SELECT * FROM roles ORDER BY role_name"
            cursor.execute(query)
            results = cursor.fetchall()
            
            roles = []
            for result in results:
                roles.append(cls(
                    role_id=result['role_id'],
                    role_name=result['role_name'],
                    description=result.get('description')
                ))
            return roles
        except mysql.connector.Error as e:
            print(f"Database query error: {e}")
            return []
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert role to dictionary"""
        return {
            'role_id': self.role_id,
            'role_name': self.role_name,
            'description': self.description
        }
