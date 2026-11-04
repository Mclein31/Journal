import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

test('font picker applies Korean category and specific fonts to the selected text box', async () => {
  const h = await appHarness();
  const id = h.store.getDoc().elements[0].id;
  const { openFontMenu } = await h.get('fonts/FontMenu');
  openFontMenu(id, h.document.createElement('button'));
  [...h.document.querySelectorAll('.fo-cats button')].find(b => b.textContent.includes('Korean')).click();
  assert.equal(h.store.getDoc().elements[0].data.text.font, 'gaegu');
  h.document.querySelectorAll('.fo-item')[1].click();
  assert.equal(h.store.getDoc().elements[0].data.text.font, 'nanumpen');
  assert.equal(h.document.querySelector('.fo-item[aria-selected="true"] .fo-name').textContent, '나눔손글씨 펜');
});

test('uploaded stickers can be removed and restored without deleting their stored image', async () => {
  const h = await appHarness();
  const local = await h.get('sync/local');
  const id = `sticker-${Date.now()}`;
  await local.putAsset({ id, kind:'sticker', mime:'image/png', w:10, h:10, bytes:3, createdAt:Date.now() }, new Blob(['png']));
  const { openStickerTray } = await h.get('stickers/StickerTray');
  openStickerTray(() => {});
  await h.settle();
  [...h.document.querySelectorAll('.st-cats button')].find(b => b.textContent === 'Your stickers').click();
  const remove = h.document.querySelector('[aria-label="Remove uploaded sticker"]');
  assert.ok(remove, 'an uploaded sticker needs an explicit removal control');
  remove.click();
  await h.settle();
  assert.equal((await local.listAssets('sticker')).some(a=>a.id===id),false);
  assert.ok(await local.getAssetBlob(id), 'placed copies still need the image');
  h.document.querySelector('[data-st-act="removed"]').click();
  h.document.querySelector('[aria-label="Restore uploaded sticker"]').click();
  await h.settle();
  assert.ok((await local.listAssets('sticker')).some(a=>a.id===id));
});

async function openBook(h) {
  const { mountBook } = await h.get('book/Book');
  mountBook(h.root,h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  assert.equal(h.root.querySelector('.desk').dataset.closed,'false');
}
function tap(h,node) {
  h.fire(node,'pointerdown',{pointerId:1,clientX:200,clientY:250,timeStamp:100});
  h.fire(node,'pointerup',{pointerId:1,clientX:200,clientY:250,timeStamp:150});
}

test('cover, next/previous, section tabs, new pages and bookmark navigation work together', async () => {
  const h = await appHarness();
  await openBook(h);
  const first = h.root.querySelector('.nav-label').textContent;
  h.root.querySelector('[data-act="next"]').click(); await h.settle();
  assert.notEqual(h.root.querySelector('.nav-label').textContent,first);
  h.root.querySelector('[data-act="prev"]').click(); await h.settle();
  assert.equal(h.root.querySelector('.nav-label').textContent,first);
  h.root.querySelector('[aria-label="Go to Memories"]').click(); await h.settle();
  assert.match(h.root.querySelector('.nav-label').textContent,/Memories/);
  const count=h.store.getDoc().pages.length;
  h.root.querySelector('[data-act="add-page"]').click(); await h.settle();
  assert.equal(h.store.getDoc().pages.length,count+2);
  h.root.querySelector('[data-act="bookmark"]').click(); await h.settle();
  const bookmarked=h.root.querySelector('.nav-label').textContent;
  assert.equal(h.root.querySelector('[data-act="bookmark"]').getAttribute('aria-pressed'),'true');
  h.root.querySelector('[aria-label="Go to Journal"]').click(); await h.settle();
  h.root.querySelector('.ribbon').click(); await h.settle();
  assert.equal(h.root.querySelector('.nav-label').textContent,bookmarked);
  h.root.querySelector('[data-act="close"]').click(); await h.settle();
  assert.equal(h.root.querySelector('.desk').dataset.closed,'true');
});

test('new empty text survives opening font settings, then edits, duplicates and deletes undoably', async () => {
  const h=await appHarness(); await openBook(h);
  h.root.querySelector('[data-act="add-text"]').click();
  const id=h.store.getDoc().elements.at(-1).id;
  h.root.querySelector('[data-cmd="font"]').click();
  assert.ok(h.store.getDoc().elements.some(e=>e.id===id),'opening font settings must not delete empty text');
  [...h.document.querySelectorAll('.fo-cats button')].find(b=>b.textContent.includes('Korean')).click();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===id).data.text.font,'gaegu');
  assert.match(h.root.querySelector(`[data-el-id="${id}"]`).style.fontFamily,/Gaegu/);
  h.document.querySelector('[data-picker-close]').click();
  const textNode=h.root.querySelector(`[data-el-id="${id}"]`);
  tap(h,textNode);
  const body=textNode.querySelector('.el-text-body'); body.textContent='오늘 하루 · little memories';
  h.fire(body,'input'); body.blur(); await h.settle();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===id).data.text.content,'오늘 하루 · little memories');
  h.root.querySelector('[data-cmd="dup"]').click();
  const copyId=h.store.getDoc().elements.at(-1).id;
  assert.notEqual(copyId,id);
  assert.equal(h.root.querySelector('.el.is-selected').dataset.elId,copyId);
  h.root.querySelector('[data-cmd="del"]').click();
  assert.equal(h.store.getDoc().elements.some(e=>e.id===copyId),false);
  h.root.querySelector('[data-act="undo"]').click();
  assert.equal(h.store.getDoc().elements.some(e=>e.id===copyId),true);
  h.root.querySelector('[data-act="redo"]').click();
  assert.equal(h.store.getDoc().elements.some(e=>e.id===copyId),false);
  await h.store.flush();
  const local=await h.get('sync/local');
  const reloaded=await local.loadBook(h.store.getDoc().book.id);
  assert.equal(reloaded.elements.find(e=>e.id===id).data.text.font,'gaegu');
  assert.equal(reloaded.elements.find(e=>e.id===id).data.text.content,'오늘 하루 · little memories');
});

