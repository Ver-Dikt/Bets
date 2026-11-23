import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

test('private Bets server serves app, API health and assets', {timeout:12000}, async ()=>{
  const port=31000+Math.floor(Math.random()*10000);
  const child=spawn(process.execPath,['src/server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
  try {
    let base='http://127.0.0.1:'+port;
    let ready=false;
    for(let i=0;i<50;i++){
      if(child.exitCode!==null)throw Error('server exited '+child.exitCode);
      try {const r=await fetch(base+'/api/health');if(r.ok){ready=true;break}}catch{}
      await sleep(100);
    }
    assert.equal(ready,true,'server started');
    const health=await(await fetch(base+'/api/health')).json();
    assert.equal(health.name,'Bets');
    const html=await fetch(base+'/');
    assert.equal(html.status,200);
    assert.match(await html.text(),/<title>Bets/);
    const engine=await fetch(base+'/engine.mjs');
    assert.equal(engine.status,200);
    assert.match(engine.headers.get('content-type'),/javascript/);
    const invalid=await fetch(base+'/api/cs/history?date=invalid');
    assert.equal(invalid.status,400);
    const unknown=await fetch(base+'/api/nonexistent');
    assert.equal(unknown.status,404);
    const forbidden=await fetch(base+'/%2e%2e/%2e%2e/etc/passwd');
    assert.notEqual(forbidden.status,200);
  }finally{
    child.kill('SIGTERM');
  }
});
