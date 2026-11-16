/** History page: only materialisations the system actually calculated. */

import { el, create, svg, formatDate, percent, fetchJson, renderProvenance, row, emptyRow } from "./lib.js";

function renderChart(points) {
  const figure = el("history-figure");
  if (points.length === 0) {
    figure.replaceChildren(create("p", null, "No daily materialisation has been recorded yet. Nothing is drawn rather than an illustrative line."));
    return;
  }
  const W = 760, H = 300, L = 44, R = 16, T = 14, B = 36;
  const n = points.length;
  const x = (i) => (n === 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R));
  const y = (s) => T + (1 - s / 100) * (H - T - B);
  const children = [];
  for (const s of [0, 25, 50, 75, 100]) {
    children.push(svg("line", { class: "grid", x1: L, x2: W - R, y1: y(s), y2: y(s) }));
    children.push(svg("text", { class: "label", x: L - 8, y: y(s) + 4, "text-anchor": "end" }, [document.createTextNode(String(s))]));
  }
  const upper = points.map((p, i) => `${x(i).toFixed(1)},${y(p.range.high).toFixed(1)}`);
  const lower = points.map((p, i) => `${x(i).toFixed(1)},${y(p.range.low).toFixed(1)}`).reverse();
  if (n > 1) children.push(svg("polygon", { class: "band", points: [...upper, ...lower].join(" ") }));
  else children.push(svg("line", { class: "band-line marker-line", x1: x(0), x2: x(0), y1: y(points[0].range.high), y2: y(points[0].range.low) }));
  if (n > 1) children.push(svg("path", { class: "curve", d: points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.observedPressure).toFixed(1)}`).join(" ") }));
  points.forEach((p, i) => {
    if (i > 0 && p.methodologyVersion !== points[i - 1].methodologyVersion) {
      children.push(svg("line", { class: "break-line", x1: x(i), x2: x(i), y1: y(100), y2: y(0) }));
    }
  });
  children.push(svg("circle", { class: "marker", cx: x(n - 1), cy: y(points[n - 1].observedPressure), r: 5 }));
  for (const i of [...new Set([0, Math.floor((n - 1) / 2), n - 1])]) {
    children.push(svg("text", { class: "label", x: x(i), y: H - 12, "text-anchor": n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle" }, [document.createTextNode(formatDate(points[i].date))]));
  }
  const last = points[n - 1];
  const label = `Measured pressure across ${n} daily materialisations from ${formatDate(points[0].date)} to ${formatDate(last.date)}. ` +
    `Latest: ${last.observedPressure.toFixed(1)} points, range ${last.range.low.toFixed(1)} to ${last.range.high.toFixed(1)}. The table below lists every point.`;
  figure.replaceChildren(
    svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label }, children),
    create("figcaption", null, "Line: measured structural pressure (fixed weights, never renormalised). Band: where a complete score could fall given uncollected weight. Dotted vertical: methodology version change. Calendar gaps are compressed.")
  );
}

async function start() {
  const result = await fetchJson("/api/v1/history");
  const points = result.body?.points ?? [];
  if (!result.ok) {
    renderProvenance(el("provenance-notice"), result.body?.provenance ?? null, result.status);
  } else if (points.length === 0) {
    const notice = el("provenance-notice");
    notice.classList.add("frozen");
    notice.textContent = "No materialised history is available from this deployment. In bootstrap mode the history is deliberately empty.";
  } else {
    const notice = el("provenance-notice");
    notice.classList.add("live");
    notice.textContent = `${points.length} daily materialisations, ${formatDate(points[0].date)} to ${formatDate(points.at(-1).date)}.`;
  }
  renderChart(points);
  el("history-rows").replaceChildren(...(points.length
    ? [...points].reverse().map((p) => row([
      formatDate(p.date),
      p.status === "suppressed" ? "withheld" : `published ${p.headlineScore?.toFixed(1) ?? ""}`,
      p.observedPressure.toFixed(1),
      `${p.range.low.toFixed(1)}–${p.range.high.toFixed(1)}`,
      percent(p.availableWeight),
      percent(p.confidence),
      p.methodologyVersion
    ], { header: true }))
    : [emptyRow(7, "No points.")]));
}

start();
