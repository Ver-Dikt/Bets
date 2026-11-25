import {fetchJson} from './collect.mjs';
import {sameTeams, teamKey} from './pari.mjs';

const maxAge=45*60000;
const maxKickoffOffset=30*60000;
const names={pari:'PARI',pinnacle:'Pinnacle',bet365:'bet365',betfair:'Betfair',betway:'Betway',ggbet:'GG.BET',cloudbet:'Cloudbet','1xbet':'1xBet'};
const priority=Object.keys(names);
const books=key=>Object.hasOwn(names,key)?names[key]:null;
const teams=(a,b)=>typeof a==='string'&&Boolean(a.trim())&&typeof b==='string'&&Boolean(b.trim());
const recent=(time,at)=>Number.isFinite(time)&&time<=at&&at-time<maxAge;
const validOdds=odds=>odds.length===2&&odds.every(price=>Number.isFinite(price)&&price>1);

export function oddsLinkLines(payload,game,at){
 if(!Array.isArray(payload))throw Error('Неизвестный формат ответа OddsLink');
 return payload.flatMap(event=>{
  const {id,home_team:a,away_team:b,commence_time:date,best_of:bestOf,bookmakers,is_live:live,status}=event;
  if(typeof id!=='string'||!teams(a,b)||teamKey(game,a)===teamKey(game,b)||!(Date.parse(date)>at)||
   live||(status!=null&&status!=='scheduled')||(bestOf!=null&&![1,3,5].includes(bestOf)))return [];
  return (Array.isArray(bookmakers)?bookmakers:[]).flatMap(book=>{
   const bookmaker=books(book.key);
   const markets=(Array.isArray(book.markets)?book.markets:[]).filter(m=>m.key==='h2h'&&(m.period==null||m.period==='full'));
   if(!bookmaker||markets.length!==1)return [];
   const market=markets[0],observed=Date.parse(market.last_update);
   if(!recent(observed,at)||!Array.isArray(market.outcomes)||market.outcomes.length!==2)return [];
   const odds=[a,b].map(team=>market.outcomes.find(o=>o.name===team&&o.point==null)?.price);
   if(!validOdds(odds))return [];
   return [{id,game,a,b,date,format:bestOf?'Bo'+bestOf:null,bookmaker,provider:'OddsLink',
    odds,observedAt:new Date(observed).toISOString(),priority:1+priority.indexOf(book.key)}];
  });
 });
}

export function apiSportLines(payload,at){
 if(!Array.isArray(payload?.matches))throw Error('Неизвестный формат ответа API-SPORT');
 return payload.matches.flatMap(event=>{
  const {startTimestamp:start,homeTeam,awayTeam,status,esports,oddsBk}=event;
  const a=homeTeam?.name,b=awayTeam?.name,bestOf=esports?.bestOf;
  if(status!=='notstarted'||!Number.isSafeInteger(start)||start<=at||!teams(a,b)||
   ![1,3,5,7].includes(bestOf)||!Number.isSafeInteger(event.id))return [];
  const category=[event.tournament?.category?.name,event.category?.name,event.tournament?.category?.translations?.en].filter(Boolean).join(' ');
  const game=/counter[ -]?strike|\bcs2\b/i.test(category)?'cs2':/\bdota\b/i.test(category)?'dota':null;
  if(!game||teamKey(game,a)===teamKey(game,b))return [];
  const board=oddsBk?.pari,market=board?.markets?.result;
  const keys=market?.stakeKeys;
  if(!board?.isBettingActive||market?.status!=='open'||market.hasArgument!==false||
   (market.stage!=null&&market.stage!=='prematch')||!Array.isArray(keys)||keys.length!==2||!keys.includes('w1')||!keys.includes('w2'))return [];
  const odds=['w1','w2'].map(key=>market.stakes?.[key]?.suspended?null:market.stakes?.[key]?.factor);
  if(!recent(board.updatedAt,at)||!validOdds(odds))return [];
  return [{id:String(event.id),game,a,b,date:new Date(start).toISOString(),format:'Bo'+bestOf,
   bookmaker:'PARI',provider:'API-SPORT',odds,observedAt:new Date(board.updatedAt).toISOString(),priority:0}];
 });
}

