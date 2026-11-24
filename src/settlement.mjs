// Resolve a paper forecast ONLY by same provider match ID and verified result.
// Dota schedule matches must first be linked to a complete OpenDota series.
export function reconcilePaper(records,finished,checkedAt=new Date().toISOString()){
 if(!Array.isArray(records)||!Array.isArray(finished))throw Error('Invalid paper journal input');
 const byId=new Map(),conflicts=new Set();
 for(const m of finished){
  if(!m||typeof m.id!=='string'||!['cs2','dota'].includes(m.discipline)||(m.discipline==='dota'&&m.kind!=='series')||
     !m.a||!m.b||m.a===m.b||![m.a,m.b].includes(m.winner))continue;
  const previous=byId.get(m.id);
  if(previous&&(previous.discipline!==m.discipline||previous.winner!==m.winner||
     ![previous.a,previous.b].includes(m.a)||![previous.a,previous.b].includes(m.b)||
     previous.date!==m.date))conflicts.add(m.id);
  byId.set(m.id,m);
 }
 let resolved=0;
 const updated=records.map(rec=>{
  if(!rec||rec.actual===0||rec.actual===1||typeof rec.fixtureId!=='string')return rec;
  const from=Date.parse(rec.createdAt),kickoff=Date.parse(rec.kickoff);
  if(!Number.isFinite(from)||!Number.isFinite(kickoff)||from>=kickoff)return rec;
  const isBo3=rec.game==='cs2'&&/^bo3-[0-9]+$/.test(rec.fixtureId);
  const isPanda=['cs2','dota'].includes(rec.game)&&new RegExp('^panda-'+rec.game+'-[0-9]+$').test(rec.fixtureId);
  const isDotaSeries=rec.game==='dota'&&/^(agenda-dota-|dota-schedule-)/.test(rec.fixtureId);
  const isAgendaCs=rec.game==='cs2'&&/^agenda-cs2-/.test(rec.fixtureId);
  if(!isBo3&&!isPanda&&!isDotaSeries&&!isAgendaCs)return rec;
  const match=byId.get(isBo3?'cs-'+rec.fixtureId.slice(4):rec.fixtureId);
  if(!match||conflicts.has(match.id)||match.discipline!==rec.game||!Number.isFinite(Date.parse(match.date))||Date.parse(match.date)<=from)return rec;
  if(Date.parse(match.date)>=Date.parse(checkedAt))return rec;
  if(match.finishedAt&&!(Date.parse(match.finishedAt)<=Date.parse(checkedAt)))return rec;
  if(match.resultObservedAt&&!(Date.parse(match.resultObservedAt)<=Date.parse(checkedAt)))return rec;
  if(rec.providerIds?.every(Boolean)&&match.providerTeamIds?.every(Boolean)){
   const ordered=match.a===rec.a?match.providerTeamIds:[...match.providerTeamIds].reverse();
   if(ordered.some((id,i)=>String(id)!==String(rec.providerIds[i])))return rec;
  }
  if(isAgendaCs&&(!/^cs-\d+$/.test(match.matchedProviderId??'')||!match.source?.startsWith('bo3.gg')))return rec;
  if(isDotaSeries&&!(match.source==='OpenDota series'&&match.seriesId&&match.kind==='series'))return rec;
  if(![match.a,match.b].includes(rec.a)||![match.a,match.b].includes(rec.b)||rec.a===rec.b)return rec;
  if(rec.pick!==match.a&&rec.pick!==match.b)return rec;
  if(match.winner!==match.a&&match.winner!==match.b)return rec;
  resolved++;
  return {...rec,actual:match.winner===rec.pick?1:0,checkedAt,
    resolvedFrom:match.source||'finished provider record',verifiedMatchId:match.id,sourceMatchId:match.matchedProviderId??match.seriesId??match.id};
 });
 return {records:updated,resolvedNew:resolved};
}
