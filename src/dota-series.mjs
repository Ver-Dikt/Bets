import {sameTeams} from './pari.mjs';

// OpenDota's series ID can aggregate official maps. A winner is available
// only once one side reaches the required number of map wins.
export function dotaSeries(rows){
 const groups = new Map();
 for(const row of rows){
  if(row.discipline!=='dota'||row.kind!=='map'||!row.seriesId||![0,1,2].includes(row.seriesType)||
     !Array.isArray(row.providerTeamIds)||row.providerTeamIds.length!==2||row.providerTeamIds.some(id=>!id)||
     row.providerTeamIds[0]===row.providerTeamIds[1]||![row.a,row.b].includes(row.winner))continue;
  const grouped=groups.get(row.seriesId)??[];
  grouped.push(row);
  groups.set(row.seriesId,grouped);
 }
 const series=[];
 for(const [seriesId, group] of groups){
  const maps=group.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const first=maps[0],ids=first.providerTeamIds,target=first.seriesType+1;
  const names=new Map(ids.map((id,i)=>[id,i===0?first.a:first.b]));
  const wins=[0,0];
  if(maps.some(map=>map.seriesType!==first.seriesType||map.providerTeamIds.some(id=>!names.has(id))))continue;
  for(const map of maps){
   const winnerId=map.providerTeamIds[map.winner===map.a?0:1];
   wins[ids.indexOf(winnerId)]++;
  }
  const final=maps.at(-1);
  const finalWinner=final.providerTeamIds[final.winner===final.a?0:1];
  const index=ids.indexOf(finalWinner);
  if(index===-1||wins[index]!==target||wins[1-index]>=target)continue;
  const finishedAt=Math.max(...maps.map(row=>Date.parse(row.finishedAt)));
  if(!Number.isFinite(finishedAt))continue;
  const patches=new Set(maps.map(row=>row.patch));
  const observed=Math.max(...maps.map(row=>Date.parse(row.resultObservedAt)||0));
  const resultObservedAt=observed?new Date(observed).toISOString():null;
  series.push({id:'od-series-'+seriesId,game:'dota',discipline:'dota',kind:'series',
   a:first.a,b:first.b,date:first.date,winner:index===0?first.a:first.b,source:'OpenDota series',
   tournament:first.tournament,providerTeamIds:ids,resultObservedAt,patch:patches.size===1?first.patch:null,format:'Bo'+(target*2-1),finishedAt:new Date(finishedAt).toISOString(),wins});
 }
 return series;
}

function tournamentKey(value){
 return String(value??'').toLowerCase().replace(/\s+(stage|season|group|playoffs|qualifier|ix|viii|vii|vi|v|iv|iii|ii|i)\b.*$/i,'').replace(/[^a-zа-я0-9]/g,'');
}

export function matchDotaResults(records, maps){
 const available=dotaSeries(maps);
 const candidates=new Map();
 for(const record of records){
  if(record.game!=='dota'||!record.format||!record.tournament)continue;
  const matches=available.filter(series=>{
   const delta=Date.parse(series.date)-Date.parse(record.kickoff);
   return delta>=-60*60000&&delta<=90*60000&&Date.parse(series.date)>Date.parse(record.createdAt)&&record.format===series.format&&
     tournamentKey(record.tournament)===tournamentKey(series.tournament)&&sameTeams(record,series);
  });
  if(matches.length!==1)continue;
  const group=candidates.get(matches[0].id)??[];
  group.push({record,series:matches[0]});
  candidates.set(matches[0].id,group);
 }
 return [...candidates.values()].filter(rows=>rows.length===1).map(([{record,series}])=>{
  const winner=series.winner===(sameTeams(record,series)===1?series.a:series.b)?record.a:record.b;
  const direct=sameTeams(record,series)===1;
  return {...series,id:record.fixtureId,a:record.a,b:record.b,winner,
   providerTeamIds:direct?series.providerTeamIds:[...series.providerTeamIds].reverse(),
   wins:direct?series.wins:[...series.wins].reverse(),seriesId:series.id};
 });
}
