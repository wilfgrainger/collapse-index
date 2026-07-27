# Source register

This register describes the intended evidence, not a claim that collectors are complete.

| Indicator | Intended primary source | Cadence | Prototype state | Main risk |
|---|---|---:|---|---|
| GDP per capita growth | Office for National Statistics | Quarterly | Provisional seed | Revisions and denominator choice |
| CPI inflation | Office for National Statistics | Monthly | Provisional seed | Exact series and annual-rate definition |
| Unemployment | Office for National Statistics | Monthly rolling quarter | Provisional seed | Survey volatility and revisions |
| Child poverty | DWP HBAI | Annual | Provisional seed | After-housing-cost definition and lag |
| Private rent burden | Office for National Statistics | Annual/periodic | Provisional seed | UK coverage and household denominator |
| Trust in government | OECD or stable national survey | Annual/periodic | Provisional seed | Question wording and survey comparability |
| Industrial disruption | Office for National Statistics | Monthly | Illustrative placeholder | Small counts and episodic spikes |
| Food hardship | Trussell plus official food-security series | Annual | Provisional derived seed | Network coverage is not total need |
| NHS backlog | NHS England RTT | Monthly | Provisional derived seed | Pathways are not unique people; England/UK scope |
| Climate disruption | Met Office and environment agencies | Daily | Illustrative placeholder | Composite design and regional aggregation |

## Verification checklist

A source is not production-ready until the repository records:

- exact dataset, table and series identifier;
- geographic scope;
- population or economic denominator;
- unit and seasonal adjustment status;
- reference period and publication date;
- revision policy;
- machine-readable licence and attribution requirements;
- collector fixture copied from a real source response;
- validation against at least two published releases;
- failure behaviour when the source changes.
