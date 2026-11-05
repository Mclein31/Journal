import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

const svg = (value) => decodeURIComponent(value.slice(value.indexOf('data:image/svg+xml,') + 19, -2));

test('pen strokes retain chosen ink, vary naturally per note, and remain stable through repeated renders', async () => {
  const h = await appHarness();
  const { penMarksBackground } = await h.get('fonts/highlight');
  const style = { underline: true, strikethrough: true, color: '#234567' };
  const a = penMarksBackground(style, 'same-note');
  assert.equal(a, penMarksBackground(style, 'same-note'));
  assert.notEqual(a, penMarksBackground(style, 'another-note'));
  const drawing = svg(a);
  assert.match(drawing, /stroke="#234567"/);
  const widths = [...drawing.matchAll(/stroke-width="([\d.]+)"/g)].map((match) => Number(match[1]));
  assert.ok(new Set(widths).size > 1, 'hand pressure varies instead of making a uniform digital rule');
  assert.ok(widths.every((width) => width > .5 && width < 1.5), 'small imperfections remain legible');
  assert.equal(penMarksBackground({}, 'same-note'), 'none');
  assert.notEqual(penMarksBackground({ underline: true }, 'same-note'), penMarksBackground({ strikethrough: true }, 'same-note'));
});

test('textured text stays editable and readable while highlights and pen decorations clear independently', async () => {
  const h = await appHarness();
  const { mountBook } = await h.get('book/Book');
  const { patchElement } = await h.get('canvas/elements');
  mountBook(h.root, h.store.getDoc());
  h.root.querySelector('.closed-cover').click();
  await h.settle();
  const original = h.store.getDoc().elements[0];
  const content = 'An ordinary note\nwith a second line';
  patchElement(original.id, { data: { text: { ...original.data.text, content, color: '#234567', highlight: '#fff0a8', underline: true, strikethrough: true } } });
  const body = () => h.root.querySelector(`[data-el-id="${original.id}"] .el-text-body`);
  assert.equal(body().textContent, content, 'the glyphs remain actual text, never a masked image');
  assert.equal(body().dataset.penMarks, 'true');
  assert.equal(body().dataset.highlight, 'true');
  assert.equal(body().style.textDecorationLine, 'underline line-through');
  assert.equal((body().style.backgroundImage.match(/data:image\/svg\+xml/g) ?? []).length, 2);
  const text = h.store.getDoc().elements[0].data.text;
  patchElement(original.id, { data: { text: { ...text, highlight: undefined } } });
  assert.equal(body().dataset.highlight, undefined);
  assert.equal(body().dataset.penMarks, 'true');
  assert.equal(body().textContent, content);
  patchElement(original.id, { data: { text: { ...h.store.getDoc().elements[0].data.text, underline: false, strikethrough: false } } });
  assert.equal(body().dataset.penMarks, undefined);
  assert.equal(body().style.textDecorationLine, 'none');
});
