import {reconcilePaper} from './settlement.mjs';
import {forecastTotal} from './live.mjs';
import {score} from './engine.mjs';

const dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
export const moscowDay=value=>Number.isFinite(Date.parse(value))?dayFormat.format(new Date(value)):null;
const recordedMus={
 'bo3-133418':'PARIVISION',
 'bo3-133421':'Wildcard',
 'bo3-133422':'FlyQuest'
};

export function dailyRows({day,from=day,fixtures,journal,matches,brief,mus={},now}){
 const inPeriod=value=>{
  const key=moscowDay(value);
  return key!==null&&key>=from&&key<=day;
 };
 const events=new Map(), forecasts=new Map(), settlements=new Map(), scores=new Map(), technicalResults=new Map();
 const prices=new Map((brief?.fixtures??[]).filter(row=>row.publicPrice).map(row=>[row.id,row]));
 const put=(id,row)=>{if(id)events.set(id,{...events.get(id),...row,id});};
 for(const row of brief?.fixtures??[])put(row.id,row);
 for(const event of journal){
  const p=event.record;
  if(event.type==='skip'&&!events.has(event.fixtureId))put(event.fixtureId,{...event,date:event.kickoff});
  if(event.type==='forecast'&&Date.parse(p?.createdAt)<Date.parse(p?.kickoff)){
   if(Date.parse(forecasts.get(p.fixtureId)?.createdAt)>Date.parse(p.createdAt))continue;
   forecasts.set(p.fixtureId,p);
   put(p.fixtureId,{a:p.a,b:p.b,date:p.kickoff,game:p.game});
  }
  if(event.type==='settlement'&&(event.result===0||event.result===1))settlements.set(event.forecastId,event);
  if(event.type==='technical-result')technicalResults.set(event.fixtureId,event);
  if(event.type==='series-score')scores.set(event.forecastId,event);
 }
 for(const row of fixtures)put(row.id,row);
 const pending=[...forecasts.values()].filter(p=>p.probabilityBasis!=='map'&&inPeriod(p.kickoff));
 const checked=new Map(reconcilePaper(pending.map(p=>({...p,actual:null})),matches,new Date(now).toISOString()).records.map(p=>[p.id,p]));
 const rows=[];
 for(const event of events.values()){
  const forecast=forecasts.get(event.id);
  if(!inPeriod(forecast?.kickoff??event.date))continue;
  const settlement=settlements.get(forecast?.id), archive=checked.get(forecast?.id);
  const technicalResult=technicalResults.get(event.id);
  const technical=Boolean(technicalResult||archive?.technical);
  const actual=technical?null:settlement?.result??archive?.actual;
  const winner=actual===1?forecast.pick:actual===0?(forecast.pick===forecast.a?forecast.b:forecast.a):null;
  const reference=prices.get(event.id);
  const price=event.pari?.odds&&event.pari.mode==='feed'&&Date.parse(event.pari.freshUntil)>now
   ?{a:event.a,b:event.b,odds:event.pari.odds,observedAt:event.pari.observedAt,fresh:true}
   :reference?{a:reference.a,b:reference.b,odds:reference.publicPrice.odds,observedAt:reference.publicPrice.observedAt}
   :event.pari?.odds?{a:event.a,b:event.b,odds:event.pari.odds,observedAt:event.pari.observedAt}
   :forecast?.odds?{a:forecast.a,b:forecast.b,odds:forecast.odds,observedAt:forecast.createdAt}:null;
  const musPick=Object.hasOwn(mus,event.id)?mus[event.id]:recordedMus[event.id];
  const total=forecast&&(forecast.total??forecastTotal(forecast));
  const score=scores.get(forecast?.id);
  const actualMaps=technical?null:score?.format===forecast?.format&&score?score.maps:archive?.mapCount??null;
  rows.push({event,forecast,price,winner,actual,musPick,total,technical,
   totalSaved:Boolean(forecast?.total),totalActual:total&&actualMaps!==null?actualMaps>total.line:null,
   upcoming:Date.parse(forecast?.kickoff??event.date)>now,
   error:technical?null:settlement?.error, actualMaps, source:technicalResult?.source??settlement?.source??archive?.resolvedFrom, localMus:Object.hasOwn(mus,event.id)});
 }
 return rows.sort((a,b)=>Date.parse(a.event.date)-Date.parse(b.event.date));
}

