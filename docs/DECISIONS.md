# Decision log

## D-001 — Public name separates monitoring from prophecy

**Decision:** Use `UK Stability Monitor` as the public name and retain `Collapse Index` as the working descriptor.

**Reason:** The system measures pressure. Calling every elevated reading “collapse” would overstate what the evidence can support.

## D-002 — Higher score always means more pressure

**Decision:** All transformed indicators use a 0–100 pressure scale where higher is worse.

**Reason:** This keeps the headline and component interpretation consistent.

## D-003 — Daily recalculation, source-frequency honesty

**Decision:** Recalculate daily but retain the true reference date of every input.

**Reason:** Most official series are monthly, quarterly or annual. Fabricating daily movement would create false precision.

## D-004 — Confidence does not silently alter the stress score

**Decision:** Freshness and source quality produce a separate confidence measure. Available observations remain in the score until replaced or withdrawn.

**Reason:** Multiplying pressure by confidence can make worsening data appear healthier merely because it is stale. Separate disclosure is easier to understand and audit.

## D-005 — Event overlay capped at ten points

**Decision:** A reviewed event can contribute at most two initial points and the total event overlay is capped at ten, with exponential decay.

**Reason:** News judgement must not overwhelm the quantitative baseline.

## D-006 — Prototype deploys without D1

**Decision:** The default Worker uses bundled, visibly provisional data. D1 is an optional production binding.

**Reason:** The repository can be deployed and reviewed before Cloudflare resource IDs exist, without hiding infrastructure gaps.

## D-007 — No source collectors in the first commit

**Decision:** Establish schemas, scoring, disclosure and tests before parsing external sources.

**Reason:** A hurried collector that silently reads the wrong series is more dangerous than an explicit prototype.
