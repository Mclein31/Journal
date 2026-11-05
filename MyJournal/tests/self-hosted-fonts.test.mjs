import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

test('every journal font and Korean fallback has licensed, local WOFF2 assets',async()=>{
  const h=await appHarness();const {FONTS}=await h.get('fonts/fonts');
  const manifest=JSON.parse(await readFile('public/fonts/manifest.json','utf8'));
  assert.equal(manifest.length,new Set([...FONTS.map(f=>f.family),'Noto Sans KR']).size);
  for(const font of manifest){
    const slug=font.family.toLowerCase().replace(/\s+/g,'-');const base=`public/fonts/${slug}/`;
    const css=await readFile(base+'index.css','utf8');const license=await readFile(base+'LICENSE.txt','utf8');
    assert.ok(license.length>100,font.family+' license');assert.ok(!/https?:\/\//.test(css),font.family+' local CSS');
    assert.ok(css.includes(font.family),font.family+' family name');assert.ok(font.files.length>0);
    for(const file of font.files){
      const bytes=await readFile(base+file);assert.equal(bytes.subarray(0,4).toString(),'wOF2',file);
      assert.ok((await stat(base+file)).size<3*1024*1024,'Font fits offline cache limit');
    }
  }
});

test('font picker loads same-origin stylesheets, deduplicates them, and retries failed loads',async()=>{
  const h=await appHarness();const fonts=await h.get('fonts/fonts');fonts.loadAllFonts();
  const links=[...h.document.head.querySelectorAll('link')];assert.ok(links.length>20);
  for(const link of links)assert.match(link.getAttribute('href'),/^\/fonts\/[a-z-]+\/index\.css$/);
  fonts.loadAllFonts();assert.equal(h.document.head.querySelectorAll('link').length,links.length);
  const lora=links.find(link=>link.getAttribute('href').includes('/lora/'));h.fire(lora,'error');
  assert.equal(lora.isConnected,false);fonts.loadFonts(['lora']);
  assert.equal(h.document.head.querySelectorAll('link[href="/fonts/lora/index.css"]').length,1);
  const html=await readFile('index.html','utf8');assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html));
});
