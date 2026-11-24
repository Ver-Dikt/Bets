import {clampProbability, logistic, logit} from './ratings.mjs';
import {featureNames, modelNames, projectFeatures} from './research.mjs';

export const researchLabels = {
  dynamicElo: 'Dynamic Elo', glicko2: 'Glicko-2', trueSkill: 'TrueSkill',
  bradleyTerry: 'Bradley–Terry', bayesian: 'Байесовская модель',
  catBoost: 'CatBoost', lightGBM: 'LightGBM', legacy: 'Контрольная модель',
  equalChance: 'Равные шансы', formatPrior: 'Историческая частота'
};

function lightLeaf(tree, vector) {
  let node = tree;
  while (Array.isArray(node)) {
    const [feature, threshold, left, right] = node;
    node = vector[feature] <= threshold ? left : right;
  }
  return node;
}

function catLeaf([splits, leaves], vector) {
  const index = splits.reduce((result, [feature, threshold], depth) =>
    Math.fround(vector[feature]) > threshold ? result + 2 ** depth : result, 0);
  return leaves[index];
}

function probability(model, vector) {
  if (model.type === 'catBoost') {
    return logistic(model.bias + model.scale * model.trees.reduce((sum, tree) => sum + catLeaf(tree, vector), 0));
  }
  if (model.type !== 'lightGBM') throw Error('Unknown research model: ' + model.type);
  return logistic(model.trees.reduce((sum, tree) => sum + lightLeaf(tree, vector), 0));
}

export function inferResearch(example, bundle, target) {
  const winner = target === 'winner';
  const result = winner
    ? Object.fromEntries([...modelNames, 'legacy'].map((name, index) => [name, example.vector[index]]))
    : {legacy: example.baselineTotal, formatPrior: bundle.prior};
  if (winner) result.equalChance = .5;
  for (const [name, model] of Object.entries(bundle.models)) {
    const direct = probability(model, example.vector);
    const reverse = probability(model, example.mirrored);
    result[name] = (direct + (winner ? 1 - reverse : reverse)) / 2;
  }
  for (const [name, p] of Object.entries(result)) {
    const [slope, intercept] = bundle.calibration[name];
    result[name] = logistic(slope * logit(clampProbability(p)) + intercept);
  }
  return result;
}

export function projectResearch(bundle, history, maps, fixtures, time) {
  if (!bundle) return new Map();
  if (bundle.schemaVersion !== 1 || bundle.featureNames?.join() !== featureNames.join()) {
    throw Error('Research bundle does not match the current feature schema');
  }
  const result = new Map();
  for (const [game, artifact] of Object.entries(bundle.games)) {
    if (!artifact.models.winner || !(artifact.availableAfter < time)) continue;
    const projected = projectFeatures(history, maps, fixtures, game, time);
    for (const fixture of fixtures) {
      const example = projected.get(fixture.id);
      if (!example?.eligible) continue;
      const winner = artifact.models.winner;
      const total = artifact.models.totals[fixture.format];
      const probabilities = inferResearch(example, winner, 'winner');
      const totalProbabilities = total ? inferResearch(example, total, 'total') : null;
      result.set(fixture.id, {
        version: bundle.version, selected: winner.selected, approved: winner.approved,
        probabilities, evidence: example.metadata,
        total: total && {
          line: fixture.format === 'Bo3' ? 2.5 : 4.5, selected: total.selected,
          approved: total.approved, probabilities: totalProbabilities
        }
      });
    }
  }
  return result;
}
