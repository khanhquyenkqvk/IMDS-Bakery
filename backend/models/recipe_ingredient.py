# backend/models/recipe_ingredient.py (New file)
from utils.db import get_conn, dictfetchall

class RecipeIngredient:
    @staticmethod
    def add_ingredient_to_recipe(recipe_id, ingredient_id, quantity, unit):
        """Add an ingredient to a recipe"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) 
                VALUES (%s, %s, %s, %s)
            """, (recipe_id, ingredient_id, quantity, unit))
            conn.commit()
            return cur.lastrowid
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def get_ingredients_by_recipe(recipe_id):
        """Get ingredients for a specific recipe"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT ri.recipe_ingredient_id, ri.recipe_id, ri.ingredient_id, ri.quantity, ri.unit, i.name
                FROM recipe_ingredients ri
                JOIN ingredients i ON ri.ingredient_id = i.ingredient_id
                WHERE ri.recipe_id = %s
            """, (recipe_id,))
            return dictfetchall(cur)
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def update_ingredient_quantity(recipe_ingredient_id, quantity):
        """Update quantity of a recipe ingredient"""
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                UPDATE recipe_ingredients 
                SET quantity = %s 
                WHERE recipe_ingredient_id = %s
            """, (quantity, recipe_ingredient_id))
            conn.commit()
            return cur.rowcount > 0
        finally:
            cur.close()
            conn.close()