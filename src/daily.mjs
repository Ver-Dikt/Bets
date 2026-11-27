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

const publishedChoiceThreshold=.55;

export function publishedWinnerPick(forecast){
 const probability=forecast?.probability;
 return Number.isFinite(probability)&&probability>=publishedChoiceThreshold&&probability<=1?forecast.pick:null;
}

export function compareCs2Forecast(forecast){
 const {game,model,research,probabilityA,control}=forecast??{};
 if(game!=='cs2'||!research?.approved||model!==research.selected+'@'+research.version)return null;
 const controlA=control?.probabilityA;
 if(![probabilityA,controlA].every(p=>Number.isFinite(p)&&p>=0&&p<=1))return null;
 const favorite=p=>p===.5?null:p>.5?forecast.a:forecast.b;
 const primary={team:favorite(probabilityA),probability:Math.max(probabilityA,1-probabilityA)};
 const reference={team:favorite(controlA),probability:Math.max(controlA,1-controlA)};
 const group=!primary.team||!reference.team?'weak'
  :primary.team!==reference.team?'different'
  :Math.min(primary.probability,reference.probability)>=publishedChoiceThreshold?'agreement':'weak';
 return {primary,reference,group};
}

export function cs2ReservePick(forecast){
 const pair=compareCs2Forecast(forecast);
 if(pair&&pair.primary.probability<publishedChoiceThreshold&&
    pair.reference.probability>=publishedChoiceThreshold)return pair.reference;
 return null;
}

export function cs2CoverageResults(rows){
 const checked=verifiedForecastRows(rows,'cs2').filter(({forecast})=>compareCs2Forecast(forecast));
 const primary=tally(checked,({forecast})=>publishedWinnerPick(forecast));
 const reserve=tally(checked,({forecast})=>cs2ReservePick(forecast)?.team);
 const conflicts=tally(checked,({forecast})=>compareCs2Forecast(forecast).group==='different'
  ?cs2ReservePick(forecast)?.team:null);
 return {matches:checked.length,primary,reserve,conflicts,
  expanded:{total:primary.total+reserve.total,won:primary.won+reserve.won}};
}

export function cs2ComparisonResults(rows){
 const groups=new Map();
 for(const {forecast,winner} of verifiedForecastRows(rows,'cs2')){
  const pair=compareCs2Forecast(forecast);
  if(!pair)continue;
  const group=groups.get(pair.group)??{matches:0,primaryWins:0,referenceWins:0,primaryError:0,referenceError:0};
  const resultA=Number(winner===forecast.a);
  group.matches++;
  group.primaryError+=(forecast.probabilityA-resultA)**2;
  group.referenceError+=(forecast.control.probabilityA-resultA)**2;
  group.primaryWins+=Number(pair.primary.team===winner);
  group.referenceWins+=Number(pair.reference.team===winner);
  groups.set(pair.group,group);
 }
 return groups;
}

