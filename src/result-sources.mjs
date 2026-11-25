import {fetchJson,fetchDotaPage,sleep} from './collect.mjs';
import {normalizeBo3} from './providers.mjs';
import {sameTeams} from './pari.mjs';
import {verifiedMapCount} from './settlement.mjs';

export function latestUnresolved(events,at){
 const forecasts=new Map(events.filter(e=>e.type==='forecast').map(e=>[e.record.fixtureId,e.record]));
 const settled=new Set(events.filter(e=>['settlement','technical-result'].includes(e.type)).map(e=>e.fixtureId));
 return [...forecasts.values()].filter(row=>{
  const age=at-Date.parse(row.kickoff);
  // Recheck settled CS2 rows too: later feed snapshots can identify a forfeit.
  return age>0&&age<=72*3600000&&(row.game==='cs2'||!settled.has(row.fixtureId));
 }).sort((a,b)=>Number(settled.has(a.fixtureId))-Number(settled.has(b.fixtureId))||
  Date.parse(a.kickoff)-Date.parse(b.kickoff));
}

export async function csResultsById(records,request=fetchJson){
 const ids=[...new Set(records.map(r=>/^bo3-(\d+)$/.exec(r.fixtureId)?.[1]).filter(Boolean))];
 const results=[];
 for(let offset=0;offset<Math.min(ids.length,150);offset+=50){
  const batch=ids.slice(offset,offset+50);
  const url=new URL('https://api.bo3.gg/api/v1/matches');
  url.search=new URLSearchParams({scope:'widget-matches','page[limit]':'50','filter[matches.id][in]':batch.join(','),with:'teams,tournament'});
  const payload=await request(url.toString(),{retries:0});
  if(!Array.isArray(payload?.results))throw Error('Unexpected bo3.gg match-ID response');
  const teams={},tournaments={},matches=[];
  for(const row of payload.results){
   if(!batch.includes(String(row.id))||row.discipline_id!==1||!['finished','defwin'].includes(row.status))continue;
   if(row.team1)teams[row.team1_id]=row.team1;
   if(row.team2)teams[row.team2_id]=row.team2;
   if(row.tournament?.id)tournaments[row.tournament.id]=row.tournament;
   matches.push({...row,tournament:row.tournament?.id??row.tournament});
  }
  results.push(...normalizeBo3({data:{tiers:{requested:{matches}}},included:{teams,tournaments}}));
 }
 return results;
}

export async function recentDotaResults(records, page=fetchDotaPage, wait=sleep){
 const target=Math.min(...records.filter(row=>row.game==='dota').map(row=>Date.parse(row.kickoff)-3600000));
 const results=new Map();
 let cursor=null;
 for(let i=0;i<3;i++){
  if(i)await wait(1200);
  const response=await page(cursor,{retries:0}).catch(error=>{
   if(i===0)throw error;
   console.warn('OpenDota older results:',error.message);
   return null;
  });
  if(!response)break;
  for(const row of response.matches)results.set(row.id,row);
  if(response.cursor===null||response.cursor===cursor||response.matches.some(row=>Date.parse(row.date)<target))break;
  cursor=response.cursor;
 }
 return [...results.values()];
}

const manualHosts={
 'faceit.com':'FACEIT','blast.tv':'BLAST','hltv.org':'HLTV','cybersport.ru':'Cybersport.ru',
 'escorenews.com':'Escorenews','liquipedia.net':'Liquipedia','bo3.gg':'bo3.gg',
 'opendota.com':'OpenDota','stratz.com':'STRATZ','pari.ru':'PARI'
};

