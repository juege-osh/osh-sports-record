import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT_DIR } from "../src/paths.js";

test("pages build script is configured", async () => {
  const script = await readFile(join(ROOT_DIR, "scripts", "build-pages.js"), "utf8");
  assert.match(script, /sports\.snapshot\.json/);
});

test("static frontend can fall back to snapshot data", async () => {
  const app = await readFile(join(ROOT_DIR, "public", "app.js"), "utf8");
  assert.match(app, /\/data\/sports\.snapshot\.json/);
  await access(join(ROOT_DIR, "data", "sports.snapshot.json"));
});
