import test from 'node:test';import assert from 'node:assert/strict';
import {days,isoDay,fetchCsDay,fetchDotaPage,fetchJson} from '../src/collect.mjs';
test('date ranges are UTC and validate calendar',()=>{
 assert.deepEqual([...days('2026-11-22','2026-11-24')],['2026-11-22','2026-11-23','2026-11-24']);
 assert.throws(()=>isoDay('2026-02-30'));assert.throws(()=>[...days('2026-11-23','2026-11-20')]);
});
test('CS collector uses day filter and normalizes provider teams',async()=>{
 let url='';
 const request=async u=>{url=u;return {ok:true,json:async()=>({data:{tiers:{top:{matches:[{id:5,team1_id:1,team2_id:2,winner_team_id:1,start_date:'2026-11-23T08:00:00Z'}]}}},included:{teams:{1:{name:'A'},2:{name:'B'}}}})}};
 const rows=await fetchCsDay('2026-11-23',{request});assert.equal(rows[0].winner,'A');assert.match(url,/date=2026-11-23/);
});
test('OpenDota cursor advances into earlier matches',async()=>{
 let url='';
 const request=async u=>{url=u;return {ok:true,json:async()=>[{match_id:7,start_time:1795000000,radiant_name:'R',dire_name:'D',radiant_win:true},{match_id:4,start_time:1794000000,radiant_name:'X',dire_name:'Y',radiant_win:false}]}};
 const page=await fetchDotaPage(10,{request});assert.equal(page.cursor,4);assert.match(url,/less_than_match_id=10/);assert.equal(page.matches.length,2);
});
test('failed dependency surfaces HTTP status, not empty real data',async()=>{
 await assert.rejects(fetchJson('https://invalid.example',{retries:0,request:async()=>({ok:false,status:403})}),/HTTP 403/);
});