async function requestBoard(url,header,key){
 return fetchJson(url,{retries:0,request:(address,options)=>fetch(address,{...options,redirect:'error',
  headers:{...options.headers,[header]:key}})});
}

export async function externalBoards(fetchedAt,{oddsLinkKey,apiSportKey,poll=true,previous={},request=requestBoard,now=Date.now}){
 const queries=[
  ['oddslink','OddsLink',oddsLinkKey,async()=>{
   const results=await Promise.allSettled([['cs2','cs2'],['dota2','dota']].map(async ([sport,game])=>{
    const payload=await request('https://oddslink.app/v1/sports/'+sport+'/odds?markets=h2h&oddsFormat=decimal','X-API-Key',oddsLinkKey);
    return oddsLinkLines(payload,game,now());
   }));
   if(results.every(r=>r.status==='rejected'))throw results[0].reason;
   return {lines:results.flatMap(r=>r.value??[]),partial:results.some(r=>r.status==='rejected')};
  }],
  ['apiSport','API-SPORT',apiSportKey,async()=>{
   const url=new URL('https://api.api-sport.ru/v2/esports/matches');
   url.search=new URLSearchParams({date:fetchedAt.slice(0,10),status:'notstarted',with_bk_odds:'true',bookmaker_ids:'pari'});
   const payload=await request(url.toString(),'Authorization',apiSportKey);
   return {lines:apiSportLines(payload,now())};
  }]
 ];
 const responses=await Promise.all(queries.map(async ([id,source,key,load])=>{
  if(!key)return [id,[],{ok:false,source,error:'Ключ не настроен'}];
  if(!poll)return [id,[],previous[id]??{ok:false,source,error:'Ожидается обновление'}];
  try{
   const {lines,partial}=await load();
   return [id,lines,{ok:true,source,checkedAt:fetchedAt,quotes:lines.length,...(partial?{partial:true}:{})}];
  }catch(error){
   const code=/HTTP (\d{3})/.exec(error.message)?.[1];
   return [id,[],{ok:false,source,checkedAt:fetchedAt,error:code?'HTTP '+code:'Источник недоступен или вернул неожиданный формат'}];
  }
 }));
 return {lines:responses.flatMap(([,lines])=>lines),sources:Object.fromEntries(responses.map(([id,,value])=>[id,value]))};
}

export function attachExternalPrices(fixtures,lines,previous,at){
 const byFixture=new Map();
 for(const line of lines){
  const candidates=fixtures.filter(f=>f.status==='upcoming'&&Date.parse(f.date)>at&&Date.parse(line.date)>at&&recent(Date.parse(line.observedAt),at)&&
   (line.format===f.format||!line.format&&['Bo1','Bo3','Bo5'].includes(f.format))&&
   Math.abs(Date.parse(f.date)-Date.parse(line.date))<=maxKickoffOffset&&sameTeams(f,line));
  if(candidates.length!==1)continue;
  const [match]=candidates;
  const records=byFixture.get(match.id)??[];
  records.push(line);
  byFixture.set(match.id,records);
 }
 const oldById=new Map(previous.map(f=>[f.id,f]));
 return fixtures.map(fixture=>{
  const choices=byFixture.get(fixture.id)??[];
  // A bookmaker must match the fixture uniquely in its provider, even if a second
  // provider independently supplies another valid quote.
  const best=choices.filter(line=>choices.filter(row=>row.provider===line.provider&&row.bookmaker===line.bookmaker).length===1)
   .sort((a,b)=>a.priority-b.priority)[0];
  if(best){
   const odds=sameTeams(fixture,best)===1?best.odds:[...best.odds].reverse();
   return {...fixture,bookPrice:{odds,bookmaker:best.bookmaker,provider:best.provider,date:best.date,
    observedAt:best.observedAt,freshUntil:new Date(Date.parse(best.observedAt)+maxAge).toISOString(),mode:'feed'}};
  }
  const old=oldById.get(fixture.id);
  if(old?.bookPrice&&fixture.status==='upcoming'&&fixture.date===old.date&&fixture.format===old.format&&
   fixture.a===old.a&&fixture.b===old.b&&fixture.game===old.game&&Date.parse(old.bookPrice.freshUntil)>at){
   return {...fixture,bookPrice:old.bookPrice};
  }
  return fixture;
 });
}
