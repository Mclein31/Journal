import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

// Real DOM/module integration with simulated layout and frame timing, not native painting.
async function environment({ reduced = false, single = false } = {}) {
  const h = await appHarness({ manualFrames: true });
  const book = await h.get('book/Book');
  h.media.get('(prefers-reduced-motion: reduce)').matches = reduced;
  if (single) h.storage.set(`mlw:layout:${h.store.getDoc().book.id}`, 'single');
  return { ...h, book, flip: await h.get('book/flip') };
}
function faces(h) {
  const front = h.document.createElement('div'), back = h.document.createElement('div');
  front.className = 'page page-right'; back.className = 'page page-left';
  front.textContent = 'FRONT'; back.textContent = 'BACK';
  return { front, back };
}
function stageFor(h) {
  const stage = h.document.createElement('div'); stage.className = 'stage'; h.root.append(stage); return stage;
}
async function drain(h, total = 1600) {
  for (let ms = 0; ms < total; ms += 32) { h.advanceFrames(32); await Promise.resolve(); }
  await h.settle();
}
async function openApp(options = {}) {
  const h = await environment(options);
  h.book.mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  assert.equal(h.root.querySelector('.desk').dataset.closed, 'false');
  return h;
}
const shown = (h) => [...h.root.querySelectorAll('.slot .page[data-page-id]')].map((p) => p.dataset.pageId);
const pointer = (h, type, x, y, timeStamp, pointerId = 1) => h.fire(h.root.querySelector('.stage'), type, {
  pointerId, button: 0, clientX: x, clientY: y, timeStamp,
});

test('actual normalized grab height changes facet matrices and endpoint cleanup removes all temporary layers', async () => {
  const h = await environment(), stage = stageFor(h);
  const top = h.flip.dragLeaf(stage, faces(h), 1, undefined, { grab: { x: .8, y: .1 } });
  top.set(.4, -.12);
  const topMatrix = stage.querySelector('.leaf-facet').style.transform;
  assert.equal(stage.querySelector('.leaf').dataset.grabY, '0.1');
  h.flip.clearLeaves(stage);
  const bottom = h.flip.dragLeaf(stage, faces(h), 1, undefined, { grab: { x: .8, y: .9 } });
  bottom.set(.4, .12);
  assert.notEqual(stage.querySelector('.leaf-facet').style.transform, topMatrix);
  assert.equal(stage.querySelectorAll('.leaf-facet').length, 16); // 8 full-height strips × 2 triangles
  const finishing = bottom.finish(true);
  await drain(h);
  assert.equal(await finishing, true);
  assert.equal(stage.querySelector('.leaf').dataset.progress, '1');
  h.flip.clearLeaves(stage);
  assert.equal(stage.querySelectorAll('.leaf, .leaf-floor-shadow').length, 0);
});

