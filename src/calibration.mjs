// Symmetric temperature scaling preserves team-order invariance.
const clip = p => Math.min(1-1e-6,Math.max(1e-6,p));

export function scaleProbability(p, temperature) {
  p=clip(p);
  return 1/(1+Math.exp(-Math.log(p/(1-p))/temperature));
}

export function probabilityMetrics(rows, transform=p=>p) {
  const bins=Array.from({length:10},()=>({n:0,probability:0,actual:0}));
  let brier=0,logloss=0,accuracy=0;
  for(const row of rows){
    const p=clip(transform(row.probability));
    brier+=(p-row.actual)**2;
    logloss-=row.actual===1?Math.log(p):Math.log1p(-p);
    accuracy+=p===.5?.5:Number((p>.5)===Boolean(row.actual));
    const bin=bins[Math.floor(p*10)];
    bin.n++;
    bin.probability+=p;
    bin.actual+=row.actual;
  }
  const n=rows.length;
  const reliability=bins.filter(bin=>bin.n).map(bin=>({
    count:bin.n,mean:bin.probability/bin.n,observed:bin.actual/bin.n,
  }));
  return {n,brier:n?brier/n:null,logloss:n?logloss/n:null,accuracy:n?accuracy/n:null,reliability};
}

export function timeCalibration(buckets) {
  const rows=buckets.ensemble;
  if(rows.length<150)return {status:'insufficient',required:150,available:rows.length};
  const start=rows[Math.floor(rows.length*.55)].date;
  const end=rows[Math.floor(rows.length*.75)].date;
  const validation=rows.filter(row=>row.date>=start&&row.date<end);
  const test=rows.filter(row=>row.date>=end);
  if(validation.length<30||test.length<30)return {status:'insufficient',required:150,available:rows.length};
  const candidates=[1,.7,.85,1.15,1.35,1.65,2,3];
  const temperature=candidates.reduce((best,next)=>
    probabilityMetrics(validation,p=>scaleProbability(p,next)).logloss<
    probabilityMetrics(validation,p=>scaleProbability(p,best)).logloss?next:best);
  const baseline=Object.fromEntries(Object.entries(buckets).map(([name,records])=>
    [name,probabilityMetrics(records.filter(row=>row.date>=end))]));
  baseline.neutral=probabilityMetrics(test,()=>.5);
  return {status:'evaluated',temperature,version:'temperature-v1',validationStart:start,testStart:end,
    validationN:validation.length,testN:test.length,baseline,calibrated:probabilityMetrics(test,p=>scaleProbability(p,temperature))};
}
