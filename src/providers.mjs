// Normalize provider payloads without inventing identifiers, times, teams or results.
// Providers can change without notice; malformed entries are discarded.
export function normalizeOpenDota(payload){
 if(!Array.isArray(payload))throw Error('OpenDota schema changed');
 const result=[];
 for(const m of payload){
  if(!Number.isSafeInteger(m.match_id)||!Number.isFinite(m.start_time)||!m.radiant_name||!m.dire_name||typeof m.radiant_win!=='boolean')continue;
  const date=new Date(m.start_time*1000);if(!Number.isFinite(date.valueOf()))continue;
  const a=String(m.radiant_name).trim(),b=String(m.dire_name).trim();
  if(!a||!b||a===b)continue;
  result.push({id:'dota-'+m.match_id,discipline:'dota',date:date.toISOString(),a,b,winner:m.radiant_win?a:b,source:'OpenDota',kind:'map'});
 }
 return result;
}
export function normalizeBo3(payload){
 if(!payload||typeof payload!=='object'||!payload.data||typeof payload.data.tiers!=='object')throw Error('bo3.gg schema changed');
 const teams=payload.included?.teams||{},tournaments=payload.included?.tournaments||{},result=[];
 for(const tier of Object.values(payload.data.tiers)){
  for(const m of Array.isArray(tier?.matches)?tier.matches:[]){
   const teamA=teams[String(m.team1_id)],teamB=teams[String(m.team2_id)];
   const a=typeof teamA?.name==='string'?teamA.name.trim():'',b=typeof teamB?.name==='string'?teamB.name.trim():'';
   const winnerId=String(m.winner_team_id),t1=String(m.team1_id),t2=String(m.team2_id);
   const when=Date.parse(m.start_date);
   if(!a||!b||a===b||!(winnerId===t1||winnerId===t2)||!Number.isFinite(when)||m.id==null)continue;
   const tournament=tournaments[String(m.tournament)]?.name??null;
   result.push({id:'cs-'+m.id,discipline:'cs2',date:new Date(when).toISOString(),a,b,winner:winnerId===t1?a:b,
    source:'bo3.gg (unofficial)',kind:'series',format:typeof m.bo_type==='string'?m.bo_type:null,
    tournament:typeof tournament==='string'?tournament:null,
    providerTeamIds:[t1,t2]});
  }
 }
 return result;
}