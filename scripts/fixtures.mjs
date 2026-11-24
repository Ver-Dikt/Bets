#!/usr/bin/env node
// Public GitHub Pages data collector. This is a periodically refreshed snapshot,
// NOT a streaming live API. Sources are unofficial and may fail/rate-limit.
import {fetchJson} from '../src/collect.mjs';
import {enrichRosters} from '../src/rosters.mjs';
import {agendaFixtures} from '../src/esportagenda.mjs';
import {fetchDotaLive} from '../src/opendota-live.mjs';
import {pandaFixtures} from '../src/pandascore.mjs';
import {readJournal, updateJournal} from './journal.mjs';
import {readArchive} from '../src/archive.mjs';
import {loadPari, joinPari, sameTeams} from '../src/pari.mjs';
import {normalizeCSFixtures,normalizeDotaFixtures,mergeFixtures} from '../src/fixtures.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';

const dest=resolve(process.env.BETS_FIXTURES_PATH??'data/public/fixtures.json');
let previous=null;
try{previous=JSON.parse(await readFile(dest,'utf8'))}catch{}
const fetchedAt=new Date().toISOString();
const feeds=[],errors=[],status={};
const config=[
 {key:'cs2',source:'bo3.gg (unofficial)',url:'https://api.bo3.gg/api/v1/matches?scope=widget-matches&page%5Boffset%5D=0&page%5Blimit%5D=100&sort=start_date&filter%5Bmatches.status%5D%5Bin%5D=upcoming%2Ccurrent&filter%5Bmatches.discipline_id%5D%5Beq%5D=1&with=teams%2Ctournament%2Cgames%2Cstreams',parser:normalizeCSFixtures},
 {key:'dota',source:'dota.haglund.dev (Liquipedia schedule)',url:'https://dota.haglund.dev/v1/matches',parser:normalizeDotaFixtures}
];
for(const src of config){
 try{
  let payload=null;
  if(src.key==='cs2'){
   try{payload=JSON.parse(await readFile(resolve('data/tmp/cs2_sdk_payload.json'),'utf8'));console.log('Using bundled MIT CS2API SDK for CS2 discovery')}catch{}
  }
  if(payload===null)payload=await fetchJson(src.url,{retries:1});
  let normalized=src.parser(payload,{fetchedAt});
  // Real upcoming data are future fixtures. Live states may already have begun,
  // but must expire in the client if this snapshot becomes stale.
  normalized=normalized.filter(x=>x.status==='live'?Date.now()-Date.parse(x.date)<8*3600000:Date.parse(x.date)>Date.now());
  feeds.push(normalized);
  status[src.key]={ok:true,source:src.source,checkedAt:fetchedAt,fixtures:normalized.length};
  console.log(src.key+': '+normalized.length+' validated records');
 }catch(e){
  const error=String(e?.message||e);
  errors.push(src.key+': '+error);
  status[src.key]={ok:false,source:src.source,checkedAt:fetchedAt,error};
  console.error('SOURCE ERROR: '+src.key+': '+error);
  // Reuse recently fetched upcoming fixtures ONLY, clearly mark as stale.
  // Never show old LIVE as a current live match.
  const last=previous?.fixtures?.filter(x=>x.game===src.key&&x.status==='upcoming')||[];
  feeds.push(last.filter(row=>Date.parse(row.date)>Date.now()&&Date.now()-Date.parse(row.fetchedAt)<4*3600000));
 }
}
try{
 const live=await fetchDotaLive(new Date().toISOString());
 feeds.push(live);
 status['opendota-live']={ok:true,source:'OpenDota Live',checkedAt:fetchedAt,fixtures:live.length};
}catch{
 status['opendota-live']={ok:false,source:'OpenDota Live',checkedAt:fetchedAt,error:'Источник недоступен'};
}
const agenda=await Promise.allSettled(['cs2','dota'].map(game=>agendaFixtures(game,fetchedAt)));
for(const [index,entry] of agenda.entries()){
 const key='agenda-'+['cs2','dota'][index];
 if(entry.status==='fulfilled'){
  feeds.push(entry.value);
  status[key]={ok:true,source:'Esport Agenda · '+key.slice(7),checkedAt:fetchedAt,fixtures:entry.value.length};
 }else status[key]={ok:false,source:'Esport Agenda · '+key.slice(7),checkedAt:fetchedAt,error:'Расписание недоступно'};
}
const results=[];
const optional=await Promise.allSettled(['cs2','dota'].map(game=>pandaFixtures(game,fetchedAt)));
for(const [index,entry] of optional.entries()){
 const key='panda-'+['cs2','dota'][index];
 if(entry.status==='rejected'){
  status[key]={ok:false,source:'PandaScore',checkedAt:fetchedAt,error:'Недоступен или не покрывает запрошенный матч'};
 }else if(entry.value){
  const {active,finished}=entry.value;
  feeds.push(active);
  status[key]={ok:true,source:'PandaScore',checkedAt:fetchedAt,fixtures:active.length};
  for(const row of finished){
   results.push({...row,discipline:row.game,kind:'series',winner:row.winnerIndex===0?row.a:row.b});
  }
 }
}
const pari=await loadPari({fetchedAt});
status.pari=pari.source;
const merged=mergeFixtures(...feeds);
const secondary=merged.filter(row=>row.source==='Esport Agenda'||row.source==='PandaScore');
const excluded=new Set();
for(const item of secondary){
 const same=merged.filter(row=>row.id!==item.id&&row.status===item.status&&
   (row.source==='bo3.gg (unofficial)'||row.source==='dota.haglund.dev (Liquipedia schedule)')&&
   Math.abs(Date.parse(item.date)-Date.parse(row.date))<=30*60000&&sameTeams(row,item));
 if(same.length===1){
  const other=same[0];
  other.confirmation=[...new Set([...(other.confirmation??[]),item.source])];
  excluded.add(item.id);
 }
}
const joined=joinPari(merged.filter(row=>!excluded.has(row.id)),pari.lines,new Date().toISOString());
const archive=await readArchive(resolve(process.env.BETS_ARCHIVE_PATH??'data/private/matches.json'));
const fixtures=await enrichRosters(mergeFixtures(joined.fixtures).slice(0,300),archive.matches,previous?.fixtures??[],fetchedAt);
const recordedAt=new Date().toISOString();
const snapshot={schemaVersion:1,generatedAt:recordedAt,fixtures,sources:status,pariCoverage:joined.coverage,
  label:'Source-labeled fixture and bookmaker snapshots.'};
await mkdir(dirname(dest),{recursive:true});
const journalPath=resolve(process.env.BETS_JOURNAL_PATH??'data/public/journal.json');
const before=await readJournal(journalPath);
const optionalJson=async file=>JSON.parse(await readFile(file,'utf8').catch(error=>{
 if(error.code==='ENOENT')return '{}';
 throw error;
}));
const mapInsights=await optionalJson('data/public/map-insights.json');
const report=await optionalJson('data/private/report.json');
const updated=updateJournal(before,fixtures,archive.matches,results,recordedAt,mapInsights.insights,report.games);
if(updated.events.length!==before.events.length){
 await mkdir(dirname(journalPath),{recursive:true});
 await writeFile(journalPath,JSON.stringify(updated)+'\n');
}
await writeFile(dest,JSON.stringify(snapshot,null,2)+'\n');
console.log('Saved',fixtures.length,'public fixtures, errors:',errors.length);
if(errors.length)console.log('SOURCE WARNINGS:',errors.join('; '));
