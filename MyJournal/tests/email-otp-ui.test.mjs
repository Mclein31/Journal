import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const submit = (h) => h.fire(h.root.querySelector('form'), 'submit');
const ready = async (h) => { await h.settle(50); };

test('signup opens a code field; invalid codes stay editable and verification opens the journal', async () => {
  const calls = [];
  let rejectCode = true;
  const h = await appHarness({ fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url.endsWith('/verify-email') && rejectCode) return json({ message: 'Invalid OTP' }, 400);
    return json({ status: true });
  } });
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  h.root.querySelector('[data-mode="signup"]').click();
  h.root.querySelector('[name="email"]').value = 'writer@example.test';
  h.root.querySelector('[name="name"]').value = 'Writer';
  h.root.querySelector('[name="password"]').value = 'A-long-password!';
  submit(h); await ready(h);
  const code = h.root.querySelector('[name="otp"]'); assert.ok(code);
  assert.equal(code.getAttribute('autocomplete'), 'one-time-code');
  assert.equal(code.getAttribute('inputmode'), 'numeric');
  assert.equal(code.getAttribute('pattern'), '[0-9]{6}');
  assert.equal(h.root.querySelector('.auth-resend').disabled, true);
  code.value = '123456'; submit(h); await ready(h);
  assert.equal(h.root.querySelector('.auth-feedback').textContent, 'Invalid OTP');
  assert.equal(h.root.querySelector('[type="submit"]').disabled, false);
  assert.equal(code.value, '123456');
  rejectCode = false; submit(h); await new Promise(resolve => setTimeout(resolve, 250)); await h.settle();
  assert.ok(h.navigation.includes('/'));
  assert.deepEqual(calls.at(-1), { url: '/api/auth/email-otp/verify-email', body: { email: 'writer@example.test', otp: '123456' } });
  h.root.innerHTML = '';
});

test('password recovery keeps email through the code step and submits the code with the new password', async () => {
  const calls = [];
  const h = await appHarness({ fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return json({ success: true }); } });
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  h.root.querySelector('[name="email"]').value = 'writer@example.test';
  h.root.querySelector('[data-mode="forgot"]').click();
  submit(h); await ready(h);
  assert.equal(calls[0].url, '/api/auth/email-otp/request-password-reset');
  assert.match(h.root.querySelector('.auth-description').textContent, /writer@example.test/);
  h.root.querySelector('[name="otp"]').value = '654321';
  h.root.querySelector('[name="password"]').value = 'Replacement-password!';
  submit(h); await ready(h);
  assert.deepEqual(calls[1], { url: '/api/auth/email-otp/reset-password', body: { email: 'writer@example.test', otp: '654321', password: 'Replacement-password!' } });
  assert.match(h.root.querySelector('.auth-feedback').textContent, /Password updated/);
  assert.equal(h.root.querySelector('[name="password"]').value, '');
  h.root.innerHTML = '';
});

test('resend requests a new verification code and prevents repeated clicks', async () => {
  const calls = [];
  const h = await appHarness({ fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return json({ success: true }); } });
  const ui = await h.get('account/ui'); ui.mountLogin(h.root, 'verify', 'writer@example.test');
  h.root.querySelector('[name="otp"]').value = '123456';
  h.root.querySelector('.auth-resend').click(); await ready(h);
  assert.deepEqual(calls, [{ url: '/api/auth/email-otp/send-verification-otp', body: { email: 'writer@example.test', type: 'email-verification' } }]);
  assert.equal(h.root.querySelector('.auth-resend').disabled, true);
  assert.equal(h.root.querySelector('[name="otp"]').value, '');
  assert.match(h.root.querySelector('.auth-feedback').textContent, /newest email/);
  h.root.innerHTML = '';
});