export function auditResult(entry,record,at){
 if(!record||entry.fixtureId!==record.fixtureId||entry.format!==record.format||
    ![entry.a,entry.b].every(value=>typeof value==='string')||
    !sameTeams(record,{...entry,game:record.game})||![entry.a,entry.b].includes(entry.winner))return null;
 let sourceURL;
 try{sourceURL=new URL(entry.url)}catch{return null}
 const host=sourceURL.hostname.replace(/^www\./,'');
 if(sourceURL.protocol!=='https:'||sourceURL.username||sourceURL.password||!Object.hasOwn(manualHosts,host))return null;
 const start=Date.parse(entry.startedAt),end=Date.parse(entry.finishedAt??entry.observedAt);
 if(!(start>Date.parse(record.createdAt)&&Math.abs(start-Date.parse(record.kickoff))<=2*3600000&&end>start&&end<=at))return null;
 if(entry.resultKind!=null&&entry.resultKind!=='technical')return null;
 const direct=sameTeams(record,{...entry,game:record.game})===1;
 const winner=(entry.winner===entry.a)===direct?record.a:record.b;
 const result={id:record.fixtureId.startsWith('bo3-')?'cs-'+record.fixtureId.slice(4):record.fixtureId,
  discipline:record.game,kind:'series',date:new Date(start).toISOString(),finishedAt:entry.finishedAt?new Date(end).toISOString():null,
  resultObservedAt:entry.finishedAt?null:new Date(end).toISOString(),
  a:record.a,b:record.b,winner,format:entry.format,resultKind:entry.resultKind,mapCount:entry.mapCount,
  source:manualHosts[host]+' · ручная сверка',sourceUrl:sourceURL.href,verifiedReview:true};
 if(!result.resultKind&&entry.mapCount!=null&&verifiedMapCount(result)===null)return null;
 return result;
}

export function parseFaceitResults(payload,records,at){
 if(!Array.isArray(payload?.items))throw Error('Unexpected FACEIT response');
 const result=[];
 for(const m of payload.items){
  if(m.game!=='cs2'||m.status!=='FINISHED'||!(/^[\w-]{8,100}$/.test(m.match_id??''))||![1,3,5,7].includes(m.best_of))continue;
  const a=m.teams?.faction1?.name,b=m.teams?.faction2?.name,side=m.results?.winner;
  if(!a||!b||!['faction1','faction2'].includes(side)||![m.started_at,m.finished_at].every(n=>Number.isSafeInteger(n)&&n>0&&n<=at/1000))continue;
  const startedAt=new Date(m.started_at*1000).toISOString(),finishedAt=new Date(m.finished_at*1000).toISOString();
  const format='Bo'+m.best_of,winner=side==='faction1'?a:b;
  const scores=[m.results?.score?.faction1,m.results?.score?.faction2];
  const mapCount=verifiedMapCount({a,b,winner,wins:scores,format});
  // A reported winner without a full series score can be a forfeit.
  if(mapCount===null)continue;
  const possible=records.filter(r=>r.game==='cs2'&&/\besea\b/i.test(r.tournament??'')&&sameTeams(r,{a,b,game:'cs2'}));
  const entry={a,b,format,winner,startedAt,finishedAt,mapCount,url:'https://www.faceit.com/en/cs2/room/'+encodeURIComponent(m.match_id)};
  const linked=possible.map(record=>auditResult({...entry,fixtureId:record.fixtureId},record,at)).filter(Boolean);
  if(linked.length===1)result.push({...linked[0],source:'FACEIT',matchedProviderId:m.match_id});
 }
 return result;
}

export async function faceitResults(records,at,{token,championships,request=fetch}={}){
 if(!token||!championships)return null;
 const ids=[...new Set(championships.split(',').map(id=>id.trim()).filter(Boolean))];
 if(ids.length>8||ids.some(id=>!(/^[0-9a-f-]{36}$/i.test(id))))throw Error('Invalid FACEIT championship ID list');
 const batches=await Promise.all(ids.map(id=>fetchJson(
  'https://open.faceit.com/data/v4/championships/'+id+'/matches?type=past&limit=100',
  {retries:0,request:(url,opts)=>request(url,{...opts,headers:{...opts.headers,authorization:'Bearer '+token}})}
 )));
 return batches.flatMap(b=>parseFaceitResults(b,records,at));
}
