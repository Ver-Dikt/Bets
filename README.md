# Bets — CS2 & Dota 2 research PWA

Free-first esports analysis, without real wagering or paid AI APIs.

## Implemented
- Responsive mobile page and browser-side paper journal.
- Server-side OpenDota finished pro-match feed and best-effort unofficial bo3.gg CS2 finished match feed.
- Elo + recent form + head-to-head heuristic ensemble trained only on events **before** target match; separate game ratings. Compare components with a forward-only Brier/log-loss backtest. Model is currently **uncalibrated**.
- Minimum historical coverage before any probability is shown, and honest source errors.
- Fair odds, bookmaker overround, EV, Brier score and JSON journal export.

Integration references and license cautions: [docs/OPEN_SOURCE_INTEGRATIONS.md](docs/OPEN_SOURCE_INTEGRATIONS.md).

## Not yet implemented
- Real-time verified live feed, reliable future fixtures, year-long historical backfill, cloud-synced immutable forecast log, full bookmaker odds history, calibrated ML and independent profitable track record.
- Source APIs may change, rate-limit or disallow scraping. Never invent missing matches, lines or results.

## Local / Cloudflare
```
npm install
npm test
npm run dev
npm run deploy
```
Cloudflare Worker deployment requires a connected Cloudflare account. Pushing to GitHub alone does NOT make the PWA public. The Cloudflare free tier is subject to quotas.

## Research rules
Forecasts must be timestamped before kickoff. Train on older events only, evaluate with rolling chronological splits, and track Brier, log loss, calibration, coverage, selection bias, and paper ROI at actually observed odds. Avoid leakage from later markets or result edits.

## Privacy
No Telegram sign-in, no payments, no API secrets in browser. Paper forecasts live in the browser until server-side auditing is built. Export frequently. Forecasts and resolutions saved locally are not tamper-proof.
