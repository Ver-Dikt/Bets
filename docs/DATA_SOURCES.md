# Source inventory / honest coverage

| Source | Content | Implementation | Caution |
|---|---|---|---|
| OpenDota /api/proMatches | Finished professional Dota maps | Read-only Worker API | Free rate limits; no complete real-time schedule; map-level, not BO3 series |
| bo3.gg finished API (unofficial) | CS2 daily finished events | Best effort Worker API | May reject / block / change; third-party endpoint not an official documented free API |
| HLTV | CS2 stats, rankings, rosters | Manual evidence source; no crawler | Site terms and protections; do not promise unrestricted free API |
| Liquipedia | Rosters and tournaments | Manual evidence source | Licensing / access conditions |
| Bookmakers | Price snapshots | Manual input only | No provider account access; no full historical line |
| Independent forecasters | Timestamped tips | Research-only | Duplicated tips, selective reports, paid data and survivorship bias |

## Desired future providers
Schedules, verified LIVE score, drafts/veto, economic state, odds with timestamps, roster versions, source provenance and licence checks. Never silently substitute historical finished matches for Live.

## Expanded schedule and research inputs

- Esport Agenda public structured schedule supplements bo3.gg and the Liquipedia-derived Dota schedule for today's games. The displayed best-of is used when explicitly available. A source-name match requires distinct teams and compatible start times. Matching two listings alone does not guarantee they have independent upstream sources.
- Team profiles are fetched from bo3.gg and OpenDota for a bounded set of upcoming matches. A roster is shown after identity and five-player checks. These profiles are not confirmed lineups for a specific match. The roster factor and simulated CS2 veto remain exploratory and are not part of the chronological baseline report.
- OpenDota Live is filtered to recent professional maps. It does not establish a link to a scheduled series. Score-conditioned series calculations require a linked provider series and a previously recorded forecast. Detailed real-time data depend on provider coverage.
- PandaScore fixtures, scores and finals are optional via the GitHub Actions secret `BETS_PANDASCORE_TOKEN`. Enable only with terms that permit the intended use and publication.
- `BETS_PARI_FEED_URL` accepts an authorized HTTPS endpoint returning normalized JSON `{schemaVersion:1, bookmaker:"PARI", observedAt, events:[{id,game,a,b,date,tournament,format,status,odds:[a,b]}]}`. UTC timestamps or explicit offsets are required. This is a Bets input contract, not an official PARI API. The public PARI page was independently available for comparison, but the executable production feed has not been verified. A local capture with the same contract can be supplied via `BETS_PARI_CAPTURE_PATH`; this configuration is for local checks and should not be used to publish private screenshots or capture data.
- The source code and license notices of the vendored packages matched their upstream copies at csgopred `fce7cfc07351df540bedccac3c71808295d6fa34` and CS2API `fec0f6755dac3b4dc6b70d4bcf672d3fb9fb5c6b`. Code licenses are separate from conditions covering source data.
