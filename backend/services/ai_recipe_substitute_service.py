import os, json, hashlib
from openai import OpenAI

def _sha256(obj) -> str:
    s = json.dumps(obj, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def build_context_hash(recipe_id: int, problems: list, materials_check: list) -> str:
    # Hash theo "thực trạng kho" để cache; kho đổi -> hash đổi -> generate mới
    payload = {
        "recipe_id": recipe_id,
        "problems": problems,
        "materials_check": materials_check
    }
    return _sha256(payload)

def call_ai_substitution(recipe_name: str, target_problems: list, candidate_pool: list):
    """
    target_problems: list các nguyên liệu lỗi (Expired/LowStock) có structure:
      {from_ingredient_id, from_name, from_qty, from_unit, issue}
    candidate_pool: list nguyên liệu được phép thay:
      {ingredient_id, name, unit}
    """
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("AI_MODEL", "gpt-4o-mini")

    print("[AI] has_key =", bool(api_key), "model =", model, flush=True)

    if not api_key:
        return None, "Missing OPENAI_API_KEY"

    client = OpenAI(api_key=api_key)

    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "substitutions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                "from_ingredient_id": {"type": "integer"},
                "to_ingredient_id": {"type": "integer"},
                "ratio": {"type": "number"},
                "reason": {"type": "string"},
                "notes": {"type": "string"}
                },
                "required": [
                "from_ingredient_id",
                "to_ingredient_id",
                "ratio",
                "reason",
                "notes"
                ]
            }
            },
            "overall_notes": {"type": "string"}
        },
        "required": ["substitutions", "overall_notes"]
        }




    system = (
        "You are a professional pastry chef and inventory-aware recipe assistant.\n"
        "RULES:\n"
        "- Only choose replacements from candidate_pool (by ingredient_id).\n"
        "- Do NOT invent new ingredient IDs.\n"
        "- Keep substitutions realistic for baking.\n"
        "- Prefer same unit types when possible.\n"
        "- ratio must be practical (e.g., 1.0, 0.8, 1.2).\n"
    )

    user = {
        "recipe_name": recipe_name,
        "target_problems": target_problems,
        "candidate_pool": candidate_pool
    }

    try:
        resp = client.responses.create(
            model=model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "recipe_substitute_plan",
                    "schema": schema,
                    "strict": True
                }
            },
            max_output_tokens=1200
        )


        data = _extract_response_json(resp)

        # Debug để biết model trả gì
        try:
            preview = (json.dumps(data, ensure_ascii=False)[:200] if data else "")
        except Exception:
            preview = ""

        print("[AI] parsed_ok =", bool(data), "preview =", repr(preview), flush=True)

        if not data:
            try:
                print("[AI] output_preview =", repr(getattr(resp, "output", None))[:500], flush=True)
            except Exception:
                pass
            return None, "AI returned empty/invalid structured output"

        return {"model": model, "data": data, "usage": getattr(resp, "usage", None)}, None


    except Exception as e:
        return None, f"AI call failed: {e}"
def call_ai_rewrite_instructions(recipe_name: str, base_instructions: list, substitutions: list, new_ingredients: list):
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("AI_MODEL", "gpt-4o-mini")
    if not api_key:
        return None, "Missing OPENAI_API_KEY"

    client = OpenAI(api_key=api_key)

    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "updated_instructions": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": ["updated_instructions"]
    }

    system = (
        "You are a professional pastry chef.\n"
        "Task: Rewrite the FULL step-by-step instructions for the updated recipe.\n"
        "Rules:\n"
        "- Output MUST be a list of steps (updated_instructions).\n"
        "- DO NOT output notes like 'Note:' or 'Substitute ...' as separate lines.\n"
        "- Integrate substitutions naturally into the actual steps.\n"
        "- Keep it clear, actionable, and in correct baking order.\n"
        "- Keep the number of steps close to the original unless required to change.\n"
    )

    user = {
        "recipe_name": recipe_name,
        "base_instructions": base_instructions,
        "substitutions": substitutions,     # list of {from:{name,qty,unit}, to:{name,qty,unit}, ratio, reason}
        "new_ingredients": new_ingredients  # list of {name,quantity,unit}
    }

    try:
        resp = client.responses.create(
            model=model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "updated_recipe_instructions",
                    "schema": schema,
                    "strict": True
                }
            },
            max_output_tokens=1200
        )

        data = _extract_response_json(resp)
        if not data or not isinstance(data.get("updated_instructions"), list):
            return None, "AI returned empty/invalid updated_instructions"

        # clean empty lines
        steps = [str(s).strip() for s in data["updated_instructions"] if str(s).strip()]
        if not steps:
            return None, "AI returned no usable steps"

        return {"model": model, "steps": steps, "usage": getattr(resp, "usage", None)}, None
    except Exception as e:
        return None, f"AI rewrite instructions failed: {e}"
 
def _extract_response_json(resp):
    # 1) ưu tiên output_text nếu có
    raw = (getattr(resp, "output_text", None) or "").strip()
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass

    # 2) duyệt toàn bộ output items
    for item in (getattr(resp, "output", None) or []):
        # item.type có thể là "message", "reasoning", ...
        for part in (getattr(item, "content", None) or []):
            # tùy SDK version: part.type có thể là "output_text" hoặc có field "text"
            txt = (getattr(part, "text", None) or "").strip()
            if txt:
                try:
                    return json.loads(txt)
                except Exception:
                    continue

            # một số version có thể trả output_json
            js = getattr(part, "json", None)
            if isinstance(js, (dict, list)):
                return js

    return None
