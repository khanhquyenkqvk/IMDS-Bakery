"""User model for authentication and user management"""

import mysql.connector
from typing import Optional, Dict, Any
from config.config import Config
from werkzeug.security import check_password_hash

class User:
    """User model class"""
    
    def __init__(self, user_id: int = None, username: str = None, 
                 password: str = None, role_id: int = None, 
                 full_name: str = None, email: str = None, phone: str = None, last_login=None,
        status: str = None):
        self.user_id = user_id
        self.username = username
        self.password = password  # This will be mapped from password_hash
        self.role_id = role_id
        self.full_name = full_name
        self.email = email
        self.phone = phone
        self.last_login = last_login
        self.status = status
    
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
    def find_by_username(cls, username: str) -> Optional['User']:
        """Find user by username (legacy)"""
        connection = cls.get_connection()
        if not connection:
            return None
        
        try:
            cursor = connection.cursor(dictionary=True)
            query = "SELECT * FROM users WHERE username = %s"
            cursor.execute(query, (username,))
            result = cursor.fetchone()
            
            if result:
                return cls(
                    user_id=result['user_id'],
                    username=result['username'],
                    password=result['password_hash'],  # Map from password_hash
                    role_id=result['role_id'],
                    full_name=result.get('full_name'),
                    email=result.get('email'),
                    phone=result.get('phone'),
                    last_login=result.get('last_login'),
                    status=result.get('status')
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
    def find_by_email(cls, email: str) -> Optional['User']:
        """Find user by email"""
        connection = cls.get_connection()
        if not connection:
            return None
        try:
            cursor = connection.cursor(dictionary=True)
            query = "SELECT * FROM users WHERE email = %s"
            cursor.execute(query, (email,))
            result = cursor.fetchone()
            if result:
                return cls(
                    user_id=result['user_id'],
                    username=result['username'],
                    password=result['password_hash'],
                    role_id=result['role_id'],
                    full_name=result.get('full_name'),
                    email=result.get('email'),
                    phone=result.get('phone'),
                    last_login=result.get('last_login'),
                    status=result.get('status')
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
    def find_by_id(cls, user_id: int) -> Optional['User']:
        """Find user by ID"""
        connection = cls.get_connection()
        if not connection:
            return None
        
        try:
            cursor = connection.cursor(dictionary=True)
            query = "SELECT * FROM users WHERE user_id = %s"
            cursor.execute(query, (user_id,))
            result = cursor.fetchone()
            
            if result:
                return cls(
                    user_id=result['user_id'],
                    username=result['username'],
                    password=result['password_hash'],  # Map from password_hash
                    role_id=result['role_id'],
                    full_name=result.get('full_name'),
                    email=result.get('email'),
                    phone=result.get('phone'),
                    last_login=result.get('last_login'),
                    status=result.get('status')
                )
            return None
        except mysql.connector.Error as e:
            print(f"Database query error: {e}")
            return None
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
    
    def verify_password(self, password: str) -> bool:
        """Verify user password (support both hashed & legacy plain)."""
        if not self.password:
            return False
        # Thử coi self.password là password_hash
        try:
            if check_password_hash(self.password, password):
                return True
        except Exception:
            # Nếu self.password không phải format hash hợp lệ thì bỏ qua
            pass
        # Fallback: so sánh plain text (trường hợp account cũ lưu mật khẩu thường)
        return self.password == password

    
    def to_dict(self) -> Dict[str, Any]:
        """Convert user to dictionary"""
        return {
            'user_id': self.user_id,
            'username': self.username,
            'role_id': self.role_id,
            'full_name': self.full_name,
            'email': self.email,
            'phone': self.phone,
            'last_login': self.last_login,
            'status': self.status
        }

    @classmethod
    def update_profile(cls, user_id: int, username: str = None, email: str = None, phone: str = None) -> bool:
        """Update user profile fields by user_id"""
        connection = cls.get_connection()
        if not connection:
            return False
        try:
            cursor = connection.cursor()
            fields = []
            values = []
            if username is not None:
                fields.append("username = %s")
                values.append(username)
            if email is not None:
                fields.append("email = %s")
                values.append(email)
            if phone is not None:
                fields.append("phone = %s")
                values.append(phone)
            if not fields:
                return True
            values.append(user_id)
            query = f"UPDATE users SET {', '.join(fields)} WHERE user_id = %s"
            cursor.execute(query, tuple(values))
            connection.commit()
            return cursor.rowcount > 0
        except mysql.connector.Error as e:
            print(f"Database update error: {e}")
            return False
        finally:
            try:
                if connection.is_connected():
                    cursor.close()
                    connection.close()
            except Exception:
                pass
    @classmethod
    def update_last_login(cls, user_id: int) -> bool:
        """Update last_login to NOW() for given user."""
        connection = cls.get_connection()
        if not connection:
            return False
        try:
            cursor = connection.cursor()
            query = "UPDATE users SET last_login = NOW() WHERE user_id = %s"
            cursor.execute(query, (user_id,))
            connection.commit()
            return cursor.rowcount > 0
        except mysql.connector.Error as e:
            print(f"Database update error (last_login): {e}")
            return False
        finally:
            try:
                if connection.is_connected():
                    cursor.close()
                    connection.close()
            except Exception:
                pass
