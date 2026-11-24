import {dailyRows,tally} from './daily.mjs';
import {analyzeFixture,probabilitySteps} from './analysis.mjs';
import {decidingMapTotal} from './live.mjs';
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
let matches=[],fixtures=[],journal=[],report=null,mapInsights=null,filters={game:'all',view:['#brief','#daily'].includes(location.hash)?'daily':'today',period:'today',tournament:'all'},selected=null,expanded=false,loading=false,fixtureStatus=null;
const assessments=new Map();
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
  if(f.status==='upcoming'&&matches.length){
    try{
      const result=assessment(f);
      if(result.status==='ok'){
        const preview=el('div','fixture-foot');
        preview.style.borderTop='1px solid #304658';preview.style.paddingTop='9px';
        const probability=Math.max(result.result.pa,result.result.pb);
        preview.append(el('span','',closeMatch(probability)?'Почти равный матч':'Прогноз: '+result.picked),el('span','win',pct(probability)));
        button.append(preview);
      }else button.append(el('div','meta',assessmentMessage(result.status)));
    }catch{button.append(el('div','meta','Требуется проверка идентификаторов команд'))}
  }
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
          compBox('Личные встречи',c.h2h.count,c.h2h.winsA+' : '+c.h2h.winsB+(c.h2h.lastPlayed?' · '+shortTime(c.h2h.lastPlayed):'')),
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
 const r=assessment(f);
 if(r.status!=='ok'){explainMissing(root,r);root.append(el('div','help','Источник встречи: '+f.source+'. Последняя фиксация расписания: '+shortTime(f.fetchedAt)+'.'));return}
 const a=r.result.pa,b=r.result.pb;
 const labels=el('div','prob-labels');
 labels.append(el('div','',pct(a)),el('div','',pct(b)));
 const bar=el('div','prob');bar.setAttribute('role','img');bar.setAttribute('aria-label',pct(a)+' '+f.a+', '+pct(b)+' '+f.b);
 const ba=el('div','prob-a'),bb=el('div','prob-b');ba.style.width=(a*100)+'%';bb.style.width=(b*100)+'%';bar.append(ba,bb);
 root.append(labels,bar);
 const verdict=el('div','selection');
 const favoriteProbability=Math.max(a,b);
 verdict.append(el('small','',closeMatch(favoriteProbability)?'ПОЧТИ РАВНЫЙ МАТЧ':'МОДЕЛЬНЫЙ ФАВОРИТ'),
  el('b','',r.picked+' · '+pct(favoriteProbability)),paragraph('',r.note));
 root.append(verdict);
 const total=decidingMapTotal(f.game==='dota'?r.result.factorProbability:r.result.pa,f.format,f.game==='dota'?'map':'series');
 if(total){
  const line=String(total.line).replace('.',',');
  const grid=el('div','comp-grid');
  grid.append(compBox('ТБ '+line,pct(total.over),f.format==='Bo3'?'Будет 3-я карта':'Будет 5-я карта'),
              compBox('ТМ '+line,pct(total.under),f.format==='Bo3'?'Закончится на 2-й':'Закончится на 3-й или 4-й'));
  root.append(el('h3','analysis-head','Тотал карт · '+f.format),grid,
   paragraph('muted','Оценка предполагает одинаковые шансы на каждой карте. Для тоталов точность ещё не подтверждена.'));
 }
 const detail=el('details');detail.append(el('summary','','Почему такой прогноз'));root.append(detail);
 drawFactors(detail,r);
 drawReasonSummary(detail,{...r,a:f.a,b:f.b,probabilityA:a,map:r.mapContribution,roster:r.rosterContribution,mapProbability:r.result.factorProbability});
 drawMapInsight(detail,f);
 if(r.mapContribution)detail.append(compBox('Карты CS2',pct(r.mapContribution.probabilityA),'Вес 20% · сценарий veto'));
 detail.append(el('h3','analysis-head','Составы и игроки'));
 for(const [index,team] of [f.a,f.b].entries()){
  const roster=f.rosters?.[index];
  const players=roster?.players.map(player=>player.name+(player.metric==null?'':f.game==='dota'?' '+pct(player.metric):' '+player.metric.toFixed(2)));
  detail.append(compBox(team,players?.join(' · ')??'Состав недоступен',roster?roster.source+' · '+shortTime(roster.observedAt):''));
 }
 if(r.rosterContribution)detail.append(compBox('Профили игроков',pct(r.rosterContribution.a),'Вес 10% · исследовательский вклад. Стартовые пятёрки и замены требуют проверки.'));

 detail.append(paragraph('muted','Данные встречи: '+f.source+'. Время получения: '+shortTime(f.fetchedAt)+'. Расчёт использует только исходы до старта этого матча.'));
}
async function load(){
 if(loading)return;loading=true;
 const read=async(name)=>{const r=await fetch('./'+name+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(name+' HTTP '+r.status);return r.json()};
 const [matchesResult,fixtureResult,reportResult,mapResult,journalResult]=await Promise.allSettled([read('snapshot.json'),read('fixtures.json'),read('report.json'),read('map-insights.json'),read('journal.json')]);
 if(matchesResult.status==='fulfilled'&&matchesResult.value?.schemaVersion===1&&Array.isArray(matchesResult.value.matches))
  matches=matchesResult.value.matches.filter(m=>m&&m.id&&m.a&&m.b&&(m.winner===m.a||m.winner===m.b)&&Number.isFinite(Date.parse(m.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 if(fixtureResult.status==='fulfilled'&&fixtureResult.value?.schemaVersion===1&&Array.isArray(fixtureResult.value.fixtures)){
  fixtureStatus=fixtureResult.value;fixtures=fixtureStatus.fixtures.filter(f=>f&&f.id&&f.a&&f.b&&Number.isFinite(Date.parse(f.date))&&['cs2','dota'].includes(f.game));
 }else{fixtureStatus=null;fixtures=[]}
 if(reportResult.status==='fulfilled'&&reportResult.value?.games)report=reportResult.value;
 if(mapResult.status==='fulfilled'&&mapResult.value?.schemaVersion===1)mapInsights=mapResult.value;
 if(journalResult.status==='fulfilled'&&Array.isArray(journalResult.value?.events))journal=journalResult.value.events;
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
function renderDaily(root){
 const chooser=el('input');chooser.type='date';chooser.value=filters.reviewDay??dayFmt.format(Date.now());
 chooser.setAttribute('aria-label','Дата итогов');
 chooser.onchange=()=>{filters.reviewDay=chooser.value;renderWorkspace()};
 const reload=el('button','tab','Обновить');reload.type='button';reload.onclick=load;
 const controls=el('div','tabs');controls.append(chooser,reload);root.append(controls);
 const rows=dailyRows({day:chooser.value,fixtures:[],journal,matches,now:Date.now()}).filter(row=>row.forecast);
 const t=tally(rows), grid=el('div','comp-grid');
 grid.append(compBox('Записано прогнозов',t.total),compBox('Попадания',t.won),compBox('Промахи',t.lost),
  compBox('Ждём результата',t.pending),compBox('Матчи впереди',t.upcoming),
  compBox('Точность',t.won+t.lost?pct(t.won/(t.won+t.lost)):'—',t.won+t.lost+' сверено'));
 root.append(grid);
 if(!rows.length)root.append(paragraph('muted','На эту дату ещё нет записанных прогнозов.'));
 for(const {forecast,winner,upcoming,total,totalSaved,totalActual} of rows){
  const result=winner?(winner===forecast.pick?'Попадание':'Промах')+' · победитель '+winner:upcoming?'Предстоит':'Ждём результата';
  const row=compBox(shortTime(forecast.kickoff)+' · '+forecast.a+' — '+forecast.b,forecast.pick+' · '+pct(forecast.probability),result);
  if(total){
   const line=String(total.line).replace('.',','), actual=typeof totalActual==='boolean'?' · итог '+(totalActual?'ТБ ':'ТМ ')+line:' · ждём счёт серии';
   row.append(paragraph('muted','ТБ '+line+' '+pct(total.over)+' / ТМ '+line+' '+pct(total.under)+actual+
    (totalSaved?'':' · пересчёт по записи')));
  }
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
