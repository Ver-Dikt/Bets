// Static GitHub Pages package: only selected public fields are shipped to the website.
// Note: making the whole source repository Public also exposes its tracked Git files.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifiedMapCount} from '../src/settlement.mjs';
import {readJournal} from './journal.mjs';
import {researchArchive} from './research-archive.mjs';
const root=resolve(process.cwd()),dist=resolve(root,'dist');
const read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const archive=await researchArchive(await read('data/private/matches.json'));
if(archive.schemaVersion!==1||!Array.isArray(archive.matches))throw Error('Cannot publish without verified match archive');
const safe=archive.matches.filter(m=>m&&typeof m.id==='string'&&['cs2','dota'].includes(m.discipline)&&typeof m.a==='string'&&typeof m.b==='string'&&(m.winner===m.a||m.winner===m.b)&&Number.isFinite(Date.parse(m.date))).map(m=>({
  id:m.id,discipline:m.discipline,date:m.date,a:m.a,b:m.b,winner:m.winner,
  finishedAt:m.finishedAt??null,resultObservedAt:m.resultObservedAt??null,source:m.source,kind:m.kind,format:m.format||null,tournament:m.tournament||null,
  resultKind:m.resultKind??null,mapCount:verifiedMapCount(m),
  providerTeamIds:Array.isArray(m.providerTeamIds)?m.providerTeamIds:null
})).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
if(safe.length<1)throw Error('No finished games; refusing empty site publication');
await mkdir(dist,{recursive:true});
const shellHash=createHash('sha256');
for(const [folder,files] of [
 ['site',['index.html','main.js','brief.mjs','manifest.webmanifest']],
 ['src',['analysis.mjs','daily.mjs','settlement.mjs','live.mjs','calibration.mjs','evidence-time.mjs','roster-factor.mjs']],
 ['public',['engine.mjs','identity.mjs','icon.svg']]
]){
 for(const file of files){
  const asset=await readFile(resolve(root,folder,file));
  shellHash.update(file+'\0').update(asset);
  await writeFile(resolve(dist,file),asset);
 }
}
const worker=await readFile(resolve(root,'site/sw.js'),'utf8');
const version=shellHash.update(worker).digest('hex').slice(0,16);
await writeFile(resolve(dist,'sw.js'),worker.replace('__SHELL_VERSION__',version));
await copyFile(resolve(root,'site/brief.json'),resolve(dist,'brief.json'));
await copyFile(resolve(root,'site/pari-screenshots.json'),resolve(dist,'pari-screenshots.json'));
const report=await read('data/private/report.json').catch(()=>null);
const publishedReport={schemaVersion:1,games:{}};
for(const game of ['cs2','dota']){
 const x=report?.games?.[game];if(!x)continue;
 publishedReport.games[game]={rows:x.rows,tested:x.tested,coverage:x.coverage,earliest:x.earliest,latest:x.latest,calibration:x.calibration,quality:{}};
 for(const type of ['ensemble','elo','form','h2h']){
  const q=x.quality?.[type];
  if(q)publishedReport.games[game].quality[type]={brier:q.brier,logloss:q.logloss,resolved:q.resolved};
 }
}
await writeFile(resolve(dist,'snapshot.json'),JSON.stringify({schemaVersion:1,updatedAt:archive.updatedAt,matches:safe})+'\n');
await writeFile(resolve(dist,'report.json'),JSON.stringify(publishedReport)+'\n');
const schedule=await read('data/public/fixtures.json').catch(()=>null);
const publicSchedule=schedule?.schemaVersion===1&&Array.isArray(schedule.fixtures)?schedule:{schemaVersion:1,generatedAt:null,fixtures:[],sources:{cs2:{ok:false,error:'Not collected'},dota:{ok:false,error:'Not collected'}}};
await writeFile(resolve(dist,'fixtures.json'),JSON.stringify({...publicSchedule,fixtures:publicSchedule.fixtures.map(({score,...row})=>row)})+'\n');
const journal=await readJournal(resolve(root,'data/public/journal.json'));
const publicJournal=journal.events.map(({score,prevHash,hash,...event})=>event);
await writeFile(resolve(dist,'journal.json'),JSON.stringify({schemaVersion:1,events:publicJournal})+'\n');
const models=await read('data/private/research-models.json').catch(error=>{if(error.code==='ENOENT')return null;throw error});
const research={version:models?.version??null,games:Object.fromEntries(Object.entries(models?.games??{}).map(([game,content])=>[game,content.report]))};
await writeFile(resolve(dist,'research.json'),JSON.stringify(research)+'\n');
const mapData=await read('data/public/map-insights.json').catch(()=>null);
const pubMap=mapData?.schemaVersion===1&&mapData.insights?mapData:{schemaVersion:1,generatedAt:null,historicalMaps:0,insights:{}};
await writeFile(resolve(dist,'map-insights.json'),JSON.stringify(pubMap)+'\n');
await writeFile(resolve(dist,'.nojekyll'),'');
let revision=process.env.GITHUB_SHA??null;
try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{}
await writeFile(resolve(dist,'release.json'),JSON.stringify({revision,builtAt:new Date().toISOString()})+'\n');
console.log('Bets Pages artifact built:',safe.length,'finished games. Full private archive is not copied to site.');
