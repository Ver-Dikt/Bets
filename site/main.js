import {dailyRows,tally,reviewPeriod,totalTally,errorReview,compareJournalWinners,
 confidenceBreakdown,cs2ConfidenceBenchmark,qualifiesForCs2Shortlist,verifiedForecastRows,forecastPrice,pricedResults,
 qualifiesForPricedCs2Shortlist,inPlayFixtures,publishedWinnerPick,hasPublishedTotalPick,compareCs2Forecast,cs2ComparisonResults,cs2ReservePick,cs2CoverageResults,replayDailySelection,pariScreenshotSelections} from './daily.mjs';
import {analyzeFixture,probabilitySteps} from './analysis.mjs';
const modelNames={
 dynamicElo:'Dynamic Elo',glicko2:'Glicko-2',trueSkill:'TrueSkill',bradleyTerry:'Bradley–Terry',
 ratingBlend:'Ансамбль рейтингов',hybridBlend:'Ансамбль рейтингов и деревьев',
 bayesian:'Байесовская модель',catBoost:'CatBoost',lightGBM:'LightGBM',legacy:'Рейтинговая модель',
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
const asNum=x=>x==null?'—':Number(x).toFixed(1);
let matches=[],fixtures=[],journal=[],pariScreenshots=[],report=null,research=null,mapInsights=null,filters={game:'all',view:(['#brief','#daily'].includes(location.hash)||new URLSearchParams(location.search).has('selection'))?'daily':'today',period:'today',tournament:'all',confidence:'recorded'},selected=null,expanded=false,loading=false,fixtureStatus=null;
const assessments=new Map();
const published=new Map();
let playing=[];
const cs2ShortlistMode=()=>['cs2-shortlist','cs2-priced'].includes(filters.confidence);
const agreementThreshold=()=>({ 'cs2-agreement':.55, 'cs2-agreement70':.70 })[filters.confidence];
const expandedCs2Mode=()=>filters.confidence==='cs2-expanded';
const cs2OnlyMode=()=>cs2ShortlistMode()||expandedCs2Mode()||Boolean(agreementThreshold());
const ratingModelHelp='Рассчитывает шансы по рейтингу силы, форме и очным встречам. При наличии данных учитывает карты и состав.';
const comparisonLabels={agreement:'Обе модели за одну команду от 55%',weak:'Хотя бы одна модель ниже 55%',different:'Модели выбрали разные команды'};
const modelFavorite=choice=>choice.team?choice.team+' · '+pct(choice.probability):'Равные шансы · 50%';
function forecastFor(fixture){
 const forecast=published.get(fixture.id);
 if(forecast?.kickoff===(fixture.forecastKickoff??fixture.date)&&forecast.a===fixture.a&&forecast.b===fixture.b&&forecast.format===fixture.format&&
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
 const shortlist=cs2ShortlistMode();
 const priced=filters.confidence==='cs2-priced';
 const benchmark=shortlist?cs2ConfidenceBenchmark(research):null;
 const upcoming=fixtures.filter(f=>f.status==='upcoming'&&Date.parse(f.date)>now&&
  (filters.period==='all'||dayFmt.format(new Date(f.date))===(filters.period==='today'?today:tomorrow)));
 const pool=filters.period==='live'?playing.filter(f=>f.confirmed):filters.period==='today'?[...playing,...upcoming]:upcoming;
 return pool.filter(f=>filters.game==='all'||f.game===filters.game)
  .filter(f=>filters.tournament==='all'||f.tournament===filters.tournament)
  .filter(f=>f.inPlay||filters.confidence!=='recorded'||forecastFor(f))
  .filter(f=>{
   if(f.inPlay&&filters.period==='live')return true;
   if(expandedCs2Mode()){
    const saved=forecastFor(f);
    return f.game==='cs2'&&Boolean(publishedWinnerPick(saved)||cs2ReservePick(saved));
   }
   if(filters.confidence==='picked')return Boolean(publishedWinnerPick(forecastFor(f)));
   const threshold=agreementThreshold();
   if(threshold){
    const pair=compareCs2Forecast(forecastFor(f));
    return !f.inPlay&&pair?.group==='agreement'&&Math.min(pair.primary.probability,pair.reference.probability)>=threshold;
   }
   if(!shortlist)return true;
   const forecast=forecastFor(f);
   if(!priced)return qualifiesForCs2Shortlist(forecast,benchmark);
   const board=forecast?.oddsProvider?f.bookPrice:f.pari;
   return Boolean(board&&Date.parse(board.date)>now&&Date.parse(board.freshUntil)>now&&
    forecast?.oddsSource===(board.bookmaker??'PARI')&&forecast?.odds?.every((odd,i)=>odd===board.odds?.[i])&&
    qualifiesForPricedCs2Shortlist(forecast,benchmark,now));
  })
  .sort((a,b)=>Number(Boolean(b.inPlay))-Number(Boolean(a.inPlay))||Date.parse(a.date)-Date.parse(b.date));
}
function badge(text,cls=''){return el('span','tag'+(cls?' '+cls:''),text)}
function renderSources(){
 $('cs2-source').textContent=sourceText('cs2');
 $('dota-source').textContent=sourceText('dota');
 const root=$('source-warning');root.replaceChildren();
 if(!fixtureStatus){root.append(el('div','source-warning','Нет опубликованного снимка расписания. Придумывать матчи нельзя.'));return}
 const broken=Object.entries(fixtureStatus.sources||{}).filter(([game,v])=>['cs2','dota'].includes(game)&&!v?.ok);
 if(broken.length)root.append(el('div','source-warning','Расписание может быть неполным: '+broken.map(([game])=>game.toUpperCase()).join(', ')+'.'));
 const now=Date.now();
 const hasFreshPrice=fixtures.some(f=>f.status==='upcoming'&&Date.parse(f.date)>now&&
  [f.bookPrice,f.pari].some(board=>board?.mode==='feed'&&Date.parse(board.freshUntil)>now));
 if(!hasFreshPrice)root.append(el('div','source-warning','В опубликованном снимке нет свежих предматчевых цен.'));
 if(Number.isFinite(Date.parse(fixtureStatus.generatedAt))){
  const mins=(Date.now()-Date.parse(fixtureStatus.generatedAt))/60000;
  $('fixture-update').textContent=(mins>90?'Устаревший снимок · ':'Обновлено · ')+shortTime(fixtureStatus.generatedAt);
 }else $('fixture-update').textContent='Время обновления неизвестно';
}
function renderFixtures(){
 document.querySelectorAll('[data-game]').forEach(b=>{const active=b.dataset.game===filters.game;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 const items=activeFixtures(),root=$('fixture-list');root.replaceChildren();
 const count=$('schedule-count');
 if(count){
  count.hidden=!fixtureStatus;
  const upcoming=items.filter(f=>!f.inPlay).length;
  const live=items.filter(f=>f.confirmed).length;
  const waiting=items.length-upcoming-live;
  const counts=['Предстоит · '+upcoming];
  if(live||filters.period==='live')counts.push('В игре · '+live);
  if(waiting)counts.push('Ждём статус · '+waiting);
  count.textContent=(filters.period==='live'?counts.slice(1):counts).join('   /   ');
 }
 const shortlist=cs2ShortlistMode(),priced=filters.confidence==='cs2-priced',note=$('confidence-note');
 const benchmark=shortlist?cs2ConfidenceBenchmark(research):null;
 const threshold=agreementThreshold();
 note.hidden=(!shortlist&&!threshold&&!expandedCs2Mode())||filters.period==='live';
 note.textContent=expandedCs2Mode()?'Если основная модель ниже 55%, показываем резервный выбор рейтинговой модели от 55%.':threshold?'Обе модели выбрали одну команду с вероятностью от '+pct(threshold)+'.':priced?'Победитель CS2 от 70% с коэффициентом выше порога безубыточности. Снимок цены должен быть свежее 45 минут.':benchmark
  ?'На историческом тесте '+benchmark.correct+' из '+benchmark.count+' попаданий · охват '+pct(benchmark.coverage)+' всех проверенных серий CS2'
  :'Историческая проверка активной модели CS2 недоступна.';
 if(!items.length){
  if(filters.period==='live'){
   root.append(errorBlock('Нет матчей с подтверждённым live-статусом'));
   $('show-more').hidden=true;
   return;
  }
  if(shortlist){
   root.append(errorBlock(priced?'Нет прогнозов CS2 с подходящей ценой':'Нет прогнозов CS2 от 70% для выбранного периода и турнира',
    priced?'Здесь появляются только матчи со свежим коэффициентом.':null));
   $('show-more').hidden=true;
   return;
  }
  const broken=(filters.game==='all'?['cs2','dota']:[filters.game]).some(game=>fixtureStatus?.sources?.[game]?.ok===false);
  const onlyRecorded=filters.confidence==='recorded';
  const title=expandedCs2Mode()?'Нет предстоящих матчей с основным или резервным выбором':threshold?'Нет предстоящих матчей, где обе модели согласны при этом пороге':filters.confidence==='picked'?'Нет матчей с выбором победителя'
   :onlyRecorded?'Нет предстоящих матчей с оценкой модели':'Нет предстоящих матчей';
  root.append(errorBlock(title,
   broken?'Источник расписания сообщил об ошибке.':onlyRecorded?'Для просмотра остальных матчей выбери «Всё расписание».':null));
  $('show-more').hidden=true;
  return;
 }
 const shown=expanded?items:items.slice(0,10);
 for(const f of shown){
  const button=el('button','fixture'+(f.id===selected?.id?' selected':''));
  button.type='button';button.setAttribute('aria-label','Открыть анализ '+f.a+' против '+f.b);
  const meta=el('div','fixture-top');
  meta.append(el('span','',shortTime(f.date)),badge(f.game==='cs2'?'CS2':'DOTA 2'));
  if(f.inPlay)meta.append(badge(f.confirmed?'В игре':'Ждём статус',f.confirmed?'live':'weak'));
  const name=el('div','fixture-name',f.a+'  —  '+f.b);
  const foot=el('div','fixture-foot');
  const label=f.tournament||'Турнир не указан';
  foot.append(el('span','',label.length>48?label.slice(0,45)+'…':label),el('span','',f.format||'Разбор'));
  button.append(meta,name,foot);
  if(f.confirmation?.length)button.append(el('div','meta','Сопоставлено с '+f.confirmation.join(', ')));
  const saved=forecastFor(f);
  if(saved){
   const pick=publishedWinnerPick(saved),reserve=cs2ReservePick(saved);
   const preview=el('div','fixture-foot');
   preview.style.borderTop='1px solid #304658';preview.style.paddingTop='9px';
   preview.append(el('span','',pick?'Основной выбор · '+pick:reserve?'Резерв · '+reserve.team:'Без выбора от 55%'),el('span','win',pct(reserve?.probability??saved.probability)));
   button.append(preview);
   const pair=compareCs2Forecast(saved);
   if(pair){
    const control=el('div','fixture-foot model-control');
    control.append(el('span','','Рейтинговая модель · '+modelFavorite(pair.reference)),el('span','',pair.group==='agreement'?'Согласие':pair.group==='different'?'Расхождение':'Ниже порога'));
    button.append(control);
   }
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
 if(f.inPlay){
  const live=el('div','comp-grid');
  const observed=shortTime(f.fetchedAt);
  const mapScore=f.confirmed&&f.liveScore;
  const kills=f.confirmed&&f.liveState?.kills?.every(Number.isSafeInteger)&&f.liveState.kills;
  const score=mapScore||kills;
  const metric=mapScore?'Счёт по картам · ':kills?'Убийства на текущей карте · ':'';
  live.append(compBox(f.confirmed?'Последний снимок матча':'Статус матча',
   score?f.a+' '+score.join(' : ')+' '+f.b:f.confirmed?'В игре':'Время старта прошло',
   f.confirmed?metric+observed+' · '+f.source:'Подтверждение старта или результата ещё не поступило.'));
  root.append(live);
 }
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
 const pick=publishedWinnerPick(saved);
 const reserve=cs2ReservePick(saved);
 const paired=compareCs2Forecast(saved);
 const title=pick?'ОСНОВНОЙ ВЫБОР':reserve?'РЕЗЕРВНЫЙ ВЫБОР':'ПРЕДМАТЧЕВАЯ ОЦЕНКА';
 const explanation=reserve
  ?(paired.group==='different'?'Модели склоняются к разным командам. ':'')+'Главная модель ниже 55%, выбор дала рейтинговая.'
  :modelNames[saved.model.split('@')[0]]??'Рейтинговая модель';
 verdict.append(el('small','',title),
  el('b','',pick?pick+' · '+pct(favoriteProbability):reserve?modelFavorite(reserve):'Без выбора победителя'),
  paragraph('',explanation+' · Снимок '+shortTime(saved.createdAt)));
 root.append(verdict);
 if(paired){
  const comparison=el('div','comp-grid');
  const primaryDescription=saved.research.selected==='lightGBM'
   ?'LightGBM учится на истории матчей и учитывает сочетания факторов.' :'Вероятность по активной модели.';
  comparison.append(compBox('Основная модель',modelFavorite(paired.primary),primaryDescription),
   compBox('Рейтинговая модель',modelFavorite(paired.reference),ratingModelHelp));
  root.append(comparison,paragraph('muted',comparisonLabels[paired.group]));

 }
 const price=forecastPrice(saved);
 if(pick){
  const prices=el('div','comp-grid');
  prices.append(compBox('Расчётный порог BETS', (1/favoriteProbability).toFixed(2),'1 ÷ вероятность BETS · '+pick));
  if(price){
   prices.append(compBox(price.bookmaker+' · '+shortTime(price.observedAt),price.odds.toFixed(2),
    (price.provider?price.provider+' · ':'')+'Снимок до старта · Для безубыточности нужно '+pct(price.breakEven)),
    compBox('Ожидаемая доходность по модели',pct(price.expectedReturn)));
  }else prices.append(compBox('Коэффициент букмекера','—','Снимок линии до матча отсутствует'));
  root.append(prices);
 }
 const total=saved.total;
 if(total){
  root.append(el('h3','analysis-head','Количество карт · '+f.format));
  if(hasPublishedTotalPick(total)){
   const line=String(total.line).replace('.',',');
   const grid=el('div','comp-grid');
   grid.append(compBox('ТБ '+line,pct(total.over),f.format==='Bo3'?'Будет 3-я карта':'Будет 5-я карта'),
               compBox('ТМ '+line,pct(total.under),f.format==='Bo3'?'Две карты':'Три или четыре карты'));
   root.append(grid);
  }else root.append(paragraph('muted','По тоталу есть только оценка модели. Выбора ТБ или ТМ нет.'));
 }
 const detail=el('details');detail.append(el('summary','','Данные и сравнение моделей'));root.append(detail);
 if(total&&!hasPublishedTotalPick(total)){
  const line=String(total.line).replace('.',',');
  detail.append(compBox('Предматчевая оценка тотала','ТБ '+line+' '+pct(total.over)+' / ТМ '+line+' '+pct(total.under),
   total.validated?'Вероятности слишком близки':'Исследовательская оценка'));
 }
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
   compBox('Карты с известным составом',evidence.lineupsA+' / '+evidence.lineupsB),compBox('Форма за 10 серий',pct(evidence.formA)+' / '+pct(evidence.formB)));
  detail.append(el('h3','analysis-head','Что было известно до матча'),evidenceGrid);
 }else{
  drawReasonSummary(detail,{...saved,map:saved.evidence?.map,roster:saved.evidence?.roster});
  if(r.status==='ok')drawFactors(detail,r);
 }
 drawMapInsight(detail,f);
 detail.append(el('h3','analysis-head','Профили игроков до прогноза'));
 for(const [index,team] of [f.a,f.b].entries()){
  const snapshot=(saved.profileEvidence??f.rosters)?.[index];
  const roster=Date.parse(snapshot?.observedAt)<=Date.parse(saved.createdAt)?snapshot:null;
  const players=roster?.players.map(player=>player.name+(player.metric==null?'':f.game==='dota'?' '+pct(player.metric):' '+player.metric.toFixed(2)));
  detail.append(compBox(team,players?.join(' · ')??'Предматчевый профиль недоступен',
   roster?roster.source+' · '+shortTime(roster.observedAt)+' · состав на матч не подтверждён':''));
 }
 if(saved.evidence?.roster)detail.append(compBox('Профили игроков',pct(saved.evidence.roster.a),'Поправка рейтинговой модели по профилям команд.'));

 detail.append(paragraph('muted','Данные встречи: '+f.source+'. Время получения: '+shortTime(f.fetchedAt)+'. Расчёт использует только исходы до старта этого матча.'));
}
async function load(){
 if(loading)return;loading=true;
 const read=async(name)=>{const r=await fetch('./'+name+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(name+' HTTP '+r.status);return r.json()};
 const [matchesResult,fixtureResult,reportResult,mapResult,journalResult,researchResult,pariScreenshotsResult]=await Promise.allSettled([read('snapshot.json'),read('fixtures.json'),read('report.json'),read('map-insights.json'),read('journal.json'),read('research.json'),read('pari-screenshots.json')]);
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
   if(type==='forecast'&&record?.fixtureId&&record.probabilityBasis!=='map'&&Date.parse(record.createdAt)<Date.parse(record.kickoff)&&
    !(Date.parse(published.get(record.fixtureId)?.createdAt)>Date.parse(record.createdAt)))published.set(record.fixtureId,record);
  }
 }
 if(researchResult.status==='fulfilled')research=researchResult.value;
 if(pariScreenshotsResult.status==='fulfilled'&&pariScreenshotsResult.value?.schemaVersion===1&&Array.isArray(pariScreenshotsResult.value.quotes))pariScreenshots=pariScreenshotsResult.value.quotes;
 assessments.clear();
 playing=inPlayFixtures(fixtures,journal,matches,Date.now());
 syncTournaments();
 renderSources();
 const available=activeFixtures();
 if(!selected&&available.length)selected=available[0];
 if(selected&&!available.some(f=>f.id===selected.id))selected=available[0]||null;
 if(selected){const fresh=available.find(f=>f.id===selected.id);if(fresh)selected=fresh}
 renderFixtures();renderAnalysis();renderWorkspace();loading=false;
}
$('show-more').onclick=()=>{expanded=!expanded;renderFixtures()};
$('refresh').onclick=load;
function syncTournaments(){
 const select=$('tournament');
 const names=[...new Set([...fixtures,...playing].filter(f=>filters.game==='all'||f.game===filters.game).map(f=>f.tournament).filter(Boolean))].sort();
 select.replaceChildren(new Option('Все турниры','all'),...names.map(name=>new Option(name,name)));
 if(!names.includes(filters.tournament))filters.tournament='all';
 select.value=filters.tournament;
}
function historicalResearch(root){
 if(!research?.version)return;
 const details=el('details');details.append(el('summary','','Историческая проверка моделей'));root.append(details);
 details.append(paragraph('muted','Модели обучались, отбирались и калибровались до финального тестового периода. Историческая рейтинговая модель использует рейтинг, форму и очные встречи. В текущих прогнозах рейтинговая модель может дополнительно учитывать карты и состав.'));
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
const dailySelectionThreshold=.01;
const selectionStatus={won:'попадание',lost:'промах',pending:'ждём результат',void:'возврат'};

function renderTodaySelection(){
 const now=Date.now(),day=dayFmt.format(now),root=$('today-selection');
 const rows=dailyRows({day,fixtures,journal,matches,now});
 const replay=replayDailySelection({journal,rows,from:day,day,source:'pari',now});
 const automatic=replay.scenarios.find(({threshold})=>threshold===dailySelectionThreshold).two.picks;
 const screenshots=pariScreenshotSelections({quotes:pariScreenshots,journal,rows,day,now,minReturn:dailySelectionThreshold});
 const picks=automatic.concat(screenshots.filter(pick=>!automatic.some(saved=>saved.id===pick.id))).slice(0,2);
 const title=el('div','panel-heading');
 const historyLink=el('a','','Бэктест');
 historyLink.href='?selection=1#daily';
 title.append(el('h2','','Выбор на сегодня'),historyLink);
 root.replaceChildren(title,paragraph('muted',
  new Intl.DateTimeFormat('ru-RU',{timeZone:moscow,day:'numeric',month:'long'}).format(now)+
  ' · PARI · до двух матчей · расчётный запас от +1%'));
 const grid=el('div','comp-grid');
 for(const pick of picks){
  const status=pick.state==='pending'&&Date.parse(pick.kickoff)>now?'до старта':selectionStatus[pick.state];
  grid.append(compBox(pick.a+' — '+pick.b,pick.team+' · '+pick.odds.toFixed(2),
   shortTime(pick.kickoff)+' МСК · '+pct(pick.probability)+' по модели · '+status+
   (pick.screenshot?' · скрин PARI '+shortTime(new Date(pick.at).toISOString())+' МСК':'')));
 }
 if(picks.length)root.append(grid);
 else root.append(paragraph('muted',!fixtureStatus&&!journal.length?'Загружаем расписание и журнал…':
  replay.covered?'Сегодня ни один прогноз с сохранённой ценой PARI не прошёл порог.':'В журнале пока нет подходящих предматчевых цен PARI на сегодня.'));
 if(pariScreenshots.length){
  const archive=el('details');
  archive.append(el('summary','','Цены со скриншотов PARI · '+pariScreenshots.length+' матчей'));
  for(const quote of pariScreenshots){
   archive.append(paragraph('muted',shortTime(quote.kickoff)+' МСК · '+quote.a+' — '+quote.b+' · '+
    quote.odds.map(price=>price.toFixed(2)).join(' / ')+' · скрин '+shortTime(quote.observedAt)+
    (quote.fixtureId?'':' · матч пока без привязки к расписанию BETS')));
  }
  root.append(archive);
 }
}
function renderSelectionReplay(root,{day,game,format,now}){
 const from='2026-11-24';
 if(day<from)return;
 const rows=dailyRows({day,from,fixtures,journal,matches,now});
 const source=filters.replaySource??'pari';
 const {covered,baseline,scenarios}=replayDailySelection({journal,rows,from,day,game,format,source,now});
 const panel=el('details');
 panel.id='selection';
 panel.open=filters.replayOpen??new URLSearchParams(location.search).has('selection');
 panel.ontoggle=()=>{filters.replayOpen=panel.open};
 const feed=el('select');
 feed.setAttribute('aria-label','Котировки для бэктеста');
 feed.append(new Option('Только PARI','pari'),new Option('PARI и OddsLink','all'));
 feed.value=source;
 feed.onchange=()=>{filters.replaySource=feed.value;filters.replayOpen=true;renderWorkspace()};
 panel.append(el('summary','','Бэктест · до двух выборов в день'),feed,
  paragraph('muted','С 24.11.2026 по '+day+' включительно, по Москве. Матчи с прогнозом от 55% и сохранённой ценой: '+covered+'.'),
  paragraph('muted','На каждом обновлении берём подходящие цены, которым меньше 45 минут. Внутри обновления сначала идёт наибольшая расчётная доходность. Уже сделанный выбор занимает дневное место. Размер — 1 условная единица. Источники: PARI и другие букмекеры через OddsLink.'));
 const grid=el('div','comp-grid');
 const describe=(label,result)=>{
  const {closed,won,pending,voids,profit,roi,drawdown,maxStreak}=result;
  return compBox(label,closed?((profit>0?'+':'')+profit.toFixed(2)+' ед. · ROI '+pct(roi)):'—',
   won+' / '+closed+' попаданий · ждут '+pending+' · возвратов '+voids+
   (closed?' · серия промахов '+maxStreak:'')+
   (drawdown===null?'':' · просадка '+drawdown.toFixed(2)+' ед.'));
 };
 grid.append(describe('Все прогнозы от 55% с ценой',baseline));
 for(const {threshold,one,two} of scenarios){
  const label=pct(threshold)+' мин. расчётной доходности';
  grid.append(describe('До одного · '+label,one),describe('До двух · '+label,two));
 }
 panel.append(grid);
 const log=el('details');
 log.append(el('summary','','Матчи · до двух при запасе от +1%'));
 const {picks}=scenarios.find(({threshold})=>threshold===dailySelectionThreshold).two;
 for(const pick of picks){
  log.append(paragraph('muted',pick.day+' · '+shortTime(new Date(pick.at).toISOString())+' · '+pick.a+' — '+pick.b+
   ' · '+pick.team+' '+pick.odds.toFixed(2)+' ('+pick.bookmaker+') · '+selectionStatus[pick.state]));
 }
 if(!picks.length)log.append(paragraph('muted','Подходящих цен за период нет.'));
 panel.append(log,paragraph('muted','Исторический прогон. Разные правила используют одни и те же доступные записи, но выбирают разное число матчей.'));
 root.append(panel);
}
function renderDaily(root){
 const chooser=el('input');chooser.type='date';chooser.value=filters.reviewDay??dayFmt.format(Date.now());
 chooser.setAttribute('aria-label','Конец периода');
 chooser.onchange=()=>{if(chooser.value)filters.reviewDay=chooser.value;renderWorkspace()};
 const period=el('select');period.setAttribute('aria-label','Период итогов');
 period.replaceChildren(...[1,2,7,14,30,90].map(n=>new Option(n===1?'Один день':n===2?'Два дня':n+' дней',n)));
 period.value=filters.reviewPeriod??1;
 period.onchange=()=>{filters.reviewPeriod=Number(period.value);renderWorkspace()};
 const game=el('select');game.setAttribute('aria-label','Дисциплина итогов');
 game.replaceChildren(new Option('Все игры','all'),new Option('CS2','cs2'),new Option('Dota 2','dota'));
 game.value=filters.reviewGame??'all';
 game.onchange=()=>{filters.reviewGame=game.value;renderWorkspace()};
 const format=el('select');format.setAttribute('aria-label','Формат серии');
 format.replaceChildren(new Option('Все форматы','all'),...['Bo1','Bo3','Bo5','Bo7'].map(name=>new Option(name,name)));
 format.value=filters.reviewFormat??'all';
 format.onchange=()=>{filters.reviewFormat=format.value;renderWorkspace()};
 const reload=el('button','tab','Обновить');reload.type='button';reload.onclick=load;
 const controls=el('div','tabs');controls.append(chooser,period,game,format,reload);root.append(controls);
 const rows=verifiedForecastRows(dailyRows({day:chooser.value,from:reviewPeriod(chooser.value,Number(period.value)),
  fixtures:[],journal,matches,now:Date.now()}),game.value)
  .filter(({forecast})=>format.value==='all'||forecast.format===format.value);
 const picks=rows.filter(({forecast})=>publishedWinnerPick(forecast));
 const t=tally(picks), grid=el('div','comp-grid');
 grid.append(compBox('Сверенные прогнозы победителя',t.total),compBox('Попадания',t.won),compBox('Промахи',t.lost),
  compBox('Точность',t.total?pct(t.won/t.total):'—'));
 if(rows.length>picks.length)grid.append(compBox('Без выбора победителя',rows.length-picks.length,'Модельная вероятность ниже 55%'));
 root.append(grid);
 const priced=pricedResults(picks);
 const returns=el('div','comp-grid');
 returns.append(compBox('С предматчевым коэффициентом',priced.all.priced+' из '+t.total),
  compBox('ROI по всем прогнозам с ценой',pct(priced.all.roi),priced.all.priced?'Расчёт по 1 условной единице на прогноз':'Пока нет сверенных прогнозов с ценой'),
  compBox('ROI при положительной оценке доходности',pct(priced.positive.roi),priced.positive.priced+' сверенных прогнозов'));
 root.append(returns);
 renderSelectionReplay(root,{day:chooser.value,game:game.value,format:format.value,now:Date.now()});
 const bands=confidenceBreakdown(rows);
 if(bands.some(band=>band.settled)){
  const details=el('details'),grid=el('div','comp-grid');
  details.append(el('summary','','Оценка модели и фактические попадания'));
  for(const {min,max,settled,won,expectedWins} of bands){
   const label=max===null?'От '+pct(min):pct(min)+' — менее '+pct(max);
   const summary=settled?won+' из '+settled+' · модель в среднем дала '+pct(expectedWins/settled):'Нет завершённых матчей';
   grid.append(compBox(label,settled?pct(won/settled):'—',summary+(max===.55?' · без выбора победителя':'')));
  }
  details.append(grid);
  root.append(details);
 }
 const recordedTotals=totalTally(rows);
 const totals=totalTally(rows.filter(({total})=>hasPublishedTotalPick(total)));
 if(recordedTotals.resolved){
  const grid=el('div','comp-grid');
  grid.append(compBox('Количество карт · сверенные прогнозы',totals.resolved),
   compBox('Точность',totals.decisive?pct(totals.correct/totals.decisive):'—',totals.correct+' / '+totals.decisive+' прогнозов с выбором'),
   compBox('Оценки без выбора тотала',recordedTotals.resolved-totals.resolved));
  root.append(grid);
 }
 const review=errorReview(picks);
 if(review.misses){
  const details=el('details');details.append(el('summary','','Разбор промахов · '+review.misses),
   paragraph('muted',review.confident+' ошибок при вероятности от 65% · '+review.disagreement+' с расхождением с рейтинговой моделью'));
  for(const {forecast,winner,error} of review.latest)details.append(compBox(forecast.a+' — '+forecast.b,
   forecast.pick+' · '+pct(forecast.probability),'Победитель '+winner+(error?.disagreement?' · рейтинговая модель выбрала иначе':'')));
  root.append(details);
 }
 const activeWinner=research?.games?.cs2?.winner;
 const activeVersion=activeWinner?.approved&&research.version?activeWinner.selected+'@'+research.version:null;
 const currentModelRows=rows.filter(({forecast})=>forecast.model===activeVersion);
 const coverage=cs2CoverageResults(currentModelRows);
 if(coverage.matches){
  const section=el('details');
  section.append(el('summary','','CS2 · что даёт резервный отбор'));
  const grid=el('div','comp-grid');
  for(const [label,stats] of [['Основной выбор',coverage.primary],['Резервный выбор рейтинговой модели',coverage.reserve],['Вместе',coverage.expanded]]){
   grid.append(compBox(label,stats.won+' / '+stats.total,stats.total?pct(stats.won/stats.total)+' точность':'Нет выборов'));
  }
  const {reserve,conflicts}=coverage;
  grid.append(compBox('Резерв при разногласии',conflicts.won+' / '+conflicts.total),
   compBox('Резерв без разногласия',(reserve.won-conflicts.won)+' / '+(reserve.total-conflicts.total)));
  section.append(grid,paragraph('muted','Проверка правила по '+coverage.matches+' завершённым матчам с сохранёнными предматчевыми оценками обеих моделей.'));
  root.append(section);
 }
 const paired=cs2ComparisonResults(currentModelRows);
 if(paired.size){
  const section=el('details');
  const name=modelNames[activeWinner.selected]??activeWinner.selected;
  section.append(el('summary','','CS2 · '+name+' и рейтинговая модель на одних и тех же матчах'));
  const all=[...paired.values()].reduce((sum,group)=>({
   matches:sum.matches+group.matches,primaryWins:sum.primaryWins+group.primaryWins,
   referenceWins:sum.referenceWins+group.referenceWins,
   primaryError:sum.primaryError+group.primaryError,
   referenceError:sum.referenceError+group.referenceError
  }),{matches:0,primaryWins:0,referenceWins:0,primaryError:0,referenceError:0});
  const grid=el('div','comp-grid');
  grid.append(compBox('Ошибка вероятностей · Brier',
   (all.primaryError/all.matches).toFixed(3)+' / '+(all.referenceError/all.matches).toFixed(3),
   'Основная / рейтинговая на тех же '+all.matches+' матчах. Ниже — лучше.'));
  for(const [label,group] of [['Все общие матчи',all],...Object.entries(comparisonLabels).map(([key,label])=>[label,paired.get(key)])]){
   if(!group)continue;
   grid.append(compBox(label,group.matches+' матчей','Попадания · основная '+group.primaryWins+' / '+group.matches+
    ' · рейтинговая '+group.referenceWins+' / '+group.matches));
  }
  section.append(grid,paragraph('muted','Сравнение включает оценки ниже 55%. При 50% фаворита нет. У резервного отбора своя статистика.'));
  root.append(section);
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
 if(format.value==='all')historicalResearch(root);
 if(!rows.length)root.append(paragraph('muted','За этот период нет прогнозов с подтверждённым результатом.'));
 for(const {forecast,winner,total,totalSaved,totalActual,actualMaps,source} of rows){
  const pick=publishedWinnerPick(forecast);
  const label=pick?pick+' · '+pct(forecast.probability):'Без выбора победителя';
  const result=(pick?(winner===pick?'Попадание':'Промах')+' · ':'')+'Победитель '+winner;
  const row=compBox(shortTime(forecast.kickoff)+' · '+forecast.a+' — '+forecast.b,label,result);
  const reserve=cs2ReservePick(forecast);
  if(reserve)row.append(paragraph('muted','Резерв · '+modelFavorite(reserve)+' · '+(reserve.team===winner?'попадание':'промах')));
  if(totalSaved){
   const line=String(total.line).replace('.',',');
   row.append(paragraph('muted',(hasPublishedTotalPick(total)?'Предматчевый тотал':'Оценка без выбора тотала')+
    ' · ТБ '+line+' '+pct(total.over)+' / ТМ '+line+' '+pct(total.under)));
   if(typeof totalActual==='boolean')row.append(paragraph('muted','Итог · '+actualMaps+' карт · '+(totalActual?'ТБ ':'ТМ ')+line));
   else row.append(paragraph('muted','Итог по картам не подтверждён'));
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
 $('today-selection').hidden=isDaily;
 if(!isDaily){renderTodaySelection();return}
 const root=$('workspace-content');root.replaceChildren();renderDaily(root);
}
function updateFilters(){
 expanded=false;
 const rows=activeFixtures();
 if(!rows.some(row=>row.id===selected?.id))selected=rows[0]??null;
 renderFixtures();renderAnalysis();renderWorkspace();
}
for(const btn of document.querySelectorAll('[data-view]'))btn.onclick=()=>{
 filters.view=btn.dataset.view;
 const url=new URL(location.href);
 if(filters.view==='today')url.searchParams.delete('selection');
 url.hash=filters.view==='daily'?'daily':'';
 history.replaceState(null,'',url);
 updateFilters();
};
for(const key of ['period','tournament'])$(key).onchange=()=>{filters[key]=$(key).value;updateFilters()};
function setDiscipline(game){
 filters.game=game;
 syncTournaments();
}
$('prematch-confidence').onchange=()=>{
 filters.confidence=$('prematch-confidence').value;
 if(cs2OnlyMode())setDiscipline('cs2');
 updateFilters();
};
for(const btn of document.querySelectorAll('[data-game]'))btn.onclick=()=>{
 if(btn.dataset.game!=='cs2'&&cs2OnlyMode()){
  filters.confidence='recorded';
  $('prematch-confidence').value='recorded';
 }
 setDiscipline(btn.dataset.game);
 updateFilters();
};
load();
let pwaRegistration;
function refreshVisible(){
 if(document.visibilityState!=='visible')return;
 load();
 pwaRegistration?.update().catch(()=>{});
}
setInterval(refreshVisible,120000);
if('serviceWorker' in navigator){
 const workers=navigator.serviceWorker;
 let hadController=Boolean(workers.controller);
 workers.addEventListener('controllerchange',()=>{
  if(hadController)location.reload();
  hadController=true;
 });
 window.addEventListener('load',async()=>{
  try{pwaRegistration=await workers.register('./sw.js',{scope:'./',updateViaCache:'none'})}catch{}
 });
 document.addEventListener('visibilitychange',refreshVisible);
 window.addEventListener('online',refreshVisible);
}
