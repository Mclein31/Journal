import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});
function server() {
  const books = new Map();
  const assets = new Map();
  let offline = false;
  return { books, assets, setOffline(value) { offline=value; }, async fetch(url, init={}) {
    if (offline) throw new TypeError('offline');
    const path = new URL(url,'https://dear-days.test').pathname.replace(/^\/api/,'');
    if (path==='/books') return json({books:[...books.entries()].map(([id,row])=>({id,title:row.doc.book.title,version:row.version}))});
    if (path.startsWith('/books/')) return books.has(path.slice(7)) ? json(books.get(path.slice(7))) : json({error:'missing'},404);
    if (path==='/assets' && init.method!=='POST') return json({assets:[...assets.values()]});
    if (path==='/assets' && init.method==='POST') {
      const meta=JSON.parse(init.body); const old=assets.get(meta.id);
      const row={meta,state:old?.state??'pending'}; assets.set(meta.id,row); return json({state:row.state});
    }
    if (path.startsWith('/assets/')&&path.endsWith('/content')) {
      const id=path.split('/')[2]; const row=assets.get(id); assert.ok(row);
      if (init.method==='PUT') { row.state='ready'; row.blob=init.body; return json({ok:true}); }
      return new Response(row.blob);
    }
    if (path==='/sync') {
      const input=JSON.parse(init.body); const id=input.doc.book.id; const current=books.get(id);
      if(current?.mutation_id===input.mutationId) return json({version:current.version});
      if((current?.version??0)!==input.baseVersion) return json({error:'conflict'},409);
      const row={doc:input.doc,bookmark:input.bookmark,version:(current?.version??0)+1,mutation_id:input.mutationId}; books.set(id,row); return json({version:row.version});
    }
    throw new Error('Unexpected mock route '+path);
  }};
}
async function owned(h, id) {
  const local=await h.get('sync/local'); local.setStorageOwner(id);
  (await h.get('account/api')).useAccount(id);
  return local;
}

test('account storage and recovery keys are isolated, with guest compatibility retained',async()=>{
  const id=crypto.randomUUID();
  const a=await appHarness(); const la=await owned(a,id);
  await a.store.flush(); await la.setMeta('activeBookId',a.store.getDoc().book.id);
  await (await a.get('book/bookmark')).saveDraft(a.store.getDoc().elements[0].id,'Private words from A');
  assert.ok(a.storage.has(`mlw:text-drafts:user:${id}`));
  assert.equal(a.storage.has('mlw:text-drafts'),false);
  const b=await appHarness(); const lb=await owned(b,crypto.randomUUID());
  assert.equal(await lb.loadBook(a.store.getDoc().book.id),null);
  assert.equal(await lb.getMeta('drafts'),undefined);
  const again=await appHarness(); const same=await owned(again,id);
  assert.ok(await same.loadBook(a.store.getDoc().book.id));
});

test('cloud hashes survive JSONB key ordering and ignore local save revisions',async()=>{
  const h=await appHarness(); const cloud=await h.get('sync/cloud');
  const doc=h.store.getDoc(); const copy=JSON.parse(JSON.stringify(doc));
  copy.book={...Object.fromEntries(Object.entries(copy.book).reverse()),revision:999};
  assert.equal(await cloud.snapshotHash(doc,null),await cloud.snapshotHash(copy,null));
});

test('keeping a separate journal remaps every row and preserves the source journal and bookmark',async()=>{
  const h=await appHarness(); const local=await owned(h,crypto.randomUUID());
  await h.store.flush(); const source=h.store.getDoc(); await local.setMeta('activeBookId',source.book.id);
  await (await h.get('book/bookmark')).setBookmark(source.book.id,source.pages[0].id);
  await (await h.get('sync/cloud')).keepAsSeparateJournal(source);
  const id=await local.getMeta('activeBookId'); const copy=await local.loadBook(id); const old=await local.loadBook(source.book.id);
  assert.notEqual(id,source.book.id); assert.equal(old.sections.length,source.sections.length); assert.equal(old.pages.length,source.pages.length);
  assert.equal(old.elements.length,source.elements.length); assert.equal(copy.pages.length,source.pages.length);
  assert.ok(!copy.pages.some(p=>source.pages.some(old=>old.id===p.id)));
  const bookmark=await local.getMeta(`bookmark:${id}`);
  const firstSection=copy.sections.find(s=>s.position===source.sections[0].position);
  assert.equal(bookmark.pageId,copy.pages.find(p=>p.sectionId===firstSection.id&&p.position===source.pages[0].position).id);
});