test('valid photo uploads survive an invalid file; frames, captions, color and deletion apply', async () => {
  const h=await appHarness(); await openBook(h);
  const input=h.root.querySelector('[data-photo-input]');
  Object.defineProperty(input,'files',{value:[new File(['bad'],'bad.png',{type:'image/png'}),new File(['photo'],'good.png',{type:'image/png'})]});
  h.fire(input,'change'); await h.settle();
  const photo=h.store.getDoc().elements.find(e=>e.type==='photo'); assert.ok(photo);
  tap(h,h.root.querySelector(`[data-el-id="${photo.id}"]`));
  h.root.querySelector('[data-cmd="frame"]').click();
  assert.equal(h.document.querySelectorAll('.fm-item').length,12);
  h.document.querySelector('[data-frame-id="polaroid"]').click();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===photo.id).data.photo.frame,'polaroid');
  const caption=h.document.querySelector('[aria-label="Photo caption"]'); caption.value='A tiny memory';
  h.document.querySelector('[data-picker-close]').click();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===photo.id).data.photo.caption,'A tiny memory');
  h.root.querySelector('[data-cmd="frame"]').click();
  const color=h.document.querySelector('[aria-label="Custom frame color"]'); color.value='#cc88aa'; h.fire(color,'change');
  assert.equal(h.store.getDoc().elements.find(e=>e.id===photo.id).data.photo.frameColor,'#cc88aa');
  h.document.querySelector('[data-picker-close]').click();
  h.root.querySelector('[data-cmd="del"]').click();
  assert.equal(h.store.getDoc().elements.some(e=>e.id===photo.id),false);
  h.root.querySelector('[data-act="undo"]').click();
  assert.ok(h.store.getDoc().elements.some(e=>e.id===photo.id));
});

test('cover, paper, current-page pattern and desk customization persist', async () => {
  const h=await appHarness(); await openBook(h);
  h.root.querySelector('[data-act="style"]').click();
  const dlg=h.document.querySelector('dialog');
  dlg.querySelector('[data-group="color"] button').click();
  const picked=h.store.getDoc().book.coverColor;
  const title=dlg.querySelector('.cz-title'); title.value='My cozy pages';h.fire(title,'change');
  dlg.querySelector('[data-category="paper"]').click();
  dlg.querySelector('[data-group="paper"] [aria-label="Grid"]').click();
  const override=dlg.querySelector('[aria-label="Paper for this page"]');
  Object.defineProperty(override,'value',{value:'plain',configurable:true,writable:true});h.fire(override,'change');
  dlg.querySelector('[data-category="desk"]').click();
  dlg.querySelector('[data-group="desk"] [aria-label="Sage"]').click();
  dlg.close();
  await h.store.flush();
  const doc=await (await h.get('sync/local')).loadBook(h.store.getDoc().book.id);
  assert.equal(doc.book.coverColor,picked);assert.equal(doc.book.title,'My cozy pages');
  assert.equal(doc.book.paperType,'grid');assert.equal(doc.book.background.ref,'sage');
  assert.ok(doc.pages.some(p=>p.paperOverride==='plain'));
});

