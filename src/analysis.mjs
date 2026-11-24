import {fit,history,modelComparison,market} from './engine.mjs';
import {canonicalizeMatches} from './identity.mjs';
const sum=(items)=>items.reduce((a,x)=>a+x,0);
const pct=(n,d)=>d?100*n/d:null;
export function analyzeFixture(fixture,archive,oddsA='',oddsB=''){
 const game=fixture.game,cutoff=fixture.date;
 const matches=history(canonicalizeMatches(archive),game,cutoff);
 const ids=fixture.providerIds??[];
 const provider=game==='cs2'?'bo3':'opendota';
 const key=(id,label)=>id!=null&&/^[1-9]\d{0,17}$/.test(String(id))?provider+':'+id:label;
 const a=key(ids[0],fixture.a),b=key(ids[1],fixture.b);
 const team=(id)=>{const all=matches.filter(m=>m.a===id||m.b===id);
 const last=all.slice(-10),wins=last.filter(m=>m.winner===id).length;
 const rating=fit(matches,game,cutoff).elo.get(id)??1500;
 return {id,count:all.length,last:last.length,wins,losses:last.length-wins,winrate:pct(wins,last.length),
 lastPlayed:all.length?all.at(-1).date:null,rating};
 };
 const teamA=team(a),teamB=team(b);
 const h2h=matches.filter(m=>(m.a===a&&m.b===b)||(m.a===b&&m.b===a)).slice(-10);
 const comparisons={a:teamA,b:teamB,h2h:{count:h2h.length,winsA:h2h.filter(m=>m.winner===a).length,winsB:h2h.filter(m=>m.winner===b).length},dataCount:matches.length};
 let result,prices=null;
 if(fixture.status==='live')return {status:'live',comparisons,note:'Live отображается как снимок источника. Прогноз после старта не выдаётся.'};
 try{result=modelComparison(matches,game,a,b,cutoff)}
 catch(e){return {status:'error',comparisons,error:e.message}}
 if(result.status!=='ok')return {status:'insufficient',comparisons,result,
  note:'Для расчёта нужно минимум 10 исторических результатов на каждую команду до начала матча.'};
 try{prices=market(result.pa,oddsA,oddsB)}catch(e){return {status:'invalid-odds',comparisons,error:e.message,result}}
 const picked=result.pa>=.5?fixture.a:fixture.b;
 const reasons=[
  {name:'Elo / рейтинг силы',weight:result.weights.elo,a:result.components.elo,
   description:'Рейтинг обновляется после каждого завершённого матча. Учитывает силу предыдущих соперников и время до старта.'},
  {name:'Форма последних 12',weight:result.weights.form,a:result.components.form,
   description:'Последние исходы с поправкой на маленькую выборку. Без составов и патча.'},
  {name:'Личные встречи',weight:result.weights.h2h,a:result.components.h2h,
   description:'До 10 предыдущих встреч. Если их нет, вклад нейтральный: 50%.'}
 ];
 const confidence=Math.min(teamA.count,teamB.count)<20?'низкая':Math.min(teamA.count,teamB.count)<50?'ограниченная':'исследовательская';
 return {status:'ok',comparisons,result,prices,picked,confidence,reasons,
   note:'Эвристический ансамбль, не калиброван. Вероятности — модельные, не гарантия и не рекомендация ставки.'};
}
