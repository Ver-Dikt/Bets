# GitHub Pages setup

A complete static phone preview can be published as `https://ver-dikt.github.io/Bets/` **after** it is actually deployed and verified. The URL is not currently confirmed live.

## Switching visibility

GitHub `Settings → General → Danger Zone → Change repository visibility → Public` can be performed by the owner. The connected GitHub application currently cannot edit visibility.

**Risk**: this reveals the complete Git history and all tracked source files, including `src/`, `tests/`, `docs/`, and `data/private/`. If you want to hide internals, don't make this repository public. Instead create a **separate** public repository for the sanitized `dist/` only, and leave `Ver-Dikt/Bets` private. A Pages deployment does not protect a public source repository.

## Activating Pages

In the repository: `Settings → Pages → Build and deployment → Source: GitHub Actions`. Then run `Actions → Bets GitHub Pages → Run workflow` to publish `dist/`. The workflow is configured to skip while this source repository is private. It should also publish on relevant pushes after the visibility change.

The deployed site is a static historical-data snapshot with browser-only paper forecasting. It has no private backend, account protection, true Live endpoint, or automatic latest data beyond new archive commits.

No Pages deployment should be considered successful until GitHub Actions shows a successful job and the URL responds.
