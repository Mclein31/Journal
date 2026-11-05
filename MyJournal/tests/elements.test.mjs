import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

// Exercise production element operations while keeping storage and image decoding out of the unit test.
async function setup(side = 'left') {
  let doc = {
    book: { id: 'book' },
    sections: [{ id: 'section', position: 0 }],
    pages: [{ id: 'left', sectionId: 'section', position: 0 }, { id: 'right', sectionId: 'section', position: 1 }],
    elements: [{ id: 'photo', pageId: side, type: 'photo', x: .2, y: .2, w: .5, z: 1, rot: 0, data: { photo: { assetId: 'asset', aspect: 1, frame: 'none' } } }],
  };
  const context = vm.createContext({ structuredClone });
  function stub(exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value); }, { context });
  }
  const modules = new Map([
    ['state/store', stub({ getDoc: () => doc, update: (_reason, mutate) => { doc = structuredClone(doc); mutate(doc); } })],
    ['sync/local', stub({ putAsset: () => { throw new Error('unexpected storage write'); }, deleteAsset: () => { throw new Error('unexpected asset deletion'); } })],
    ['util/image', stub({ compressImage: () => { throw new Error('unexpected image decode'); } })],
    ['fonts/fonts', stub({ lastFont: () => 'caveat' })],
  ]);
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    const source = stripTypeScriptTypes(await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'));
    const module = new vm.SourceTextModule(source, { context, identifier: name });
    modules.set(name, module);
    await module.link((specifier) => load(new URL(specifier, `https://modules/${name}`).pathname.slice(1)));
    return module;
  }
  const module = await load('canvas/elements');
  await module.evaluate();
  return { api: module.namespace, current: () => doc };
}

test('single-page drags do not transfer a photo onto a hidden partner page', async () => {
  const { api, current } = await setup();
  api.moveElement('photo', 1.1, .4, false);
  assert.equal(current().elements[0].pageId, 'left');
  assert.equal(current().elements[0].x, 1.1);
});

test('single-page drags on right-hand pages also keep their owner', async () => {
  const { api, current } = await setup('right');
  api.moveElement('photo', -.8, .4, false);
  assert.equal(current().elements[0].pageId, 'right');
});

test('spread drags retain continuous position when crossing the spine in either direction', async () => {
  const { api, current } = await setup();
  api.moveElement('photo', .9, .4, true);
  assert.equal(current().elements[0].pageId, 'right');
  assert.ok(Math.abs(current().elements[0].x + .1) < 1e-9);
  api.moveElement('photo', -.3, .4, true);
  assert.equal(current().elements[0].pageId, 'left');
  assert.equal(current().elements[0].x, .7);
});

test('repeated duplication keeps new copies reachable on the page', async () => {
  const { api, current } = await setup();
  let id = 'photo';
  for (let i = 0; i < 30; i++) id = api.duplicateElement(id);
  const copy = current().elements.find((el) => el.id === id);
  assert.ok(copy.x <= .9);
  assert.ok(copy.y <= .85);
  assert.equal(copy.data.photo.assetId, 'asset');
});

test('sending a photo behind other elements never puts it behind the page', async () => {
  const { api, current } = await setup();
  api.duplicateElement('photo');
  api.reorder('photo', 'back');
  assert.ok(current().elements.every((el) => el.z >= 1));
  assert.equal(current().elements.find((el) => el.id === 'photo').z, 1);
});
