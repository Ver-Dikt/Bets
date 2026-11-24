export function briefRows(seeds, fixtures, journal, results, now) {
  const byId = new Map(fixtures.map(fixture=>[fixture.id,fixture]));
  const archive = new Map(results.map(result=>[result.id,result]));
  return seeds.map(seed=>{
    const fixture = byId.get(seed.id) ?? seed;
    const entries = journal.filter(event=>(event.record?.fixtureId??event.fixtureId)===fixture.id);
    const forecast = entries.findLast(event=>event.type==='forecast')?.record;
    const settlement = entries.findLast(event=>event.type==='settlement');
    const live = entries.findLast(event=>event.type==='live');
    const gap = entries.findLast(event=>event.type==='skip');
    const result = /^bo3-\d+$/.test(fixture.id) ? archive.get('cs-'+fixture.id.slice(4)) : null;
    const freshLive = fixture.status==='live'&&now-Date.parse(fixture.fetchedAt)<40*60000;
    const status = settlement||result ? 'finished' : freshLive ? 'live' : Date.parse(fixture.date)>now ? 'upcoming' : 'started';
    return {fixture, forecast, settlement, live, gap, result, status};
  }).sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date));
}

export function priceComparison(probability, odds){
  if(!Number.isFinite(probability)||probability<0||probability>1||!Number.isFinite(odds)||odds<=1)return null;
  return {breakEven:1/odds, delta:probability-1/odds};
}
