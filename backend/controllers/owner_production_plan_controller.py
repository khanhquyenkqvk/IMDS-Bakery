from datetime import datetime, date

from utils.db import get_conn, dictfetchall


class OwnerProductionPlanController:
    """
    Quản lý Today menu (kế hoạch sản xuất) cho owner.
    Dùng bảng production_reports:
      report_id, menu_id, produced_quantity, report_date,
      note, created_at, created_by, status
    """

    @staticmethod
    def _normalize_date(d):
        if d is None:
            return None
        if isinstance(d, datetime):
            d = d.date()
        if isinstance(d, date):
            return d.isoformat()
        return str(d)

    @staticmethod
    def list_by_date(args):
        """
        GET /api/owner/production-reports?date=YYYY-MM-DD
        """
        date_str = (args.get("date") or args.get("report_date") or "").strip()
        if not date_str:
            date_str = date.today().isoformat()

        conn = get_conn()
        cur = conn.cursor()
        try:
            sql = """
                SELECT
                    pr.report_id,
                    pr.report_date      AS production_date,
                    pr.menu_id          AS recipe_id,      -- alias cho JS dùng
                    m.name              AS recipe_name,
                    pr.produced_quantity AS quantity,
                    pr.note,
                    pr.status
                FROM production_reports pr
                JOIN menu m ON pr.menu_id = m.menu_id
                WHERE pr.report_date = %s
                ORDER BY m.name
            """
            cur.execute(sql, (date_str,))
            rows = dictfetchall(cur)
            for r in rows:
                r["production_date"] = OwnerProductionPlanController._normalize_date(
                    r.get("production_date")
                )
            return {"success": True, "data": rows}, 200
        except Exception as e:
            print("ERROR OwnerProductionPlanController.list_by_date:", e)
            return {"success": False, "error": "Failed to load today menu"}, 500
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def bulk_save(payload: dict):
        """
        POST /api/owner/production-reports/bulk-save

        Body:
        {
          "date": "2025-11-20",
          "rows": [
            {
              "report_id": 1 | null,
              "recipe_id": 3,          # thực chất là menu_id
              "quantity": 20,
              "note": "Main product",
              "status": "Haven't done" | "Doing" | "Done"
            }, ...
          ],
          "deleted_ids": [3, 5, ...]   # các report_id đã xoá trên UI
        }
        """
        date_str = (payload.get("date") or "").strip()
        rows = payload.get("rows") or []
        deleted_ids = payload.get("deleted_ids") or []

        if not date_str:
            return {"success": False, "error": "date is required"}, 400
        default_created_by = payload.get("created_by")

        conn = get_conn()
        cur = conn.cursor()
        try:
            # 1) Xoá các dòng bị remove trên UI
            for rid in deleted_ids:
                try:
                    cur.execute(
                        "DELETE FROM production_reports WHERE report_id = %s",
                        (rid,),
                    )
                except Exception as _:
                    # nếu rid không tồn tại thì bỏ qua
                    pass

            # 2) Update / Insert các dòng còn lại
            for row in rows:
                report_id = row.get("report_id")
                menu_id = row.get("recipe_id")   # phía JS vẫn gọi là recipe_id
                qty = int(row.get("quantity") or 0)
                note = (row.get("note") or "").strip()

                created_by = row.get("created_by") or default_created_by

                if not menu_id or qty <= 0:
                    continue

                if report_id:
                    # cập nhật số lượng & ghi chú
                    cur.execute(
                        """
                        UPDATE production_reports
                           SET produced_quantity = %s,
                               note = %s
                         WHERE report_id = %s
                        """,
                        (qty, note, report_id),
                    )
                else:
                    # thêm mới, status mặc định Haven't done
                    cur.execute(
                        """
                        INSERT INTO production_reports
                            (report_date, menu_id, produced_quantity, note, status, created_by)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (date_str, menu_id, qty, note, "Haven't done", created_by),
                    )

            conn.commit()
            return {"success": True}, 200
        except Exception as e:
            conn.rollback()
            print("ERROR OwnerProductionPlanController.bulk_save:", e)
            return {"success": False, "error": "Failed to save today menu"}, 500
        finally:
            cur.close()
            conn.close()