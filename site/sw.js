const CACHE = 'bets-pages-__SHELL_VERSION__';
const DATA = new Set(['snapshot.json','report.json','fixtures.json','map-insights.json','journal.json','release.json','brief.json','research.json','pari-screenshots.json']);
const SHELL = new Set(['','index.html','main.js','brief.mjs','daily.mjs','analysis.mjs','settlement.mjs','engine.mjs','identity.mjs',
  'live.mjs','calibration.mjs','evidence-time.mjs','roster-factor.mjs','manifest.webmanifest','icon.svg']);

self.addEventListener('install', event=>{
  const scope=self.registration.scope;
  const assets=[...SHELL].filter(name=>name!=='index.html').concat([...DATA])
    .map(name=>new Request(new URL(name,scope),{cache:'reload'}));
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(assets)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('bets-pages-')&&key!==CACHE)
    .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event=>{
  const url=new URL(event.request.url);
  const scope=self.registration.scope;
  if(event.request.method!=='GET'||!url.href.startsWith(scope))return;
  const path=url.pathname.slice(new URL(scope).pathname.length);
  const shell=SHELL.has(path);
  if(!shell&&!DATA.has(path))return;
  const key=new URL(path==='index.html'?'':path,scope).href;
  event.respondWith((async ()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request,shell?{cache:'no-cache'}:undefined);
      if(response.ok)await cache.put(key,response.clone());
      return response;
    }catch{
      return await cache.match(key)??Response.error();
    }
  })());
});
