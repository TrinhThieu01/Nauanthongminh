import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pantrychef-test-"));
const port = 3100 + Math.floor(Math.random() * 1000);
const env = { ...process.env, PORT: String(port), DATABASE_PATH: path.join(tempDir, "test.db") };
let server;

test("PantryChef API smoke + CRUD + matching + cook workflow", async (t) => {
  server = spawn(process.execPath, ["src/server.js"], { cwd: process.cwd(), env, stdio: "ignore" });
  t.after(() => { server?.kill(); fs.rmSync(tempDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i=0;i<60;i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  assert.equal(ready, true, "server should start");
  assert.equal((await (await fetch(`${base}/api/health`)).json()).status, "ok");

  const ingredients = await (await fetch(`${base}/api/ingredients`)).json();
  assert.ok(ingredients.length >= 5);
  const eggs = ingredients.find(x => x.name === "Trứng");
  const tomatoes = ingredients.find(x => x.name === "Cà chua");
  assert.ok(eggs && tomatoes);

  let r = await fetch(`${base}/api/pantry`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ingredient_id:eggs.id,quantity:4,unit:"quả",expiry_date:"2099-01-01"}) });
  assert.equal(r.status,201);
  const eggItem = await r.json();
  assert.equal(eggItem.quantity,4);

  r = await fetch(`${base}/api/pantry`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ingredient_id:tomatoes.id,quantity:2,unit:"quả",expiry_date:"2099-01-01"}) });
  assert.equal(r.status,201);

  let pantry = await (await fetch(`${base}/api/pantry`)).json();
  assert.equal(pantry.length,2);

  const suggestions = await (await fetch(`${base}/api/suggestions`)).json();
  assert.ok(suggestions.some(x => x.title === "Trứng xào cà chua"));
  const eggRecipe = suggestions.find(x => x.title === "Trứng xào cà chua");
  assert.ok(eggRecipe.match_percent > 0);

  r = await fetch(`${base}/api/pantry/${eggItem.id}`, { method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({ingredient_id:eggs.id,quantity:5,unit:"quả",expiry_date:"2099-01-01"}) });
  assert.equal(r.status,200);

  const recipes = await (await fetch(`${base}/api/recipes`)).json();
  const recipe = recipes.find(x => x.title === "Trứng xào cà chua");
  r = await fetch(`${base}/api/recipes/${recipe.id}/cook`, { method:"POST", headers:{"content-type":"application/json"}, body:"{}" });
  assert.equal(r.status,200);

  pantry = await (await fetch(`${base}/api/pantry`)).json();
  const remainingEggs = pantry.find(x => x.ingredient_name === "Trứng");
  assert.equal(remainingEggs.quantity,3);

  r = await fetch(`${base}/api/pantry/${eggItem.id}`, { method:"DELETE" });
  assert.equal(r.status,204);
  assert.ok(fs.existsSync(path.join(tempDir,"test.db")));
});
