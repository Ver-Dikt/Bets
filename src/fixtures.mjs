// Strict, source-labeled esports fixture normalization. No synthetic games or odds.
const iso=x=>{
 if(typeof x!=='string'&&typeof x!=='number')return null;
 const t=typeof x==='number'&&x<1e11?x*1000:Date.parse(String(x));
 return Number.isFinite(t)?new Date(t).toISOString():null;
};
const seriesFormat=value=>[1,2,3,5,7].includes(Number(value))?'Bo'+Number(value):typeof value==='string'&&/^bo[12357]$/i.test(value)?'Bo'+value.slice(2):null;
const name=x=>typeof x==='string'?x.trim():typeof x?.name==='string'?x.name.trim():'';
const lookup=(obj,id)=>obj&&typeof obj==='object'?(obj[String(id)]||obj[Number(id)]||null):null;
const list=data=>Array.isArray(data)?data:Array.isArray(data?.results)?data.results:Array.isArray(data?.data)?data.data:Array.isArray(data?.data?.results)?data.data.results:Array.isArray(data?.data?.matches)?data.data.matches:Array.isArray(data?.matches)?data.matches:[];
export function normalizeCSFixtures(payload,{fetchedAt=new Date().toISOString()}={}){
 if(!payload||typeof payload!=='object'||(!('data' in payload)&&!Array.isArray(payload.results)))throw Error('CS2: нераспознанный формат ответа');
 const included=payload.included??{},teams=included.teams??{};
 const leagues=included.tournaments??included.leagues??{};
 const out=[];
 for(const m of list(payload)){
  if(!m||m.id==null)continue;
  const status=String(m.status??m.parsed_status??'').toLowerCase();
  if(!['upcoming','current','live','scheduled'].includes(status))continue;
  const a=name(m.team1_name)||name(m.team1)||name(m.teams?.[0])||name(lookup(teams,m.team1_id));
  const b=name(m.team2_name)||name(m.team2)||name(m.teams?.[1])||name(lookup(teams,m.team2_id));
  const date=iso(m.start_date??m.begin_at??m.startsAt??m.start_time);
  if(!a||!b||a===b||!date)continue;
  const tournament=name(m.tournament_name)||name(m.tournament)||name(lookup(leagues,m.tournament_id??m.tournament));
  const scoreA=m.team1_score==null?NaN:Number(m.team1_score),scoreB=m.team2_score==null?NaN:Number(m.team2_score);
  out.push({id:'bo3-'+m.id,game:'cs2',a,b,date,status:status==='current'||status==='live'?'live':'upcoming',
   tournament:tournament||null,format:seriesFormat(m.bo_type),
   teamSlugs:[m.team1?.slug??null,m.team2?.slug??null],
   score:(status==='current'||status==='live')&&Number.isInteger(scoreA)&&Number.isInteger(scoreB)&&scoreA>=0&&scoreB>=0?[scoreA,scoreB]:null,
   providerIds:[(m.team1_id??m.team1?.id)==null?null:String(m.team1_id??m.team1.id),(m.team2_id??m.team2?.id)==null?null:String(m.team2_id??m.team2.id)],
   source:'bo3.gg (unofficial)',fetchedAt});
 }
 return out;
}
export function normalizeDotaFixtures(payload,{fetchedAt=new Date().toISOString()}={}){
 if(!Array.isArray(payload))throw Error('Dota 2: нераспознанный формат ответа');
 const out=[];
 for(const m of payload){
  const a=name(m?.teams?.[0]),b=name(m?.teams?.[1]);
  const date=iso(m?.startsAt??m?.start_time);
  if(!a||!b||a===b||!date)continue;
  const id=typeof m.id==='string'||typeof m.id==='number'?String(m.id):null;
  const hash=typeof m.hash==='string'?m.hash:null;
  if(!id&&!hash)continue;
  out.push({id:'dota-schedule-'+(id||hash),game:'dota',a,b,date,status:'upcoming',
    tournament:typeof m.leagueName==='string'?m.leagueName:null,
    format:seriesFormat(m.matchType),score:null,providerIds:null,
    source:'dota.haglund.dev (Liquipedia schedule)',fetchedAt});
 }
 return out;
}
export function mergeFixtures(...groups){
 const byId=new Map();
 for(const group of groups)for(const x of group){if(!x||!x.id)continue;byId.set(x.id,x)}
 return [...byId.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id));
}
