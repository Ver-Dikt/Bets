// Static GitHub Pages package: only selected public fields are shipped to the website.
// Note: making the whole source repository Public also exposes its tracked Git files.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(process.cwd()),dist=resolve(root,'dist');
const read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const archive=await read('data/private/matches.json');
if(archive.schemaVersion!==1||!Array.isArray(archive.matches))throw Error('Cannot publish without verified match archive');
const safe=archive.matches.filter(m=>m&&typeof m.id==='string'&&['cs2','dota'].includes(m.discipline)&&typeof m.a==='string'&&typeof m.b==='string'&&(m.winner===m.a||m.winner===m.b)&&Number.isFinite(Date.parse(m.date))).map(m=>({
  id:m.id,discipline:m.discipline,date:m.date,a:m.a,b:m.b,winner:m.winner,
  source:m.source,kind:m.kind,format:m.format||null,tournament:m.tournament||null,
  providerTeamIds:Array.isArray(m.providerTeamIds)?m.providerTeamIds:null
})).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
if(safe.length<1)throw Error('No finished games; refusing empty site publication');
await mkdir(dist,{recursive:true});
for(const filename of ['index.html','main.js','analysis.mjs','settlement.mjs','manifest.webmanifest','sw.js']){
 await copyFile(resolve(root,'site',filename),resolve(dist,filename));
}
for(const filename of ['engine.mjs','identity.mjs','icon.svg']){
 await copyFile(resolve(root,'public',filename),resolve(dist,filename));
}
const report=await read('data/private/report.json').catch(()=>null);
const publishedReport={schemaVersion:1,games:{}};
for(const game of ['cs2','dota']){
 const x=report?.games?.[game];if(!x)continue;
 publishedReport.games[game]={rows:x.rows,tested:x.tested,coverage:x.coverage,quality:{}};
 for(const type of ['ensemble','elo','form','h2h']){
  const q=x.quality?.[type];
  if(q)publishedReport.games[game].quality[type]={brier:q.brier,logloss:q.logloss,resolved:q.resolved};
 }
}
await writeFile(resolve(dist,'snapshot.json'),JSON.stringify({schemaVersion:1,updatedAt:archive.updatedAt,matches:safe})+'\n');
await writeFile(resolve(dist,'report.json'),JSON.stringify(publishedReport)+'\n');
const schedule=await read('data/public/fixtures.json').catch(()=>null);
const publicSchedule=schedule?.schemaVersion===1&&Array.isArray(schedule.fixtures)?schedule:{schemaVersion:1,generatedAt:null,fixtures:[],sources:{cs2:{ok:false,error:'Not collected'},dota:{ok:false,error:'Not collected'}}};
await writeFile(resolve(dist,'fixtures.json'),JSON.stringify(publicSchedule)+'\n');
const mapData=await read('data/public/map-insights.json').catch(()=>null);
const pubMap=mapData?.schemaVersion===1&&mapData.insights?mapData:{schemaVersion:1,generatedAt:null,historicalMaps:0,insights:{}};
await writeFile(resolve(dist,'map-insights.json'),JSON.stringify(pubMap)+'\n');
await writeFile(resolve(dist,'.nojekyll'),'');
console.log('Bets Pages artifact built:',safe.length,'finished games. Full private archive is not copied to site.');
