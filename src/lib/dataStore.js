import { readFile } from "node:fs/promises";
import { SNAPSHOT_PATH, SEED_PATH } from "../paths.js";

const collator = new Intl.Collator("zh-CN");

let state = null;
let index = {
  byId: new Map(),
  categories: []
};

export async function loadData() {
  const raw = await readFile(await selectDataPath(), "utf8");
  const parsed = JSON.parse(raw);
  setData(parsed);
  return state;
}

export function setData(data) {
  state = data;
  const byId = new Map();
  const categorySet = new Set();

  for (const sport of data.sports || []) {
    byId.set(sport.id, sport);
    if (sport.category) categorySet.add(sport.category);
  }

  index = {
    byId,
    categories: [...categorySet].sort(collator.compare)
  };
}

export function getData() {
  return state;
}

export function getCategories() {
  return index.categories;
}

export function findSport(id) {
  return index.byId.get(id);
}

export function searchSports({ q = "", category = "" } = {}) {
  const query = normalize(q);
  const categoryFilter = normalize(category);

  return [...index.byId.values()].filter((sport) => {
    if (categoryFilter && normalize(sport.category) !== categoryFilter) return false;
    if (!query) return true;
    return buildSearchText(sport).includes(query);
  });
}

function buildSearchText(sport) {
  const parts = [
    sport.id,
    sport.nameZh,
    sport.nameEn,
    sport.category,
    sport.region,
    sport.status,
    sport.currentChampion?.winner,
    sport.currentChampion?.winnerEn,
    ...(sport.historicalChampions || []).flatMap((item) => [item.season, item.winner, item.winnerEn]),
    ...(sport.records || []).flatMap((item) => [item.event, item.value, item.holder, item.holderEn, item.scope])
  ];
  return normalize(parts.filter(Boolean).join(" "));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function selectDataPath() {
  try {
    await readFile(SNAPSHOT_PATH, "utf8");
    return SNAPSHOT_PATH;
  } catch {
    return SEED_PATH;
  }
}
