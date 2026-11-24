#!/usr/bin/env node
// Public GitHub Pages data collector. This is a periodically refreshed snapshot,
// NOT a streaming live API. Sources are unofficial and may fail/rate-limit.
import {fetchJson} from '../src/collect.mjs';
import {normalizeCSFixtures,normalizeDotaFixtures,mergeFixtures} from '../src/fixtures.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';

const dest=resolve('data/public/fixtures.json');
let previous=null;
try{previous=JSON.parse(await readFile(dest,'utf8'))}catch{}
const fetchedAt=new Date().toISOString();
const feeds=[],errors=[],status={};
const config=[
 {key:'cs2',source:'bo3.gg (unofficial)',url:'https://api.bo3.gg/api/v1/matches?scope=widget-matches&page%5Boffset%5D=0&page%5Blimit%5D=100&sort=tier_rank%2C-start_date&filter%5Bmatches.status%5D%5Bin%5D=upcoming%2Ccurrent&filter%5Bmatches.discipline_id%5D%5Beq%5D=1&with=teams%2Ctournament%2Cgames%2Cstreams',parser:normalizeCSFixtures},
 {key:'dota',source:'dota.haglund.dev (Liquipedia schedule)',url:'https://dota.haglund.dev/v1/matches',parser:normalizeDotaFixtures}
];
for(const src of config){
 try{
  const payload=await fetchJson(src.url,{retries:1});
  let normalized=src.parser(payload,{fetchedAt});
  // Real upcoming data are future fixtures. Live states may already have begun,
  // but must expire in the client if this snapshot becomes stale.
  normalized=normalized.filter(x=>x.status==='live'||Date.parse(x.date)>=Date.now()-3*3600000);
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
  const oldTime=Date.parse(previous?.sources?.[src.key]?.checkedAt);
  if(Number.isFinite(oldTime)&&Date.now()-oldTime<4*3600000)
    feeds.push(last.filter(x=>Date.parse(x.date)>Date.now()));
 }
}
const fixtures=mergeFixtures(...feeds).slice(0,300);
const snapshot={schemaVersion:1,generatedAt:fetchedAt,fixtures,sources:status,
  label:'Snapshot only. No streaming Live, independent bookmaker odds or lineup feed.'};
await mkdir(dirname(dest),{recursive:true});
await writeFile(dest,JSON.stringify(snapshot,null,2)+'\n');
console.log('Saved',fixtures.length,'public fixtures, errors:',errors.length);
if(errors.length)console.log('SOURCE WARNINGS:',errors.join('; '));
