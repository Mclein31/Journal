import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

// DOM/download construction is exercised here; no native browser or filesystem download is claimed.
function captureDownloads(h, t) {
  const prototype = h.window.HTMLAnchorElement.prototype;
  const original = prototype.click;
  const downloads = [];
  prototype.click = function () {
    downloads.push({ filename: this.download, blob: resolveObjectURL(this.href) });
  };
  t.after(() => { prototype.click = original; });
  return downloads;
}

async function waitForBoot(h) {
  for (let i = 0; i < 12 && !h.root.querySelector('.desk, .boot-error'); i++) await h.settle();
  assert.equal(h.root.querySelector('.boot-error'), null);
  assert.ok(h.root.querySelector('.desk'), 'the actual boot path finished mounting the app');
}

async function prepareTwoWindows() {
  const winner = await appHarness();
  const local = await winner.get('sync/local');
  await winner.store.flush();
  const baseline = await local.loadBook(winner.store.getDoc().book.id);
  const stale = await appHarness();
  stale.store.initStore(structuredClone(baseline));
  return { winner, stale, local, baseline };
}

const setText = (h, text) => h.store.update('edit from this window', (doc) => { doc.elements[0].data.text.content = text; });

test('a stale-window save opens the conflict dialog and downloads the unsaved journal and pending words', async (t) => {
  const { winner, stale, local, baseline } = await prepareTwoWindows();
  (await stale.get('book/Book')).mountBook(stale.root, stale.store.getDoc());
  const losingText = 'Unsaved work from the stale window must remain exportable';
  await (await stale.get('book/bookmark')).saveDraft(baseline.elements[0].id, losingText);
  setText(winner, 'The other window saved the latest words');
  await winner.store.flush();
  setText(stale, losingText);
  await assert.rejects(stale.store.flush(), /another|changed|revision|conflict/i);
  const dialog = stale.document.querySelector('.save-conflict');
  assert.ok(dialog?.hasAttribute('open'), 'a real save-conflict event opens the modal');
  assert.match(dialog.querySelector('h2').textContent, /another window/i);
  assert.equal(stale.fire(dialog, 'cancel').defaultPrevented, true, 'Escape cannot silently abandon unsaved work');
  const downloads = captureDownloads(stale, t);
  dialog.querySelector('[data-conflict="download"]').click();
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, 'dear-days-unsaved-changes.json');
  assert.ok(downloads[0].blob instanceof Blob);
  const exported = JSON.parse(await downloads[0].blob.text());
  assert.equal(exported.journal.book.id, baseline.book.id);
  assert.equal(exported.journal.elements[0].data.text.content, losingText);
  assert.equal(exported.pendingDrafts[baseline.elements[0].id], losingText);
  assert.equal((await local.loadBook(baseline.book.id)).elements[0].data.text.content, 'The other window saved the latest words');
});

test('boot quarantines stale recovery, downloads it, and Keep latest clears quarantine without replacing winning text', async (t) => {
  const { winner, stale, local, baseline } = await prepareTwoWindows();
  await local.setMeta('activeBookId', baseline.book.id);
  const olderText = 'Older interrupted text needs a separate rescue copy';
  const winningText = 'Winning text stays intact during conflict recovery';
  await (await stale.get('book/bookmark')).saveDraft(baseline.elements[0].id, olderText);
  setText(winner, winningText);
  await winner.store.flush();
  const reload = await appHarness({ stored: Object.fromEntries(stale.storage) });
  await reload.get('main');
  await waitForBoot(reload);
  const dialog = reload.document.querySelector('.save-conflict');
  assert.ok(dialog?.hasAttribute('open'));
  assert.match(dialog.querySelector('h2').textContent, /older draft/i);
  assert.equal(reload.store.getDoc().elements[0].data.text.content, winningText);
  const bookmarks = await reload.get('book/bookmark');
  assert.equal(bookmarks.getDraftConflicts()[baseline.elements[0].id], olderText);
  const downloads = captureDownloads(reload, t);
  dialog.querySelector('[data-conflict="download"]').click();
  assert.equal(downloads.length, 1);
  const exported = JSON.parse(await downloads[0].blob.text());
  assert.equal(exported.olderDrafts[baseline.elements[0].id], olderText);
  assert.equal(exported.journal.elements[0].data.text.content, winningText);
  dialog.querySelector('[data-conflict="continue"]').click();
  await reload.settle();
  assert.equal(reload.document.querySelector('.save-conflict'), null);
  assert.equal(Object.keys(bookmarks.getDraftConflicts()).length, 0);
  assert.equal(Object.keys((await local.getMeta('drafts'))?.__draftConflicts ?? {}).length, 0);
  assert.equal((await local.loadBook(baseline.book.id)).elements[0].data.text.content, winningText);
  const nextReload = await appHarness({ stored: Object.fromEntries(reload.storage) });
  await nextReload.get('main');
  await waitForBoot(nextReload);
  assert.equal(nextReload.document.querySelector('.save-conflict'), null, 'acknowledged older drafts do not reappear on another reload');
  assert.equal(nextReload.store.getDoc().elements[0].data.text.content, winningText);
});