test('front and back crop full-size page copies using mirrored source columns', async () => {
  const h = await environment(), stage = stageFor(h);
  const ctl = h.flip.dragLeaf(stage, faces(h), 1);
  const facets = [...stage.querySelectorAll('.leaf-facet')];
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `expected ${b}, received ${a}`);
  const pixels = (node, property) => Number.parseFloat(node.style[property]);
  const mapping = (facet, x, y) => {
    const m = facet.style.transform.slice('matrix3d('.length, -1).split(',').map(Number);
    return { x: m[0] * x + m[4] * y + m[12], y: m[1] * x + m[5] * y + m[13] };
  };
  // 8 full-height strips × 2 triangles: facet index = col * 2 (+1 for the second triangle)
  for (const [index, col, row] of [[0, 0, 0], [6, 3, 0], [14, 7, 0]]) {
    const front = facets[index].querySelector('.leaf-front .page');
    const back = facets[index].querySelector('.leaf-back .page');
    const w = 400 / 8, height = 600;
    assert.equal(front.style.width, '400px'); assert.equal(front.style.height, '600px');
    assert.equal(back.style.width, '400px'); assert.equal(back.style.height, '600px');
    close(pixels(front, 'left'), .45 - col * w);
    close(pixels(back, 'left'), .45 - (7 - col) * w);
    close(pixels(front, 'top'), .45 - row * height);
    close(pixels(back, 'top'), .45 - row * height);
    for (const face of [front.parentElement, back.parentElement]) {
      assert.ok(pixels(face, 'left') < 0 && pixels(face, 'top') < 0);
      assert.ok(pixels(face, 'left') + pixels(face, 'width') > pixels(facets[index], 'width'));
      assert.ok(pixels(face, 'top') + pixels(face, 'height') > pixels(facets[index], 'height'));
    }
    const sourceX = (col + .37) * w, sourceY = (row + .42) * height;
    const actual = mapping(facets[index], pixels(front.parentElement, 'left') + pixels(front, 'left') + sourceX,
      pixels(front.parentElement, 'top') + pixels(front, 'top') + sourceY);
    close(actual.x, sourceX); close(actual.y, sourceY);
    assert.equal(front.textContent, 'FRONT'); assert.equal(back.textContent, 'BACK');
  }
  ctl.set(1);
  for (const [index, col, row] of [[0, 0, 0], [6, 3, 0], [14, 7, 0]]) {
    const back = facets[index].querySelector('.leaf-back .page'), face = back.parentElement;
    const sourceX = (7 - col + .37) * 400 / 8, sourceY = (row + .42) * 600;
    // rotateY(180deg) about the expanded face's center must keep the source aligned.
    const localX = pixels(face, 'left') + pixels(face, 'width') - (pixels(back, 'left') + sourceX);
    const localY = pixels(face, 'top') + pixels(back, 'top') + sourceY;
    const actual = mapping(facets[index], localX, localY);
    close(actual.x, sourceX - 400); close(actual.y, sourceY);
  }
  assert.equal(stage.querySelector('.leaf').getAttribute('aria-hidden'), 'true');
  h.flip.clearLeaves(stage);
});

test('cloned unresolved uploaded images acquire blob URLs and sticker alpha-mask listeners', async () => {
  const h = await environment(), stage = stageFor(h), local = await h.get('sync/local');
  const id = `curl-asset-${crypto.randomUUID()}`;
  await local.putAsset({ id, kind: 'sticker', mime: 'image/png', w: 10, h: 10, bytes: 3, createdAt: Date.now() }, new Blob(['png'], { type: 'image/png' }));
  const source = faces(h);
  const paper = h.document.createElement('div'); paper.className = 'sticker-paper';
  const image = h.document.createElement('img'); image.dataset.assetId = id; paper.append(image); source.front.append(paper);
  h.flip.dragLeaf(stage, source, 1);
  const copies = [...stage.querySelectorAll('.leaf-front img[data-asset-id]')];
  assert.equal(copies.length, 16);
  await h.settle();
  for (const copy of copies) {
    assert.match(copy.getAttribute('src'), /^blob:/);
    h.fire(copy, 'load');
    assert.ok(copy.parentElement.classList.contains('has-texture'));
    assert.ok(copy.parentElement.style.getPropertyValue('--sticker-mask').includes(copy.src));
  }
  h.flip.clearLeaves(stage);
});

test('paper fades only its faces and interrupted settling resolves false without snapping', async () => {
  const h = await environment(), stage = stageFor(h);
  const ctl = h.flip.dragLeaf(stage, faces(h), 1, 'out');
  ctl.set(.9, .2);
  const leaf = stage.querySelector('.leaf');
  assert.ok(!leaf.style.opacity, 'opacity on preserve-3D root would flatten its children');
  for (const face of leaf.querySelectorAll('.leaf-face')) assert.ok(Number(face.style.opacity) > 0 && Number(face.style.opacity) < 1);
  const finishing = ctl.finish(true);
  h.advanceFrames(32);
  const held = ctl.hold(), matrix = leaf.querySelector('.leaf-facet').style.transform;
  assert.equal(await finishing, false);
  assert.ok(held.progress >= .9 && held.progress < 1);
  await drain(h, 100);
  assert.equal(leaf.querySelector('.leaf-facet').style.transform, matrix);
  const rollback = ctl.finish(false);
  await drain(h);
  assert.equal(await rollback, true);
  assert.equal(ctl.hold().progress, 0);
  h.flip.clearLeaves(stage);
});

test('reduced-motion manual leaves use a flat fade without mesh facets or a perspective transform', async () => {
  const h = await environment({ reduced: true }), stage = stageFor(h);
  const ctl = h.flip.dragLeaf(stage, faces(h), 1);
  ctl.set(.4);
  const leaf = stage.querySelector('.leaf');
  assert.ok(leaf.classList.contains('leaf-reduced'));
  assert.equal(leaf.querySelectorAll('.leaf-facet').length, 0);
  assert.equal(leaf.style.transform, 'none');
  assert.equal(leaf.querySelector('.leaf-front').style.opacity, '0.6');
  const done = ctl.finish(false);
  await drain(h, 400);
  assert.equal(await done, true);
  h.flip.clearLeaves(stage);
});

