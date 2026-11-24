// Normalize map-level CS2 scores from bo3.gg. Never turn series results into map results.
// Independent implementation following fields observed in public provider responses.
const POOL=new Set(['Ancient','Anubis','Dust2','Inferno','Mirage','Nuke','Train','Vertigo','Overpass','Cache','Cobblestone']);
export function normalizeCSMaps(payload){
 if(!payload||!Array.isArray(payload.results))throw Error('bo3.gg map history schema changed');
 const rows=[];
 for(const match of payload.results){
  if(match?.id==null||!Array.isArray(match.games))continue;
  for(let i=0;i<match.games.length;i++){
   const game=match.games[i];
   const mapName=String(game?.map_name??'').trim();
   if(!POOL.has(mapName))continue;
   const winId=game?.winner_team_clan?.team?.id,loseId=game?.loser_team_clan?.team?.id;
   if(winId==null||loseId==null||String(winId)===String(loseId))continue;
   const winScore=Number(game.winner_clan_score),loseScore=Number(game.loser_clan_score);
   if(!Number.isSafeInteger(winScore)||!Number.isSafeInteger(loseScore)||winScore<=loseScore||loseScore<0||winScore>60)continue;
   const dt=Date.parse(game.begin_at??match.start_date);
   if(!Number.isFinite(dt))continue;
   const id=String(game.id??i+1);
   rows.push({id:'bo3-map-'+match.id+'-'+id,seriesId:'cs-'+match.id,
    date:new Date(dt).toISOString(),map:mapName,
    a:'bo3:'+String(winId),b:'bo3:'+String(loseId),winner:'bo3:'+String(winId),
    scoreA:winScore,scoreB:loseScore,source:'bo3.gg (unofficial)'});
  }
 }
 return rows;
}
export function mergeCSMaps(oldRows,newRows){
 if(!Array.isArray(oldRows)||!Array.isArray(newRows))throw Error('Invalid map archive');
 const map=new Map(oldRows.map(m=>[m.id,m]));
 let added=0,conflicts=0;
 for(const m of newRows){
  if(!m.id||!m.a||!m.b||!m.map||!Number.isFinite(Date.parse(m.date)))continue;
  const older=map.get(m.id);
  if(!older){map.set(m.id,m);added++}
  else if(older.winner!==m.winner||older.a!==m.a||older.b!==m.b||older.map!==m.map)conflicts++;
 }
 return {matches:[...map.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id)),added,conflicts};
}
