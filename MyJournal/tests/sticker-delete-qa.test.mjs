import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

// Global keyboard routing is simulated; native editing itself remains the browser's responsibility.
async function stickerInOpenTray() {
  const h = await appHarness();
  (await h.get('book/Book')).mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  h.root.querySelector('[data-act="add-sticker"]').click();
  await h.settle();
  const button = h.document.querySelector('[data-g="grid"] [aria-label="Add Ceramic coffee sticker"]');
  button.click();
  button.focus();
  const sticker = h.store.getDoc().elements.find((element) => element.data.sticker?.stickerId === 'g-coffee');
  assert.ok(sticker);
  assert.ok(h.document.querySelector('.sticker-sheet[open]'));
  assert.equal(h.root.querySelector('.el.is-selected')?.dataset.elId, sticker.id);
  return { h, button, sticker };
}

for (const key of ['Delete', 'Backspace']) {
  test(`${key} from a sticker-tray button deletes the selected placed sticker while leaving the tray open`, async () => {
    const { h, button, sticker } = await stickerInOpenTray();
    const event = h.fire(h.events, 'keydown', { key, target: button });
    assert.equal(event.defaultPrevented, true, 'the selected sticker owns this deletion key');
    assert.equal(h.store.getDoc().elements.some((element) => element.id === sticker.id), false);
    assert.equal(h.root.querySelector(`[data-el-id="${sticker.id}"]`), null);
    assert.ok(h.document.querySelector('.sticker-sheet[open]'));
  });

  test(`${key} in the sticker search field keeps native text editing and does not delete the placed sticker`, async () => {
    const { h, sticker } = await stickerInOpenTray();
    const input = h.document.querySelector('[aria-label="Find stickers"]');
    input.value = 'coffee';
    input.focus();
    const event = h.fire(h.events, 'keydown', { key, target: input });
    assert.equal(event.defaultPrevented, false, 'the app must leave search text deletion to the browser');
    assert.ok(h.store.getDoc().elements.some((element) => element.id === sticker.id));
    assert.ok(h.root.querySelector(`[data-el-id="${sticker.id}"]`));
  });
}

for (const panel of ['customize', 'sections']) {
  test(`the ${panel} dialog continues to own Delete/Backspace even when a sticker drawer also exists`, async () => {
    const { h, sticker } = await stickerInOpenTray();
    if (panel === 'customize') (await h.get('customize/CustomizePanel')).openCustomizePanel();
    else (await h.get('book/SectionManager')).openSectionManager();
    const dialogs = [...h.document.querySelectorAll('dialog[open]')];
    const topDialog = dialogs.at(-1);
    assert.notEqual(topDialog, h.document.querySelector('.sticker-sheet'));
    const control = topDialog.querySelector('button');
    control.focus();
    for (const key of ['Delete', 'Backspace']) {
      const event = h.fire(h.events, 'keydown', { key, target: control });
      assert.equal(event.defaultPrevented, false);
      assert.ok(h.store.getDoc().elements.some((element) => element.id === sticker.id));
    }
  });
}

test('sticker deletion can be undone and redone without closing the tray', async () => {
  const { h, button, sticker } = await stickerInOpenTray();
  h.fire(h.events, 'keydown', { key: 'Delete', target: button });
  assert.equal(h.store.getDoc().elements.some((el) => el.id === sticker.id), false);
  h.fire(h.events, 'keydown', { key: 'z', ctrlKey: true, target: button });
  assert.ok(h.store.getDoc().elements.some((el) => el.id === sticker.id));
  h.fire(h.events, 'keydown', { key: 'z', ctrlKey: true, shiftKey: true, target: button });
  assert.equal(h.store.getDoc().elements.some((el) => el.id === sticker.id), false);
  assert.ok(h.document.querySelector('.sticker-sheet[open]'));
});

test('opening the sticker tray without placing a sticker does not allow deleting selected text behind it', async () => {
  const h = await appHarness();
  (await h.get('book/Book')).mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  const text = h.store.getDoc().elements.find((element) => element.type === 'text');
  const node = h.root.querySelector(`[data-el-id="${text.id}"]`);
  h.fire(node, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250, timeStamp: 100 });
  h.fire(node, 'pointerup', { pointerId: 1, clientX: 150, clientY: 250, timeStamp: 120 });
  h.root.querySelector('[data-act="add-sticker"]').click();
  await h.settle();
  const control = h.document.querySelector('.sticker-sheet .st-cat');
  control.focus();
  const event = h.fire(h.events, 'keydown', { key: 'Delete', target: control });
  assert.equal(event.defaultPrevented, false);
  assert.ok(h.store.getDoc().elements.some((element) => element.id === text.id));
});
