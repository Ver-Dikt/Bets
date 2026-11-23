# Bets: private-first development policy (2026-11-24)

Owner requested Bets for personal use first. The GitHub repository **must remain private**. Do not enable public GitHub Pages, publish internal documentation, or create a public mirror without a new explicit request.

## Personal v0.1
- Personal phone-oriented web UI, history of finished CS2/Dota 2 games, Elo-only baseline, paper journal, CSV/JSON-equivalent export.
- No real wagering / order placement / payments.
- No automatic third-party access to forecasts or research data.
- No real-money performance claim. Backtests require verified timestamped data and forward-only training.
- Upstream feeds must not be represented as verified live data.

## Deployment
A private repository does not itself host a server. The app needs a cloud host with access to the private repo. No such host is connected or deployed. Do not describe GitHub URLs as a working app or present a speculative Pages URL.
For local use, `node src/server.mjs` needs Node.js 20+.
