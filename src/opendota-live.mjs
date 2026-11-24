import {fetchJson} from './collect.mjs';

export function parseDotaLive(rows, fetchedAt){
 if(!Array.isArray(rows))throw Error('Неизвестный формат OpenDota Live');
 const latest=Date.parse(fetchedAt);
 return rows.flatMap(row=>{
  const eventId=String(row.match_id??''), seriesId=String(row.series_id??'');
  const a=row.team_name_radiant?.trim(),b=row.team_name_dire?.trim();
  const started=Number(row.activate_time)*1000, observed=Number(row.last_update_time)*1000;
  if(!/^[1-9]\d+$/.test(eventId)||!(row.league_id>0)||!(row.team_id_radiant>0)||!(row.team_id_dire>0)||
     !a||!b||a===b||!Number.isFinite(observed)||observed>latest+60000||latest-observed>12*60000||
     !Number.isFinite(started)||started<=0||started>observed||row.deactivate_time>0)return [];
  const number=value=>Number.isFinite(value)?value:null;
  return [{id:'opendota-live-'+eventId,game:'dota',a,b,date:new Date(started).toISOString(),status:'live',
   tournament:null,format:null,providerIds:[String(row.team_id_radiant),String(row.team_id_dire)],
   source:'OpenDota Live',fetchedAt:new Date(observed).toISOString(),
   liveState:{seriesId:/^[1-9]\d*$/.test(seriesId)?seriesId:null,second:number(row.game_time),
    goldLead:number(row.radiant_lead),kills:[number(row.radiant_score),number(row.dire_score)],
    delay:number(row.delay),
    heroes:[0,1].map(side=>(row.players??[]).filter(player=>player.team===side&&Number.isSafeInteger(player.hero_id)).map(player=>player.hero_id))}}];
 });
}

export async function fetchDotaLive(fetchedAt){
 return parseDotaLive(await fetchJson('https://api.opendota.com/api/live',{retries:0}),fetchedAt);
}
