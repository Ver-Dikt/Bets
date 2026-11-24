import {fetchJson, sleep} from './collect.mjs';

export function parseDotaDetails(row, detail) {
  const teamIds = [detail?.radiant_team_id, detail?.dire_team_id].map(String);
  if (row.id !== 'dota-' + detail?.match_id || !row.providerTeamIds?.every((id, i) => id === teamIds[i]) ||
    Date.parse(row.date) !== detail.start_time * 1000 || typeof detail.radiant_win !== 'boolean' ||
    (detail.radiant_win ? row.a : row.b) !== row.winner) return null;
  const patch = Number.isSafeInteger(detail.patch) && detail.patch >= 0 ? 'OpenDota #' + detail.patch : null;
  const members = [[], []];
  for (const player of Array.isArray(detail.players) ? detail.players : []) {
    if (!Number.isSafeInteger(player?.account_id) || player.account_id <= 0 ||
      player.account_id >= 4294967295 || !Number.isInteger(player.player_slot)) continue;
    members[Number(Boolean(player.player_slot & 128))].push(String(player.account_id));
  }
  const valid = members.every(side => side.length === 5) && new Set(members.flat()).size === 10;
  return {...row, patch, lineups: valid ? members : null};
}

export async function enrichDotaMatches(rows, {limit = 8, request = fetchJson, wait = sleep} = {}) {
  const candidates = rows.filter(row => row.seriesId && row.providerTeamIds?.every(Boolean))
    .sort((a, b) => Number(b.id.slice(5)) - Number(a.id.slice(5))).slice(0, limit);
  const enriched = new Map();
  let failed = 0;
  for (const row of candidates) {
    if (enriched.size + failed) await wait(1200);
    try {
      const detail = await request('https://api.opendota.com/api/matches/' + row.id.slice(5), {retries: 0});
      const result = parseDotaDetails(row, detail);
      if (result) enriched.set(row.id, result);
      else failed++;
    } catch {
      failed++;
    }
  }
  return {rows: rows.map(row => enriched.get(row.id) ?? row), checked: candidates.length, failed};
}
