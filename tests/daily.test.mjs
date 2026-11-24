import assert from 'node:assert/strict';
import test from 'node:test';
import {dailyRows,tally,totalTally} from '../src/daily.mjs';

test('daily totals use one pre-match prediction per fixture and preserve the PARI subset',()=>{
 const now=Date.parse('2026-11-24T07:05:00Z'), date='2026-11-24T06:00:00Z';
 const event={id:'bo3-133418',a:'PARIVISION',b:'DENDELE',date,game:'cs2'};
 const base={fixtureId:event.id,a:event.a,b:event.b,kickoff:date,game:event.game};
 const journal=[
  {type:'forecast',record:{...base,id:'first',pick:event.a,createdAt:'2026-11-24T05:00:00Z'}},
  {type:'forecast',record:{...base,id:'latest',pick:event.b,createdAt:'2026-11-24T05:55:00Z'}},
  {type:'forecast',record:{...base,id:'too-late',pick:event.a,createdAt:'2026-11-24T06:05:00Z'}}
 ];
 const rows=dailyRows({day:'2026-11-24',fixtures:[],journal,now,
  brief:{fixtures:[{...event,publicPrice:{odds:[1.58,2.38]}}]},
  matches:[{...event,id:'cs-133418',discipline:'cs2',winner:event.a,finishedAt:'2026-11-24T06:45:00Z'}]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].forecast.id,'latest');
 assert.deepEqual(rows[0].price.odds,[1.58,2.38]);
 assert.deepEqual(tally(rows),{total:1,won:0,lost:1,upcoming:0,pending:0});
 assert.deepEqual(tally(rows,row=>row.musPick),{total:1,won:1,lost:0,upcoming:0,pending:0});
});


test('technical results override old losses and only played maps settle saved totals',()=>{
 const kickoff='2026-11-24T06:00:00Z';
 const base={game:'cs2',a:'A',b:'B',pick:'A',kickoff,createdAt:'2026-11-24T05:00:00Z',format:'Bo3',
  total:{line:2.5,over:.4,under:.6}};
 const journal=[
  {type:'forecast',record:{...base,id:'forfeit',fixtureId:'bo3-10'}},
  {type:'forecast',record:{...base,id:'played',fixtureId:'bo3-11'}},
  {type:'settlement',forecastId:'forfeit',fixtureId:'bo3-10',result:0},
  {type:'series-score',forecastId:'forfeit',format:'Bo3',maps:3}
 ];
 const verified={a:'A',b:'B',winner:'B',discipline:'cs2',date:kickoff,format:'Bo3'};
 const rows=dailyRows({day:'2026-11-24',fixtures:[],journal,now:Date.parse('2026-11-24T09:00:00Z'),
  matches:[{...verified,id:'cs-10',resultKind:'technical'},{...verified,id:'cs-11',mapCount:2}]});
 assert.deepEqual(tally(rows),{total:2,won:0,lost:1,upcoming:0,pending:0,technical:1});
 assert.equal(rows[0].actualMaps,null);
 assert.equal(totalTally(rows).resolved,1);
 assert.equal(totalTally(rows).correct,1);
 assert.equal(totalTally(rows).technical,1);
});
