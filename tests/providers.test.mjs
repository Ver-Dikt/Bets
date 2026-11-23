import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeBo3,normalizeOpenDota} from '../src/providers.mjs';
test('bo3.gg included teams, nested tiers and winner',()=>{
 const payload={data:{tiers:{high_tier:{matches:[{id:33,team1_id:11,team2_id:12,winner_team_id:12,start_date:'2026-10-01T12:00:00Z',bo_type:'bo3',tournament:8}]},low_tier:{matches:[]}}},included:{teams:{'11':{name:'Team A'},'12':{name:'Team B'}},tournaments:{'8':{name:'A League'}}}};
 const out=normalizeBo3(payload);assert.equal(out.length,1);assert.equal(out[0].winner,'Team B');assert.equal(out[0].format,'bo3');assert.equal(out[0].tournament,'A League');
});
test('bo3.gg missing winner or team must not generate fake match',()=>{
 assert.deepEqual(normalizeBo3({data:{tiers:{high_tier:{matches:[{id:1,team1_id:11,team2_id:12,start_date:'2026-10-01'}]}}},included:{teams:{}}}),[]);
});
test('OpenDota match winner and timestamp',()=>{
 const m=normalizeOpenDota([{match_id:100,start_time:1790856000,radiant_name:'Radiant',dire_name:'Dire',radiant_win:false}]);
 assert.equal(m.length,1);assert.equal(m[0].winner,'Dire');assert.equal(m[0].kind,'map');
});
test('OpenDota invalid matches skipped',()=>assert.deepEqual(normalizeOpenDota([{radiant_name:'A',dire_name:'B'}]),[]));
