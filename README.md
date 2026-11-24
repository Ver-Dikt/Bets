# BETS · Esports Intelligence

**Live website:** https://ver-dikt.github.io/Bets/

Open-source, research-grade mobile web application for CS2 and Dota 2. Uses real externally sourced finished matches and scheduled fixtures, independent probabilistic models and a chronological evaluation pipeline. **This is NOT a verified profitable betting system. No real bets are placed.**

## What works now

- **Match-first mobile UI**: upcoming fixtures, a labeled snapshot of live matches *when a verified source contains them*, source freshness and status.
- Clicking a scheduled match opens a complete **source-backed explanation**: both teams' Elo ratings, last-ten form, H2H, weights (65% Elo, 25% form, 10% H2H), uncalibrated probabilities, evidence counts and missing factors. Fixed hard rule: ten pre-match games minimum per team.
- Optional manually entered decimal bookmaker lines to calculate fair odds and mathematical EV. **No live bookmaker prices** are fetched, and the current model lacks independent calibration.
- **Real historical archive**: finished CS2 series from unofficial bo3.gg, finished Dota 2 maps from OpenDota. Provider IDs are used where possible for team-rename continuity.
- **Current and future fixtures**: bo3.gg through an **actual vendored MIT CS2API client**, and Dota schedule via dota.haglund.dev (Liquipedia-derived). Schedules remain read-only snapshots, not streaming real-time feeds.
- **CS2 map analysis**: collected finished-map scores from bo3.gg; an **actual vendored MIT csgopred MapModel** computes per-map Elo and optional *simulated* veto/Bo-series probabilities when enough historical maps and a known Bo-format exist. Never pretend simulated veto is official draft.
- **Walk-forward research**: Brier/log-loss comparison of Elo, form, H2H and fixed heuristic ensemble; no hindsight from matches with later timestamps.
- **Personal paper journal**: saved in this browser's localStorage and exported to JSON; no real-money placements.

## Real data automation (GitHub Actions)

| Workflow | Frequency | Action |
|---|---|---|
| `fixtures.yml` | Every 30 min (nominal) | Refresh source-labeled CS2/Dota fixture snapshot; skip invalid/failed source records |
| `collect.yml` | Daily | CS2 finished-series / Dota finished-map historical archive, incremental backfill |
| `maps.yml` | Every 6 hours (nominal) | Add real CS2 completed map scores, calculate map-model evidence |
| `pages.yml` | On relevant snapshot/code changes | Build and deploy fully static mobile site |
| `test.yml` | Every push | Node and Python unit tests and static artifact build |

GitHub Actions schedules may be delayed; APIs may rate-limit or change. There is NO continuously running backend on Pages. Missing Live, odds and roster data are labeled as missing rather than invented.

## Original open-source components **actually copied and used**

| Project | Vendored file(s) | Runtime integration | License |
|---|---|---|---|
| [tommhe14/CS2API](https://github.com/tommhe14/CS2API) | `vendor/CS2API/cs2api/*` | `scripts/fixtures_cs2_sdk.py` in fixture workflow | MIT (notice included) |
| [Aokua/csgopred](https://github.com/Aokua/csgopred) | `vendor/csgopred/map_elo.py` | `scripts/map-insights.py` in map workflow | Code MIT under upstream split license (notice included) |

Other ideas (PSR/HLTV Parser, OpenDota core, third-party studies) were examined, **not falsely claimed as copied**. See [docs/OPEN_SOURCE_INTEGRATIONS.md](docs/OPEN_SOURCE_INTEGRATIONS.md).

## Local development

Node 20+; Python 3.12 is used in some GitHub Actions collectors.

```bash
git clone https://github.com/Ver-Dikt/Bets.git
cd Bets
npm test
npm run dev
```

Open http://127.0.0.1:3000/ for the Node API version. `npm run build:pages` builds the static phone version into `dist/`. The local Node API serves archived match results and independent evaluation reports, but is **not protected for public hosting**. Keep it bound to localhost unless authentication is built.

## Known limitations

We have not verified real-time streams, team rosters/substitutions, CS2 player-level stats, official CS2 veto, Dota drafts/patches, source redistribution rights for commercial use, bookmaker tick data, historical odds backtesting, secure cloud journal or profitability. Map-based and ensemble probabilities are exploratory and not combined into a single calibrated predictive model.

**Security:** `Ver-Dikt/Bets` is currently a **PUBLIC** GitHub repository. All tracked code and data, including paths named `data/private`, are publicly accessible. No secrets should be committed. To protect research internals, move the protected pipeline to a separate PRIVATE repository before adding sensitive data; a public Pages deployment does not make repository source private.
