import {predict,market,score,walkForward,compareModels} from '/engine.mjs';
const $=x=>document.getElementById(x),key='bets-paper-v1',safe=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));let data={matches:[],records:[]},draft=null;
try{const x=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(x?.matches)&&Array.isArray(x?.records))data=x}catch{}
function persist(){localStorage.setItem(key,JSON.stringify(data));render()}
function render(){const s=score(data.records);$('total').textContent=data.matches.length;$('forecasts').textContent=s.count;$('brier').textContent=s.brier?.toFixed(3)??'—';$('recent').innerHTML=data.matches.slice(-4).reverse().map(m=>'<div class="item">'+safe(m.date.slice(0,10))+' · '+safe(m.a)+' — '+safe(m.b)+'<br><small>Победитель: '+safe(m.winner)+'</small></div>').join('');$('teams').innerHTML=[...new Set(data.matches.flatMap(m=>[m.a,m.b]))].sort().map(x=>'<option value="'+safe(x)+'">').join('');$('journal').innerHTML=data.records.slice().reverse().map(r=>'<div class="item"><b>'+safe(r.a)+' — '+safe(r.b)+'</b><br><small>'+safe(r.game)+' · '+safe(r.kickoff)+' · '+Math.round(r.probability*100)+'% на '+safe(r.pick)+'</small><br>'+(r.actual==null?'<div class="outcome"><button data-id="'+safe(r.id)+'" data-value="1" class="secondary">Победа</button><button data-id="'+safe(r.id)+'" data-value="0" class="secondary">Поражение</button></div>':(r.actual?'✅ Победа':'❌ Поражение'))+'</div>').join('')||'<p class="muted">Пока нет сохранённых прогнозов</p>';document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{const r=data.records.find(x=>x.id===b.dataset.id);if(!r||r.actual!=null)return;r.actual=Number(b.dataset.value);r.checkedAt=new Date().toISOString();persist()})}
$('day').value=new Date().toISOString().slice(0,10);$('kickoff').value=new Date(Date.now()+2*3600000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
$('load').onclick=async()=>{const url=$('source').value==='dota'?'/api/dota/history':'/api/cs/history?date='+encodeURIComponent($('day').value);$('status').textContent='Загрузка…';try{const r=await fetch(url),v=await r.json();if(!r.ok)throw Error(v.error||'HTTP '+r.status);if(!Array.isArray(v.matches))throw Error('Ответ не содержит матчи');const byId=new Map(data.matches.map(m=>[m.id,m]));for(const m of v.matches)if(m.id&&m.a&&m.b&&m.winner&&Number.isFinite(Date.parse(m.date)))byId.set(m.id,m);data.matches=[...byId.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));persist();$('status').textContent='Получено '+v.matches.length+' · '+v.source+' · в базе '+data.matches.length}catch(e){$('status').innerHTML='<span class="error">'+safe(e.message)+'</span>'}};
$('calculate').onclick=()=>{draft=null;$('save').disabled=true;try{const a=$('teamA').value.trim(),b=$('teamB').value.trim(),game=$('game').value,kickoff=new Date($('kickoff').value).toISOString();if(Date.parse(kickoff)<=Date.now())throw Error('Нельзя прогнозировать уже начавшийся матч');const p=predict(data.matches,game,a,b,kickoff);if(p.status!=='ok'){$('estimate').textContent='Недостаточно истории: '+a+' — '+p.na+', '+b+' — '+p.nb+'; минимум '+p.required+' матчей каждому.';return}const oa=$('oddsA').value,ob=$('oddsB').value;const line=market(p.pa,oa,ob);const pick=p.pa>=0.5?a:b,probability=Math.max(p.pa,p.pb),odds=pick===a?(oa?Number(oa):null):(ob?Number(ob):null);$('estimate').innerHTML='<b>'+safe(a)+': '+(p.pa*100).toFixed(1)+'% · '+safe(b)+': '+(p.pb*100).toFixed(1)+'%</b><br><small>Выбор: '+safe(pick)+' · справедливый коэффициент '+(1/probability).toFixed(2)+(odds?' · EV '+((probability*odds-1)*100).toFixed(1)+'%':' · нет котировки')+'</small>';draft={id:crypto.randomUUID(),a,b,game,kickoff,pick,probability,odds,model:p.model,evidence:p.evidence,components:p.components,createdAt:new Date().toISOString(),actual:null};$('save').disabled=false}catch(e){$('estimate').innerHTML='<span class="error">'+safe(e.message)+'</span>'}};
$('save').onclick=()=>{if(!draft||Date.parse(draft.kickoff)<=Date.now())return;data.records.push(draft);draft=null;$('save').disabled=true;persist()};
$('backup').onclick=()=>{const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bets-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
$('restore').onclick=()=>$('file').click();$('file').onchange=async e=>{try{const x=JSON.parse(await e.target.files[0].text());if(!Array.isArray(x.matches)||!Array.isArray(x.records))throw Error('Некорректный файл');if(!confirm('Заменить историю в браузере файлом?'))return;data={matches:x.matches,records:x.records};persist()}catch(e){alert(e.message)}};
render();
const runBacktest=()=>{const game=$('game').value;const result=walkForward(data.matches,game,{warmup:40});const root=$('backtest-output');if(!root)return;const cm=compareModels(data.matches,game,{warmup:40});root.textContent=result.tested?('Хронологически проверено '+result.tested+' матчей. Brier (меньше лучше): ансамбль '+cm.results.ensemble.brier.toFixed(3)+' · Elo '+cm.results.elo.brier.toFixed(3)+' · форма '+cm.results.form.brier.toFixed(3)+' · H2H '+cm.results.h2h.brier.toFixed(3)+'. Все оценки некалиброванные.'):'Недостаточно последовательной истории для бэктеста: '+result.total+' матчей в архиве.'};
$('backtest')?.addEventListener('click',runBacktest);
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}

