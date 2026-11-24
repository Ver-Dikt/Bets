import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inferResearch} from '../src/research-inference.mjs';

const [bundle, parity] = await Promise.all(process.argv.slice(2).map(async path => JSON.parse(await readFile(path, 'utf8'))));
let compared = 0;
for (const [game, examples] of Object.entries(parity)) {
  const {models} = bundle.games[game];
  function verify(rows, model, target) {
    for (const {example, expected} of Object.values(rows)) {
      const actual = inferResearch(example, model, target);
      assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
      for (const [name, p] of Object.entries(expected)) {
        assert.ok(Math.abs(actual[name] - p) < 2e-7, game + ' ' + target + ' ' + name + ': ' + p + ' vs ' + actual[name]);
        compared++;
      }
    }
  }
  verify(examples.winner, models.winner, 'winner');
  for (const [format, rows] of Object.entries(examples.totals)) verify(rows, models.totals[format], 'total');
}
assert.ok(compared > 0);
console.log(compared, 'Python ↔ JavaScript probabilities matched');
