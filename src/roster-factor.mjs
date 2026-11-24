const deadline=36*3600000;

export function rosterFactor(a,b,game,asOf){
 if(!a||!b||[a,b].some(roster=>!Number.isFinite(Date.parse(roster.observedAt))||Date.parse(roster.observedAt)>asOf||
   asOf-Date.parse(roster.observedAt)>deadline||!Array.isArray(roster.players)||roster.players.length!==5||roster.players.some(player=>!Number.isFinite(player.metric))))return null;
 const mean=roster=>roster.players.reduce((sum,p)=>sum+p.metric,0)/roster.players.length;
 const left=mean(a),right=mean(b);
 const factor=game==='cs2'?.12:.65;
 return {a:Math.max(.15,Math.min(.85,.5+(left-right)*factor)),left,right};
}
