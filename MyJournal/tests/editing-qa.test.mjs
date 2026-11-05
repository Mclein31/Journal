import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

test('a caption explicitly undone after a failed save cannot return through recovery', async (t) => {
  const h = await appHarness();
  const { id, local } = await savedPhoto(h);
  const { openFrameMenu, closeFrameMenu } = await h.get('frames/FrameMenu');
  const originalPut = IDBObjectStore.prototype.put;
  let fail = true;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'books' && fail) { fail = false; throw new Error('Storage temporarily full'); }
    return originalPut.apply(this, args);
  };
  t.after(() => { IDBObjectStore.prototype.put = originalPut; });
  openFrameMenu(id, h.document.createElement('button'), () => {});
  const input = h.document.querySelector('[aria-label="Photo caption"]');
  input.value = 'An edit the user later undid';
  h.fire(input, 'input');
  closeFrameMenu();
  await assert.rejects(h.store.flush(), /full/);
  h.store.undo();
  await h.store.flush();
  await h.settle();
  const loaded = await local.loadBook(h.store.getDoc().book.id);
  const fresh = await appHarness({ stored: Object.fromEntries(h.storage) });
  await (await fresh.get('book/bookmark')).applyDrafts(loaded);
  assert.equal(loaded.elements.find((el) => el.id === id).data.photo.caption, 'Original caption');
});

// Input-level regressions for work interrupted by async uploads or page lifecycle events.
async function savedPhoto(h) {
  const local = await h.get('sync/local');
  const elements = await h.get('canvas/elements');
  const pageId = h.store.getDoc().pages[0].id;
  const id = await elements.addPhoto(pageId, new File(['image'], 'caption.png', { type: 'image/png' }));
  const photo = h.store.getDoc().elements.find((element) => element.id === id).data.photo;
  elements.patchElement(id, { data: { photo: { ...photo, frame: 'polaroid', caption: 'Original caption' } } });
  await h.store.flush();
  return { id, local };
}

async function persistedCaption(h, local, id) {
  h.events.dispatchEvent(new h.window.Event('pagehide'));
  await h.settle();
  await h.store.flush();
  const reloaded = await local.loadBook(h.store.getDoc().book.id);
  return reloaded.elements.find((element) => element.id === id).data.photo.caption;
}

test('deleting the target page during an asynchronous photo import rejects without creating an orphan', async () => {
  const h = await appHarness();
  const elements = await h.get('canvas/elements');
  const pageId = h.store.getDoc().pages[0].id;
  const pending = elements.addPhoto(pageId, new File(['image'], 'good.png', { type: 'image/png' }));
  // Compression/storage each yield; the target may be removed while the file is being prepared.
  h.store.update('remove-upload-target', (doc) => {
    doc.pages = doc.pages.filter((page) => page.id !== pageId);
    doc.elements = doc.elements.filter((element) => element.pageId !== pageId);
  });
  await assert.rejects(pending, /page/i);
  assert.equal(h.store.getDoc().elements.some((element) => element.pageId === pageId), false);
});

test('photo-inspector caption input survives pagehide without blurring or closing the picker', async () => {
  const h = await appHarness();
  const { id, local } = await savedPhoto(h);
  const { openFrameMenu } = await h.get('frames/FrameMenu');
  openFrameMenu(id, h.document.createElement('button'), () => {});
  const input = h.document.querySelector('[aria-label="Photo caption"]');
  input.focus();
  input.value = 'Caption typed immediately before leaving';
  h.fire(input, 'input');
  assert.ok(h.document.querySelector('.photo-inspector'), 'the inspector must still be open');
  assert.equal(await persistedCaption(h, local, id), 'Caption typed immediately before leaving');
});

test('inline photo-caption input survives pagehide while its editor remains focused', async () => {
  const h = await appHarness();
  const { id, local } = await savedPhoto(h);
  const { mountBook } = await h.get('book/Book');
  mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  const caption = h.root.querySelector(`[data-el-id="${id}"] .frame-caption`);
  assert.ok(caption, 'the photo caption is visible in the open spread');
  h.fire(caption, 'dblclick');
  assert.ok(caption.closest('.el').classList.contains('is-editing'), 'inline editing is active');
  caption.textContent = 'An inline memory saved before backgrounding';
  h.fire(caption, 'input');
  assert.equal(await persistedCaption(h, local, id), 'An inline memory saved before backgrounding');
});

