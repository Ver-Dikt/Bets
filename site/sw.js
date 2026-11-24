const CACHE = 'bets-pages-v6';
const DATA = new Set(['snapshot.json','report.json','fixtures.json','map-insights.json','journal.json','release.json','brief.json']);
const ASSETS = ['./','./main.js','./brief.mjs','./analysis.mjs','./settlement.mjs','./engine.mjs','./identity.mjs',
  './live.mjs','./calibration.mjs','./evidence-time.mjs','./roster-factor.mjs','./manifest.webmanifest','./icon.svg',...[...DATA].map(name=>'./'+name)];

self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('bets-pages-')&&key!==CACHE)
    .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||!url.href.startsWith(self.registration.scope))return;
  if(DATA.has(url.pathname.split('/').at(-1)))url.search='';
  event.respondWith((async ()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request);
      if(response.ok)await cache.put(url.href,response.clone());
      return response;
    }catch{
      return await cache.match(url.href)??Response.error();
    }
  })());
});
