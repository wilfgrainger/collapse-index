/** Evidence-health page. Degraded responses are disclosed, never hidden. */

import {
  el, text, create, link, formatDate, formatDateTime, percent, domainLabel,
  indicatorHref, fetchJson, renderProvenance, row, emptyRow
} from "./lib.js";

function gateCard(title, value, threshold, passed) {
  const card = create("div", "gate-card");
  const head = create("p", null, title);
  const figure = create("strong", passed ? "pass" : "fail", `${percent(value)} ${passed ? "✓ passes" : "✗ below gate"}`);
  const meter = create("div", "meter");
  meter.setAttribute("role", "img");
  meter.setAttribute("aria-label", `${title}: ${percent(value)} against a ${percent(threshold)} gate`);
  const fill = create("span");
  fill.style.width = `${Math.min(100, value * 100)}%`;
  const mark = create("i");
  mark.style.left = `${threshold * 100}%`;
  meter.append(fill, mark);
  card.append(head, figure, meter, create("p", null, `Gate: ${percent(threshold)}`));
  return card;
}

function render(body, status) {
  renderProvenance(el("provenance-notice"), body?.provenance ?? null, status);
  const publication = body?.publication;
  if (publication?.gates) {
    const g = publication.gates;
    text(el("gate-reason"), publication.reason ?? "Both gates pass.");
    el("gate-grid").replaceChildren(
      gateCard("Fixed-weight availability", g.availableWeight, g.minAvailableWeight, g.availabilityPassed),
      gateCard("Evidence confidence", g.confidence, g.minConfidence, g.confidencePassed)
    );
  } else {
    text(el("gate-reason"), "Gate state is unavailable because the evidence store could not be read.");
    el("gate-grid").replaceChildren();
  }

  const domains = body?.coverage?.byDomain ?? [];
  el("domain-rows").replaceChildren(...(domains.length
    ? domains.map((d) => row([domainLabel(d.domain), percent(d.weight), percent(d.availableWeight), `${d.contribution.toFixed(2)} pts`], { header: true }))
    : [emptyRow(4, "Unavailable.")]));

  const collectors = body?.collectors ?? [];
  const failed = !body || body.provenance?.operationalStatus === "degraded" || body.provenance?.kind === "unavailable";
  el("collector-rows").replaceChildren(...(collectors.length
    ? collectors.map((c) => {
      const outcome = create("span", null, c.lastOutcome ?? "not run");
      if (c.lastFailureClass) outcome.textContent += ` (${c.lastFailureClass})`;
      const next = create("span", null, formatDate(c.expectedNextRelease));
      if (c.releaseOverdue) next.append(" ", create("span", "state-tag revised", "overdue"));
      const role = c.role === "denominator" ? "denominator" : link(indicatorHref(c.indicatorId), c.indicatorId);
      const series = create("span");
      series.append(create("strong", null, `${c.cdid}/${c.datasetId}`), create("br"), create("small", null, c.title));
      return row([series, role, c.qualityClass, String(c.releasesObserved), outcome, formatDate(c.lastPublishedAt), next, formatDateTime(c.lastAttemptAt)], { header: true });
    })
    : [emptyRow(8, failed
      ? `Evidence health could not be read (HTTP ${status || "network error"}). This is a failure, not an empty store.`
      : body?.provenance?.store === "d1"
        ? "The evidence store is bound but no collection run has been recorded."
        : "Bootstrap capture: collector runs are only recorded by the live ingestion Worker.")]));

  const indicators = body?.indicators ?? [];
  el("freshness-rows").replaceChildren(...(indicators.length
    ? indicators.map((i) => row([
      link(indicatorHref(i.id), i.title),
      i.available ? `${i.freshness?.stage ?? "—"}` : (i.reason ?? "unavailable"),
      i.geography?.label ?? "—",
      i.factors ? String(i.factors.quality) : "—",
      i.factors ? String(i.factors.freshness) : "—",
      i.factors ? String(i.factors.coverage) : "—"
    ], { header: true }))
    : [emptyRow(6, "Unavailable.")]));

  const runs = body?.recentRuns ?? [];
  el("run-rows").replaceChildren(...(runs.length
    ? runs.map((r) => row([`#${r.id} · ${r.trigger}`, formatDateTime(r.started_at), r.status, String(r.sources_attempted), String(r.sources_changed), String(r.sources_failed), String(r.observations_written)], { header: true }))
    : [emptyRow(7, failed ? "Unavailable." : "No runs recorded by this deployment.")]));
}

const result = await fetchJson("/api/v1/evidence-health");
render(result.body, result.status);