test('section manager adds, edits, reorders and deletes sections with their pages', async () => {
  const h=await appHarness(); await openBook(h);
  h.root.querySelector('[data-act="sections"]').click();
  const dlg=h.document.querySelector('dialog');
  dlg.querySelector('[data-act="add"]').click();
  let row=dlg.querySelector('.sec-row:last-child');
  const name=row.querySelector('.sec-name');name.value='Wish list';h.fire(name,'change');
  const id=h.store.getDoc().sections.at(-1).id;
  assert.equal(h.store.getDoc().sections.at(-1).name,'Wish list');
  row.querySelector('[data-act="up"]').click();
  assert.equal(h.store.getDoc().sections.find(s=>s.id===id).position,3);
  row=[...dlg.querySelectorAll('.sec-row')].find(r=>r.querySelector('.sec-name').value==='Wish list');
  row.querySelector('[data-act="del"]').click();
  assert.equal(h.store.getDoc().sections.some(s=>s.id===id),false);
  assert.equal(h.store.getDoc().pages.some(p=>p.sectionId===id),false);
});

test('sticker placement, effects, duplication and deletion work from the tray', async () => {
  const h=await appHarness();await openBook(h);
  h.root.querySelector('[data-act="add-sticker"]').click();
  h.document.querySelector('.st-item').click();
  h.document.querySelector('dialog').close();
  const sticker=h.store.getDoc().elements.find(e=>e.type==='sticker');assert.ok(sticker);
  tap(h,h.root.querySelector(`[data-el-id="${sticker.id}"]`));
  h.root.querySelector('[data-cmd="effect"]').click();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===sticker.id).data.sticker.effect,'outline');
  h.root.querySelector('[data-cmd="dup"]').click();
  h.root.querySelector('[data-cmd="del"]').click();
  assert.equal(h.store.getDoc().elements.filter(e=>e.type==='sticker').length,1);
});

test('rotating the layout commits active text, and dialogs own navigation shortcuts', async () => {
  const h=await appHarness();await openBook(h);
  h.root.querySelector('[data-act="add-text"]').click();
  const id=h.store.getDoc().elements.at(-1).id;
  const body=h.root.querySelector(`[data-el-id="${id}"] .el-text-body`);body.textContent='Words during rotation';h.fire(body,'input');
  const query=[...h.media.keys()].find(q=>q.includes('max-aspect-ratio'));
  const media=h.media.get(query);media.matches=true;h.fire(media,'change');
  assert.equal(h.store.getDoc().elements.find(e=>e.id===id).data.text.content,'Words during rotation');
  assert.equal(h.root.querySelector('.book').dataset.mode,'spread', 'rotation must preserve the two-page view');
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.root.querySelector('.book').dataset.mode,'single');
  h.root.querySelector('[data-act="style"]').click();
  const before=h.root.querySelector('.nav-label').textContent;
  h.fire(h.events,'keydown',{key:'ArrowRight',target:h.document.querySelector('[data-category="paper"]')});
  await h.settle();
  assert.equal(h.root.querySelector('.nav-label').textContent,before);
  h.document.querySelector('dialog').close();
});