async function loadArchive(){
 const button=$('archiveLoad');if(button)button.disabled=true;
 const root=$('archiveStatus');if(root)root.textContent='Читаю архив локального сервера…';
 try{
  const game=$('source').value==='cs'?'cs2':'dota';
  const response=await fetch('/api/archive?game='+game+'&limit=1500',{cache:'no-store'});
  const result=await response.json();
  if(!response.ok||!Array.isArray(result.matches))throw Error(result.error||'Архив недоступен');
  const byId=new Map(data.matches.filter(m=>m?.id).map(m=>[m.id,m]));
  for(const m of result.matches)if(m&&m.id&&m.a&&m.b&&m.winner&&Number.isFinite(Date.parse(m.date)))byId.set(m.id,m);
  data.matches=[...byId.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  persist();
  if(root)root.textContent='Загружено '+result.matches.length+' матчей '+game+' из '+result.total+' в серверном архиве. Обновление: '+(result.updatedAt||'ещё нет');
 }catch(e){if(root)root.textContent='Ошибка архива: '+e.message}
 finally{if(button)button.disabled=false}
}
$('archiveLoad')?.addEventListener('click',loadArchive);
$('serverBacktest')?.addEventListener('click',async()=>{
 const root=$('serverBacktest-output'),button=$('serverBacktest'),game=$('game').value;
 button.disabled=true;root.textContent='Быстрый хронологический расчёт по архиву…';
 try{
  const response=await fetch('/api/evaluate?game='+encodeURIComponent(game)+'&warmup=100',{cache:'no-store'});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Отчёт недоступен');
  if(!result.tested){root.textContent='В серверном архиве '+result.total+' матчей '+game+', но недостаточно истории для честной проверки.';return}
  const entries=Object.entries(result.results);
  root.textContent='Проверено '+result.tested+' из '+result.total+' матчей ('+(100*result.coverage).toFixed(1)+'% охват). Brier: '+entries.map(([name,value])=>name+' '+(value.brier?.toFixed(4)??'—')).join(' · ')+'. Модели некалиброванные; это не заявленная точность будущих прогнозов.';
 }catch(e){root.textContent='Ошибка проверки: '+e.message}finally{button.disabled=false}
});
fetch('/api/archive/status',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('not ready'))).then(j=>{
 const root=$('archiveStatus');if(root&&j.total>0)root.textContent='На локальном сервере '+j.total+' завершённых матчей (CS2: '+j.cs2+', Dota 2: '+j.dota+').';
}).catch(()=>{});
