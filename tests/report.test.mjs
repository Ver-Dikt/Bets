import test from 'node:test';import assert from 'node:assert/strict';import {backtestFast} from '../src/backtest.mjs';
test('fixed neutral 50% baseline Brier is 0.25',()=>{
 const event=[{probability:.5,actual:0},{probability:.5,actual:1}];
 const mean=event.reduce((s,r)=>s+(r.probability-r.actual)**2,0)/event.length;
 assert.equal(mean,.25);
});
test('no synthetic provider records means no forecast report',()=>{
 const r=backtestFast([],'cs2');assert.equal(r.tested,0);assert.equal(r.results.ensemble.brier,null);
});
