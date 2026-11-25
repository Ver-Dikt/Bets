import assert from 'node:assert/strict';
import test from 'node:test';
import {auditResult,csResultsById,latestUnresolved,parseFaceitResults,recentDotaResults} from '../src/result-sources.mjs';
import {reconcilePaper} from '../src/settlement.mjs';
import {matchDotaResults} from '../src/dota-series.mjs';

const at=Date.parse('2026-11-24T21:00:00Z');
const kickoff='2026-11-24T17:00:00Z',createdAt='2026-11-24T15:00:00Z';
const record={fixtureId:'bo3-22',game:'cs2',a:'Alpha',b:'Beta',pick:'Alpha',kickoff,createdAt,format:'Bo3',actual:null,tournament:'ESEA Advanced'};

test('direct result checks resolve older pending forecasts before revisiting settled CS2 series',()=>{
 const events=[
  {type:'forecast',record},
  {type:'settlement',fixtureId:record.fixtureId,result:1},
  {type:'forecast',record:{...record,fixtureId:'bo3-23'}},
  {type:'forecast',record:{...record,fixtureId:'bo3-24',kickoff:'2026-11-24T16:00:00Z'}},
  {type:'forecast',record:{...record,fixtureId:'bo3-25',kickoff:'2026-11-24T22:00:00Z'}}
 ];
 assert.deepEqual(latestUnresolved(events,at).map(row=>row.fixtureId),['bo3-24','bo3-23','bo3-22']);
});

test('bo3 ID backfill ignores unrelated and live rows but retains verified forfeits',async()=>{
 const response={id:22,discipline_id:1,status:'defwin',team1:{name:'Alpha'},team2:{name:'Beta'},team1_id:1,team2_id:2,winner_team_id:2,start_date:kickoff,bo_type:3};
 const got=await csResultsById([record],async url=>{
  assert.equal(new URL(url).searchParams.get('filter[matches.id][in]'),'22');
  return {results:[response,{...response,status:'current'},{...response,id:23}]};
 });
 assert.equal(got.length,1);
 assert.equal(got[0].resultKind,'technical');
});

test('manual outcome is matched ahead of kickoff and cannot override a conflicting official winner',()=>{
 const entry={fixtureId:record.fixtureId,format:'Bo3',a:'Beta',b:'Alpha',winner:'Beta',startedAt:kickoff,
  observedAt:'2026-11-24T20:00:00Z',mapCount:3,url:'https://escorenews.com/ru/csgo/test'};
 const review=auditResult(entry,record,at);
 assert.equal(review.winner,'Beta');
 assert.equal(auditResult({...entry,startedAt:createdAt},record,at),null);
 assert.equal(auditResult({...entry,url:'https://escorenews.com.example/test'},record,at),null);
 assert.equal(reconcilePaper([record],[review],new Date(at).toISOString()).records[0].actual,0);
 assert.equal(reconcilePaper([record],[review,{...review,verifiedReview:false,winner:'Alpha'}],new Date(at).toISOString()).resolvedNew,0);
});

test('FACEIT requires a complete played result and a unique matching ESEA fixture',()=>{
 const m={game:'cs2',status:'FINISHED',match_id:'1-abcdefghijkl',best_of:3,
  started_at:Date.parse(kickoff)/1000,finished_at:at/1000-10,
  teams:{faction1:{name:'Alpha'},faction2:{name:'Beta'}},results:{winner:'faction2',score:{faction1:1,faction2:2}}};
 assert.equal(parseFaceitResults({items:[m]},[record],at)[0].winner,'Beta');
 assert.deepEqual(parseFaceitResults({items:[m]},[record,{...record,fixtureId:'bo3-23'}],at),[]);
 assert.deepEqual(parseFaceitResults({items:[{...m,results:{winner:'faction2'}}]},[record],at),[]);
});

test('OpenDota pages older maps and verifies series starting early, after the forecast was recorded',async()=>{
 const start=Date.parse(kickoff)-33*60000;
 const map=(n)=>({id:'dota-'+n,discipline:'dota',game:'dota',kind:'map',a:'Alpha',b:'Beta',winner:'Alpha',seriesId:'89',seriesType:1,
  providerTeamIds:['1','2'],tournament:'Cup',date:new Date(start+n*3600000).toISOString(),finishedAt:new Date(start+n*3600000+10000).toISOString()});
 const maps=await recentDotaResults([{...record,game:'dota'}],async cursor=>cursor===null?{matches:[map(1)],cursor:1}:{matches:[map(0)],cursor:null},async()=>{});
 assert.equal(maps.length,2);
 const predict={...record,game:'dota',fixtureId:'agenda-dota-22',tournament:'Cup'};
 assert.equal(matchDotaResults([predict],maps).length,1);
 assert.equal(matchDotaResults([{...predict,createdAt:kickoff}],maps).length,0);
});
