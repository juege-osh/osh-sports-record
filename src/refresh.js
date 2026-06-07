import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { REFRESH_INTERVAL_MS, REQUEST_TIMEOUT_MS, SOURCE_BODY_LIMIT_BYTES, SOURCE_CONCURRENCY } from "./config.js";
import { DATA_DIR, SEED_PATH, SNAPSHOT_PATH } from "./paths.js";

export async function refreshData({ checkOnly = false } = {}) {
  const startedAt = new Date();
  const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));
  const urls = collectSourceUrls(seed);
  const sourceStatuses = await checkSources(urls);
  const reviewed = applySourceStatuses(seed, sourceStatuses, startedAt);

  if (!checkOnly) {
    await mkdir(DATA_DIR, { recursive: true });
    const tmpPath = join(DATA_DIR, `${basename(SNAPSHOT_PATH)}.tmp`);
    await writeFile(tmpPath, `${JSON.stringify(reviewed, null, 2)}\n`);
    await rename(tmpPath, SNAPSHOT_PATH);
  }

  return {
    data: reviewed,
    stats: summarize(reviewed, sourceStatuses)
  };
}

export function collectSourceUrls(data) {
  const urls = new Map();
  const add = (source, markerGroups = []) => {
    if (!source?.url) return;
    if (!urls.has(source.url)) {
      urls.set(source.url, {
        url: source.url,
        title: source.title || source.url,
        markerGroups: []
      });
    }
    urls.get(source.url).markerGroups.push(...markerGroups);
  };

  for (const sport of data.sports || []) {
    for (const source of sport.sources || []) add(source);
    for (const source of sport.currentChampion?.sources || []) add(source, championMarkers(sport.currentChampion));
    for (const record of sport.records || []) {
      for (const source of record.sources || []) add(source, recordMarkers(record));
    }
  }

  return [...urls.values()].map((source) => ({
    ...source,
    markerGroups: dedupeMarkerGroups(source.markerGroups)
  }));
}

export async function checkSources(sources) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(SOURCE_CONCURRENCY, sources.length || 1) }, async () => {
    while (cursor < sources.length) {
      const source = sources[cursor++];
      results.push(await checkSource(source));
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => a.url.localeCompare(b.url));
}

async function checkSource(source) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(source.url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "osh-sports-record/0.1 (+https://github.com/juege-osh/osh-sports-record)",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
      },
      signal: controller.signal
    });

    const body = await readLimitedText(response, SOURCE_BODY_LIMIT_BYTES);
    const bodySearch = normalizeForSearch(body);
    const markerReport = checkMarkers(bodySearch, source.markerGroups || []);

    return {
      ...source,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      bodySearch,
      contentBytesRead: Buffer.byteLength(body),
      contentHash: await sha256(body),
      markerStatus: markerReport.status,
      matchedMarkers: markerReport.matched,
      missingMarkers: markerReport.missing,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ...source,
      ok: false,
      status: 0,
      error: error.name === "AbortError" ? "timeout" : error.message,
      markerStatus: "unverified",
      matchedMarkers: [],
      missingMarkers: source.markerGroups || [],
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timer);
  }
}

function applySourceStatuses(data, sourceStatuses, startedAt) {
  const statusMap = new Map(sourceStatuses.map((item) => [item.url, item]));
  const annotate = (source, markerGroups = []) => {
    const status = statusMap.get(source.url);
    const markerReport = status?.ok && status.bodySearch
      ? checkMarkers(status.bodySearch, markerGroups)
      : {
          status: markerGroups.length ? "unverified" : "unverified",
          matched: [],
          missing: markerGroups
        };
    return {
      ...source,
      lastCheckedAt: status?.checkedAt || startedAt.toISOString(),
      httpStatus: status?.status ?? null,
      reachable: Boolean(status?.ok),
      finalUrl: status?.finalUrl || source.url,
      markerStatus: markerReport.status,
      missingMarkers: markerReport.missing || []
    };
  };

  return {
    ...data,
    generatedAt: startedAt.toISOString(),
    refresh: {
      intervalMs: REFRESH_INTERVAL_MS,
      checkedAt: new Date().toISOString(),
      sourceCount: sourceStatuses.length,
      reachableCount: sourceStatuses.filter((item) => item.ok).length,
      failedCount: sourceStatuses.filter((item) => !item.ok).length
    },
    sports: (data.sports || []).map((sport) => {
      const sources = (sport.sources || []).map((source) => annotate(source));
      const championSources = (sport.currentChampion?.sources || []).map((source) =>
        annotate(source, championMarkers(sport.currentChampion))
      );
      const records = (sport.records || []).map((record) => {
        const recordSources = (record.sources || []).map((source) => annotate(source, recordMarkers(record)));
        return {
          ...record,
          sources: recordSources,
          needsReview: recordSources.some((source) => !source.reachable || source.markerStatus === "stale")
        };
      });

      return {
        ...sport,
        sources,
        currentChampion: sport.currentChampion
          ? {
              ...sport.currentChampion,
              sources: championSources,
              needsReview: championSources.some((source) => !source.reachable || source.markerStatus === "stale")
            }
          : null,
        records,
        needsReview:
          sources.some((source) => !source.reachable) ||
          championSources.some((source) => !source.reachable || source.markerStatus === "stale") ||
          records.some((record) => record.needsReview)
      };
    })
  };
}

