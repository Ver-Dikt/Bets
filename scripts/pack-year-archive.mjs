import {readFile,readdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';
import {mergeArchive,emptyArchive} from '../src/archive.mjs';
import {yearArchivePath} from './research-archive.mjs';

const [directory]=process.argv.slice(2);
if(!directory)throw Error('Usage: node scripts/pack-year-archive.mjs <normalized supplemental results directory>');
const files=(await readdir(directory)).filter(file=>/^(cs-|dota-)\d.*\.json$/.test(file)).sort();
const captures=(await Promise.all(files.map(file=>readFile(join(directory,file),'utf8').then(JSON.parse)))).flat();
if(!captures.length)throw Error('No supplemental captures');
const {archive,report}=mergeArchive(emptyArchive(),captures);
if(report.rejected||report.conflicts)throw Error('Conflicting or invalid supplemental rows');
const payload=gzipSync(JSON.stringify(archive.matches),{level:9}).toString('base64');
await writeFile(yearArchivePath,JSON.stringify({schemaVersion:1,encoding:'gzip+base64',count:archive.matches.length,
 sources:['bo3.gg finished matches','OpenDota proMatches cursor archive'],payload})+'\n');
console.log('Packed',archive.matches.length,'provider observations from',files.length,'responses');
