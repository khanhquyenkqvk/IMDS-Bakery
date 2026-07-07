# backend/views/admin_user_views.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from werkzeug.security import generate_password_hash

from backend.utils.db import get_conn, dictfetchall
from controllers.auth_controller import AuthController
from models.user import User

bp_admin_users = Blueprint('bp_admin_users', __name__)
auth_controller = AuthController()


# ============= Helpers =============

def _get_role_id(cur, role_name: str):
    """Lấy role_id theo role_name (Admin / Owner / Employee)."""
    sql = "SELECT role_id FROM roles WHERE role_name = %s"
    cur.execute(sql, (role_name,))
    row = cur.fetchone()
    return row[0] if row else None


def _get_current_user_from_token():
    """Lấy user đang đăng nhập từ JWT trong header Authorization."""
    auth_header = request.headers.get('Authorization', '')
    parts = auth_header.split('Bearer ')
    token = parts[1] if len(parts) == 2 else None
    if not token:
        return None

    result = auth_controller.verify_token(token)
    if not result.get('success'):
        return None

    # result['data']['user'] là user.to_dict()
    return result['data']['user']
def get_client_ip():
    xff = request.headers.get('X-Forwarded-For', '')
    if xff:
        return xff.split(',')[0].strip()
    real_ip = request.headers.get('X-Real-IP')
    if real_ip:
        return real_ip.strip()
    return request.remote_addr



