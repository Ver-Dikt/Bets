const origin='https://www.esportagenda.com';
const games={cs2:{path:'cs2',sport:'Counter-Strike 2'},dota:{path:'dota-2',sport:'Dota 2'}};

export function parseAgenda(html,game,fetchedAt){
 const {sport}=games[game];
 const graphs=[];
 const formats=new Map();
 for(const [,id,format] of html.matchAll(/href=["']\/match\/(\d+)["'][^>]*>[^<]*?[·|]\s*(Bo[12357])\s*<\/a>/gi)){
  formats.set(id,'Bo'+format.slice(2));
 }
 for(const match of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  const data=JSON.parse(match[1]);
  if(Array.isArray(data['@graph']))graphs.push(...data['@graph']);
 }
 if(!graphs.some(row=>row['@type']==='CollectionPage'||row['@type']==='WebPage'))throw Error('Не найдено структурированное расписание Esport Agenda');
 return graphs.flatMap(row=>{
  const match=typeof row.url==='string'&&row.url.match(/^https:\/\/www\.esportagenda\.com\/match\/(\d+)$/);
  const teams=row.competitor;
  const date=Date.parse(row.startDate);
  if(row['@type']!=='SportsEvent'||row.sport!==sport||!match||
     row.eventStatus!=='https://schema.org/EventScheduled'||!Number.isFinite(date)||
     typeof row.startDate!=='string'||!row.startDate.includes('T')||date<=Date.parse(fetchedAt)||
     !Array.isArray(teams)||teams.length!==2||teams.some(team=>typeof team?.name!=='string'||!team.name.trim())||
     teams[0].name===teams[1].name)return [];
  return [{id:'agenda-'+game+'-'+match[1],game,a:teams[0].name,b:teams[1].name,
   date:new Date(date).toISOString(),status:'upcoming',tournament:row.organizer?.name??null,
   format:formats.get(match[1])??null,score:null,providerIds:null,source:'Esport Agenda',sourceUrl:row.url,fetchedAt}];
 });
}

export async function agendaFixtures(game,fetchedAt){
 const response=await fetch(origin+'/'+games[game].path+'/schedule-today',{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Esport Agenda HTTP '+response.status);
 return parseAgenda(await response.text(),game,fetchedAt);
}
