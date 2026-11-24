# BETS · Esports Intelligence

**Live website:** https://ver-dikt.github.io/Bets/

Open-source, research-grade mobile web application for CS2 and Dota 2. Uses real externally sourced finished matches and scheduled fixtures, independent probabilistic models and a chronological evaluation pipeline. **This is NOT a verified profitable betting system. No real bets are placed.**

## Research application

- CS2 and Dota 2 fixtures from bo3.gg, the Liquipedia-derived schedule and public Esport Agenda data. Includes Moscow-time date and tournament filters, source coverage and match analysis.
- Elo, recent form and H2H form the historical baseline. The CS2 map model and available roster metrics can contribute to exploratory match forecasts. Dota series probabilities project from a map model and assume independent maps.
- GitHub Actions appends timestamped forecasts, coverage gaps, series score updates and outcome checks to the shared journal. Individual paper entries remain in the browser.
- The chronological calibration report compares Brier, log loss and accuracy on the same holdout. Results with missing finish stamps receive a 24-hour embargo in historical replay.
- PARI matching covers the two-way winner market, with original timestamp and source. Automatic PARI collection requires an authorized feed. See [source configuration](docs/DATA_SOURCES.md).

### GitHub Actions

Fixture and journal snapshots run every 30 minutes, subject to runner scheduling. Archived results update daily. Maps update every six hours. GitHub Pages publishes snapshots. It does not run a continuous live scoring service.

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

Coverage of actual starters, stand-ins, vetoes, Dota drafts and round-level live telemetry depends on provider data. Map and roster additions are exploratory and separate from the held-out baseline calibration. Coverage varies by competition. The journal is preserved in repository history and tracks app-generated research forecasts.

**Security:** `Ver-Dikt/Bets` is currently a **PUBLIC** GitHub repository. All tracked code and data, including paths named `data/private`, are publicly accessible. No secrets should be committed. To protect research internals, move the protected pipeline to a separate PRIVATE repository before adding sensitive data; a public Pages deployment does not make repository source private.
