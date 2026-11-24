import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {researchArchive, recoveredPath,yearArchivePath} from './research-archive.mjs';
import {featureNames, modelNames, replayResearch} from '../src/research.mjs';

const [archive, mapArchive, recovered,year] = await Promise.all([
  readFile('data/private/matches.json', 'utf8'),
  readFile('data/private/maps.json', 'utf8'),
  ...[recoveredPath,yearArchivePath].map(path=>readFile(path,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return ''}))
]);
const {matches} = await researchArchive(JSON.parse(archive));
const maps = JSON.parse(mapArchive).matches;
const games = Object.fromEntries(['cs2', 'dota'].map(game => [game, replayResearch(matches, maps, game)]));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const data = {schemaVersion: 1, inputs: {matches: sha256(archive), maps: sha256(mapArchive), recovered: sha256(recovered),year:sha256(year)}, featureNames, modelNames, games};
await writeFile(process.argv[2] ?? 'data/tmp/research-data.json', JSON.stringify(data) + '\n');
for (const [game, rows] of Object.entries(games)) {
  const available = rows.filter(row => row.eligible);
  console.log(game, {series: rows.length, qualified: available.length, totals: available.filter(row => row.maps !== null).length});
}
