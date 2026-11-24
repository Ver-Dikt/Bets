import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeFixture} from '../src/analysis.mjs';
const rows=Array.from({length:25},(_,i)=>({id:'cs-'+i,discipline:'cs2',date:new Date(Date.UTC(2026,0,1+i)).toISOString(),
 a:'Alpha',b:'Bravo',winner:i%3?'Alpha':'Bravo',source:'test'}));
test('future CS2 card generates factor-level reasons only with history',()=>{
 const r=analyzeFixture({id:'f',game:'cs2',status:'upcoming',a:'Alpha',b:'Bravo',date:'2026-04-01T00:00:00Z'},rows,'1.95','2.1');
 assert.equal(r.status,'ok');assert.equal(r.reasons.length,3);assert.equal(r.comparisons.a.count,25);assert.equal(r.comparisons.h2h.count,10);
 assert.ok(Number.isFinite(r.prices.evA));
});
test('new team with no archive does not fabricate certainty',()=>{
 const r=analyzeFixture({id:'f',game:'cs2',status:'upcoming',a:'New Team',b:'Bravo',date:'2026-04-01T00:00:00Z'},rows);
 assert.equal(r.status,'insufficient');
});
test('live cannot get post-kickoff forecast',()=>{
 const r=analyzeFixture({id:'l',game:'cs2',status:'live',a:'Alpha',b:'Bravo',date:'2026-04-01T00:00:00Z'},rows);
 assert.equal(r.status,'live');
});
test('future games do not contaminate old match factors',()=>{
 const f={id:'f',game:'cs2',status:'upcoming',a:'Alpha',b:'Bravo',date:'2026-01-23T00:00:00Z'};
 const a=analyzeFixture(f,rows),b=analyzeFixture(f,[...rows,{...rows[0],id:'future',date:'2027-01-01T00:00:00Z'}]);
 assert.equal(a.status,b.status);assert.equal(a.comparisons.a.count,b.comparisons.a.count);
});
