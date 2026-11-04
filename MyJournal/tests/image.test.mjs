import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {test} from 'node:test';

async function compressor() {
  let outputType,closed=false;
  const context=vm.createContext({
    createImageBitmap:async()=>({width:2400,height:1200,close(){closed=true;}}),
    document:{createElement:()=>({getContext:()=>({drawImage(){}}),toBlob(fn,type){outputType=type;fn(new Blob(['pixels'],{type}));}})},
  });
  const module=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL('../src/util/image.ts',import.meta.url),'utf8')),{context});
  await module.link(()=>{});await module.evaluate();
  return {compress:module.namespace.compressImage,type:()=>outputType,closed:()=>closed};
}
test('transparent WebP stickers use an alpha-capable PNG output and bounded dimensions',async()=>{
  const c=await compressor();const result=await c.compress(new Blob(['webp'],{type:'image/webp'}),800,.9,true);
  assert.equal(c.type(),'image/png');assert.equal(result.w,800);assert.equal(result.h,400);assert.equal(c.closed(),true);
});
test('photographs still use JPEG while PNG imports preserve their alpha channel',async()=>{
  const c=await compressor();await c.compress(new Blob(['jpg'],{type:'image/jpeg'}));assert.equal(c.type(),'image/jpeg');
  await c.compress(new Blob(['png'],{type:'image/png'}));assert.equal(c.type(),'image/png');
});
