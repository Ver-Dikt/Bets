import {briefRows,priceComparison} from './brief.mjs';
import {dailyRows,tally} from './daily.mjs';
import {analyzeFixture,probabilitySteps} from './analysis.mjs';
import {score} from './engine.mjs';
import {reconcilePaper} from './settlement.mjs';
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
let matches=[],fixtures=[],journal=[],brief=null,report=null,mapInsights=null,filters={game:'all',archive:'cs2',view:['#brief','#daily'].includes(location.hash)?location.hash.slice(1):'today',period:'today',tournament:'all',quality:'all'},selected=null,expanded=false,loading=false,fixtureStatus=null;
const MUS_KEY='bets-mus-picks-v1';
let mus={};try{mus=JSON.parse(localStorage.getItem(MUS_KEY))??{}}catch{}
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
const PAPER_KEY='bets-paper-v2';
let paper=[];try{const o=JSON.parse(localStorage.getItem(PAPER_KEY)||'[]');if(Array.isArray(o))paper=o}catch{}
const errorBlock=(title,sub)=>{const root=el('div','empty');root.append(el('strong','',title));if(sub){root.append(el('p','',sub))}return root};
function sourceText(kind){
 const source=fixtureStatus?.sources?.[kind];
 if(!source)return kind.toUpperCase()+': данные не получены';
 if(source.ok)return (kind==='cs2'?'CS2':'Dota 2')+': '+source.fixtures+' матчей · снимок';
 return (kind==='cs2'?'CS2':'Dota 2')+': источник недоступен';
}
function liveFresh(f){
 const observed=Date.parse(f.fetchedAt);
 return Number.isFinite(observed)&&Date.now()-observed<40*60000;
}
function activeFixtures(){
 const now=Date.now(), today=dayFmt.format(now), tomorrow=dayFmt.format(now+86400000);
 return fixtures.filter(f=>filters.game==='all'||f.game===filters.game)
  .filter(f=>filters.view==='live'?f.status==='live'&&liveFresh(f):f.status==='upcoming'&&Date.parse(f.date)>now)
  .filter(f=>filters.view==='live'||filters.period==='all'||dayFmt.format(new Date(f.date))===(filters.period==='today'?today:tomorrow))
  .filter(f=>filters.view==='live'||filters.tournament==='all'||f.tournament===filters.tournament)
  .filter(f=>filters.view==='live'||filters.quality==='all'||(filters.quality==='pari'?Boolean(f.pari):assessment(f).confidence==='исследовательская'))
  .sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
function badge(text,cls=''){return el('span','tag'+(cls?' '+cls:''),text)}
function renderSources(){
 $('cs2-source').textContent=sourceText('cs2');
 $('dota-source').textContent=sourceText('dota');
 const pari=fixtureStatus?.sources?.pari;
 $('pari-source').textContent=pari?.ok?'PARI · '+pari.fixtures+' событий':pari?.mode==='capture'?'PARI · снимок с экрана':'PARI · линия недоступна';
 const root=$('source-warning');root.replaceChildren();
 if(!fixtureStatus){root.append(el('div','source-warning','Нет опубликованного снимка расписания. Придумывать матчи нельзя.'));return}
 const broken=Object.entries(fixtureStatus.sources||{}).filter(([game,v])=>game!=='pari'&&!v?.ok);
 if(broken.length)root.append(el('div','source-warning','Не все источники работают: '+broken.map(([game])=>game.toUpperCase()).join(', ')+'. Матчи этой дисциплины могут отсутствовать. История доступна отдельно.'));
 if(Number.isFinite(Date.parse(fixtureStatus.generatedAt))){
  const mins=(Date.now()-Date.parse(fixtureStatus.generatedAt))/60000;
  $('fixture-update').textContent=(mins>90?'Устаревший снимок · ':'Обновлено · ')+shortTime(fixtureStatus.generatedAt);
 }else $('fixture-update').textContent='Время обновления неизвестно';
}
function renderMetrics(){
 const now=Date.now(),up=fixtures.filter(f=>f.status==='upcoming'&&Date.parse(f.date)>now),live=fixtures.filter(f=>f.status==='live'&&liveFresh(f));
 $('upcoming-count').textContent=up.length||'0';$('live-count').textContent=live.length||'0';
 $('live-age').textContent='Снимок, не прямой эфир';
 $('history-count').textContent=matches.length.toLocaleString('ru-RU');
}
function renderFixtures(){
 document.querySelectorAll('[data-game]').forEach(b=>{const active=b.dataset.game===filters.game;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 const items=activeFixtures(),root=$('fixture-list');root.replaceChildren();
 if(!items.length){
  if(filters.view==='live'){root.append(errorBlock('Свежих Live-снимков сейчас нет'));$('show-more').hidden=true;return}
  const broken=filters.game==='all'?Object.values(fixtureStatus?.sources||{}).some(s=>!s?.ok):fixtureStatus?.sources?.[filters.game]?.ok===false;
  root.append(errorBlock('Нет подтверждённых матчей для показа',broken?'Источник расписания сообщил об ошибке. Bets не показывает вымышленные игры.':'На момент снимка подходящих предстоящих встреч не найдено.'));$('show-more').hidden=true;return;
 }
 const shown=expanded?items:items.slice(0,10);
 for(const f of shown){
  const button=el('button','fixture'+(f.id===selected?.id?' selected':''));
  button.type='button';button.setAttribute('aria-label','Открыть анализ '+f.a+' против '+f.b);
  const meta=el('div','fixture-top');
  meta.append(el('span','',shortTime(f.date)),badge(f.status==='live'?'LIVE · СНИМОК':f.game==='cs2'?'CS2':'DOTA 2',f.status==='live'?'live':''));
  const name=el('div','fixture-name',f.a+'  —  '+f.b);
  const foot=el('div','fixture-foot');
  const label=f.tournament||'Турнир не указан';
  foot.append(el('span','',label.length>48?label.slice(0,45)+'…':label),el('span','',f.format||'Разбор'));
  button.append(meta,name,foot);
  if(f.confirmation?.length)button.append(el('div','meta','Сопоставлено с '+f.confirmation.join(', ')));
  if(f.pari)button.append(el('div','meta','PARI · '+f.pari.odds.map(price=>price.toFixed(2)).join(' / ')+
    (Date.parse(f.pari.freshUntil)<=Date.now()?' · архивная цена':'')));
  if(f.status==='upcoming'&&matches.length){
    try{
      const result=assessment(f);
      if(result.status==='ok'){
        const preview=el('div','fixture-foot');
        preview.style.borderTop='1px solid #304658';preview.style.paddingTop='9px';
        const probability=Math.max(result.result.pa,result.result.pb);
        preview.append(el('span','',closeMatch(probability)?'Почти равный матч':'Модель: '+result.picked),el('span','win',pct(probability)));
        button.append(preview);
      }else button.append(el('div','meta',assessmentMessage(result.status)));
    }catch{button.append(el('div','meta','Требуется проверка идентификаторов команд'))}
  }
  if(f.status==='live'&&Array.isArray(f.score))button.append(el('div','meta','Счёт на момент снимка: '+f.score.join(' : ')));
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
 meta.append(badge(f.game==='cs2'?'CS2':'Dota 2'),badge(f.status==='live'?'LIVE · СНИМОК':'ПРЕДСТОИТ',f.status==='live'?'live':''),el('span','',f.format||'Формат не указан'));
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
function drawPari(root,f){
 root.append(el('h3','analysis-head','Линия PARI · победитель матча'));
 if(!f.pari){root.append(paragraph('muted','Нет подтверждённой записи PARI для этого матча.'));return false}
 const {odds,mode,observedAt,freshUntil}=f.pari;
 const fresh=mode==='feed'&&Date.parse(freshUntil)>Date.now();
 const prices=el('div','comp-grid');
 prices.append(compBox(f.a,odds[0].toFixed(2)),compBox(f.b,odds[1].toFixed(2)));
 root.append(prices,paragraph('muted',(mode==='capture'?'Снимок с экрана':fresh?'Снимок линии':'Архивная цена')+' · '+shortTime(observedAt)));
 return fresh;
}
function drawOdds(root,analysis,f,fresh){
 const mapOnly=f.game==='dota'&&!analysis.probabilityBasis?.startsWith('series');
 if(mapOnly){root.append(paragraph('muted','Оценка модели относится к одной карте. Сравнение с ценой победы в серии недоступно.'));return}
 root.append(el('h3','analysis-head','Проверка двухисходной цены'));
 const grid=el('div','odds');
 const holderA=el('div'),holderB=el('div');
 const la=el('label','','Коэффициент на '+f.a),lb=el('label','','Коэффициент на '+f.b);
 const oa=el('input'),ob=el('input');
 if(fresh){oa.value=f.pari.odds[0];ob.value=f.pari.odds[1]}
 oa.type=ob.type='number';oa.min=ob.min='1.01';oa.step=ob.step='0.01';oa.placeholder=ob.placeholder='Напр. 1.90';
 holderA.append(la,oa);holderB.append(lb,ob);grid.append(holderA,holderB);root.append(grid);
 const info=el('div','help','Укажи цены на победу каждой команды в этом матче.');
 const compute=el('button','action','Проверить цену');
 compute.addEventListener('click',()=>{
  const a=oa.value.trim(),b=ob.value.trim();
  if(!a&&!b){info.textContent='Укажи хотя бы один коэффициент';return}
  try{
   const pa=analysis.result.pa,pb=analysis.result.pb;
   const pick=pa>=pb?f.a:f.b,probability=Math.max(pa,pb),price=pa>=pb?Number(a):Number(b);
   if(!(price>1)){info.textContent='Для выбранного моделью исхода ('+pick+') нужна действительная котировка > 1';return}
   const ev=(probability*price-1)*100;
   info.textContent='Выбор модели: '+pick+'. Введённая цена: '+price.toFixed(2)+'. EV: '+ev.toFixed(1)+'%. Это математическая оценка на основе некалиброванной вероятности, не сигнал к реальной ставке.';
  }catch(e){info.textContent=e.message}
 });
 root.append(compute,info);
 const save=el('button','more','Зафиксировать исследовательский прогноз');
 save.addEventListener('click',()=>{
  if(Date.parse(f.date)<=Date.now()||f.status==='live'){info.textContent='Нельзя сохранять новый предматчевый прогноз после старта';return}
  const id=typeof crypto?.randomUUID==='function'?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(16).slice(2);
  const pick=analysis.picked,probability=Math.max(analysis.result.pa,analysis.result.pb);
  const price=pick===f.a?Number(oa.value):Number(ob.value);
  paper.push({id,fixtureId:f.id,game:f.game,a:f.a,b:f.b,kickoff:f.date,pick,probability,
  odds:Number.isFinite(price)&&price>1?price:null,createdAt:new Date().toISOString(),model:analysis.result.model,actual:null});
  localStorage.setItem(PAPER_KEY,JSON.stringify(paper));renderJournal();info.textContent='Прогноз сохранён в журнале этого браузера. Его ещё нужно будет сверить с реальным результатом.';
 });
 root.append(save);
}
function renderAnalysis(){
 const root=$('match-detail');root.replaceChildren();
 if(!selected){root.append(errorBlock('Выбери игру из расписания','Подробный разбор сформируется по истории именно этих команд.'));return}
 const f=selected;
 addMeta(root,f);
 const fresh=drawPari(root,f);
 if(f.status==='live'){
  const events=journal.filter(event=>event.type==='live'&&event.fixtureId===f.id);
  root.append(compBox('Снимок · '+f.source,shortTime(f.fetchedAt),f.score?'Счёт по картам '+f.score.join(' : '):'Счёт недоступен'));
  root.append(el('h3','analysis-head','Изменения вероятности по картам'));
  for(const event of events.slice(-8))root.append(compBox(shortTime(event.observedAt)+' · '+event.score.join(' : '),pct(event.probabilityA)+' · '+f.a));
  if(f.liveState){
   const state=f.liveState;
   root.append(compBox('Преимущество по золоту · Radiant',state.goldLead??'—',
     state.kills.every(value=>value!=null)?'Убийства '+state.kills.join(' : '):'Счёт по убийствам недоступен'));
   if(state.second!=null)root.append(compBox('Время карты',Math.floor(state.second/60)+' мин','Задержка источника '+(state.delay??'—')+' сек'));
  }
  if(!events.length)root.append(paragraph('muted','Для пересчёта нужны зафиксированная оценка и подтверждённый счёт этой серии.'));
  return;
 }
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
 drawFactors(root,r);
 drawReasonSummary(root,{...r,a:f.a,b:f.b,probabilityA:a,map:r.mapContribution,roster:r.rosterContribution,mapProbability:r.result.factorProbability});
 drawMapInsight(root,f);
 if(r.mapContribution)root.append(compBox('Карты CS2',pct(r.mapContribution.probabilityA),'Вес 20% · сценарий veto'));
 root.append(el('h3','analysis-head','Составы и игроки'));
 for(const [index,team] of [f.a,f.b].entries()){
  const roster=f.rosters?.[index];
  const players=roster?.players.map(player=>player.name+(player.metric==null?'':f.game==='dota'?' '+pct(player.metric):' '+player.metric.toFixed(2)));
  root.append(compBox(team,players?.join(' · ')??'Состав недоступен',roster?roster.source+' · '+shortTime(roster.observedAt):''));
 }
 if(r.rosterContribution)root.append(compBox('Профили игроков',pct(r.rosterContribution.a),'Вес 10% · исследовательский вклад. Стартовые пятёрки и замены требуют проверки.'));

 drawOdds(root,r,f,fresh);
 root.append(paragraph('muted','Данные встречи: '+f.source+'. Время получения: '+shortTime(f.fetchedAt)+'. Расчёт использует только исходы до старта этого матча.'));
}
function renderArchive(){
 const root=$('archive-list');root.replaceChildren();
 const items=matches.filter(m=>m.discipline===filters.archive);
 $('history-summary').textContent='· '+matches.length.toLocaleString('ru-RU');
 for(const b of document.querySelectorAll('[data-history]'))b.classList.toggle('active',b.dataset.history===filters.archive);
 for(const m of items.slice(-6).reverse()){
  const div=el('div','fixture');div.style.cursor='default';
  div.append(el('div','meta',shortTime(m.date)+' · '+(m.tournament||m.source)),el('div','fixture-name',m.a+' — '+m.b),el('div','fixture-foot','Победитель: '+m.winner));root.append(div);
 }
 if(!items.length)root.append(errorBlock('Нет подтверждённой истории'));
}
function renderQuality(){
 const root=$('model-quality');root.replaceChildren();
 if(!report?.games){root.append(paragraph('muted','Отчёт не загружен.'));return}
 for(const game of ['cs2','dota']){
  const r=report.games[game];if(!r)continue;
  root.append(el('h3','analysis-head',game==='cs2'?'CS2 · серии':'Dota 2 · карты'));
  root.append(paragraph('muted','Исторически проверено '+r.tested+' из '+r.rows+' результатов ('+pct(r.coverage)+').'));
  const list=el('div','comp-grid');
  for(const kind of ['ensemble','elo','form','h2h'])list.append(compBox(kind,r.quality?.[kind]?.brier?.toFixed(4)??'—','Brier · ниже лучше'));
  root.append(list);
  if(r.quality?.elo?.brier!=null&&r.quality?.ensemble?.brier!=null&&r.quality.elo.brier<r.quality.ensemble.brier)
   root.append(paragraph('warn','В этой выборке Elo показал Brier ниже ансамбля. Это сигнал перепроверить веса, а не утверждать преимущество ансамбля.'));
 }
 root.append(paragraph('warn','Бэктест не равен истории реально опубликованных прогнозов. Доходность без подтверждённых предматчевых цен не рассчитывается.'));
}
function reconcileJournal(){
 const outcome=reconcilePaper(paper,matches);
 if(outcome.resolvedNew){
  paper=outcome.records;
  localStorage.setItem(PAPER_KEY,JSON.stringify(paper));
 }
}
function renderJournal(){
 const root=$('paper-list');root.replaceChildren();const s=score(paper);
 $('paper-summary').textContent=paper.length?('Всего '+paper.length+' · подтверждённых исходов '+s.resolved+(s.brier==null?'':' · Brier '+s.brier.toFixed(3))):'Нет сохранённых прогнозов';
 for(const p of paper.slice(-3).reverse()){
  const div=el('div','factor');div.append(el('strong','',p.a+' — '+p.b),
   paragraph('muted','Выбор: '+p.pick+' · '+pct(p.probability)+' · '+shortTime(p.kickoff)),
   paragraph('muted',p.actual===null?'Ожидание завершения и подтверждённого ID матча':p.actual===1?'✅ Выбор выиграл · '+(p.resolvedFrom||'подтверждённый источник'):'❌ Выбор проиграл · '+(p.resolvedFrom||'подтверждённый источник')));root.append(div);
 }
}
async function load(){
 if(loading)return;loading=true;
 const read=async(name)=>{const r=await fetch('./'+name+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(name+' HTTP '+r.status);return r.json()};
 const [matchesResult,fixtureResult,reportResult,mapResult,journalResult,briefResult]=await Promise.allSettled([read('snapshot.json'),read('fixtures.json'),read('report.json'),read('map-insights.json'),read('journal.json'),read('brief.json')]);
 if(matchesResult.status==='fulfilled'&&matchesResult.value?.schemaVersion===1&&Array.isArray(matchesResult.value.matches))
  matches=matchesResult.value.matches.filter(m=>m&&m.id&&m.a&&m.b&&(m.winner===m.a||m.winner===m.b)&&Number.isFinite(Date.parse(m.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 if(fixtureResult.status==='fulfilled'&&fixtureResult.value?.schemaVersion===1&&Array.isArray(fixtureResult.value.fixtures)){
  fixtureStatus=fixtureResult.value;fixtures=fixtureStatus.fixtures.filter(f=>f&&f.id&&f.a&&f.b&&Number.isFinite(Date.parse(f.date))&&['cs2','dota'].includes(f.game));
 }else{fixtureStatus=null;fixtures=[]}
 if(reportResult.status==='fulfilled'&&reportResult.value?.games)report=reportResult.value;
 if(mapResult.status==='fulfilled'&&mapResult.value?.schemaVersion===1)mapInsights=mapResult.value;
 if(journalResult.status==='fulfilled'&&Array.isArray(journalResult.value?.events))journal=journalResult.value.events;
 if(briefResult.status==='fulfilled'&&Array.isArray(briefResult.value?.fixtures))brief=briefResult.value;
 assessments.clear();
 reconcileJournal();renderJournal();
 syncTournaments();
 renderSources();renderMetrics();renderFixtures();renderArchive();renderQuality();
 const available=activeFixtures();
 if(!selected&&available.length)selected=available[0];
 if(selected&&!available.some(f=>f.id===selected.id))selected=available[0]||null;
 if(selected){const fresh=fixtures.find(f=>f.id===selected.id);if(fresh)selected=fresh}
 renderAnalysis();renderWorkspace();loading=false;
}
document.querySelectorAll('[data-history]').forEach(b=>b.addEventListener('click',()=>{filters.archive=b.dataset.history;renderArchive()}));
$('show-more').onclick=()=>{expanded=!expanded;renderFixtures()};
$('refresh').onclick=load;
$('paper-export').onclick=()=>{const blob=new Blob([JSON.stringify(paper,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='bets-paper.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
function syncTournaments(){
 const select=$('tournament');
 const names=[...new Set(fixtures.filter(f=>filters.game==='all'||f.game===filters.game).map(f=>f.tournament).filter(Boolean))].sort();
 select.replaceChildren(new Option('Все турниры','all'),...names.map(name=>new Option(name,name)));
 if(!names.includes(filters.tournament))filters.tournament='all';
 select.value=filters.tournament;
}
const viewNames={brief:'Твой список · 24 ноября',daily:'Итоги дня',memory:'Опыт и ошибки',learning:'Калибровка',evolution:'Версии моделей',data:'Данные и архив'};
function renderDaily(root){
 const chooser=el('input');chooser.type='date';chooser.value=filters.reviewDay??dayFmt.format(Date.now());
 chooser.setAttribute('aria-label','День журнала');
 chooser.onchange=()=>{filters.reviewDay=chooser.value;renderWorkspace()};
 const reload=el('button','tab','Обновить результаты');reload.type='button';reload.onclick=load;
 const controls=el('div','tabs');controls.append(chooser,reload);root.append(controls);
 const now=Date.now(),rows=dailyRows({day:chooser.value,fixtures,journal,matches,brief,mus,now});
 const pari=rows.filter(row=>row.price),musRows=rows.filter(row=>row.musPick);
 const stats=(title,items,pick)=>{
  const t=tally(items,pick),grid=el('div','comp-grid');
  grid.append(compBox('Прогнозы',t.total),compBox('Попадания',t.won),
   compBox('Ошибки',t.lost),compBox('Ожидают итог',t.pending,'Время старта уже прошло'),
   compBox('Предстоят',t.upcoming),compBox('Точность',t.won+t.lost?pct(t.won/(t.won+t.lost)):'—','Только сверенные результаты'));
  root.append(el('h3','analysis-head',title),grid);
 };
 stats('BETS · '+rows.length+' записей в журнале и расписании',rows);
 stats('BETS × PARI · '+pari.length+' событий с котировкой',pari);
 stats('MUS · переданные выборы',musRows,row=>row.musPick);
 const stamp=fixtureStatus?.generatedAt;
 root.append(paragraph('muted',stamp?'Последний опубликованный снимок · '+shortTime(stamp)+'. Время МСК.':'Время обновления расписания неизвестно.'));
 const tabs=el('div','tabs');
 const group=filters.dailyGroup??'pari';
 for(const [key,label] of [['all','Все события'],['pari','С котировкой PARI'],['mus','Выборы MUS']]){
  const button=el('button','tab'+(group===key?' active':''),label);button.type='button';
  button.setAttribute('aria-pressed',String(group===key));
  button.onclick=()=>{filters.dailyGroup=key;renderWorkspace()};
  tabs.append(button);
 }
 root.append(tabs);
 const shown=group==='all'?rows:group==='mus'?musRows:pari;
 if(!shown.length)root.append(paragraph('muted','В этой подборке на выбранную дату пока нет записей.'));
 for(const {event,forecast,price,winner,upcoming,source,musPick,localMus} of shown){
  const result=winner?(winner===forecast?.pick?'Попадание':forecast?'Ошибка':'Завершён')+' · победитель '+winner:upcoming?'Предстоит':'Ожидаем подтверждённый итог';
  const row=compBox(shortTime(event.date)+' · '+event.a+' — '+event.b,forecast?forecast.pick+' · '+pct(forecast.probability):'Прогноз BETS отсутствует',
   result+(source?' · '+source:''));
  if(price){
   const index=forecast?.pick===price.a?0:forecast?.pick===price.b?1:-1;
   const compare=priceComparison(forecast?.probability,price.odds[index]);
   row.append(paragraph('muted','PARI · '+price.a+' '+price.odds[0]+' / '+price.b+' '+price.odds[1]+' · '+price.kind+
    (compare&&forecast.probabilityBasis!=='map'?' · порог для выбора BETS '+pct(compare.breakEven)+
      (compare.delta>0?' · оценка модели выше порога':' · оценка модели не выше порога'):'')));
  }
  if(musPick)row.append(paragraph('muted','MUS · '+musPick+(winner?(winner===musPick?' · попадание':' · ошибка'):'')+
    (localMus?' · запись на устройстве':' · передано пользователем')));
  const selector=el('select');
  selector.setAttribute('aria-label','Выбор MUS · '+event.a+' — '+event.b);
  selector.append(new Option('MUS · нет записи',''),new Option(event.a,event.a),new Option(event.b,event.b));
  selector.value=musPick??'';
  selector.onchange=()=>{
   const next={...mus,[event.id]:selector.value};
   try{localStorage.setItem(MUS_KEY,JSON.stringify(next));mus=next;renderWorkspace()}
   catch{row.append(paragraph('muted','Хранилище устройства недоступно. Выбор не сохранён.'))}
  };
  row.append(selector);root.append(row);
 }
}
function renderWorkspace(){
 const view=filters.view, panel=$('workspace-report'), root=$('workspace-content');
 const matchesView=view==='today'||view==='live';
 $('workspace-matches').hidden=!matchesView;
 $('prematch-filters').hidden=view==='live';
 panel.hidden=matchesView;
 for(const button of document.querySelectorAll('[data-view]')){
  const active=button.dataset.view===view;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 }
 if(matchesView)return;
 $('workspace-title').textContent=viewNames[view];
 if(view==='brief'){renderBrief(root);return}
 root.replaceChildren();
 if(view==='daily'){renderDaily(root);return}
 if(view==='memory'){
  const check=new Map(journal.filter(item=>item.type==='settlement').map(item=>[item.fixtureId,item]));
  const records=journal.filter(item=>item.type==='forecast').map(item=>item.record);
  const resultFor=row=>{
   const result=check.get(row.fixtureId);
   return result?.forecastId&&result.forecastId!==row.id?null:result;
  };
  for(const row of [...new Map(records.map(item=>[item.fixtureId,item])).values()].slice().reverse()){
   const result=resultFor(row);
   if(!result?.error)continue;
   root.append(compBox(row.a+' — '+row.b,'Выбранная команда проиграла',
     'Brier '+result.error.brier.toFixed(3)+' · '+result.error.knownFactors.join(', ')+(result.error.hypothesis?' · '+result.error.hypothesis:'')));
  }
  if(!root.childElementCount)root.append(errorBlock('Пока нет сверенных расхождений'));
  return;
 }
 if(view==='learning'||view==='evolution'){
  for(const game of ['cs2','dota']){
   const metrics=report?.games?.[game]?.calibration;
   root.append(el('h3','analysis-head',game==='cs2'?'CS2 · серии':'Dota 2 · карты'));
   if(metrics?.status!=='evaluated'){root.append(paragraph('muted','Мало наблюдений для отдельной проверки.'));continue}
   root.append(paragraph('muted','Валидация '+metrics.validationN+' · независимый тест '+metrics.testN+' · начало теста '+shortTime(metrics.testStart)));
   if(view==='evolution'){
    const passed=metrics.calibrated.brier<=metrics.baseline.ensemble.brier&&metrics.calibrated.logloss<=metrics.baseline.ensemble.logloss;
    root.append(compBox(metrics.version,'Температура '+metrics.temperature,passed?'Допущена по Brier и log loss':'Базовая модель показала лучший результат на тесте'));
    continue;
   }
   for(const [label,stat] of Object.entries({...metrics.baseline,calibrated:metrics.calibrated})){
    root.append(compBox(label,'Brier '+stat.brier.toFixed(4),'Log loss '+stat.logloss.toFixed(4)+' · accuracy '+pct(stat.accuracy)));
   }
   for(const bin of metrics.calibrated.reliability)root.append(compBox('Группа · '+bin.count,
     pct(bin.mean)+' → '+pct(bin.observed),'Расчётная вероятность → наблюдаемая доля'));
  }
  return;
 }
 for(const [,source] of Object.entries(fixtureStatus?.sources??{})){
  root.append(compBox(source.source,source.ok?'Данные получены':source.mode==='capture'?'Снимок':'Недоступно',
    [shortTime(source.checkedAt),source.fixtures==null?null:source.fixtures+' событий',source.error].filter(Boolean).join(' · ')));
 }
 const coverage=fixtureStatus?.pariCoverage;
 if(fixtureStatus?.sources?.pari?.mode&&coverage)root.append(compBox('Сверка PARI',coverage.matched+' совпали',
   coverage.onlyPari+' только PARI · '+coverage.onlySchedule+' только в расписании · '+coverage.ambiguous+' неоднозначных'));
 for(const [game,data] of Object.entries(report?.games??{}))root.append(compBox(game.toUpperCase(),data.rows+' результатов',
   shortTime(data.earliest)+' — '+shortTime(data.latest)));
}
function renderBrief(root){
 if(!brief){root.append(errorBlock('Список пока не загружен'));return}
 const opened=new Set([...root.querySelectorAll('details[open]')].map(node=>node.dataset.matchId));
 root.replaceChildren();
 const rows=briefRows(brief.fixtures,fixtures,journal,matches,Date.now());
 const labels={upcoming:'Предстоит',live:'Live · снимок',started:'Время старта прошло · ожидаем счёт',finished:'Завершён'};
 root.append(paragraph('muted',rows.length+' матчей · '+rows.filter(row=>row.forecast).length+' матчей с записанной оценкой. Время по Москве.'));
 root.append(paragraph('muted','Шанс победы оценивает модель. Порог безубыточности зависит только от коэффициента. Результаты сверяются с журналом.'));
 for(const {fixture:f,forecast,settlement,live,gap,result,status} of rows){
  const stored=brief.fixtures.find(row=>row.id===f.id);
  const details=el('details','brief-match');
  details.dataset.matchId=f.id;
  details.open=opened.has(f.id);
  const summary=el('summary');
  summary.append(el('small','',shortTime(f.date)+' · '+(f.game==='cs2'?'CS2':'Dota 2')+' · '+labels[status]),
    el('span','',f.a+' — '+f.b));
  if(forecast)summary.append(el('small','','Предматчевый прогноз · '+forecast.pick+' '+pct(forecast.probability)));
  else summary.append(el('small','',assessmentMessage(gap?.reason)));
  details.append(summary);
  const current=status==='upcoming'&&f.status==='upcoming'?assessment(f):null;
  if(current?.status==='ok'){
   const {a,b,h2h}=current.comparisons;
   details.append(paragraph('','Расчёт по свежему архиву · '+current.picked+' '+pct(Math.max(current.result.pa,current.result.pb))));
   const facts=el('ul');
   facts.append(el('li','',f.a+' — Elo '+asNum(a.rating)+', '+a.count+' результатов, победы '+a.wins+' из последних '+a.last+'.'),
    el('li','',f.b+' — Elo '+asNum(b.rating)+', '+b.count+' результатов, победы '+b.wins+' из последних '+b.last+'.'),
    el('li','','Очные встречи · '+h2h.winsA+':'+h2h.winsB+' по '+h2h.count+' результатам в архиве.'));
   if(current.probabilityBasis==='series-projected'){
    const one=current.picked===f.a?current.result.factorProbability:1-current.result.factorProbability;
    facts.append(el('li','','Шанс на одну карту · '+pct(one)+'. Оценка BO3 предполагает независимость карт.'));
   }
   details.append(facts);
  }
  if(forecast){
   const factorList=el('ul');
   for(const reason of forecast.reasons??[]){
    const expected=reason.a>=.5?forecast.a:forecast.b;
    factorList.append(el('li','',reason.name+' · вес '+pct(reason.weight)+' · '+expected+' '+pct(Math.max(reason.a,1-reason.a))+'. '+reason.description));
   }
   details.append(paragraph('muted','Факторы сохранённого прогноза · записано '+shortTime(forecast.createdAt)+' · '+forecast.model));
   if(factorList.childElementCount)details.append(factorList);
   drawReasonSummary(details,{...forecast,probabilityA:forecast.probabilityA??(forecast.pick===forecast.a?forecast.probability:1-forecast.probability),
    map:forecast.evidence?.map,roster:forecast.evidence?.roster});
   if(forecast.probabilityBasis==='series-projected')details.append(paragraph('muted','Шанс на серию рассчитан из модели карт. Отдельная калибровка серии пока не подтверждена.'));
   const price=stored.publicPrice;
   if(price&&forecast.probabilityBasis!=='map'){
    const index=forecast.pick===stored.a?0:forecast.pick===stored.b?1:-1;
    const odds=price.odds[index];
    const comparison=priceComparison(forecast.probability,odds);
    if(comparison){
     const link=el('a','','PARI');link.href=price.url;link.target='_blank';link.rel='noopener noreferrer';
     const line=paragraph('muted','');line.append(link,' · снимок '+price.observedAt+' · '+odds.toFixed(2)+' на '+forecast.pick+
        ' · порог безубыточности '+pct(comparison.breakEven)+' · разница к сохранённой оценке '+(comparison.delta>=0?'+':'')+(comparison.delta*100).toFixed(1)+' п.п.');
     details.append(line);
    }
   }
  }
  if(!forecast&&gap)details.append(paragraph('muted','Прогноз пропущен. '+assessmentMessage(gap.reason)+'.'));
  if(result)details.append(paragraph('','Победитель · '+result.winner+' · '+result.source));
  if(settlement)details.append(paragraph('','Прогноз '+(settlement.result===1?'совпал':'не совпал')+' · сверено '+shortTime(settlement.checkedAt)));
  if(live&&status!=='finished')details.append(paragraph('','Сохранённая Live-оценка · '+shortTime(live.observedAt)+' · '+f.a+' '+pct(live.probabilityA)+' · карты '+live.score.join(':')));
  if((status==='live'||status==='started')&&!live)details.append(paragraph('muted','Для Live-пересчёта нужен подтверждённый снимок счёта.'));
  if(f.tournament)details.append(paragraph('muted',f.tournament+(f.format?' · '+f.format:'')));
  root.append(details);
 }
}
function updateFilters(){
 expanded=false;
 const rows=activeFixtures();
 if(!rows.some(row=>row.id===selected?.id))selected=rows[0]??null;
 renderFixtures();renderAnalysis();renderWorkspace();
}
for(const btn of document.querySelectorAll('[data-view]'))btn.onclick=()=>{filters.view=btn.dataset.view;history.replaceState(null,'',['brief','daily'].includes(filters.view)?'#'+filters.view:location.pathname+location.search);updateFilters()};
for(const key of ['period','tournament','quality'])$(key).onchange=()=>{filters[key]=$(key).value;updateFilters()};
for(const btn of document.querySelectorAll('[data-game]'))btn.onclick=()=>{filters.game=btn.dataset.game;syncTournaments();updateFilters()};
load();
setInterval(()=>{if(document.visibilityState==='visible')load()},120000);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
