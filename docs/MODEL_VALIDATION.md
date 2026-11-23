# Validation contract

1. Start with real, timestamped finished events; retain match IDs, provider, timestamps and results. No synthetic results in production.
2. Chronologically partition data: historical fitting window, forward validation window and untouched final holdout. Rolling-origin folds instead of random train/test shuffling.
3. Fit Elo only with matches strictly **before** prediction timestamp. Match identity normalization must be verified; aliases and roster changes matter.
4. Evaluate Brier score, logarithmic loss, reliability diagrams, coverage, ROI at *captured pre-match odds* and bookmaker overround. Never calculate ROI at closing odds unless these were actually available at prediction time.
5. Compare with baseline: bookmaker de-vig prices, favourite-only, unadjusted Elo. Track by tournament tier, format BO1/BO3, roster stability and game.
6. Keep a versioned immutable forecast snapshot server-side before match start in a future backend, and auto-settle from independently verified match IDs. Current local browser journal is NOT tamper-proof.
7. Avoid leakage: betting consensus, final map draft and player absences observed after forecast time cannot enter the forecast.
8. Require statistical uncertainty and sufficient observations before claiming an edge. Min 10 matches/team in v0.1 merely prevents empty inputs; it does not validate calibration.
9. Never fabricate Live scores, missing odds, historical matches, or source uptime. Flag provider errors and stale timestamps.
