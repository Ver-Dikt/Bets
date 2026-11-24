import {readFile} from 'node:fs/promises';
import {fetchJson} from './collect.mjs';

const MAX_OFFSET = 45 * 60000;
const MAX_PRICE_AGE = 45 * 60000;
const BOOK = 'PARI';
const instant=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)&&Number.isFinite(Date.parse(value));
const aliases = {
  cs2: new Map([
    ['teamliquid', 'liquid'], ['bcg', 'bcgame'], ['fazeclan', 'faze'],
    ['donstuesports', 'donstu'], ['misaesports', 'misa'], ['dramaesports', 'drama'],
    ['havugaming', 'havu'], ['kuusamogg', 'kuusamo'], ['dendelecs','dendele'],
  ]),
  dota: new Map([['aurora','auroragaming'],['spiritacademy','teamspiritacademy'],
    ['innercirclexinsanity','innercircle'],['liquid','teamliquid']]),
};

const key = value => value.normalize('NFKD').toLowerCase().replace(/\p{Mark}/gu,'').replace(/[^\p{L}\p{N}]/gu,'');
export const teamKey = (game, value) => {
  const normalized = key(value);
  return aliases[game].get(normalized) ?? normalized;
};

export function parsePari(payload, {fetchedAt, mode}) {
  if (payload?.schemaVersion !== 1 || payload.bookmaker !== BOOK || !Array.isArray(payload.events)) {
    throw Error('Нераспознанный формат линии PARI');
  }
  const now = Date.parse(fetchedAt);
  const observed = Date.parse(payload.observedAt);
  if (!Number.isFinite(now) || !instant(payload.observedAt) || observed > now) {
    throw Error('Некорректное время снимка PARI');
  }

  return payload.events.map(event => {
    const {id, game, a, b, date, tournament, format, odds, status = 'upcoming'} = event;
    if (!['cs2','dota'].includes(game) || !['upcoming','live'].includes(status) ||
        typeof id !== 'string' || !id || typeof a !== 'string' || typeof b !== 'string' ||
        !teamKey(game,a) || teamKey(game,a) === teamKey(game,b) || !teamKey(game,b) ||
        !instant(date) || (status==='upcoming' && Date.parse(date)<=observed) ||
        (status==='live' && mode==='capture') || !['Bo1','Bo3','Bo5','Bo7'].includes(format) ||
        !Array.isArray(odds) || odds.length !== 2 ||
        odds.some(price => !Number.isFinite(price) || price <= 1)) {
      throw Error('Некорректная запись линии PARI');
    }
    return {id,game,a,b,date,tournament:typeof tournament==='string'?tournament:null,format,odds,
      status,observedAt:payload.observedAt,mode};
  });
}

export const sameTeams = (fixture,line) => {
  if (fixture.game !== line.game) return 0;
  const team = name => teamKey(fixture.game,name);
  if (team(fixture.a)===team(line.a) && team(fixture.b)===team(line.b)) return 1;
  if (team(fixture.a)===team(line.b) && team(fixture.b)===team(line.a)) return -1;
  return 0;
};

export function joinPari(fixtures, lines, fetchedAt) {
  const now = Date.parse(fetchedAt);
  const counts = {matched:0,onlyPari:0,onlySchedule:0,ambiguous:0};
  const matches = new Map();
  const inverse = new Map();
  const active = lines.filter(line => line.status==='live'
    ? now-Date.parse(line.observedAt)<MAX_PRICE_AGE
    : Date.parse(line.date)>now);

  for (const line of active) {
    const candidates = fixtures.flatMap(fixture => {
      if (fixture.status!==line.status || (fixture.format && fixture.format!==line.format) ||
          Math.abs(Date.parse(fixture.date)-Date.parse(line.date))>MAX_OFFSET) return [];
      const orientation = sameTeams(fixture,line);
      return orientation ? [{fixture,orientation}] : [];
    });
    matches.set(line,candidates);
    for (const {fixture} of candidates) {
      inverse.set(fixture.id,(inverse.get(fixture.id)??0)+1);
    }
  }

  const linked = new Map();
  const standalone = [];
  for (const [line,candidates] of matches) {
    const match = candidates[0];
    const unique = candidates.length===1 && inverse.get(match.fixture.id)===1;
    const pari = {
      id:line.id, odds:unique && match.orientation===-1 ? [...line.odds].reverse() : line.odds,
      date:line.date, observedAt:line.observedAt, mode:line.mode,
      freshUntil:new Date(Date.parse(line.observedAt)+MAX_PRICE_AGE).toISOString(),
    };
    if (unique) {
      counts.matched++;
      linked.set(match.fixture.id,{...match.fixture,format:match.fixture.format??line.format,pari});
    } else if (candidates.length) {
      counts.ambiguous++;
    } else {
      counts.onlyPari++;
      standalone.push({...line,id:'pari-'+line.id,pari,source:'PARI',fetchedAt:line.observedAt});
    }
  }

  counts.onlySchedule=fixtures.length-counts.matched;
  return {fixtures:[...fixtures.map(fixture=>linked.get(fixture.id)??fixture),...standalone],coverage:counts};
}

export async function loadPari({fetchedAt, feedUrl=process.env.BETS_PARI_FEED_URL, capturePath=process.env.BETS_PARI_CAPTURE_PATH, request=fetchJson}){
  let error=null;
  if (feedUrl) {
    try {
      if (new URL(feedUrl).protocol!=='https:') throw Error('Feed must use HTTPS');
      const payload=await request(feedUrl,{retries:1});
      const lines=parsePari(payload,{fetchedAt:new Date().toISOString(),mode:'feed'});
      if (Date.now()-Date.parse(payload.observedAt)>=MAX_PRICE_AGE) throw Error('Stale feed');
      return {lines,source:{ok:true,source:BOOK,checkedAt:fetchedAt,observedAt:payload.observedAt,mode:'feed',fixtures:lines.length}};
    }catch{
      error='Автоматическая линия PARI недоступна или устарела';
    }
  }
  const source={ok:false,source:BOOK,checkedAt:fetchedAt,error:error??'Автоматическая линия PARI пока не настроена'};
  if (!capturePath) return {lines:[],source};
  try {
    const payload=JSON.parse(await readFile(capturePath,'utf8'));
    const lines=parsePari(payload,{fetchedAt,mode:'capture'}).filter(line=>Date.parse(line.date)>Date.parse(fetchedAt));
    return {lines,source:{...source,observedAt:payload.observedAt,mode:'capture',fixtures:lines.length}};
  }catch{
    return {lines:[],source:{...source,error:'Локальный снимок PARI недоступен или не прошёл проверку'}};
  }
}
