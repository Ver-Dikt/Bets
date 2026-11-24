import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeCSMaps,mergeCSMaps} from '../src/maps.mjs';
const fixture={results:[{id:101,start_date:'2026-10-11T12:00:00Z',games:[
 {id:55,map_name:'Mirage',winner_clan_score:13,loser_clan_score:7,
 winner_team_clan:{team:{id:10}},loser_team_clan:{team:{id:20}}},
 {id:56,map_name:'Nuke',winner_clan_score:11,loser_clan_score:13,
 winner_team_clan:{team:{id:20}},loser_team_clan:{team:{id:10}}}]}]};
test('maps are actual source games, not series guesses',()=>{
 const rows=normalizeCSMaps(fixture);assert.equal(rows.length,1);
 assert.equal(rows[0].map,'Mirage');assert.equal(rows[0].a,'bo3:10');assert.equal(rows[0].b,'bo3:20');
});
test('map collector accepts correctly ordered winner scores only',()=>{
 const result=normalizeCSMaps({results:[{id:101,start_date:'2026-10-11T12:00:00Z',games:[{...fixture.results[0].games[0],winner_clan_score:13,loser_clan_score:12}]}]});
 assert.equal(result.length,1);
});
test('duplicate map keeps first verified record',()=>{
 const rows=normalizeCSMaps(fixture),r=mergeCSMaps(rows,rows);
 assert.equal(r.added,0);assert.equal(r.conflicts,0);assert.equal(r.matches.length,1);
});
test('no data must not produce map statistics',()=>assert.deepEqual(normalizeCSMaps({results:[]}),[]));