test('canceling an actual page drag restores the original pages and releases busy state', async () => {
  const h = await openApp(), before = shown(h);
  pointer(h, 'pointerdown', 460, 160, 100);
  pointer(h, 'pointermove', 140, 200, 200);
  assert.equal(h.root.querySelector('.leaf').dataset.grabY, '0.1');
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'true');
  pointer(h, 'pointercancel', 140, 200, 210);
  await drain(h);
  assert.deepEqual(shown(h), before);
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'false');
  assert.equal(h.root.querySelectorAll('.leaf, .leaf-floor-shadow').length, 0);
});

test('a fast partial pull followed by a stationary hold does not retain flick momentum', async () => {
  const h = await openApp(), before = shown(h);
  pointer(h, 'pointerdown', 460, 240, 100);
  pointer(h, 'pointermove', 400, 240, 110);
  assert.ok(Number(h.root.querySelector('.leaf').dataset.progress) < .5);
  pointer(h, 'pointerup', 400, 240, 700);
  await drain(h);
  assert.deepEqual(shown(h), before);
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'false');
});

test('catching a released manual page preserves its pose and reversing cancels its previous landing', async () => {
  const h = await openApp(), before = shown(h);
  pointer(h, 'pointerdown', 460, 240, 100);
  pointer(h, 'pointermove', 80, 260, 300);
  pointer(h, 'pointerup', 80, 260, 310);
  h.advanceFrames(32); await Promise.resolve();
  const leaf = h.root.querySelector('.leaf'), progress = leaf.dataset.progress;
  const matrix = leaf.querySelector('.leaf-facet').style.transform;
  pointer(h, 'pointerdown', 80, 260, 400, 2);
  assert.equal(leaf.dataset.progress, progress);
  assert.equal(leaf.querySelector('.leaf-facet').style.transform, matrix);
  pointer(h, 'pointermove', 850, 240, 600, 2);
  pointer(h, 'pointerup', 850, 240, 900, 2);
  await drain(h);
  assert.deepEqual(shown(h), before);
  assert.equal(h.root.querySelectorAll('.leaf').length, 0);
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'false');
});

test('catching an automatic single-page turn does not jump or double-commit navigation', async () => {
  const h = await openApp({ single: true }), before = shown(h);
  const initialPage = h.root.querySelector('.slot-right .page').dataset.pageId;
  const { buildLayout } = await h.get('book/layout');
  const pages = buildLayout(h.store.getDoc()).pages;
  const nextId = pages[pages.findIndex((p) => p.id === initialPage) + 1].id;
  h.root.querySelector('[data-act="next"]').click();
  h.advanceFrames(64); await Promise.resolve();
  const leaf = h.root.querySelector('.leaf'), progress = leaf.dataset.progress;
  pointer(h, 'pointerdown', 250, 250, 100);
  assert.equal(leaf.dataset.progress, progress);
  pointer(h, 'pointermove', 1000, 250, 250);
  pointer(h, 'pointerup', 1000, 250, 500);
  await drain(h);
  assert.deepEqual(shown(h), before);
  h.root.querySelector('[data-act="next"]').click();
  await drain(h);
  assert.equal(h.root.querySelector('.slot-right .page').dataset.pageId, nextId);
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'false');
  assert.equal(h.root.querySelectorAll('.leaf').length, 0);
  await drain(h, 400);
  assert.equal(h.root.querySelector('.slot-right .page').dataset.pageId, nextId);
});

