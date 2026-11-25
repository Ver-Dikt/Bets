import assert from 'node:assert/strict';
import test from 'node:test';
import {joinPari,parsePari,sameTeams} from '../src/pari.mjs';
import {parseAgenda} from '../src/esportagenda.mjs';
import {availableAt} from '../src/evidence-time.mjs';
import {scaleProbability,timeCalibration} from '../src/calibration.mjs';
import {seriesChance,seriesUpdate} from '../src/live.mjs';
import {dotaSeries,matchDotaResults} from '../src/dota-series.mjs';
import {reconcilePaper} from '../src/settlement.mjs';
import {updateJournal} from '../scripts/journal.mjs';

const at='2026-11-24T05:20:00Z';
const kickoff='2026-11-24T06:00:00Z';
const fixture={id:'bo3-1',game:'cs2',a:'FaZe',b:'Wildcard',date:kickoff,status:'upcoming',
 format:'Bo3',source:'fixture source',fetchedAt:at};
const quote={id:'q1',game:'cs2',a:'Wildcard',b:'FaZe Clan',date:kickoff,format:'Bo3',odds:[2.5,1.6]};

test('PARI reverses prices when provider team order is reversed',()=>{
 const lines=parsePari({schemaVersion:1,bookmaker:'PARI',observedAt:at,events:[quote]},{fetchedAt:at,mode:'capture'});
 const result=joinPari([fixture],lines,at);
 assert.deepEqual(result.fixtures[0].pari.odds,[1.6,2.5]);
 assert.equal(result.coverage.matched,1);
 assert.equal(result.fixtures[0].pari.mode,'capture');
 const ambiguous=joinPari([fixture,{...fixture,id:'bo3-2'}],lines,at);
 assert.equal(ambiguous.coverage.ambiguous,1);
 assert.equal(ambiguous.fixtures.some(row=>row.pari),false);
 assert.equal(joinPari([fixture],lines,'2026-11-24T06:01:00Z').coverage.matched,0);
});

test('the Esport Agenda PVISION alias resolves to the main PARIVISION fixture',()=>{
 assert.equal(sameTeams({game:'cs2',a:'PVISION',b:'DENDELE CS'},{game:'cs2',a:'PARIVISION',b:'DENDELE'}),1);
});

test('Agenda accepts exact dated fixtures and reads separately displayed Bo format',()=>{
 const event={'@type':'SportsEvent',sport:'Dota 2',url:'https://www.esportagenda.com/match/123',
  startDate:kickoff,eventStatus:'https://schema.org/EventScheduled',organizer:{name:'BLAST Slam'},
  competitor:[{name:'Alpha'},{name:'Bravo'}]};
 const html='<script type="application/ld+json">'+JSON.stringify({'@graph':[
  {'@type':'CollectionPage'},event,{...event,startDate:'2026-11-24'}
 ]})+'</script><a href="/match/123">BLAST Slam · Bo3</a>';
 const rows=parseAgenda(html,'dota',at);
 assert.equal(rows.length,1);
 assert.equal(rows[0].format,'Bo3');
 assert.equal(rows[0].date,'2026-11-24T06:00:00.000Z');
});

test('the result of a match that has not finished is excluded',()=>{
 const start='2026-11-24T04:00:00Z';
 const rows=[{id:'a',date:start},{id:'b',date:start,finishedAt:'2026-11-24T06:00:00Z'},
  {id:'c',date:start,finishedAt:'2026-11-24T05:15:00Z'}];
 assert.deepEqual(availableAt(rows,at).map(row=>row.id),['c']);
});

test('calibration excludes holdout outcomes from fitting',()=>{
 const rows=Array.from({length:240},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString(),
  probability:.7,actual:i%5===0?0:1}));
 const changed=rows.map((row,i)=>i<180?row:{...row,actual:1-row.actual});
 const first=timeCalibration({ensemble:rows}), second=timeCalibration({ensemble:changed});
 assert.equal(first.temperature,second.temperature);
 assert.equal(first.testN,60);
 assert.notEqual(first.calibrated.brier,second.calibrated.brier);
 assert.ok(Math.abs(scaleProbability(.77,2)+scaleProbability(.23,2)-1)<1e-12);
});

