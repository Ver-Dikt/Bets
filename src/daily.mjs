import {reconcilePaper} from './settlement.mjs';

const dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
export const moscowDay=value=>Number.isFinite(Date.parse(value))?dayFormat.format(new Date(value)):null;
const recordedMus={
 'bo3-133418':'PARIVISION',
 'bo3-133421':'Wildcard',
 'bo3-133422':'FlyQuest'
};

export function dailyRows({day,fixtures,journal,matches,brief,mus={},now}){
 const events=new Map(), forecasts=new Map(), settlements=new Map();
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
 }
 for(const row of fixtures)put(row.id,row);
 const pending=[...forecasts.values()].filter(p=>!settlements.has(p.id)&&p.probabilityBasis!=='map'&&moscowDay(p.kickoff)===day);
 const checked=new Map(reconcilePaper(pending.map(p=>({...p,actual:null})),matches,new Date(now).toISOString()).records.map(p=>[p.id,p]));
 const rows=[];
 for(const event of events.values()){
  const forecast=forecasts.get(event.id);
  if(moscowDay(forecast?.kickoff??event.date)!==day)continue;
  const settlement=settlements.get(forecast?.id), archive=checked.get(forecast?.id);
  const actual=settlement?.result??archive?.actual;
  const winner=actual===1?forecast.pick:actual===0?(forecast.pick===forecast.a?forecast.b:forecast.a):null;
  const reference=prices.get(event.id);
  const price=reference?{a:reference.a,b:reference.b,odds:reference.publicPrice.odds,kind:'сохранённая котировка'}
   :event.pari?.odds?{a:event.a,b:event.b,odds:event.pari.odds,kind:'котировка из расписания'}
   :forecast?.odds?{a:forecast.a,b:forecast.b,odds:forecast.odds,kind:'котировка в журнале'}:null;
  const musPick=Object.hasOwn(mus,event.id)?mus[event.id]:recordedMus[event.id];
  rows.push({event,forecast,price,winner,actual,musPick,
   upcoming:Date.parse(forecast?.kickoff??event.date)>now,
   source:settlement?.source??archive?.resolvedFrom, localMus:Object.hasOwn(mus,event.id)});
 }
 return rows.sort((a,b)=>Date.parse(a.event.date)-Date.parse(b.event.date));
}

export function tally(rows, pick=row=>row.forecast?.pick){
 const forecasts=rows.filter(row=>pick(row));
 const won=forecasts.filter(row=>row.winner===pick(row)).length;
 const lost=forecasts.filter(row=>row.winner&&row.winner!==pick(row)).length;
 const upcoming=forecasts.filter(row=>!row.winner&&row.upcoming).length;
 return {total:forecasts.length,won,lost,upcoming,pending:forecasts.length-won-lost-upcoming};
}