test('resizing a held paper refreshes mesh dimensions without changing its current pose', async () => {
  const h = await environment(), stage = stageFor(h);
  const ctl = h.flip.dragLeaf(stage, faces(h), 1, undefined, { grab: { x: .8, y: .2 } });
  ctl.set(.4, .12);
  const leaf = stage.querySelector('.leaf'), first = leaf.querySelector('.leaf-facet');
  const before = first.style.transform;
  assert.equal(Number.parseFloat(first.style.width), 400 / 8);
  Object.defineProperty(leaf, 'offsetWidth', { get: () => 200 });
  Object.defineProperty(leaf, 'offsetHeight', { get: () => 300 });
  ctl.resize();
  assert.equal(ctl.hold().progress, .4);
  assert.equal(ctl.hold().pullY, .12);
  assert.equal(Number.parseFloat(first.style.width), 200 / 8);
  assert.equal(Number.parseFloat(first.style.height), 300);
  assert.notEqual(first.style.transform, before);
  for (const content of leaf.querySelectorAll('.leaf-facet-face .page')) {
    assert.equal(content.style.width, '200px');
    assert.equal(content.style.height, '300px');
  }
  ctl.set(0);
  const last = [...leaf.querySelectorAll('.leaf-facet')].at(-1);
  const matrix = last.style.transform.slice('matrix3d('.length, -1).split(',').map(Number);
  const x = matrix[0] * (200 / 8) + matrix[4] * 300 + matrix[12];
  const y = matrix[1] * (200 / 8) + matrix[5] * 300 + matrix[13];
  assert.ok(Math.abs(x - 200) < 1e-6, `resized right edge must be 200px, received ${x}`);
  assert.ok(Math.abs(y - 300) < 1e-6, `resized bottom edge must be 300px, received ${y}`);
  ctl.destroy();
  assert.equal(stage.querySelectorAll('.leaf, .leaf-floor-shadow').length, 0);
});

test('destroying a settling page resolves interruption and removes its scheduled work and layers', async () => {
  const h = await environment(), stage = stageFor(h);
  const ctl = h.flip.dragLeaf(stage, faces(h), 1);
  ctl.set(.4, .1);
  const done = ctl.finish(true);
  h.advanceFrames(16);
  assert.ok(h.frames.size > 0);
  ctl.destroy();
  assert.equal(await done, false);
  assert.equal(h.frames.size, 0);
  assert.equal(stage.querySelectorAll('.leaf, .leaf-floor-shadow').length, 0);
  await drain(h, 100);
  assert.equal(stage.querySelectorAll('.leaf, .leaf-floor-shadow').length, 0);
});

test('three rapid Next clicks preserve each requested step while the first paper turn is busy', async () => {
  const h = await openApp();
  const { buildLayout } = await h.get('book/layout');
  const pages = buildLayout(h.store.getDoc()).pages;
  const next = h.root.querySelector('[data-act="next"]');
  next.click();
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'true');
  next.click(); next.click();
  // The first leaf and then the queued two-spread riffle each need a release timeline.
  await drain(h, 3200);
  assert.deepEqual(shown(h), [pages[6].id, pages[7].id]);
  assert.match(h.root.querySelector('.nav-label').textContent, /Notes.*pages 7–8/);
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'false');
  assert.equal(h.root.querySelectorAll('.leaf').length, 0);
});

test('Next followed immediately by Previous cancels the pending navigation intent exactly once', async () => {
  const h = await openApp(), before = shown(h);
  h.root.querySelector('[data-act="next"]').click();
  const previous = h.root.querySelector('[data-act="prev"]');
  assert.equal(previous.disabled, false, 'the pending next-page intent must enable Previous for native button activation');
  previous.click();
  await drain(h, 3200);
  assert.deepEqual(shown(h), before);
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'false');
  assert.equal(h.root.querySelectorAll('.leaf').length, 0);
  await drain(h, 400);
  assert.deepEqual(shown(h), before);
});

test('Next during a multi-leaf section riffle advances from its pending destination', async () => {
  const h = await openApp();
  const { buildLayout } = await h.get('book/layout');
  const pages = buildLayout(h.store.getDoc()).pages;
  h.root.querySelector('[aria-label="Go to Memories"]').click();
  assert.ok(h.root.querySelectorAll('.leaf').length > 1, 'the section jump must exercise a multi-leaf riffle');
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'true');
  const next = h.root.querySelector('[data-act="next"]');
  assert.equal(next.disabled, false, 'Notes remains available after the pending Memories destination');
  next.click();
  await drain(h, 3200);
  assert.deepEqual(shown(h), [pages[6].id, pages[7].id]);
  assert.match(h.root.querySelector('.nav-label').textContent, /Notes.*pages 7–8/);
  assert.equal(h.root.querySelector('.stage').dataset.turning, 'false');
  assert.equal(h.root.querySelectorAll('.leaf').length, 0);
});
