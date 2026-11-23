// One chronological pass over verified finished games, instead of refitting every event.
// Calculates each prediction BEFORE applying any results with the same timestamp.
import {history,sigmoid,score} from './engine.mjs';
export function backtestFast(matches,game,{warmup=100}={}){
 if(!Number.isSafeInteger(warmup)||warmup<0)throw Error('Некорректный период обучения');
 const ordered=history(matches,game,'9999-12-31T00:00:00Z');
 const teams=new Map(),pairs=new Map();
 const buckets={ensemble:[],elo:[],form:[],h2h:[]};
 const team=name=>teams.get(name)??{rating:1500,seen:0,form:[]};
 const pairKey=(a,b)=>[a,b].sort().join('\u0000');
 const rate=(wins,n,prior)=>(wins+prior/2)/(n+prior);
 let i=0;
 while(i<ordered.length){
  let end=i+1;
  const time=Date.parse(ordered[i].date);
  while(end<ordered.length&&Date.parse(ordered[end].date)===time)end++;
  // Predictions for this same-time cohort see identical PRE-cohort ratings.
  for(let j=i;j<end;j++){
   if(j<warmup)continue;
   const m=ordered[j],a=team(m.a),b=team(m.b);
   if(Math.min(a.seen,b.seen)<10)continue;
   const elo=sigmoid(a.rating-b.rating);
   const ar=rate(a.form.reduce((s,v)=>s+v,0),a.form.length,6);
   const br=rate(b.form.reduce((s,v)=>s+v,0),b.form.length,6);
   const form=Math.max(.05,Math.min(.95,.5+(ar-br)*.75));
   const h=pairs.get(pairKey(m.a,m.b))??[];
   const h2h=rate(h.filter(x=>x===m.a).length,h.length,8);
   const ensemble=.65*elo+.25*form+.10*h2h;
   const actual=m.winner===m.a?1:0;
   for(const [model,probability] of Object.entries({ensemble,elo,form,h2h}))buckets[model].push({probability,actual});
  }
  // Only now can this cohort update team states.
  for(let j=i;j<end;j++){
   const m=ordered[j],a=team(m.a),b=team(m.b);
   const result=m.winner===m.a?1:0,p=sigmoid(a.rating-b.rating);
   const ar=a.rating+24*(result-p),br=b.rating+24*((1-result)-(1-p));
   a.rating=ar;b.rating=br;a.seen++;b.seen++;
   a.form.push(result);b.form.push(1-result);
   if(a.form.length>12)a.form.shift();if(b.form.length>12)b.form.shift();
   teams.set(m.a,a);teams.set(m.b,b);
   const key=pairKey(m.a,m.b),head=pairs.get(key)??[];
   head.push(m.winner);if(head.length>10)head.shift();pairs.set(key,head);
  }
  i=end;
 }
 const results=Object.fromEntries(Object.entries(buckets).map(([name,records])=>[name,score(records)]));
 return {game,total:ordered.length,coverage:ordered.length>0?results.ensemble.resolved/ordered.length:0,
  tested:results.ensemble.resolved,results,
  method:'forward-only; same-time results excluded; fixed heuristic weights; uncalibrated'};
}
