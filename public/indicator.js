/** Indicator detail page: definition, current state, scoring curve and observation versions. */

import {
  el, text, create, link, svg, formatDate, formatNumber, formatValue, percent,
  domainLabel, fetchJson, renderProvenance, row, emptyRow
} from "./lib.js";

const id = new URLSearchParams(location.search).get("id") ?? "";

function fact(term, value, note) {
  const wrap = create("div");
  const dd = create("dd", null, value);
  if (note) dd.append(create("small", null, note));
  wrap.append(create("dt", null, term), dd);
  return wrap;
}

function details(list, pairs) {
  list.replaceChildren();
  for (const [term, value] of pairs) {
    if (value === null || value === undefined || value === "") continue;
    const dd = create("dd");
    if (value instanceof Node) dd.append(value);
    else dd.textContent = value;
    list.append(create("dt", null, term), dd);
  }
}

function code(value) {
  return create("code", null, value);
}

/** Piecewise-linear curve with the current value marked. Pure SVG, no inline styles. */
function renderCurve(definition, current) {
  const points = definition.breakpoints ?? [];
  const figure = el("curve-figure");
  if (points.length < 2) {
    figure.replaceChildren(create("p", null, "No scoring curve is defined."));
    return;
  }
  const W = 640, H = 260, L = 44, R = 16, T = 14, B = 34;
  const xs = points.map((p) => p.value);
  let min = Math.min(...xs), max = Math.max(...xs);
  if (current?.available) { min = Math.min(min, current.value); max = Math.max(max, current.value); }
  const x = (v) => L + ((v - min) / (max - min || 1)) * (W - L - R);
  const y = (s) => T + (1 - s / 100) * (H - T - B);

  const children = [];
  for (const s of [0, 25, 50, 75, 100]) {
    children.push(svg("line", { class: "grid", x1: L, x2: W - R, y1: y(s), y2: y(s) }));
    children.push(svg("text", { class: "label", x: L - 8, y: y(s) + 4, "text-anchor": "end" }, [document.createTextNode(String(s))]));
  }
  children.push(svg("line", { class: "axis", x1: L, x2: W - R, y1: y(0), y2: y(0) }));
  let lastLabelX = -Infinity;
  for (const p of points) {
    if (x(p.value) - lastLabelX < 28) continue; // skip labels that would collide; the table lists all
    lastLabelX = x(p.value);
    children.push(svg("text", { class: "label", x: x(p.value), y: H - 12, "text-anchor": "middle" }, [document.createTextNode(formatNumber(p.value))]));
  }
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.value).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  children.push(svg("path", { class: "curve", d: path }));
  if (current?.available && current.pressure !== null) {
    const cx = x(current.value), cy = y(current.pressure);
    children.push(svg("line", { class: "marker-line", x1: cx, x2: cx, y1: y(0), y2: cy }));
    children.push(svg("circle", { class: "marker", cx, cy, r: 6 }));
  }
  const label = current?.available
    ? `Scoring curve for ${definition.title}. The current value ${formatValue(current)} maps to pressure ${current.pressure.toFixed(1)} out of 100. Breakpoints are listed in the table below.`
    : `Scoring curve for ${definition.title}. No current value. Breakpoints are listed in the table below.`;
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label }, children);
  const caption = create("figcaption", null, "x-axis: raw value in the indicator's unit · y-axis: pressure 0–100 · marker: current value. Frozen within a methodology version.");
  figure.replaceChildren(chart, caption);

  el("breakpoint-rows").replaceChildren(...points.map((p) =>
    row([formatNumber(p.value, definition.display), p.score.toFixed(0), p.note ?? ""])
  ));
}

function renderHistory(history, definition, provenance) {
  const body = el("history-rows");
  if (history.length === 0) {
    const message = definition.sourceId === null
      ? "No collector is implemented for this indicator, so there are no observations."
      : provenance?.store === "d1"
        ? "No observation versions are stored yet."
        : "Bootstrap capture: observation versions are only available from the live evidence store.";
    body.replaceChildren(emptyRow(6, message));
    return;
  }
  body.replaceChildren(...history.map((o) => {
    const state = create("span", `state-tag ${o.state}`, o.state);
    const hash = code(o.evidenceSha256.slice(0, 16));
    hash.title = o.dependencyFingerprint;
    return row([o.periodLabel, formatNumber(o.value, definition.display), formatDate(o.publishedAt), state, hash,
      o.denominator ? `${o.denominator.cdid} ${o.denominator.periodLabel}` : "—"], { header: true });
  }));
}

