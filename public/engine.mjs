// Independent Elo model; bookmaker odds are not training input.
export const sigmoid=x=>1/(1+10**(-x/400));
export function fit(matches,discipline,before){
 const elo=new Map(),seen=new Map();
 const ordered=matches.filter(m=>m.discipline===discipline&&m.a&&m.b&&m.winner&&m.a!==m.b&&Number.isFinite(Date.parse(m.date))&&Date.parse(m.date)<Date.parse(before)).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 for(const m of ordered){const ra=elo.get(m.a)??1500,rb=elo.get(m.b)??1500,p=sigmoid(ra-rb),win=m.winner===m.a?1:0;
 elo.set(m.a,ra+24*(win-p));elo.set(m.b,rb-24*(win-p));seen.set(m.a,(seen.get(m.a)??0)+1);seen.set(m.b,(seen.get(m.b)??0)+1)}
 return {elo,seen,count:ordered.length};
}
export function predict(matches,game,a,b,before){
 if(!a||!b||a===b||!Number.isFinite(Date.parse(before)))throw Error('Некорректные команды или дата');
 const s=fit(matches,game,before),na=s.seen.get(a)??0,nb=s.seen.get(b)??0;
 if(Math.min(na,nb)<10)return {status:'insufficient',na,nb,required:10};
 const pa=sigmoid((s.elo.get(a)??1500)-(s.elo.get(b)??1500));
 return {status:'ok',pa,pb:1-pa,na,nb,model:'elo-v1'};
}
export function market(pa,oa,ob){
 const a=oa===''||oa==null?null:Number(oa),b=ob===''||ob==null?null:Number(ob);
 if(!(pa>0&&pa<1)||[a,b].some(x=>x!=null&&(!Number.isFinite(x)||x<=1)))throw Error('Некорректные коэффициенты');
 return {fairA:1/pa,fairB:1/(1-pa),evA:a==null?null:pa*a-1,evB:b==null?null:(1-pa)*b-1,overround:a!=null&&b!=null?1/a+1/b-1:null};
}
export function score(records){
 const resolved=records.filter(r=>r.actual===0||r.actual===1),priced=resolved.filter(r=>Number.isFinite(r.odds)&&r.odds>1);
 const profit=priced.reduce((s,r)=>s+(r.actual?r.odds-1:-1),0);
 return {count:records.length,resolved:resolved.length,wins:resolved.filter(r=>r.actual===1).length,brier:resolved.length?resolved.reduce((s,r)=>s+(r.probability-r.actual)**2,0)/resolved.length:null,roi:priced.length?profit/priced.length:null};
}