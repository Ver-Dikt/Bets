# Open-source research adopted into Bets

**Policy:** use public repositories as reference implementations and integrate ideas into our own baseline, without misrepresenting results and with license notices for copied source files. This document does NOT certify upstream endpoints, redistributable data rights or model calibration.

| Source | License in upstream repo | Research reference | Current Bets integration |
|---|---|---|---|
| [OpenDota core](https://github.com/odota/core) | MIT | Dota API and replay infrastructure | Normalization of finished pro match API only, not full server |
| [Clarity](https://github.com/skadistats/clarity) | BSD-3-Clause | Replay parser | Deferred; Java replay parsing is overkill for current Node version |
| [CS2 prediction](https://github.com/lc-leonardo/cs2-match-prediction) | MIT | Temporal feature engineering and calibration evaluation | Forward-only chronology and model comparison |
| [HLTV Parser / PSR](https://github.com/Antosha122/HLTV_parser) | MIT | Elo, recent form, H2H, veto, backtest | Elo + form + H2H independent implementation; veto deferred until actual map data |
| [csgopred](https://github.com/Aokua/csgopred) | Split: MIT source code, CC BY 4.0 data/docs | **Actual** map Elo/veto MapModel source | `vendor/csgopred/map_elo.py`, `scripts/map-insights.py` (active map workflow, requires verified history) |
| [CS2API](https://github.com/tommhe14/CS2API) | MIT | **Actual** Python bo3.gg client code | `vendor/CS2API/cs2api/`, `scripts/fixtures_cs2_sdk.py` (active schedule workflow) |
| [bo3datacollector](https://github.com/gottenw/bo3datacollector) | No repository license confirmed | Structure of bo3.gg response | Independently written strict normalizer; no upstream source code copied |

## Model status
Current `ensemble-v1-uncalibrated` combines raw Elo with recent-team form and smoothed H2H at fixed 65/25/10 weights. These are **heuristics**, not statistically validated optimal weights. The `compareModels` function evaluates each component and the ensemble on equal forward-only events; it does not train or select weights. Real data import, source licensing checks, entity normalization, roster tracking, verified CS2 map histories, official veto observations, roster tracking and calibration are necessary before making reliable forecasts. A separate MIT MapModel now calculates exploratory map probabilities and simulated (NOT actual) veto only when recorded map data and known series format are available.

The current fixture feed uses actual upstream clients but remains an intermittent GitHub Actions snapshot. Source APIs can block requests or lack matches. Never substitute synthetic data for a match or mislabel a historical fixture as Live.

## License review
Before copying any third-party implementation rather than reproducing an algorithm independently, inspect its LICENSE, dependency licenses and attribution requirements. Public repository does not equal public-domain code. Data services have separate conditions from code licenses.

## Reproducible upstream integration

- The actual copied `tommhe14/CS2API` source and its MIT notice are under `vendor/CS2API/`. Its `CS2APIClient` is called in GitHub Actions; it has already returned live bo3.gg schema `{total,results,links}` and a verified CS2 scheduled fixture. Node independently validates and normalizes the results before publication.
- The actual copied map model and upstream split-license notice are under `vendor/csgopred/`. `scripts/map-insights.py` invokes its `MapModel`, `map_rating`, `veto` and `series_prob` on verified prior map scores; never simulate source results to hide data gaps.
- `tests/test_vendor_map.py` tests the original model in Python. Node tests cover map-source normalization, team IDs, fixture analysis and forward-only chronology.
- No source code from `bo3datacollector` (no confirmed license) was copied; only data-format conventions were independently normalized.

**Accuracy caveat:** Different authors' reported accuracy metrics are not comparable across their datasets, match units or historical dates. Do not combine their claimed percentages or promise market advantage.
