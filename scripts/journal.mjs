import {readFile} from 'node:fs/promises';
import {analyzeFixture} from '../src/analysis.mjs';
import {reconcilePaper,verifiedMapCount} from '../src/settlement.mjs';
import {matchCsResults} from '../src/cs-results.mjs';
import {matchDotaResults} from '../src/dota-series.mjs';
import {seriesChance,seriesUpdate,forecastTotal} from '../src/live.mjs';
import {appendJournal, verifyJournal} from './journal-integrity.mjs';

export function updateJournal(before, fixtures, history, series, recordedAt, maps={},report={},research=new Map(),reviewed=[]) {
  verifyJournal(before);
  const time=Date.parse(recordedAt);
  const received=fixture=>time>=Date.parse(fixture.fetchedAt)&&time-Date.parse(fixture.fetchedAt)<5*60000;
  const events=[...before.events];
  const forecasts=new Map(events.filter(item=>item.type==='forecast').map(item=>[item.record.fixtureId,item.record]));
  const settled=new Set(events.filter(item=>item.type==='settlement').map(item=>item.fixtureId));
  const technical=new Set(events.filter(item=>item.type==='technical-result').map(item=>item.fixtureId));
  const gaps=new Set(events.filter(item=>item.type==='skip').map(item=>item.fixtureId));
  const live=new Map(events.filter(item=>item.type==='live').map(item=>[item.fixtureId,item]));
  for(const fixture of fixtures){
    if(settled.has(fixture.id)||technical.has(fixture.id))continue;
    if(fixture.status!=='upcoming'||Date.parse(fixture.date)<=time||!received(fixture))continue;
    const previous=forecasts.get(fixture.id);
    const rosters=fixture.rosters?.map(roster=>roster?.players.map(player=>player.id).sort().join(':'));
    const sameInputs=previous?.kickoff===fixture.date&&previous.format===fixture.format&&previous.rosters?.join(',')===rosters?.join(',');
    const challenger=research.get(fixture.id);
    const sameVersion=previous?.research?.version===challenger?.version;
    if(sameInputs&&sameVersion&&time-Date.parse(previous.createdAt)<6*3600000)continue;
    const forecast=analyzeFixture(fixture,history,'','',time,maps[fixture.id],report[fixture.game]?.calibration);
    if(forecast.status!=='ok'||forecast.probabilityBasis==='map'){
      if(!gaps.has(fixture.id)){
        events.push({type:'skip',fixtureId:fixture.id,a:fixture.a,b:fixture.b,
          game:fixture.game,kickoff:fixture.date,recordedAt,source:fixture.source,reason:forecast.status==='ok'?'unknown-series-format':forecast.status});
        gaps.add(fixture.id);
      }
      continue;
    }
    const control=forecast.result;
    const selected=challenger?.approved&&Number.isFinite(challenger.probabilities[challenger.selected]);
    const pa=selected?challenger.probabilities[challenger.selected]:control.pa;
    const model=selected?challenger.selected+'@'+challenger.version:control.model;
    const probabilityBasis=selected?'series':forecast.probabilityBasis;
    const pick=pa>=.5?fixture.a:fixture.b;
    const record={id:fixture.id+'@'+recordedAt,fixtureId:fixture.id,game:fixture.game,
      a:fixture.a,b:fixture.b,pick,probability:Math.max(pa,1-pa),probabilityA:pa,mapProbability:selected?null:control.factorProbability,probabilityBasis,
      rosters,format:fixture.format,tournament:fixture.tournament,kickoff:fixture.date,createdAt:recordedAt,model,actual:null,
      source:fixture.source, providerIds:fixture.providerIds, research:challenger,
      control:challenger?{probabilityA:control.pa,model:control.model}:undefined,
      profileEvidence:fixture.rosters?.map(profile=>profile&&Date.parse(profile.observedAt)<=time?profile:null),
      evidence:{historyA:forecast.comparisons.a.count,historyB:forecast.comparisons.b.count,
      map:forecast.mapContribution,roster:forecast.rosterContribution},reasons:forecast.reasons,calibrationDelta:forecast.calibrationDelta,
      odds:fixture.pari?.mode==='feed'&&Date.parse(fixture.pari.freshUntil)>time?fixture.pari.odds:null};
    if(sameInputs&&sameVersion&&previous.model===record.model&&Math.abs(previous.probabilityA-pa)<.01)continue;
    const candidateTotal=challenger?.total;
    const over=candidateTotal?.approved?candidateTotal.probabilities[candidateTotal.selected]:null;
    const total=Number.isFinite(over)?{line:candidateTotal.line,over,under:1-over,model:candidateTotal.selected,validated:true}
      :forecastTotal({...record,probabilityA:control.pa,mapProbability:control.factorProbability,probabilityBasis:forecast.probabilityBasis});
    if(total)record.total={...total,model:total.model??'legacy-independent-maps',validated:total.validated??false};
    forecasts.set(fixture.id,record);
    events.push({type:'forecast',record});
  }
  const finished=series.filter(row=>row.status==='finished');
  const all=[...forecasts.values()].filter(record=>record.probabilityBasis!=='map');
  const needsLink=all.filter(record=>!finished.some(row=>row.id===record.fixtureId));
  const completed=[...history,...finished,...matchCsResults(needsLink,history),...matchDotaResults(needsLink,history),...reviewed];
  const result=reconcilePaper(all.filter(p=>!technical.has(p.fixtureId)),completed,recordedAt);
  for(const record of result.records){
    if(record.technical){
      technical.add(record.fixtureId);
      events.push({type:'technical-result',forecastId:record.id,fixtureId:record.fixtureId,
        checkedAt:record.checkedAt,verifiedMatchId:record.sourceMatchId,source:record.resolvedFrom,sourceUrl:record.sourceUrl});
      continue;
    }
    if(record.actual===null||settled.has(record.fixtureId))continue;
    events.push({type:'settlement',forecastId:record.id,fixtureId:record.fixtureId,result:record.actual,checkedAt:record.checkedAt,
      verifiedMatchId:record.sourceMatchId??record.verifiedMatchId,source:record.resolvedFrom,sourceUrl:record.sourceUrl,
      error:record.actual===0?{kind:'upset',brier:record.probability**2,knownFactors:(record.reasons??[]).map(reason=>reason.name),
        disagreement:record.control?((record.control.probabilityA>=.5)!==(record.probabilityA>=.5)):null,
        hypothesis:'Причина промаха пока неизвестна.'}:null});
  }
  const scores=new Set(events.filter(item=>item.type==='series-score').map(item=>item.forecastId));
  const byId=new Map(completed.map(row=>[row.id,row]));
  const scoreCandidates=all.filter(p=>!technical.has(p.fixtureId)&&!scores.has(p.id)&&['Bo3','Bo5'].includes(p.format));
  for(const p of reconcilePaper(scoreCandidates,completed,recordedAt).records){
    if(p.actual===null)continue;
    const match=byId.get(p.verifiedMatchId);
    const maps=match?.format===p.format?verifiedMapCount(match):null;
    if(maps===null)continue;
    events.push({type:'series-score',fixtureId:p.fixtureId,forecastId:p.id,format:p.format,maps,
      checkedAt:recordedAt,source:match.source});
  }
  for(const fixture of fixtures){
    if(fixture.status!=='live'||!fixture.score||!received(fixture))continue;
    const base=forecasts.get(fixture.id);
    if(!base||base.a!==fixture.a||base.b!==fixture.b||base.format!==fixture.format)continue;
    const pa=base.probabilityBasis==='series-projected'&&Number.isFinite(base.mapProbability)
      ? seriesChance(base.mapProbability,base.format,fixture.score)
      : seriesUpdate(base.probabilityA,base.format,fixture.score);
    const mapsPlayed=fixture.score.reduce((sum,n)=>sum+n,0);
    const previous=live.get(fixture.id), previousMaps=previous?.mapsPlayed??previous?.score?.reduce((sum,n)=>sum+n,0);
    if(pa===null||(previousMaps!=null&&mapsPlayed<=previousMaps))continue;
    events.push({type:'live',fixtureId:fixture.id,observedAt:recordedAt,source:fixture.source,
      mapsPlayed,probabilityA:pa,version:'series-state-v2'});
  }
  return appendJournal(before,events.slice(before.events.length));
}

export const readJournal=async file=>{
  try{return verifyJournal(JSON.parse(await readFile(file,'utf8')))}catch(error){
    if(error.code!=='ENOENT')throw error;
    return {schemaVersion:1,events:[]};
  }
};
