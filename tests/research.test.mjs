import assert from 'node:assert/strict';
import test from 'node:test';
import {initialGlicko, updateGlicko, updateTrueSkill, initialSkill} from '../src/ratings.mjs';
import {replayResearch, projectFeatures, observedMaps, featureNames} from '../src/research.mjs';
import {parseDotaDetails} from '../src/dota-details.mjs';
import {appendJournal, verifyJournal, verifyJournalAdvance} from '../scripts/journal-integrity.mjs';
import {errorReview, reviewPeriod, totalTally} from '../src/daily.mjs';
import {matchCsResults} from '../src/cs-results.mjs';
import {reconcilePaper} from '../src/settlement.mjs';

test('Glicko-2 matches the published Glickman example', () => {
 const rating = (r, rd) => ({...initialGlicko, mu:(r-1500)/173.7178, phi:rd/173.7178});
 const updated=updateGlicko(rating(1500,200),[
  {rating:rating(1400,30),result:1},{rating:rating(1550,100),result:0},{rating:rating(1700,300),result:0}
 ]);
 assert.ok(Math.abs(1500+173.7178*updated.mu-1464.06)<.02);
 assert.ok(Math.abs(173.7178*updated.phi-151.52)<.02);
 assert.ok(Math.abs(updated.sigma-.059996)<.000002);
});

test('TrueSkill updates a two-team no-draw game as the reference implementation', () => {
 const [a,b]=updateTrueSkill(initialSkill,initialSkill,1);
 assert.ok(Math.abs(a.mu-29.205473)<.00002);
 assert.ok(Math.abs(b.mu-20.794527)<.00002);
 assert.ok(Math.abs(a.sigma-7.194817)<.00002);
});

const date = day => new Date(Date.UTC(2026, 9, day)).toISOString();
const series = (id, day, details={}) => ({id,discipline:'cs2',kind:'series',date:date(day),finishedAt:date(day+1),
 a:'Alpha',b:'Bravo',winner:'Alpha',format:'Bo3',wins:[2,1],...details});

test('replay excludes future, simultaneous and late result observations', () => {
 const early=Array.from({length:11},(_,i)=>series('cs-'+i,i+1));
 const target=series('cs-target',16);
 const base=replayResearch([...early,target],[],'cs2').find(row=>row.id===target.id);
 const archive=[...early,target,series('cs-open',15,{finishedAt:date(17)}),series('cs-unobserved',14,{resultObservedAt:date(17)}),
  series('cs-same',16),series('cs-future',19)];
 const newer=replayResearch(archive,[],'cs2').find(row=>row.id===target.id);
 assert.deepEqual(newer.vector,base.vector);
 assert.equal(newer.eligible,true);
 assert.equal(newer.vector.length,featureNames.length);
 assert.deepEqual(replayResearch(archive,[],'dota'),[]);
 const next={...target,game:'cs2',status:'upcoming',date:date(20)};
 assert.deepEqual(projectFeatures(archive,[],[next],'cs2',Date.parse(date(16))).get(next.id).vector,base.vector);
});

test('map result validation checks orientation and target wins', () => {
 assert.equal(observedMaps(series('x',1)),3);
 assert.equal(observedMaps(series('x',1,{wins:[1,2]})),null);
 assert.equal(observedMaps(series('x',1,{wins:[2,2]})),null);
 assert.equal(observedMaps(series('x',1,{format:'Bo5',wins:[3,1]})),4);
});

test('OpenDota player and patch information needs corroborating IDs, start and winner', () => {
 const base={id:'dota-101',a:'Alpha',b:'Bravo',winner:'Bravo',date:date(1),providerTeamIds:['10','20']};
 const detail={match_id:101,radiant_team_id:10,dire_team_id:20,start_time:Date.parse(base.date)/1000,radiant_win:false,patch:61,
  players:Array.from({length:10},(_,i)=>({account_id:i+100,player_slot:i<5?i:128+i-5}))};
 assert.equal(parseDotaDetails(base,detail).patch,'OpenDota #61');
 assert.deepEqual(parseDotaDetails(base,detail).lineups[1],['105','106','107','108','109']);
 assert.equal(parseDotaDetails(base,{...detail,radiant_win:true}),null);
});

test('immutable forecast history detects changed payloads, truncation, reordering and unsigned extension', () => {
 const before={schemaVersion:1,events:[{type:'forecast',record:{id:'first',pick:'Alpha'}}]};
 const after=appendJournal(before,[{type:'forecast',record:{id:'second',pick:'Bravo'}},{type:'settlement',result:0}]);
 assert.deepEqual(after.events[0],before.events[0]);
 assert.doesNotThrow(()=>verifyJournalAdvance(before,after));
 const edited=structuredClone(after);
 edited.events[1].record.pick='Alpha';
 assert.throws(()=>verifyJournal(edited),/chain mismatch/);
 assert.throws(()=>verifyJournal({...after,events:after.events.slice(0,-1)}),/head mismatch/);
 assert.throws(()=>verifyJournal({...after,events:[...after.events].reverse()}),/anchor mismatch/);
 assert.throws(()=>verifyJournalAdvance(before,{schemaVersion:1,events:[...before.events,{type:'settlement'}]}),/overwritten/);
});

test('conflicting verification for one provider ID does not settle a forecast', () => {
 const forecast={fixtureId:'bo3-5',game:'cs2',createdAt:date(14),kickoff:date(16),a:'Alpha',b:'Bravo',pick:'Alpha',actual:null};
 assert.equal(reconcilePaper([forecast],[series('cs-5',16),series('cs-5',16,{winner:'Bravo'})],date(20)).resolvedNew,0);
});

test('period stats count saved totals only and separate ambiguous probability from checked picks', () => {
 assert.equal(reviewPeriod('2026-11-24',7),'2026-11-18');
 assert.equal(reviewPeriod('2026-11-24',90),'2026-08-27');
 const t=totalTally([
  {totalSaved:false,total:{over:.8},totalActual:true},
  {totalSaved:true,total:{over:.6},totalActual:true},
  {totalSaved:true,total:{over:.5},totalActual:true}
 ]);
 assert.deepEqual({total:t.total,resolved:t.resolved,decisive:t.decisive,correct:t.correct},{total:2,resolved:2,decisive:1,correct:1});
 assert.equal(errorReview([{actual:0,forecast:{probability:.7},error:{disagreement:true}}]).confident,1);
});

test('CS2 schedule fallback links only one eligible tournament, team pair and kickoff', () => {
 const forecast={fixtureId:'agenda-cs2-8',game:'cs2',format:'Bo3',tournament:'Test cup',createdAt:date(14),
  kickoff:date(16),a:'Bravo',b:'Alpha',pick:'Alpha',actual:null};
 const match=series('cs-9',16,{source:'bo3.gg (unofficial)',tournament:'Test Cup'});
 assert.deepEqual(matchCsResults([forecast],[match, {...match,id:'cs-10'}]),[]);
 assert.deepEqual(matchCsResults([forecast,{...forecast,fixtureId:'bo3-9'}],[match]),[]);
 const [resolved]=matchCsResults([forecast],[match]);
 assert.deepEqual(resolved.wins,[1,2]);
 const paper=reconcilePaper([forecast],[resolved],date(20)).records[0];
 assert.equal(paper.actual,1);
 assert.equal(paper.sourceMatchId,'cs-9');
});
