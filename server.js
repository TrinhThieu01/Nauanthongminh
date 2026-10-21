import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, initDb, getDatabasePath } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

initDb();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.resolve(__dirname, "../public")));

const api = express.Router();

api.get("/health", (_req, res) => res.json({ status: "ok", service: "PantryChef" }));

api.get("/ingredients", (_req, res) => {
  res.json(db.prepare("SELECT id,name,category,canonical_unit FROM Ingredients ORDER BY name").all());
});

api.get("/pantry", (_req, res) => {
  res.json(db.prepare(`
    SELECT p.id,p.user_id,p.ingredient_id,i.name AS ingredient_name,p.quantity,p.unit,p.expiry_date
    FROM PantryItems p JOIN Ingredients i ON i.id=p.ingredient_id
    WHERE p.user_id='local-user'
    ORDER BY p.expiry_date IS NULL,p.expiry_date,i.name
  `).all());
});

api.post("/pantry", (req, res) => {
  const { ingredient_id, quantity, unit, expiry_date = null } = req.body ?? {};
  if (!Number.isInteger(Number(ingredient_id)) || !Number.isFinite(Number(quantity)) ||
      Number(quantity) <= 0 || typeof unit !== "string" || !unit.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập nguyên liệu, số lượng dương và đơn vị hợp lệ." });
  }
  const ingredient = db.prepare("SELECT id FROM Ingredients WHERE id=?").get(Number(ingredient_id));
  if (!ingredient) return res.status(400).json({ error: "Nguyên liệu không tồn tại." });
  if (expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
    return res.status(400).json({ error: "Hạn sử dụng phải có định dạng YYYY-MM-DD." });
  }
  const result = db.prepare(`
    INSERT INTO PantryItems(user_id,ingredient_id,quantity,unit,expiry_date)
    VALUES('local-user',?,?,?,?)
  `).run(Number(ingredient_id), Number(quantity), unit.trim(), expiry_date || null);
  res.status(201).json(db.prepare(`
    SELECT p.id,p.ingredient_id,i.name AS ingredient_name,p.quantity,p.unit,p.expiry_date
    FROM PantryItems p JOIN Ingredients i ON i.id=p.ingredient_id WHERE p.id=?
  `).get(result.lastInsertRowid));
});

api.put("/pantry/:id", (req, res) => {
  const id = Number(req.params.id);
  const { ingredient_id, quantity, unit, expiry_date = null } = req.body ?? {};
  if (!Number.isInteger(id) || !Number.isInteger(Number(ingredient_id)) ||
      !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 ||
      typeof unit !== "string" || !unit.trim()) {
    return res.status(400).json({ error: "Thông tin cập nhật không hợp lệ." });
  }
  const ingredient = db.prepare("SELECT id FROM Ingredients WHERE id=?").get(Number(ingredient_id));
  if (!ingredient) return res.status(400).json({ error: "Nguyên liệu không tồn tại." });
  const result = db.prepare(`
    UPDATE PantryItems SET ingredient_id=?,quantity=?,unit=?,expiry_date=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id='local-user'
  `).run(Number(ingredient_id), Number(quantity), unit.trim(), expiry_date || null, id);
  if (!result.changes) return res.status(404).json({ error: "Không tìm thấy nguyên liệu trong kho." });
  res.json({ ok: true });
});

api.delete("/pantry/:id", (req, res) => {
  const result = db.prepare("DELETE FROM PantryItems WHERE id=? AND user_id='local-user'").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Không tìm thấy nguyên liệu trong kho." });
  res.status(204).end();
});

api.get("/recipes", (_req, res) => {
  const rows = db.prepare(`SELECT id,title,description,prep_minutes,cook_minutes,servings,ingredients_json,steps_json FROM Recipes ORDER BY title`).all();
  res.json(rows.map(row => ({
    id: row.id, title: row.title, description: row.description,
    prep_minutes: row.prep_minutes, cook_minutes: row.cook_minutes, servings: row.servings,
    ingredients: JSON.parse(row.ingredients_json), steps: JSON.parse(row.steps_json)
  })));
});

