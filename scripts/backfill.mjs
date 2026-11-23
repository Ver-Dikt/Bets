#!/usr/bin/env node
// Build a private real-data archive incrementally. Never simulates a failed source.
import {readArchive,mergeArchive,writeArchive,DEFAULT_ARCHIVE} from '../src/archive.mjs';
import {days,isoDay,fetchCsDay,fetchDotaPage,sleep} from '../src/collect.mjs';
import {resolve} from 'node:path';

const args=process.argv.slice(2);
function flag(name,fallback){const i=args.indexOf('--'+name);return i===-1?fallback:args[i+1]}
function positiveInt(name,fallback,cap=366){const n=Number(flag(name,String(fallback)));if(!Number.isSafeInteger(n)||n<1||n>cap)throw Error('--'+name+' must be 1..'+cap);return n}
function usage(){console.log(`Bets private archive collector (read-only public data endpoints)
  npm run backfill -- --game cs2 --from 2026-11-01 --to 2026-11-07 --max-requests 7
  npm run backfill -- --game dota --pages 5 [--continue] [--since 2026-06-01]\n  npm run backfill -- --game cs2 --older --max-requests 30
  --file <path>        Archive target (default .data/matches.json; git-ignored)
  --delay <ms>        Minimum source pacing, 1100–10000 (default 1200)
  --continue          Dota only: continue from prior archived cursor\n  --older             CS2 only: fetch previous 30 calendar days (stops at 365 days)
No paid APIs, bookmaker logins, or bets. Upstream may block or rate-limit.`)}
async function main(){
 if(args.includes('--help')){usage();return}
 const game=flag('game','cs2'),file=resolve(flag('file',DEFAULT_ARCHIVE)),delay=positiveInt('delay',1200,10000);
 if(delay<1100)throw Error('Minimum delay is 1100ms');
 if(!['cs2','dota'].includes(game))throw Error('--game must be cs2 or dota');
 let archive=await readArchive(file);
 const total={added:0,duplicates:0,conflicts:0,rejected:0,requests:0};
 const mergeAndSave=async (rows,checkpoint={})=>{
  const merged=mergeArchive(archive,rows);archive={...merged.archive,scan:{...(merged.archive.scan||{}),...checkpoint}};
  for(const k of ['added','duplicates','conflicts','rejected'])total[k]+=merged.report[k];
  await writeArchive(file,archive);
  return merged.report;
 };
 if(game==='cs2'){
  const today=new Date().toISOString().slice(0,10),older=args.includes('--older');
  if(older&&(args.includes('--from')||args.includes('--to')))throw Error('--older cannot be combined with explicit dates');
  const seen=archive.matches.filter(m=>m.discipline==='cs2').map(m=>m.date.slice(0,10)).sort();
  const oldest=archive.scan?.cs2OlderThrough||seen[0]||today;
  const oldestDate=new Date(oldest+'T00:00:00Z').getTime();
  const yearAgo=new Date(Date.now()-365*86400000).toISOString().slice(0,10);
  const olderTo=new Date(oldestDate-86400000).toISOString().slice(0,10);
  if(older&&olderTo<yearAgo){console.log('CS2 one-year historical scan complete');return}
  const olderFrom=new Date(Math.max(Date.parse(yearAgo+'T00:00:00Z'),oldestDate-30*86400000)).toISOString().slice(0,10);
  const from=older?olderFrom:flag('from',new Date(Date.now()-6*86400000).toISOString().slice(0,10));
  const to=older?olderTo:flag('to',today);
  const series=[...days(from,to,{maxDays:366})],max=positiveInt('max-requests',older?30:7);
  if(series.length>max)throw Error('Range is '+series.length+' days; set --max-requests '+series.length+' to authorize it');
  for(const date of series){
   if(total.requests)await sleep(delay);
   const matches=await fetchCsDay(date);total.requests++;
   const report=await mergeAndSave(matches);
   console.log('[CS2]',date,'received',matches.length,'added',report.added,'duplicates',report.duplicates,'conflicts',report.conflicts);
  }
  if(older){archive.scan={...(archive.scan||{}),cs2OlderThrough:from};await writeArchive(file,archive)}
 }else{
  const pages=positiveInt('pages',5),since=isoDay(flag('since',new Date(Date.now()-365*86400000).toISOString().slice(0,10)));
  const currentDota=archive.matches.filter(x=>x.discipline==='dota').map(x=>Number(x.id.slice(5))).filter(Number.isSafeInteger);
  let cursor=args.includes('--continue')?(Number.isSafeInteger(archive.scan?.dotaOlderCursor)?archive.scan.dotaOlderCursor:(currentDota.length?Math.min(...currentDota):null)):null,previous=null;
  for(let index=0;index<pages;index++){
   if(total.requests)await sleep(delay);
   const page=await fetchDotaPage(cursor);total.requests++;
   const matches=page.matches.filter(x=>x.date.slice(0,10)>=since);
   const report=await mergeAndSave(matches,args.includes('--continue')&&page.cursor!==null?{dotaOlderCursor:page.cursor}:{});
   console.log('[Dota]',index+1,'received',page.sourceRows,'after date filter',matches.length,'added',report.added);
   if(page.sourceRows===0||page.cursor===null||page.cursor===cursor||page.cursor===previous)break;
   previous=cursor;cursor=page.cursor;
   if(page.matches.length&&page.matches.every(x=>x.date.slice(0,10)<since))break;
  }
 }
 console.log('Complete',JSON.stringify({...total,archive:file,stored:archive.matches.length}));
}
main().catch(e=>{console.error('BACKFILL STOPPED:',e.message,'; prior pages retained on disk');process.exitCode=1});
