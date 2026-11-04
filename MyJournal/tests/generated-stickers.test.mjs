import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { appHarness } from './helpers/app.mjs';

const expected = [
  ['a-white-roses', 'white-roses', 'flowers'],
  ['a-white-lilies', 'white-lilies', 'flowers'],
  ['a-white-orchids', 'white-orchids', 'flowers'],
  ['a-chamomile-study', 'chamomile', 'flowers'],
  ['a-eucalyptus', 'eucalyptus', 'nature'],
  ['a-lavender-sprigs', 'lavender', 'nature'],
  ['a-linen-ribbon', 'linen-ribbon', 'journal'],
  ['g-blush-peonies', 'blush-peonies', 'flowers'],
  ['a-swallowtail', 'butterfly', 'nature'],
  ['g-coffee', 'coffee', 'cozy'],
  ['g-camera', 'camera', 'cozy'],
  ['g-headphones', 'headphones', 'cozy'],
  ['g-books', 'books', 'cozy'],
  ['g-backpack', 'backpack', 'travel'],
  ['g-sneakers', 'sneakers', 'cozy'],
  ['g-ramen', 'ramen', 'cozy'],
  ['g-moon', 'moon', 'nature'],
  ['g-mountains', 'mountains', 'travel'],
  ['g-mushrooms', 'mushrooms', 'nature'],
  ['g-fern', 'fern', 'nature'],
  ['g-seashell', 'seashell', 'nature'],
  ['g-compass', 'compass', 'travel'],
  ['g-vinyl', 'vinyl', 'cozy'],
  ['g-paper-collage', 'paper-collage', 'journal'],
  ['g-notebook', 'notebook', 'journal'],
  ['g-campfire', 'campfire', 'travel'],
  ['g-bicycle', 'bicycle', 'travel'],
  ['g-croissant', 'croissant', 'cozy'],
  ['g-art-supplies', 'art-supplies', 'journal'],
  ['g-cat', 'cat', 'nature'],
];

async function registry() {
  const h = await appHarness();
  return { h, ...(await h.get('stickers/packs')) };
}

test('visible artwork is exclusively the 30 generated rasters with stable saved-page identifiers', async () => {
  const { STICKERS, stickerDef, stickerUri, CATEGORIES } = await registry();
  assert.equal(STICKERS.length, expected.length);
  for (const [id, filename, category] of expected) {
    const sticker = stickerDef(id);
    assert.ok(sticker, id);
    assert.equal(STICKERS.find((item) => item.id === id), sticker);
    assert.equal(sticker.src, `/stickers/generated/${filename}.png`);
    assert.equal(stickerUri(sticker), sticker.src);
    assert.equal(sticker.cat, category);
    assert.equal(sticker.aspect, 1);
    assert.equal(sticker.svg, undefined, 'coded SVG art must not reappear in the visible catalog');
  }
  assert.deepEqual(Array.from(CATEGORIES, ({ label }) => label), ['Studio', 'Flowers', 'Nature', 'Everyday', 'Adventure', 'Details']);
});

test('the Studio tray shows every raster while curated categories show their complete subsets', async () => {
  const { h } = await registry();
  (await h.get('stickers/StickerTray')).openStickerTray(() => {});
  const grid = () => h.document.querySelector('[data-g="grid"]');
  assert.equal(grid().querySelectorAll('.st-item').length, expected.length);
  assert.ok([...grid().querySelectorAll('img')].every((img) => img.getAttribute('src').endsWith('.png')));
  for (const [label, count] of [['Flowers', 5], ['Nature', 8], ['Everyday', 8], ['Adventure', 5], ['Details', 4], ['Studio', 30]]) {
    [...h.document.querySelectorAll('.st-cat')].find((button) => button.textContent === label).click();
    assert.equal(grid().querySelectorAll('.st-item').length, count, label);
  }
});

test('search finds White roses using its raster thumbnail and original placement ID', async () => {
  const { h } = await registry();
  let picked;
  (await h.get('stickers/StickerTray')).openStickerTray((id, aspect) => { picked = { id, aspect }; });
  const search = h.document.querySelector('[aria-label="Find stickers"]');
  search.value = 'White roses';
  h.fire(search, 'input');
  const button = h.document.querySelector('[data-g="grid"] .st-item');
  assert.equal(h.document.querySelectorAll('[data-g="grid"] .st-item').length, 1);
  assert.equal(button.querySelector('img').getAttribute('src'), '/stickers/generated/white-roses.png');
  button.click();
  assert.deepEqual(picked, { id: 'a-white-roses', aspect: 1 });
});

