// Rate-limited free-source collectors. No paid APIs, automatic wagers or scraping bypasses.
import {normalizeBo3,normalizeOpenDota} from './providers.mjs';

export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function isoDay(day){
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Ожидалась дата YYYY-MM-DD');
 const t=Date.parse(day+'T00:00:00.000Z');
 if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==day)throw Error('Недопустимая дата');
 return day;
}
export function* days(from,to,{maxDays=366}={}){
 const start=Date.parse(isoDay(from)+'T00:00:00.000Z'),end=Date.parse(isoDay(to)+'T00:00:00.000Z');
 if(end<start)throw Error('Конечная дата раньше начальной');
 const count=Math.round((end-start)/86400000)+1;
 if(count>maxDays)throw Error('Слишком большой диапазон: '+count+' дней');
 for(let t=start;t<=end;t+=86400000)yield new Date(t).toISOString().slice(0,10);
}
export async function fetchJson(url,{request=fetch,retries=2,wait=sleep}={}){
 for(let i=0;i<=retries;i++){
  let r;
  try{r=await request(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)})}
  catch(e){if(i>=retries)throw Error('Источник недоступен: '+e.message);await wait(1000*(i+1));continue}
  if(r.ok){try{return await r.json()}catch{throw Error('Источник вернул некорректный JSON')}}
  if(![429,500,502,503,504].includes(r.status)||i>=retries)throw Error('Источник HTTP '+r.status);
  const retryAfter=Number(r.headers?.get?.('retry-after'));
  await wait(Number.isFinite(retryAfter)&&retryAfter>0?Math.min(30000,retryAfter*1000):1000*(i+1));
 }
 throw Error('Retries exhausted');
}
export async function fetchCsDay(day,options={}){
 const url='https://api.bo3.gg/api/v2/matches/finished?date='+isoDay(day)+'&utc_offset=0&filter%5Bdiscipline_id%5D%5Beq%5D=1';
 return normalizeBo3(await fetchJson(url,options));
}
export async function fetchDotaPage(cursor=null,options={}){
 if(cursor!==null&&(!Number.isSafeInteger(cursor)||cursor<=0))throw Error('Некорректный курсор OpenDota');
 const url='https://api.opendota.com/api/proMatches'+(cursor===null?'':'?less_than_match_id='+cursor);
 const raw=await fetchJson(url,options),matches=normalizeOpenDota(raw);
 const ids=raw.filter(x=>Number.isSafeInteger(x?.match_id)&&x.match_id>0).map(x=>x.match_id);
 return {matches,cursor:ids.length?Math.min(...ids):null,sourceRows:raw.length};
}
