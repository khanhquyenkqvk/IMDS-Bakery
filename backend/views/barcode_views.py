from flask import Blueprint, jsonify, request
from backend.utils.db import get_conn, dictfetchall

bp_barcode = Blueprint("bp_barcode", __name__)

@bp_barcode.route("/api/barcode/lookup", methods=["GET"])
def lookup_barcode():
    code = (request.args.get("code") or "").strip()
    if not code:
        return jsonify({"success": False, "message": "Missing code"}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        sql = """
          SELECT
            i.ingredient_id,
            i.name,
            i.unit,
            i.shelf_life_days
          FROM ingredient_barcodes ib
          JOIN ingredients i ON i.ingredient_id = ib.ingredient_id
          WHERE ib.barcode = %s
          LIMIT 1
        """
        cur.execute(sql, (code,))
        rows = dictfetchall(cur)
        if not rows:
            return jsonify({"success": False, "message": "Barcode not found"}), 404
        return jsonify({"success": True, "data": rows[0]})
    finally:
        try: cur.close()
        except: pass
        try: conn.close()
        except: pass
