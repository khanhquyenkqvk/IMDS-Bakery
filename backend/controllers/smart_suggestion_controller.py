# backend/controllers/smart_suggestion_controller.py
from datetime import date, timedelta
import json
from utils.db import get_conn, dictfetchall

class SmartSuggestionController:
    """
    Sinh gợi ý thông minh cho Admin & Owner:
      - Tính mức độ tiêu thụ nguyên liệu
      - Tính số ngày đủ dùng (days_of_cover)
      - Đề xuất lượng nhập kho (suggested_qty)
      - Lưu / đọc gợi ý từ bảng suggestions
    """

    # ------------------------- helpers -------------------------
    @staticmethod
    def _get_usage_last_30_days(conn):
        """
        Trả về dict {ingredient_id: avg_daily_usage}
        Dựa trên transactions type Use + Export trong 30 ngày gần nhất.
        """
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT 
                b.ingredient_id,
                SUM(
                    CASE 
                        WHEN t.type IN ('Use','Export') THEN t.quantity 
                        ELSE 0 
                    END
                ) / 30.0 AS avg_daily_usage
            FROM transactions t
            JOIN batches b ON t.batch_id = b.batch_id
            WHERE t.created_at >= CURDATE() - INTERVAL 30 DAY
            GROUP BY b.ingredient_id
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        usage_map = {row["ingredient_id"]: float(row["avg_daily_usage"] or 0) for row in rows}
        cursor.close()
        return usage_map

    @staticmethod
    def _get_latest_import_per_ingredient(conn):
        """
        Lấy lần nhập gần nhất cho mỗi ingredient.
        Trả về dict {ingredient_id: {"last_import_date": ..., "last_lot_code": ...}}
        """
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                b.ingredient_id,
                MAX(t.created_at) AS last_import_date,
                SUBSTRING_INDEX(
                    GROUP_CONCAT(b.lot_code ORDER BY t.created_at DESC),
                    ',', 1
                ) AS last_lot_code
            FROM transactions t
            JOIN batches b ON t.batch_id = b.batch_id
            WHERE t.type = 'Import'
            GROUP BY b.ingredient_id
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

        result = {}
        for r in rows:
            result[r["ingredient_id"]] = {
                "last_import_date": r["last_import_date"].strftime("%Y-%m-%d") if r["last_import_date"] else None,
                "last_lot_code": r["last_lot_code"],
            }
        return result

    @staticmethod
    def _get_expiry_alerts_per_ingredient(conn):
        """
        Gom các alert NearExpiry / Expired / LowStock đang Pending theo ingredient.
        Trả về dict {ingredient_id: {"has_near_expiry": bool, "has_expired": bool, "has_low_stock": bool}}
        """
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                b.ingredient_id,
                a.alert_type,
                a.severity
            FROM alerts a
            JOIN batches b ON a.batch_id = b.batch_id
            WHERE a.status = 'Pending'
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

        alert_map = {}
        for r in rows:
            ing_id = r["ingredient_id"]
            alert_type = r["alert_type"]
            entry = alert_map.setdefault(ing_id, {
                "has_near_expiry": False,
                "has_expired": False,
                "has_low_stock": False,
            })
            if alert_type == "NearExpiry":
                entry["has_near_expiry"] = True
            elif alert_type == "Expired":
                entry["has_expired"] = True
            elif alert_type == "LowStock":
                entry["has_low_stock"] = True

        return alert_map

    # ------------------------- core calculators -------------------------
    @staticmethod
    def list_warehouse_suggestions(args):
        """
        Cho Admin: danh sách gợi ý nhập kho tính động.
        GET /api/admin/smart-suggestions/warehouse
          ?page=1&page_size=10
        """
        page = max(int(args.get("page", 1) or 1), 1)
        page_size = max(min(int(args.get("page_size", 10) or 10), 50), 1)

        conn = get_conn()
        cursor = conn.cursor(dictionary=True)

        # Lấy tồn kho + info ingredient
        base_query = """
            SELECT 
                i.ingredient_id,
                i.name AS ingredient_name,
                inv.current_stock,
                inv.unit
            FROM inventory inv
            JOIN ingredients i ON inv.ingredient_id = i.ingredient_id
            ORDER BY i.name ASC
        """
        cursor.execute(base_query)
        ingredients = cursor.fetchall()
        cursor.close()

        usage_map = SmartSuggestionController._get_usage_last_30_days(conn)
        import_map = SmartSuggestionController._get_latest_import_per_ingredient(conn)
        alert_map = SmartSuggestionController._get_expiry_alerts_per_ingredient(conn)

        # phân trang manual
        total_items = len(ingredients)
        start = (page - 1) * page_size
        end = start + page_size
        sliced = ingredients[start:end]

        items = []
        TARGET_DAYS = 14

        for row in sliced:
            ing_id = row["ingredient_id"]
            current_stock = float(row["current_stock"] or 0)
            unit = row["unit"]
            avg_daily_usage = float(usage_map.get(ing_id, 0))
            if avg_daily_usage <= 0:
                days_of_cover = None
            else:
                days_of_cover = round(current_stock / avg_daily_usage, 1)

            # mức độ khẩn
            if days_of_cover is None:
                urgency = "Unknown"
            elif days_of_cover <= 3:
                urgency = "High"
            elif days_of_cover <= 7:
                urgency = "Medium"
            else:
                urgency = "Low"

            # gợi ý nhập thêm
            if avg_daily_usage > 0:
                target_stock = TARGET_DAYS * avg_daily_usage
                suggested_qty = max(0, round(target_stock - current_stock, 1))
            else:
                suggested_qty = 0

            alert_flags = alert_map.get(ing_id, {
                "has_near_expiry": False,
                "has_expired": False,
                "has_low_stock": False
            })

            import_info = import_map.get(ing_id, {})
            last_import_date = import_info.get("last_import_date")
            last_lot_code = import_info.get("last_lot_code")

            items.append({
                "ingredient_id": ing_id,
                "ingredient_name": row["ingredient_name"],
                "current_stock": current_stock,
                "unit": unit,
                "avg_daily_usage": round(avg_daily_usage, 2),
                "days_of_cover": days_of_cover,
                "urgency": urgency,
                "suggested_qty": suggested_qty,
                "target_days": TARGET_DAYS,
                "last_import_date": last_import_date,
                "last_import_lot_code": last_lot_code,
                "alerts": alert_flags,
            })
  # ======= ĐẾM SUGGESTION ĐÃ ĐƯỢC OWNER APPROVE =======
        cursor2 = conn.cursor()
        cursor2.execute("""
            SELECT COUNT(*)
            FROM suggestions
            WHERE suggestion_type = 'Purchase'
              AND status = 'Approved'
        """)
        owner_approved = cursor2.fetchone()[0] or 0
        cursor2.close()

        conn.close()

        # Summary cho ô stat trên cùng (warehouse tab)
        urgent_count = sum(1 for i in items if i["urgency"] == "High")
        almost_gone = sum(1 for i in items if i["urgency"] == "Medium")
        # chủ đã duyệt sẽ tính từ bảng suggestions (ở route khác nếu cần)

        summary = {
            "total_suggestions": total_items,
            "urgent": urgent_count,
            "almost_gone": almost_gone,
            "owner_approved": owner_approved,
        }

        return {
            "success": True,
            "data": {
                "summary": summary,
                "items": items,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total_items": total_items,
                    "total_pages": max(1, (total_items + page_size - 1) // page_size),
                }
            }
        }

    @staticmethod
    def list_ai_history(args):
        """
        Lịch sử hoạt động AI – dùng bảng suggestions + alerts + forecasts.
        GET /api/admin/smart-suggestions/history
          ?page=1&page_size=5
        """
        page = max(int(args.get("page", 1) or 1), 1)
        page_size = max(min(int(args.get("page_size", 5) or 5), 50), 1)

        conn = get_conn()
        cursor = conn.cursor(dictionary=True)

        # dùng suggestions type Purchase làm nguồn chính
        count_query = """
            SELECT COUNT(*) AS total
            FROM suggestions s
            WHERE s.suggestion_type IN ('Purchase','menu','Recipe_Substitute')
        """
        cursor.execute(count_query)
        total_items = cursor.fetchone()["total"] or 0

        query = """
            SELECT 
                s.suggestion_id,
                s.suggestion_type,
                s.details,
                s.status,
                s.created_at,
                u.full_name AS created_by_name,
                a.full_name AS approved_by_name
            FROM suggestions s
            LEFT JOIN users u ON s.created_by = u.user_id
            LEFT JOIN users a ON s.approved_by = a.user_id
            WHERE s.suggestion_type IN ('Purchase','menu','Recipe_Substitute')
            ORDER BY s.created_at DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(query, (page_size, (page - 1) * page_size))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        activities = []
        for r in rows:
            try:
                details = json.loads(r["details"] or "{}")
            except Exception:
                details = {}

            # mapping status cho FE
            status_key = "success" if r["status"] == "Approved" else "approved" if r["status"] == "Pending" else "rejected"
            status_en = {
                "Approved": "Success",
                "Pending": "Approved",
                "Rejected": "Rejected"
            }.get(r["status"], r["status"] or "N/A")

            # gen title & summary cơ bản
            ing_name = details.get("ingredient_name") or details.get("title") or "Suggestion"
            if r["suggestion_type"] == "Purchase":
                title_en = f"AI purchase suggestion for {ing_name}"
            elif r["suggestion_type"] == "Recipe_Substitute":
                # title dùng tên recipe nếu có
                recipe_name = details.get("target_recipe_name") or details.get("recipe_name") or ing_name
                title_en = f"AI recipe substitute for {recipe_name}"
            else:
                title_en = details.get("title_en") or "AI suggestion"

            # ✅ summary: KHÔNG dump JSON
            if r["suggestion_type"] == "Recipe_Substitute":
                summary_en, summary_vi, note_en, note_vi = _summarize_recipe_substitute(details)
            else:
                summary_en = details.get("summary_en") or details.get("reason") or details.get("note") or ""
                summary_en = _truncate(summary_en, 220)
                summary_vi = details.get("summary_vi") or summary_en
                note_en = details.get("note_en", "")
                note_vi = details.get("note_vi", "")

            activities.append({
                "id": r["suggestion_id"],
                "title": {"en": title_en, "vi": title_en},
                "status": {"key": status_key, "en": status_en, "vi": status_en},
                "summary": {"en": summary_en, "vi": summary_vi},
                "note": {"en": note_en, "vi": note_vi},
                "meta": {
                    "time": r["created_at"].strftime("%Y-%m-%d %H:%M"),
                    "author": r["created_by_name"] or "N/A"
                },
                "detail": "#",
            })


        # summary cho tab history
        approved = sum(1 for a in activities if a["status"]["key"] in ("success",))
        pending = sum(1 for a in activities if a["status"]["key"] == "approved")

        summary = {
            "total_activity": total_items,
            "approved": approved,
            "success": approved,  # có thể tách rõ hơn nếu muốn
            "alternative_formula": sum(1 for a in activities if "substitute" in a["title"]["en"].lower())
        }

        return {
            "success": True,
            "data": {
                "summary": summary,
                "items": activities,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total_items": total_items,
                    "total_pages": max(1, (total_items + page_size - 1) // page_size)
                }
            }
        }

    @staticmethod
    def create_purchase_suggestion(payload, actor_user_id):
        """
        Admin gửi gợi ý mua hàng cho Owner.
        POST /api/admin/smart-suggestions/send
        body: {
          "ingredient_id": 7,
          "suggested_qty": 3000,
          "unit": "g",
          "urgency": "High",
          "avg_daily_usage": 450,
          "days_of_cover": 3,
          "reason": "Stock will run out in 3 days..."
        }
        """
        ing_id = int(payload.get("ingredient_id"))
        suggested_qty = float(payload.get("suggested_qty") or 0)
        urgency = payload.get("urgency") or "Medium"
        unit = payload.get("unit") or ""
        avg_daily_usage = float(payload.get("avg_daily_usage") or 0)
        days_of_cover = payload.get("days_of_cover")

        conn = get_conn()
        cursor = conn.cursor(dictionary=True)

        # lấy tên ingredient
        cursor.execute("SELECT name FROM ingredients WHERE ingredient_id = %s", (ing_id,))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            conn.close()
            return {"success": False, "error": "Ingredient not found"}, 404

        ingredient_name = row["name"]

        details = {
            "ingredient_id": ing_id,
            "ingredient_name": ingredient_name,
            "suggested_qty": suggested_qty,
            "unit": unit,
            "urgency": urgency,
            "avg_daily_usage": avg_daily_usage,
            "days_of_cover": days_of_cover,
            "reason": payload.get("reason") or "",
        }

        insert_sql = """
            INSERT INTO suggestions (suggestion_type, created_by, details, status)
            VALUES ('Purchase', %s, %s, 'Pending')
        """
        cursor.execute(insert_sql, (actor_user_id, json.dumps(details)))
        conn.commit()
        suggestion_id = cursor.lastrowid
        cursor.close()
        conn.close()

        return {
            "success": True,
            "data": {"suggestion_id": suggestion_id}
        }

    # ------------------- owner-facing -------------------
    @staticmethod
    def list_owner_purchase_recommendations(owner_user_id=None):
        """
        Cho Owner Dashboard (AI-Powered Recommendations).
        GET /api/owner/ai/recommendations
        """
        conn = get_conn()
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT 
                s.suggestion_id,
                s.details,
                s.status,
                s.created_at,
                u.full_name AS admin_name,
                a.full_name AS owner_name,
                s.approved_by
            FROM suggestions s
            LEFT JOIN users u ON s.created_by = u.user_id
            LEFT JOIN users a ON s.approved_by = a.user_id
            WHERE s.suggestion_type = 'Purchase'
            AND s.is_archived = 0
            ORDER BY s.created_at DESC
            LIMIT 20
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

        # map ingredient -> inventory để hiển thị current_stock
        ing_ids = []
        details_list = []
        for r in rows:
            try:
                d = json.loads(r["details"] or "{}")
            except Exception:
                d = {}
            d["__row"] = r
            details_list.append(d)
            if "ingredient_id" in d:
                ing_ids.append(int(d["ingredient_id"]))

        inventory_map = {}
        if ing_ids:
            in_clause = ",".join(["%s"] * len(ing_ids))
            inv_sql = f"""
                SELECT ingredient_id, current_stock, unit
                FROM inventory
                WHERE ingredient_id IN ({in_clause})
            """
            cur2 = conn.cursor(dictionary=True)
            cur2.execute(inv_sql, tuple(ing_ids))
            for inv in cur2.fetchall():
                inventory_map[inv["ingredient_id"]] = {
                    "current_stock": float(inv["current_stock"] or 0),
                    "unit": inv["unit"]
                }
            cur2.close()

        conn.close()

        items = []
        for d in details_list:
            row = d.pop("__row")
            ing_id = int(d.get("ingredient_id")) if d.get("ingredient_id") is not None else None
            inv_info = inventory_map.get(ing_id, {"current_stock": None, "unit": d.get("unit")})

            current_stock = inv_info["current_stock"]
            unit = inv_info["unit"] or d.get("unit") or ""

            avg_daily_usage = float(d.get("avg_daily_usage") or 0)
            days_of_cover = d.get("days_of_cover")
            urgency = d.get("urgency") or "Medium"
            suggested_qty = float(d.get("suggested_qty") or 0)

            # mapping status cho UI
            status = row["status"]
            if status == "Approved":
                ui_status = "success"
            elif status == "Pending":
                ui_status = "pending"
            else:
                ui_status = "rejected"

            items.append({
                "id": row["suggestion_id"],
                "ingredient_id": ing_id,
                "ingredient_name": d.get("ingredient_name") or "N/A",
                "urgency": urgency,
                "status": ui_status,
                "db_status": status,
                "current_stock": current_stock,
                "unit": unit,
                "avg_daily_usage": avg_daily_usage,
                "days_of_cover": days_of_cover,
                "suggested_qty": suggested_qty,
                "reason": d.get("reason") or "",
                "admin_name": row["admin_name"] or "N/A",
                "owner_name": row["owner_name"],
                "created_at": row["created_at"].strftime("%Y-%m-%d"),
                "approved_by_owner": bool(row["approved_by"]),
            })

        return {"success": True, "data": items}

    @staticmethod
    def update_suggestion_status(suggestion_id, new_status, owner_user_id):
        """
        Owner duyệt / từ chối gợi ý.
        POST /api/owner/ai/recommendations/<id>/status
        body: {"status": "Approved"} hoặc {"status": "Rejected"}
        """
        if new_status not in ("Approved", "Rejected"):
            return {"success": False, "error": "Invalid status"}, 400

        conn = get_conn()
        cursor = conn.cursor()
        sql = """
            UPDATE suggestions
            SET status = %s,
                approved_by = %s
            WHERE suggestion_id = %s
        """
        cursor.execute(sql, (new_status, owner_user_id, suggestion_id))
        conn.commit()
        cursor.close()
        conn.close()

        return {"success": True}
    @staticmethod
    def archive_suggestion_for_owner(suggestion_id, owner_user_id):
        """
        Owner 'xóa' suggestion khỏi dashboard (không xóa lịch sử).
        """
        conn = get_conn()
        cur = conn.cursor()
        try:
            sql = "UPDATE suggestions SET is_archived = 1 WHERE suggestion_id = %s"
            cur.execute(sql, (suggestion_id,))
            conn.commit()
            return {"success": True}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}, 500
        finally:
            cur.close()
            conn.close()
def _truncate(text: str, n: int = 220) -> str:
    s = (text or "").strip()
    if len(s) <= n:
        return s
    return s[:n].rstrip() + "..."

def _summarize_recipe_substitute(details: dict):
    # lấy tên recipe
    recipe = details.get("target_recipe_name") or details.get("recipe_name") or details.get("target_recipe") or "Recipe"

    # issues: ưu tiên details["reasons"], fallback materials_check
    reasons = details.get("reasons") or []
    mats = details.get("materials_check") or []
    issue_list = []
    for r in (reasons if isinstance(reasons, list) else []):
        issue_list.append((r.get("issue") or "Unknown"))
    if not issue_list and isinstance(mats, list):
        for m in mats:
            issue_list.append((m.get("status") or "Unknown"))

    # đếm issues
    counts = {}
    for k in issue_list:
        k = str(k)
        counts[k] = counts.get(k, 0) + 1
    issue_summary = ", ".join([f"{k}({v})" for k, v in sorted(counts.items(), key=lambda x: -x[1])]) or "No issues"

    # substitutions preview
    subs = details.get("substitutions") or []
    preview = []
    if isinstance(subs, list):
        for s in subs[:3]:
            f = ((s.get("from") or {}).get("name")) or ((s.get("from") or {}).get("ingredient_name")) or "?"
            t = ((s.get("to") or {}).get("name")) or ((s.get("to") or {}).get("ingredient_name")) or "?"
            preview.append(f"{f} → {t}")
    subs_text = " | ".join(preview) if preview else "No substitutions"
    if isinstance(subs, list) and len(subs) > 3:
        subs_text += f" (+{len(subs)-3} more)"

    summary_en = f"Recipe: {recipe}. Issues: {issue_summary}."
    note_en = f"Substitutions: {subs_text}"

    # vi đơn giản
    summary_vi = f"Bánh: {recipe}. Vấn đề: {issue_summary}."
    note_vi = f"Thay thế: {subs_text}"

    return summary_en, summary_vi, note_en, note_vi

