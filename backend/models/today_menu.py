# backend/models/today_menu.py
from utils.db import get_conn
import mysql.connector

class TodayMenu:
    @staticmethod
    def update_status(menu_id, status):
        conn = get_conn()
        cur = conn.cursor()
        try:
            # Kiểm tra xem hôm nay có record chưa
            check_query = """
                SELECT report_id FROM production_reports
                WHERE menu_id = %s AND report_date = CURDATE();
            """
            cur.execute(check_query, (menu_id,))
            result = cur.fetchone()

            if result:
                # Cập nhật nếu đã tồn tại
                update_query = """
                    UPDATE production_reports
                    SET status = %s
                    WHERE menu_id = %s AND report_date = CURDATE();
                """
                cur.execute(update_query, (status, menu_id))
            else:
                # Tạo mới nếu chưa có
                insert_query = """
                    INSERT INTO production_reports (menu_id, produced_quantity, report_date, status)
                    VALUES (%s, 0, CURDATE(), %s);
                """
                cur.execute(insert_query, (menu_id, status))

            conn.commit()  # 🧠 Bắt buộc phải commit
            return True
        except mysql.connector.Error as err:
            print(f"[DB ERROR] {err}")
            conn.rollback()
            return False
        finally:
            cur.close()
            conn.close()
