#!/usr/bin/env node
// Pull real map-by-map CS2 results from public bo3.gg match endpoint.
// No synthetic scores; any failure stops without corrupting old archive.
import {fetchJson,sleep} from '../src/collect.mjs';
import {normalizeCSMaps,mergeCSMaps} from '../src/maps.mjs';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
const archivePath=resolve('data/private/maps.json');
let archive={schemaVersion:1,updatedAt:null,matches:[]};
try{archive=JSON.parse(await readFile(archivePath,'utf8'));if(!Array.isArray(archive.matches))throw Error('Invalid existing map archive')}catch(e){if(e.code!=='ENOENT')throw e}
let received=0,added=0,conflicts=0;
for(let page=0;page<3;page++){
 if(page)await sleep(1800);
 const url=new URL('https://api.bo3.gg/api/v1/matches');
 url.searchParams.set('scope','show-match-team-last-maps');
 url.searchParams.set('page[offset]',String(page*50));
 url.searchParams.set('page[limit]','50');
 url.searchParams.set('sort','-start_date');
 url.searchParams.set('filter[matches.status][in]','finished');
 url.searchParams.set('filter[matches.discipline_id][eq]','1');
 url.searchParams.set('with','teams,games');
 const payload=await fetchJson(String(url),{retries:1});
 if(page===0){
  const sample=payload?.results?.[0];
  console.log('CS2 map provider sample shape:',JSON.stringify({total:payload?.total,results:payload?.results?.length,keys:sample?Object.keys(sample):[],gamesType:typeof sample?.games,gamesCount:sample?.games?.length,firstGame:sample?.games?.[0]??null}).slice(0,2800));
 }
 const incoming=normalizeCSMaps(payload),combined=mergeCSMaps(archive.matches,incoming);
 archive.matches=combined.matches;received+=incoming.length;added+=combined.added;conflicts+=combined.conflicts;
 console.log('CS2 maps page '+(page+1)+': '+incoming.length+' parsed, '+combined.added+' added');
 if(payload.results.length<50)break;
}
if(conflicts)console.warn('CS2 map identity conflicts: '+conflicts+'; existing history left unchanged');
archive.updatedAt=new Date().toISOString();
await mkdir(dirname(archivePath),{recursive:true});
const tmp=archivePath+'.'+randomUUID()+'.tmp';
await writeFile(tmp,JSON.stringify(archive,null,2)+'\n',{mode:0o600});
await rename(tmp,archivePath);
console.log(JSON.stringify({source:'bo3.gg (unofficial)',received,added,conflicts,total:archive.matches.length}));
