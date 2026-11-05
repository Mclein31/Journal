import assert from 'node:assert/strict';
import { openDB } from 'idb';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

// Two independent application contexts share one IndexedDB database, as browser tabs do.
async function twoWindows({ persisted = true } = {}) {
  const first = await appHarness();
  const local = await first.get('sync/local');
  if (persisted) await first.store.flush();
  const baseline = persisted
    ? await local.loadBook(first.store.getDoc().book.id)
    : structuredClone(first.store.getDoc());
  const second = await appHarness();
  second.store.initStore(structuredClone(baseline));
  return { first, second, local, baseline };
}

const editText = (h, value) => h.store.update('text from this window', (doc) => {
  doc.elements[0].data.text.content = value;
});
const editCover = (h, value) => h.store.update('cover from this window', (doc) => {
  doc.book.coverColor = value;
});

const conflictMessage = /conflict|another|reload|newer|stale|revision|changed/i;

test('the actual boot path persists recovered typing for an already revisioned journal', async () => {
  const h = await appHarness();
  const local = await h.get('sync/local');
  const bookId = h.store.getDoc().book.id;
  const textId = h.store.getDoc().elements[0].id;
  await h.store.flush();
  await local.setMeta('activeBookId', bookId);
  await (await h.get('book/bookmark')).saveDraft(textId, 'Typing recovered through the real boot path');
  await h.get('main');
  for (let i = 0; i < 10 && !h.root.querySelector('.desk, .boot-error'); i++) await h.settle();
  assert.equal(h.document.querySelector('.boot-error'), null);
  assert.ok(h.root.querySelector('.desk'), 'boot has finished mounting the journal');
  assert.equal((await local.loadBook(bookId)).elements.find((el) => el.id === textId).data.text.content, 'Typing recovered through the real boot path');
});

test('a stale second window cannot overwrite text saved by the first window', async () => {
  const { first, second, local, baseline } = await twoWindows();
  let conflicts = 0;
  second.events.addEventListener('mlw:save-conflict', () => conflicts++);
  editText(first, 'Words saved in the first window');
  await first.store.flush();
  editCover(second, '#135724');
  await assert.rejects(second.store.flush(), conflictMessage);
  const reloaded = await local.loadBook(baseline.book.id);
  assert.equal(reloaded.elements[0].data.text.content, 'Words saved in the first window');
  assert.equal(reloaded.book.coverColor, baseline.book.coverColor, 'the rejected write must leave the newer book intact');
  assert.equal(conflicts, 1, 'the stale window must receive a distinct conflict notification');
  // Retrying the same stale snapshot must not bypass protection after the first rejection.
  await assert.rejects(second.store.flush(), conflictMessage);
  assert.equal((await local.loadBook(baseline.book.id)).elements[0].data.text.content, 'Words saved in the first window');
});

test('simultaneous first writes from two windows cannot both claim the same new book', async () => {
  const { first, second, local, baseline } = await twoWindows({ persisted: false });
  editText(first, 'First-window candidate');
  editText(second, 'Second-window candidate');
  const outcomes = await Promise.allSettled([first.store.flush(), second.store.flush()]);
  const succeeded = outcomes.filter((result) => result.status === 'fulfilled');
  const rejected = outcomes.filter((result) => result.status === 'rejected');
  assert.equal(succeeded.length, 1, 'only one conflicting first writer may commit');
  assert.equal(rejected.length, 1, 'the other writer must be rejected atomically');
  assert.match(String(rejected[0].reason), conflictMessage);
  const winner = outcomes[0].status === 'fulfilled' ? 'First-window candidate' : 'Second-window candidate';
  assert.equal((await local.loadBook(baseline.book.id)).elements[0].data.text.content, winner);
});

test('simultaneous edits of an existing book preserve the successful writer instead of last-writer overwrite', async () => {
  const { first, second, local, baseline } = await twoWindows();
  editText(first, 'Concurrent text update');
  editCover(second, '#246813');
  const outcomes = await Promise.allSettled([first.store.flush(), second.store.flush()]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1);
  const reloaded = await local.loadBook(baseline.book.id);
  if (outcomes[0].status === 'fulfilled') {
    assert.equal(reloaded.elements[0].data.text.content, 'Concurrent text update');
    assert.equal(reloaded.book.coverColor, baseline.book.coverColor);
  } else {
    assert.equal(reloaded.book.coverColor, '#246813');
    assert.equal(reloaded.elements[0].data.text.content, baseline.elements[0].data.text.content);
  }
});

test('successive saves in one window continue to persist all edits without conflicts', async () => {
  const h = await appHarness();
  const local = await h.get('sync/local');
  let conflicts = 0;
  h.events.addEventListener('mlw:save-conflict', () => conflicts++);
  await h.store.flush();
  editText(h, 'First committed edit');
  const pending = h.store.flush();
  editCover(h, '#789abc');
  await Promise.all([pending, h.store.flush()]);
  editText(h, 'Latest committed edit');
  await h.store.flush();
  const reloaded = await local.loadBook(h.store.getDoc().book.id);
  assert.equal(reloaded.elements[0].data.text.content, 'Latest committed edit');
  assert.equal(reloaded.book.coverColor, '#789abc');
  assert.equal(conflicts, 0);
});

