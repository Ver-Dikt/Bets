# Open-source research adopted into Bets

**Policy:** use public repositories as reference implementations and integrate ideas into our own baseline, without misrepresenting their results or copying unlicensed code. This document does NOT certify upstream endpoints, redistributable data rights or model calibration.

| Source | License in upstream repo | Research reference | Current Bets integration |
|---|---|---|---|
| [OpenDota core](https://github.com/odota/core) | MIT | Dota API and replay infrastructure | Normalization of finished pro match API only, not full server |
| [Clarity](https://github.com/skadistats/clarity) | BSD-3-Clause | Replay parser | Deferred; Java replay parsing is overkill for current Node version |
| [CS2 prediction](https://github.com/lc-leonardo/cs2-match-prediction) | MIT | Temporal feature engineering and calibration evaluation | Forward-only chronology and model comparison |
| [HLTV Parser / PSR](https://github.com/Antosha122/HLTV_parser) | MIT | Elo, recent form, H2H, veto, backtest | Elo + form + H2H independent implementation; veto deferred until actual map data |
| [csgopred](https://github.com/Aokua/csgopred) | Check upstream license file before reuse | Reproducibility, ranking, holdout, calibration | Chronological validation philosophy; no source code copied |
| [bo3datacollector](https://github.com/gottenw/bo3datacollector) | No repository license confirmed | Structure of bo3.gg response | Independently written strict normalizer; no upstream source code copied |

## Model status
Current `ensemble-v1-uncalibrated` combines raw Elo with recent-team form and smoothed H2H at fixed 65/25/10 weights. These are **heuristics**, not statistically validated optimal weights. The `compareModels` function evaluates each component and the ensemble on equal forward-only events; it does not train or select weights. Real data import, source licensing checks, entity normalization, roster tracking, map veto and calibration are necessary before making reliable forecasts.

The current match feed is incomplete and may block requests. Never substitute synthetic data for a match or mislabel a historical fixture as Live.

## License review
Before copying any third-party implementation rather than reproducing an algorithm independently, inspect its LICENSE, dependency licenses and attribution requirements. Public repository does not equal public-domain code. Data services have separate conditions from code licenses.
