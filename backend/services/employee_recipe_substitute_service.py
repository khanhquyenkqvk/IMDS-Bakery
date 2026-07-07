import json
from services.recipe_substitute_service import apply_recipe_substitute

def get_approved_recipe_substitute_for_recipe(conn, recipe_id=None):
    params = []
    where = [
        "s.suggestion_type='Recipe_Substitute'",
        "s.is_archived=0",
        "s.status IN ('Approved','Applied')"
    ]

    if recipe_id is not None:
        where.append("""
        CAST(JSON_UNQUOTE(JSON_EXTRACT(s.details,'$.target_recipe_id')) AS UNSIGNED) = %s
        """)
        params.append(int(recipe_id))

    sql = f"""
    SELECT
        s.suggestion_id, s.details, s.status, s.created_at, s.approved_by,
        u.full_name AS approved_by_name
    FROM suggestions s
    LEFT JOIN users u ON u.user_id = s.approved_by
    WHERE {" AND ".join(where)}
    ORDER BY s.created_at DESC
    LIMIT 1
    """

    cur = conn.cursor(dictionary=True)
    cur.execute(sql, tuple(params))
    row = cur.fetchone()
    cur.close()

    if not row:
        return None if recipe_id is not None else []

    try:
        d = json.loads(row["details"]) if row.get("details") else {}
    except Exception:
        d = {}

    out = {
        "suggestion_id": row["suggestion_id"],
        "status": row["status"],
        "created_at": str(row["created_at"]) if row.get("created_at") else None,
        "approved_by": row.get("approved_by"),
        "approved_by_name": row.get("approved_by_name"),  # ✅ thêm
        "details": d
    }
    return out if recipe_id is not None else [out]



def apply_recipe_substitute_for_employee(conn, suggestion_id: int, employee_id: int):
    return apply_recipe_substitute(conn, suggestion_id, employee_id)
