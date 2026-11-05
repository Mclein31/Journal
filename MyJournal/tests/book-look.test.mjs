import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

const look = (over = {}) => JSON.stringify({ title: "Mark's Days", coverColor: '#7a2e2e', coverTexture: 'leather', paperType: 'grid', paperTint: 'kraft',
  background: { kind: 'preset', ref: 'night', fit: 'cover' }, sections: [{ name: 'Gym', color: '#123456' }, { name: 'Ideas', color: '#abcdef' }], ...over });

test('the journal saves its look so the login screen can mirror it', async () => {
  const h = await appHarness();
  const store = await h.get('state/store'); const bookLook = await h.get('login/bookLook');
  bookLook.rememberBookLook(store.getDoc());
  const saved = JSON.parse(h.storage.get('dd:book-look'));
  const doc = store.getDoc();
  assert.equal(saved.title, doc.book.title); assert.equal(saved.coverColor, doc.book.coverColor);
  assert.equal(saved.paperTint, doc.book.paperTint); assert.equal(saved.sections.length, doc.sections.length);
  assert.equal(saved.background.ref, doc.book.background.ref);
});

test('login draws the saved cover color, texture, title, paper, tabs and desk', async () => {
  const h = await appHarness({ stored: { 'dd:book-look': look() } });
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  const scene = h.root.querySelector('.auth-scene'); const book = h.root.querySelector('.auth-book'); const page = h.root.querySelector('.auth-page');
  assert.equal(scene.dataset.bg, 'night'); assert.equal(scene.dataset.tone, 'dark');
  assert.equal(book.dataset.texture, 'leather'); assert.match(book.getAttribute('style'), /--cover:#7a2e2e/);
  assert.match(book.getAttribute('style'), /--paper:var\(--paper-kraft\)/);
  assert.equal(h.root.querySelector('.auth-book-title').textContent, "Mark's Days");
  assert.equal(h.root.querySelectorAll('.auth-book-tabs i').length, 2);
  assert.equal(page.dataset.paper, 'grid');
});

test('titles are escaped and missing uploaded desks fall back to the default scene', async () => {
  const h = await appHarness({ stored: { 'dd:book-look': look({ title: '<img src=x onerror=alert(1)>', background: { kind: 'upload', ref: 'missing', fit: 'cover' } }) } });
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  assert.equal(h.root.querySelector('.auth-book img'), null);
  assert.equal(h.root.querySelector('.auth-book-title').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(h.root.querySelector('.auth-scene').hasAttribute('data-bg'), false);
});

test('no saved look shows the default journal', async () => {
  const h = await appHarness();
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  assert.equal(h.root.querySelector('.auth-scene').dataset.bg, 'wood');
  assert.match(h.root.querySelector('.auth-book').getAttribute('style'), /--cover:#3e5568/);
});
