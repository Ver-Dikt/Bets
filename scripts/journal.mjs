import {readFile} from 'node:fs/promises';
import {analyzeFixture} from '../src/analysis.mjs';
import {reconcilePaper} from '../src/settlement.mjs';
import {matchDotaResults} from '../src/dota-series.mjs';
import {seriesChance,seriesUpdate,forecastTotal} from '../src/live.mjs';

export function updateJournal(before, fixtures, history, series, recordedAt, maps={},report={}) {
  const time=Date.parse(recordedAt);
  const received=fixture=>time>=Date.parse(fixture.fetchedAt)&&time-Date.parse(fixture.fetchedAt)<5*60000;
  const events=[...before.events];
  const forecasts=new Map(events.filter(item=>item.type==='forecast').map(item=>[item.record.fixtureId,item.record]));
  const settled=new Set(events.filter(item=>item.type==='settlement').map(item=>item.fixtureId));
  const gaps=new Set(events.filter(item=>item.type==='skip').map(item=>item.fixtureId));
  const live=new Map(events.filter(item=>item.type==='live').map(item=>[item.fixtureId,item]));
  for(const fixture of fixtures){
    if(fixture.status!=='upcoming'||Date.parse(fixture.date)<=time||!received(fixture))continue;
    const previous=forecasts.get(fixture.id);
    const rosters=fixture.rosters?.map(roster=>roster?.players.map(player=>player.id).sort().join(':'));
    const sameInputs=previous?.kickoff===fixture.date&&previous.format===fixture.format&&previous.rosters?.join(',')===rosters?.join(',');
    if(sameInputs&&time-Date.parse(previous.createdAt)<6*3600000)continue;
    const forecast=analyzeFixture(fixture,history,'','',time,maps[fixture.id],report[fixture.game]?.calibration);
    if(forecast.status!=='ok'){
      if(!gaps.has(fixture.id))events.push({type:'skip',fixtureId:fixture.id,a:fixture.a,b:fixture.b,
        game:fixture.game,kickoff:fixture.date,recordedAt,source:fixture.source,reason:forecast.status});
      continue;
    }
    const {pa,pb,model}=forecast.result;
    const record={id:fixture.id+'@'+recordedAt,fixtureId:fixture.id,game:fixture.game,
      a:fixture.a,b:fixture.b,pick:forecast.picked,probability:Math.max(pa,pb),probabilityA:pa,mapProbability:forecast.result.factorProbability,probabilityBasis:forecast.probabilityBasis,
      rosters,format:fixture.format,tournament:fixture.tournament,kickoff:fixture.date,createdAt:recordedAt,model,actual:null,
      source:fixture.source,evidence:{historyA:forecast.comparisons.a.count,historyB:forecast.comparisons.b.count,
      map:forecast.mapContribution,roster:forecast.rosterContribution},reasons:forecast.reasons,calibrationDelta:forecast.calibrationDelta,
      odds:fixture.pari?.mode==='feed'&&Date.parse(fixture.pari.freshUntil)>time?fixture.pari.odds:null};
    if(sameInputs&&previous.model===record.model&&Math.abs(previous.probabilityA-pa)<.01)continue;
    const total=forecastTotal(record);
    if(total)record.total=total;
    forecasts.set(fixture.id,record);
    events.push({type:'forecast',record});
  }
  const eligible=[...forecasts.values()].filter(record=>!settled.has(record.fixtureId)&&record.probabilityBasis!=='map');
  const finished=series.filter(row=>row.status==='finished');
  const all=[...forecasts.values()].filter(record=>record.probabilityBasis!=='map');
  const completed=[...history,...finished,...matchDotaResults(all.filter(record=>!finished.some(row=>row.id===record.fixtureId)),history)];
  const result=reconcilePaper(eligible,completed,recordedAt);
  for(const record of result.records){
    if(record.actual===null)continue;
    events.push({type:'settlement',forecastId:record.id,fixtureId:record.fixtureId,result:record.actual,checkedAt:record.checkedAt,
      verifiedMatchId:record.verifiedMatchId,source:record.resolvedFrom,
      error:record.actual===0?{kind:'upset',brier:record.probability**2,knownFactors:record.reasons.map(reason=>reason.name),
        hypothesis:'Проверить покрытие истории и согласованность факторов. Причина расхождения не установлена.'}:null});
  }
  const scores=new Set(events.filter(item=>item.type==='series-score').map(item=>item.forecastId));
  const byId=new Map(completed.map(row=>[row.id,row]));
  const scoreCandidates=all.filter(p=>!scores.has(p.id)&&['Bo3','Bo5'].includes(p.format));
  for(const p of reconcilePaper(scoreCandidates,completed,recordedAt).records){
    if(p.actual===null)continue;
    const match=byId.get(p.verifiedMatchId), wins=match?.wins??match?.score;
    const target=p.format==='Bo3'?2:3;
    if(match?.format!==p.format||!Array.isArray(wins)||wins.length!==2||
      !wins.every(n=>Number.isInteger(n)&&n>=0)||Math.max(...wins)!==target||Math.min(...wins)>=target)continue;
    events.push({type:'series-score',fixtureId:p.fixtureId,forecastId:p.id,format:p.format,maps:wins[0]+wins[1],
      checkedAt:recordedAt,source:match.source});
  }
  for(const fixture of fixtures){
    if(fixture.status!=='live'||!fixture.score||!received(fixture))continue;
    const base=forecasts.get(fixture.id);
    if(!base||base.a!==fixture.a||base.b!==fixture.b||base.format!==fixture.format)continue;
    const pa=fixture.game==='dota'
      ? seriesChance(base.mapProbability??base.probabilityA,base.format,fixture.score)
      : seriesUpdate(base.probabilityA,base.format,fixture.score);
    if(pa===null||live.get(fixture.id)?.score.join(':')===fixture.score.join(':'))continue;
    events.push({type:'live',fixtureId:fixture.id,observedAt:recordedAt,source:fixture.source,
      score:fixture.score,probabilityA:pa,version:'series-state-v1'});
  }
  return {schemaVersion:1,events};
}

export const readJournal=async file=>{
  try{return JSON.parse(await readFile(file,'utf8'))}catch(error){
    if(error.code!=='ENOENT')throw error;
    return {schemaVersion:1,events:[]};
  }
};
