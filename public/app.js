/** Dashboard rendering. */

import {
  el, text, create, link, pressureColour, formatDate, formatValue, percent,
  indicatorHref, domainLabel, fetchJson, renderProvenance, emptyRow
} from "./lib.js";

function renderStatus(data) {
  const suppressed = data.publication.status === "suppressed";
  const pill = el("status-pill");
  pill.textContent = suppressed ? "Headline withheld" : "Published · alpha";
  pill.classList.toggle("suppressed", suppressed);
  pill.classList.toggle("published", !suppressed);
  text(el("status-reason"), data.publication.reason ?? data.publication.level?.summary ?? "");

  const { observedPressure, range, availableWeight, missingWeight } = data.structural;
  const { indicatorsAvailable, indicatorsTotal } = data.coverage;
  const gates = data.publication.gates;

  text(el("hero-title"), suppressed ? "There is no headline score yet." : `Headline: ${data.publication.headlineScore.toFixed(1)} / 100`);
  text(
    el("hero-coverage"),
    suppressed
      ? `${indicatorsAvailable} of its ${indicatorsTotal} indicators are collected from official statistics, covering ${percent(availableWeight)} of fixed weight. ` +
        `A headline needs ${percent(gates.minAvailableWeight)} of weight and ${percent(gates.minConfidence)} confidence, so none is published — ` +
        "showing one would imply a completeness that does not exist."
      : `${indicatorsAvailable} of ${indicatorsTotal} indicators are collected, covering ${percent(availableWeight)} of fixed weight, and every publication gate has passed.`
  );

  text(el("stat-pressure"), `${observedPressure.toFixed(1)} pts`);
  text(el("stat-confidence"), `${data.confidence.percent.toFixed(0)}%`);
  text(el("stat-coverage"), `${indicatorsAvailable} of ${indicatorsTotal} · ${percent(availableWeight)} weight`);
  text(el("stat-overlay"), `${data.acute.overlay.toFixed(1)} of ${data.acute.cap} max`);

  const span = el("gauge-span");
  span.style.left = `${range.low}%`;
  span.style.width = `${Math.max(0, range.high - range.low)}%`;
  el("gauge-measured").style.width = `${range.low}%`;
  el("gauge-figure").setAttribute(
    "aria-label",
    `Measured pressure ${observedPressure.toFixed(1)} points. A complete score would fall between ${range.low.toFixed(1)} and ${range.high.toFixed(1)} out of 100.`
  );

  text(el("eq-structural"), observedPressure.toFixed(1));
  text(el("eq-acute"), `+${data.acute.overlay.toFixed(1)}`);
  const headline = el("eq-headline");
  text(headline, suppressed ? "—" : data.publication.headlineScore.toFixed(1));
  headline.setAttribute("aria-label", suppressed ? "withheld" : data.publication.headlineScore.toFixed(1));
  text(
    el("eq-headline-note"),
    suppressed
      ? `needs ${percent(gates.minAvailableWeight)} weight and ${percent(gates.minConfidence)} confidence`
      : data.publication.level.label
  );

  text(el("gaps-weight"), `These hold ${percent(missingWeight)} of the fixed weight between them.`);
  text(el("gaps-title"), `The ${indicatorsTotal - indicatorsAvailable} missing indicators`);
  text(el("guardrail-gates"), `Publication gates are public: ${percent(gates.minAvailableWeight)} of fixed weight and ${percent(gates.minConfidence)} confidence.`);

  renderProvenance(el("provenance-notice"), data.provenance, 200);
}

