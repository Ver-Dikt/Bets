# Bets — private CS2 + Dota 2 research app

**Current mode: personal/private.** [Ver-Dikt/Bets](https://github.com/Ver-Dikt/Bets) is a PRIVATE repository. This is a working local web app with a GitHub-hosted historical data collector, **not yet an internet-hosted PWA**. No paid data source, bookmaker login, actual wagers or simulated real-match results.

## Working features

- Responsive mobile-first research UI at `http://127.0.0.1:3000/` when locally started.
- OpenDota professional finished **maps** and unofficial bo3.gg finished CS2 **series**; each match records source, timestamp, both teams and winner.
- Strict source normalization, stable provider team identifiers when available, duplicate rejection, provider conflict detection and atomic JSON archive saving.
- GitHub Actions private daily collector. Historical scan moves backward by up to 30 calendar days each daily run (CS2) and by older match-ID cursor for Dota 2; source failures are reported.
- Elo + recent form + head-to-head heuristic (fixed weights 65/25/10). The model is **uncalibrated**.
- Independent chronological one-pass backtest and model comparison: Brier Score, log loss, coverage; no match result is used before its timestamp.
- Paper-only forecast journal in browser local storage; import/export as JSON. It is **not** tamper-proof or synced between devices.

## Run without any hosting provider

Requires **Node.js 20+**, recommended 22:

```bash
git clone https://github.com/Ver-Dikt/Bets.git
cd Bets
npm run dev
```

Open `http://127.0.0.1:3000/`. By default the server binds only to `127.0.0.1`; no public network exposure. To access it over a *trusted local network*, explicitly set `BETS_HOST=0.0.0.0` and secure your network first.

```bash
npm test
npm run backfill -- --help
npm run backfill -- --game cs2 --from 2026-11-01 --to 2026-11-07 --max-requests 7
npm run backfill -- --game dota --pages 5
```

Manual local backfill defaults to `.data/matches.json` (git-ignored). If `data/private/matches.json` exists from GitHub Actions, the local server prefers that file; you can override with `BETS_ARCHIVE_PATH`. Archive files saved to the PRIVATE repo are not served as web static files, but their normalized historical matches are readable on the personal app API. **Do not deploy this private API publicly without authentication and authorization.**

## GitHub-native data collector

Use **Actions → Bets Private Match Archive → Run workflow** for immediate collection without a PC. Daily collection is scheduled within GitHub. The first archive run completed on November 23, 2026; contents grow over time. Check Actions run status and `data/private/matches.json` to confirm actual volume and source errors.

Available manual modes: `all`, `cs2_recent`, `cs2_older`, `cs2_range`, `dota_recent`, `dota_older`. Date-scoped manual range is limited to 31 requests per run. Sources are polled with a minimum 1.1-second interval and retries. GitHub Actions free-plan quotas apply; scheduled runs may be delayed or disabled by GitHub. No promise of uptime.

The private report is saved as `data/private/report.json` after collection.

## Endpoints

- `GET /api/health`
- `GET /api/archive/status`
- `GET /api/archive?game=cs2&limit=1000`
- `GET /api/evaluate?game=dota&warmup=100`
- `GET /api/cs/history?date=YYYY-MM-DD` and `GET /api/dota/history`

The latter two fetch from upstream on demand; an upstream HTTP error is returned rather than hidden.

## What is NOT done

A verified complete future fixtures feed, Live scores, best-of-series Dota aggregation, lineup/map veto statistics, source-specific licensing review for public redistribution, bookmaker timestamped odds, automatically verified forecast settlement, secure multi-device forecast history, cloud hosting, calibrated/profitable predictions and proof of market advantage. A low Brier value on the current small, selected retrospective sample is **not** evidence of profitable betting performance.

## Security and science

- Keep the GitHub repository PRIVATE. Nothing from `data/private` should be copied to a future public GitHub Pages repository.
- Never commit credentials. The local web server is intentionally bound to localhost by default.
- Forecast timestamps must be earlier than the match. Historical backtests train on older results only, with same-time events grouped to avoid leakage. Model weights are *not* tuned using the displayed holdout.
- Research methodology: [Model validation](docs/MODEL_VALIDATION.md), [sources](docs/DATA_SOURCES.md), [open-source references](docs/OPEN_SOURCE_INTEGRATIONS.md), [private policy](docs/PRIVATE_FIRST.md).
