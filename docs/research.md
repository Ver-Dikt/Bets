# Evaluation and forecast journal

The public app displays timestamps for forecasts actually written before a match, with one forecast per series in each review period. A later prematch estimate appends another entry. The public view uses the last eligible entry. Settlements and observed map counts are separate events. The SHA-256 chain covers appended events and anchors the legacy prefix. CI compares the prefix with the previous main revision. GitHub repository access and its Git history remain the trust boundary.

Each discipline uses its own result stream, rating state, settings, model weights and calibration. CS2 uses verified series and map-pool history. Dota 2 reconstructs best-of series from OpenDota map IDs, order, sides and verified winners. Best-of-two and unknown Dota formats are excluded from the binary series market. Player performance, patch and lineup stability use prior observed records when present. Team profiles in the match detail come from timestamped provider snapshots. Those profiles are not substituted for actual historical lineups. Tournament and format evidence, recent form, opponent strength, rest and head-to-head history are tracked alongside ratings. The report counts rows with usable map, patch and lineup evidence.

The historical replay applies results only after provider completion or, for old records missing finish time, after a 24-hour delay. A known ingestion timestamp further delays release. Old archives without arrival logs are a retrospective reconstruction and cannot attest when the provider first published each result. Simultaneous starts are grouped. Training, model selection, calibration and the final holdout use separate chronological windows. Rows whose labels cross a window boundary are embargoed. The pre-existing fixed Elo, form and head-to-head formula remains the historical control. The live control continues to include its previously available adjustments. Models use no bookmaker inputs.

Dynamic Elo, Glicko-2, TrueSkill, online Bradley–Terry and a beta-binomial strength model are evaluated alongside CatBoost and LightGBM. Machine-learning models are trained in Python and infer in JavaScript with numeric tree splits. Series winner probabilities are mirrored for side symmetry. Totals are trained separately for Bo3 and Bo5 when sample size permits. Historical format frequency and legacy independent maps are controls for totals. The published report gives denominators, Brier score, log loss, and calibration bins. For exact probability ties the backtest reports an abstention. The 65% and 70% confidence bands include their coverage.

The final holdout can veto activation. A model is not replaced by a different candidate after looking at the holdout. Publication requires 100 holdout series, 35 calibration series and probabilistic losses at least as good as the relevant controls. Winner model accuracy must also match the control. Where a model has no published approval, the active app uses its control and labels unvalidated map-total estimates as research. The separately stored card total is the only total eligible for live audit. An observed map count alone is never scored as a forecast.

## Reproduce the study

```sh
python3 -m pip install -r scripts/research-requirements.txt
mkdir -p data/tmp
node scripts/research-data.mjs
python3 scripts/train-research.py data/tmp/research-data.json data/tmp/research-models.json --parity data/tmp/research-parity.json
node scripts/verify-research.mjs data/tmp/research-models.json data/tmp/research-parity.json
npm test
npm run build:pages
```

The GitHub research workflow produces a candidate artifact. The versioned production artifact in `data/private/research-models.json` changes only when a reviewed candidate is committed. Its input hashes fingerprint the matches, recovered results and map archives. The recovered results supplement consists of normalized provider records, compressed to reduce repo size. It can be decoded with `readRecovered` from `scripts/research-archive.mjs`. Existing provider IDs, winners and dates are protected by the archive merge rules.
