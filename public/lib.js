/** Shared rendering helpers for every public page. No dependencies, no build step. */

export const el = (id) => document.getElementById(id);

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/London"
});

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
  timeZoneName: "short"
});

export const DOMAIN_LABELS = Object.freeze({
  economy_living_standards: "Economy and living standards",
  household_resilience: "Household resilience",
  institutions_cohesion: "Institutions and cohesion",
  public_service_resilience: "Public-service resilience",
  environmental_disruption: "Environmental disruption"
});

export function domainLabel(id) {
  return DOMAIN_LABELS[id] ?? id ?? "—";
}

export function formatDate(value) {
  if (!value) return "—";
  const normalised = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormat.format(date);
}

export function percent(fraction, digits = 0) {
  if (fraction === null || fraction === undefined || Number.isNaN(Number(fraction))) return "—";
  return `${(Number(fraction) * 100).toFixed(digits)}%`;
}

export function text(node, value) {
  if (node) node.textContent = value;
}

export function create(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined && textContent !== null) node.textContent = textContent;
  return node;
}

export function link(href, label, className) {
  const anchor = create("a", className, label);
  anchor.href = href;
  if (/^https?:/.test(href)) anchor.rel = "noopener";
  return anchor;
}

export function pressureColour(pressure) {
  if (pressure === null || pressure === undefined) return "#6b788a";
  if (pressure < 25) return "#2f8f5b";
  if (pressure < 40) return "#6f9c33";
  if (pressure < 55) return "#c8901a";
  if (pressure < 70) return "#cc5f26";
  if (pressure < 85) return "#c03535";
  return "#7d2230";
}

export function formatNumber(value, display) {
  if (value === null || value === undefined) return "—";
  const number = Number(value);
  if (display === "percent") return `${number.toFixed(1)}%`;
  if (display === "integer") return Math.round(number).toLocaleString("en-GB");
  return number.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

export function formatValue(indicator) {
  if (!indicator.available || indicator.value === null) return "No data";
  return formatNumber(indicator.value, indicator.display);
}

export function indicatorHref(id) {
  return `/indicator?id=${encodeURIComponent(id)}`;
}

/** A row of <th scope="row"> + <td> cells, all as text. */
export function row(cells, { header = false } = {}) {
  const tr = create("tr");
  cells.forEach((cell, index) => {
    if (cell instanceof Node) {
      const td = create(index === 0 && header ? "th" : "td");
      if (index === 0 && header) td.scope = "row";
      td.append(cell);
      tr.append(td);
      return;
    }
    const td = create(index === 0 && header ? "th" : "td", null, cell ?? "—");
    if (index === 0 && header) td.scope = "row";
    tr.append(td);
  });
  return tr;
}

export function emptyRow(colSpan, message) {
  const tr = create("tr");
  const td = create("td", "empty-cell", message);
  td.colSpan = colSpan;
  tr.append(td);
  return tr;
}

/**
 * Fetches JSON and keeps degraded bodies. The API returns structured JSON with
 * provenance on 503, which pages must disclose rather than swallow.
 */
export async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (error) {
    return { ok: false, status: 0, body: null, error };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

/** Banner describing the operational state of whatever the page loaded. */
export function provenanceMessage(provenance, status) {
  if (!provenance) {
    return {
      tone: "degraded",
      message: status
        ? `The evidence store is unavailable (HTTP ${status}). Nothing on this page is current, and no fixture data has been substituted.`
        : "The evidence store could not be reached (network error). Nothing on this page is current."
    };
  }
  if (provenance.operationalStatus === "degraded" || provenance.kind === "degraded") {
    return { tone: "degraded", message: `Degraded: ${provenance.reason ?? "the evidence store could not be read"}. No fixture data has been substituted.` };
  }
  if (provenance.kind === "unavailable") {
    return { tone: "degraded", message: "Unavailable: no evidence store is bound and bootstrap mode is disabled." };
  }
  if (provenance.operationalStatus === "stale") {
    return { tone: "stale", message: `Stale: the latest daily materialisation is ${provenance.ageDays ?? "an unknown number of"} days old. Data remains inspectable but is not current.` };
  }
  if (provenance.store === "d1") {
    return { tone: "live", message: `Live evidence store · materialised ${formatDate(provenance.asOfDate ?? provenance.generatedAt)}.` };
  }
  return { tone: "frozen", message: "Frozen capture: bootstrap mode is serving real ONS values from committed payload fixtures, not live ingestion." };
}

export function renderProvenance(node, provenance, status) {
  if (!node) return;
  const { tone, message } = provenanceMessage(provenance, status);
  node.classList.remove("live", "frozen", "stale", "degraded");
  node.classList.add(tone);
  node.textContent = message;
}

/** Minimal SVG helper; inline styles are avoided so the CSP holds. */
const SVG_NS = "http://www.w3.org/2000/svg";
export function svg(tag, attributes = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  for (const child of children) node.append(child);
  return node;
}
