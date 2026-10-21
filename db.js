import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const configuredPath = process.env.DATABASE_PATH || "./data/pantrychef.db";
const dbPath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(process.cwd(), configuredPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      category TEXT NOT NULL DEFAULT 'Khác',
      canonical_unit TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(length(trim(name)) > 0),
      CHECK(length(trim(canonical_unit)) > 0)
    );

    CREATE TABLE IF NOT EXISTS PantryItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL CHECK(quantity >= 0),
      unit TEXT NOT NULL,
      expiry_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(ingredient_id) REFERENCES Ingredients(id) ON DELETE RESTRICT,
      CHECK(length(trim(unit)) > 0)
    );

    CREATE TABLE IF NOT EXISTS Recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      prep_minutes INTEGER NOT NULL DEFAULT 0 CHECK(prep_minutes >= 0),
      cook_minutes INTEGER NOT NULL DEFAULT 0 CHECK(cook_minutes >= 0),
      servings INTEGER NOT NULL DEFAULT 1 CHECK(servings > 0),
      ingredients_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(ingredients_json)),
      steps_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(steps_json)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(length(trim(title)) > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_pantry_user_expiry ON PantryItems(user_id, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_pantry_ingredient ON PantryItems(ingredient_id);
  `);

  if (db.prepare("SELECT COUNT(*) AS n FROM Ingredients").get().n === 0) {
    const insert = db.prepare("INSERT INTO Ingredients(name,category,canonical_unit) VALUES(?,?,?)");
    const seed = db.transaction(() => {
      [
        ["Trứng", "Đạm", "quả"], ["Cà chua", "Rau củ", "quả"],
        ["Đậu phụ", "Đạm", "bìa"], ["Hành lá", "Rau củ", "g"],
        ["Dầu ăn", "Gia vị", "ml"], ["Nước mắm", "Gia vị", "ml"],
        ["Tỏi", "Gia vị", "tép"], ["Gạo", "Tinh bột", "g"]
      ].forEach(row => insert.run(...row));
    });
    seed();
  }

  if (db.prepare("SELECT COUNT(*) AS n FROM Recipes").get().n === 0) {
    const ids = Object.fromEntries(
      db.prepare("SELECT id,name FROM Ingredients").all().map(x => [x.name, x.id])
    );
    const insert = db.prepare(`INSERT INTO Recipes
      (title,description,prep_minutes,cook_minutes,servings,ingredients_json,steps_json)
      VALUES(?,?,?,?,?,?,?)`);
    const seed = db.transaction(() => {
      insert.run("Trứng xào cà chua", "Món nhanh, dễ làm cho bữa cơm hằng ngày.", 5, 8, 2,
        JSON.stringify([
          {ingredient_id:ids["Trứng"],name:"Trứng",quantity:2,unit:"quả",required:true},
          {ingredient_id:ids["Cà chua"],name:"Cà chua",quantity:2,unit:"quả",required:true},
          {ingredient_id:ids["Hành lá"],name:"Hành lá",quantity:10,unit:"g",required:false},
          {ingredient_id:ids["Dầu ăn"],name:"Dầu ăn",quantity:10,unit:"ml",required:true}
        ]),
        JSON.stringify(["Đánh trứng, rửa và cắt cà chua.","Làm nóng dầu, xào cà chua đến mềm.","Cho trứng vào đảo chín, nêm vừa ăn và thêm hành lá."]));
      insert.run("Đậu phụ sốt cà chua", "Món ăn thanh nhẹ, hợp dùng với cơm nóng.", 8, 12, 2,
        JSON.stringify([
          {ingredient_id:ids["Đậu phụ"],name:"Đậu phụ",quantity:2,unit:"bìa",required:true},
          {ingredient_id:ids["Cà chua"],name:"Cà chua",quantity:2,unit:"quả",required:true},
          {ingredient_id:ids["Tỏi"],name:"Tỏi",quantity:2,unit:"tép",required:false},
          {ingredient_id:ids["Dầu ăn"],name:"Dầu ăn",quantity:15,unit:"ml",required:true}
        ]),
        JSON.stringify(["Cắt đậu phụ thành miếng vừa ăn; bổ múi cà chua.","Chiên áp chảo đậu phụ đến vàng nhẹ.","Phi thơm tỏi, xào cà chua, thêm ít nước rồi cho đậu vào sốt khoảng 5 phút."]));
    });
    seed();
  }
}

export function getDatabasePath() {
  return dbPath;
}
