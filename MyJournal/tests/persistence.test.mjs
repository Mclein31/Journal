import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

// Run the actual TypeScript modules with controlled storage/transaction timing.
// No browser or extra dependency is needed: node --experimental-vm-modules --test tests/*.test.mjs
const sourceRoot = new URL('../src/', import.meta.url);
const seed = () => ({ book: { id: 'book' }, sections: [], pages: [], elements: [] });
const text = (content = 'saved') => ({ id: 'text', pageId: 'page', type: 'text', data: { text: { content } } });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

async function harness({ meta = {}, recovery = null, save = async () => {} } = {}) {
  const events = new EventTarget();
  const storage = new Map(recovery ? [['mlw:text-drafts', JSON.stringify(recovery)]] : []);
  const savedMeta = structuredClone(meta);
  const context = vm.createContext({
    structuredClone, CustomEvent,
    addEventListener: events.addEventListener.bind(events),
    document: { visibilityState: 'visible' },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { setTimeout: () => 1, clearTimeout() {}, dispatchEvent: events.dispatchEvent.bind(events) },
  });
  const local = new vm.SyntheticModule(['saveDoc', 'getMeta', 'setMeta', 'storageKey'], function () {
    this.setExport('saveDoc', save);
    this.setExport('getMeta', async (key) => structuredClone(savedMeta[key]));
    this.setExport('setMeta', async (key, value) => { savedMeta[key] = structuredClone(value); });
    this.setExport('storageKey', (key) => key);
  }, { context });
  const modules = new Map([['sync/local', local]]);
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    const source = stripTypeScriptTypes(await readFile(new URL(`${name}.ts`, sourceRoot), 'utf8'));
    const module = new vm.SourceTextModule(source, { context, identifier: name });
    modules.set(name, module);
    await module.link((specifier) => {
      const resolved = new URL(specifier, `https://modules/${name}`).pathname.slice(1);
      return load(resolved);
    });
    return module;
  }
  const store = await load('state/store');
  await store.evaluate();
  const bookmark = await load('book/bookmark');
  await bookmark.evaluate();
  return { store: store.namespace, bookmark: bookmark.namespace, storage, savedMeta, events };
}

test('overlapping saves stay ordered and delete an element introduced by the in-flight save', async () => {
  const gate = deferred();
  const rows = new Map();
  const writes = [];
  const { store } = await harness({ save: async (doc, removed) => {
    writes.push({ doc, removed });
    if (writes.length === 1) await gate.promise;
    for (const id of removed.elements) rows.delete(id);
    for (const element of doc.elements) rows.set(element.id, element);
  } });
  store.initStore(seed());
  store.update('add', (doc) => doc.elements.push(text()));
  const first = store.flush();
  store.update('delete', (doc) => { doc.elements = []; });
  assert.equal(store.flush(), first, 'concurrent callers must share the active save');
  assert.equal(writes.length, 1, 'a second transaction must wait');
  gate.resolve();
  await first;
  assert.equal(writes.length, 2);
  assert.deepEqual(Array.from(writes[1].removed.elements), ['text']);
  assert.equal(rows.size, 0, 'deleted element must stay deleted after reload');
});

test('failed saves remain retryable and do not emit a successful save', async () => {
  let fails = true;
  let saved = 0;
  let errors = 0;
  const { store, events } = await harness({ save: async () => { if (fails) throw new Error('quota'); } });
  events.addEventListener('mlw:saved', () => saved++);
  events.addEventListener('mlw:save-error', () => errors++);
  store.initStore(seed());
  store.update('add', (doc) => doc.elements.push(text()));
  await assert.rejects(store.flush(), /quota/);
  assert.equal(saved, 0);
  assert.equal(errors, 1);
  fails = false;
  await store.flush();
  assert.equal(saved, 1);
});

test('the last keystroke has synchronous recovery and cannot be cleared before a book save', async () => {
  const { store, bookmark, storage } = await harness();
  store.initStore({ ...seed(), elements: [text()] });
  const pending = bookmark.saveDraft('text', 'last keystroke');
  assert.equal(JSON.parse(storage.get('mlw:text-drafts')).text, 'last keystroke');
  await pending;
  await bookmark.clearDraft('text');
  assert.equal(JSON.parse(storage.get('mlw:text-drafts')).text, 'last keystroke');
  store.update('edit', (doc) => { doc.elements[0].data.text.content = 'last keystroke'; });
  await store.flush();
  await bookmark.clearDraft('text');
  assert.deepEqual(JSON.parse(storage.get('mlw:text-drafts')), {});
});

test('restoration retains recovery until saved and restores an intentionally empty text draft', async () => {
  const { store, bookmark, storage, savedMeta } = await harness({ meta: { drafts: { text: '' } } });
  const doc = { ...seed(), elements: [text('old words')] };
  assert.equal(await bookmark.applyDrafts(doc), true);
  assert.equal(doc.elements[0].data.text.content, '');
  assert.equal(JSON.parse(storage.get('mlw:text-drafts')).text, '');
  assert.equal(savedMeta.drafts.text, '', 'reading recovery must not consume it');
  store.initStore(doc);
  await store.flush();
  await bookmark.clearDraft('text');
  assert.deepEqual(JSON.parse(storage.get('mlw:text-drafts')), {});
});

test('an older completed save cannot clear a newer typing draft', async () => {
  const gate = deferred();
  const { store, bookmark, storage } = await harness({ save: () => gate.promise });
  store.initStore({ ...seed(), elements: [text('old words')] });
  await bookmark.saveDraft('text', 'old words');
  const saving = store.flush();
  await bookmark.saveDraft('text', 'new words');
  gate.resolve();
  await saving;
  await bookmark.clearDraft('text');
  assert.equal(JSON.parse(storage.get('mlw:text-drafts')).text, 'new words');
});

test('snapshot deletion and insertion use one IndexedDB transaction', async () => {
  const transactions = [];
  const operations = [];
  const fakeDb = { transaction(stores, mode) {
    transactions.push({ stores, mode });
    return { done: Promise.resolve(), objectStore: (name) => ({
      get: async () => undefined,
      put: async (value) => operations.push(['put', name, value.id]),
      delete: async (id) => operations.push(['delete', name, id]),
    }) };
  } };
  const context = vm.createContext({});
  const idb = new vm.SyntheticModule(['openDB'], function () { this.setExport('openDB', async () => fakeDb); }, { context });
  const api = new vm.SyntheticModule(['mediaBlob'], function () { this.setExport('mediaBlob', async () => { throw new Error('Snapshot saves must not fetch media'); }); }, { context });
  const source = stripTypeScriptTypes(await readFile(new URL('sync/local.ts', sourceRoot), 'utf8'));
  const local = new vm.SourceTextModule(source, { context });
  await local.link((specifier) => specifier === 'idb' ? idb : api);
  await local.evaluate();
  await local.namespace.saveDoc({ ...seed(), elements: [text()] }, { elements: ['removed'] });
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].mode, 'readwrite');
  assert.deepEqual(operations, [['delete', 'elements', 'removed'], ['put', 'books', 'book'], ['put', 'elements', 'text']]);
});
