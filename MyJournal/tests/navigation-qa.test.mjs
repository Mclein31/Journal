import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

// Real application modules under a simulated DOM; native focus/rendering still need device QA.
async function openApp() {
  const h = await appHarness();
  (await h.get('book/Book')).mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  assert.equal(h.root.querySelector('.desk').dataset.closed, 'false');
  return h;
}

function tapPaper(h, side, pointerId = 1) {
  const sheet = h.root.querySelector(`.slot-${side} .page-sheet`);
  const clientX = side === 'left' ? 150 : 600;
  h.fire(sheet, 'pointerdown', { pointerId, clientX, clientY: 250, timeStamp: pointerId * 500 });
  h.fire(sheet, 'pointerup', { pointerId, clientX, clientY: 250, timeStamp: pointerId * 500 + 20 });
}

const shownPages = (h) => [...h.root.querySelectorAll('.slot .page[data-page-id]')].map((page) => page.dataset.pageId);
const rowNamed = (h, name) => [...h.document.querySelectorAll('.sec-row')].find((row) => row.querySelector('.sec-name').value === name);

test('reordering a section preserves the currently open pages by identity', async () => {
  const h = await openApp();
  h.root.querySelector('[aria-label="Go to Memories"]').click();
  await h.settle();
  const before = shownPages(h);
  assert.match(h.root.querySelector('.nav-label').textContent, /^Memories/);
  h.root.querySelector('[data-act="sections"]').click();
  rowNamed(h, 'Memories').querySelector('[data-act="up"]').click();
  assert.deepEqual(shownPages(h), before, 'reordering should move tabs/pages without navigating to another section');
  assert.match(h.root.querySelector('.nav-label').textContent, /^Memories/);
});

test('one-page mode follows the active right page and preserves it through layout round-trips', async () => {
  const h = await openApp();
  const rightId = h.root.querySelector('.slot-right .page').dataset.pageId;
  tapPaper(h, 'right');
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.root.querySelector('.book').dataset.mode, 'single');
  assert.equal(h.root.querySelector('.slot-right .page').dataset.pageId, rightId, 'one-page mode should show the selected page, including the right side');
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.root.querySelector('.book').dataset.mode, 'spread');
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.root.querySelector('.slot-right .page').dataset.pageId, rightId);
});

test('a bookmark can move between the two visible pages and toggles off only on its own active page', async () => {
  const h = await openApp();
  const [leftId, rightId] = shownPages(h);
  const { getBookmark } = await h.get('book/bookmark');
  const bookmark = () => getBookmark(h.store.getDoc().book.id);
  tapPaper(h, 'left', 1);
  h.root.querySelector('[data-act="bookmark"]').click();
  await h.settle();
  assert.equal((await bookmark()).pageId, leftId);
  tapPaper(h, 'right', 2);
  h.root.querySelector('[data-act="bookmark"]').click();
  await h.settle();
  assert.equal((await bookmark())?.pageId, rightId, 'choosing the other visible page moves the bookmark instead of deleting it');
  h.root.querySelector('[data-act="bookmark"]').click();
  await h.settle();
  assert.equal(await bookmark(), null);
});

test('keyboard section reordering keeps focus on a connected control in the moved section', async () => {
  const h = await openApp();
  h.root.querySelector('[data-act="sections"]').click();
  const button = rowNamed(h, 'Memories').querySelector('[data-act="up"]');
  button.focus();
  // HTMLElement.click is the activation event emitted by Enter/Space on a button.
  button.click();
  const focused = h.document.activeElement;
  assert.ok(focused?.isConnected, 'redrawing rows must not detach the active control without restoring focus');
  assert.equal(focused.closest('.sec-row')?.querySelector('.sec-name').value, 'Memories');
  assert.ok(['BUTTON', 'INPUT'].includes(focused.tagName));
});

