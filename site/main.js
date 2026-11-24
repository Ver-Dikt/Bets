import {predict,market,score} from './engine.mjs';
import {canonicalizeMatches,resolveTeamName} from './identity.mjs';
const $=id=>document.getElementById(id);
let matches=[],report=null,game='cs2',draft=null;
const key='bets-public-paper-v1';
let paper=[];try{const val=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(val))paper=val}catch{}
const fmt=x=>new Intl.DateTimeFormat('ru',{year:'numeric',month:'short',day:'numeric'}).format(new Date(x));
const save=()=>{localStorage.setItem(key,JSON.stringify(paper));renderJournal()};
function renderJournal(){const s=score(paper);$('journal').textContent=paper.length?('Прогнозов: '+s.count+' · отмеченных результатов: '+s.resolved+(s.brier==null?'':' · Brier: '+s.brier.toFixed(3))):'Пока пусто';}
function render(){
 $('total').textContent=matches.length.toLocaleString('ru');$('cs-count').textContent=matches.filter(m=>m.discipline==='cs2').length.toLocaleString('ru');$('dota-count').textContent=matches.filter(m=>m.discipline==='dota').length.toLocaleString('ru');
 const list=matches.filter(m=>m.discipline===game);$('matchinfo').textContent='Последние '+Math.min(list.length,30)+' из '+list.length+' завершённых '+(game==='cs2'?'серий CS2':'карт Dota 2')+' · не Live';
 const root=$('matches');root.replaceChildren();
 for(const m of list.slice(-30).reverse()){const box=document.createElement('div');box.className='match';const meta=document.createElement('div');meta.className='meta';meta.textContent=fmt(m.date)+' · '+(m.tournament||m.source);const title=document.createElement('div');title.className='match-title';title.textContent=m.a+' — '+m.b;const win=document.createElement('div');win.className='meta';win.textContent='Победитель: '+m.winner;box.append(meta,title,win);root.append(box)}
 if(!list.length)root.textContent='Нет подтверждённых матчей для этой игры';
 const recentNames=[...new Set(list.slice(-500).flatMap(m=>[m.a,m.b]))].sort((a,b)=>a.localeCompare(b));
 for(const id of ['a','b']){const el=$(id),previous=el.value;el.replaceChildren();for(const name of recentNames){const o=document.createElement('option');o.value=o.textContent=name;el.append(o)}if(recentNames.includes(previous))el.value=previous}
 if(recentNames.length>1&&$('a').value===$('b').value)$('b').selectedIndex=1;
 const q=report?.games?.[game];const rootQ=$('quality');
 if(q){const models=q.quality||{};rootQ.replaceChildren();const sum=document.createElement('p');sum.textContent='Проверено исторически: '+q.tested+' из '+q.rows+' матчей ('+(q.coverage*100).toFixed(1)+'%).';rootQ.append(sum);for(const name of ['ensemble','elo','form','h2h']){const p=document.createElement('p');const v=models[name];p.textContent=name+': Brier '+(v?.brier==null?'недостаточно':v.brier.toFixed(4));rootQ.append(p)}const caveat=document.createElement('p');caveat.className='warn';caveat.textContent='Результаты исследовательские. Модели не калиброваны; доказанного преимущества нет.';rootQ.append(caveat)}else rootQ.textContent='Отчёт ещё не опубликован';
}
async function load(){
 $('state').textContent='Загрузка снимка из GitHub Pages…';
 try{const response=await fetch('./snapshot.json?'+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
 const x=await response.json();if(x.schemaVersion!==1||!Array.isArray(x.matches))throw Error('Неверный формат');matches=x.matches.filter(m=>m.id&&m.a&&m.b&&(m.winner===m.a||m.winner===m.b)&&Number.isFinite(Date.parse(m.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const rq=await fetch('./report.json?'+Date.now(),{cache:'no-store'});report=rq.ok?await rq.json():null;
 $('state').textContent='Снимок реальных завершённых матчей · архив обновлён: '+(x.updatedAt?fmt(x.updatedAt):'неизвестно')+'. Это статическая публикация, не Live.';
 render();
 }catch(e){$('state').textContent='Не удалось загрузить данные: '+e.message;render()}
}
$('cs').onclick=()=>{game='cs2';$('cs').className='selected';$('dota').className='';$('cs').setAttribute('aria-pressed','true');$('dota').setAttribute('aria-pressed','false');render()};
$('dota').onclick=()=>{game='dota';$('dota').className='selected';$('cs').className='';$('cs').setAttribute('aria-pressed','false');$('dota').setAttribute('aria-pressed','true');render()};
$('refresh').onclick=load;
const now=new Date(Date.now()+24*3600000);$('kickoff').value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
$('predict').onclick=()=>{
 draft=null;$('save').disabled=true;
 try{
  const a=$('a').value,b=$('b').value,kickoff=new Date($('kickoff').value).toISOString();
  if(Date.parse(kickoff)<=Date.now())throw Error('Прогноз только до начала матча');
  if(!a||!b||a===b)throw Error('Выбери две разные команды');
  const normalized=canonicalizeMatches(matches),teamA=resolveTeamName(normalized,game,a),teamB=resolveTeamName(normalized,game,b);
  const p=predict(normalized,game,teamA,teamB,kickoff);
  if(p.status!=='ok')throw Error('Недостаточно данных: '+a+' — '+p.na+', '+b+' — '+p.nb+'; минимум 10 матчей каждому.');
  const oa=$('oa').value,ob=$('ob').value,prices=market(p.pa,oa,ob),pick=p.pa>=.5?a:b,probability=Math.max(p.pa,p.pb),odds=pick===a?(oa?Number(oa):null):(ob?Number(ob):null);
  $('out').textContent=a+': '+(p.pa*100).toFixed(1)+'% · '+b+': '+(p.pb*100).toFixed(1)+'% · справедливый коэффициент: '+(1/probability).toFixed(2)+(odds?' · EV: '+((probability*odds-1)*100).toFixed(1)+'%':'')+'. Исследовательская оценка, не рекомендация ставки.';
  draft={id:crypto.randomUUID(),game,a,b,pick,probability,odds,kickoff,createdAt:new Date().toISOString(),model:p.model,actual:null};
  $('save').disabled=false;
 }catch(e){$('out').textContent='Ошибка: '+e.message}
};
$('save').onclick=()=>{if(!draft||Date.parse(draft.kickoff)<=Date.now())return;paper.push(draft);draft=null;$('save').disabled=true;save()};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(paper,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bets-paper.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
renderJournal();load();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