test('tear tool requires a piece choice, saves only on Done, and cancels without changing the frame', async () => {
  const h=await appHarness(); await openBook(h);
  const pageId=h.store.getDoc().pages[1].id;
  const id=await (await h.get('canvas/elements')).addPhoto(pageId,new File(['png'],'good.png',{type:'image/png'}));
  const {openTearTool}=await h.get('frames/TearTool');
  openTearTool(id);
  let stage=h.document.querySelector('.tt-stage');
  h.fire(stage,'pointerdown',{pointerId:10,clientX:100,clientY:400});
  h.fire(stage,'pointermove',{pointerId:10,clientX:500,clientY:400});
  h.fire(stage,'pointerup',{pointerId:10,clientX:500,clientY:400});
  assert.equal(h.document.querySelector('[data-tt="done"]').disabled,true);
  h.fire(h.document.querySelector('[data-piece="0"]'),'pointerdown',{pointerId:11,clientX:200,clientY:250});
  assert.equal(h.document.querySelector('[data-tt="done"]').disabled,false);
  h.document.querySelector('[data-tt="done"]').click();
  const photo=h.store.getDoc().elements.find(e=>e.id===id).data.photo;
  assert.equal(photo.frame,'torn');assert.ok(photo.clip.length>=3);
  const clip=JSON.stringify(photo.clip);
  openTearTool(id);h.document.querySelector('[data-tt="reset"]').click();h.document.querySelector('[data-tt="cancel"]').click();
  assert.equal(JSON.stringify(h.store.getDoc().elements.find(e=>e.id===id).data.photo.clip),clip);
});

test('corrupt sticker recents do not prevent opening the tray or adding a sticker', async () => {
  const h=await appHarness({stored:{'mlw:recent-stickers':'{broken'}});
  let picked;
  (await h.get('stickers/StickerTray')).openStickerTray((id)=>{picked=id;});
  h.document.querySelector('.st-item').click();
  assert.ok(picked);
});

test('the visible sticker catalog uses generated PNGs, legacy art resolves, and search finds flowers', async () => {
  const h=await appHarness();
  const {STICKERS,CATEGORIES,stickerDef,stickerUri}=await h.get('stickers/packs');
  assert.equal(STICKERS.length,30);
  assert.equal(new Set(STICKERS.map(s=>s.id)).size,STICKERS.length);
  const { DOMParser }=h.window;
  for (const s of STICKERS) {
    assert.ok(CATEGORIES.some(c=>c.id===s.cat),s.id);
    assert.match(s.src,/^\/stickers\/generated\/[^/]+\.png$/,s.id);
    assert.equal(s.svg,undefined,s.id);
    assert.equal(stickerUri(s),s.src);
  }
  for(const id of ['heart','star','a-pressed-poppy']) {
    const legacy=stickerDef(id);assert.ok(legacy,id);
    const parsed=new DOMParser().parseFromString(legacy.svg,'image/svg+xml');
    assert.equal(parsed.documentElement.localName,'svg',id);
    assert.ok(parsed.documentElement.getAttribute('viewBox'),id);
    assert.equal(parsed.querySelector('script, foreignObject, image'),null,id);
    assert.match(stickerUri(legacy),/^data:image\/svg\+xml,/);
    assert.equal(STICKERS.some(s=>s.id===id),false,id);
  }
  (await h.get('stickers/StickerTray')).openStickerTray(()=>{});
  const search=h.document.querySelector('[aria-label="Find stickers"]');search.value='White roses';h.fire(search,'input');
  const rose=h.document.querySelector('[aria-label="Add White roses sticker"]');assert.ok(rose);
  assert.equal(rose.querySelector('img').getAttribute('src'),'/stickers/generated/white-roses.png');
  search.value='not-a-real-sticker';h.fire(search,'input');
  assert.equal(h.document.querySelector('[data-g="grid"]').children.length,0);
  assert.match(h.document.querySelector('.st-results').textContent,/No stickers/);
});

test('all frame presets apply, and canceling a new tear keeps the previous frame', async () => {
  const h=await appHarness(); await openBook(h);
  const id=await (await h.get('canvas/elements')).addPhoto(h.store.getDoc().pages[1].id,new File(['png'],'good.png',{type:'image/png'}));
  tap(h,h.root.querySelector(`[data-el-id="${id}"]`));h.root.querySelector('[data-cmd="frame"]').click();
  const {FRAMES}=await h.get('frames/frames');
  for(const f of FRAMES.filter(f=>!f.tear)) {
    h.document.querySelector(`[data-frame-id="${f.id}"]`).click();
    assert.equal(h.store.getDoc().elements.find(e=>e.id===id).data.photo.frame,f.id);
    assert.equal(h.root.querySelector(`[data-el-id="${id}"] .frame`).dataset.frame,f.id);
  }
  h.document.querySelector('[data-frame-id="torn"]').click();
  h.document.querySelector('[data-tt="cancel"]').click();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===id).data.photo.frame,'circle');
});

