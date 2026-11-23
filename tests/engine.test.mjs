import test from 'node:test';import assert from 'node:assert/strict';
import {fit,predict,market,score,history,modelComparison,walkForward} from '../src/engine.mjs';
const sample=(game='cs2',n=120)=>Array.from({length:n},(_,i)=>({
 id:i+1,discipline:game,date:new Date(Date.UTC(2026,0,1+i)).toISOString(),
 a:'Alpha',b:'Bravo',winner:i%3===0?'Bravo':'Alpha'}));
test('no future leakage',()=>assert.equal(history(sample('cs2',3),'cs2',sample('cs2',3)[1].date).length,1));
test('no probability without history',()=>assert.equal(predict([],'dota','Alpha','Bravo','2026-12-01').status,'insufficient'));
test('CS2 and Dota separate',()=>assert.equal(predict(sample('cs2',15),'dota','Alpha','Bravo','2026-12-01').status,'insufficient'));
test('Elo valid and independent of bookmaker',()=>{const r=fit(sample(), 'cs2','2027-01-01');assert.equal(r.count,120);assert.ok(r.elo.get('Alpha')>r.elo.get('Bravo'))});
test('invalid winners skipped',()=>assert.equal(history([{discipline:'cs2',a:'A',b:'B',winner:'C',date:'2026-01-01'}],'cs2','2027-01-01').length,0));
test('ensemble components sum to probability',()=>{const p=modelComparison(sample(),'cs2','Alpha','Bravo','2027-01-01');assert.equal(p.status,'ok');const expected=Object.keys(p.weights).reduce((s,k)=>s+p.weights[k]*p.components[k],0);assert.ok(Math.abs(p.pa-expected)<1e-12);assert.ok(p.pa>0&&p.pa<1)});
test('h2h missing is neutral',()=>{const m=[...Array.from({length:12},(_,i)=>({discipline:'dota',date:new Date(Date.UTC(2026,0,1+i)).toISOString(),a:'A',b:'X',winner:'A'})),...Array.from({length:12},(_,i)=>({discipline:'dota',date:new Date(Date.UTC(2026,1,1+i)).toISOString(),a:'B',b:'Y',winner:'B'}))];assert.equal(predict(m,'dota','A','B','2026-03-01').components.h2h,.5)});
test('EV & market overround',()=>{const r=market(.6,2,2);assert.ok(Math.abs(r.evA-.2)<1e-10);assert.equal(r.overround,0)});
test('Brier and logloss',()=>{const r=score([{probability:.8,actual:1},{probability:.6,actual:0}]);assert.ok(Math.abs(r.brier-.2)<1e-10);assert.ok(r.logloss>0)});
test('walk-forward cannot test training past cutoff',()=>{const r=walkForward(sample(),'cs2',{warmup:20});assert.equal(r.total,120);assert.ok(r.tested<=100);assert.ok(r.brier>=0&&r.brier<=1)});