function renderDomains(domains) {
  const list = el("domain-list");
  if (!list) return;
  list.replaceChildren(...domains.map((domain) => {
    const item = create("li", "domain-item");
    const head = create("div", "domain-head");
    head.append(create("strong", null, domainLabel(domain.domain)), create("span", null, `${percent(domain.availableWeight)} of ${percent(domain.weight)} measured`));
    const bar = create("div", "domain-bar");
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${domainLabel(domain.domain)}: ${percent(domain.availableWeight)} of ${percent(domain.weight)} weight measured`);
    const fill = create("span");
    fill.style.width = domain.weight > 0 ? `${(domain.availableWeight / domain.weight) * 100}%` : "0%";
    bar.append(fill);
    item.append(head, bar, create("small", null, `Contributes ${domain.contribution.toFixed(1)} pts of measured pressure`));
    return item;
  }));
}

function renderDrivers(indicators) {
  const list = el("driver-list");
  if (!list) return;
  const drivers = indicators.filter((i) => i.available).sort((a, b) => b.contribution - a.contribution).slice(0, 3);
  if (drivers.length === 0) {
    list.replaceChildren(create("li", null, "No measured indicator is contributing pressure."));
    return;
  }
  list.replaceChildren(...drivers.map((indicator) => {
    const item = create("li");
    item.append(link(indicatorHref(indicator.id), indicator.title));
    item.append(create("span", null, `${indicator.contribution.toFixed(1)} pts · ${formatValue(indicator)} (${indicator.period.label})`));
    return item;
  }));
}

function renderIndicator(indicator, index) {
  const card = create("article", `indicator-card${indicator.available ? "" : " unavailable"}`);
  const top = create("div", "indicator-top");
  top.append(create("span", "indicator-number", String(index + 1).padStart(2, "0")));
  top.append(create("span", "indicator-weight", `${percent(indicator.weight)} weight`));
  const heading = create("h3");
  heading.append(link(indicatorHref(indicator.id), indicator.title, "card-link"));
  card.append(top, heading, create("p", "indicator-domain", domainLabel(indicator.domain)));

  if (indicator.available) {
    const valueRow = create("div", "indicator-value-row");
    valueRow.append(create("strong", "indicator-value", formatValue(indicator)));
    const score = create("span", "indicator-score");
    score.append(create("small", null, "pressure"), create("strong", null, `${indicator.pressure.toFixed(0)}/100`));
    valueRow.append(score);
    card.append(valueRow);

    const bar = create("div", "pressure-bar");
    bar.style.setProperty("--indicator-score", `${indicator.pressure}%`);
    bar.style.setProperty("--indicator-colour", pressureColour(indicator.pressure));
    bar.append(create("span"));
    card.append(bar, create("p", "indicator-unit", indicator.unit));

    const meta = create("dl", "indicator-meta");
    const pairs = [
      ["Period", indicator.period.label],
      ["Published", formatDate(indicator.freshness.publishedDate ?? indicator.freshness.publishedAt)],
      ["Coverage", indicator.geography.label],
      ["Freshness", indicator.freshness.stage],
      ["State", indicator.state ?? "—"],
      ["Contribution", `${indicator.contribution.toFixed(2)} pts`]
    ];
    for (const [term, value] of pairs) {
      const wrap = create("div");
      wrap.append(create("dt", null, term), create("dd", null, value));
      meta.append(wrap);
    }
    card.append(meta);

    const foot = create("div", "indicator-foot");
    foot.append(link(indicator.source.url, `${indicator.source.cdid} · ${indicator.source.provider}`));
    const hash = create("code", "hash", indicator.source.evidenceSha256.slice(0, 12));
    hash.title = `SHA-256 ${indicator.source.evidenceSha256}`;
    foot.append(hash);
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
  grid.removeAttribute("aria-busy");
}

function renderCollectors(result) {
  const body = el("collector-rows");
  const collectors = result.body?.collectors ?? [];
  const provenance = result.body?.provenance;
  const degraded = !result.body || provenance?.operationalStatus === "degraded" || provenance?.kind === "unavailable";

  if (degraded) {
    body.replaceChildren(emptyRow(6, `Evidence health is degraded or unavailable (HTTP ${result.status || "network error"}). This is a failure, not an empty store.`));
    return;
  }
  if (collectors.length === 0) {
    const message = provenance?.store === "d1"
      ? "The evidence store is bound but no collection run has been recorded."
      : "Bootstrap capture: collector runs are only recorded by the live ingestion Worker.";
    body.replaceChildren(emptyRow(6, message));
    return;
  }

  body.replaceChildren(...collectors.map((collector) => {
    const tr = create("tr");
    const series = create("th");
    series.scope = "row";
    series.append(create("strong", null, `${collector.cdid}/${collector.datasetId}`));
    series.append(create("small", null, collector.title));
    tr.append(series);
    const role = create("td");
    if (collector.role === "denominator") role.textContent = "denominator";
    else if (collector.indicatorId) role.append(link(indicatorHref(collector.indicatorId), collector.indicatorId));
    else role.textContent = "—";
    tr.append(role);
    tr.append(create("td", null, collector.geography));
    const outcome = create("td");
    outcome.append(create("span", `outcome ${collector.lastOutcome ?? "none"}`, collector.lastOutcome ?? "not run"));
    tr.append(outcome);
    tr.append(create("td", null, formatDate(collector.lastPublishedAt)));
    const next = create("td", null, formatDate(collector.expectedNextRelease));
    if (collector.releaseOverdue) next.append(create("span", "outcome overdue", "overdue"));
    tr.append(next);
    return tr;
  }));
}

function renderGaps(indicators) {
  const missing = indicators.filter((indicator) => !indicator.available);
  el("gap-list").replaceChildren(...missing.map((indicator) => {
    const item = create("li");
    item.append(link(indicatorHref(indicator.id), `${indicator.title} · ${percent(indicator.weight)}`));
    item.append(create("span", null, indicator.reason ?? "No collector implemented."));
    return item;
  }));
}

async function start() {
  const current = await fetchJson("/api/v1/current");
  if (!current.ok || !current.body?.publication) {
    text(el("status-pill"), "Unavailable");
    el("status-pill").classList.add("degraded");
    text(el("status-reason"), "The evidence store is unavailable or degraded. No fixture data has been substituted.");
    renderProvenance(el("provenance-notice"), current.body?.provenance ?? null, current.status);
    el("indicator-grid").replaceChildren(create("p", "loading", "Evidence could not be loaded."));
    el("indicator-grid").removeAttribute("aria-busy");
    renderCollectors(await fetchJson("/api/v1/evidence-health"));
    return;
  }
  const data = current.body;
  renderStatus(data);
  renderDomains(data.coverage.byDomain ?? []);
  renderDrivers(data.indicators);
  renderIndicators(data.indicators);
  renderGaps(data.indicators);
  renderCollectors(await fetchJson("/api/v1/evidence-health"));
}

start();