test('dragging and resizing placed items commit model changes with stable pointer capture', async () => {
  const h=await appHarness();await openBook(h);
  const id=(await h.get('canvas/elements')).addSticker(h.store.getDoc().pages[1].id,'heart',1);
  const stage=h.root.querySelector('.stage');
  let node=h.root.querySelector(`[data-el-id="${id}"]`);
  const x=h.store.getDoc().elements.find(e=>e.id===id).x;
  h.fire(node,'pointerdown',{pointerId:22,clientX:200,clientY:250,timeStamp:100});
  h.fire(stage,'pointermove',{pointerId:22,clientX:240,clientY:280,timeStamp:150});
  h.fire(stage,'pointerup',{pointerId:22,clientX:240,clientY:280,timeStamp:200});
  assert.ok(h.store.getDoc().elements.find(e=>e.id===id).x>x);
  assert.ok(h.captured.has(22));
  const width=h.store.getDoc().elements.find(e=>e.id===id).w;
  const knob=h.root.querySelector('.el-knob');
  h.fire(knob,'pointerdown',{pointerId:23,clientX:500,clientY:700,timeStamp:300});
  h.fire(stage,'pointermove',{pointerId:23,clientX:600,clientY:800,timeStamp:350});
  h.fire(stage,'pointerup',{pointerId:23,clientX:600,clientY:800,timeStamp:400});
  assert.ok(h.store.getDoc().elements.find(e=>e.id===id).w>width);
});

test('removing a selected uploaded background does not break restoring it through Undo', async () => {
  const h=await appHarness();const local=await h.get('sync/local');
  const {setBackground,removeBackground,listBackgrounds}=await h.get('customize/backgrounds');
  const id=`background-${Date.now()}`;
  await local.putAsset({id,kind:'background',mime:'image/png',w:100,h:100,bytes:3,createdAt:Date.now()},new Blob(['png']));
  setBackground({kind:'upload',ref:id,fit:'cover'});
  await removeBackground(id);
  assert.equal(h.store.getDoc().book.background.kind,'preset');
  assert.equal((await listBackgrounds()).some(a=>a.id===id),false);
  h.store.undo();
  assert.equal(h.store.getDoc().book.background.ref,id);
  assert.ok(await local.getAssetBlob(id));
});

test('dragging empty paper turns a page and canceling a turn restores the original page', async () => {
  const h=await appHarness(); await openBook(h);
  const stage=h.root.querySelector('.stage');const sheet=h.root.querySelector('.slot-right .page-sheet');
  const before=h.root.querySelector('.nav-label').textContent;
  h.fire(sheet,'pointerdown',{pointerId:30,clientX:480,clientY:400,timeStamp:100});
  h.fire(stage,'pointermove',{pointerId:30,clientX:100,clientY:400,timeStamp:150});
  h.fire(stage,'pointerup',{pointerId:30,clientX:100,clientY:400,timeStamp:180});await h.settle();
  assert.notEqual(h.root.querySelector('.nav-label').textContent,before);
  const after=h.root.querySelector('.nav-label').textContent;
  h.fire(h.root.querySelector('.slot-right .page-sheet'),'pointerdown',{pointerId:31,clientX:480,clientY:400,timeStamp:200});
  h.fire(stage,'pointermove',{pointerId:31,clientX:450,clientY:400,timeStamp:250});
  h.fire(stage,'pointercancel',{pointerId:31,clientX:450,clientY:400,timeStamp:280});await h.settle();
  assert.equal(h.root.querySelector('.nav-label').textContent,after);
});

test('pinching after a drag keeps capture and commits scale, rotation and movement', async () => {
  const h=await appHarness();await openBook(h);
  const id=(await h.get('canvas/elements')).addSticker(h.store.getDoc().pages[1].id,'star',1);
  const stage=h.root.querySelector('.stage');let node=h.root.querySelector(`[data-el-id="${id}"]`);
  const original=h.store.getDoc().elements.find(e=>e.id===id);
  h.fire(node,'pointerdown',{pointerId:41,clientX:200,clientY:300,timeStamp:100});
  h.fire(stage,'pointermove',{pointerId:41,clientX:220,clientY:310,timeStamp:150});
  h.fire(node,'pointerdown',{pointerId:42,clientX:300,clientY:350,timeStamp:160});
  h.fire(stage,'pointermove',{pointerId:42,clientX:360,clientY:410,timeStamp:180});
  h.fire(stage,'pointerup',{pointerId:42,clientX:360,clientY:410,timeStamp:200});
  const changed=h.store.getDoc().elements.find(e=>e.id===id);
  assert.ok(changed.w>original.w);assert.notEqual(changed.rot,original.rot);assert.ok(changed.x>original.x);
  assert.ok(h.captured.has(41)&&h.captured.has(42));
});

