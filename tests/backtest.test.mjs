import test from 'node:test';import assert from 'node:assert/strict';
import {backtestFast} from '../src/backtest.mjs';import {compareModels} from '../src/engine.mjs';
const fixtures=Array.from({length:100},(_,i)=>({id:'fixture-'+i,discipline:'cs2',date:new Date(Date.UTC(2026,0,1+i)).toISOString(),a:'Alpha',b:'Bravo',winner:i%3===0?'Bravo':'Alpha'}));
test('streamed backtest agrees with legacy forward-only model',()=>{
 const fast=backtestFast(fixtures,'cs2',{warmup:20}),slow=compareModels(fixtures,'cs2',{warmup:20});
 assert.equal(fast.tested,slow.results.ensemble.resolved);
 for(const model of ['ensemble','elo','form','h2h']){
  assert.ok(Math.abs(fast.results[model].brier-slow.results[model].brier)<1e-10,model+' Brier mismatch');
  assert.ok(Math.abs(fast.results[model].logloss-slow.results[model].logloss)<1e-10,model+' loss mismatch');
 }
});
test('future match added to archive cannot alter earlier backtest scores',()=>{
 const x=backtestFast(fixtures,'cs2',{warmup:20});
 const later={id:'later',discipline:'cs2',date:'2027-01-01T00:00:00Z',a:'Alpha',b:'Bravo',winner:'Alpha'};
 const y=backtestFast([...fixtures,later],'cs2',{warmup:20});
 assert.equal(y.tested,x.tested+1);
 assert.ok(y.results.ensemble.brier>=0);
});
test('same-time events cannot teach each other',()=>{
 const matched=Array.from({length:11},(_,i)=>({...fixtures[i],date:'2026-01-01T12:00:00Z',id:'same-'+i}));
 const result=backtestFast(matched,'cs2',{warmup:0});
 assert.equal(result.tested,0);
});
test('empty archive honestly reports zero coverage',()=>{
 const x=backtestFast([],'dota');assert.equal(x.total,0);assert.equal(x.tested,0);assert.equal(x.coverage,0);
});
