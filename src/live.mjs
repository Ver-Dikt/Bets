export function seriesChance(mapChance, format, score) {
  if (!Number.isFinite(mapChance) || mapChance<=0 || mapChance>=1 ||
      !/^Bo[1357]$/.test(format) || !Array.isArray(score) || score.length!==2 ||
      !score.every(value=>Number.isSafeInteger(value)&&value>=0)) return null;
  const target = (Number(format.slice(2))+1)/2;
  if (score.some(value=>value>=target)) return null;
  const memo = new Map();
  function solve(a,b){
    if(a===target)return 1;
    if(b===target)return 0;
    const key=a+':'+b;
    if(!memo.has(key))memo.set(key,mapChance*solve(a+1,b)+(1-mapChance)*solve(a,b+1));
    return memo.get(key);
  }
  return solve(...score);
}

// Convert a same-format pre-match series probability to an independent map
// estimate. The resulting live scenario conditions on verified map wins.
function mapChanceFromSeries(base,format){
  if (!Number.isFinite(base)||base<=0||base>=1||seriesChance(.5,format,[0,0])===null) return null;
  let low=0,high=1;
  for(let i=0;i<40;i++){
    const middle=(low+high)/2;
    if(seriesChance(middle,format,[0,0])<base)low=middle;
    else high=middle;
  }
  return (low+high)/2;
}

export function seriesUpdate(base, format, score){
  return seriesChance(mapChanceFromSeries(base,format),format,score);
}

export function decidingMapTotal(probability,format,basis){
  if(format!=='Bo3'&&format!=='Bo5')return null;
  const p=basis==='series'?mapChanceFromSeries(probability,format):basis==='map'?probability:null;
  if(!Number.isFinite(p)||p<=0||p>=1)return null;
  const split=p*(1-p);
  const over=format==='Bo3'?2*split:6*split**2;
  return {line:format==='Bo3'?2.5:4.5,over,under:1-over};
}

export function forecastTotal(record){
  if(record.probabilityBasis==='map')return null;
  return decidingMapTotal(record.game==='dota'?record.mapProbability:record.probabilityA,
    record.format,record.game==='dota'?'map':'series');
}
