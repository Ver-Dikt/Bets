import {fetchJson} from './collect.mjs';
import {canonicalizeMatches} from './identity.mjs';
import {teamKey} from './pari.mjs';

const deadline=36*3600000;

export function parseRoster(payload,game,id,observedAt){
 const players=game==='cs2'
  ? String(payload?.id)===id&&Array.isArray(payload.players)
    ? payload.players.filter(p=>p.is_coach===false&&String(p.team_id)===id).map(p=>({
      id:p.id,name:p.nickname,metric:p.six_month_avg_rating,
    })):[]
  : Array.isArray(payload)
    ? payload.filter(p=>p.is_current_team_member===true).map(p=>({
      id:p.account_id,name:p.name,played:p.games_played,metric:p.games_played>=20?p.wins/p.games_played:null,
    })):[];
 const valid=players.filter(p=>Number.isSafeInteger(p.id)&&typeof p.name==='string'&&p.name.trim())
  .map(p=>({...p,metric:Number.isFinite(p.metric)&&p.metric>0?p.metric:null}));
 if(valid.length!==5||new Set(valid.map(p=>p.id)).size!==5)return null;
 return {observedAt,players:valid,source:game==='cs2'?'bo3.gg team profile':'OpenDota team profile'};
}

export async function enrichRosters(fixtures,archive,previous,fetchedAt){
 const now=Date.parse(fetchedAt);
 const lookup=new Map();
 const known=canonicalizeMatches(archive.filter(row=>row.discipline==='dota'));
 const names=new Map();
 for(const row of known){
  for(const [display,id] of [[row.displayA,row.a],[row.displayB,row.b]]){
   if(!display||!id.startsWith('opendota:'))continue;
   const key=teamKey('dota',display);
   if(!names.has(key))names.set(key,new Set());
   names.get(key).add(id.slice(9));
  }
 }
 for(const fixture of previous){
  for(let index=0;index<2;index++){
   const id=fixture.providerIds?.[index],roster=fixture.rosters?.[index];
   if(id&&roster&&now-Date.parse(roster.observedAt)<deadline)lookup.set(fixture.game+':'+id,roster);
  }
 }
 const targets=new Map();
 for(const fixture of fixtures){
  if(fixture.status!=='upcoming'||Date.parse(fixture.date)-now>deadline)continue;
  if(fixture.game==='dota'&&!fixture.providerIds){
   const sides=[fixture.a,fixture.b].map(name=>{
    const ids=names.get(teamKey('dota',name));
    return ids?.size===1?[...ids][0]:null;
   });
   if(sides.every(Boolean)&&sides[0]!==sides[1])fixture.providerIds=sides;
  }
  for(let index=0;index<2;index++){
   const id=fixture.providerIds?.[index],slug=fixture.teamSlugs?.[index];
   if(!id||!/^[1-9]\d+$/.test(id)||(fixture.game==='cs2'&&!/^[a-z0-9-]+$/.test(slug??'')))continue;
   const key=fixture.game+':'+id;
   const cached=lookup.get(key);
   if(cached&&now-Date.parse(cached.observedAt)<4*3600000)continue;
   targets.set(key,{game:fixture.game,id,slug});
  }
 }
 const batch=[...targets].slice(0,24);
 for(let index=0;index<batch.length;index+=4){
  await Promise.all(batch.slice(index,index+4).map(async ([key,{game,id,slug}])=>{
   const url=game==='cs2'?'https://api.bo3.gg/api/v1/teams/'+slug+'?with=players':'https://api.opendota.com/api/teams/'+id+'/players';
   try{
    const roster=parseRoster(await fetchJson(url,{retries:0}),game,id,new Date().toISOString());
    if(roster)lookup.set(key,roster);
   }catch{}
  }));
 }
 return fixtures.map(fixture=>{
  const rosters=fixture.providerIds?.map(id=>lookup.get(fixture.game+':'+id)??null);
  return rosters?.some(Boolean)?{...fixture,rosters}:fixture;
 });
}
