/**
 * Dashboard rendering.
 *
 * The interface's job is to make incompleteness legible. Where a value is
 * missing, the card says why; where the headline is withheld, the panel says on
 * what condition it would be published.
 */

const el = (id) => document.getElementById(id);

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

function text(node, value) {
  node.textContent = value;
}

/** Everything rendered from API data goes through element creation, never HTML strings. */
function create(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function pressureColour(pressure) {
  if (pressure === null || pressure === undefined) return "#6b788a";
  if (pressure < 25) return "#2f8f5b";
  if (pressure < 40) return "#6f9c33";
  if (pressure < 55) return "#c8901a";
  if (pressure < 70) return "#cc5f26";
  if (pressure < 85) return "#c03535";
  return "#7d2230";
}

function formatValue(indicator) {
  if (!indicator.available || indicator.value === null) return "No data";
  const value = Number(indicator.value);
  if (indicator.display === "percent") return `${value.toFixed(1)}%`;
  if (indicator.display === "integer") return Math.round(value).toLocaleString("en-GB");
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

/* -------------------------------------------------------------------------- */

function renderStatus(data) {
  const suppressed = data.publication.status === "suppressed";

  const pill = el("status-pill");
  pill.textContent = suppressed ? "Headline withheld" : "Published";
  pill.classList.toggle("suppressed", suppressed);
  pill.classList.toggle("published", !suppressed);

  text(el("status-reason"), data.publication.reason ?? data.publication.level?.summary ?? "");

  const { observedPressure, range, availableWeight } = data.structural;
  text(el("stat-pressure"), `${observedPressure.toFixed(1)} pts`);
  text(el("stat-confidence"), `${data.confidence.percent.toFixed(0)}%`);
  text(el("stat-coverage"), `${data.coverage.indicatorsAvailable} of ${data.coverage.indicatorsTotal} · ${(availableWeight * 100).toFixed(0)}% weight`);
  text(el("stat-overlay"), `${data.acute.overlay.toFixed(1)} of ${data.acute.cap} max`);

  // Range bar: measured floor, and the band the missing weight could occupy.
  const span = el("gauge-span");
  span.style.left = `${range.low}%`;
  span.style.width = `${Math.max(0, range.high - range.low)}%`;
  el("gauge-measured").style.width = `${range.low}%`;
  el("gauge-figure").setAttribute(
    "aria-label",
    `Measured pressure ${observedPressure.toFixed(1)} points. A complete score would fall between ` +
    `${range.low.toFixed(1)} and ${range.high.toFixed(1)} out of 100.`
  );

  text(el("eq-structural"), observedPressure.toFixed(1));
  text(el("eq-acute"), `+${data.acute.overlay.toFixed(1)}`);
  text(el("eq-headline"), suppressed ? "—" : data.publication.headlineScore.toFixed(1));
  text(
    el("eq-headline-note"),
    suppressed
      ? `needs ${(data.publication.gates.minAvailableWeight * 100).toFixed(0)}% weight and ${(data.publication.gates.minConfidence * 100).toFixed(0)}% confidence`
      : data.publication.level.label
  );

  const notice = el("provenance-notice");
  notice.classList.remove("live", "frozen");
  if (data.provenance?.store === "d1") {
    notice.classList.add("live");
    notice.textContent =
      `Live evidence store. Snapshot generated ${formatDate(data.provenance.generatedAt)} from ` +
      `${data.coverage.indicatorsAvailable} collected ONS series.`;
  } else {
    notice.classList.add("frozen");
    notice.textContent =
      "Frozen capture. No database is bound, so these are real ONS values parsed from committed " +
      "payload fixtures rather than a live collection run.";
  }
}

function renderIndicator(indicator, index) {
  const card = create("article", `indicator-card${indicator.available ? "" : " unavailable"}`);

  const top = create("div", "indicator-top");
  top.append(create("span", "indicator-number", String(index + 1).padStart(2, "0")));
  top.append(create("span", "indicator-weight", `${(indicator.weight * 100).toFixed(0)}% weight`));
  card.append(top);

  card.append(create("h3", null, indicator.title));

  if (indicator.available) {
    const row = create("div", "indicator-value-row");
    row.append(create("strong", "indicator-value", formatValue(indicator)));

    const score = create("span", "indicator-score");
    score.append(create("small", null, "pressure"));
    score.append(create("strong", null, `${indicator.pressure.toFixed(0)}/100`));
    row.append(score);
    card.append(row);

    const bar = create("div", "pressure-bar");
    bar.style.setProperty("--indicator-score", `${indicator.pressure}%`);
    bar.style.setProperty("--indicator-colour", pressureColour(indicator.pressure));
    bar.append(create("span"));
    card.append(bar);

    card.append(create("p", "indicator-unit", indicator.unit));

    const meta = create("dl", "indicator-meta");
    const pairs = [
      ["Period", indicator.period.label],
      ["Published", formatDate(indicator.freshness.publishedAt)],
      ["Coverage", indicator.geography.label],
      ["Freshness", indicator.freshness.stage]
    ];
    for (const [term, value] of pairs) {
      const wrap = create("div");
      wrap.append(create("dt", null, term));
      wrap.append(create("dd", null, value));
      meta.append(wrap);
    }
    card.append(meta);

    const foot = create("div", "indicator-foot");
    const link = create("a", null, `${indicator.source.cdid} · ${indicator.source.provider}`);
    link.href = indicator.source.url;
    link.rel = "noopener";
    foot.append(link);
    foot.append(create("code", "hash", indicator.source.evidenceSha256.slice(0, 12)));
    card.append(foot);
  } else {
    card.append(create("p", "indicator-missing", indicator.reason ?? "No evidence available."));
    card.append(create("p", "indicator-unit", indicator.unit));

    const bar = create("div", "pressure-bar empty");
    bar.append(create("span"));
    card.append(bar);
  }

  return card;
}

function renderIndicators(indicators) {
  const grid = el("indicator-grid");
  grid.replaceChildren(...indicators.map(renderIndicator));
}

function renderCollectors(health) {
  const body = el("collector-rows");
  const collectors = health.collectors ?? [];

  if (collectors.length === 0) {
    const row = create("tr");
    const cell = create("td", null, "No collection runs recorded. Bind D1 and run the ingestion Worker.");
    cell.colSpan = 6;
    row.append(cell);
    body.replaceChildren(row);
    return;
  }

  const rows = collectors.map((collector) => {
    const row = create("tr");

    const series = create("th");
    series.scope = "row";
    series.append(create("strong", null, `${collector.cdid}/${collector.datasetId}`));
    series.append(create("small", null, collector.title));
    row.append(series);

    row.append(create("td", null, collector.role === "denominator" ? "denominator" : (collector.indicatorId ?? "—")));
    row.append(create("td", null, collector.geography));

    const outcome = create("td");
    outcome.append(create("span", `outcome ${collector.lastOutcome ?? "none"}`, collector.lastOutcome ?? "not run"));
    row.append(outcome);

    row.append(create("td", null, formatDate(collector.lastPublishedAt)));
    row.append(create("td", null, formatDate(collector.expectedNextRelease)));
    return row;
  });

  body.replaceChildren(...rows);
}

function renderGaps(indicators) {
  const list = el("gap-list");
  const missing = indicators.filter((indicator) => !indicator.available);
  list.replaceChildren(...missing.map((indicator) => {
    const item = create("li");
    item.append(create("strong", null, `${indicator.title} · ${(indicator.weight * 100).toFixed(0)}%`));
    item.append(create("span", null, indicator.reason ?? "No collector implemented."));
    return item;
  }));
}

/* -------------------------------------------------------------------------- */

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function start() {
  try {
    const current = await fetchJson("/api/v1/current");
    renderStatus(current);
    renderIndicators(current.indicators);
    renderGaps(current.indicators);

    // Secondary panel: a failure here must not blank the primary reading.
    try {
      renderCollectors(await fetchJson("/api/v1/evidence-health"));
    } catch (error) {
      console.error(error);
      renderCollectors({ collectors: [] });
    }
  } catch (error) {
    console.error(error);
    text(el("status-pill"), "Unavailable");
    text(el("status-reason"), "The dashboard could not load its API. Check /api/v1/health.");
    el("indicator-grid").replaceChildren(create("p", "loading", "Evidence could not be loaded."));
  }
}

start();