test('install prompt becomes reachable, calls native prompt, and hides after appinstalled', async () => {
  const h=await appHarness();const button=h.document.createElement('button');button.hidden=true;h.document.body.appendChild(button);
  const {initPWA}=await h.get('pwa/install');initPWA(button);
  let prompted=false;
  h.fire(h.events,'beforeinstallprompt',{prompt:async()=>{prompted=true;},userChoice:Promise.resolve({outcome:'accepted'})});
  assert.equal(button.hidden,false);
  button.click();await h.settle();assert.equal(prompted,true);assert.equal(button.hidden,true);
  h.fire(h.events,'appinstalled');assert.equal(button.hidden,true);
});

test('a dismissed installation prompt does not leave a visible dead button', async () => {
  const h=await appHarness();const button=h.document.createElement('button');button.hidden=true;h.document.body.appendChild(button);
  (await h.get('pwa/install')).initPWA(button);
  let prompts=0;
  h.fire(h.events,'beforeinstallprompt',{prompt:async()=>{prompts++;},userChoice:Promise.resolve({outcome:'dismissed'})});
  button.click();await h.settle();assert.equal(prompts,1);assert.equal(button.hidden,true);
  h.fire(h.events,'beforeinstallprompt',{prompt:async()=>{prompts++;},userChoice:Promise.resolve({outcome:'accepted'})});
  assert.equal(button.hidden,false);button.click();await h.settle();assert.equal(prompts,2);
});

test('text color, highlight and combined decorations render, survive editing, and persist', async () => {
  const h=await appHarness();await openBook(h);
  const id=h.store.getDoc().elements[0].id;
  tap(h,h.root.querySelector(`[data-el-id="${id}"]`));
  h.root.querySelector('[data-cmd="font"]').click();
  const ink=h.document.querySelector('[aria-label="Custom text color"]');
  assert.ok(ink,'text inspector exposes a custom text color control');
  ink.value='#234567';h.fire(ink,'change');
  h.document.querySelector('[aria-label="Yellow highlight"]').click();
  h.document.querySelector('[aria-label="Underline text"]').click();
  h.document.querySelector('[aria-label="Strikethrough text"]').click();
  const style=()=>h.store.getDoc().elements.find(e=>e.id===id).data.text;
  assert.equal(style().color,'#234567');assert.equal(style().highlight,'#fff0a8');
  assert.equal(style().underline,true);assert.equal(style().strikethrough,true);
  const body=()=>h.root.querySelector(`[data-el-id="${id}"] .el-text-body`);
  assert.match(body().style.backgroundImage,/data:image\/svg\+xml/);
  assert.equal(body().dataset.highlight,'true');
  assert.equal(body().style.textDecorationLine,'underline line-through');
  [...h.document.querySelectorAll('.fo-cats button')].find(b=>b.textContent.includes('Korean')).click();
  assert.equal(style().font,'gaegu');assert.equal(style().underline,true);assert.equal(style().highlight,'#fff0a8');
  h.document.querySelector('[data-picker-close]').click();
  tap(h,h.root.querySelector(`[data-el-id="${id}"]`));body().textContent='A highlighted little memory';h.fire(body(),'input');body().blur();
  assert.equal(style().content,'A highlighted little memory');assert.equal(style().strikethrough,true);
  h.root.querySelector('[data-cmd="dup"]').click();
  const copy=h.store.getDoc().elements.at(-1);assert.equal(copy.data.text.highlight,'#fff0a8');assert.equal(copy.data.text.underline,true);
  await h.store.flush();
  const loaded=await (await h.get('sync/local')).loadBook(h.store.getDoc().book.id);
  const saved=loaded.elements.find(e=>e.id===id).data.text;
  assert.equal(saved.color,'#234567');assert.equal(saved.highlight,'#fff0a8');assert.equal(saved.underline,true);assert.equal(saved.strikethrough,true);
});

