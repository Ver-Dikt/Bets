import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeFixture,probabilitySteps} from '../src/analysis.mjs';
const now=Date.parse('2026-03-15T00:00:00Z');
const rows=Array.from({length:25},(_,i)=>({id:'cs-'+i,discipline:'cs2',date:new Date(Date.UTC(2026,0,1+i)).toISOString(),
 a:'Alpha',b:'Bravo',winner:i%3?'Alpha':'Bravo',source:'test'}));
test('future CS2 card generates factor-level reasons only with history',()=>{
 const r=analyzeFixture({id:'f',game:'cs2',status:'upcoming',a:'Alpha',b:'Bravo',date:'2026-04-01T00:00:00Z'},rows,'1.95','2.1',now);
 assert.equal(r.status,'ok');assert.equal(r.reasons.length,3);assert.equal(r.comparisons.a.count,25);assert.equal(r.comparisons.h2h.count,10);
 assert.ok(Number.isFinite(r.prices.evA));
});
test('new team with no archive does not fabricate certainty',()=>{
 const r=analyzeFixture({id:'f',game:'cs2',status:'upcoming',a:'New Team',b:'Bravo',date:'2026-04-01T00:00:00Z'},rows,'','',now);
 assert.equal(r.status,'insufficient');
});
test('live cannot get post-kickoff forecast',()=>{
 const r=analyzeFixture({id:'l',game:'cs2',status:'live',a:'Alpha',b:'Bravo',date:'2026-04-01T00:00:00Z'},rows,'','',now);
 assert.equal(r.status,'live');
});
test('future games do not contaminate old match factors',()=>{
 const f={id:'f',game:'cs2',status:'upcoming',a:'Alpha',b:'Bravo',date:'2026-01-23T00:00:00Z'};
 const cutoff=Date.parse('2026-01-22T23:00:00Z');
 const a=analyzeFixture(f,rows,'','',cutoff),b=analyzeFixture(f,[...rows,{...rows[0],id:'future',date:'2027-01-01T00:00:00Z'}],'','',cutoff);
 assert.equal(a.status,b.status);assert.equal(a.comparisons.a.count,b.comparisons.a.count);
});
test('the explanation reconciles a saved CS2 forecast with its map correction',()=>{
 const reasons=[{name:'Elo',a:.43449157379981884,weight:.65},
  {name:'Форма',a:.375,weight:.25},{name:'Личные встречи',a:.5,weight:.1}];
 const probabilityA=1-.5513956743225077;
 const steps=probabilitySteps({reasons,probabilityA,map:{probabilityA:.5383435365079329,weight:.2}});
 assert.equal(steps.length,4);
 assert.equal(steps.at(-1).name,'Карты CS2 и veto');
 assert.ok(Math.abs(.5+steps.reduce((sum,step)=>sum+step.delta,0)-probabilityA)<1e-12);
});
test('the explanation retains the series conversion and marks gaps in legacy records',()=>{
 const reasons=[{name:'Elo',a:.6,weight:1}];
 const steps=probabilitySteps({reasons,probabilityBasis:'series-projected',mapProbability:.62,probabilityA:.676544});
 assert.deepEqual(steps.map(step=>step.name),['Elo','Поправка без сохранённой детализации','Пересчёт с карты на серию']);
 assert.ok(Math.abs(.5+steps.reduce((sum,step)=>sum+step.delta,0)-.676544)<1e-12);
});
