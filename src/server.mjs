import {readArchive,DEFAULT_ARCHIVE} from './archive.mjs';
import {backtestFast} from './backtest.mjs';
import {normalizeOpenDota,normalizeBo3} from './providers.mjs';
// Render-compatible lightweight Node HTTP host; no third-party server dependencies.
import http from 'node:http';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
// Prefer the private GitHub Actions archive when present; never expose this file as a static asset.
const archivePath=()=>process.env.BETS_ARCHIVE_PATH||(existsSync(path.resolve('data/private/matches.json'))?path.resolve('data/private/matches.json'):DEFAULT_ARCHIVE);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))};
async function upstream(url){const r=await fetch(url,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('Source HTTP '+r.status);return r.json()}
async function handler(req,res){const u=new URL(req.url,'http://localhost');if(req.method!=='GET'){return json(res,{error:'Method not allowed'},405)}
if(u.pathname==='/api/health')return json(res,{ok:true,name:'Bets',mode:'paper'});
if(u.pathname==='/api/archive/status'){
 try{const data=await readArchive(archivePath());
  return json(res,{updatedAt:data.updatedAt,total:data.matches.length,cs2:data.matches.filter(m=>m.discipline==='cs2').length,dota:data.matches.filter(m=>m.discipline==='dota').length})}
 catch(e){return json(res,{error:'Archive unavailable: '+e.message},500)}
}
if(u.pathname==='/api/archive'){
 const game=u.searchParams.get('game')||'all',limit=Number(u.searchParams.get('limit')||1000);
 if(!['all','cs2','dota'].includes(game)||!Number.isSafeInteger(limit)||limit<1||limit>2000)return json(res,{error:'Invalid game or limit (1..2000)'},400);
 try{const archive=await readArchive(archivePath());
 const rows=game==='all'?archive.matches:archive.matches.filter(m=>m.discipline===game);
 return json(res,{source:'Private local archive (real finished results only)',updatedAt:archive.updatedAt,total:rows.length,matches:rows.slice(-limit)})}
 catch(e){return json(res,{error:'Archive unavailable: '+e.message},500)}
}
if(u.pathname==='/api/evaluate'){
 const game=u.searchParams.get('game'),warmup=Number(u.searchParams.get('warmup')||100);
 if(!['cs2','dota'].includes(game)||!Number.isSafeInteger(warmup)||warmup<0||warmup>10000)return json(res,{error:'Invalid game or warmup'},400);
 try{const archive=await readArchive(archivePath());const result=backtestFast(archive.matches,game,{warmup});
 return json(res,{...result,archiveUpdatedAt:archive.updatedAt,realDataCount:archive.matches.filter(m=>m.discipline===game).length})}
 catch(e){return json(res,{error:'Evaluation failed: '+e.message},500)}
}

if(u.pathname==='/api/dota/history'){
 try{const data=await upstream('https://api.opendota.com/api/proMatches');return json(res,{source:'OpenDota',mode:'finished, map-level',matches:normalizeOpenDota(data)})}
 catch(e){return json(res,{error:e.message,matches:[]},502)}
}
if(u.pathname==='/api/cs/history'){
 const day=u.searchParams.get('date');
 if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day)))return json(res,{error:'Invalid date'},400);
 try{const data=await upstream('https://api.bo3.gg/api/v2/matches/finished?date='+day+'&utc_offset=0&filter%5Bdiscipline_id%5D%5Beq%5D=1');
 return json(res,{source:'bo3.gg (unofficial)',mode:'finished, series-level',matches:normalizeBo3(data)})}
 catch(e){return json(res,{error:e.message,matches:[]},502)}
}
if(u.pathname.startsWith('/api/'))return json(res,{error:'Unknown endpoint'},404);
let name;try{name=decodeURIComponent(u.pathname);if(name==='/'||name==='')name='/index.html';const file=path.resolve(publicDir,'.'+name);if(!file.startsWith(publicDir+path.sep))return json(res,{error:'Forbidden'},403);const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});res.end(data)}catch{json(res,{error:'Not found'},404)}}
const port=Number(process.env.PORT)||3000;const host=process.env.BETS_HOST||'127.0.0.1';http.createServer((req,res)=>{handler(req,res).catch(e=>json(res,{error:'Internal server error'},500))}).listen(port,host,()=>console.log('Bets listening at http://'+host+':'+port));