test('saved legacy art and recents continue to resolve without returning to the visible catalog', async () => {
  const { STICKERS, stickerDef, stickerUri } = await registry();
  for (const id of ['heart', 'star', 'flower', 'a-pressed-poppy', 'a-fern-frond']) {
    const legacy = stickerDef(id);
    assert.ok(legacy, id);
    assert.match(stickerUri(legacy), /^data:image\/svg\+xml,/);
    assert.equal(STICKERS.some((item) => item.id === id), false);
  }
  const recentHarness = await appHarness({ stored: { 'mlw:recent-stickers': '["heart","a-white-roses"]' } });
  (await recentHarness.get('stickers/StickerTray')).openStickerTray(() => {});
  const recent = recentHarness.document.querySelector('[data-g="recent"]');
  assert.match(recent.querySelector('[aria-label="Add Heart sticker"] img').getAttribute('src'), /^data:image\/svg\+xml,/);
  assert.equal(recent.querySelector('[aria-label="Add White roses sticker"] img').getAttribute('src'), '/stickers/generated/white-roses.png');
});

function decodedAlpha(bytes) {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8, 'PNG decoder expects 8-bit channels');
  assert.equal(bytes[25], 6, 'artwork must have RGBA channels');
  assert.equal(bytes[28], 0, 'PNG decoder expects non-interlaced artwork');
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4 + 1;
  assert.equal(raw.length, stride * height);
  let previous = new Uint8Array(width);
  let transparent = 0, visible = 0, softened = 0;
  const paeth = (left, above, upperLeft) => {
    const predicted = left + above - upperLeft;
    const a = Math.abs(predicted - left), b = Math.abs(predicted - above), c = Math.abs(predicted - upperLeft);
    return a <= b && a <= c ? left : b <= c ? above : upperLeft;
  };
  // PNG filters operate independently on each channel. Only alpha needs decoding here.
  for (let y = 0; y < height; y++) {
    const row = y * stride, filter = raw[row];
    assert.ok(filter >= 0 && filter <= 4, 'valid PNG scanline filter');
    const current = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      const left = x ? current[x - 1] : 0, above = previous[x], upperLeft = x ? previous[x - 1] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
      const alpha = (raw[row + 1 + x * 4 + 3] + predictor) & 255;
      current[x] = alpha;
      if (alpha === 0) transparent++;
      if (alpha > 0) visible++;
      if (alpha > 0 && alpha < 255) softened++;
    }
    previous = current;
  }
  return { width, height, transparent, visible, softened };
}

test('every generated sticker is a high-resolution square PNG containing genuinely transparent pixels and visible artwork', async () => {
  for (const [, filename] of expected) {
    const bytes = await readFile(new URL(`../public/stickers/generated/${filename}.png`, import.meta.url));
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), filename);
    const { width, height, transparent, visible, softened } = decodedAlpha(bytes);
    assert.ok(width >= 1024, `${filename} must retain full-resolution artwork`);
    assert.equal(width, height, `${filename} must be square`);
    assert.ok(transparent > width * height * .01, `${filename} must contain a real transparent background`);
    assert.ok(visible > width * height * .01, `${filename} must contain visible artwork`);
    assert.ok(softened > 0, `${filename} must preserve semitransparent painted edges`);
  }
});