test('highlight and text decorations can be cleared independently with undo and redo', async () => {
  const h=await appHarness();await openBook(h);const id=h.store.getDoc().elements[0].id;
  tap(h,h.root.querySelector(`[data-el-id="${id}"]`));h.root.querySelector('[data-cmd="font"]').click();
  const button=h.document.querySelector('[aria-label="Underline text"]');assert.ok(button);
  button.click();h.document.querySelector('[aria-label="Strikethrough text"]').click();
  const custom=h.document.querySelector('[aria-label="Custom highlight color"]');custom.value='#ffaaaa';h.fire(custom,'change');
  h.document.querySelector('[aria-label="Remove highlight"]').click();button.click();
  const style=()=>h.store.getDoc().elements.find(e=>e.id===id).data.text;
  assert.equal(style().highlight,undefined);assert.equal(style().underline,false);assert.equal(style().strikethrough,true);
  h.document.querySelector('[data-picker-close]').click();h.store.undo();assert.equal(style().underline,true);
  h.store.undo();assert.equal(style().highlight,'#ffaaaa');
  h.store.redo();assert.equal(style().highlight,undefined);
  assert.equal(h.root.querySelector(`[data-el-id="${id}"] .el-text-body`).style.textDecorationLine,'underline line-through');
});

test('portrait defaults to a continuous two-page spread with an explicit one-page toggle', async () => {
  const h=await appHarness({single:true});await openBook(h);
  assert.equal(h.root.querySelector('.book').dataset.mode,'spread');
  assert.equal(h.root.querySelectorAll('.slot .page[data-page-id]').length,2);
  assert.ok(h.root.querySelector('.spread-canvas'));
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.root.querySelector('.book').dataset.mode,'single');
  assert.equal(h.root.querySelector('.spread-canvas'),null);
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.root.querySelector('.book').dataset.mode,'spread');
});

test('text, photos and rotated stickers spanning the spine each have one continuous editable instance', async () => {
  const h=await appHarness();await openBook(h);
  const ops=await h.get('canvas/elements');
  const [left,right]=h.store.getDoc().pages;
  const text=ops.addText(left.id,{x:.95,y:.2},'Words across the middle');
  const photo=await ops.addPhoto(left.id,new File(['png'],'good.png',{type:'image/png'}));
  ops.patchElement(photo,{x:.8,w:.7,rot:18});
  const sticker=ops.addSticker(right.id,'flower',1,{x:0,y:.3});
  ops.patchElement(sticker,{x:-.2,rot:-35,w:.6});
  const surface=h.root.querySelector('.spread-canvas');
  for(const id of [text,photo,sticker]) {
    assert.equal(h.root.querySelectorAll(`.el[data-el-id="${id}"]`).length,1,'no clipped duplicate text/caret or image at the gutter');
    assert.ok(surface.querySelector(`[data-el-id="${id}"]`));
  }
  assert.equal(surface.querySelector(`[data-el-id="${photo}"]`).style.left,'40%');
  assert.equal(surface.querySelector(`[data-el-id="${photo}"]`).style.width,'35%');
  assert.equal(surface.querySelector(`[data-el-id="${sticker}"]`).style.left,'40%');
  assert.ok(surface.querySelector('.spread-crease[aria-hidden="true"]'));
  tap(h,surface.querySelector(`[data-el-id="${text}"]`));
  tap(h,surface.querySelector(`[data-el-id="${text}"]`));
  const body=surface.querySelector(`[data-el-id="${text}"] .el-text-body`);
  body.textContent='Editing one text box across both pages';h.fire(body,'input');body.blur();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===text).data.text.content,'Editing one text box across both pages');
});

test('live cross-spine drag stays continuous and transfers ownership without jumping', async () => {
  const h=await appHarness();await openBook(h);
  const ops=await h.get('canvas/elements');const left=h.store.getDoc().pages[0],right=h.store.getDoc().pages[1];
  const id=ops.addSticker(left.id,'star',1);ops.patchElement(id,{x:.85,y:.3,w:.3,rot:0});
  const node=h.root.querySelector(`[data-el-id="${id}"]`),stage=h.root.querySelector('.stage');
  h.fire(node,'pointerdown',{pointerId:51,clientX:200,clientY:300,timeStamp:100});
  h.fire(stage,'pointermove',{pointerId:51,clientX:280,clientY:300,timeStamp:150});
  assert.equal(node.style.left,'52.5%');
  h.fire(stage,'pointerup',{pointerId:51,clientX:280,clientY:300,timeStamp:180});
  const moved=h.store.getDoc().elements.find(e=>e.id===id);
  assert.equal(moved.pageId,right.id);assert.ok(Math.abs(moved.x-.05)<1e-9);
  assert.equal(h.root.querySelector(`[data-el-id="${id}"]`).style.left,'52.5%');
  h.root.querySelector('[data-act="undo"]').click();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===id).pageId,left.id);
});