export function hasPublishedTotalPick(total){
 return total?.validated===true&&Number.isFinite(total.over)&&total.over>=0&&total.over<=1&&
  Math.max(total.over,1-total.over)>=publishedChoiceThreshold;
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
  {min:.5,max:.55,settled:0,won:0,expectedWins:0},
  {min:.55,max:.65,settled:0,won:0,expectedWins:0},
  {min:.65,max:cs2ConfidenceThreshold,settled:0,won:0,expectedWins:0},
  {min:cs2ConfidenceThreshold,max:null,settled:0,won:0,expectedWins:0}
 ];
 for(const {forecast,actual,technical} of rows){
  const p=forecast?.probability;
  if(technical||(actual!==0&&actual!==1)||!Number.isFinite(p)||p<.5||p>1)continue;
  const band=bands.find(({max})=>max===null||p<max);
  band.settled++;
  band.won+=actual;
  band.expectedWins+=p;
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

// A replay executes at each journal timestamp, while the quoted price is fresh.
export function replayDailySelection({journal,rows,from,day,game='all',format='all',source='all',now}){
 const outcomes=new Map(rows.filter(row=>row.forecast).map(row=>[row.forecast.fixtureId,row]));
 const starts=new Map();
 const finals=new Map();
 const candidates=[];
 const seenEvents=new Map();
 for(const entry of journal){
  if(['settlement','technical-result'].includes(entry.type)&&Date.parse(entry.checkedAt)<=now){
   const id=entry.fixtureId??entry.forecastId?.split('@')[0];
   if(id)finals.set(id,entry);
  }
 }
 for(const {record:p,type} of journal){
  if(type!=='forecast'||!p?.fixtureId)continue;
  const start=Date.parse(p.kickoff);
  if(Number.isFinite(start))starts.set(p.fixtureId,Math.min(start,starts.get(p.fixtureId)??Infinity));
 }
 for(const {record:p,type} of journal){
  if(type!=='forecast'||!p?.fixtureId||!publishedWinnerPick(p)||p.probabilityBasis==='map'||
   (game!=='all'&&p.game!==game)||(format!=='all'&&p.format!==format))continue;
  const date=moscowDay(p.kickoff);
  if(!date||date<from||date>day)continue;
  const at=Date.parse(p.createdAt);
  const price=forecastPrice(p);
  const kickoff=starts.get(p.fixtureId);
  if(!(at<=now&&at<kickoff)||!price||(source==='pari'&&price.bookmaker!=='PARI')||at-Date.parse(price.observedAt)>=45*60000)continue;
  const matchKey=JSON.stringify([p.game,p.format,date,kickoff,[p.a,p.b].map(team=>team.toLowerCase()).sort()]);
  const match=seenEvents.get(matchKey)??p.fixtureId;
  seenEvents.set(matchKey,match);
  candidates.push({p,price,at,date,match});
 }
 candidates.sort((a,b)=>a.at-b.at||b.price.expectedReturn-a.price.expectedReturn||a.p.fixtureId.localeCompare(b.p.fixtureId));
 function select(limit,minReturn){
  const visited=new Set(),daily=new Map(),picks=[];
  for(const {p,price,date,match,at} of candidates){
   if(visited.has(match)||(daily.get(date)??0)>=limit||price.expectedReturn<minReturn)continue;
   visited.add(match);daily.set(date,(daily.get(date)??0)+1);
   const result=outcomes.get(p.fixtureId), final=finals.get(p.fixtureId);
   const decision={day:date,id:p.fixtureId,team:p.pick,a:p.a,b:p.b,at,odds:price.odds,expectedReturn:price.expectedReturn,bookmaker:price.bookmaker};
   if(result?.technical){picks.push({...decision,state:'void'});continue}
   if(!result?.winner){picks.push({...decision,state:'pending'});continue}
   const win=result.winner===p.pick;
   picks.push({...decision,state:win?'won':'lost',profit:win?price.odds-1:-1,settledAt:Date.parse(final?.checkedAt)});
  }
  let pnl=0,peak=0,drawdown=0,streak=0,maxStreak=0;
  const closed=picks.filter(x=>Number.isFinite(x.profit));
  // Group equally timed confirmations so a batch has one equity point.
  const batches=new Map();
  for(const pick of closed){
   if(!Number.isFinite(pick.settledAt))continue;
   batches.set(pick.settledAt,(batches.get(pick.settledAt)??0)+pick.profit);
  }
  for(const [,profit] of [...batches].sort((a,b)=>a[0]-b[0])){
   pnl+=profit;peak=Math.max(pnl,peak);drawdown=Math.max(drawdown,peak-pnl);
  }
  for(const {state} of picks){
   if(state==='void')continue;
   streak=state==='lost'?streak+1:0;maxStreak=Math.max(maxStreak,streak);
  }
  const profit=closed.reduce((sum,x)=>sum+x.profit,0);
  return {picks,closed:closed.length,won:closed.filter(x=>x.state==='won').length,
   pending:picks.filter(x=>x.state==='pending').length,voids:picks.filter(x=>x.state==='void').length,
   profit,roi:closed.length?profit/closed.length:null,drawdown:batches.size&&closed.every(x=>Number.isFinite(x.settledAt))?drawdown:null,maxStreak};
 }
 return {covered:new Set(candidates.map(x=>x.match)).size,baseline:select(Infinity,-Infinity),
  scenarios:[0,.03,.05].map(threshold=>({threshold,one:select(1,threshold),two:select(2,threshold)}))};
}
