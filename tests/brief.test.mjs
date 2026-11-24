import assert from 'node:assert/strict';
import test from 'node:test';
import {briefRows,priceComparison} from '../site/brief.mjs';

test('a match that leaves the schedule keeps its recorded forecast and exact result',()=>{
 const fixture={id:'bo3-123',date:'2026-11-24T06:00:00Z'};
 const record={fixtureId:fixture.id,pick:'Alpha',probability:.59};
 const history=[{id:'cs-123',winner:'Alpha'}];
 const events=[{type:'forecast',record}];
 const now=Date.parse('2026-11-24T07:00:00Z');
 assert.equal(briefRows([fixture],[],events,[],now)[0].status,'started');
 const [row]=briefRows([fixture],[],events,history,now);
 assert.equal(row.status,'finished');
 assert.equal(row.forecast,record);
 assert.equal(row.result.winner,'Alpha');
});

test('a threshold is independent of the model probability',()=>{
 const result=priceComparison(.631,1.57);
 assert.equal((result.breakEven*100).toFixed(1),'63.7');
 assert.equal((result.delta*100).toFixed(1),'-0.6');
 assert.equal(priceComparison(.631,1),null);
});