test('bring-to-front and send-to-back share layers across both pages', async () => {
  const h=await appHarness();const ops=await h.get('canvas/elements');const [left,right]=h.store.getDoc().pages;
  const a=ops.addSticker(left.id,'heart');const b=ops.addSticker(right.id,'star');
  ops.reorder(a,'front');
  assert.ok(h.store.getDoc().elements.find(e=>e.id===a).z>h.store.getDoc().elements.find(e=>e.id===b).z);
  ops.reorder(a,'back');
  assert.ok(h.store.getDoc().elements.find(e=>e.id===a).z<h.store.getDoc().elements.find(e=>e.id===b).z);
});

test('marker texture is deterministic, has uneven edges, and stays behind readable text', async () => {
  const h=await appHarness();const {markerBackground}=await h.get('fonts/highlight');
  const a=markerBackground('#fff0a8','element-a');
  assert.equal(a,markerBackground('#fff0a8','element-a'));assert.notEqual(a,markerBackground('#fff0a8','element-b'));
  const svg=decodeURIComponent(a.slice(a.indexOf(',')+1,-2));
  const parsed=new h.window.DOMParser().parseFromString(svg,'image/svg+xml');
  assert.ok(parsed.querySelectorAll('path').length>3);assert.equal(parsed.querySelector('mask,filter,script'),null);
  assert.ok(parsed.querySelector('path').getAttribute('d').split(' L').length>20);
});

test('refined Studio opens by default and Flowers includes white roses, lilies and orchids', async () => {
  const h=await appHarness();await openBook(h);
  h.root.querySelector('[data-act="add-sticker"]').click();
  const selected=h.document.querySelector('.st-cat[aria-pressed="true"]');assert.equal(selected.textContent,'Studio');
  assert.equal(h.document.querySelectorAll('[data-g="grid"] .st-item').length,30);
  assert.ok([...h.document.querySelectorAll('[data-g="grid"] .st-item img')].every(img=>img.getAttribute('src').startsWith('/stickers/generated/')));
  [...h.document.querySelectorAll('.st-cat')].find(b=>b.textContent==='Flowers').click();
  for(const name of ['White roses','White lilies','White orchids']) assert.ok(h.document.querySelector(`[aria-label="Add ${name} sticker"]`),name);
  h.document.querySelector('[aria-label="Add White roses sticker"]').click();
  const placed=h.store.getDoc().elements.find(e=>e.data.sticker?.stickerId==='a-white-roses');
  assert.ok(placed);assert.equal(placed.data.sticker.effect,'none','fine botanical art must not receive a thick cartoon outline');
  h.document.querySelector('dialog').close();
  assert.ok(h.root.querySelector(`[data-el-id="${placed.id}"] .sticker-img`));
});

test('both pages accept new writing and layout choice is remembered without changing page ownership', async () => {
  const h=await appHarness();await openBook(h);const [left,right]=h.store.getDoc().pages;
  h.fire(h.root.querySelector('.slot-left .page-sheet'),'pointerdown',{pointerId:70,clientX:150,clientY:200,timeStamp:100});
  h.root.querySelector('[data-act="add-text"]').click();
  const leftText=h.store.getDoc().elements.at(-1);assert.equal(leftText.pageId,left.id);
  let body=h.root.querySelector(`[data-el-id="${leftText.id}"] .el-text-body`);body.textContent='Left-page writing';body.blur();
  h.fire(h.root.querySelector('.slot-right .page-sheet'),'pointerdown',{pointerId:71,clientX:450,clientY:200,timeStamp:200});
  h.root.querySelector('[data-act="add-text"]').click();
  const rightText=h.store.getDoc().elements.at(-1);assert.equal(rightText.pageId,right.id);
  body=h.root.querySelector(`[data-el-id="${rightText.id}"] .el-text-body`);body.textContent='Right-page writing';body.blur();
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.storage.get(`mlw:layout:${h.store.getDoc().book.id}`),'single');
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.store.getDoc().elements.find(e=>e.id===leftText.id).pageId,left.id);
  assert.equal(h.store.getDoc().elements.find(e=>e.id===rightText.id).pageId,right.id);
});
