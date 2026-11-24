import {fetchJson} from './collect.mjs';

export function parsePanda(rows, game, status, fetchedAt) {
  if (!Array.isArray(rows)) throw Error('Неизвестный формат PandaScore');
  const fixtures = [];
  for (const row of rows) {
    const [a,b] = (row?.opponents ?? []).map(item=>item?.opponent);
    const date = row?.begin_at ?? row?.scheduled_at;
    if (!Number.isSafeInteger(row?.id) || !a?.name || !b?.name || a.id===b.id ||
        !Number.isFinite(Date.parse(date))) continue;
    const size = row.number_of_games;
    const format = [1,2,3,5,7].includes(size) ? 'Bo'+size : null;
    const byId = new Map((row.results??[]).map(item=>[item.team_id,item.score]));
    const score = [byId.get(a.id),byId.get(b.id)];
    const winnerIndex = row.winner_id===a.id ? 0 : row.winner_id===b.id ? 1 : null;
    if (status==='finished' && (row.status!=='finished' || winnerIndex===null)) continue;
    if (status==='live' && row.status!=='running') continue;
    if (status==='upcoming' && row.status!=='not_started') continue;
    fixtures.push({id:'panda-'+game+'-'+row.id, game, a:a.name, b:b.name, date, status,
      tournament:row.league?.name??null, format, providerIds:null,
      score:score.every(value=>Number.isSafeInteger(value)&&value>=0)?score:null,
      source:'PandaScore', fetchedAt, winnerIndex});
  }
  return fixtures;
}

export async function pandaFixtures(game, fetchedAt, token=process.env.BETS_PANDASCORE_TOKEN) {
  if (!token) return null;
  const title = game==='cs2' ? 'csgo' : 'dota2';
  const request = (url, options)=>fetch(url,{...options,headers:{...options.headers,authorization:'Bearer '+token}});
  const phases = {upcoming:'upcoming',live:'running',finished:'past'};
  const results = await Promise.all(Object.entries(phases).map(async ([status,path])=>{
    const url = 'https://api.pandascore.co/'+title+'/matches/'+path+'?per_page=100';
    return parsePanda(await fetchJson(url,{request,retries:1}),game,status,fetchedAt);
  }));
  return {active:[...results[0],...results[1]],finished:results[2]};
}
