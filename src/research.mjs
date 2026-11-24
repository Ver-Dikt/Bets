import {canonicalizeMatches, resolveTeamName} from './identity.mjs';
import {dotaSeries} from './dota-series.mjs';
import {knownTime} from './evidence-time.mjs';
import {seriesChance, decidingMapTotal} from './live.mjs';
import {newRating, ratings, updateRatings, logistic} from './ratings.mjs';

export const games = {
  cs2: {halfLife: 200, formHalfLife: 35, eloScale: 1, eloK: .15, minSeries: 10, auxiliary: 'map pool'},
  dota: {halfLife: 100, formHalfLife: 24, eloScale: 1, eloK: .19, minSeries: 3, auxiliary: 'Radiant and Dire'}
};
export const researchFormats = ['Bo1', 'Bo3', 'Bo5', 'Bo7'];
export const modelNames = ['dynamicElo', 'glicko2', 'trueSkill', 'bradleyTerry', 'bayesian'];
export const featureNames = [
  ...modelNames, 'legacy', 'form5', 'form10', 'form20', 'opponentForm', 'h2h', 'rest', 'experience',
  'formatForm', 'tournamentForm', 'patchForm', 'patchEvidence', 'mapForm', 'mapEvidence', 'mapPool',
  'mapBalance', 'sideForm', 'lineupStability', 'playerExperience', 'playerForm', 'lineupEvidence', 'bo', 'formatEvidence', 'minSeries', 'isKnownTournament'
];
const day = 86400000;
const pairKey = (a, b) => [a, b].sort().join('\u0000');
const valid = row => row?.a && row.b && row.a !== row.b && [row.a, row.b].includes(row.winner) && Number.isFinite(Date.parse(row.date));
const normalizedTag = value => typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
const mean = values => values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : 0;
const sorted = rows => [...rows].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id));
const times = knownTime;
const form = (rows, n, prior = 6) => {
  const window = rows.slice(-n);
  return (prior / 2 + window.reduce((sum, entry) => sum + entry.win, 0)) / (window.length + prior);
};

export function observedMaps(row) {
  const target = (Number(row.format?.slice(2)) + 1) / 2;
  const wins = row.wins;
  if (!researchFormats.includes(row.format) || !Array.isArray(wins) || wins.length !== 2 ||
    !wins.every(n => Number.isInteger(n) && n >= 0) || ![row.a, row.b].includes(row.winner)) return null;
  const index = row.winner === row.a ? 0 : 1;
  return wins[index] === target && wins[1 - index] < target ? wins[0] + wins[1] : null;
}

function newTeam() {
  return {rating: newRating(), recent: [], mapRecent: [], maps: new Map(), sides: new Map(), lineups: []};
}

function newLegacyTeam() {
  return {rating: 0, matches: []};
}

// Same v1 Elo / 12-match form / 10-match H2H weights. The chronology
// requires a result to be available first. Dota's v1 controls are map based.
function updateLegacy(state, row) {
  const a = state.legacy.get(row.a) ?? newLegacyTeam();
  const b = state.legacy.get(row.b) ?? newLegacyTeam();
  const won = Number(row.winner === row.a);
  const delta = .06 * Math.log(10) * (won - logistic(a.rating - b.rating));
  a.rating += delta;
  b.rating -= delta;
  a.matches.push({win: won});
  b.matches.push({win: 1 - won});
  state.legacy.set(row.a, a);
  state.legacy.set(row.b, b);
  const key = pairKey(row.a, row.b);
  const pair = state.legacyPairs.get(key) ?? [];
  pair.push(row.winner);
  state.legacyPairs.set(key, pair);
}

