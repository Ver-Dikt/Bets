import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {emptyArchive,mergeArchive,writeArchive} from '../src/archive.mjs';

test('personal Bets server serves private archive, validation report, health and PWA', {timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bets-server-'));const file=join(dir,'matches.json');
 const rows=Array.from({length:22},(_,i)=>({id:'cs-'+(i+1),discipline:'cs2',date:new Date(Date.UTC(2026,0,i+1)).toISOString(),a:'Alpha',b:'Beta',winner:i%2?'Beta':'Alpha',source:'test-fixture'}));
 await writeArchive(file,mergeArchive(emptyArchive(),rows).archive);
 const port=31000+Math.floor(Math.random()*10000);
 const child=spawn(process.execPath,['src/server.mjs'],{env:{...process.env,PORT:String(port),BETS_ARCHIVE_PATH:file},stdio:'pipe'});
 try{
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('server exited '+child.exitCode);try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break}}catch{}await sleep(100)}
  assert.equal(ready,true);
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.mode,'paper');
  const main=await fetch(base+'/');assert.equal(main.status,200);assert.match(await main.text(),/<title>Bets/i);
  const engine=await fetch(base+'/engine.mjs');assert.equal(engine.status,200);assert.match(engine.headers.get('content-type'),/javascript/);
  const status=await(await fetch(base+'/api/archive/status')).json();assert.equal(status.total,22);assert.equal(status.cs2,22);
  const archive=await(await fetch(base+'/api/archive?game=cs2&limit=3')).json();assert.equal(archive.total,22);assert.equal(archive.matches.length,3);
  assert.equal((await fetch(base+'/api/archive?limit=99999')).status,400);
  const comparison=await(await fetch(base+'/api/evaluate?game=cs2&warmup=15')).json();
  assert.equal(comparison.total,22);assert.ok(comparison.tested>0);assert.ok(comparison.results.ensemble.brier>=0);
  assert.equal((await fetch(base+'/api/evaluate?game=chess')).status,400);
  assert.equal((await fetch(base+'/api/cs/history?date=nope')).status,400);
  assert.equal((await fetch(base+'/api/nonexistent')).status,404);
 }finally{child.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
});
