## Outcome

What observable user, evidence or operational result does this change deliver?

## Evidence or defect

What source, reproduced behaviour, test failure or documented gap justifies the change?

## Scope

- Included:
- Explicitly not included:

## Data and methodology impact

- [ ] No source, indicator, transformation, weight, curve, gate or publication claim changes
- [ ] Exact source identity and licence are documented
- [ ] Geography, period, unit, publication date and revision treatment are preserved
- [ ] Evidence fixtures and hashes are included where required
- [ ] Methodology version and decision record are updated where required

Explain any checked data or methodology changes:

## Security and operations

- [ ] Public Worker remains read-only
- [ ] Ingestion write access remains unreachable by public URL
- [ ] Inputs, response sizes and query limits are bounded
- [ ] Migration is forward-only and upgrade-tested
- [ ] Rollback or roll-forward path is documented
- [ ] No credential, private payload or resource identifier is committed

## Accessibility and claims

- [ ] Keyboard and non-JavaScript paths remain usable
- [ ] Reduced-motion and readable contrast are preserved
- [ ] Copy distinguishes pressure from prediction and missing data from zero
- [ ] Nation-specific evidence is not described as UK-wide
- [ ] Records, pathways or incidents are not described as unique people without evidence

## Verification

Commands and checks actually run:

```text
npm run check
```

Additional checks:

## Residual risk

What remains unverified, externally dependent or intentionally deferred?
