import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

const good = (name, content) => new File([content], name, { type: 'image/png' });
const bad = () => new File(['invalid bytes'], 'bad.png', { type: 'image/png' });
const newAssets = (all, before) => all.filter((asset) => !before.has(asset.id));

async function backgroundContext() {
  const h = await appHarness();
  const api = await h.get('customize/backgrounds');
  const local = await h.get('sync/local');
  const before = new Set((await local.listAssets('background')).map((asset) => asset.id));
  return { h, api, local, before };
}

async function openUploadPanel(h) {
  (await h.get('customize/CustomizePanel')).openCustomizePanel();
  await h.settle();
  h.document.querySelector('[data-category="desk"]').click();
  return h.document.querySelector('[data-group="uploads"] input[type="file"]');
}

function chooseFiles(h, input, files) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  h.fire(input, 'change');
}

function assertFailureCount(h, count) {
  const message = h.document.querySelector('.toast')?.textContent ?? '';
  assert.match(message, new RegExp(`\\b${count}\\b`), 'feedback includes the invalid file count');
  assert.match(message, /(could not|failed|invalid|skipped|unable|not added)/i, 'feedback explains that a file was not added');
}

test('background batch API preserves good,bad,good images and reports both successes and failure', async () => {
  const { api, local, before } = await backgroundContext();
  const result = await api.uploadBackgrounds([good('first.png', 'first valid image'), bad(), good('last.png', 'last valid image')]);
  assert.equal(result.added, 2);
  assert.equal(result.failed, 1);
  const added = newAssets(await local.listAssets('background'), before);
  assert.equal(added.length, 2, 'the invalid middle file must not stop later uploads');
  const contents = await Promise.all(added.map(async (asset) => (await local.getAssetBlob(asset.id)).text()));
  assert.deepEqual(contents.sort(), ['first valid image', 'last valid image']);
});

test('an invalid-only background batch reports failure without storing an image', async () => {
  const { api, local, before } = await backgroundContext();
  const result = await api.uploadBackgrounds([bad()]);
  assert.equal(result.added, 0);
  assert.equal(result.failed, 1);
  assert.equal(newAssets(await local.listAssets('background'), before).length, 0);
});

test('the actual background upload input shows both valid files after a partial batch and reports the invalid count', async () => {
  const { h, local, before } = await backgroundContext();
  const input = await openUploadPanel(h);
  chooseFiles(h, input, [good('first.png', 'visible first'), bad(), good('last.png', 'visible last')]);
  await h.settle();
  const assets = await local.listAssets('background');
  assert.equal(newAssets(assets, before).length, 2);
  assert.equal(h.document.querySelectorAll('[data-group="uploads"] .cz-up').length, assets.length, 'all successful images appear in the open drawer immediately');
  const thumbs = [...h.document.querySelectorAll('[data-group="uploads"] .cz-up .desk-swatch')];
  assert.ok(thumbs.every((thumb) => thumb.style.backgroundImage.includes('blob:')));
  assertFailureCount(h, 1);
  assert.equal(h.document.querySelector('[data-group="uploads"] .cz-add').disabled, false);
  assert.equal(input.value, '');
});

test('the actual background upload input reports invalid-only batches and remains usable', async () => {
  const { h, local, before } = await backgroundContext();
  const input = await openUploadPanel(h);
  const visibleBefore = h.document.querySelectorAll('[data-group="uploads"] .cz-up').length;
  chooseFiles(h, input, [bad()]);
  await h.settle();
  assert.equal(newAssets(await local.listAssets('background'), before).length, 0);
  assert.equal(h.document.querySelectorAll('[data-group="uploads"] .cz-up').length, visibleBefore);
  assertFailureCount(h, 1);
  assert.equal(h.document.querySelector('[data-group="uploads"] .cz-add').disabled, false);
  assert.equal(input.value, '');
});
