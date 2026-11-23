import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalizeMatches,resolveTeamName} from '../src/identity.mjs';
import {predict} from '../src/engine.mjs';
test('provider identity survives a CS2 team rename',()=>{
 const rows=Array.from({length:13},(_,i)=>({discipline:'cs2',id:'cs-'+i,date:new Date(Date.UTC(2026,0,i+1)).toISOString(),a:i<6?'Old Name':'New Name',b:'Opponent',winner:i%3===0?'Opponent':i<6?'Old Name':'New Name',providerTeamIds:['123','456']}));
 const transformed=canonicalizeMatches(rows);
 assert.equal(transformed[0].a,transformed[12].a);
 assert.equal(resolveTeamName(transformed,'cs2','New Name'),'bo3:123');
 const p=predict(transformed,'cs2','bo3:123','bo3:456','2027-01-01');assert.equal(p.status,'ok');
});
test('same display name but different IDs remains distinct',()=>{
 const rows=canonicalizeMatches([{discipline:'cs2',a:'A',b:'B',winner:'A',providerTeamIds:['1','2']},{discipline:'cs2',a:'A',b:'C',winner:'C',providerTeamIds:['3','4']}]);
 assert.notEqual(rows[0].a,rows[1].a);
 assert.throws(()=>resolveTeamName(rows,'cs2','A'),/неоднозначно/);
});
test('old data without provider keys remains usable',()=>{
 const x=canonicalizeMatches([{discipline:'dota',a:'Radiant',b:'Dire',winner:'Dire'}])[0];
 assert.equal(x.a,'Radiant');assert.equal(x.winner,'Dire');
});
