import {sameTeams} from './pari.mjs';

const minute = 60000;
const tournamentKey = name => name?.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function matchCsResults(records, history) {
  const primary = new Set(records.filter(record => /^bo3-\d+$/.test(record.fixtureId)).map(record => 'cs-' + record.fixtureId.slice(4)));
  const finished = history.filter(row => row.discipline === 'cs2' && row.kind === 'series' &&
    /^cs-\d+$/.test(row.id) && row.source?.startsWith('bo3.gg') && row.tournament).map(row=>({...row,game:'cs2'}));
  const unique = new Map();
  for (const record of records) {
    if (record.game !== 'cs2' || !/^agenda-cs2-/.test(record.fixtureId) || !record.tournament || !record.format) continue;
    const nearby = finished.filter(row => {
      const start = Date.parse(row.date);
      return !primary.has(row.id) && start > Date.parse(record.createdAt) &&
        Math.abs(start - Date.parse(record.kickoff)) <= 60 * minute &&
        row.format === record.format && tournamentKey(row.tournament) === tournamentKey(record.tournament) &&
        sameTeams(record, row);
    });
    if (nearby.length !== 1) continue;
    const row = nearby[0];
    if (unique.has(row.id)) {
      unique.set(row.id, null);
      continue;
    }
    const direct = sameTeams(record, row) === 1;
    const winner = row.winner === (direct ? row.a : row.b) ? record.a : record.b;
    unique.set(row.id, {...row, id: record.fixtureId, matchedProviderId: row.id, a: record.a, b: record.b, winner,
      providerTeamIds: direct ? row.providerTeamIds : row.providerTeamIds?.toReversed(),
      wins: direct ? row.wins : row.wins?.toReversed()});
  }
  return [...unique.values()].filter(Boolean);
}