test('series updates preserve the start probability and respond to map scores',()=>{
 assert.ok(Math.abs(seriesUpdate(.62,'Bo3',[0,0])-.62)<1e-10);
 assert.ok(seriesUpdate(.62,'Bo3',[1,0])>.62);
 assert.ok(seriesUpdate(.62,'Bo3',[0,1])<.62);
 assert.equal(seriesChance(.62,'Bo2',[0,0]),null);
 assert.equal(seriesChance(.62,'Bo3',[2,0]),null);
});

test('OpenDota settlement waits for a complete unambiguous verified series',()=>{
 const map=(id,a,b,ids,date,finishedAt)=>({id,discipline:'dota',kind:'map',a,b,winner:'Alpha',
  providerTeamIds:ids,date,finishedAt,seriesId:'42',seriesType:1,tournament:'BLAST SLAM IX'});
 const first=map('a','Alpha','Bravo',['123','456'],kickoff,'2026-11-24T06:40:00Z');
 const second=map('b','Bravo','Alpha',['456','123'],'2026-11-24T06:45:00Z','2026-11-24T07:38:00Z');
 const entry={fixtureId:'agenda-dota-123',game:'dota',a:'Alpha',b:'Bravo',pick:'Alpha',actual:null,
  kickoff,createdAt:at,format:'Bo3',tournament:'BLAST Slam'};
 assert.deepEqual(dotaSeries([first]),[]);
 assert.equal(matchDotaResults([entry,{...entry,fixtureId:'agenda-dota-456'}],[first,second]).length,0);
 const outcomes=matchDotaResults([entry],[first,second]);
 assert.equal(outcomes[0].winner,'Alpha');
 assert.equal(reconcilePaper([entry],outcomes,'2026-11-24T08:00:00Z').resolvedNew,1);
});

test('scheduled forecasts, live and settlement append without changing existing events',()=>{
 const history=Array.from({length:24},(_,i)=>({id:'h'+i,discipline:'cs2',a:'FaZe',b:'Wildcard',winner:'FaZe',
  date:new Date(Date.UTC(2026,9,i+1)).toISOString(),source:'archive'}));
 const original=updateJournal({schemaVersion:1,events:[]},[fixture],history,[],at);
 assert.equal(original.events[0].type,'forecast');
 const time='2026-11-24T06:35:00Z';
 const live=updateJournal(original,[{...fixture,status:'live',fetchedAt:time,score:[1,0]}],history,[],time);
 assert.deepEqual(live.events.slice(0,1),original.events);
 assert.equal(live.events[1].type,'live');
 assert.deepEqual(updateJournal(live,[{...fixture,status:'live',fetchedAt:time,score:[1,0]}],history,[],time),live);
 const result={...history[0],id:'cs-1',date:kickoff,winner:'Wildcard'};
 const settled=updateJournal(live,[],[...history,result],[],'2026-11-24T08:00:00Z');
 assert.deepEqual(settled.events.slice(0,2),live.events);
 assert.equal(settled.events[2].result,0);
});

test('a new pre-match quote is paired with a forecast even inside the refresh interval',()=>{
 const history=Array.from({length:24},(_,i)=>({id:'h'+i,discipline:'cs2',a:'FaZe',b:'Wildcard',winner:'FaZe',
  date:new Date(Date.UTC(2026,9,i+1)).toISOString(),source:'archive'}));
 const original=updateJournal({schemaVersion:1,events:[]},[fixture],history,[],at);
 const now='2026-11-24T05:30:00Z';
 const lines=parsePari({schemaVersion:1,bookmaker:'PARI',observedAt:now,events:[quote]},{fetchedAt:now,mode:'feed'});
 const next=joinPari([{...fixture,fetchedAt:now}],lines,now).fixtures;
 const priced=updateJournal(original,next,history,[],now);
 assert.deepEqual(priced.events[0],original.events[0]);
 assert.deepEqual(priced.events[1].record.odds,[1.6,2.5]);
 assert.equal(priced.events[1].record.oddsObservedAt,now);
 assert.equal(priced.events[1].record.oddsSource,'PARI');
 assert.deepEqual(updateJournal(priced,next,history,[],now),priced);
});
