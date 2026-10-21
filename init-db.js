import "dotenv/config";
import { initDb, getDatabasePath, db } from "../src/db.js";
initDb();
console.log(`Database initialized at ${getDatabasePath()}`);
console.log("Ingredients:", db.prepare("SELECT COUNT(*) AS n FROM Ingredients").get().n);
console.log("Recipes:", db.prepare("SELECT COUNT(*) AS n FROM Recipes").get().n);
db.close();
