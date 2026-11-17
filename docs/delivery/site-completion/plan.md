# Site completion — review findings and delivery plan

Date: 2026-11-16. Scope: a full review of the v0.2 site after PR #4, the product roadmap that came out of it, and what this delivery ships.

## 1. Review findings

### Correctness and operations

| # | Finding | Severity | Status |
|---|---|---|---|
| R1 | `test/integration/api.test.js` health test read the wall clock against a snapshot ingested on 2026-08-01, so `main` started failing two days after merge. | High (CI red on `main`) | Fixed: read clock pinned to the ingestion day |
| R2 | The two-release rule in `SOURCE_REGISTER.md` was unmet for every collector. | High (production-readiness gate) | Fixed: real `2026-11-live` captures for all five series, including a real N3Y6 revision (2025: 1.0 → 0.9) |
| R3 | An ONS release that is past its announced date (N3Y6 was due 2026-11-12) is not surfaced anywhere. | Medium | Fixed: `releaseOverdue` disclosed per collector (display only; scoring unchanged) |

Findings from the independent backend review are recorded in section 4.

### Website

| # | Finding | Severity | Status |
|---|---|---|---|
| W1 | `methodology.html` and `404.html` used inline styles that the site's own CSP (`style-src 'self'`) blocks. The methodology page rendered unstyled and scrolled sideways at 390px. | Blocker | Fixed |
| W2 | A failed `/api/v1/evidence-health` request was shown as "No collection runs recorded", the same as an empty store. A degraded state was disguised as an empty one. | High (AGENTS.md: degraded must be reported) | Fixed |
| W3 | No per-indicator, history, evidence-health, corrections or about pages, though the API already served the data. Nav and footer pointed at raw JSON. | High | Fixed |
| W4 | `--faint` text measured about 4:1 on the dark surface, metadata went down to 10.9px, and many targets were under 44px. | Medium (WCAG 2.2 AA) | Fixed |
| W5 | Homepage copy hard-coded "four of ten / 40%", so it would go stale when collectors land. | Medium | Fixed: derived from `/api/v1/current` |
| W6 | `robots.txt` used a relative sitemap URL. The sitemap had a placeholder host and listed two pages. | Low | Fixed: the Worker serves `robots.txt` and `sitemap.xml` with the request origin |
| W7 | No canonical URL or Open Graph metadata. The methodology page had no nav label or skip link. | Low | Fixed |
| W8 | The static HTML holds no evidence state when JavaScript is off. | Medium | Deferred to roadmap S2: server rendering must not use bootstrap fixtures as live state |

## 2. Product roadmap

Release numbering follows `ROADMAP.md`. Each milestone has an exit criterion that can be checked.

### Now — 0.2.1 site completion (this delivery)

- R1–R3, W1–W7 above.
- **Exit:** `npm run check` is green and does not depend on the date. Every API resource has a human page. No inline style is blocked by CSP. Every collector shows `releasesObserved ≥ 2`.

### Next — 0.2.2 remaining collectors (needs exact-source review per indicator)

Order is set by weight and evidence quality:

1. NHS RTT elective strain, England-only (15%). This is the largest single weight.
2. FSA Food and You 2 food insecurity (8%, issue #5).
3. DWP HBAI child poverty (9%).
4. ONS private rental affordability (8%).
5. Trust in government (10%), after the continuity decision.
6. Environmental disruption, England first and then all four nations (10%).

The 90% gate cannot pass without healthcare: without its 15%, at most 85% of weight is available. RTT therefore goes first, though its spreadsheet parsing must first be measured against D-015.

- **Exit:** at least 90% fixed weight available, so the gate can pass on evidence alone.

### Next — S2 server-rendered evidence state

The public Worker renders the current D1 snapshot into the homepage HTML, so readers without JavaScript and search engines see the true state. It renders a bootstrap capture only when it is labelled as a bootstrap capture.

### Later

- 0.3: reproducible history, backcast and sensitivity analysis.
- 0.4: reviewed acute-event workflow.
- 0.5: public beta.
- 1.0: editorial launch.

These are unchanged in `ROADMAP.md`.

## 3. Constraints this delivery respects

- No framework, build step or new runtime dependency. Pages are static HTML plus small ES modules against the existing read-only API.
- Scoring and methodology are unchanged (`1.0.0-alpha.1`). No observation was hand-entered. The new fixtures are unmodified ONS responses.
- The public Worker gains no mutation route. `robots.txt` and `sitemap.xml` are read-only `GET`/`HEAD` routes.

## 4. Independent backend review findings

The review was read-only, against the AGENTS.md invariants. Each fix has a regression test in `test/integration/review-fixes.test.js` unless noted otherwise.

| # | Finding | Severity | Status |
|---|---|---|---|
| R4 | `0003_review_correctness.sql` relies on `PRAGMA foreign_keys = OFF`, which has no effect inside a transaction. D1 runs migrations inside one, so upgrading a **populated** v0.2 database fails with `FOREIGN KEY constraint failed`. A fresh install works. | High (latent) | **Open: owner decision.** No populated v0.2 database exists: resource IDs are placeholders and live collection was never confirmed. Applied migrations are immutable, so 0003 was not edited. A new test proves fresh installs succeed under D1 conditions. If a populated v0.2 database ever exists, upgrade it with a new forward migration that uses `PRAGMA defer_foreign_keys = true`. |
| R5 | The `/current` ETag ignored `operationalStatus` and `ageDays`. A client could revalidate a stale body as current. | High | Fixed |
| R6 | A whitespace-only source cell parsed as `0`, breaking the "blank is never zero" rule. | High | Fixed: blank cells are skipped, and only decimal notation parses |
| R7 | The snapshot insert and its component rows were written separately. A failure left a snapshot without lineage that same-day reruns never repaired. | High | Fixed: one D1 batch (transaction), with `INSERT OR IGNORE`. The test double is now transactional too. |
| R8 | A crash mid-run left `ingestion_runs.status = 'running'` for good, and health stayed green. | Medium | Fixed: the run is marked `failed`, and health degrades on a run unfinished after 30 minutes |
| R9 | An expired indicator still published `contribution = weight × pressure`. | Medium | Fixed (D-024). No score, gate or methodology version changes. |
| R10 | A bound but empty D1 returned a cacheable `200` from `/history` and the export manifest. | Medium | Fixed: `503 no-store` |
| R11 | A payload whose newest period was older than the stored one would move the current value back in time. | Medium | Fixed (D-025): quarantined |
| R12 | The OpenAPI document had no path parameter, missing query parameters, and blanket 503s. | Medium | Fixed |
| R13 | Weak or listed `If-None-Match` never matched. The 405 response had no `Allow` header. "31 February" rolled into March. | Low | Fixed |
| R14 | Export and regression suites read the wall clock, so they had silently tested the stale path since August. | Low | Fixed: clock pinned |

### Deferred, with reasons

- **A new byte stream with an unchanged value is still labelled `revised`.** Changing that is an evidence-state semantics decision; it belongs to the next methodology or decision-log entry, not a bug fix.
- **`syncSources` does not update identity columns on upsert.** Identity changes in the registry are themselves review events, so this needs a design decision.
- **Snapshot history groups by date and methodology version.** It will show two points on a methodology-change day. This is acceptable until the first methodology bump, which must address it.
- **`acuteOverlay` accepts an approved event without checking reviewer fields.** It is unreachable today. The 0.4 event workflow must enforce schema review fields before any event can be wired in.
- **Dead code** (`readEvidence`, `indicatorSources`, unused collect fields). It is harmless. Remove it in a cleanup change so this diff stays reviewable.
