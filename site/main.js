import {analyzeFixture} from './analysis.mjs';
import {score} from './engine.mjs';
const $=id=>document.getElementById(id);
const el=(tag,cls='',text=null)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==null)n.textContent=String(text);return n};
const dateFmt=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const shortTime=x=>Number.isFinite(Date.parse(x))?dateFmt.format(new Date(x)):'Время неизвестно';
const dateLong=x=>Number.isFinite(Date.parse(x))?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(x)):'Время неизвестно';
const pct=x=>typeof x==='number'&&Number.isFinite(x)?(x*100).toFixed(1)+'%':'—';
const asNum=x=>x==null?'—':Number(x).toFixed(1);
let matches=[],fixtures=[],report=null,mapInsights=null,filters={game:'all',archive:'cs2'},selected=null,expanded=false,loading=false,fixtureStatus=null;
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
 const source=fixtureStatus?.sources?.[f.game];
 if(!source?.ok||!Number.isFinite(Date.parse(source.checkedAt)))return false;
 return Date.now()-Date.parse(source.checkedAt)<40*60000;
}
function activeFixtures(){
 const now=Date.now();
 return fixtures.filter(f=>f.game===filters.game||filters.game==='all')
   .filter(f=>f.status==='live'?liveFresh(f):Number.isFinite(Date.parse(f.date))&&Date.parse(f.date)>now-3*60000)
   .sort((a,b)=>(a.status==='live'?-1:0)-(b.status==='live'?-1:0)||Date.parse(a.date)-Date.parse(b.date));
}
function badge(text,cls=''){return el('span','tag'+(cls?' '+cls:''),text)}
function renderSources(){
 $('cs2-source').textContent=sourceText('cs2');
 $('dota-source').textContent=sourceText('dota');
 const root=$('source-warning');root.replaceChildren();
 if(!fixtureStatus){root.append(el('div','source-warning','Нет опубликованного снимка расписания. Придумывать матчи нельзя.'));return}
 const broken=Object.entries(fixtureStatus.sources||{}).filter(([game,v])=>!v?.ok);
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
  foot.append(el('span','',label.length>48?label.slice(0,45)+'…':label),el('span','',f.format||'Анализ'));
  button.append(meta,name,foot);
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
function explainMissing(root,r){
 const missing=el('div','selection');
 missing.append(el('b','','Прогноз не опубликован'),paragraph('','Недостаточно подтверждённой истории, поэтому результат не рассчитывается.'));
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
          compBox('Личные встречи',c.h2h.count,c.h2h.winsA+' : '+c.h2h.winsB+' в архиве'),
          compBox('История дисциплины',c.dataCount,'До начала встречи'));
 root.append(g);
}
function drawMapInsight(root,f){
 if(f.game!=='cs2')return;
 const record=mapInsights?.insights?.[f.id];
 root.append(el('h3','analysis-head','Статистика карт · отдельная модель'));
 if(!record){root.append(paragraph('muted','Для этого матча пока нет подтверждённой карты результатов. Никаких фиктивных veto или процентов.'));return}
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
 if(Number.isFinite(record.seriesProbabilityA))root.append(el('div','help','Сценарная вероятность серии по карте-модели: '+pct(record.seriesProbabilityA)+' на '+f.a+'. Это отдельная гипотеза, она не входит в общий ансамбль до независимой проверки.'));
 root.append(paragraph('warn',record.caution||'Расчёт карт исследовательский.'));
}
function drawOdds(root,analysis,f){
 root.append(el('h3','analysis-head','Рыночная линия · ввод вручную'));
 root.append(paragraph('muted','Букмекерские коэффициенты не загружаются автоматически. Впиши котировки на один и тот же исход и рынок, чтобы оценить EV; без них нельзя подтвердить преимущество.'));
 const grid=el('div','odds');
 const holderA=el('div'),holderB=el('div');
 const la=el('label','','Коэффициент на '+f.a),lb=el('label','','Коэффициент на '+f.b);
 const oa=el('input'),ob=el('input');
 oa.type=ob.type='number';oa.min=ob.min='1.01';oa.step=ob.step='0.01';oa.placeholder=ob.placeholder='Напр. 1.90';
 holderA.append(la,oa);holderB.append(lb,ob);grid.append(holderA,holderB);root.append(grid);
 const info=el('div','help','Ожидание котировок. EV вычисляется только для введённой цены, а не по живому рынку.');
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
 let r;try{r=analyzeFixture(f,matches)}catch(e){root.append(errorBlock('Ошибка анализа',e.message));return}
 if(r.status==='live'){root.append(el('div','source-warning','Это периодический снимок, не потоковый Live. Предматчевый прогноз после начала игры не выдаётся.'));root.append(compBox('Источник',f.source));return}
 if(r.status!=='ok'){explainMissing(root,r);root.append(el('div','help','Источник встречи: '+f.source+'. Последняя фиксация расписания: '+shortTime(f.fetchedAt)+'.'));return}
 const a=r.result.pa,b=r.result.pb;
 const labels=el('div','prob-labels');
 labels.append(el('div','',pct(a)),el('div','',pct(b)));
 const bar=el('div','prob');bar.setAttribute('role','img');bar.setAttribute('aria-label',pct(a)+' '+f.a+', '+pct(b)+' '+f.b);
 const ba=el('div','prob-a'),bb=el('div','prob-b');ba.style.width=(a*100)+'%';bb.style.width=(b*100)+'%';bar.append(ba,bb);
 root.append(labels,bar);
 const verdict=el('div','selection');
 verdict.append(el('small','','МОДЕЛЬНЫЙ ФАВОРИТ'),el('b','',r.picked+' · '+pct(Math.max(a,b))),paragraph('',r.note));
 root.append(verdict);
 drawFactors(root,r);
 drawMapInsight(root,f);
 root.append(el('div','help','Почему этот выбор: модель суммирует три оценки с весами 65% / 25% / 10%. Результат исторический и некалиброванный; рейтинг не знает о заменах игроков, картах и актуальном патче.'));
 drawOdds(root,r,f);
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
function renderJournal(){
 const root=$('paper-list');root.replaceChildren();const s=score(paper);
 $('paper-summary').textContent=paper.length?('Всего '+paper.length+' · подтверждённых исходов '+s.resolved+(s.brier==null?'':' · Brier '+s.brier.toFixed(3))):'Нет сохранённых прогнозов';
 for(const p of paper.slice(-3).reverse()){
  const div=el('div','factor');div.append(el('strong','',p.a+' — '+p.b),
   paragraph('muted','Выбор: '+p.pick+' · '+pct(p.probability)+' · '+shortTime(p.kickoff)),
   paragraph('muted',p.actual===null?'Исход ещё не сверялся':'Результат отмечен вручную'));root.append(div);
 }
}
async function load(){
 if(loading)return;loading=true;
 const read=async(name)=>{const r=await fetch('./'+name+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(name+' HTTP '+r.status);return r.json()};
 const [matchesResult,fixtureResult,reportResult,mapResult]=await Promise.allSettled([read('snapshot.json'),read('fixtures.json'),read('report.json'),read('map-insights.json')]);
 if(matchesResult.status==='fulfilled'&&matchesResult.value?.schemaVersion===1&&Array.isArray(matchesResult.value.matches))
  matches=matchesResult.value.matches.filter(m=>m&&m.id&&m.a&&m.b&&(m.winner===m.a||m.winner===m.b)&&Number.isFinite(Date.parse(m.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 if(fixtureResult.status==='fulfilled'&&fixtureResult.value?.schemaVersion===1&&Array.isArray(fixtureResult.value.fixtures)){
  fixtureStatus=fixtureResult.value;fixtures=fixtureStatus.fixtures.filter(f=>f&&f.id&&f.a&&f.b&&Number.isFinite(Date.parse(f.date))&&['cs2','dota'].includes(f.game));
 }else{fixtureStatus=null;fixtures=[]}
 if(reportResult.status==='fulfilled'&&reportResult.value?.games)report=reportResult.value;
 if(mapResult.status==='fulfilled'&&mapResult.value?.schemaVersion===1)mapInsights=mapResult.value;
 renderSources();renderMetrics();renderFixtures();renderArchive();renderQuality();
 const available=activeFixtures();
 if(!selected&&available.length)selected=available[0];
 if(selected&&!fixtures.find(f=>f.id===selected.id))selected=available[0]||null;
 if(selected){const fresh=fixtures.find(f=>f.id===selected.id);if(fresh)selected=fresh}
 renderAnalysis();loading=false;
}
document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>{filters.game=b.dataset.game;expanded=false;renderFixtures()}));
document.querySelectorAll('[data-history]').forEach(b=>b.addEventListener('click',()=>{filters.archive=b.dataset.history;renderArchive()}));
$('show-more').onclick=()=>{expanded=!expanded;renderFixtures()};
$('paper-export').onclick=()=>{const blob=new Blob([JSON.stringify(paper,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='bets-paper.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
load();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
