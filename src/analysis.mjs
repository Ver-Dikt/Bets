import {fit,history,modelComparison,market} from './engine.mjs';
import {canonicalizeMatches,resolveTeamName} from './identity.mjs';
import {availableAt} from './evidence-time.mjs';
import {scaleProbability} from './calibration.mjs';
import {rosterFactor} from './roster-factor.mjs';
import {seriesChance} from './live.mjs';
const pct=(n,d)=>d?100*n/d:null;
export function probabilitySteps({reasons, probabilityA, calibrationDelta, map, roster, mapProbability, probabilityBasis}){
 if(!reasons?.length||!Number.isFinite(probabilityA))return [];
 const steps=reasons.map(({name,a,weight})=>({name,delta:(a-.5)*weight}));
 let probability=.5+steps.reduce((sum,step)=>sum+step.delta,0);
 const add=(name,next)=>{
  steps.push({name,delta:next-probability});
  probability=next;
 };
 if(Number.isFinite(calibrationDelta))add('Калибровка',probability+calibrationDelta);
 if(Number.isFinite(map?.probabilityA))add('Карты CS2 и veto',probability+(map.probabilityA-probability)*map.weight);
 if(Number.isFinite(roster?.a))add('Профили игроков',probability+(roster.a-probability)*roster.weight);
 const beforeSeries=probabilityBasis==='series-projected'&&Number.isFinite(mapProbability)?mapProbability:probabilityA;
 if(Math.abs(beforeSeries-probability)>1e-9)add('Поправка без сохранённой детализации',beforeSeries);
 if(probabilityBasis==='series-projected'&&Number.isFinite(mapProbability))add('Пересчёт с карты на серию',probabilityA);
 return steps;
}
export function analyzeFixture(fixture,archive,oddsA='',oddsB='',now=Date.now(),mapInsight=null,calibration=null){
 const game=fixture.game;
 const start=Date.parse(fixture.date);
 if(!Number.isFinite(start))return {status:'error',error:'Invalid fixture date'};
 const cutoff=new Date(Math.min(start,now)).toISOString();
 if(fixture.status==='live'||start<=now)return {status:'live',note:'Матч начался'};
 const normalized=canonicalizeMatches(archive.filter(row=>row.discipline===game));
 const matches=history(availableAt(normalized,cutoff),game,cutoff);
 const ids=fixture.providerIds??[];
 const provider=game==='cs2'?'bo3':'opendota';
 const key=(id,label)=>id!=null&&/^[1-9]\d{0,17}$/.test(String(id))?provider+':'+id:label;
 let a,b;
 try{
  a=ids[0]!=null?key(ids[0],fixture.a):resolveTeamName(matches,game,fixture.a);
  b=ids[1]!=null?key(ids[1],fixture.b):resolveTeamName(matches,game,fixture.b);
 }catch(error){
  return {status:'identity-conflict',note:error.message};
 }
 const model=fit(matches,game,cutoff);
 const team=(id)=>{const all=matches.filter(m=>m.a===id||m.b===id);
 const last=all.slice(-10),wins=last.filter(m=>m.winner===id).length;
 const rating=model.elo.get(id)??1500;
 const form=Object.fromEntries([5,10,20].map(n=>{
  const sample=all.slice(-n);
  return [n,{played:sample.length,wins:sample.filter(m=>m.winner===id).length}];
 }));
 return {id,form,count:all.length,last:last.length,wins,losses:last.length-wins,winrate:pct(wins,last.length),
 lastPlayed:all.length?all.at(-1).date:null,rating};
 };
 const teamA=team(a),teamB=team(b);
 const h2h=matches.filter(m=>(m.a===a&&m.b===b)||(m.a===b&&m.b===a)).slice(-10);
 const comparisons={a:teamA,b:teamB,h2h:{lastPlayed:h2h.at(-1)?.date??null,count:h2h.length,winsA:h2h.filter(m=>m.winner===a).length,winsB:h2h.filter(m=>m.winner===b).length},dataCount:matches.length};
 let result,prices=null;

 try{result=modelComparison(matches,game,a,b,cutoff)}
 catch(e){return {status:'error',comparisons,error:e.message}}
 if(result.status!=='ok')return {status:'insufficient',comparisons,result,
  note:'Для расчёта нужно минимум 10 исторических результатов на каждую команду до начала матча.'};
 const rawProbability=result.pa;
 const useCalibration=calibration?.status==='evaluated'&&calibration.calibrated.brier<=calibration.baseline.ensemble.brier&&
   calibration.calibrated.logloss<=calibration.baseline.ensemble.logloss&&Date.parse(calibration.testStart)<now;
 const historical=useCalibration?scaleProbability(rawProbability,calibration.temperature):rawProbability;
 let probabilityA=historical, probabilityBasis=game==='dota'?'map':'series';
 let version=result.model;
 if(useCalibration)version+='+'+calibration.version;
 const mapValue=mapInsight?.seriesProbabilityA;
 const hasMap=game==='cs2'&&mapInsight?.status==='map-analysis'&&mapInsight.format===fixture.format&&
   mapInsight.teamIds?.map(String).join(':')===ids.map(String).join(':')&&
   Number.isFinite(Date.parse(mapInsight.availableAt))&&Date.parse(mapInsight.availableAt)<now&&
   Number.isFinite(mapValue)&&mapValue>0&&mapValue<1;
 if(hasMap){
   probabilityA=.8*historical+.2*mapValue;
   version+=' + map-elo-v1';
 }
 const roster=rosterFactor(fixture.rosters?.[0],fixture.rosters?.[1],game,now);
 if(roster){
   probabilityA=.9*probabilityA+.1*roster.a;
   version+=' + roster-prior-v1';
 }
 const mapOrSeriesBaseline=probabilityA;
 if(game==='dota'){
   const series=seriesChance(probabilityA,fixture.format,[0,0]);
   if(series!==null){probabilityBasis='series-projected';probabilityA=series;version+=' + series-v1'}
 }
 result={...result,pa:probabilityA,pb:1-probabilityA,model:version,factorProbability:mapOrSeriesBaseline};
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
 return {status:'ok',comparisons,result,prices,picked,confidence,reasons,probabilityBasis,
   calibrationDelta:useCalibration?historical-rawProbability:null,
   rosterContribution:roster?{...roster,weight:.1}:null,mapContribution:hasMap?{probabilityA:mapValue,weight:.2}:null,calibrated:useCalibration,
   note:probabilityBasis==='series-projected'?'Оценка серии из модели карт при допущении независимости карт. Проверка выполнена на уровне отдельных карт.':
     hasMap?'Исследовательская оценка с вкладом карты и симуляции veto. Комбинация требует отдельной проверки.':
     useCalibration?'Вероятность откалибрована на отдельном временном интервале.':'Исследовательская оценка. Используется исходная модель без поправки калибровки.'};
}