function summarize(data, sourceStatuses) {
  const contentIssues = data.sports.reduce((sum, sport) => {
    const championIssue = sport.currentChampion?.sources?.some(
      (source) => source.reachable && source.markerStatus === "stale"
    )
      ? 1
      : 0;
    const recordIssues = (sport.records || []).filter((record) =>
      record.sources?.some((source) => source.reachable && source.markerStatus === "stale")
    ).length;
    return sum + championIssue + recordIssues;
  }, 0);

  return {
    sports: data.sports.length,
    champions: data.sports.filter((sport) => sport.currentChampion).length,
    records: data.sports.reduce((sum, sport) => sum + (sport.records?.length || 0), 0),
    sources: sourceStatuses.length,
    sourceFailures: sourceStatuses.filter((item) => !item.ok).length,
    contentIssues,
    generatedAt: data.generatedAt
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const checkOnly = process.argv.includes("--check");
  const verbose = process.argv.includes("--verbose");
  const { data, stats } = await refreshData({ checkOnly });
  console.log(JSON.stringify(stats, null, 2));
  if (verbose) {
    const issues = [];
    for (const sport of data.sports) {
      if (sport.needsReview) {
        const recordSources = (sport.records || [])
          .flatMap((record) =>
            (record.sources || []).map((source) => ({
              record: record.event,
              source
            }))
          )
          .filter(({ source }) => !source.reachable || source.markerStatus === "stale")
          .map(({ record, source }) => ({
            record,
            url: source.url,
            reachable: source.reachable,
            markerStatus: source.markerStatus,
            missingMarkers: source.missingMarkers?.map((marker) => marker.label) || []
          }));
        issues.push({
          id: sport.id,
          sources: (sport.sources || [])
            .concat(sport.currentChampion?.sources || [])
            .filter((source) => !source.reachable || source.markerStatus === "stale")
            .map((source) => ({
              url: source.url,
              reachable: source.reachable,
              markerStatus: source.markerStatus,
              missingMarkers: source.missingMarkers?.map((marker) => marker.label) || []
            })),
          recordSources
        });
      }
    }
    console.log(JSON.stringify({ issues }, null, 2));
  }
}

async function readLimitedText(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - total;
      const slice = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(decoder.decode(slice, { stream: total + slice.byteLength < maxBytes }));
      total += slice.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}

function checkMarkers(body, markerGroups) {
  const groups = dedupeMarkerGroups(markerGroups);
  if (!groups.length) return { status: "unverified", matched: [], missing: [] };

  const haystack = normalizeForSearch(body);
  const matched = [];
  const missing = [];

  for (const group of groups) {
    const found = group.anyOf.some((marker) => haystack.includes(normalizeForSearch(marker)));
    if (found) matched.push(group);
    else missing.push(group);
  }

  return {
    status: missing.length ? "stale" : "verified",
    matched,
    missing
  };
}

function championMarkers(champion) {
  if (!champion) return [];
  return [
    {
      label: `当前冠军：${champion.winner}`,
      anyOf: compact([champion.winnerEn, champion.winner])
    }
  ].filter((group) => group.anyOf.length);
}

function recordMarkers(record) {
  return [
    {
      label: `${record.event} 保持者`,
      anyOf: compact([record.holderEn, record.holder])
    },
    {
      label: `${record.event} 成绩`,
      anyOf: compact([record.value])
    }
  ].filter((group) => group.anyOf.length);
}

async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

function compact(values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function dedupeMarkerGroups(groups) {
  const seen = new Set();
  const result = [];
  for (const group of groups || []) {
    const anyOf = compact(group.anyOf);
    if (!anyOf.length) continue;
    const key = `${group.label}:${anyOf.join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ label: group.label, anyOf });
  }
  return result;
}

function normalizeForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
