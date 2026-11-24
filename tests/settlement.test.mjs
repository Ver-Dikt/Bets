import test from 'node:test';import assert from 'node:assert/strict';
import {reconcilePaper} from '../src/settlement.mjs';
const r={id:'a',fixtureId:'bo3-133422',game:'cs2',a:'A',b:'B',pick:'A',
 createdAt:'2026-11-24T06:00:00Z',kickoff:'2026-11-24T07:00:00Z',actual:null};
const m={id:'cs-133422',discipline:'cs2',date:'2026-11-24T07:00:00Z',a:'A',b:'B',winner:'B',source:'bo3.gg'};
test('verified same-series CS2 result automatically settles loss',()=>{
 const x=reconcilePaper([r],[m],'2026-11-24T08:00:00Z');assert.equal(x.resolvedNew,1);assert.equal(x.records[0].actual,0);assert.equal(x.records[0].verifiedMatchId,'cs-133422');
});
test('does not settle based only on team names or an unrelated match ID',()=>{
 const x=reconcilePaper([r],[{...m,id:'cs-9999'}]);assert.equal(x.resolvedNew,0);assert.equal(x.records[0].actual,null);
});
test('does not settle Dota schedules against unrelated map results',()=>{
 const x=reconcilePaper([{...r,game:'dota',fixtureId:'dota-schedule-123'}],[m]);assert.equal(x.resolvedNew,0);
});
test('late, incomplete or ambiguous match cannot be rewritten as verified',()=>{
 const x=reconcilePaper([{...r,createdAt:'2026-11-24T08:00:00Z'}],[m]);
 assert.equal(x.resolvedNew,0);
 const y=reconcilePaper([r],[{...m,winner:'UNKNOWN'}]);assert.equal(y.resolvedNew,0);
});
