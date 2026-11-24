import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {mergeArchive} from '../src/archive.mjs';
import {researchArchive} from './research-archive.mjs';
import {featureNames,modelNames,replayResearch} from '../src/research.mjs';

const [directory,from,to,output]=process.argv.slice(2);
if(!directory||!output||![from,to].every(day=>/^\d{4}-\d{2}-\d{2}$/.test(day))||from>to)throw Error('Usage: node scripts/year-study.mjs <normalized supplemental results dir> <from> <to> <output>');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const files=(directory==='-'?[]:await readdir(directory)).filter(file=>/^(cs-|dota-)\d.*\.json$/.test(file)).sort();
const extra=(await Promise.all(files.map(file=>json(join(directory,file))))).flat();
if(directory!=='-'&&!extra.length)throw Error('No supplemental archives');
const base=await researchArchive(await json('data/private/matches.json'));
const combined=mergeArchive(base,extra);
const maps=(await json('data/private/maps.json')).matches;
const inputs={from,to,sources:files,hash:createHash('sha256').update(JSON.stringify(combined.archive.matches)).digest('hex')};
const games={};
for(const game of ['cs2','dota']){
 const all=replayResearch(combined.archive.matches,maps,game).filter(r=>r.date.slice(0,10)>=from&&r.date.slice(0,10)<=to);
 games[game]=all;
 const months={};
 for(const r of all){
  const month=r.date.slice(0,7);
  const stats=months[month]??={series:0,eligible:0};
  stats.series++;stats.eligible+=Number(r.eligible);
 }
 console.log(game,all.length,all.filter(r=>r.eligible).length,months);
}
console.log('Supplemental archive:',combined.report);
await writeFile(output,JSON.stringify({schemaVersion:1,inputs,featureNames,modelNames,games})+'\n');
