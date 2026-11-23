// Durable, auditable local archive. Provider events, never synthetic match data.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export const DEFAULT_ARCHIVE=resolve(process.cwd(),'.data','matches.json');
export const emptyArchive=()=>({schemaVersion:1,updatedAt:null,matches:[]});

export function isValidMatch(m){
 return Boolean(m&&typeof m==='object'&&typeof m.id==='string'&&m.id.length>0&&m.id.length<120
 &&['cs2','dota'].includes(m.discipline)
 &&typeof m.a==='string'&&typeof m.b==='string'&&m.a.trim()&&m.b.trim()&&m.a!==m.b
 &&(m.winner===m.a||m.winner===m.b)
 &&typeof m.source==='string'&&m.source.trim()
 &&typeof m.date==='string'&&Number.isFinite(Date.parse(m.date)));
}

export function mergeArchive(archive,incoming){
 if(archive?.schemaVersion!==1||!Array.isArray(archive.matches)||!Array.isArray(incoming))throw Error('Неверный формат архива');
 const byId=new Map();
 let rejected=0,added=0,duplicates=0,conflicts=0;
 for(const existing of archive.matches){if(!isValidMatch(existing))throw Error('Архив содержит некорректную запись: '+String(existing?.id));if(byId.has(existing.id))throw Error('В архиве повторён ID: '+existing.id);byId.set(existing.id,existing)}
 for(const item of incoming){
  if(!isValidMatch(item)){rejected++;continue}
  const previous=byId.get(item.id);
  if(!previous){byId.set(item.id,item);added++;continue}
  if(previous.discipline!==item.discipline||previous.a!==item.a||previous.b!==item.b||previous.winner!==item.winner||previous.date!==item.date){conflicts++;continue}
  duplicates++;
 }
 const matches=[...byId.values()].sort((x,y)=>Date.parse(x.date)-Date.parse(y.date)||x.id.localeCompare(y.id));
 return {archive:{...archive,matches},report:{added,duplicates,conflicts,rejected,total:matches.length}};
}

export async function readArchive(file=DEFAULT_ARCHIVE){
 let raw;try{raw=await readFile(file,'utf8')}catch(e){if(e.code==='ENOENT')return emptyArchive();throw e}
 const data=JSON.parse(raw);
 if(data?.schemaVersion!==1||!Array.isArray(data.matches))throw Error('Неизвестная схема архива');
 // Fail closed: corrupt archive should never silently get replaced.
 for(const m of data.matches)if(!isValidMatch(m))throw Error('Повреждённая запись в архиве: '+String(m?.id));
 return data;
}

export async function writeArchive(file,archive){
 if(archive?.schemaVersion!==1||!Array.isArray(archive.matches))throw Error('Invalid archive');
 const dir=dirname(file);await mkdir(dir,{recursive:true});
 const temp=file+'.'+randomUUID()+'.tmp';
 const content=JSON.stringify({...archive,updatedAt:new Date().toISOString()},null,2)+'\n';
 try{await writeFile(temp,content,{flag:'wx',mode:0o600});await rename(temp,file)}
 catch(e){try{const {unlink}=await import('node:fs/promises');await unlink(temp)}catch{}throw e}
}
