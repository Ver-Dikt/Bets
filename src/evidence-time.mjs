// Older records often have only scheduled start. Keep those results out of
// the model for at least a full day to avoid training on overlapping series.
const LEGACY_DELAY = 24*3600000;

export function knownTime(row) {
  const start=Date.parse(row.date);
  const ended=Date.parse(row.finishedAt);
  const completed=Number.isFinite(ended)&&ended>start ? ended : start+LEGACY_DELAY;
  const received=Date.parse(row.resultObservedAt);
  return Number.isFinite(received) ? Math.max(received,completed) : completed;
}

export function availableAt(rows, cutoff) {
  const time=Date.parse(cutoff);
  return rows.filter(row=>knownTime(row)<time);
}
