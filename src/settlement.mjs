// Resolve a paper forecast ONLY by same provider match ID and verified result.
// A local journal remains editable and is not an immutable pre-match audit trail.
export function reconcilePaper(records,finished){
 if(!Array.isArray(records)||!Array.isArray(finished))throw Error('Invalid paper journal input');
 const byId=new Map(finished.filter(m=>m&&typeof m.id==='string'&&m.discipline==='cs2'&&m.winner&&m.a&&m.b).map(m=>[m.id,m]));
 let resolved=0;
 const updated=records.map(rec=>{
  if(!rec||rec.actual===0||rec.actual===1||rec.game!=='cs2'||typeof rec.fixtureId!=='string'||!/^bo3-[0-9]+$/.test(rec.fixtureId))return rec;
  const from=Date.parse(rec.createdAt),kickoff=Date.parse(rec.kickoff);
  if(!Number.isFinite(from)||!Number.isFinite(kickoff)||from>=kickoff)return rec;
  const match=byId.get('cs-'+rec.fixtureId.slice(4));
  if(!match||Date.parse(match.date)<=from)return rec;
  if(rec.pick!==match.a&&rec.pick!==match.b)return rec;
  if(match.winner!==match.a&&match.winner!==match.b)return rec;
  resolved++;
  return {...rec,actual:match.winner===rec.pick?1:0,checkedAt:new Date().toISOString(),
    resolvedFrom:match.source||'finished provider record',verifiedMatchId:match.id};
 });
 return {records:updated,resolvedNew:resolved};
}