test('double-clicking an already edited caption keeps the connected editor available for word selection', async () => {
  const h = await appHarness();
  const { id } = await savedPhoto(h);
  (await h.get('book/Book')).mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  const caption = h.root.querySelector(`[data-el-id="${id}"] .frame-caption`);
  h.fire(caption, 'dblclick');
  caption.textContent = 'Words that are still being edited';
  h.fire(caption, 'input');
  h.fire(caption, 'dblclick');
  const current = h.root.querySelector(`[data-el-id="${id}"] .frame-caption`);
  assert.ok(caption.isConnected, 'a word-selection double-click must not commit and replace the active caption');
  assert.equal(current, caption);
  assert.ok(current.closest('.el').classList.contains('is-editing'));
  assert.equal(h.document.activeElement, current);
});

test('switching between caption editors re-queries the connected target after committing the previous caption', async () => {
  const h = await appHarness();
  const { id: firstId } = await savedPhoto(h);
  const elements = await h.get('canvas/elements');
  const secondId = await elements.addPhoto(h.store.getDoc().pages[0].id, new File(['second image'], 'second.png', { type: 'image/png' }));
  const secondPhoto = h.store.getDoc().elements.find((element) => element.id === secondId).data.photo;
  elements.patchElement(secondId, { data: { photo: { ...secondPhoto, frame: 'polaroid', caption: 'Second original caption' } } });
  await h.store.flush();
  (await h.get('book/Book')).mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  const first = h.root.querySelector(`[data-el-id="${firstId}"] .frame-caption`);
  const second = h.root.querySelector(`[data-el-id="${secondId}"] .frame-caption`);
  h.fire(first, 'dblclick');
  first.textContent = 'The first memory is committed on switching';
  h.fire(first, 'input');
  // Accessibility/programmatic activation may reach this handler without a native blur first.
  h.fire(second, 'dblclick');
  assert.equal(h.store.getDoc().elements.find((element) => element.id === firstId).data.photo.caption, 'The first memory is committed on switching');
  const target = h.root.querySelector(`[data-el-id="${secondId}"] .frame-caption`);
  assert.ok(target.isConnected);
  assert.ok(target.closest('.el').classList.contains('is-editing'));
  assert.equal(h.document.activeElement, target, 'focus must refer to the new connected caption node');
  target.textContent = 'The second memory remains editable';
  h.fire(target, 'input');
  target.blur();
  assert.equal(h.store.getDoc().elements.find((element) => element.id === secondId).data.photo.caption, 'The second memory remains editable');
});

async function assertUndoneCaptionStaysUndone(h, local, id) {
  await h.store.flush();
  await h.settle();
  const loaded = await local.loadBook(h.store.getDoc().book.id);
  assert.equal(loaded.elements.find((element) => element.id === id).data.photo.caption, 'Original caption', 'Undo has been committed to the book');
  const fresh = await appHarness({ stored: Object.fromEntries(h.storage) });
  fresh.store.initStore(structuredClone(loaded));
  const recovery = await fresh.get('book/bookmark');
  assert.equal(await recovery.applyDrafts(loaded), false, 'an undone caption must not be replayed as interrupted input');
  assert.equal(loaded.elements.find((element) => element.id === id).data.photo.caption, 'Original caption');
  assert.equal(recovery.getPendingDrafts()[`caption:${id}`], undefined);
  assert.equal(Object.keys(recovery.getDraftConflicts()).length, 0, 'normal Undo should not create a conflict for the same window');
}

test('an inspector caption changed then immediately undone stays undone after saving and fresh-app recovery', async () => {
  const h = await appHarness();
  const { id, local } = await savedPhoto(h);
  (await h.get('book/Book')).mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  (await h.get('frames/FrameMenu')).openFrameMenu(id, h.document.createElement('button'), () => {});
  const input = h.document.querySelector('[aria-label="Photo caption"]');
  input.focus();
  input.value = 'Inspector caption that the user deliberately undid';
  h.fire(input, 'input');
  h.document.querySelector('[data-picker-close]').click();
  h.root.querySelector('[data-act="undo"]').click();
  await assertUndoneCaptionStaysUndone(h, local, id);
});

test('an inline caption changed then immediately undone stays undone after saving and fresh-app recovery', async () => {
  const h = await appHarness();
  const { id, local } = await savedPhoto(h);
  (await h.get('book/Book')).mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  const caption = h.root.querySelector(`[data-el-id="${id}"] .frame-caption`);
  h.fire(caption, 'dblclick');
  caption.textContent = 'Inline caption that the user deliberately undid';
  h.fire(caption, 'input');
  caption.blur();
  h.root.querySelector('[data-act="undo"]').click();
  await assertUndoneCaptionStaysUndone(h, local, id);
});