export function tally(rows, pick=row=>row.forecast?.pick){
 const forecasts=rows.filter(row=>pick(row));
 const won=forecasts.filter(row=>row.winner===pick(row)).length;
 const lost=forecasts.filter(row=>row.winner&&row.winner!==pick(row)).length;
 const technical=forecasts.filter(row=>row.technical).length;
 const upcoming=forecasts.filter(row=>!row.technical&&!row.winner&&row.upcoming).length;
 return {total:forecasts.length,won,lost,upcoming,pending:forecasts.length-won-lost-upcoming-technical,...(technical?{technical}:{})};
}

export function verifiedForecastRows(rows, game='all'){
 return rows.filter(({forecast,winner,actual,technical})=>forecast?.pick&&forecast.probabilityBasis!=='map'&&
  (game==='all'||forecast.game===game)&&!technical&&Boolean(winner)&&(actual===0||actual===1));
}

export function inPlayFixtures(fixtures,journal,matches,now){
 const window=8*3600000;
 const snapshotAge=45*60000;
 const byId=new Map(fixtures.map(f=>[f.id,f]));
 const records=new Map();
 const ended=new Set();
 for(const entry of journal){
  const p=entry.record;
  if(entry.type==='forecast'&&p?.fixtureId&&p.probabilityBasis!=='map'&&Date.parse(p.createdAt)<Date.parse(p.kickoff)&&
   !(Date.parse(records.get(p.fixtureId)?.createdAt)>Date.parse(p.createdAt))){
   records.set(p.fixtureId,p);
  }
  if((entry.type==='settlement'&&(entry.result===0||entry.result===1))||entry.type==='technical-result'){
   ended.add(entry.fixtureId??entry.forecastId?.split('@')[0]);
  }
 }
 const recent=[...records.values()].filter(p=>now-Date.parse(p.kickoff)>=0&&now-Date.parse(p.kickoff)<window);
 const checked=reconcilePaper(recent.map(p=>({...p,actual:null})),matches,new Date(now).toISOString());
 for(const p of checked.records)if(p.actual===0||p.actual===1||p.technical)ended.add(p.fixtureId);
 const results=new Map(matches.filter(m=>m?.kind==='series'&&[m.a,m.b].includes(m.winner)).map(m=>[m.id,m]));
 for(const f of fixtures){
  const final=results.get(/^bo3-\d+$/.test(f.id)?'cs-'+f.id.slice(4):f.id);
  if(final?.discipline===f.game&&[final.a,final.b].includes(f.a)&&[final.a,final.b].includes(f.b)&&
   Date.parse(final.date)<=now&&(!final.finishedAt||Date.parse(final.finishedAt)<=now)&&
   (!final.resultObservedAt||Date.parse(final.resultObservedAt)<=now))ended.add(f.id);
 }
 for(const p of recent)if(!byId.has(p.fixtureId)){
  byId.set(p.fixtureId,{id:p.fixtureId,a:p.a,b:p.b,date:p.kickoff,game:p.game,format:p.format,
   tournament:p.tournament,source:p.source,fetchedAt:p.createdAt,status:'upcoming'});
 }
 return [...byId.values()].flatMap(f=>{
  const age=now-Date.parse(f.date);
  if(ended.has(f.id)||!['upcoming','live'].includes(f.status)||!(age>=0&&age<window))return [];
  const elapsed=now-Date.parse(f.fetchedAt);
  const confirmed=f.status==='live'&&elapsed>=0&&elapsed<snapshotAge;
  const p=records.get(f.id);
  const compatible=p&&p.game===f.game&&p.a===f.a&&p.b===f.b&&p.format===f.format&&
   Date.parse(p.createdAt)<Date.parse(f.date)&&Math.abs(Date.parse(p.kickoff)-Date.parse(f.date))<=2*3600000;
  return [{...f,inPlay:true,confirmed,forecastKickoff:compatible?p.kickoff:null}];
 });
}

export function forecastPrice(forecast){
 const observed=Date.parse(forecast.oddsObservedAt), created=Date.parse(forecast.createdAt);
 if((forecast.oddsSource!=='PARI'&&forecast.oddsProvider!=='OddsLink')||!forecast.oddsSource||
  !(observed<=created&&created<Date.parse(forecast.kickoff)))return null;
 const {pick,a,b,probability}=forecast;
 const index=pick===a?0:pick===b?1:-1;
 const odds=forecast.odds?.[index];
 if(!Number.isFinite(odds)||odds<=1||!Number.isFinite(probability)||probability<=0||probability>1)return null;
 return {odds,probability,breakEven:1/odds,expectedReturn:probability*odds-1,observedAt:forecast.oddsObservedAt,
  bookmaker:forecast.oddsSource,provider:forecast.oddsProvider};
}