test('an existing legacy book without revision metadata remains editable and saveable', async () => {
  const first = await appHarness();
  const local = await first.get('sync/local');
  await first.store.flush();
  const bookId = first.store.getDoc().book.id;
  // Simulate an actual pre-upgrade row, rather than only stripping a loaded snapshot.
  const db = await openDB('mlw_v2');
  const legacyBook = await db.get('books', bookId);
  delete legacyBook.revision;
  await db.put('books', legacyBook);
  db.close();
  const second = await appHarness();
  const legacy = await local.loadBook(bookId);
  assert.equal(legacy.book.revision, undefined);
  second.store.initStore(legacy);
  editText(second, 'A legacy journal can still be edited');
  editCover(second, '#aabbcc');
  await second.store.flush();
  const reloaded = await local.loadBook(bookId);
  assert.equal(reloaded.elements[0].data.text.content, 'A legacy journal can still be edited');
  assert.equal(reloaded.book.coverColor, '#aabbcc');
});

test('clean reading windows do not claim new revisions or conflict during no-op lifecycle flushes', async () => {
  const { first, second, local, baseline } = await twoWindows();
  let conflicts = 0;
  second.events.addEventListener('mlw:save-conflict', () => conflicts++);
  await first.store.flush();
  assert.equal((await local.loadBook(baseline.book.id)).book.revision, baseline.book.revision, 'flushing a clean book must not create a new write revision');
  await second.store.flush();
  assert.equal(conflicts, 0);
  assert.equal((await local.loadBook(baseline.book.id)).book.revision, baseline.book.revision);
});

const sharedStorage = (h) => Object.fromEntries(h.storage);
const conflictsContain = (bookmarks, text) => JSON.stringify(bookmarks.getDraftConflicts()).includes(text);

async function persistRecovered(h, original, recovered) {
  h.store.initStore(structuredClone(original));
  h.store.update('restore valid interrupted input', (doc) => { doc.elements = structuredClone(recovered.elements); }, { undoable: false });
  await h.store.flush();
}

test('reloading stale text recovery preserves the newer writer and quarantines the older draft', async () => {
  const { first, second, local, baseline } = await twoWindows();
  const id = baseline.elements[0].id;
  const older = 'Older text preserved from a losing window';
  const newer = 'Newer text safely committed by the other window';
  await (await second.get('book/bookmark')).saveDraft(id, older);
  editText(first, newer);
  await first.store.flush();
  editText(second, older);
  await assert.rejects(second.store.flush(), conflictMessage);
  // A real reload sees the same origin's localStorage, including draft-base metadata.
  const reload = await appHarness({ stored: sharedStorage(second) });
  const loaded = await local.loadBook(baseline.book.id);
  const bookmarks = await reload.get('book/bookmark');
  assert.equal(await bookmarks.applyDrafts(loaded), false, 'a conflicting draft must not be applied automatically');
  assert.equal(loaded.elements[0].data.text.content, newer);
  reload.store.initStore(loaded);
  await reload.store.flush();
  assert.equal((await local.loadBook(baseline.book.id)).elements[0].data.text.content, newer);
  assert.equal(typeof bookmarks.getDraftConflicts, 'function', 'quarantined recovery remains accessible for rescue');
  assert.ok(conflictsContain(bookmarks, older), 'preserve the losing draft instead of discarding it');
});

test('an unrelated cover update does not block valid recovery of interrupted text', async () => {
  const { first, second, local, baseline } = await twoWindows();
  const candidate = 'Recover these words after a separate cover edit';
  await (await second.get('book/bookmark')).saveDraft(baseline.elements[0].id, candidate);
  editCover(first, '#345678');
  await first.store.flush();
  const reload = await appHarness({ stored: sharedStorage(second) });
  const loaded = await local.loadBook(baseline.book.id);
  const original = structuredClone(loaded);
  const bookmarks = await reload.get('book/bookmark');
  assert.equal(await bookmarks.applyDrafts(loaded), true, 'compare the original text field, not merely the book revision');
  assert.equal(loaded.elements[0].data.text.content, candidate);
  assert.equal(loaded.book.coverColor, '#345678');
  await persistRecovered(reload, original, loaded);
  const saved = await local.loadBook(baseline.book.id);
  assert.equal(saved.elements[0].data.text.content, candidate);
  assert.equal(saved.book.coverColor, '#345678');
  if (typeof bookmarks.getDraftConflicts === 'function') assert.equal(conflictsContain(bookmarks, candidate), false);
});

test('typing beyond an own in-flight save remains recoverable instead of becoming a false conflict', async () => {
  const h = await appHarness();
  const local = await h.get('sync/local');
  await h.store.flush();
  const bookmarks = await h.get('book/bookmark');
  const id = h.store.getDoc().elements[0].id;
  const committed = 'The first part has been committed';
  const latest = 'The first part has been committed and I kept typing';
  await bookmarks.saveDraft(id, committed);
  editText(h, committed);
  const saving = h.store.flush();
  let completed = false;
  saving.then(() => { completed = true; });
  const pendingDraft = bookmarks.saveDraft(id, latest);
  assert.equal(completed, false, 'new input occurs before the old save finishes');
  await Promise.all([saving, pendingDraft]);
  await h.settle();
  const reload = await appHarness({ stored: sharedStorage(h) });
  const loaded = await local.loadBook(h.store.getDoc().book.id);
  assert.equal(loaded.elements[0].data.text.content, committed);
  const original = structuredClone(loaded);
  const recovery = await reload.get('book/bookmark');
  assert.equal(await recovery.applyDrafts(loaded), true);
  assert.equal(loaded.elements[0].data.text.content, latest);
  await persistRecovered(reload, original, loaded);
  assert.equal((await local.loadBook(loaded.book.id)).elements[0].data.text.content, latest);
  if (typeof recovery.getDraftConflicts === 'function') assert.equal(conflictsContain(recovery, latest), false);
});
