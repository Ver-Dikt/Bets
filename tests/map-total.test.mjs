import assert from 'node:assert/strict';
import test from 'node:test';
import {decidingMapTotal,seriesChance} from '../src/live.mjs';

test('BO3 and BO5 totals count only series that reach the deciding map',()=>{
 assert.deepEqual(decidingMapTotal(.5,'Bo3','map'),{line:2.5,over:.5,under:.5});
 assert.deepEqual(decidingMapTotal(.5,'Bo5','map'),{line:4.5,over:.375,under:.625});
 for(const format of ['Bo3','Bo5']){
  const map=decidingMapTotal(.7,format,'map');
  const series=decidingMapTotal(seriesChance(.7,format,[0,0]),format,'series');
  assert.ok(Math.abs(map.over-series.over)<1e-12);
  assert.ok(Math.abs(map.over-decidingMapTotal(.3,format,'map').over)<1e-12);
 }
 assert.equal(decidingMapTotal(.5,'Bo1','series'),null);
 assert.equal(decidingMapTotal(.5,null,'map'),null);
 assert.equal(decidingMapTotal(null,'Bo3','map'),null);
});