export function pricedResults(rows){
 const records=verifiedForecastRows(rows).flatMap(({forecast,actual})=>{
  const price=forecastPrice(forecast);
  return price?[{...price,actual}]:[];
 });
 return {all:score(records),positive:score(records.filter(r=>r.expectedReturn>0))};
}

export const cs2ConfidenceThreshold=.70;

export function cs2ConfidenceBenchmark(research){
 const winner=research?.games?.cs2?.winner;
 const test=winner?.models?.[winner.selected]?.confidence?.[String(cs2ConfidenceThreshold)];
 if(research?.version&&winner?.approved&&test?.count>0){
  return {...test,model:winner.selected+'@'+research.version};
 }
 return null;
}

export function qualifiesForCs2Shortlist(forecast,benchmark){
 return Boolean(benchmark&&forecast?.game==='cs2'&&forecast.model===benchmark.model&&
  Number.isFinite(forecast.probability)&&forecast.probability>=cs2ConfidenceThreshold&&forecast.probability<=1);
}

export function qualifiesForPricedCs2Shortlist(forecast,benchmark,now){
 if(!qualifiesForCs2Shortlist(forecast,benchmark)||Date.parse(forecast.kickoff)<=now)return false;
 const price=forecastPrice(forecast);
 if(!price)return false;
 const age=now-Date.parse(price.observedAt);
 return age>=0&&age<45*60000&&price.expectedReturn>0;
}

export function confidenceBreakdown(rows){
 const bands=[
  {min:.5,max:.55,settled:0,won:0},
  {min:.55,max:.65,settled:0,won:0},
  {min:.65,max:cs2ConfidenceThreshold,settled:0,won:0},
  {min:cs2ConfidenceThreshold,max:null,settled:0,won:0}
 ];
 for(const {forecast,actual,technical} of rows){
  const p=forecast?.probability;
  if(technical||(actual!==0&&actual!==1)||!Number.isFinite(p)||p<.5||p>1)continue;
  const band=bands.find(({max})=>max===null||p<max);
  band.settled++;
  band.won+=actual;
 }
 return bands;
}

export function reviewPeriod(day, days) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||![1,2,7,14,30,90].includes(days))throw Error('Invalid review period');
 return new Date(Date.parse(day+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
}

export function totalTally(rows) {
 const forecasts=rows.filter(row=>row.totalSaved);
 const resolved=forecasts.filter(row=>typeof row.totalActual==='boolean');
 const decisive=resolved.filter(row=>row.total.over!==.5);
 const technical=forecasts.filter(row=>row.technical).length;
 return {total:forecasts.length,resolved:resolved.length,decisive:decisive.length,technical,pending:forecasts.length-resolved.length-technical,
  correct:decisive.filter(row=>(row.total.over>.5)===row.totalActual).length,
  brier:resolved.length?resolved.reduce((sum,row)=>sum+(row.total.over-Number(row.totalActual))**2,0)/resolved.length:null};
}

export function errorReview(rows) {
 const misses=rows.filter(row=>row.actual===0);
 return {misses:misses.length, confident:misses.filter(row=>row.forecast.probability>=.65).length,
  disagreement:misses.filter(row=>row.error?.disagreement===true).length,
  latest:misses.sort((a,b)=>Date.parse(b.forecast.kickoff)-Date.parse(a.forecast.kickoff)).slice(0,12)};
}

export function compareJournalWinners(rows) {
 const audited=rows.filter(row=>row.winner&&row.forecast?.research?.probabilities);
 const buckets=new Map();
 for(const {forecast,winner} of audited){
  const actual=Number(winner===forecast.a);
  for(const [name,p] of Object.entries(forecast.research.probabilities)){
   if(name==='equalChance'||!Number.isFinite(p))continue;
   const bucket=buckets.get(name)??{settled:0,decided:0,correct:0,brier:0};
   bucket.settled++;
   if(p!==.5){
    bucket.decided++;
    if(Number(p>.5)===actual)bucket.correct++;
   }
   bucket.brier+=(p-actual)**2;
   buckets.set(name,bucket);
  }
 }
 return [...buckets].map(([name,result])=>({name,...result,brier:result.brier/result.settled}));
}
