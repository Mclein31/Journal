import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

test('login warns that device-only journals are not backed up and may be deleted by updates', async () => {
  const h = await appHarness();
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  const note = h.root.querySelector('.auth-guest-warning');
  assert.ok(note, 'disclaimer sits with the Continue on this device option');
  assert.match(note.textContent, /not backed up/); assert.match(note.textContent, /deleted when Dear Days is updated/);
});

test('guest journals show a dismissible in-app disclaimer that stays dismissed', async () => {
  const h = await appHarness();
  const ui = await h.get('account/ui');
  ui.mountAccountControls(h.root, null);
  const banner = h.root.querySelector('.guest-banner');
  assert.ok(banner); assert.match(banner.textContent, /may be deleted when Dear Days is updated/);
  banner.querySelector('.guest-banner-close').click();
  assert.equal(h.root.querySelector('.guest-banner'), null);
  assert.equal(h.storage.get('dd:guest-warning-dismissed'), '1');
  ui.mountAccountControls(h.root, null);
  assert.equal(h.root.querySelector('.guest-banner'), null, 'not shown again after dismissal');
});

test('signed-in accounts never see the guest disclaimer', async () => {
  const h = await appHarness();
  const ui = await h.get('account/ui');
  ui.mountAccountControls(h.root, { id: 'a1', email: 'writer@example.com', name: 'W', emailVerified: true });
  assert.equal(h.root.querySelector('.guest-banner'), null);
});