for (const [stickerId, filename] of expected) {
  test(`${filename}: raster placement, spine drag, resize/rotation, duplicate, effects, delete/undo and persisted reload`, async () => {
    const h = await appHarness();
    const { mountBook } = await h.get('book/Book');
    mountBook(h.root, h.store.getDoc());
    h.root.querySelector('.closed-cover').click();
    await h.settle();
    assert.equal(h.root.querySelector('.desk').dataset.closed, 'false');
    const { stickerDef, stickerUri } = await h.get('stickers/packs');
    const expectedSource = `/stickers/generated/${filename}.png`;
    const assertRaster = (id) => {
      const node = h.root.querySelector(`.el[data-el-id="${id}"]`);
      assert.ok(node, 'placed artwork is mounted');
      assert.equal(h.root.querySelectorAll(`.el[data-el-id="${id}"]`).length, 1, 'one editable copy across the spread');
      assert.equal(node.querySelector('.sticker-img').getAttribute('src'), expectedSource);
      return node;
    };
    const sheet = h.root.querySelector('.slot-left .page-sheet');
    h.fire(sheet, 'pointerdown', { pointerId: 40, clientX: 150, clientY: 200, timeStamp: 20 });
    h.fire(sheet, 'pointerup', { pointerId: 40, clientX: 150, clientY: 200, timeStamp: 30 });
    h.root.querySelector('[data-act="add-sticker"]').click();
    await h.settle();
    const def = stickerDef(stickerId);
    const tile = h.document.querySelector(`[data-g="grid"] [aria-label="Add ${def.label} sticker"]`);
    assert.equal(tile.querySelector('img').getAttribute('src'), expectedSource);
    tile.click();
    h.document.querySelector('dialog').close();
    const current = () => h.store.getDoc().elements.filter((element) => element.data.sticker?.stickerId === stickerId);
    const originalId = current()[0].id;
    const [left, right] = h.store.getDoc().pages;
    assert.equal(current()[0].pageId, left.id);
    assert.equal(current()[0].data.sticker.effect, 'none', 'generated art starts without a cartoon outline');
    assertRaster(originalId);
    const ops = await h.get('canvas/elements');
    ops.patchElement(originalId, { x: .85, y: .3, w: .3, rot: 0 });
    const stage = h.root.querySelector('.stage');
    const originalNode = assertRaster(originalId);
    h.fire(originalNode, 'pointerdown', { pointerId: 51, clientX: 200, clientY: 300, timeStamp: 100 });
    h.fire(stage, 'pointermove', { pointerId: 51, clientX: 280, clientY: 300, timeStamp: 150 });
    assert.equal(originalNode.style.left, '52.5%');
    h.fire(stage, 'pointerup', { pointerId: 51, clientX: 280, clientY: 300, timeStamp: 180 });
    assert.equal(current()[0].pageId, right.id);
    assert.ok(Math.abs(current()[0].x - .05) < 1e-9);
    assert.equal(assertRaster(originalId).style.left, '52.5%');
    const oldWidth = current()[0].w;
    h.fire(h.root.querySelector('.el-knob'), 'pointerdown', { pointerId: 52, clientX: 500, clientY: 700, timeStamp: 200 });
    h.fire(stage, 'pointermove', { pointerId: 52, clientX: 620, clientY: 760, timeStamp: 250 });
    h.fire(stage, 'pointerup', { pointerId: 52, clientX: 620, clientY: 760, timeStamp: 280 });
    assert.ok(current()[0].w > oldWidth);
    assert.notEqual(current()[0].rot, 0);
    assertRaster(originalId);
    h.root.querySelector('[data-cmd="dup"]').click();
    assert.equal(current().length, 2);
    const copyId = current().find((element) => element.id !== originalId).id;
    assertRaster(copyId);
    for (const effect of ['outline', 'glossy', 'glitter', 'none']) {
      h.root.querySelector('[data-cmd="effect"]').click();
      assert.equal(current().find((element) => element.id === copyId).data.sticker.effect, effect);
      assert.equal(assertRaster(copyId).querySelector('img').dataset.effect, effect);
    }
    h.root.querySelector('[data-cmd="del"]').click();
    assert.equal(current().length, 1);
    assert.equal(h.root.querySelector(`.el[data-el-id="${copyId}"]`), null);
    h.root.querySelector('[data-act="undo"]').click();
    assert.equal(current().length, 2);
    assertRaster(copyId);
    await h.store.flush();
    const loaded = await (await h.get('sync/local')).loadBook(h.store.getDoc().book.id);
    const persisted = loaded.elements.filter((element) => element.data.sticker?.stickerId === stickerId);
    assert.equal(persisted.length, 2);
    for (const element of persisted) {
      assert.equal(element.pageId, right.id);
      assert.ok(element.w > oldWidth);
      assert.notEqual(element.rot, 0);
      assert.equal(stickerUri(stickerDef(element.data.sticker.stickerId)), expectedSource);
    }
    const layout = (await h.get('book/layout')).buildLayout(loaded);
    const surface = (await h.get('book/PageView')).renderSpreadCanvas(loaded, layout, 0, 1);
    assert.equal(surface.querySelectorAll('.sticker-img').length, 2);
    assert.ok([...surface.querySelectorAll('.sticker-img')].every((image) => image.getAttribute('src') === expectedSource));
  });
}
