import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SEED_PATH } from "../src/paths.js";
import { collectSourceUrls } from "../src/refresh.js";

test("seed data has stable ids and sources", async () => {
  const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));
  const ids = new Set();

  assert.ok(seed.sports.length >= 20);

  for (const sport of seed.sports) {
    assert.ok(sport.id, "sport id is required");
    assert.ok(!ids.has(sport.id), `duplicate sport id: ${sport.id}`);
    ids.add(sport.id);
    assert.ok(sport.nameZh, `${sport.id} nameZh is required`);
    assert.ok(sport.category, `${sport.id} category is required`);
    assert.ok(Array.isArray(sport.sources), `${sport.id} sources must be an array`);

    if (sport.currentChampion) {
      assert.ok(sport.currentChampion.winner, `${sport.id} champion winner is required`);
      assert.ok(sport.currentChampion.season, `${sport.id} champion season is required`);
      assert.ok(sport.currentChampion.sources?.length, `${sport.id} champion source is required`);
    }

    for (const record of sport.records || []) {
      assert.ok(record.event, `${sport.id} record event is required`);
      assert.ok(record.value, `${sport.id} record value is required`);
      assert.ok(record.holder, `${sport.id} record holder is required`);
      assert.ok(record.sources?.length, `${sport.id} record source is required`);
    }
  }

  const sources = collectSourceUrls(seed);
  assert.ok(sources.length >= 15);
  for (const source of sources) {
    assert.match(source.url, /^https:\/\//);
  }
});
