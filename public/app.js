const state = {
  meta: null,
  sports: [],
  allSports: [],
  q: "",
  category: "",
  apiAvailable: true
};

const metaEl = document.querySelector("#meta");
const summaryEl = document.querySelector("#summary");
const gridEl = document.querySelector("#sportsGrid");
const searchInput = document.querySelector("#searchInput");
const categorySelect = document.querySelector("#categorySelect");
const refreshButton = document.querySelector("#refreshButton");
const dialog = document.querySelector("#detailDialog");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogSubTitle = document.querySelector("#dialogSubTitle");
const dialogBody = document.querySelector("#dialogBody");

document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
searchInput.addEventListener("input", () => {
  state.q = searchInput.value;
  loadSports();
});
categorySelect.addEventListener("change", () => {
  state.category = categorySelect.value;
  loadSports();
});
refreshButton.addEventListener("click", refreshNow);

await loadMeta();
await loadSports();

async function loadMeta() {
  try {
    state.meta = await fetchJson("/api/meta");
  } catch {
    state.apiAvailable = false;
    const snapshot = await fetchJson("/data/sports.snapshot.json");
    state.allSports = snapshot.sports || [];
    state.meta = {
      generatedAt: snapshot.generatedAt,
      refresh: snapshot.refresh || null,
      categories: [...new Set(state.allSports.map((sport) => sport.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "zh-CN")
      ),
      total: state.allSports.length
    };
  }

  const mode = state.apiAvailable ? "每小时自动更新" : "静态快照";
  metaEl.textContent = `数据更新时间：${formatTime(state.meta.generatedAt)}，共 ${state.meta.total} 个项目，${mode}`;

  categorySelect.innerHTML = `<option value="">全部分类</option>${state.meta.categories
    .map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;
}

async function loadSports() {
  if (!state.apiAvailable) {
    const items = filterSnapshotSports().map(toSnapshotListItem);
    state.sports = items;
    renderSummary(items);
    renderGrid(items);
    return;
  }

  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.category) params.set("category", state.category);
  const data = await fetchJson(`/api/sports?${params}`);
  state.sports = data.items;
  renderSummary(data.items);
  renderGrid(data.items);
}

function renderSummary(items) {
  const championCount = items.filter((item) => item.currentChampion).length;
  const recordCount = items.reduce((sum, item) => sum + item.recordCount, 0);
  const reviewCount = items.filter((item) => item.needsReview).length;
  summaryEl.innerHTML = [
    metric("项目", items.length),
    metric("当前冠军", championCount),
    metric("世界纪录", recordCount),
    metric("需复核来源", reviewCount)
  ].join("");
}

function renderGrid(items) {
  if (!items.length) {
    gridEl.innerHTML = `<p class="muted">没有匹配的数据。</p>`;
    return;
  }

  gridEl.innerHTML = items
    .map(
      (sport) => `
        <article class="card">
          <div class="cardHeader">
            <div>
              <h2>${escapeHtml(sport.nameZh)}</h2>
              <p class="muted">${escapeHtml(sport.nameEn || "")}</p>
            </div>
            <span class="tag">${escapeHtml(sport.category)}</span>
          </div>
          <p class="status">${escapeHtml(sport.status || "")}</p>
          ${renderChampion(sport.currentChampion)}
          <div class="sourceLinks">${renderSources(sport.currentChampion?.sources || [])}</div>
          <div class="cardFooter">
            <span class="muted">${sport.historyCount} 条历史冠军 · ${sport.recordCount} 条纪录</span>
            ${sport.needsReview ? `<span class="review">来源需复核</span>` : ""}
            <button type="button" data-id="${escapeAttr(sport.id)}">详情</button>
          </div>
        </article>
      `
    )
    .join("");

  gridEl.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.id));
  });
}

async function openDetail(id) {
  const sport = state.apiAvailable
    ? await fetchJson(`/api/sports/${encodeURIComponent(id)}`)
    : state.allSports.find((item) => item.id === id);
  if (!sport) return;
  dialogTitle.textContent = sport.nameZh;
  dialogSubTitle.textContent = `${sport.nameEn || ""} · ${sport.category} · ${sport.region || ""}`;
  dialogBody.innerHTML = `
    <p>${escapeHtml(sport.status || "")}</p>
    <div class="section">
      <h3>当前冠军</h3>
      ${sport.currentChampion ? renderChampion(sport.currentChampion) : `<p class="muted">该项目暂无冠军口径。</p>`}
      <div class="sourceLinks">${renderSources(sport.currentChampion?.sources || [])}</div>
    </div>
    <div class="section">
      <h3>历史冠军</h3>
      ${renderHistoryTable(sport.historicalChampions || [])}
    </div>
    <div class="section">
      <h3>世界纪录</h3>
      ${renderRecordsTable(sport.records || [])}
    </div>
    <div class="section">
      <h3>项目来源</h3>
      <div class="sourceLinks">${renderSources(sport.sources || [])}</div>
    </div>
  `;
  dialog.showModal();
}

async function refreshNow() {
  if (!state.apiAvailable) {
    await loadMeta();
    await loadSports();
    return;
  }

  refreshButton.disabled = true;
  refreshButton.textContent = "刷新中...";
  try {
    await fetchJson("/api/refresh", { method: "POST" });
    await loadMeta();
    await loadSports();
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "立即刷新";
  }
}

function metric(label, value) {
  return `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`;
}

function filterSnapshotSports() {
  const q = state.q.trim().toLowerCase();
  const category = state.category.trim();

  return state.allSports.filter((sport) => {
    if (category && sport.category !== category) return false;
    if (!q) return true;
    return buildSearchText(sport).includes(q);
  });
}

function toSnapshotListItem(sport) {
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

function buildSearchText(sport) {
  return [
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
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderChampion(champion) {
  if (!champion) return `<div class="champion"><span class="muted">暂无冠军口径</span></div>`;
  return `
    <div class="champion">
      <span class="muted">${escapeHtml(champion.season || "")}</span>
      <strong>${escapeHtml(champion.winner || "")}</strong>
      <span>${escapeHtml(champion.winnerEn || "")}</span>
      ${champion.note ? `<p class="muted">${escapeHtml(champion.note)}</p>` : ""}
    </div>
  `;
}

function renderHistoryTable(items) {
  if (!items.length) return `<p class="muted">暂无历史冠军数据。</p>`;
  return `
    <table>
      <thead><tr><th>赛季/年份</th><th>冠军</th><th>英文名</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.season)}</td><td>${escapeHtml(item.winner)}</td><td>${escapeHtml(item.winnerEn || "")}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderRecordsTable(items) {
  if (!items.length) return `<p class="muted">暂无世界纪录数据。</p>`;
  return `
    <table>
      <thead><tr><th>项目</th><th>成绩</th><th>保持者</th><th>日期/地点</th><th>来源</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.event)}<br><span class="muted">${escapeHtml(item.scope || "")}</span></td>
                <td>${escapeHtml(item.value)}</td>
                <td>${escapeHtml(item.holder)}<br><span class="muted">${escapeHtml(item.holderEn || "")}</span></td>
                <td>${escapeHtml(item.date || "")}<br><span class="muted">${escapeHtml(item.venue || "")}</span></td>
                <td>${renderSources(item.sources || [])}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSources(sources) {
  if (!sources.length) return `<span class="muted">暂无来源</span>`;
  return sources
    .map((source) => {
      const label = source.reachable === false ? `${source.title || "来源"} · 待复核` : source.title || "来源";
      return `<a href="${escapeAttr(source.finalUrl || source.url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
    })
    .join("");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function formatTime(value) {
  if (!value) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
