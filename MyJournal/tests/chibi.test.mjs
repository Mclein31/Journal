import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHarness } from './helpers/app.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value)); // objects from the app VM realm
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('every chibi option combination renders complete layered SVG with instance-unique clip IDs', async () => {
  const h = await appHarness();
  const { chibiSVG } = await h.get('login/art/index');
  const o = await h.get('login/chibiOptions');
  let count = 0;
  for (let hairStyle = 0; hairStyle < o.HAIR_STYLES.length; hairStyle++)
   for (const { id: facialHair } of o.FACIAL_HAIR)
    for (let eyeShape = 0; eyeShape < o.EYE_SHAPES.length; eyeShape++)
      for (let outfit = 0; outfit < o.OUTFITS.length; outfit++)
        for (const { id: accessory } of o.ACCESSORIES)
          for (const blush of [true, false]) {
            const svg = chibiSVG({ ...o.DEFAULT_CHIBI, hairStyle, eyeShape, outfit, accessory, blush, facialHair }, { uid: `c${count}` });
            assert.doesNotMatch(svg, /undefined|NaN|null/);
            for (const layer of ['ch-hair-back', 'ch-body', 'ch-head', 'ch-face', 'ch-hair-front', 'ch-arms-cover', 'ch-arms-rest'])
              assert.ok(svg.includes(layer), `${layer} missing`);
            assert.equal((svg.match(/class="ch-iris"/g) ?? []).length, 2);
            assert.deepEqual(plain(svg.match(/id="[^"]+"/g)), [`id="c${count}-eye-0"`, `id="c${count}-eye-1"`]);
            assert.equal(svg.includes('ch-acc-ears'), accessory === 'cat-ears');
            count++;
          }
  assert.equal(count, 13 * 3 * 3 * 12 * 12 * 2);
  assert.equal(o.ACCESSORIES.some((a) => a.id === 'bandana'), true);
});

test('the default character is gender-neutral and every preset is valid', async () => {
  const h = await appHarness();
  const o = await h.get('login/chibiOptions');
  const { chibiSchema } = await import('../api/src/validation.ts');
  assert.equal(o.DEFAULT_CHIBI.hairStyle, 6); assert.equal(o.DEFAULT_CHIBI.outfit, 1); assert.notEqual(o.DEFAULT_CHIBI.accessory, 'bow');
  assert.deepEqual(plain(o.PRESETS.map((p) => p.name)), ['Neutral', 'Masculine', 'Sporty', 'Feminine']);
  for (const p of o.PRESETS) assert.ok(chibiSchema.safeParse({ ...o.DEFAULT_CHIBI, ...p.look }).success, p.id);
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  assert.equal(h.root.querySelector('.auth-chibi-edit').textContent, 'Customize character');
  assert.doesNotMatch(h.root.innerHTML, /\bher\b|\bshe\b/i);
});

test('malformed saved chibis are repaired and the server schema accepts every repaired look', async () => {
  const h = await appHarness();
  const o = await h.get('login/chibiOptions');
  const { chibiSchema } = await import('../api/src/validation.ts');
  const fixed = o.normalizeChibi({ hairStyle: 99, hairColor: 'red', eyeColor: '#ABCDEF', eyeShape: -1, skinTone: 3, outfit: 2.5, accessory: 'crown', blush: 'yes', updatedAt: -4 });
  assert.deepEqual(plain(fixed), { ...plain(o.DEFAULT_CHIBI), eyeColor: '#abcdef' });
  assert.equal(chibiSchema.safeParse({ ...o.DEFAULT_CHIBI, facialHair: undefined }).success, true, 'looks saved before facial hair existed stay valid');
  assert.deepEqual(plain(o.normalizeChibi(null)), plain(o.DEFAULT_CHIBI));
  for (let i = 0; i < 50; i++) assert.ok(chibiSchema.safeParse(o.normalizeChibi(o.randomChibi())).success);
  assert.equal(chibiSchema.safeParse({ ...o.DEFAULT_CHIBI, outfit: 12 }).success, false);
  assert.equal(chibiSchema.safeParse({ ...o.DEFAULT_CHIBI, extra: '<script>' }).success, false);
});

test('login chibi covers its eyes for hidden passwords, peeks when shown, and reacts to sign-in results', async () => {
  let attempt = 0;
  const h = await appHarness({ fetchImpl: async () => (++attempt === 1 ? json({ message: 'Invalid email or password' }, 401) : json({ token: 'ok' })) });
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  const svg = () => h.root.querySelector('.auth-chibi svg');
  assert.ok(svg(), 'chibi is on the login screen');
  assert.match(svg().getAttribute('aria-label'), /eyes follow/);
  const password = h.root.querySelector('[name="password"]');
  password.focus(); h.root.dispatchEvent(new h.window.Event('focusin', { bubbles: true })); await tick();
  assert.equal(svg().dataset.hands, 'cover');
  h.root.querySelector('.password-toggle').click(); await tick();
  assert.equal(svg().dataset.hands, 'peek'); assert.equal(svg().dataset.mood, 'shy');
  h.root.querySelector('[name="email"]').focus(); h.root.dispatchEvent(new h.window.Event('focusout', { bubbles: true })); await tick();
  assert.equal(svg().dataset.hands, 'rest');
  h.root.querySelector('[name="email"]').value = 'writer@example.com'; password.value = 'wrong';
  h.root.querySelector('form').dispatchEvent(new h.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(svg().dataset.mood, 'confused');
  h.root.querySelector('[data-mode="signup"]').click(); h.root.querySelector('[data-mode="signin"]').click();
  assert.ok(svg(), 'the same chibi survives screen changes');
  h.root.querySelector('[name="email"]').value = 'writer@example.com'; h.root.querySelector('[name="password"]').value = 'right-password';
  h.root.querySelector('form').dispatchEvent(new h.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(svg().dataset.mood, 'happy');
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.deepEqual(plain(h.navigation), ['/']);
});

test('the editor saves the look on this device and updates the login chibi live', async () => {
  const h = await appHarness();
  const ui = await h.get('account/ui'); ui.mountLogin(h.root);
  h.root.querySelector('.auth-chibi-edit').click();
  const dialog = h.document.querySelector('.chibi-editor');
  assert.ok(dialog?.hasAttribute('open'));
  assert.equal(dialog.querySelectorAll('.ce-thumb').length, 13 + 3 + 12 + 12 + 3);
  assert.equal(dialog.querySelector('h2').textContent, 'Make it yours');
  dialog.querySelector('[data-preset="masculine"]').click();
  const checked = (name) => [...dialog.querySelectorAll(`input[name="${name}"]`)].find((i) => i.checked)?.value;
  assert.equal(checked('hairStyle'), '8'); assert.equal(checked('outfit'), '7');
  const pick = (name, value) => { const input = dialog.querySelector(`input[name="${name}"][value="${value}"]`); input.checked = true; input.dispatchEvent(new h.window.Event('change', { bubbles: true })); };
  pick('hairStyle', '2'); pick('accessory', 'cat-ears'); pick('skinTone', '#a8714a');
  assert.ok(dialog.querySelector('.ce-stage svg .ch-acc-ears'), 'preview updates before saving');
  assert.equal(h.root.querySelector('.auth-chibi svg .ch-acc-ears'), null, 'unsaved edits do not change the login chibi');
  dialog.querySelector('[data-ce="save"]').click(); await tick();
  const saved = JSON.parse(h.storage.get('dd:chibi'));
  assert.equal(saved.hairStyle, 2); assert.equal(saved.accessory, 'cat-ears'); assert.equal(saved.skinTone, '#a8714a'); assert.ok(saved.updatedAt > 0);
  assert.ok(h.root.querySelector('.auth-chibi svg .ch-acc-ears'), 'login chibi shows the saved look');
});

test('account sync keeps the newest chibi on both the device and the account', async () => {
  const requests = [];
  let remote = { hairStyle: 4, hairColor: '#e59bb0', eyeColor: '#3f86a8', eyeShape: 1, skinTone: '#fde7dc', outfit: 5, accessory: 'beret', blush: false, updatedAt: 2000 };
  const fetchImpl = async (url, init = {}) => {
    requests.push(init.method ?? 'GET');
    if (init.method === 'PUT') { remote = JSON.parse(init.body); return json({ chibi: remote }); }
    return json({ chibi: remote });
  };
  const h = await appHarness({ fetchImpl, stored: { 'dd:chibi': JSON.stringify({ hairStyle: 1, updatedAt: 1000 }) } });
  const store = await h.get('login/chibiStore');
  await store.syncChibi();
  assert.equal(store.loadChibi().accessory, 'beret', 'newer account look replaces the older device look');
  assert.deepEqual(plain(requests), ['GET']);
  h.storage.set('dd:chibi', JSON.stringify({ ...remote, outfit: 1, updatedAt: 5000 }));
  await store.syncChibi();
  assert.deepEqual(plain(requests), ['GET', 'GET', 'PUT']);
  assert.equal(remote.outfit, 1, 'newer device look is saved to the account');
});