async function start() {
  if (!/^[a-z_]+$/.test(id)) {
    text(el("indicator-title"), "Unknown indicator");
    text(el("indicator-lede"), "Choose an indicator from the dashboard.");
    return;
  }
  const result = await fetchJson(`/api/v1/indicators/${id}`);
  if (result.status === 404) {
    text(el("indicator-title"), "Unknown indicator");
    text(el("indicator-lede"), `There is no indicator called “${id}”.`);
    return;
  }
  const { definition, current = null, history = [], provenance = null } = result.body ?? {};
  renderProvenance(el("provenance-notice"), provenance, result.status);
  if (!definition) {
    text(el("indicator-title"), "Evidence unavailable");
    return;
  }

  document.title = `${definition.title} · UK Stability Monitor`;
  text(el("crumb-title"), definition.title);
  text(el("indicator-domain"), domainLabel(definition.domain));
  text(el("indicator-title"), definition.title);
  text(el("indicator-lede"), definition.description ?? "");

  const facts = el("indicator-facts");
  facts.replaceChildren(
    fact("Current value", current ? formatValue(current) : "No data", current?.available ? `${current.period.label} · ${current.unit}` : (current?.reason ?? definition.unit)),
    fact("Pressure", current?.available ? `${current.pressure.toFixed(1)} / 100` : "—", `direction: ${definition.direction}`),
    fact("Fixed weight", percent(definition.weight), "never redistributed"),
    fact("Contribution", current?.available ? `${current.contribution.toFixed(2)} pts` : "0 pts", "weight × pressure"),
    fact("Confidence share", current ? `${(current.confidenceContribution * 100).toFixed(1)} pts` : "0 pts", "weight × quality × freshness × coverage")
  );

  if (current?.available) {
    const s = current.source;
    details(el("source-list"), [
      ["Provider", s.provider],
      ["Series", link(s.url, `${s.cdid}/${s.datasetId}`)],
      ["Title", s.title],
      ["Licence", s.licence],
      ["Quality class", s.qualityClass],
      ["Evidence state", current.state],
      ["Evidence SHA-256", code(s.evidenceSha256)],
      ["Dependency fingerprint", code(s.dependencyFingerprint)],
      ["Parser", s.parserVersion],
      ["Denominator", current.denominator
        ? `${current.denominator.cdid} ${current.denominator.periodLabel}: ${formatNumber(current.denominator.value)} ${current.denominator.unit}${current.denominator.exactPeriodMatch ? "" : " (period not exactly matched)"}`
        : null],
      ["Denominator SHA-256", current.denominator ? code(current.denominator.evidenceSha256) : null]
    ]);
    details(el("freshness-list"), [
      ["Reference period", `${current.period.label} (${formatDate(current.period.start)} – ${formatDate(current.period.end)}), ${current.period.frequency}`],
      ["Published", formatDate(current.freshness.publishedDate ?? current.freshness.publishedAt)],
      ["Next expected release", formatDate(current.freshness.expectedNextRelease)],
      ["Freshness", `${current.freshness.stage} — ${current.freshness.reason}`],
      ["Geography", `${current.geography.label} (coverage factor ${current.geography.coverageFactor})`],
      ["Factors", `quality ${current.factors.quality} · freshness ${current.factors.freshness} · coverage ${current.factors.coverage}`],
      ["Notes", current.notes]
    ]);
  } else {
    details(el("source-list"), [
      ["Status", current?.reason ?? "no evidence available"],
      ["Planned source", definition.sourceId ?? "not yet selected — see the source register"]
    ]);
    details(el("freshness-list"), [["Freshness", "Not applicable: there is no observation."]]);
  }
  text(el("curve-rationale"), definition.rationale ?? "");
  renderCurve(definition, current);
  renderHistory(history, definition, provenance);
}

start();