def _log_user_activity(cur,
                       actor_user: dict | None,
                       target_user_id: int | None,
                       target_username: str | None,
                       action: str,
                       detail: str,
                       ip_address: str | None):
    """Ghi log vào bảng UserActivityLogs."""
    actor_id = None
    actor_name = "System"

    if actor_user:
        actor_id = actor_user.get('user_id')
        actor_name = actor_user.get('full_name') or actor_user.get('username') or "System"

    sql = """
        INSERT INTO UserActivityLogs
            (actor_user_id, actor_name, target_user_id, target_username, action, detail, ip_address)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    cur.execute(sql, (
        actor_id,
        actor_name,
        target_user_id,
        target_username,
        action,
        detail,
        ip_address
    ))


# ============= 1. Summary cards =============

@bp_admin_users.route('/api/admin/users/summary', methods=['GET'])
def admin_user_summary():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM users")
        total_users = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM users WHERE status = 'Active'")
        active_users = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM users WHERE status = 'Locked'")
        locked_users = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM roles")
        roles_defined = cur.fetchone()[0]

        return jsonify({
            "success": True,
            "data": {
                "total_users": total_users,
                "active_users": active_users,
                "locked_users": locked_users,
                "roles_defined": roles_defined
            }
        })
    except Exception as e:
        print("Error in admin_user_summary:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()


# ============= 2. Danh sách User Directory =============

@bp_admin_users.route('/api/admin/users', methods=['GET'])
def admin_list_users():
    """
    Trả về toàn bộ user cho User Directory.
    Lọc/search xử lý trên frontend.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        sql = """
            SELECT
                u.user_id,
                u.username,
                COALESCE(u.full_name, '') AS full_name,
                u.email,
                u.phone,
                u.status,
                u.last_login,
                u.created_at,
                r.role_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.role_id
            ORDER BY u.user_id ASC
        """
        cur.execute(sql)
        rows = dictfetchall(cur)
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        print("Error in admin_list_users:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()


# ============= 3. Thêm user mới =============

@bp_admin_users.route('/api/admin/users', methods=['POST'])
def admin_create_user():
    """
    Body JSON:
    {
      "username": "...",
      "full_name": "...",
      "email": "...",
      "phone": "...",
      "password": "...",
      "role_name": "Admin|Owner|Employee",
      "status": "Active|Locked"
    }
    """
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip()
    phone = (data.get("phone") or "").strip()
    password = (data.get("password") or "").strip()
    role_name = (data.get("role_name") or "").strip() or "Employee"
    status = data.get("status") or "Active"

    if not username or not full_name or not password:
        return jsonify({
            "success": False,
            "message": "Username, full name và password là bắt buộc."
        }), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        # Check username tồn tại chưa
        cur.execute("SELECT user_id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            return jsonify({"success": False, "message": "Username đã tồn tại."}), 400

        # Lấy role_id
        role_id = _get_role_id(cur, role_name)
        if not role_id:
            return jsonify({"success": False, "message": "Role không hợp lệ."}), 400

        password_hash = generate_password_hash(password)

        sql = """
            INSERT INTO users (username, full_name, password_hash, email, phone, role_id, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        now = datetime.now()
        cur.execute(sql, (username, full_name, password_hash, email, phone, role_id, status, now))
        new_id = cur.lastrowid

        # Ghi log
        actor_user = _get_current_user_from_token()
        detail = f"Create new account for {full_name} ({username})"
        ip_addr = get_client_ip()
        _log_user_activity(
            cur,
            actor_user=actor_user,
            target_user_id=new_id,
            target_username=username,
            action="Create",
            detail=detail,
            ip_address=ip_addr
        )

        conn.commit()

        return jsonify({"success": True, "user_id": new_id})
    except Exception as e:
        conn.rollback()
        print("Error in admin_create_user:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()


# ============= 4. Cập nhật user (edit) =============

@bp_admin_users.route('/api/admin/users/<int:user_id>', methods=['PUT', 'PATCH'])
def admin_update_user(user_id):
    data = request.get_json() or {}
    fields = []
    params = []

    for col in ("username", "full_name", "email", "phone", "status"):
        if col in data and data[col] is not None:
            fields.append(f"{col} = %s")
            params.append(data[col])

    # Role
    role_name = data.get("role_name")
    if role_name:
        conn = get_conn()
        cur = conn.cursor()
        try:
            role_id = _get_role_id(cur, role_name)
            if not role_id:
                return jsonify({"success": False, "message": "Role không hợp lệ."}), 400
            fields.append("role_id = %s")
            params.append(role_id)
        finally:
            cur.close()
            conn.close()

    # Password (nếu đổi)
    if "password" in data and data["password"]:
        pwd_hash = generate_password_hash(data["password"])
        fields.append("password_hash = %s")
        params.append(pwd_hash)

    if not fields:
        return jsonify({"success": False, "message": "Không có dữ liệu để cập nhật."}), 400

    sql = f"UPDATE users SET {', '.join(fields)} WHERE user_id = %s"
    params.append(user_id)

    conn = get_conn()
    cur = conn.cursor()
    try:
        # Lấy info user cũ để log
        cur.execute("SELECT username, full_name FROM users WHERE user_id = %s", (user_id,))
        old = cur.fetchone()
        if not old:
            return jsonify({"success": False, "message": "User không tồn tại."}), 404
        old_username, old_full_name = old

        cur.execute(sql, tuple(params))
        if cur.rowcount == 0:
            return jsonify({"success": False, "message": "User không tồn tại."}), 404

        # Ghi log
        actor_user = _get_current_user_from_token()
        detail = f"Update account {old_full_name} ({old_username})"      
        ip_addr = get_client_ip()
        _log_user_activity(
            cur,
            actor_user=actor_user,
            target_user_id=user_id,
            target_username=old_username,
            action="Update",
            detail=detail,
            ip_address=ip_addr
        )

        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        print("Error in admin_update_user:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()


# ============= 5. Toggle lock/unlock =============

@bp_admin_users.route('/api/admin/users/<int:user_id>/status', methods=['PATCH'])
def admin_toggle_user_status(user_id):
    data = request.get_json() or {}
    new_status = data.get("status")
    if new_status not in ("Active", "Locked"):
        return jsonify({"success": False, "message": "Status không hợp lệ."}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT username, full_name, status FROM users WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "message": "User không tồn tại."}), 404
        username, full_name, old_status = row

        cur.execute("UPDATE users SET status = %s WHERE user_id = %s", (new_status, user_id))
        if cur.rowcount == 0:
            return jsonify({"success": False, "message": "User không tồn tại."}), 404

        # Ghi log
        actor_user = _get_current_user_from_token()
        action = "Lock" if new_status == "Locked" else "Unlock"
        detail = f"{action} account {full_name} ({username})"      
        ip_addr = get_client_ip()
        _log_user_activity(
            cur,
            actor_user=actor_user,
            target_user_id=user_id,
            target_username=username,
            action=action,
            detail=detail,
            ip_address=ip_addr
        )

        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        print("Error in admin_toggle_user_status:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()


# ============= 6. Xóa user =============
@bp_admin_users.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
def admin_delete_user(user_id):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if user_id == 1:
            return jsonify({"success": False, "message": "Không thể xóa tài khoản admin gốc."}), 400

        # Lấy thông tin user để log
        cur.execute("SELECT username, full_name FROM users WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "message": "User không tồn tại."}), 404
        username, full_name = row

        # Ghi log: ai xóa user này
        actor_user = _get_current_user_from_token()
        detail = f"Delete account {full_name} ({username})"
        ip_addr = get_client_ip()
        _log_user_activity(
            cur,
            actor_user=actor_user,
            target_user_id=user_id,
            target_username=username,
            action="Delete",
            detail=detail,
            ip_address=ip_addr
        )

        # ⚠️ Quan trọng: gỡ FK trước khi xóa user
        # Set NULL tất cả log đang tham chiếu user_id
        cur.execute("UPDATE UserActivityLogs SET target_user_id = NULL WHERE target_user_id = %s", (user_id,))
        cur.execute("UPDATE UserActivityLogs SET actor_user_id = NULL WHERE actor_user_id = %s", (user_id,))

        # Bây giờ mới xóa user
        cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
        if cur.rowcount == 0:
            return jsonify({"success": False, "message": "User không tồn tại."}), 404

        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        print("Error in admin_delete_user:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()



# ============= 7. API History of Activities =============

@bp_admin_users.route('/api/admin/users/history', methods=['GET'])
def admin_user_history():
    """
    Trả về lịch sử hoạt động quản lý user (chỉ account):
      - Time: created_at
      - User: actor_name
      - Actions: action
      - Detail: detail
      - IP Address: ip_address
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        sql = """
            SELECT
                log_id,
                actor_name,
                target_username,
                action,
                detail,
                ip_address,
                created_at
            FROM UserActivityLogs
            ORDER BY created_at DESC
            LIMIT 500
        """
        cur.execute(sql)
        rows = dictfetchall(cur)
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        print("Error in admin_user_history:", e)
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cur.close()
        conn.close()
