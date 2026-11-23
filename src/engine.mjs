// Bets research models: no future leakage and no bookmaker probabilities as inputs.
// These are uncalibrated baselines until forward validation on real historical datasets.
export const sigmoid=points=>1/(1+10**(-points/400));
const valid=m=>m&&m.a&&m.b&&m.a!==m.b&&(m.winner===m.a||m.winner===m.b)&&Number.isFinite(Date.parse(m.date));
export function history(matches,discipline,before){
 const cutoff=Date.parse(before);
 if(!Number.isFinite(cutoff))throw Error('Некорректная дата');
 return matches.filter(m=>m.discipline===discipline&&valid(m)&&Date.parse(m.date)<cutoff)
 .sort((x,y)=>Date.parse(x.date)-Date.parse(y.date)||String(x.id??'').localeCompare(String(y.id??'')));
}
export function fit(matches,discipline,before){
 const ordered=history(matches,discipline,before),elo=new Map(),seen=new Map();
 for(const m of ordered){
  const ra=elo.get(m.a)??1500,rb=elo.get(m.b)??1500,p=sigmoid(ra-rb),win=m.winner===m.a?1:0;
  elo.set(m.a,ra+24*(win-p));elo.set(m.b,rb+24*((1-win)-(1-p)));
  seen.set(m.a,(seen.get(m.a)??0)+1);seen.set(m.b,(seen.get(m.b)??0)+1);
 }
 return {elo,seen,count:ordered.length};
}
function wilsonNeutral(w,n,prior=5){return (w+prior/2)/(n+prior)}
function recentTeam(matches,name,window=12){
 const a=matches.filter(m=>m.a===name||m.b===name).slice(-window);
 const wins=a.reduce((s,m)=>s+(m.winner===name?1:0),0);
 return {played:a.length,wins,rate:wilsonNeutral(wins,a.length,6)};
}
function h2h(matches,a,b){
 const pair=matches.filter(m=>(m.a===a&&m.b===b)||(m.a===b&&m.b===a)).slice(-10);
 const wins=pair.filter(m=>m.winner===a).length;
 return {played:pair.length,wins,rate:wilsonNeutral(wins,pair.length,8)};
}
export function modelComparison(matches,game,a,b,before){
 if(!a||!b||a===b||!['cs2','dota'].includes(game))throw Error('Некорректные команды или игра');
 const ordered=history(matches,game,before);
 const s=fit(ordered,game,before),na=s.seen.get(a)??0,nb=s.seen.get(b)??0;
 if(Math.min(na,nb)<10)return {status:'insufficient',na,nb,required:10,historyCount:ordered.length};
 const paElo=sigmoid((s.elo.get(a)??1500)-(s.elo.get(b)??1500));
 const formA=recentTeam(ordered,a),formB=recentTeam(ordered,b),head=h2h(ordered,a,b);
 // Simple shrinkage heuristics; fit/tune weights only on historical train folds.
 const paForm=Math.max(.05,Math.min(.95,.5+(formA.rate-formB.rate)*.75));
 const paH2H=head.rate;
 const weights={elo:.65,form:.25,h2h:.10};
 const pa=weights.elo*paElo+weights.form*paForm+weights.h2h*paH2H;
 return {status:'ok',model:'ensemble-v1-uncalibrated',pa,pb:1-pa,na,nb,historyCount:ordered.length,
  components:{elo:paElo,form:paForm,h2h:paH2H},weights,
  evidence:{formA:formA.played,formB:formB.played,h2h:head.played},
  caveat:'Uncalibrated heuristic. H2H without direct matches shrinks toward 50%.'};
}
export function predict(matches,game,a,b,before){
 const r=modelComparison(matches,game,a,b,before);
 if(r.status!=='ok')return r;
 // Legacy callers rely on pa/pb and model only; retain extended evidence.
 return r;
}
export function market(pa,oa,ob){
 const a=oa===''||oa==null?null:Number(oa),b=ob===''||ob==null?null:Number(ob);
 if(!(pa>0&&pa<1)||[a,b].some(x=>x!=null&&(!Number.isFinite(x)||x<=1)))throw Error('Некорректные коэффициенты');
 return {fairA:1/pa,fairB:1/(1-pa),evA:a==null?null:pa*a-1,evB:b==null?null:(1-pa)*b-1,overround:a!=null&&b!=null?1/a+1/b-1:null};
}
export function score(records){
 const resolved=records.filter(r=>(r.actual===0||r.actual===1)&&Number.isFinite(r.probability)&&r.probability>=0&&r.probability<=1);
 const priced=resolved.filter(r=>Number.isFinite(r.odds)&&r.odds>1);
 const profit=priced.reduce((s,r)=>s+(r.actual?r.odds-1:-1),0);
 return {count:records.length,resolved:resolved.length,wins:resolved.filter(r=>r.actual===1).length,
 brier:resolved.length?resolved.reduce((s,r)=>s+(r.probability-r.actual)**2,0)/resolved.length:null,
 logloss:resolved.length?resolved.reduce((s,r)=>s-(r.actual?Math.log(Math.max(1e-12,r.probability)):Math.log(Math.max(1e-12,1-r.probability))),0)/resolved.length:null,
 roi:priced.length?profit/priced.length:null,priced:priced.length};
}
export function walkForward(matches,game,{warmup=100}={}){
 const ordered=history(matches,game,'9999-12-31T00:00:00Z'),forecasts=[];
 for(let i=warmup;i<ordered.length;i++){
  const m=ordered[i];
  // Same-timestamp games are excluded by strict cutoff. No hindsight.
  const p=modelComparison(ordered.slice(0,i),game,m.a,m.b,m.date);
  if(p.status!=='ok')continue;
  forecasts.push({id:m.id,probability:p.pa,actual:m.winner===m.a?1:0,createdAt:m.date,game});
 }
 return {game,total:ordered.length,tested:forecasts.length,skipped:Math.max(0,ordered.length-warmup-forecasts.length),...score(forecasts)};
}

export function compareModels(matches,game,{warmup=100}={}){
 const ordered=history(matches,game,'9999-12-31T00:00:00Z');
 const buckets={ensemble:[],elo:[],form:[],h2h:[]};
 for(let i=warmup;i<ordered.length;i++){
  const m=ordered[i],p=modelComparison(ordered.slice(0,i),game,m.a,m.b,m.date);
  if(p.status!=='ok')continue;
  const actual=m.winner===m.a?1:0;
  buckets.ensemble.push({probability:p.pa,actual});
  for(const k of ['elo','form','h2h'])buckets[k].push({probability:p.components[k],actual});
 }
 return {game,total:ordered.length,results:Object.fromEntries(Object.entries(buckets).map(([model,records])=>[model,score(records)])),
  note:'All metrics are on the same chronologically eligible matches; no tuning on the test rows.'};
}
