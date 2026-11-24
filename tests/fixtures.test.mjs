import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeCSFixtures,normalizeDotaFixtures,mergeFixtures} from '../src/fixtures.mjs';
test('CS2 schedule reads included team names and tournament',()=>{
 const p={data:[{id:100,team1_id:8,team2_id:9,start_date:'2026-11-25T12:00:00Z',status:'upcoming',tournament_id:4}],
 included:{teams:{'8':{name:'Spirit'},'9':{name:'Vitality'}},tournaments:{'4':{name:'Major'}}}};
 const m=normalizeCSFixtures(p);assert.equal(m.length,1);assert.equal(m[0].a,'Spirit');assert.equal(m[0].tournament,'Major');assert.equal(m[0].status,'upcoming');
});
test('CS2 current matches label live snapshot; invalid and finished are excluded',()=>{
 const x=normalizeCSFixtures({data:{matches:[{id:1,team1_name:'A',team2_name:'B',start_date:'2026-11-24T12:00:00Z',status:'current',team1_score:1,team2_score:0},{id:2,status:'finished'}]}});
 assert.equal(x.length,1);assert.equal(x[0].status,'live');assert.deepEqual(x[0].score,[1,0]);
});
test('Dota schedule provider normalizer avoids fictional teams',()=>{
 const x=normalizeDotaFixtures([{id:'abc',teams:[{name:'Liquid'},{name:'Spirit'}],startsAt:'2026-11-25T10:00:00Z',leagueName:'International',matchType:'Bo3'}, {id:'missing',teams:[null,null],startsAt:'2026-11-25'}]);
 assert.equal(x.length,1);assert.equal(x[0].a,'Liquid');assert.equal(x[0].status,'upcoming');
});
test('malformed sources raise errors, dedupe preferring latest instance',()=>{
 assert.throws(()=>normalizeDotaFixtures({foo:1}));assert.throws(()=>normalizeCSFixtures({foo:1}));
 const a={id:'1',date:'2026-11-24',a:'A'},b={...a,a:'New'};assert.equal(mergeFixtures([a],[b])[0].a,'New');
});
