import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { HOST, PORT, REFRESH_INTERVAL_MS } from "./config.js";
import { PUBLIC_DIR } from "./paths.js";
import { findSport, getCategories, getData, loadData, searchSports, setData } from "./lib/dataStore.js";
import { methodNotAllowed, notFound, sendJson, sendText } from "./lib/http.js";
import { refreshData } from "./refresh.js";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

let refreshing = null;

await loadData();
scheduleRefresh();

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "internal_server_error", message: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`OSH Sports Record listening on http://${HOST}:${PORT}`);
});

async function route(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      generatedAt: getData()?.generatedAt,
      sports: getData()?.sports?.length || 0
    });
  }

  if (url.pathname === "/api/meta") {
    const data = getData();
    return sendJson(res, 200, {
      generatedAt: data.generatedAt,
      refresh: data.refresh || null,
      categories: getCategories(),
      total: data.sports.length
    });
  }

  if (url.pathname === "/api/sports") {
    const items = searchSports({
      q: url.searchParams.get("q") || "",
      category: url.searchParams.get("category") || ""
    }).map(toListItem);
    return sendJson(res, 200, { items, total: items.length });
  }

  if (url.pathname.startsWith("/api/sports/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/sports/".length));
    const sport = findSport(id);
    if (!sport) return notFound(res);
    return sendJson(res, 200, sport);
  }

  if (url.pathname === "/api/refresh") {
    if (req.method !== "POST") return methodNotAllowed(res);
    const result = await runRefresh();
    return sendJson(res, 200, result.stats);
  }

  return serveStatic(url.pathname, res);
}

function scheduleRefresh() {
  setTimeout(() => {
    runRefresh()
      .catch((error) => console.error("scheduled refresh failed", error))
      .finally(scheduleRefresh);
  }, REFRESH_INTERVAL_MS).unref();
}

async function runRefresh() {
  if (!refreshing) {
    refreshing = refreshData()
      .then((result) => {
        setData(result.data);
        return result;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function toListItem(sport) {
  return {
    id: sport.id,
    nameZh: sport.nameZh,
    nameEn: sport.nameEn,
    category: sport.category,
    region: sport.region,
    status: sport.status,
    currentChampion: sport.currentChampion
      ? {
          season: sport.currentChampion.season,
          winner: sport.currentChampion.winner,
          winnerEn: sport.currentChampion.winnerEn,
          note: sport.currentChampion.note,
          sources: sport.currentChampion.sources || []
        }
      : null,
    recordCount: sport.records?.length || 0,
    historyCount: sport.historicalChampions?.length || 0,
    needsReview: Boolean(sport.needsReview)
  };
}

async function serveStatic(pathname, res) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(join(PUBLIC_DIR, requestPath));
  const publicRoot = resolve(PUBLIC_DIR);

  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) return notFound(res);

  try {
    const body = await readFile(filePath);
    sendText(res, 200, body, mimeTypes[extname(filePath)] || "application/octet-stream");
  } catch {
    notFound(res);
  }
}
