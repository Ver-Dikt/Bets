import {dailyRows,tally,reviewPeriod,totalTally,errorReview,compareJournalWinners} from './daily.mjs';
import {analyzeFixture,probabilitySteps} from './analysis.mjs';
const modelNames={
 dynamicElo:'Dynamic Elo',glicko2:'Glicko-2',trueSkill:'TrueSkill',bradleyTerry:'Bradley–Terry',
 bayesian:'Байесовская модель',catBoost:'CatBoost',lightGBM:'LightGBM',legacy:'Контрольная модель',
 equalChance:'Равные шансы',formatPrior:'Историческая частота'
};
const $=id=>document.getElementById(id);
const el=(tag,cls='',text=null)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==null)n.textContent=String(text);return n};
const moscow='Europe/Moscow';
const dayFmt=new Intl.DateTimeFormat('sv-SE',{timeZone:moscow,year:'numeric',month:'2-digit',day:'2-digit'});
const dateFmt=new Intl.DateTimeFormat('ru-RU',{timeZone:moscow,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const shortTime=x=>Number.isFinite(Date.parse(x))?dateFmt.format(new Date(x)):'Время неизвестно';
const dateLong=x=>Number.isFinite(Date.parse(x))?new Intl.DateTimeFormat('ru-RU',{timeZone:moscow,day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(x)):'Время неизвестно';
const pct=x=>typeof x==='number'&&Number.isFinite(x)?(x*100).toFixed(1)+'%':'—';
const closeMatch=probability=>probability<.55;
const asNum=x=>x==null?'—':Number(x).toFixed(1);
let matches=[],fixtures=[],journal=[],report=null,research=null,mapInsights=null,filters={game:'all',view:['#brief','#daily'].includes(location.hash)?'daily':'today',period:'today',tournament:'all'},selected=null,expanded=false,loading=false,fixtureStatus=null;
const assessments=new Map();
const published=new Map();
function forecastFor(fixture){
 const forecast=published.get(fixture.id);
 if(forecast?.kickoff===fixture.date&&forecast.a===fixture.a&&forecast.b===fixture.b&&forecast.format===fixture.format&&
    forecast.probabilityBasis!=='map')return forecast;
}

function assessment(fixture) {
 if(Date.parse(fixture.date)<=Date.now())return {status:'live'};
 if(!assessments.has(fixture.id)){
  let value;
  try{value=analyzeFixture(fixture,matches,'','',Date.now(),mapInsights?.insights?.[fixture.id],report?.games?.[fixture.game]?.calibration)}
  catch{value={status:'identity-conflict'}}
  assessments.set(fixture.id,value);
 }
 return assessments.get(fixture.id);
}
const errorBlock=(title,sub)=>{const root=el('div','empty');root.append(el('strong','',title));if(sub){root.append(el('p','',sub))}return root};
function sourceText(kind){
 const source=fixtureStatus?.sources?.[kind];
 if(!source)return kind.toUpperCase()+': данные не получены';
 if(source.ok)return (kind==='cs2'?'CS2':'Dota 2')+': '+source.fixtures+' матчей · снимок';
 return (kind==='cs2'?'CS2':'Dota 2')+': источник недоступен';
}
function activeFixtures(){
 const now=Date.now(), today=dayFmt.format(now), tomorrow=dayFmt.format(now+86400000);
 return fixtures.filter(f=>filters.game==='all'||f.game===filters.game)
  .filter(f=>f.status==='upcoming'&&Date.parse(f.date)>now)
  .filter(f=>filters.period==='all'||dayFmt.format(new Date(f.date))===(filters.period==='today'?today:tomorrow))
  .filter(f=>filters.tournament==='all'||f.tournament===filters.tournament)
  .sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
function badge(text,cls=''){return el('span','tag'+(cls?' '+cls:''),text)}
function renderSources(){
 $('cs2-source').textContent=sourceText('cs2');
 $('dota-source').textContent=sourceText('dota');
 const root=$('source-warning');root.replaceChildren();
 if(!fixtureStatus){root.append(el('div','source-warning','Нет опубликованного снимка расписания. Придумывать матчи нельзя.'));return}
 const broken=Object.entries(fixtureStatus.sources||{}).filter(([game,v])=>['cs2','dota'].includes(game)&&!v?.ok);
 if(broken.length)root.append(el('div','source-warning','Расписание может быть неполным: '+broken.map(([game])=>game.toUpperCase()).join(', ')+'.'));
 if(Number.isFinite(Date.parse(fixtureStatus.generatedAt))){
  const mins=(Date.now()-Date.parse(fixtureStatus.generatedAt))/60000;
  $('fixture-update').textContent=(mins>90?'Устаревший снимок · ':'Обновлено · ')+shortTime(fixtureStatus.generatedAt);
 }else $('fixture-update').textContent='Время обновления неизвестно';
}
function renderFixtures(){
 document.querySelectorAll('[data-game]').forEach(b=>{const active=b.dataset.game===filters.game;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 const items=activeFixtures(),root=$('fixture-list');root.replaceChildren();
 if(!items.length){
  const broken=(filters.game==='all'?['cs2','dota']:[filters.game]).some(game=>fixtureStatus?.sources?.[game]?.ok===false);
  root.append(errorBlock('Нет подтверждённых матчей для показа',broken?'Источник расписания сообщил об ошибке. Bets не показывает вымышленные игры.':'На момент снимка подходящих предстоящих встреч не найдено.'));$('show-more').hidden=true;return;
 }
 const shown=expanded?items:items.slice(0,10);
 for(const f of shown){
  const button=el('button','fixture'+(f.id===selected?.id?' selected':''));
  button.type='button';button.setAttribute('aria-label','Открыть анализ '+f.a+' против '+f.b);
  const meta=el('div','fixture-top');
  meta.append(el('span','',shortTime(f.date)),badge(f.game==='cs2'?'CS2':'DOTA 2'));
  const name=el('div','fixture-name',f.a+'  —  '+f.b);
  const foot=el('div','fixture-foot');
  const label=f.tournament||'Турнир не указан';
  foot.append(el('span','',label.length>48?label.slice(0,45)+'…':label),el('span','',f.format||'Разбор'));
  button.append(meta,name,foot);
  if(f.confirmation?.length)button.append(el('div','meta','Сопоставлено с '+f.confirmation.join(', ')));
  const saved=forecastFor(f);
  if(saved){
   const preview=el('div','fixture-foot');
   preview.style.borderTop='1px solid #304658';preview.style.paddingTop='9px';
   preview.append(el('span','',closeMatch(saved.probability)?'Почти равный матч':'Прогноз · '+saved.pick),el('span','win',pct(saved.probability)));
   button.append(preview);
  }else button.append(el('div','meta','Прогноз не записан'));
  button.addEventListener('click',()=>{selected=f;renderFixtures();renderAnalysis();if(window.matchMedia('(max-width:820px)').matches)$('analysis-panel').scrollIntoView({behavior:'smooth',block:'start'})});
  root.append(button);
 }
 $('show-more').hidden=items.length<=10;
 $('show-more').textContent=expanded?'Свернуть':'Показать ещё · '+(items.length-10);
}
function compBox(label,value,help=''){const b=el('div','comp-box');b.append(el('small','',label),el('strong','',value));if(help)b.append(el('small','',help));return b}
function paragraph(cls,text){return el('p',cls,text)}
function addMeta(root,f){
 const wrap=el('div','match-hero'),meta=el('div','match-meta');
 meta.append(badge(f.game==='cs2'?'CS2':'Dota 2'),el('span','',f.format||'Формат не указан'));
 const teams=el('div','versus');
 teams.append(el('div','team',f.a),el('span','vs','VS'),el('div','team',f.b));
 wrap.append(meta,teams,el('div','time',(f.tournament||'Турнир не указан')+' · '+dateLong(f.date)));
 root.append(wrap);
}
function assessmentMessage(status){
 return {'identity-conflict':'Неоднозначное название команды',insufficient:'Мало подтверждённой истории',
  live:'Матч уже начался',error:'Ошибка расчёта'}[status]??'Нет данных для расчёта';
}
function explainMissing(root,r){
 const missing=el('div','selection');
 missing.append(el('b','','Прогноз не опубликован'),paragraph('',assessmentMessage(r.status)));
 root.append(missing);
 if(r?.comparisons){const stats=el('div','comp-grid');
 stats.append(compBox(r.comparisons.a.id+' · матчей',r.comparisons.a.count),compBox(r.comparisons.b.id+' · матчей',r.comparisons.b.count));
 root.append(el('h3','analysis-head','Что известно'),stats);
 }
 root.append(el('div','help','Для оценки нужны минимум 10 прошлых результатов каждой команды. Неизвестные составы и отсутствующие данные не заменяются предположениями.'));
}
function drawFactors(root,analysis){
 root.append(el('h3','analysis-head','На чём основано решение'));
 for(const reason of analysis.reasons){
  const f=el('div','factor'),head=el('div','factor-title');
  head.append(el('span','',reason.name),el('span','contribution','Вес '+Math.round(reason.weight*100)+'%'));
  f.append(head,paragraph('factor-description',reason.description));
  const grid=el('div','factor-title');grid.style.marginTop='9px';
  grid.append(el('span','muted','Оценка для '+selected.a),el('span','',pct(reason.a)));
  f.append(grid);
  const bar=el('div','factor-progress'),fill=el('div');fill.style.width=Math.max(0,Math.min(100,reason.a*100))+'%';bar.append(fill);f.append(bar);
  root.append(f);
 }
 const c=analysis.comparisons;
 root.append(el('h3','analysis-head','Подтверждённые факторы'));
 const g=el('div','comp-grid');
 g.append(compBox('Elo · '+selected.a,asNum(c.a.rating),'История: '+c.a.count),
          compBox('Elo · '+selected.b,asNum(c.b.rating),'История: '+c.b.count),
          compBox('Последние 10 · '+selected.a,c.a.wins+'W / '+c.a.losses+'L','Из '+c.a.last+' матчей'),
          compBox('Последние 10 · '+selected.b,c.b.wins+'W / '+c.b.losses+'L','Из '+c.b.last+' матчей'),
          compBox('Форма '+selected.a,[5,10,20].map(n=>c.a.form[n].wins+'/'+c.a.form[n].played).join(' · '),'Последние 5 / 10 / 20'),
          compBox('Форма '+selected.b,[5,10,20].map(n=>c.b.form[n].wins+'/'+c.b.form[n].played).join(' · '),'Последние 5 / 10 / 20'),
          compBox('Личные встречи',c.h2h.count,c.h2h.winsA+' побед '+selected.a+' · '+c.h2h.winsB+' побед '+selected.b+(c.h2h.lastPlayed?' · '+shortTime(c.h2h.lastPlayed):'')),
          compBox('История дисциплины',c.dataCount,'До начала встречи'));
 root.append(g);
}
function drawReasonSummary(root,forecast){
 const {a,b,probabilityA}=forecast;
 const steps=probabilitySteps(forecast);
 if(!steps.length)return;
 const head=el('div','selection');
 head.append(el('small','','КАК ПОЛУЧИЛАСЬ ВЕРОЯТНОСТЬ'),el('b','',a+' '+pct(probabilityA)+' · '+b+' '+pct(1-probabilityA)),
  paragraph('','Расчёт для '+a+' начинается с 50%. Поправки показаны в порядке применения.'));
 const list=el('ul');
 for(const {name,delta} of steps){
  const pp=delta*100;
  list.append(el('li','',name+' · '+(pp>=0?'+':'')+pp.toFixed(2)+' п.п.'));
 }
 head.append(list);
 root.append(head);
}
function drawMapInsight(root,f){
 if(f.game!=='cs2')return;
 const record=mapInsights?.insights?.[f.id];
 root.append(el('h3','analysis-head','Статистика карт · отдельная модель'));
 if(!record){root.append(paragraph('muted','История карт для этого матча недоступна.'));return}
 if(record.status==='insufficient-maps'){
  root.append(paragraph('muted','Сыгранных карт в источнике: '+f.a+' — '+record.teamAMaps+', '+f.b+' — '+record.teamBMaps+'. Для модели нужно минимум '+record.required+' карт каждой команде.'));return;
 }
 if(record.status!=='map-analysis'){
  root.append(paragraph('muted','Отдельный расчёт карт недоступен: '+(record.status||'нет данных')+'.'));return;
 }
 root.append(paragraph('muted','Собранные результаты карт: '+f.a+' — '+record.teamAMaps+', '+f.b+' — '+record.teamBMaps+'. Расчёт выполняет исходный MIT-модуль MapModel из csgopred.'));
 const names=new Set(Array.isArray(record.vetoEstimate)?record.vetoEstimate:[]);
 for(const m of (record.maps||[]).slice().sort((a,b)=>Math.abs(b.probA-.5)-Math.abs(a.probA-.5)).slice(0,7)){
  const box=el('div','factor'),head=el('div','factor-title');
  head.append(el('span','',m.map+(names.has(m.map)?' · симуляция veto':'')),el('span','contribution',pct(m.probA)));
  box.append(head,paragraph('factor-description','История карты: '+f.a+' '+m.mapsA+' · '+f.b+' '+m.mapsB));
  const bar=el('div','factor-progress'),fill=el('div');fill.style.width=(m.probA*100)+'%';bar.append(fill);box.append(bar);root.append(box);
 }
 if(Number.isFinite(record.seriesProbabilityA))root.append(el('div','help','Сценарная оценка MapModel для '+f.a+' — '+pct(record.seriesProbabilityA)+'. Модель может использовать эту оценку при совпадении состава данных и формата серии.'));
 root.append(paragraph('warn',record.caution||'Расчёт карт исследовательский.'));
}
function renderAnalysis(){
 const root=$('match-detail');root.replaceChildren();
 if(!selected){root.append(errorBlock('Выбери игру из расписания','Подробный разбор сформируется по истории именно этих команд.'));return}
 const f=selected;
 addMeta(root,f);
 const saved=forecastFor(f);
 const r=assessment(f);
 if(!saved){
  if(r.status==='ok')root.append(errorBlock('Прогноз ещё не записан','Сохранённые предматчевые прогнозы появятся после обновления данных.'));
  else explainMissing(root,r);
  return;
 }
 const a=saved.probabilityA,b=1-a;
 const labels=el('div','prob-labels');
 labels.append(el('div','',pct(a)),el('div','',pct(b)));
 const bar=el('div','prob');bar.setAttribute('role','img');bar.setAttribute('aria-label',pct(a)+' '+f.a+', '+pct(b)+' '+f.b);
 const ba=el('div','prob-a'),bb=el('div','prob-b');ba.style.width=(a*100)+'%';bb.style.width=(b*100)+'%';bar.append(ba,bb);
 root.append(labels,bar);
 const verdict=el('div','selection');
 const favoriteProbability=Math.max(a,b);
 verdict.append(el('small','',closeMatch(favoriteProbability)?'ПОЧТИ РАВНЫЙ МАТЧ':'МОДЕЛЬНЫЙ ФАВОРИТ'),
  el('b','',saved.pick+' · '+pct(favoriteProbability)),
  paragraph('', 'Записано '+shortTime(saved.createdAt)+' · '+(modelNames[saved.model.split('@')[0]]??'Контрольная модель')));
 root.append(verdict);
 const total=saved.total;
 if(total){
  const line=String(total.line).replace('.',',');
  const grid=el('div','comp-grid');
  grid.append(compBox('ТБ '+line,pct(total.over),f.format==='Bo3'?'Будет 3-я карта':'Будет 5-я карта'),
              compBox('ТМ '+line,pct(total.under),f.format==='Bo3'?'Две карты':'Три или четыре карты'));
  root.append(el('h3','analysis-head','Количество карт · '+f.format),grid,
   paragraph('muted',total.validated?'Вероятности прошли историческую проверку.':'Исследовательская оценка количества карт.'));
 }
 const detail=el('details');detail.append(el('summary','','Данные и сравнение моделей'));root.append(detail);
 if(saved.research){
  const {probabilities,evidence,total}=saved.research;
  const grid=el('div','comp-grid');
  for(const [name,p] of Object.entries(probabilities))grid.append(compBox(modelNames[name]??name,pct(p),f.a+' · победа'));
  detail.append(grid);
  if(total){
   const totalGrid=el('div','comp-grid');
   for(const [name,p] of Object.entries(total.probabilities))totalGrid.append(compBox(modelNames[name]??name,pct(p),'ТБ '+String(total.line).replace('.',',')));
   detail.append(el('h3','analysis-head','Сравнение прогнозов количества карт'),totalGrid);
  }
  const evidenceGrid=el('div','comp-grid');
  evidenceGrid.append(compBox('Завершённые серии',evidence.seriesA+' / '+evidence.seriesB),compBox('История карт',evidence.mapsA+' / '+evidence.mapsB),
   compBox('Текущий турнир',evidence.tournamentA+' / '+evidence.tournamentB),compBox('Последний общий патч',evidence.patchA&&evidence.patchB?evidence.patchA+' / '+evidence.patchB:'Нет данных'),
   compBox('Матчи с подтверждённым составом',evidence.lineupsA+' / '+evidence.lineupsB),compBox('Форма за 10 серий',pct(evidence.formA)+' / '+pct(evidence.formB)));
  detail.append(el('h3','analysis-head','Что было известно до матча'),evidenceGrid);
 }else{
  drawReasonSummary(detail,{...saved,map:saved.evidence?.map,roster:saved.evidence?.roster});
  if(r.status==='ok')drawFactors(detail,r);
 }
 drawMapInsight(detail,f);
 detail.append(el('h3','analysis-head','Составы и игроки'));
 for(const [index,team] of [f.a,f.b].entries()){
  const roster=(saved.profileEvidence??f.rosters)?.[index];
  const players=roster?.players.map(player=>player.name+(player.metric==null?'':f.game==='dota'?' '+pct(player.metric):' '+player.metric.toFixed(2)));
  detail.append(compBox(team,players?.join(' · ')??'Состав недоступен',roster?roster.source+' · '+shortTime(roster.observedAt):''));
 }
 if(saved.evidence?.roster)detail.append(compBox('Профили игроков',pct(saved.evidence.roster.a),'Поправка контрольной модели по профилям команд.'));

 detail.append(paragraph('muted','Данные встречи: '+f.source+'. Время получения: '+shortTime(f.fetchedAt)+'. Расчёт использует только исходы до старта этого матча.'));
}
async function load(){
 if(loading)return;loading=true;
 const read=async(name)=>{const r=await fetch('./'+name+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(name+' HTTP '+r.status);return r.json()};
 const [matchesResult,fixtureResult,reportResult,mapResult,journalResult,researchResult]=await Promise.allSettled([read('snapshot.json'),read('fixtures.json'),read('report.json'),read('map-insights.json'),read('journal.json'),read('research.json')]);
 if(matchesResult.status==='fulfilled'&&matchesResult.value?.schemaVersion===1&&Array.isArray(matchesResult.value.matches))
  matches=matchesResult.value.matches.filter(m=>m&&m.id&&m.a&&m.b&&(m.winner===m.a||m.winner===m.b)&&Number.isFinite(Date.parse(m.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 if(fixtureResult.status==='fulfilled'&&fixtureResult.value?.schemaVersion===1&&Array.isArray(fixtureResult.value.fixtures)){
  fixtureStatus=fixtureResult.value;fixtures=fixtureStatus.fixtures.filter(f=>f&&f.id&&f.a&&f.b&&Number.isFinite(Date.parse(f.date))&&['cs2','dota'].includes(f.game));
 }else{fixtureStatus=null;fixtures=[]}
 if(reportResult.status==='fulfilled'&&reportResult.value?.games)report=reportResult.value;
 if(mapResult.status==='fulfilled'&&mapResult.value?.schemaVersion===1)mapInsights=mapResult.value;
 if(journalResult.status==='fulfilled'&&Array.isArray(journalResult.value?.events)){
  journal=journalResult.value.events;
  published.clear();
  for(const {type,record} of journal){
   if(type==='forecast'&&Date.parse(record.createdAt)<Date.parse(record.kickoff))published.set(record.fixtureId,record);
  }
 }
 if(researchResult.status==='fulfilled')research=researchResult.value;
 assessments.clear();
 syncTournaments();
 renderSources();
 const available=activeFixtures();
 if(!selected&&available.length)selected=available[0];
 if(selected&&!available.some(f=>f.id===selected.id))selected=available[0]||null;
 if(selected){const fresh=fixtures.find(f=>f.id===selected.id);if(fresh)selected=fresh}
 renderFixtures();renderAnalysis();renderWorkspace();loading=false;
}
$('show-more').onclick=()=>{expanded=!expanded;renderFixtures()};
$('refresh').onclick=load;
function syncTournaments(){
 const select=$('tournament');
 const names=[...new Set(fixtures.filter(f=>filters.game==='all'||f.game===filters.game).map(f=>f.tournament).filter(Boolean))].sort();
 select.replaceChildren(new Option('Все турниры','all'),...names.map(name=>new Option(name,name)));
 if(!names.includes(filters.tournament))filters.tournament='all';
 select.value=filters.tournament;
}
function historicalResearch(root){
 if(!research?.version)return;
 const details=el('details');details.append(el('summary','','Историческая проверка моделей'));root.append(details);
 details.append(paragraph('muted','Модели обучались, отбирались и калибровались до финального тестового периода.'));
 for(const [game,report] of Object.entries(research.games)){
  const label=game==='cs2'?'CS2':'Dota 2';
  for(const [name,value] of [['Победитель',report.winner],...Object.entries(report.totals)]){
   details.append(el('h3','analysis-head',label+' · '+name));
   if(value.status!=='evaluated'){
    details.append(paragraph('muted','Недостаточно данных для проверки · '+value.eligible+' подтверждённых серий'));continue;
   }
   const {models,splits}=value;
   const since=splits.starts[3].slice(0,10);
   details.append(paragraph('muted','Финальный тест с '+since+' · '+splits.counts[3]+' серий из '+value.eligible+
    ' прошедших фильтр данных · '+(value.approved?'прошла порог публикации':'исследовательское сравнение')));
   const grid=el('div','comp-grid');
   for(const [model,quality] of Object.entries(models)){
    grid.append(compBox((modelNames[model]??model)+(model===value.selected?' · выбрана':''),pct(quality.accuracy),
     quality.correct+' / '+quality.decided+' · Brier '+quality.brier.toFixed(3)+' · Log loss '+quality.logLoss.toFixed(3)+' · ECE '+pct(quality.ece)));
   }
   details.append(grid);
   if(name==='Победитель'){
    const reliability=el('details');
    reliability.append(el('summary','','Калибровка · '+(modelNames[value.selected]??value.selected)));
    const verdict=models[value.selected];
    const calibration=el('div','comp-grid');
    for(const bin of verdict.reliability)calibration.append(compBox('Прогноз '+pct(bin.expected),pct(bin.observed),bin.count+' серий · фактическая доля побед'));
    reliability.append(calibration);
    for(const [threshold,test] of Object.entries(verdict.confidence??{})){
     reliability.append(paragraph('muted','Уверенность от '+pct(Number(threshold))+' · '+test.correct+' / '+test.count+' попаданий · охват '+pct(test.coverage)));
    }
    details.append(reliability);
   }
  }
 }
}
function renderDaily(root){
 const chooser=el('input');chooser.type='date';chooser.value=filters.reviewDay??dayFmt.format(Date.now());
 chooser.setAttribute('aria-label','Конец периода');
 chooser.onchange=()=>{if(chooser.value)filters.reviewDay=chooser.value;renderWorkspace()};
 const period=el('select');period.setAttribute('aria-label','Период итогов');
 period.replaceChildren(...[1,7,14,30,90].map(n=>new Option(n===1?'Один день':n+' дней',n)));
 period.value=filters.reviewPeriod??1;
 period.onchange=()=>{filters.reviewPeriod=Number(period.value);renderWorkspace()};
 const game=el('select');game.setAttribute('aria-label','Дисциплина итогов');
 game.replaceChildren(new Option('Все игры','all'),new Option('CS2','cs2'),new Option('Dota 2','dota'));
 game.value=filters.reviewGame??'all';
 game.onchange=()=>{filters.reviewGame=game.value;renderWorkspace()};
 const reload=el('button','tab','Обновить');reload.type='button';reload.onclick=load;
 const controls=el('div','tabs');controls.append(chooser,period,game,reload);root.append(controls);
 const rows=dailyRows({day:chooser.value,from:reviewPeriod(chooser.value,Number(period.value)),fixtures:[],journal,matches,now:Date.now()})
  .filter(row=>row.forecast&&row.forecast.probabilityBasis!=='map'&&(game.value==='all'||row.forecast.game===game.value));
 const t=tally(rows), grid=el('div','comp-grid');
 grid.append(compBox('Прогнозы победителя',t.total),compBox('Попадания',t.won),compBox('Промахи',t.lost),
  compBox('Ждём подтверждения',t.pending),compBox('Матчи впереди',t.upcoming),
  compBox('Точность',t.won+t.lost?pct(t.won/(t.won+t.lost)):'—',t.won+t.lost+' сверено'));
 root.append(grid);
 const totals=totalTally(rows);
 if(totals.total){
  const grid=el('div','comp-grid');
  grid.append(compBox('Количество карт · прогнозы',totals.total),compBox('Сверено',totals.resolved),
   compBox('Точность',totals.decisive?pct(totals.correct/totals.decisive):'—',totals.correct+' / '+totals.decisive+' прогнозов с выбором'));
  root.append(grid);
 }
 const review=errorReview(rows);
 if(review.misses){
  const details=el('details');details.append(el('summary','','Разбор промахов · '+review.misses),
   paragraph('muted',review.confident+' ошибок при вероятности от 65% · '+review.disagreement+' с расхождением с контрольной моделью'));
  for(const {forecast,winner,error} of review.latest)details.append(compBox(forecast.a+' — '+forecast.b,
   forecast.pick+' · '+pct(forecast.probability),'Победитель '+winner+(error?.disagreement?' · контрольная модель выбрала иначе':'')));
  root.append(details);
 }
 const comparison=compareJournalWinners(rows);
 if(comparison.length){
  const details=el('details');
  details.append(el('summary','','Сравнение на записанных прогнозах'));
  const grid=el('div','comp-grid');
  for(const stat of comparison)grid.append(compBox(modelNames[stat.name]??stat.name,stat.correct+' / '+stat.decided,'Сверено '+stat.settled+' · Brier '+stat.brier.toFixed(3)));
  details.append(grid);
  root.append(details);
 }
 historicalResearch(root);
 if(!rows.length)root.append(paragraph('muted','За этот период нет записанных прогнозов.'));
 for(const {forecast,winner,upcoming,total,totalSaved,totalActual,actualMaps,source} of rows){
  const result=winner?(winner===forecast.pick?'Попадание':'Промах')+' · победитель '+winner:upcoming?'Предстоит':'Ждём подтверждения';
  const row=compBox(shortTime(forecast.kickoff)+' · '+forecast.a+' — '+forecast.b,forecast.pick+' · '+pct(forecast.probability),result);
  if(totalSaved){
   const line=String(total.line).replace('.',',');
   row.append(paragraph('muted','Предматчевый тотал · ТБ '+line+' '+pct(total.over)+' / ТМ '+line+' '+pct(total.under)));
   if(typeof totalActual==='boolean')row.append(paragraph('muted','Итог · '+actualMaps+' карт · '+(totalActual?'ТБ ':'ТМ ')+line));
   else row.append(paragraph('muted','Количество карт ждёт подтверждения'));
  }else if(actualMaps!==null)row.append(paragraph('muted','Итог · '+actualMaps+' карт'));
  if(source)row.append(paragraph('muted','Источник итога · '+source));
  root.append(row);
 }
}
function renderWorkspace(){
 const isDaily=filters.view==='daily';
 $('workspace-matches').hidden=isDaily;
 $('workspace-report').hidden=!isDaily;
 for(const button of document.querySelectorAll('[data-view]')){
  const active=button.dataset.view===filters.view;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 }
 if(!isDaily)return;
 const root=$('workspace-content');root.replaceChildren();renderDaily(root);
}
function updateFilters(){
 expanded=false;
 const rows=activeFixtures();
 if(!rows.some(row=>row.id===selected?.id))selected=rows[0]??null;
 renderFixtures();renderAnalysis();renderWorkspace();
}
for(const btn of document.querySelectorAll('[data-view]'))btn.onclick=()=>{filters.view=btn.dataset.view;history.replaceState(null,'',filters.view==='daily'?'#daily':location.pathname+location.search);updateFilters()};
for(const key of ['period','tournament'])$(key).onchange=()=>{filters[key]=$(key).value;updateFilters()};
for(const btn of document.querySelectorAll('[data-game]'))btn.onclick=()=>{filters.game=btn.dataset.game;syncTournaments();updateFilters()};
load();
setInterval(()=>{if(document.visibilityState==='visible')load()},120000);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
