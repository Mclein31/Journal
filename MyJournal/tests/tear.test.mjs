import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import polygonClipping from 'polygon-clipping';

// Exercise production geometry with the real clipping library, independent of browser input.
const context = vm.createContext({});
const clipping = new vm.SyntheticModule(['default'], function () {
  this.setExport('default', polygonClipping);
}, { context });
const geometry = new vm.SourceTextModule(stripTypeScriptTypes(
  await readFile(new URL('../src/frames/tear.ts', import.meta.url), 'utf8'),
), { context });
await geometry.link(() => clipping);
await geometry.evaluate();
const { FULL, simplify, roughen, split } = geometry.namespace;

const area = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const next = ring[(i + 1) % ring.length];
  return sum + x * next[1] - next[0] * y;
}, 0)) / 2;

function conserved(shape, cut) {
  const pieces = split(shape, cut);
  assert.ok(pieces, `a crossing cut must split: ${JSON.stringify(cut)}`);
  assert.ok(pieces.every((piece) => area(piece) > 0.002), 'both retained choices have meaningful area');
  assert.ok(Math.abs(area(pieces[0]) + area(pieces[1]) - area(shape)) < 1e-7,
    'choosing between two tear pieces must not silently discard a third portion');
  for (const piece of pieces) for (const [x, y] of piece) {
    assert.ok(x >= -1e-7 && x <= 1 + 1e-7 && y >= -1e-7 && y <= 1 + 1e-7);
  }
  return pieces;
}

test('horizontal and vertical tears both split the photo into equal halves', () => {
  for (const cut of [[[0, .5], [1, .5]], [[.5, 0], [.5, 1]]]) {
    const pieces = conserved(FULL, cut);
    for (const piece of pieces) assert.ok(Math.abs(area(piece) - .5) < 1e-7);
  }
});

test('off-center and diagonal crossing tears conserve the complete photo', () => {
  for (const cut of [
    [[.05, .4], [.95, .4]],
    [[.4, .05], [.4, .95]],
    [[0, .2], [1, .8]],
    [[.2, 0], [.8, 1]],
    [[0, 0], [1, 1]],
    [[0, 1], [1, 0]],
  ]) conserved(FULL, cut);
});

test('roughness produces a repeatable tear and preserves both pieces across seeds', () => {
  const stroke = [[0, .5], [1, .5]];
  assert.deepEqual(roughen(stroke, .7, 42), roughen(stroke, .7, 42));
  for (let seed = 1; seed <= 20; seed++) conserved(FULL, roughen(stroke, .7, seed));
});

test('a second crossing tear splits the retained piece without destroying its remaining area', () => {
  const first = conserved(FULL, [[0, .5], [1, .5]]);
  conserved(first[0], [[.5, 0], [.5, 1]]);
});

test('missed cuts and insufficient paths do not alter the photo', () => {
  assert.equal(split(FULL, [[2, 2], [3, 3]]), null);
  assert.equal(split(FULL, [[.5, .5]]), null);
  const straight = [[0, .5], [.25, .5001], [.5, .5], [.75, .4999], [1, .5]];
  assert.equal(simplify(straight).length, 2);
});
