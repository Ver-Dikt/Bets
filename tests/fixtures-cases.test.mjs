import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeCSFixtures,normalizeDotaFixtures} from '../src/fixtures.mjs';
test('CS fixture rejects matches with no verified teams or date',()=>{
 const x=normalizeCSFixtures({data:[{id:4,status:'upcoming'},{id:5,status:'finished',team1_name:'A',team2_name:'B',start_date:'2026-11-25'}]});assert.equal(x.length,0);
});
test('Dota schedule returns empty when valid source has no fixtures',()=>assert.deepEqual(normalizeDotaFixtures([]),[]));
