"""Chronological evaluation and portable inference artifacts for Bets."""
import argparse
import hashlib
import json
import math
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from catboost import CatBoostClassifier
from lightgbm import LGBMClassifier
from scipy.optimize import minimize
from scipy.special import expit, logit

MIN_PROB = .001
TOTAL_LINES = {'Bo3': 2.5, 'Bo5': 4.5}
MIN_HOLDOUT = 100


def epoch(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000


def time_blocks(rows):
    """Put every simultaneous start in one block and embargo unresolved labels."""
    unique = sorted({row['date'] for row in rows})
    if len(unique) < 5:
        return [], {}
    cuts = [unique[math.floor(len(unique) * fraction)] for fraction in (.5, .65, .8)]
    starts = [unique[0], *cuts]
    blocks = [[], [], [], []]
    embargoed = 0
    for row in rows:
        index = sum(row['date'] >= cut for cut in cuts)
        if index < 3 and row['available'] >= epoch(cuts[index]):
            embargoed += 1
            continue
        blocks[index].append(row)
    return blocks, {'starts': starts, 'counts': [len(block) for block in blocks], 'embargoed': embargoed}


def arrays(rows):
    return np.array([row['vector'] for row in rows]), np.array([row['mirrored'] for row in rows])


def labels(rows, line):
    return np.array([row['actual'] if line is None else row['maps'] > line for row in rows], dtype=int)


def clip(probability):
    return np.clip(probability, MIN_PROB, 1 - MIN_PROB)


def metrics(raw, actual):
    p = clip(raw)
    hit = ((p > .5) & (actual == 1)) | ((p < .5) & (actual == 0))
    # Exact ties are abstentions, counted in coverage rather than as lucky hits.
    decisive = p != .5
    bins = []
    for start in [0, .1, .2, .3, .4, .5, .6, .7, .8, .9]:
        mask = (p >= start) & (p < round(start + .1, 1))
        count = int(mask.sum())
        if count:
            bins.append({'from': start, 'count': count, 'expected': float(p[mask].mean()), 'observed': float(actual[mask].mean())})
    confidence = {}
    for threshold in (.65, .70):
        mask = np.maximum(p, 1 - p) >= threshold
        count = int(mask.sum())
        confidence[str(threshold)] = {'count': count, 'correct': int(hit[mask].sum()),
                                      'coverage': count / len(p)}
    return {'confidence': confidence, 'count': len(p), 'decided': int(decisive.sum()), 'correct': int(hit.sum()),
            'accuracy': float(hit.sum() / decisive.sum()) if decisive.any() else None,
            'brier': float(np.mean((p - actual) ** 2)),
            'logLoss': float(-np.mean(actual * np.log(p) + (1 - actual) * np.log(1 - p))),
            'ece': sum(x['count'] * abs(x['expected'] - x['observed']) for x in bins) / len(p),
            'reliability': bins}


def calibrate(probability, actual, symmetric):
    if len(actual) < 20 or len(set(actual)) < 2:
        return [1., 0.]
    x = logit(clip(probability))

    def objective(params):
        slope = params[0]
        intercept = 0. if symmetric else params[1]
        z = slope * x + intercept
        return np.mean(np.logaddexp(0, z) - actual * z) + .015 * ((slope - 1.) ** 2 + intercept ** 2)

    fit = minimize(objective, [1.] if symmetric else [1., 0.],
                   bounds=[(.05, 5.)] if symmetric else [(.05, 5.), (-4., 4.)])
    if not fit.success:
        return [1., 0.]
    return [float(fit.x[0]), 0. if symmetric else float(fit.x[1])]


def boosted(train, line):
    x, mirror = arrays(train)
    y = labels(train, line)
    if len(train) < 30 or len(set(y)) < 2:
        return {}
    x = np.concatenate((x, mirror))
    y = np.concatenate((y, 1 - y if line is None else y))
    models = {
        'catBoost': CatBoostClassifier(iterations=96, depth=4, learning_rate=.035, l2_leaf_reg=8,
                                       random_seed=2026, thread_count=2, verbose=False, allow_writing_files=False),
        'lightGBM': LGBMClassifier(n_estimators=96, num_leaves=12, learning_rate=.035, reg_lambda=8.,
                                   min_child_samples=12, random_state=2026, n_jobs=2, verbosity=-1,
                                   deterministic=True, force_col_wise=True)
    }
    for model in models.values():
        model.fit(x, y)
    return models


def raw_probabilities(rows, line, models, model_names, prior):
    x, mirror = arrays(rows)
    if line is None:
        result = {name: x[:, index] for index, name in enumerate([*model_names, 'legacy'])}
        result['equalChance'] = np.full(len(rows), .5)
    else:
        result = {'legacy': np.array([row['baselineTotal'] for row in rows]), 'formatPrior': np.full(len(rows), prior)}
    for name, model in models.items():
        if name == 'lightGBM':
            first = model.booster_.predict(x, num_threads=2)
            second = model.booster_.predict(mirror, num_threads=2)
        else:
            first = model.predict_proba(x)[:, 1]
            second = model.predict_proba(mirror)[:, 1]
        result[name] = (first + (1 - second if line is None else second)) / 2
    return result


def export_light_node(node):
    if 'leaf_value' in node:
        return node['leaf_value']
    if node['decision_type'] != '<=':
        raise ValueError('Only numeric LightGBM splits are supported')
    return [node['split_feature'], node['threshold'], export_light_node(node['left_child']), export_light_node(node['right_child'])]


def export_model(name, model):
    if name == 'lightGBM':
        return {'type': name, 'trees': [export_light_node(tree['tree_structure']) for tree in model.booster_.dump_model()['tree_info']]}
    with TemporaryDirectory() as folder:
        path = Path(folder) / 'model.json'
        model.save_model(str(path), format='json')
        raw = json.loads(path.read_text())
    scale, bias = raw['scale_and_bias']
    trees = []
    for tree in raw['oblivious_trees']:
        splits = tree['splits'] or []
        if any(split['split_type'] != 'FloatFeature' for split in splits):
            raise ValueError('Only numeric CatBoost splits are supported')
        trees.append([[[split['float_feature_index'], split['border']] for split in splits], tree['leaf_values']])
    return {'type': name, 'scale': scale, 'bias': bias[0], 'trees': trees}


def evaluate(rows, model_names, line=None):
    blocks, description = time_blocks(rows)
    if not blocks or min(map(len, blocks)) < 5:
        return {'status': 'insufficient', 'eligible': len(rows), 'splits': description}, None, {}
    train, selection, calibration, test = blocks
    symmetric = line is None
    train_labels = labels(train, line)
    prior = float((train_labels.sum() + 2) / (len(train) + 4))
    models = boosted(train, line)
    select = raw_probabilities(selection, line, models, model_names, prior)
    selection_labels = labels(selection, line)
    select_metrics = {name: metrics(p, selection_labels) for name, p in select.items()}
    comparison = 'legacy' if symmetric else 'formatPrior'
    candidates = [name for name in select if name not in ('equalChance', 'legacy', 'formatPrior')]
    best = min(candidates, key=lambda name: select_metrics[name]['brier']) if candidates else comparison
    chosen = best if select_metrics[best]['brier'] < select_metrics[comparison]['brier'] else comparison

    calibration_labels = labels(calibration, line)
    calibration_raw = raw_probabilities(calibration, line, models, model_names, prior)
    fit = {name: calibrate(p, calibration_labels, symmetric) if name not in ('equalChance', 'legacy', 'formatPrior')
           else [1., 0.] for name, p in calibration_raw.items()}
    raw = raw_probabilities(test, line, models, model_names, prior)
    actual = labels(test, line)
    calibrated = {name: expit(fit[name][0] * logit(clip(p)) + fit[name][1]) for name, p in raw.items()}
    results = {}
    for name, probability in calibrated.items():
        results[name] = metrics(probability, actual)
        results[name]['rawBrier'] = metrics(raw[name], actual)['brier']
    baseline = results[comparison]
    candidate = results[chosen]
    # Holdout is only a veto on activation, never a second model selection pass.
    approved = (len(test) >= MIN_HOLDOUT and len(calibration) >= 35 and
                candidate['brier'] <= min(baseline['brier'], results['legacy']['brier']) and
                candidate['logLoss'] <= min(baseline['logLoss'], results['legacy']['logLoss']) and
                (not symmetric or (candidate['accuracy'] or 0) >= (baseline['accuracy'] or 0)) and
                (not symmetric or chosen != comparison))
    report = {'status': 'evaluated', 'eligible': len(rows), 'splits': description, 'selected': chosen,
              'baseline': comparison, 'approved': approved, 'models': results,
              'selectionBrier': {name: value['brier'] for name, value in select_metrics.items()}}
    bundle = {'selected': chosen, 'approved': approved, 'calibration': fit, 'prior': prior,
              'models': {name: export_model(name, model) for name, model in models.items()}}
    parity = {}
    for index in range(len(test)):
        row = test[index]
        parity[row['id']] = {'example': {key: row[key] for key in ('vector', 'mirrored', 'baselineTotal')},
                             'expected': {name: float(p[index]) for name, p in calibrated.items()}}
    return report, bundle, parity


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('data', type=Path)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--parity', type=Path)
    args = parser.parse_args()
    data = json.loads(args.data.read_text())
    version = 'research-v1-' + hashlib.sha256(args.data.read_bytes() + Path(__file__).read_bytes()).hexdigest()[:12]
    artifact = {'schemaVersion': 1, 'version': version, 'inputs': data['inputs'], 'featureNames': data['featureNames'],
                'minimumHoldout': MIN_HOLDOUT, 'games': {}}
    parity = {}
    for game, rows in data['games'].items():
        eligible = [row for row in rows if row['eligible']]
        winner, winner_bundle, winner_parity = evaluate(eligible, data['modelNames'])
        featured = sum(row['metadata']['comparableMaps'] > 0 for row in eligible) if game == 'cs2' else sum(
            row['metadata']['mapsA'] > 0 and row['metadata']['mapsB'] > 0 for row in eligible)
        report = {'series': len(rows), 'winner': winner, 'totals': {},
                  'coverage': {'withMapEvidence': featured,
                    'withLineupEvidence': sum(min(row['metadata']['lineupsA'], row['metadata']['lineupsB']) > 0 for row in eligible), 'withPatchEvidence': sum(
                    min(row['metadata']['patchA'], row['metadata']['patchB']) > 0 for row in eligible)}}
        models = {'winner': winner_bundle, 'totals': {}}
        parity[game] = {'winner': winner_parity, 'totals': {}}
        for fmt, line in TOTAL_LINES.items():
            sample = [row for row in eligible if row['format'] == fmt and row['maps'] is not None]
            evaluated, bundle, examples = evaluate(sample, data['modelNames'], line)
            report['totals'][fmt] = evaluated
            models['totals'][fmt] = bundle
            parity[game]['totals'][fmt] = examples
        latest = max((row['available'] for row in rows), default=0)
        artifact['games'][game] = {'availableAfter': latest, 'report': report, 'models': models}
        print(game, 'series', len(rows), 'winner', winner.get('splits'), 'selection', winner.get('selected'),
              'totals', {fmt: val['eligible'] for fmt, val in report['totals'].items()})
    encoded = json.dumps(artifact, separators=(',', ':'), allow_nan=False) + '\n'
    temp = args.bundle.with_suffix('.tmp')
    temp.write_text(encoded)
    temp.replace(args.bundle)
    if args.parity:
        args.parity.write_text(json.dumps(parity, allow_nan=False))


if __name__ == '__main__':
    main()
