import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

async function openBook(h) {
  const { mountBook } = await h.get('book/Book');
  mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  assert.equal(h.root.querySelector('.desk').dataset.closed, 'false');
}

const liveText = (h) => h.root.querySelector('.canvas-live[aria-live="polite"]')?.textContent ?? '';

test('Tab, Shift+Tab, Escape, and arrow keys select and cycle elements with polite live announcements and no keyboard trap', async () => {
  const h = await appHarness();
  await openBook(h);
  const ops = await h.get('canvas/elements');
  const [left, right] = h.store.getDoc().pages;
  const stickerId = ops.addSticker(left.id, 'star', 1, { x: 0.4, y: 0.5 });
  const photoId = await ops.addPhoto(right.id, new File(['png'], 'good.png', { type: 'image/png' }), { x: 0.5, y: 0.4 });
  const textId = h.store.getDoc().elements.find((e) => e.type === 'text').id;

  const live = h.root.querySelector('.canvas-live[aria-live="polite"]');
  assert.ok(live, 'stage exposes a polite live region for canvas actions');
  assert.equal(live.getAttribute('role'), 'status');

  // Every visible non-ghost element is keyboard-focusable with a descriptive label.
  for (const id of [textId, stickerId, photoId]) {
    const node = h.root.querySelector(`.el[data-el-id="${id}"]:not([data-ghost])`);
    assert.ok(node);
    assert.equal(node.getAttribute('tabindex'), '0');
    assert.equal(node.getAttribute('role'), 'group');
    assert.ok(node.getAttribute('aria-label')?.length > 0);
  }

  // Start from deselected state and press Tab to select the first element on the spread.
  h.fire(h.events, 'keydown', { key: 'Escape' });
  assert.equal(h.root.querySelector('.el.is-selected'), null);

  h.fire(h.events, 'keydown', { key: 'Tab' });
  assert.equal(h.root.querySelector('.el.is-selected')?.dataset.elId, textId);
  assert.equal(h.document.activeElement?.dataset.elId, textId);
  assert.match(liveText(h), /Selected Text:/);

  // Tabbing from a control outside the stage never hijacks Tab even while an element is selected.
  const nextBtn = h.root.querySelector('[data-act="next"]');
  nextBtn.focus();
  const outsideTab = h.fire(nextBtn, 'keydown', { key: 'Tab' });
  assert.equal(outsideTab.defaultPrevented, false);

  // Shift+Tab at the first element exits the stage without trapping focus.
  const textNode = h.root.querySelector(`.el[data-el-id="${textId}"]`);
  textNode.focus();
  const firstShiftTab = h.fire(textNode, 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(firstShiftTab.defaultPrevented, false);

  h.fire(h.events, 'keydown', { key: 'Tab' });
  assert.equal(h.root.querySelector('.el.is-selected')?.dataset.elId, stickerId);
  assert.equal(h.document.activeElement?.dataset.elId, stickerId);
  assert.match(liveText(h), /Selected Sticker:/);

  h.fire(h.events, 'keydown', { key: 'Tab' });
  assert.equal(h.root.querySelector('.el.is-selected')?.dataset.elId, photoId);
  assert.equal(h.document.activeElement?.dataset.elId, photoId);
  assert.match(liveText(h), /Selected Photo/);

  // Tabbing past the last element enters the floating toolbar; Tab past its last button exits the stage.
  h.fire(h.events, 'keydown', { key: 'Tab' });
  assert.ok(h.document.activeElement?.closest('.el-bar'), 'Tab moves into the element actions toolbar');
  const barButtons = [...h.root.querySelectorAll('.el-bar button')];
  const lastBarBtn = barButtons.at(-1);
  lastBarBtn.focus();
  assert.equal(h.fire(lastBarBtn, 'keydown', { key: 'Tab' }).defaultPrevented, false);

  // Shift+Tab from the first toolbar button returns to the selected element.
  barButtons[0].focus();
  h.fire(barButtons[0], 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(h.document.activeElement?.dataset.elId, photoId);

  h.fire(h.events, 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(h.root.querySelector('.el.is-selected')?.dataset.elId, stickerId);

  // F10 opens the element toolbar for any selected element and Escape returns to the element.
  h.fire(h.events, 'keydown', { key: 'F10' });
  assert.ok(h.document.activeElement?.closest('.el-bar'));
  assert.equal(h.document.activeElement?.dataset.cmd, 'effect');
  h.fire(h.document.activeElement, 'keydown', { key: 'ArrowRight' });
  assert.equal(h.document.activeElement?.dataset.cmd, 'front');
  h.fire(h.document.activeElement, 'keydown', { key: 'Escape' });
  assert.equal(h.document.activeElement?.dataset.elId, stickerId);
  assert.equal(h.root.querySelector('.el.is-selected')?.dataset.elId, stickerId);

  // Escape deselects while keeping focus on the element; arrow keys then navigate between elements.
  h.fire(h.events, 'keydown', { key: 'Escape' });
  assert.equal(h.root.querySelector('.el.is-selected'), null);
  assert.match(liveText(h), /Deselected Sticker:/);
  assert.equal(h.document.activeElement?.dataset.elId, stickerId);

  h.fire(h.events, 'keydown', { key: 'ArrowDown' });
  assert.equal(h.root.querySelector('.el.is-selected')?.dataset.elId, photoId);
  assert.match(liveText(h), /Selected Photo/);
});

test('single-page mode excludes the left peek strip from keyboard navigation', async () => {
  const h = await appHarness({ single: true });
  await openBook(h);
  h.root.querySelector('[data-act="layout"]').click();
  h.root.querySelector('[data-act="next"]').click();
  await h.settle();
  const ops = await h.get('canvas/elements');
  const peekPageId = h.root.querySelector('.slot-left .page[data-page-id]')?.dataset.pageId;
  const activePageId = h.root.querySelector('.slot-right .page[data-page-id]')?.dataset.pageId;
  assert.ok(peekPageId && activePageId);
  const hiddenId = ops.addSticker(peekPageId, 'heart', 1, { x: 0.4, y: 0.4 });
  const visibleId = ops.addSticker(activePageId, 'star', 1, { x: 0.4, y: 0.4 });

  const peekNode = h.root.querySelector(`.slot-left .el[data-el-id="${hiddenId}"]`);
  assert.equal(peekNode?.getAttribute('tabindex'), '-1');
  assert.equal(peekNode?.getAttribute('aria-hidden'), 'true');
  const activeNode = h.root.querySelector(`.slot-right .el[data-el-id="${visibleId}"]`);
  assert.equal(activeNode?.getAttribute('tabindex'), '0');
});

test('arrow keys move selected elements (Shift for larger steps), clamp at edges, and support Undo/Redo', async () => {
  const h = await appHarness();
  await openBook(h);
  const ops = await h.get('canvas/elements');
  const [left] = h.store.getDoc().pages;
  const id = ops.addSticker(left.id, 'heart', 1, { x: 0.4, y: 0.4 });
  const node = h.root.querySelector(`.el[data-el-id="${id}"]`);
  node.focus();
  assert.equal(h.root.querySelector('.el.is-selected')?.dataset.elId, id);

  const x0 = h.store.getDoc().elements.find((e) => e.id === id).x;
  const y0 = h.store.getDoc().elements.find((e) => e.id === id).y;

  h.fire(h.events, 'keydown', { key: 'ArrowRight' });
  const afterSmall = h.store.getDoc().elements.find((e) => e.id === id);
  const smallDx = afterSmall.x - x0;
  assert.ok(Math.abs(smallDx - 0.02) < 1e-6, `expected +0.02 step, got ${smallDx}`);
  assert.match(liveText(h), /Moved Sticker:.*to \d+%, \d+%/);
  assert.ok(h.document.activeElement?.isConnected, 'focus remains on the re-rendered element');
  assert.equal(h.document.activeElement?.dataset.elId, id);

  h.fire(h.events, 'keydown', { key: 'ArrowDown', shiftKey: true });
  const afterLarge = h.store.getDoc().elements.find((e) => e.id === id);
  const largeDy = afterLarge.y - y0;
  assert.ok(Math.abs(largeDy - 0.08) < 1e-6, `expected +0.08 Shift step, got ${largeDy}`);
  assert.ok(largeDy > smallDx * 3, 'Shift + arrow moves by a larger step');

  // Undo and Redo via keyboard shortcuts restore positions and announce in live region.
  h.fire(h.events, 'keydown', { key: 'z', ctrlKey: true });
  assert.ok(Math.abs(h.store.getDoc().elements.find((e) => e.id === id).y - y0) < 1e-6);
  assert.match(liveText(h), /Undid last change/);

  h.fire(h.events, 'keydown', { key: 'z', ctrlKey: true, shiftKey: true });
  assert.ok(Math.abs(h.store.getDoc().elements.find((e) => e.id === id).y - (y0 + 0.08)) < 1e-6);
  assert.match(liveText(h), /Redid change/);

  // Repeated edge presses do not push empty undo steps and announce the page edge.
  ops.patchElement(id, { x: -0.16 });
  h.fire(h.events, 'keydown', { key: 'ArrowLeft', shiftKey: true });
  const undoDepthBeforeEdge = h.store.getDoc().elements.find((e) => e.id === id).x;
  h.fire(h.events, 'keydown', { key: 'ArrowLeft', shiftKey: true });
  assert.match(liveText(h), /At page edge/);
  h.fire(h.events, 'keydown', { key: 'z', ctrlKey: true });
  assert.notEqual(h.store.getDoc().elements.find((e) => e.id === id).x, undoDepthBeforeEdge);
});

test('Alt + arrow keys resize and [ / ] rotate while preserving one-page text width', async () => {
  const h = await appHarness();
  await openBook(h);
  const ops = await h.get('canvas/elements');
  const [left] = h.store.getDoc().pages;
  const stickerId = ops.addSticker(left.id, 'star', 1, { x: 0.4, y: 0.4 });
  h.root.querySelector(`.el[data-el-id="${stickerId}"]`).focus();

  const w0 = h.store.getDoc().elements.find((e) => e.id === stickerId).w;
  h.fire(h.events, 'keydown', { key: 'ArrowRight', altKey: true });
  const w1 = h.store.getDoc().elements.find((e) => e.id === stickerId).w;
  assert.ok(Math.abs(w1 - (w0 + 0.04)) < 1e-6);
  assert.match(liveText(h), /Resized Sticker:.*to \d+% width/);

  h.fire(h.events, 'keydown', { key: 'ArrowUp', altKey: true, shiftKey: true });
  const w2 = h.store.getDoc().elements.find((e) => e.id === stickerId).w;
  assert.ok(Math.abs(w2 - (w1 + 0.12)) < 1e-6);

  h.fire(h.events, 'keydown', { key: 'ArrowLeft', altKey: true });
  const w3 = h.store.getDoc().elements.find((e) => e.id === stickerId).w;
  assert.ok(Math.abs(w3 - (w2 - 0.04)) < 1e-6);

  const rot0 = h.store.getDoc().elements.find((e) => e.id === stickerId).rot;
  h.fire(h.events, 'keydown', { key: ']' });
  assert.equal(h.store.getDoc().elements.find((e) => e.id === stickerId).rot, Math.round((rot0 + 5) * 10) / 10);
  assert.match(liveText(h), /Rotated Sticker:.*to -?\d+ degrees/);

  // Text elements keep w === 1 and scale data.text.size on Alt + Arrow.
  const textId = h.store.getDoc().elements.find((e) => e.type === 'text').id;
  h.root.querySelector(`.el[data-el-id="${textId}"]`).focus();
  const s0 = h.store.getDoc().elements.find((e) => e.id === textId).data.text.size ?? 1;
  h.fire(h.events, 'keydown', { key: 'ArrowUp', altKey: true });
  const textEl = h.store.getDoc().elements.find((e) => e.id === textId);
  assert.equal(textEl.w, 1);
  assert.ok(Math.abs(textEl.data.text.size - (s0 + 0.1)) < 1e-6);
  assert.match(liveText(h), /Resized Text:.*to \d+% text size/);
});

test('Delete removes the selected element, Enter edits text and returns focus on Escape, and pointer taps preserve pointer behavior', async () => {
  const h = await appHarness();
  await openBook(h);
  const ops = await h.get('canvas/elements');
  const [left] = h.store.getDoc().pages;
  const textId = h.store.getDoc().elements.find((e) => e.type === 'text').id;
  h.root.querySelector(`.el[data-el-id="${textId}"]`).focus();
  h.fire(h.events, 'keydown', { key: 'Enter' });
  const body = h.root.querySelector(`.el[data-el-id="${textId}"] .el-text-body`);
  assert.equal(h.document.activeElement, body);
  h.fire(body, 'keydown', { key: 'Escape' });
  assert.equal(h.document.activeElement?.dataset.elId, textId);
  assert.match(liveText(h), /Finished editing/);

  const id = ops.addSticker(left.id, 'heart', 1, { x: 0.4, y: 0.4 });
  h.root.querySelector(`.el[data-el-id="${id}"]`).focus();

  h.fire(h.events, 'keydown', { key: 'Delete' });
  assert.equal(h.store.getDoc().elements.some((e) => e.id === id), false);
  assert.equal(h.root.querySelector('.el.is-selected'), null);
  assert.match(liveText(h), /Deleted Sticker:/);

  h.fire(h.events, 'keydown', { key: 'z', ctrlKey: true });
  assert.equal(h.store.getDoc().elements.some((e) => e.id === id), true);

  // Pointer selection (even when browser fires focusin on pointerdown) + Undo button outside stage does not steal focus.
  const stickerNode = h.root.querySelector(`.el[data-el-id="${id}"]`);
  h.fire(stickerNode, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 250, timeStamp: 100 });
  h.fire(stickerNode, 'focusin');
  h.fire(stickerNode, 'pointerup', { pointerId: 1, clientX: 200, clientY: 250, timeStamp: 140 });
  const undoBtn = h.root.querySelector('[data-act="undo"]');
  undoBtn.focus();
  undoBtn.click();
  assert.equal(h.document.activeElement, undoBtn);
});

test('keyboard tear shortcut (T), TearTool modal controls/keys, pointer tear button, Undo/Redo, and reduced-motion work cleanly', async () => {
  const h = await appHarness();
  await openBook(h);
  h.media.get('(prefers-reduced-motion: reduce)').matches = true;
  const ops = await h.get('canvas/elements');
  const [left] = h.store.getDoc().pages;
  const photoId = await ops.addPhoto(left.id, new File(['png'], 'good.png', { type: 'image/png' }), { x: 0.5, y: 0.4 });
  h.root.querySelector(`.el[data-el-id="${photoId}"]`).focus();

  // Pressing T on the focused photo opens the TearTool modal without modifying the photo yet.
  h.fire(h.events, 'keydown', { key: 't' });
  assert.match(liveText(h), /Opened tear tool/);
  assert.ok(h.document.querySelector('.tear-tool'), 'T opens the TearTool modal');

  // Inside TearTool, pressing T / clicking Tear edge generates a cut with visible 1/2 labels.
  const cutBtn = h.document.querySelector('[data-tt="cut"]');
  assert.ok(cutBtn, 'TearTool exposes a keyboard Tear edge button');
  cutBtn.click();
  assert.equal(h.document.querySelector('[data-tt="done"]').disabled, true);
  assert.equal(h.document.querySelector('[data-tt="keep-0"]').hidden, false);
  assert.equal(h.document.querySelector('[data-tt="keep-1"]').hidden, false);
  assert.equal(h.document.querySelector('.tt-label-0')?.style.display, '');
  const firstPreview = h.document.querySelector('.tt-a')?.getAttribute('points');

  // Pressing T again previews another angle without needing Escape first.
  h.fire(h.events, 'keydown', { key: 't' });
  assert.notEqual(h.document.querySelector('.tt-a')?.getAttribute('points'), firstPreview);

  // Focusing Keep piece 1 highlights piece 0; Escape cancels only the pending cut without closing TearTool.
  const keep0 = h.document.querySelector('[data-tt="keep-0"]');
  keep0.focus();
  h.fire(keep0, 'focus');
  assert.equal(h.document.querySelector('.tear-tool')?.dataset.preview, '0');
  h.fire(keep0, 'keydown', { key: 'Escape' });
  assert.ok(h.document.querySelector('.tear-tool'), 'Escape on pending preview keeps TearTool open');
  assert.equal(h.document.querySelector('[data-tt="keep-0"]').hidden, true);

  // Generate cut, choose piece 1 with key '1', and commit with Done.
  h.fire(h.events, 'keydown', { key: 't' });
  h.fire(h.events, 'keydown', { key: '1' });
  assert.equal(h.document.querySelector('[data-tt="done"]').disabled, false);
  assert.notEqual(h.document.activeElement, h.document.querySelector('[data-tt="keep-0"]'), 'focus moves off hidden keep button');
  h.document.querySelector('[data-tt="done"]').click();

  assert.equal(h.document.querySelector('.tear-tool'), null);
  assert.equal(h.document.activeElement?.dataset.elId, photoId, 'focus returns to the photo element after closing TearTool');
  assert.match(liveText(h), /Applied torn edge to photo/);

  const photo = h.store.getDoc().elements.find((e) => e.id === photoId).data.photo;
  assert.equal(photo.frame, 'torn');
  assert.ok(Array.isArray(photo.clip) && photo.clip.length >= 3);
  const clip = JSON.stringify(photo.clip);

  // Existing pointer behavior: clicking the toolbar Tear button on a torn photo opens TearTool.
  const tearBtn = h.root.querySelector('.el-bar [data-cmd="tear"]');
  assert.ok(tearBtn, 'torn photo exposes Tear more button in floating toolbar');
  tearBtn.click();
  assert.ok(h.document.querySelector('.tear-tool'), 'clicking toolbar Tear button opens TearTool as before');
  h.document.querySelector('[data-tt="cancel"]').click();

  // Undo restores the untorn photo, Redo restores the torn photo.
  h.store.undo();
  assert.equal(h.store.getDoc().elements.find((e) => e.id === photoId).data.photo.frame, 'none');
  assert.equal(h.store.getDoc().elements.find((e) => e.id === photoId).data.photo.clip, undefined);
  h.store.redo();
  assert.equal(JSON.stringify(h.store.getDoc().elements.find((e) => e.id === photoId).data.photo.clip), clip);
});
