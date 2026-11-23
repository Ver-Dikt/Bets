// Stable provider-scoped identities prevent a team rename from resetting its rating.
// Fall back to visible names when a provider does not give reliable team IDs.
export function canonicalizeMatches(matches){
 return matches.map(m=>{
  if(m?.canonicalized===true)return m;
  if(!m||typeof m!=='object')return m;
  const ids=Array.isArray(m.providerTeamIds)?m.providerTeamIds:[];
  const provider=m.discipline==='cs2'?'bo3':m.discipline==='dota'?'opendota':'unknown';
  const resolve=(label,id)=>{
   const str=String(id??'');
   return /^[1-9]\d{0,17}$/.test(str)?provider+':'+str:label;
  };
  const a=resolve(m.a,ids[0]),b=resolve(m.b,ids[1]);
  if(a===b)return m;
  return {...m,displayA:m.a,displayB:m.b,a,b,winner:m.winner===m.a?a:m.winner===m.b?b:m.winner,canonicalized:true};
 });
}
export function resolveTeamName(canonicalRows,game,name){
 const found=new Set();
 const matching=canonicalRows
  .filter(m=>m.discipline===game&&(m.displayA===name||m.displayB===name||m.a===name||m.b===name))
  .slice(-400);
 for(const m of matching){if(m.displayA===name||m.a===name)found.add(m.a);if(m.displayB===name||m.b===name)found.add(m.b)}
 if(found.size>1)throw Error('Название команды неоднозначно: выбери запись с уникальным ID');
 return found.size?[...found][0]:name;
}