test('Undo commits active text before changing history, and Redo restores the typed content', async () => {
  const h = await openApp();
  const element = h.store.getDoc().elements.find((item) => item.type === 'text');
  const previousText = element.data.text.content;
  (await h.get('canvas/elements')).patchElement(element.id, { data: { text: { ...element.data.text, color: '#ff0000' } } }, 'text:ink');
  const node = h.root.querySelector(`[data-el-id="${element.id}"]`);
  for (const pointerId of [1, 2]) {
    h.fire(node, 'pointerdown', { pointerId, clientX: 150, clientY: 250, timeStamp: 100 + pointerId * 500 });
    h.fire(node, 'pointerup', { pointerId, clientX: 150, clientY: 250, timeStamp: 120 + pointerId * 500 });
  }
  const body = node.querySelector('.el-text-body');
  body.textContent = 'Typed text that has not blurred yet';
  h.fire(body, 'input');
  // Programmatic/accessibility activation can dispatch click without a preceding focus/blur.
  h.root.querySelector('[data-act="undo"]').click();
  const afterUndo = h.store.getDoc().elements.find((item) => item.id === element.id).data.text;
  assert.equal(afterUndo.content, previousText, 'Undo should undo the most recent typed change');
  assert.equal(afterUndo.color, '#ff0000', 'the earlier ink change should remain');
  assert.equal(h.store.canRedo(), true);
  h.root.querySelector('[data-act="redo"]').click();
  assert.equal(h.store.getDoc().elements.find((item) => item.id === element.id).data.text.content, 'Typed text that has not blurred yet');
});

test('unsupported file drops are prevented and explain which file types can be added', async () => {
  const h = await openApp();
  const event = h.fire(h.root.querySelector('.stage'), 'drop', {
    clientX: 600, clientY: 250,
    dataTransfer: { types: ['Files'], files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] },
  });
  assert.equal(event.defaultPrevented, true, 'an unsupported file must not trigger browser navigation');
  assert.equal(h.store.getDoc().elements.filter((item) => item.type === 'photo').length, 0);
  assert.match(h.document.querySelector('.toast')?.textContent ?? '', /image|unsupported|JPG|PNG/i);
});

test('mixed file drops keep valid images and report skipped unsupported files', async () => {
  const h = await openApp();
  const event = h.fire(h.root.querySelector('.slot-right .page-sheet'), 'drop', {
    clientX: 600, clientY: 250,
    dataTransfer: { types: ['Files'], files: [new File(['image'], 'good.png', { type: 'image/png' }), new File(['notes'], 'notes.txt', { type: 'text/plain' })] },
  });
  await h.settle();
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.store.getDoc().elements.filter((item) => item.type === 'photo').length, 1);
  assert.match(h.document.querySelector('.toast')?.textContent ?? '', /unsupported|skipped|not.*image|only image/i);
});

test('dropping onto the right half of a left-owned spanning item assigns the image to the physical right page', async () => {
  const h = await openApp();
  const [left, right] = h.store.getDoc().pages;
  const ops = await h.get('canvas/elements');
  const sticker = ops.addSticker(left.id, 'g-coffee', 1);
  ops.patchElement(sticker, { x: .9, y: .2, w: .5, rot: 0 });
  const rect = (left, width) => ({ left, top: 100, width, height: 600, right: left + width, bottom: 700, x: left, y: 100, toJSON() {} });
  h.root.querySelector('.stage').getBoundingClientRect = () => rect(100, 800);
  h.root.querySelector('.slot-left .page-sheet').getBoundingClientRect = () => rect(100, 400);
  h.root.querySelector('.slot-right .page-sheet').getBoundingClientRect = () => rect(500, 400);
  const spanningItem = h.root.querySelector(`[data-el-id="${sticker}"]`);
  assert.equal(spanningItem.dataset.ownerPage, left.id);
  const event = h.fire(spanningItem, 'drop', {
    clientX: 600, clientY: 250,
    dataTransfer: { types: ['Files'], files: [new File(['photo'], 'good.png', { type: 'image/png' })] },
  });
  await h.settle();
  assert.equal(event.defaultPrevented, true);
  const photo = h.store.getDoc().elements.find((element) => element.type === 'photo');
  assert.ok(photo);
  assert.equal(photo.pageId, right.id, 'the physical drop point determines ownership, not the spanning item underneath it');
  assert.ok(Math.abs(photo.x) < 1e-9, 'a centered drop at x=.25 uses right-page coordinates');
  tapPaper(h, 'right', 3);
  h.root.querySelector('[data-act="layout"]').click();
  assert.equal(h.root.querySelector('.book').dataset.mode, 'single');
  assert.equal(h.root.querySelector('.slot-right .page').dataset.pageId, right.id);
  assert.ok(h.root.querySelector(`[data-el-id="${photo.id}"]`), 'the dropped photo remains present when viewing its actual page alone');
});
