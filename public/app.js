const els = {
  ring: document.querySelector("#score-ring"),
  score: document.querySelector("#score-value"),
  level: document.querySelector("#level-label"),
  levelSummary: document.querySelector("#level-summary"),
  statusDot: document.querySelector("#status-dot"),
  confidence: document.querySelector("#confidence-value"),
  baseScore: document.querySelector("#base-score"),
  eventOverlay: document.querySelector("#event-overlay"),
  indicatorGrid: document.querySelector("#indicator-grid"),
  eventList: document.querySelector("#event-list"),
  historyChart: document.querySelector("#history-chart"),
  historyWarning: document.querySelector("#history-warning"),
  availableCount: document.querySelector("#available-count"),
  staleCount: document.querySelector("#stale-count"),
  generatedAt: document.querySelector("#generated-at"),
  prototypeNotice: document.querySelector("#prototype-notice")
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDateFormatter = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value, formatter = dateFormatter) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : formatter.format(date);
}

function formatIndicatorValue(indicator) {
  if (!indicator.available) return "Unavailable";
  const value = Number(indicator.value);
  if (indicator.display === "percent") return `${value.toFixed(1)}%`;
  if (indicator.display === "integer") return Math.round(value).toLocaleString("en-GB");
  return value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function scoreColour(score) {
  if (score < 25) return "#2fb171";
  if (score < 40) return "#8dbb3e";
  if (score < 55) return "#e0a11b";
  if (score < 70) return "#e06a2c";
  if (score < 85) return "#d64242";
  return "#8e2635";
}

function renderHeadline(data) {
  const colour = data.level?.colour ?? scoreColour(data.score);
  els.ring.style.setProperty("--score", String(data.score));
  els.ring.style.setProperty("--level-colour", colour);
  els.statusDot.style.background = colour;
  els.statusDot.style.boxShadow = `0 0 16px ${colour}`;
  els.score.textContent = Number(data.score).toFixed(1);
  els.level.textContent = data.headlineEligible ? data.level.label : `${data.level.label} · low confidence`;
  els.levelSummary.textContent = data.level.summary;
  els.confidence.textContent = `${Math.round(data.confidence * 100)}%`;
  els.baseScore.textContent = Number(data.baseScore).toFixed(1);
  els.eventOverlay.textContent = `+${Number(data.eventOverlay).toFixed(1)}`;
  els.availableCount.textContent = `${data.dataQuality.available}/${data.dataQuality.total}`;
  els.staleCount.textContent = String(data.dataQuality.stale.length);
  els.generatedAt.textContent = formatDate(data.generatedAt);

  if (data.mode === "live") {
    els.prototypeNotice.classList.add("live");
    els.prototypeNotice.innerHTML = "<strong>Live data mode.</strong> Indicator values are being read from the configured D1 evidence store.";
  }
}

function renderIndicators(indicators) {
  els.indicatorGrid.innerHTML = indicators.map((indicator, index) => {
    const colour = indicator.available ? scoreColour(indicator.score) : "#6b788a";
    const freshness = escapeHtml(indicator.freshness);
    return `
      <article class="indicator-card">
        <div class="indicator-top">
          <span class="indicator-number">${String(index + 1).padStart(2, "0")}</span>
          <span class="freshness ${freshness}">${freshness.replaceAll("-", " ")}</span>
        </div>
        <h3>${escapeHtml(indicator.title)}</h3>
        <p class="description">${escapeHtml(indicator.description ?? "No description available.")}</p>
        <div class="indicator-value-row">
          <strong class="indicator-value">${escapeHtml(formatIndicatorValue(indicator))}</strong>
          <span class="indicator-score">pressure<br><strong>${indicator.available ? Number(indicator.score).toFixed(1) : "—"}/100</strong></span>
        </div>
        <div class="pressure-bar" style="--indicator-score: ${indicator.available ? indicator.score : 0}%; --indicator-colour: ${colour}"><span></span></div>
        <div class="indicator-foot">
          <span>Observed ${indicator.observedAt ? escapeHtml(formatDate(indicator.observedAt)) : "—"}</span>
          <a href="${escapeHtml(indicator.source?.url ?? "#")}" rel="noopener">${escapeHtml(indicator.source?.name ?? "Source")}</a>
        </div>
      </article>`;
  }).join("");
}

function renderEvents(events) {
  if (!events?.length) {
    els.eventList.innerHTML = '<p class="description">No reviewed events are active.</p>';
    return;
  }

  els.eventList.innerHTML = events.map((event) => `
    <article class="event-item">
      <h3>${escapeHtml(event.title)}</h3>
      <p>${escapeHtml(event.summary)}</p>
      <div class="event-meta">${escapeHtml(event.category)} · contribution ${Number(event.contribution ?? 0).toFixed(2)} points · ${escapeHtml(event.reviewStatus)}</div>
    </article>`).join("");
}

function linePath(points, width, height, padding) {
  const minX = padding.left;
  const maxX = width - padding.right;
  const minY = padding.top;
  const maxY = height - padding.bottom;
  return points.map((point, index) => {
    const x = minX + ((index / Math.max(1, points.length - 1)) * (maxX - minX));
    const y = maxY - ((Number(point.score) / 100) * (maxY - minY));
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function areaPath(points, width, height, padding) {
  const line = linePath(points, width, height, padding);
  const bottom = height - padding.bottom;
  return `${line} L${width - padding.right},${bottom} L${padding.left},${bottom} Z`;
}

function renderHistory(history) {
  const points = history.points ?? [];
  els.historyWarning.textContent = history.warning ?? "Calculated daily snapshots from the published methodology.";
  if (points.length < 2) {
    els.historyChart.textContent = "Not enough historical data yet.";
    return;
  }

  const width = 1080;
  const height = 390;
  const padding = { top: 18, right: 24, bottom: 44, left: 52 };
  const gridLines = [0, 25, 50, 75, 100].map((value) => {
    const y = height - padding.bottom - ((value / 100) * (height - padding.top - padding.bottom));
    return `<g><line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(16,25,35,.12)"/><text x="8" y="${y + 4}" fill="#687684" font-size="12">${value}</text></g>`;
  }).join("");

  const years = [];
  let previousYear = null;
  points.forEach((point, index) => {
    const year = new Date(point.date).getUTCFullYear();
    if (year !== previousYear) {
      const x = padding.left + ((index / Math.max(1, points.length - 1)) * (width - padding.left - padding.right));
      years.push(`<text x="${x}" y="${height - 12}" text-anchor="middle" fill="#687684" font-size="12">${year}</text>`);
      previousYear = year;
    }
  });

  const path = linePath(points, width, height, padding);
  const area = areaPath(points, width, height, padding);
  const finalPoint = points.at(-1);
  const finalX = width - padding.right;
  const finalY = height - padding.bottom - ((Number(finalPoint.score) / 100) * (height - padding.top - padding.bottom));

  els.historyChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d64242" stop-opacity=".24"/>
          <stop offset="1" stop-color="#d64242" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${area}" fill="url(#areaFill)"/>
      <path d="${path}" fill="none" stroke="#b83b44" stroke-width="3" vector-effect="non-scaling-stroke"/>
      <circle cx="${finalX}" cy="${finalY}" r="6" fill="#b83b44" vector-effect="non-scaling-stroke"/>
      ${years.join("")}
    </svg>`;
  els.historyChart.setAttribute("aria-label", `Illustrative UK stress history from ${shortDateFormatter.format(new Date(points[0].date))} to ${shortDateFormatter.format(new Date(finalPoint.date))}; latest score ${finalPoint.score}.`);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function start() {
  try {
    const [index, history] = await Promise.all([
      fetchJson("/api/v1/index"),
      fetchJson("/api/v1/history")
    ]);
    renderHeadline(index);
    renderIndicators(index.indicators);
    renderEvents(index.events);
    renderHistory(history);
  } catch (error) {
    console.error(error);
    els.level.textContent = "Data unavailable";
    els.levelSummary.textContent = "The dashboard could not load its API. Check the service health endpoint.";
    els.indicatorGrid.innerHTML = '<article class="indicator-card"><h3>Unable to load evidence</h3><p class="description">Try the health endpoint at /api/v1/health.</p></article>';
    els.eventList.innerHTML = '<p class="description">No event data available.</p>';
    els.historyWarning.textContent = "Historical data unavailable.";
  }
}

start();
