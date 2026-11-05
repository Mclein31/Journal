import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';

async function worker({ entries, fail = false, saved = new Map() }) {
  const listeners = new Map(); const routes = []; let precache;
  let active = 0, peak = 0, fetched = 0;
  const caches = {
    async open(name) {
      if (!saved.has(name)) saved.set(name, new Map()); const data = saved.get(name);
      return { async match(request) { return data.get(typeof request === 'string' ? request : request.url)?.clone(); }, async put(request, response) { data.set(typeof request === 'string' ? request : request.url, response); } };
    },
    async keys() { return [...saved.keys()]; }, async delete(name) { return saved.delete(name); },
  };
  const context = vm.createContext({
    crypto, TextEncoder, Uint8Array, URL, caches,
    self: { __WB_MANIFEST: entries, location: { href:'https://dear-days.test/sw.js', origin:'https://dear-days.test' }, skipWaiting() {}, addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); } },
    async fetch() { fetched++; active++; peak=Math.max(peak,active); await new Promise(resolve=>setImmediate(resolve)); active--; return new Response('font',{status:fail?503:200}); },
  });
  const stub = (values) => new vm.SyntheticModule(Object.keys(values), function(){ for(const [name,value] of Object.entries(values)) this.setExport(name,value); }, {context});
  const modules = {
    'workbox-core':stub({ clientsClaim() {} }),
    'workbox-precaching':stub({ cleanupOutdatedCaches() {}, createHandlerBoundToURL:()=>()=>{}, precacheAndRoute:entries=>{precache=entries;} }),
    'workbox-routing':stub({ NavigationRoute:class {constructor(handler,options){this.handler=handler;this.options=options;}}, registerRoute:(...route)=>routes.push(route) }),
  };
  const source=stripTypeScriptTypes(await readFile('src/sw.ts','utf8'));
  const module=new vm.SourceTextModule(source,{context});await module.link(name=>modules[name]);await module.evaluate();
  async function event(name){const pending=[];for(const callback of listeners.get(name)??[])callback({waitUntil:p=>pending.push(p)});await Promise.all(pending);}
  return {event,routes,saved,get precache(){return precache;},get peak(){return peak;},get fetched(){return fetched;}};
}

test('font installation uses a bounded parallel queue, caches each file, and reuses its versioned cache',async()=>{
  const entries=[{url:'index.html',revision:'shell'},...Array.from({length:60},(_,i)=>({url:`fonts/family/${i}.woff2`,revision:String(i)}))];
  const w=await worker({entries});await w.event('install');
  assert.equal(w.fetched,60);assert.ok(w.peak>1&&w.peak<=24);
  assert.equal(w.precache.length,1);assert.equal(w.precache[0].url,'index.html');
  const route=w.routes.find(([match])=>typeof match==='function');
  const request=new Request('https://dear-days.test/fonts/family/0.woff2');
  assert.equal(route[0]({url:new URL(request.url)}),true);
  assert.equal(await(await route[1]({request})).text(),'font');
  await w.event('install');assert.equal(w.fetched,60,'cached font revisions need no repeated downloads');
});

test('failed font downloads reject installation instead of claiming offline readiness',async()=>{
  const w=await worker({entries:[{url:'fonts/missing.woff2',revision:'a'}],fail:true});
  await assert.rejects(w.event('install'),/Could not cache/);
});

test('font upgrades remove only obsolete font caches and API navigations bypass the app shell',async()=>{
  const saved=new Map([['dear-days-fonts-old',new Map()],['google-fonts-css',new Map()],['unrelated-cache',new Map()]]);
  const w=await worker({entries:[{url:'fonts/local.woff2',revision:'new'}],saved});await w.event('install');await w.event('activate');
  assert.equal(saved.has('dear-days-fonts-old'),false);assert.equal(saved.has('google-fonts-css'),false);assert.equal(saved.has('unrelated-cache'),true);
  const navigation=w.routes.find(([route])=>route?.options)?.[0];assert.ok(navigation.options.denylist.some(pattern=>pattern.test('/api/auth/verify-email')));
});