test('offline edits survive reload, retry safely, and remote conflicts block unsafe switching',async()=>{
  const remote=server(); const owner=crypto.randomUUID();
  const h=await appHarness({fetchImpl:remote.fetch}); const local=await owned(h,owner); const cloud=await h.get('sync/cloud');
  await h.store.flush(); const id=h.store.getDoc().book.id; await local.setMeta('activeBookId',id); await cloud.syncNow();
  assert.equal(remote.books.get(id).version,1);
  h.store.update('offline words',d=>{d.elements[0].data.text.content='Kept through offline reload';}); await h.store.flush();
  remote.setOffline(true); await cloud.syncNow();
  const again=await appHarness({fetchImpl:remote.fetch}); const againLocal=await owned(again,owner);
  const doc=await againLocal.loadBook(id); again.store.initStore(doc);
  const resumed=await again.get('sync/cloud'); await resumed.prepareCloud();
  assert.equal((await againLocal.loadBook(id)).elements[0].data.text.content,'Kept through offline reload');
  remote.setOffline(false); await resumed.syncNow();
  assert.equal(remote.books.get(id).doc.elements[0].data.text.content,'Kept through offline reload');
  assert.equal(remote.books.get(id).version,2);
  again.store.update('another offline edit',d=>{d.elements[0].data.text.content='Local conflict kept';}); await again.store.flush();
  remote.books.get(id).version=3; remote.books.get(id).doc.elements[0].data.text.content='Other device';
  await resumed.syncNow();
  assert.equal((await againLocal.loadBook(id)).elements[0].data.text.content,'Local conflict kept');
  await assert.rejects(resumed.requireSyncedJournal(),/device-only changes/);
  assert.equal(remote.books.get(id).doc.elements[0].data.text.content,'Other device');
});

test('tray-only assets, archive/restore and bookmark-only edits synchronize independently',async()=>{
  const remote=server(); const h=await appHarness({fetchImpl:remote.fetch}); const local=await owned(h,crypto.randomUUID()); const cloud=await h.get('sync/cloud');
  await h.store.flush(); const doc=h.store.getDoc(); await local.setMeta('activeBookId',doc.book.id); await cloud.syncNow();
  const meta={id:crypto.randomUUID(),kind:'sticker',mime:'image/png',w:1,h:1,bytes:3,createdAt:Date.now()};
  await local.putAsset(meta,new Blob(['png'],{type:'image/png'})); await cloud.syncNow(); assert.equal(remote.assets.get(meta.id).state,'ready');
  await local.setAssetArchived(meta.id,true); await cloud.syncNow(); assert.equal(remote.assets.get(meta.id).meta.archived,true);
  await local.setAssetArchived(meta.id,false); await cloud.syncNow(); assert.equal(remote.assets.get(meta.id).meta.archived,false);
  await (await h.get('book/bookmark')).setBookmark(doc.book.id,doc.pages[1].id); await cloud.syncNow();
  assert.equal(remote.books.get(doc.book.id).bookmark.pageId,doc.pages[1].id);
});

test('leaving an account-only screen never opens guest storage or clears existing recovery',async()=>{
  const previous=JSON.stringify({old:'Unfinished guest draft'});
  const h=await appHarness({stored:{'mlw:text-drafts':previous},initializeStore:false});
  h.fire(h.events,'pagehide'); await h.settle();
  assert.equal(h.storage.get('mlw:text-drafts'),previous);
  const local=await h.get('sync/local'); assert.doesNotThrow(()=>local.setStorageOwner(crypto.randomUUID()));
});

test('login has accessible fields, autofill and password visibility without blocking paste',async()=>{
  const h=await appHarness(); const ui=await h.get('account/ui'); ui.mountLogin(h.root);
  assert.equal(h.root.querySelector('[name="email"]').getAttribute('autocomplete'),'email');
  const password=h.root.querySelector('[name="password"]'); assert.equal(password.getAttribute('autocomplete'),'current-password');
  h.root.querySelector('.password-toggle').click(); assert.equal(password.type,'text');
  h.root.querySelector('[data-mode="signup"]').click();
  assert.ok(h.root.querySelector('[name="name"]')); assert.match(h.root.querySelector('.auth-privacy').textContent,/private/);
});
