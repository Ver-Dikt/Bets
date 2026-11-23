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