function addMap(state, row) {
  const won = Number(row.winner === row.a);
  for (const [name, win, side] of [[row.a, won, 'radiant'], [row.b, 1 - won, 'dire']]) {
    const team = state.teams.get(name) ?? newTeam();
    const entry = {win, patch: normalizedTag(row.patch)};
    team.mapRecent.push(entry);
    const lineup = row.lineups?.[side === 'radiant' ? 0 : 1];
    if (Array.isArray(lineup) && lineup.length === 5 && new Set(lineup).size === 5) {
      team.lineups.push(lineup);
      for (const player of lineup) {
        const results = state.players.get(player) ?? [];
        results.push(entry);
        state.players.set(player, results);
      }
    }
    const key = state.game === 'cs2' ? row.map : side;
    const groups = state.game === 'cs2' ? team.maps : team.sides;
    if (key) {
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    state.teams.set(name, team);
  }
  if (state.game === 'dota') updateLegacy(state, row);
}

function addSeries(state, row, available) {
  const a = state.teams.get(row.a) ?? newTeam();
  const b = state.teams.get(row.b) ?? newTeam();
  const result = Number(row.winner === row.a);
  const aSkill = a.rating.elo;
  const bSkill = b.rating.elo;
  updateRatings(a.rating, b.rating, result, available, games[state.game]);
  for (const [name, team, win, opponent] of [[row.a, a, result, bSkill], [row.b, b, 1 - result, aSkill]]) {
    team.recent.push({win, opponent, format: row.format, tournament: normalizedTag(row.tournament), patch: normalizedTag(row.patch)});
    state.teams.set(name, team);
  }
  const key = pairKey(row.a, row.b);
  const list = state.pairs.get(key) ?? [];
  list.push(row.winner);
  state.pairs.set(key, list);
  if (state.game === 'cs2') updateLegacy(state, row);
}

function headRate(values, a) {
  const last = values.slice(-10);
  return (4 + last.filter(name => name === a).length) / (last.length + 8);
}

function features(state, row, at) {
  const a = state.teams.get(row.a) ?? newTeam();
  const b = state.teams.get(row.b) ?? newTeam();
  const values = ratings(a.rating, b.rating, at, games[state.game]);
  const legacyA = state.legacy.get(row.a) ?? newLegacyTeam();
  const legacyB = state.legacy.get(row.b) ?? newLegacyTeam();
  const key = pairKey(row.a, row.b);
  const legacyMap = .65 * logistic(legacyA.rating - legacyB.rating) +
    .25 * (.5 + .75 * (form(legacyA.matches, 12) - form(legacyB.matches, 12))) +
    .1 * headRate(state.legacyPairs.get(key) ?? [], row.a);
  const legacy = state.game === 'dota' ? seriesChance(legacyMap, row.format, [0, 0]) : legacyMap;
  const tournament = normalizedTag(row.tournament);
  const latestPatch = team => [...team.mapRecent].reverse().find(entry => entry.patch)?.patch;
  const patchA = latestPatch(a);
  const patchB = latestPatch(b);
  const patch = patchA && patchA === patchB ? patchA : null;
  const forFormat = team => team.recent.filter(entry => row.format && entry.format === row.format);
  const forTournament = team => team.recent.filter(entry => tournament && entry.tournament === tournament);
  const forPatch = team => [...team.recent, ...team.mapRecent].filter(entry => patch && entry.patch === patch);
  const mapKeys = [...a.maps.keys()].filter(map => b.maps.has(map)).sort();
  const mapStrength = mapKeys.map(map => form(a.maps.get(map), 12) - form(b.maps.get(map), 12));
  const sideRate = team => mean(['radiant', 'dire'].map(side => form(team.sides.get(side) ?? [], 12)));
  const logDays = team => Math.log1p(Math.min(120, team.rating.last ? (at - team.rating.last) / day : 120));
  const minSeries = Math.min(a.rating.seen, b.rating.seen);
  const currentLineup = team => team.lineups.at(-1) ?? [];
  const stability = team => currentLineup(team).filter(id => team.lineups.at(-2)?.includes(id)).length / 5;
  const playerStat = (team, measure) => mean(currentLineup(team).map(id => measure(state.players.get(id))));
  const metadata = {
    seriesA: a.rating.seen, seriesB: b.rating.seen,
    mapsA: a.mapRecent.length, mapsB: b.mapRecent.length,
    patchA: forPatch(a).length, patchB: forPatch(b).length,
    tournamentA: forTournament(a).length, tournamentB: forTournament(b).length,
    formA: form(a.recent, 10), formB: form(b.recent, 10),
    comparableMaps: mapKeys.length,
    lineupsA: a.lineups.length, lineupsB: b.lineups.length
  };
  const vector = {
    ...values, legacy: legacy ?? .5, form5: form(a.recent, 5) - form(b.recent, 5),
    form10: metadata.formA - metadata.formB, form20: form(a.recent, 20) - form(b.recent, 20),
    opponentForm: mean(a.recent.slice(-10).map(entry => entry.opponent)) - mean(b.recent.slice(-10).map(entry => entry.opponent)),
    h2h: headRate(state.pairs.get(key) ?? [], row.a), rest: logDays(a) - logDays(b),
    experience: Math.log1p(a.rating.seen) - Math.log1p(b.rating.seen),
    formatForm: form(forFormat(a), 10) - form(forFormat(b), 10),
    tournamentForm: form(forTournament(a), 10) - form(forTournament(b), 10),
    patchForm: form(forPatch(a), 15) - form(forPatch(b), 15),
    patchEvidence: Math.log1p(Math.min(metadata.patchA, metadata.patchB)),
    mapForm: form(a.mapRecent, 20) - form(b.mapRecent, 20),
    mapEvidence: Math.log1p(Math.min(metadata.mapsA, metadata.mapsB)),
    mapPool: mean(mapStrength), mapBalance: mean(mapStrength.map(Math.abs)),
    sideForm: sideRate(a) - sideRate(b),
    lineupStability: stability(a) - stability(b),
    playerExperience: playerStat(a, rows => Math.log1p(rows.length)) - playerStat(b, rows => Math.log1p(rows.length)),
    playerForm: playerStat(a, rows => form(rows, 15)) - playerStat(b, rows => form(rows, 15)),
    lineupEvidence: Math.log1p(Math.min(a.lineups.length, b.lineups.length)),
    bo: Number(row.format?.slice(2)) || 0,
    formatEvidence: Math.log1p(Math.min(forFormat(a).length, forFormat(b).length)),
    minSeries: Math.log1p(minSeries), isKnownTournament: Number(Boolean(tournament))
  };
  const eligible = researchFormats.includes(row.format) && legacy !== null && Math.min(legacyA.matches.length, legacyB.matches.length) >= 10 &&
    minSeries >= games[state.game].minSeries;
  const legacyTotal = decidingMapTotal(state.game === 'dota' ? legacyMap : legacy, row.format, state.game === 'dota' ? 'map' : 'series');
  return {
    eligible, metadata, vector: featureNames.map(name => vector[name]),
    mirrored: featureNames.map(name => mirror(name, vector[name])), baselineTotal: legacyTotal?.over ?? null
  };
}

const unsigned = new Set(['patchEvidence', 'mapEvidence', 'mapBalance', 'lineupEvidence', 'bo', 'formatEvidence', 'minSeries', 'isKnownTournament']);
const probabilities = new Set([...modelNames, 'legacy', 'h2h']);
function mirror(name, value) {
  if (unsigned.has(name)) return value;
  return probabilities.has(name) ? 1 - value : -value;
}

function makeRunner(matches, csMaps, game) {
  const rows = canonicalizeMatches(matches.filter(row => row.discipline === game && valid(row)));
  const series = sorted(game === 'cs2'
    ? rows.filter(row => row.kind === 'series')
    : canonicalizeMatches(dotaSeries(matches)));
  const byId = new Map(series.map(row => [row.id, row]));
  const maps = game === 'cs2'
    ? csMaps.filter(valid).map(row => {
      const parent = byId.get(row.seriesId);
      const known = parent && times(parent);
      return {...row, available: known > Date.parse(row.date) ? known : times(row)};
    })
    : rows.filter(row => row.kind === 'map').map(row => ({...row, available: times(row)}));
  const events = [
    ...series.map(row => ({row, time: times(row), kind: 'series'})),
    ...maps.map(row => ({row, time: row.available, kind: 'map'}))
  ].sort((a, b) => a.time - b.time || a.row.id.localeCompare(b.row.id));
  const state = {game, teams: new Map(), pairs: new Map(), legacy: new Map(), legacyPairs: new Map(), players: new Map()};
  let cursor = 0;
  function advance(at) {
    while (cursor < events.length && events[cursor].time < at) {
      const {row, time, kind} = events[cursor++];
      if (kind === 'series') addSeries(state, row, time);
      else addMap(state, row);
    }
  }
  return {rows, series, maps, advance, evaluate: (row, at) => features(state, row, at)};
}

export function replayResearch(matches, csMaps, game) {
  const runner = makeRunner(matches, csMaps, game);
  return runner.series.map(row => {
    const start = Date.parse(row.date);
    runner.advance(start);
    return {...runner.evaluate(row, start), id: row.id, date: row.date, format: row.format,
      available: times(row), actual: Number(row.winner === row.a), maps: observedMaps(row)};
  });
}

export function projectFeatures(matches, csMaps, fixtures, game, at) {
  const runner = makeRunner(matches, csMaps, game);
  runner.advance(at);
  const available = runner.rows.filter(row => times(row) < at);
  const result = new Map();
  for (const fixture of fixtures) {
    if (fixture.game !== game || fixture.status !== 'upcoming' || Date.parse(fixture.date) <= at ||
      !researchFormats.includes(fixture.format)) continue;
    try {
      const teams = [fixture.a, fixture.b].map((label, index) => {
        const id = String(fixture.providerIds?.[index] ?? '');
        return /^[1-9]\d{0,17}$/.test(id)
          ? (game === 'cs2' ? 'bo3:' : 'opendota:') + id
          : resolveTeamName(available, game, label);
      });
      if (teams[0] !== teams[1]) result.set(fixture.id, runner.evaluate({...fixture, a: teams[0], b: teams[1]}, at));
    } catch (error) {
      if (!error.message.includes('неоднозначно')) throw error;
    }
  }
  return result;
}
