from datetime import datetime
from backend.models.ingredient import get_or_create_ingredient, upsert_inventory
from backend.models.batch import create_batch
from backend.utils.db import get_conn
from models.batch import create_batch, lot_code_exists

def _calc_shelf_days(received_date: str, expiry: str):
    try:
        d1 = datetime.strptime(received_date, "%Y-%m-%d").date()
        d2 = datetime.strptime(expiry, "%Y-%m-%d").date()
        days = (d2 - d1).days
        return days if days >= 0 else None
    except Exception:
        return None

def _next_lot_code(base_code: str) -> str:

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT lot_code FROM batches WHERE lot_code LIKE %s", (base_code + "%",))
        existing = [r[0] for r in cur.fetchall()]
        conn.close()

        if not existing:
            return base_code
        # Tìm số lớn nhất đã dùng
        suffixes = []
        for code in existing:
            parts = code.split("-")
            if parts[-1].isdigit():
                suffixes.append(int(parts[-1]))
        next_num = max(suffixes) + 1 if suffixes else 1
        return f"{base_code}-{str(next_num).zfill(2)}"
    finally:
        conn.close()

def import_ingredients(payload: dict, user_id: int):
    base_batch_code = payload.get("batch_code")
    received_date = payload.get("received_date")
    items = payload.get("items", [])

    saved = []
    for it in items:
        name = it["product"].strip()
        qty = float(it["quantity"])
        unit = it["unit"]
        expiry = it["useByDate"]
        note = it.get("note")

        shelf_days = _calc_shelf_days(received_date, expiry)
        ing_id = it.get("ingredient_id")
        if ing_id:
            ing_id = int(ing_id)
        else:
            ing_id = get_or_create_ingredient(name, unit, shelf_days)


        lot_code = _next_lot_code(base_batch_code)

        batch_id = create_batch(
            ingredient_id=ing_id,
            lot_code=lot_code,
            qty=qty,
            unit=unit,
            received_date=received_date,
            expiry_date=expiry,
            created_by=user_id,
            note=note
        )
        upsert_inventory(ing_id, unit, qty)

        saved.append({
            "batch_id": batch_id,
            "batch_code": lot_code,
            "product": name,
            "quantity": qty,
            "unit": unit,
            "received_date": received_date,
            "use_by_date": expiry,
        })

    return {"saved": saved}
class ImportController:
    @staticmethod
    def create_import(data):
        """Create a new import batch"""
        try:
            ingredient_id = data.get('ingredient_id')
            lot_code = data.get('lot_code')
            qty = data.get('qty')
            unit = data.get('unit')
            received_date = data.get('received_date')
            expiry_date = data.get('expiry_date')
            created_by = data.get('created_by')
            note = data.get('note')

            if not all([ingredient_id, lot_code, qty, unit, received_date, expiry_date, created_by]):
                return {'success': False, 'error': 'Missing required fields'}, 400

            if lot_code_exists(lot_code):
                return {'success': False, 'error': 'Lot code already exists'}, 409

            batch_id = create_batch(ingredient_id, lot_code, qty, unit, received_date, expiry_date, created_by, note)
            return {'success': True, 'data': {'batch_id': batch_id}}, 201
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

    @staticmethod
    def list_imports():
        """List all imports (batches)"""
        try:
            from models.batch import get_all_batches
            batches = get_all_batches()
            return {'success': True, 'data': batches}, 200
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500