# backend/controllers/today_menu_controller.py
from flask import Blueprint, jsonify, request
from models.today_menu import TodayMenu

today_menu_bp = Blueprint('today_menu_bp', __name__, url_prefix='/api/today-menu')

@today_menu_bp.route('/update-status', methods=['POST'])
def update_menu_status():
    """Update menu status"""
    try:
        body = request.get_json()
        menu_id = body.get('menu_id')
        status = body.get('status')

        if not menu_id or not status:
            print("[❌] Missing menu_id or status")
            return jsonify({'success': False, 'message': 'Missing menu_id or status'}), 400

        print(f"[INFO] Updating menu_id={menu_id} -> status={status}")
        updated = TodayMenu.update_status(menu_id, status)

        if updated:
            print(f"[✅] Updated successfully: menu_id={menu_id}, status={status}")
            return jsonify({'success': True, 'message': 'Status updated successfully'}), 200
        else:
            print(f"[❌] Database update failed for menu_id={menu_id}")
            return jsonify({'success': False, 'message': 'Database update failed'}), 500
    except Exception as e:
        print(f"[🔥 ERROR in update-status] {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
@today_menu_bp.route('/recipes/<int:menu_id>', methods=['GET'])
def get_recipe_ingredients(menu_id):
    """Lấy danh sách nguyên liệu của món (theo menu_id)"""
    from utils.db import get_conn
    import mysql.connector

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        # ✅ Sửa JOIN cho đúng cấu trúc database của bạn
        query = """
            SELECT 
                i.name AS ingredient_name,
                ri.quantity,
                ri.unit
            FROM recipes r
            JOIN recipe_ingredients ri ON r.recipe_id = ri.recipe_id
            JOIN ingredients i ON ri.ingredient_id = i.ingredient_id
            WHERE r.menu_id = %s;
        """

        cur.execute(query, (menu_id,))
        rows = cur.fetchall()

        if not rows:
            print(f"[⚠️] No ingredients found for menu_id={menu_id}")
            return jsonify({'success': False, 'message': 'No ingredients found'}), 404

        return jsonify({'success': True, 'ingredients': rows}), 200

    except mysql.connector.Error as err:
        print(f"[DB ERROR] {err}")
        return jsonify({'success': False, 'error': str(err)}), 500

    finally:
        cur.close()
        conn.close()


@today_menu_bp.route('/', methods=['GET'])
def get_today_menu():
    """Get today's menu with status"""
    from utils.db import get_conn
    import mysql.connector

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        query = """
            SELECT 
                m.menu_id,
                m.name AS product_name,
                m.description,
                pr.note AS note,
                pr.produced_quantity AS quantity,
                pr.status
            FROM menu m
            INNER JOIN production_reports pr 
                ON m.menu_id = pr.menu_id
            WHERE pr.report_date = CURDATE()
            ORDER BY m.menu_id;
        """
        cur.execute(query)
        rows = cur.fetchall()

        return jsonify({'success': True, 'data': rows}), 200

    except mysql.connector.Error as err:
        print(f"[DB ERROR] {err}")
        return jsonify({'success': False, 'error': str(err)}), 500

    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()
@today_menu_bp.route('/complete', methods=['POST'])
def complete_menu_item():
    """Trừ nguyên liệu trong kho dựa theo số lượng sản phẩm thực tế"""
    from utils.db import get_conn
    import mysql.connector
    body = request.get_json()
    menu_id = body.get('menu_id')

    if not menu_id:
        return jsonify({'success': False, 'message': 'Missing menu_id'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()

        # ✅ Lấy số lượng bánh đã sản xuất hôm nay
        cur.execute("""
            SELECT produced_quantity 
            FROM production_reports
            WHERE menu_id = %s AND report_date = CURDATE();
        """, (menu_id,))
        result = cur.fetchone()
        produced_quantity = result[0] if result else 1  # mặc định 1 nếu chưa có record

        print(f"[INFO] Deducting ingredients for menu_id={menu_id}, quantity={produced_quantity}")

        # ✅ Trừ nguyên liệu theo công thức * số lượng bánh
        deduction_query = """
            UPDATE inventory i
            JOIN recipe_ingredients ri ON i.ingredient_id = ri.ingredient_id
            JOIN recipes r ON ri.recipe_id = r.recipe_id
            SET i.current_stock = GREATEST(0, i.current_stock - (ri.quantity * %s))
            WHERE r.menu_id = %s;
        """
        cur.execute(deduction_query, (produced_quantity, menu_id))

        # ✅ Cập nhật trạng thái "Done"
        update_status_query = """
            UPDATE production_reports
            SET status = 'Done'
            WHERE menu_id = %s AND report_date = CURDATE();
        """
        cur.execute(update_status_query, (menu_id,))

        conn.commit()
        print(f"[✅] Deducted ingredients x{produced_quantity} for menu_id={menu_id}")
        return jsonify({'success': True, 'message': 'Completed and deducted successfully'}), 200

    except mysql.connector.Error as err:
        conn.rollback()
        print(f"[DB ERROR] {err}")
        return jsonify({'success': False, 'error': str(err)}), 500

    finally:
        cur.close()
        conn.close()


