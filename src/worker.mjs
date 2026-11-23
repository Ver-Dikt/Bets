import {normalizeOpenDota,normalizeBo3} from './providers.mjs';
// Same-origin read-only upstream proxy with explicit missing-data errors.
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
async function get(url){const res=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});if(!res.ok)throw Error('Source HTTP '+res.status);return res.json()}
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(u.pathname==='/api/health')return respond({ok:true,name:'Bets',mode:'paper'});
 if(u.pathname==='/api/dota/history'){try{const data=await get('https://api.opendota.com/api/proMatches');return respond({source:'OpenDota',mode:'finished, map-level',matches:normalizeOpenDota(data)})}catch(e){return respond({error:String(e.message),matches:[]},502)}}
 if(u.pathname==='/api/cs/history'){const day=u.searchParams.get('date')||new Date().toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day)))return respond({error:'Invalid date'},400);try{const data=await get('https://api.bo3.gg/api/v2/matches/finished?date='+day+'&utc_offset=0&filter%5Bdiscipline_id%5D%5Beq%5D=1');return respond({source:'bo3.gg (unofficial)',mode:'finished, series-level',matches:normalizeBo3(data)})}catch(e){return respond({error:String(e.message),matches:[]},502)}}
 if(u.pathname.startsWith('/api/'))return respond({error:'No endpoint'},404);
 const res=await env.ASSETS.fetch(request);const h=new Headers(res.headers);h.set('x-content-type-options','nosniff');h.set('x-frame-options','DENY');h.set('referrer-policy','no-referrer');return new Response(res.body,{status:res.status,headers:h})
}};