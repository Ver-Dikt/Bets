// Package normalized results from independently captured provider responses.
// Raw responses stay outside Git. The bundle can be inspected with readRecovered.
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {mergeArchive, readArchive} from '../src/archive.mjs';
import {normalizeBo3, normalizeOpenDota} from '../src/providers.mjs';
import {parseDotaDetails} from '../src/dota-details.mjs';
import {recoveredPath} from './research-archive.mjs';

async function fromFolder(folder, normalize) {
  const files = (await readdir(folder)).filter(file => file.endsWith('.json')).sort();
  const rows = await Promise.all(files.map(async file => normalize(JSON.parse(await readFile(folder + '/' + file, 'utf8')))));
  return rows.flat();
}

const [archive, cs2, dota, details] = await Promise.all([
  readArchive('data/private/matches.json'),
  fromFolder(process.argv[2], normalizeBo3),
  fromFolder(process.argv[3], normalizeOpenDota),
  process.argv[4] ? fromFolder(process.argv[4], detail => [detail]) : []
]);
const byId = new Map(archive.matches.map(row => [row.id, row]));
const detailsById = new Map(details.map(detail => ['dota-' + detail.match_id, detail]));
const enriched = dota.map(row => detailsById.has(row.id) ? parseDotaDetails(row, detailsById.get(row.id)) ?? row : row);
const {archive: combined, report} = mergeArchive(archive, [...cs2, ...enriched]);
const recovered = combined.matches.filter(row => byId.get(row.id) !== row);
const payload = gzipSync(JSON.stringify(recovered), {level: 9}).toString('base64');
await writeFile(recoveredPath, JSON.stringify({schemaVersion: 1, encoding: 'gzip+base64', count: recovered.length,
  sources: ['bo3.gg finished matches', 'OpenDota proMatches'], payload}) + '\n');
console.log(report, {recovered: recovered.length, cs2: cs2.length, dota: dota.length});
