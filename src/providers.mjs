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
  const finishedAt=Number.isFinite(m.duration)&&m.duration>0
    ?new Date((m.start_time+m.duration)*1000).toISOString():null;
  result.push({finishedAt,id:'dota-'+m.match_id,discipline:'dota',date:date.toISOString(),a,b,winner:m.radiant_win?a:b,source:'OpenDota',kind:'map',tournament:typeof m.league_name==='string'?m.league_name:null,leagueId:Number.isSafeInteger(m.leagueid)?m.leagueid:null,seriesId:Number.isSafeInteger(m.series_id)&&m.series_id>0?String(m.series_id):null,seriesType:Number.isSafeInteger(m.series_type)?m.series_type:null,providerTeamIds:[m.radiant_team_id,m.dire_team_id].map(id=>Number.isSafeInteger(id)&&id>0?String(id):null)});
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
   if(!a||!b||a===b||!(winnerId===t1||winnerId===t2)||!Number.isFinite(when)||m.id==null||
    (m.status!=null&&!['finished','defwin'].includes(m.status)))continue;
   const tournament=tournaments[String(m.tournament)]?.name??null;
   const ended=Date.parse(m.end_date);
   const format=Number.isSafeInteger(m.bo_type)&&[1,3,5,7].includes(m.bo_type)?'Bo'+m.bo_type:
    typeof m.bo_type==='string'&&/^Bo[1357]$/i.test(m.bo_type)?'Bo'+m.bo_type.slice(2):null;
   const score=[m.team1_score,m.team2_score];
   const target=(Number(format?.slice(2))+1)/2;
   const index=winnerId===t1?0:1;
   const technical=m.status==='defwin';
   const wins=!technical&&score.every(n=>Number.isSafeInteger(n)&&n>=0)&&score[index]===target&&score[1-index]<target?score:null;
   result.push({finishedAt:Number.isFinite(ended)&&ended>when?new Date(ended).toISOString():null,id:'cs-'+m.id,discipline:'cs2',date:new Date(when).toISOString(),a,b,winner:winnerId===t1?a:b,
    source:'bo3.gg (unofficial)',kind:'series',format,...(technical?{resultKind:'technical'}:{}),...(wins?{wins}:{}),
    tournament:typeof tournament==='string'?tournament:null, tier:['s','a','b','c','d'].includes(tier?.tier??m.tier)?(tier?.tier??m.tier):null,
    providerTeamIds:[t1,t2]});
  }
 }
 return result;
}
