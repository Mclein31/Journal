import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

async function editor() {
  const h = await appHarness();
  (await h.get('book/Book')).mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  const id = h.store.getDoc().elements[0].id;
  const node = h.root.querySelector(`[data-el-id="${id}"]`);
  h.fire(node, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
  h.fire(node, 'pointerup', { pointerId: 1, clientX: 150, clientY: 250 });
  return { ...h, id, value: () => h.store.getDoc().elements.find((el) => el.id === id) };
}

test('the single corner handle scales the lettering while the typing area stays exactly one page wide', async () => {
  const h = await editor();
  const before = structuredClone(h.value());
  assert.equal(before.w, 1);
  assert.equal(h.root.querySelectorAll('.el-knob').length, 1);
  assert.equal(h.root.querySelector('.el-width'), null);
  const stage = h.root.querySelector('.stage');
  const knob = h.root.querySelector('.el-knob');
  h.fire(knob, 'pointerdown', { pointerId: 2, clientX: 450, clientY: 650 });
  h.fire(stage, 'pointermove', { pointerId: 2, clientX: 650, clientY: 850 });
  h.fire(stage, 'pointerup', { pointerId: 2, clientX: 650, clientY: 850 });
  assert.equal(h.value().w, 1);
  assert.ok(h.value().data.text.size > (before.data.text.size ?? 1));
  assert.equal(h.value().data.text.content, before.data.text.content);
  const size = h.value().data.text.size;
  h.store.undo(); assert.equal(h.value().w, 1);
  h.store.redo(); assert.equal(h.value().w, 1); assert.equal(h.value().data.text.size, size);
  await h.store.flush();
  const saved = await (await h.get('sync/local')).loadBook(h.store.getDoc().book.id);
  assert.equal(saved.elements.find((el) => el.id === h.id).w, 1);
});

test('new and legacy text boxes use one-page width without changing their words or font styling', async () => {
  const h = await appHarness();
  const legacy = structuredClone(h.store.getDoc());
  legacy.elements[0].w = .35;
  legacy.elements[0].data.text.size = 2.4;
  h.store.initStore(legacy);
  assert.equal(h.store.getDoc().elements[0].w, 1);
  assert.equal(h.store.getDoc().elements[0].data.text.size, 2.4);
  const id = (await h.get('canvas/elements')).addText(h.store.getDoc().pages[0].id);
  const added = h.store.getDoc().elements.find((el) => el.id === id);
  assert.equal(added.w, 1); assert.equal(added.x, 0);
  await h.store.flush();
  assert.ok((await (await h.get('sync/local')).loadBook(legacy.book.id)).elements.filter((el) => el.type === 'text').every((el) => el.w === 1));
});

test('font scaling, duplication, width patches and both layouts preserve the one-page typing area', async () => {
  const h = await editor();
  const ops = await h.get('canvas/elements');
  ops.patchElement(h.id, { w: 3.5, data: { text: { ...h.value().data.text, size: 4, underline: true } } });
  assert.equal(h.value().w, 1);
  assert.equal(h.root.querySelector(`[data-el-id="${h.id}"]`).style.width, '50%');
  const copy = ops.duplicateElement(h.id);
  assert.equal(h.store.getDoc().elements.find((el) => el.id === copy).w, 1);
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.root.querySelector(`[data-el-id="${h.id}"]`).style.width, '100%');
  assert.equal(h.value().data.text.size, 4);
  assert.equal(h.value().w, 1);
});

test('pinching changes text size without increasing its one-page width', async () => {
  const h = await editor();
  const node = h.root.querySelector(`[data-el-id="${h.id}"]`);
  const stage = h.root.querySelector('.stage');
  h.fire(node, 'pointerdown', { pointerId: 10, clientX: 200, clientY: 300 });
  h.fire(node, 'pointerdown', { pointerId: 11, clientX: 300, clientY: 300 });
  h.fire(stage, 'pointermove', { pointerId: 11, clientX: 400, clientY: 300 });
  h.fire(stage, 'pointerup', { pointerId: 11, clientX: 400, clientY: 300 });
  assert.equal(h.value().w, 1);
  assert.equal(h.value().data.text.size, 2);
});

test('scaling while editing commits the current words and keeps one-page width', async () => {
  const h = await editor();
  const node = h.root.querySelector(`[data-el-id="${h.id}"]`);
  h.fire(node, 'dblclick');
  const body = node.querySelector('.el-text-body');
  body.textContent = 'Words typed immediately before resizing';
  h.fire(body, 'input');
  const stage = h.root.querySelector('.stage');
  h.fire(h.root.querySelector('.el-knob'), 'pointerdown', { pointerId: 4, clientX: 450, clientY: 650 });
  h.fire(stage, 'pointermove', { pointerId: 4, clientX: 650, clientY: 850 });
  h.fire(stage, 'pointerup', { pointerId: 4, clientX: 650, clientY: 850 });
  assert.equal(h.value().w, 1);
  assert.equal(h.value().data.text.content, 'Words typed immediately before resizing');
  assert.ok(h.value().data.text.size > 1);
});
