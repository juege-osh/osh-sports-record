import test from "node:test";
import assert from "node:assert/strict";
import { findSport, getCategories, searchSports, setData } from "../src/lib/dataStore.js";

const fixture = {
  sports: [
    {
      id: "nba",
      nameZh: "NBA",
      nameEn: "National Basketball Association",
      category: "篮球",
      region: "美国",
      currentChampion: {
        winner: "俄克拉荷马城雷霆",
        winnerEn: "Oklahoma City Thunder"
      },
      historicalChampions: [],
      records: []
    },
    {
      id: "athletics",
      nameZh: "田径短跑世界纪录",
      category: "田径",
      records: [
        {
          event: "男子 100 米",
          value: "9.58 秒",
          holder: "尤塞恩·博尔特",
          holderEn: "Usain Bolt"
        }
      ]
    }
  ]
};

test("indexes sports by id", () => {
  setData(fixture);
  assert.equal(findSport("nba").nameZh, "NBA");
});

test("searches Chinese and English text", () => {
  setData(fixture);
  assert.equal(searchSports({ q: "雷霆" }).length, 1);
  assert.equal(searchSports({ q: "bolt" }).length, 1);
});

test("filters by category", () => {
  setData(fixture);
  assert.deepEqual(
    searchSports({ category: "田径" }).map((item) => item.id),
    ["athletics"]
  );
  assert.deepEqual(getCategories(), ["篮球", "田径"]);
});
