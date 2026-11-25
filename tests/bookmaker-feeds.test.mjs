import assert from 'node:assert/strict';
import test from 'node:test';
import {apiSportLines,attachExternalPrices,externalBoards,oddsLinkLines} from '../src/bookmaker-feeds.mjs';
import {forecastPrice} from '../src/daily.mjs';

const checkedAt='2026-11-25T12:00:00.000Z';
const observedAt='2026-11-25T11:45:00.000Z';
const kickoff='2026-11-25T13:00:00.000Z';
const now=Date.parse(checkedAt);
const fixture={id:'fixture',a:'FaZe',b:'Wildcard',game:'cs2',format:'Bo3',status:'upcoming',date:kickoff};
const oddsLinkMatch={id:'external-1',home_team:'Wildcard',away_team:'FaZe Clan',commence_time:kickoff,
 status:'scheduled',is_live:false,best_of:3,bookmakers:[{key:'pinnacle',markets:[{key:'h2h',last_update:observedAt,
  outcomes:[{name:'Wildcard',price:2.5},{name:'FaZe Clan',price:1.6}]}]}]};
const sportMatch={id:193,startTimestamp:Date.parse(kickoff),status:'notstarted',homeTeam:{name:'FaZe'},awayTeam:{name:'Wildcard'},
 tournament:{category:{name:'Counter-Strike 2'}},esports:{bestOf:3},oddsBk:{pari:{isBettingActive:true,updatedAt:Date.parse(observedAt),
 markets:{result:{hasArgument:false,status:'open',stakeKeys:['w1','w2'],stakes:{w1:{factor:1.7},w2:{factor:2.3}}}}}}};

test('pre-match quotes are linked uniquely, aligned to the match orientation and labeled with the actual bookmaker',()=>{
 const oddsLink=oddsLinkLines([oddsLinkMatch],'cs2',now);
 const apiSport=apiSportLines({matches:[sportMatch]},now);
 const [linked]=attachExternalPrices([fixture],oddsLink,[],now);
 assert.equal(linked.bookPrice.bookmaker,'Pinnacle');
 assert.deepEqual(linked.bookPrice.odds,[1.6,2.5]);
 assert.equal(forecastPrice({...fixture,pick:'FaZe',probability:.7,odds:linked.bookPrice.odds,oddsSource:'Pinnacle',
  oddsProvider:'OddsLink',oddsObservedAt:observedAt,createdAt:checkedAt,kickoff}).odds,1.6);
 assert.equal(attachExternalPrices([fixture],[...oddsLink,...apiSport],[],now)[0].bookPrice.bookmaker,'PARI');
 assert.ok(attachExternalPrices([fixture,{...fixture,id:'ambiguous'}],oddsLink,[],now).every(row=>!row.bookPrice));
 assert.equal(attachExternalPrices([fixture],[],[linked],now)[0].bookPrice.bookmaker,'Pinnacle');
 assert.equal(attachExternalPrices([fixture],[],[linked],now+31*60000)[0].bookPrice,undefined);
});

test('price parsers reject live, stale, map-level and suspended lines',()=>{
 assert.deepEqual(oddsLinkLines([{...oddsLinkMatch,is_live:true}],'cs2',now),[]);
 assert.deepEqual(oddsLinkLines([oddsLinkMatch],'cs2',now+31*60000),[]);
 const map=structuredClone(oddsLinkMatch);
 map.bookmakers[0].markets[0].period='map1';
 assert.deepEqual(oddsLinkLines([map],'cs2',now),[]);
 const suspended=structuredClone(sportMatch);
 suspended.oddsBk.pari.markets.result.stakes.w1.suspended=true;
 assert.deepEqual(apiSportLines({matches:[suspended]},now),[]);
 const live=structuredClone(sportMatch);
 live.oddsBk.pari.markets.result.stage='live';
 assert.deepEqual(apiSportLines({matches:[live]},now),[]);
});

test('provider requests use separate auth headers, expose statuses and skip polling outside the price schedule',async()=>{
 const called=[];
 const opts={oddsLinkKey:'oddslink-test',apiSportKey:'sport-test',now:()=>now,request:async (url,header,key)=>{
  called.push({url,header,key});
  if(url.includes('api-sport'))return {matches:[sportMatch]};
  if(url.includes('dota2'))throw Error('Источник HTTP 429');
  return [oddsLinkMatch];
 }};
 const result=await externalBoards(checkedAt,opts);
 assert.equal(result.lines.length,2);
 assert.equal(result.sources.oddslink.partial,true);
 assert.equal(result.sources.apiSport.quotes,1);
 assert.deepEqual(called.map(row=>row.header),['X-API-Key','X-API-Key','Authorization']);
 assert.ok(called.every(row=>!row.url.includes(row.key)));
 await externalBoards(checkedAt,{...opts,poll:false,previous:result.sources});
 assert.equal(called.length,3);
});