// Basic matching: compare required recipe quantities only when units match exactly.
// Cross-unit conversions are intentionally not guessed.
api.get("/suggestions", (_req, res) => {
  const pantry = db.prepare(`
    SELECT ingredient_id, SUM(quantity) AS quantity, unit, MIN(expiry_date) AS expiry_date
    FROM PantryItems WHERE user_id='local-user' GROUP BY ingredient_id,unit
  `).all();
  const recipes = db.prepare("SELECT * FROM Recipes").all();
  const today = new Date().toISOString().slice(0,10);
  const suggestions = recipes.map(recipe => {
    const ingredients = JSON.parse(recipe.ingredients_json);
    const required = ingredients.filter(i => i.required !== false);
    const present = [], missing = [];
    let urgentCount = 0;
    for (const item of ingredients) {
      const stock = pantry.find(p => p.ingredient_id === item.ingredient_id && p.unit === item.unit);
      const available = stock ? stock.quantity : 0;
      const line = {...item, available, shortfall: Math.max(0, item.quantity - available)};
      if (available >= item.quantity) present.push(line); else missing.push(line);
      if (stock?.expiry_date && stock.expiry_date >= today) {
        const days = (Date.parse(stock.expiry_date) - Date.parse(today)) / 86400000;
        if (days <= 3 && available > 0) urgentCount++;
      }
    }
    const requiredPresent = required.filter(item => {
      const stock = pantry.find(p => p.ingredient_id === item.ingredient_id && p.unit === item.unit);
      return stock && stock.quantity >= item.quantity;
    }).length;
    const matchPercent = required.length ? Math.round(requiredPresent / required.length * 100) : 0;
    return {
      id: recipe.id, title: recipe.title, description: recipe.description,
      prep_minutes: recipe.prep_minutes, cook_minutes: recipe.cook_minutes, servings: recipe.servings,
      ingredients, steps: JSON.parse(recipe.steps_json), present, missing, match_percent: matchPercent,
      urgent_ingredient_count: urgentCount
    };
  });
  suggestions.sort((a,b) => b.match_percent-a.match_percent ||
    b.urgent_ingredient_count-a.urgent_ingredient_count || a.title.localeCompare(b.title, "vi"));
  res.json(suggestions);
});

api.post("/recipes/:id/cook", (req, res) => {
  const recipe = db.prepare("SELECT * FROM Recipes WHERE id=?").get(Number(req.params.id));
  if (!recipe) return res.status(404).json({ error: "Không tìm thấy công thức." });
  const ingredients = JSON.parse(recipe.ingredients_json);
  const required = ingredients.filter(i => i.required !== false);
  const transaction = db.transaction(() => {
    const shortages = [];
    for (const item of required) {
      const row = db.prepare(`
        SELECT id,quantity FROM PantryItems
        WHERE user_id='local-user' AND ingredient_id=? AND unit=? AND quantity>0
        ORDER BY expiry_date IS NULL,expiry_date,id
      `).all(item.ingredient_id, item.unit);
      const total = row.reduce((sum, x) => sum + x.quantity, 0);
      if (total < item.quantity) shortages.push({name:item.name,needed:item.quantity,available:total,unit:item.unit});
    }
    if (shortages.length) return { shortages };
    for (const item of required) {
      let remaining = item.quantity;
      const row = db.prepare(`
        SELECT id,quantity FROM PantryItems
        WHERE user_id='local-user' AND ingredient_id=? AND unit=? AND quantity>0
        ORDER BY expiry_date IS NULL,expiry_date,id
      `).all(item.ingredient_id, item.unit);
      for (const stock of row) {
        if (remaining <= 0) break;
        const used = Math.min(remaining, stock.quantity);
        const next = stock.quantity - used;
        if (next <= 0) db.prepare("DELETE FROM PantryItems WHERE id=?").run(stock.id);
        else db.prepare("UPDATE PantryItems SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(next, stock.id);
        remaining -= used;
      }
    }
    return { ok: true };
  });
  const result = transaction();
  if (result.shortages) return res.status(409).json({ error: "Chưa đủ nguyên liệu bắt buộc để xác nhận đã nấu.", shortages: result.shortages });
  res.json({ ok: true, message: "Đã xác nhận nấu và cập nhật kho." });
});

app.use("/api", api);
app.get("*", (_req, res) => res.sendFile(path.resolve(__dirname, "../public/index.html")));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Đã xảy ra lỗi máy chủ." });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PantryChef listening on 0.0.0.0:${PORT}`);
    console.log(`Database path: ${getDatabasePath()}`);
  });
}

export { app };
