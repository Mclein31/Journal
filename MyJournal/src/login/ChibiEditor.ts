/* Chibi editor dialog: live preview + native radio groups (keyboard arrows, labels, screen readers). */
import type { ChibiConfig } from '../state/schema';
import { chibiSVG } from './art/index';
import { mountChibi } from './Chibi';
import { ACCESSORIES, DEFAULT_CHIBI, FACIAL_HAIR, PRESETS, EYE_COLORS, EYE_SHAPES, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN_TONES, randomChibi, type Swatch } from './chibiOptions';
import { loadChibi, saveChibi } from './chibiStore';

type Field = keyof Omit<ChibiConfig, 'updatedAt' | 'blush'>;
interface Choice { value: string | number; name: string }
const NUMERIC = new Set<string>(['hairStyle', 'eyeShape', 'outfit']);
const VIEW: Partial<Record<Field, string>> = { facialHair: '50 92 100 64', eyeShape: '52 80 96 48', accessory: '14 0 172 160', hairStyle: '0 0 200 240', outfit: '30 120 140 120' };
let renders = 0;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function thumbGroup(field: Field, legend: string, choices: Choice[]): string {
  return `<fieldset class="ce-group"><legend>${legend}</legend><div class="ce-thumbs">${choices.map((c) =>
    `<label class="ce-thumb" title="${esc(c.name)}"><input type="radio" name="${field}" value="${c.value}"><span class="chibi-thumb" data-field="${field}" data-value="${c.value}"></span><span class="ce-name">${esc(c.name)}</span></label>`).join('')}</div></fieldset>`;
}
function swatchGroup(field: Field, legend: string, swatches: Swatch[], custom: boolean): string {
  return `<fieldset class="ce-group"><legend>${legend}</legend><div class="ce-swatches">${swatches.map((s) =>
    `<label class="ce-swatch" title="${esc(s.name)}"><input type="radio" name="${field}" value="${s.value}"><span style="background:${s.value}"></span><span class="sr-only">${esc(s.name)}</span></label>`).join('')}
    ${custom ? `<label class="ce-custom" title="Custom color"><input type="color" data-custom="${field}"><span class="sr-only">Custom ${legend.toLowerCase()}</span></label>` : ''}</div></fieldset>`;
}

export function openChibiEditor(signedIn: boolean): void {
  if (document.querySelector('.chibi-editor')) return;
  let draft: ChibiConfig = loadChibi();
  const dialog = document.createElement('dialog');
  dialog.className = 'chibi-editor';
  dialog.setAttribute('aria-labelledby', 'chibi-editor-title');
  dialog.innerHTML = `<div class="ce-head"><div><p class="auth-eyebrow">DEAR DAYS</p><h2 id="chibi-editor-title">Make it yours</h2></div><button type="button" class="account-close" data-ce="cancel" aria-label="Close without saving">×</button></div>
    <div class="ce-body"><div class="ce-preview"><div class="ce-stage"></div><div class="ce-quick"><button type="button" data-ce="random">Surprise me</button><button type="button" data-ce="reset">Reset</button></div></div>
    <form class="ce-controls" method="dialog">
      <fieldset class="ce-group"><legend>Start from</legend><div class="ce-presets">${PRESETS.map((p) => `<button type="button" data-preset="${p.id}">${p.name}</button>`).join('')}</div></fieldset>
      ${thumbGroup('hairStyle', 'Hair style', HAIR_STYLES.map((name, i) => ({ value: i, name })))}
      ${swatchGroup('hairColor', 'Hair color', HAIR_COLORS, true)}
      ${thumbGroup('eyeShape', 'Eye shape', EYE_SHAPES.map((name, i) => ({ value: i, name })))}
      ${swatchGroup('eyeColor', 'Eye color', EYE_COLORS, true)}
      ${swatchGroup('skinTone', 'Skin tone', SKIN_TONES, false)}
      ${thumbGroup('outfit', 'Outfit', OUTFITS.map((name, i) => ({ value: i, name })))}
      ${thumbGroup('accessory', 'Accessory', ACCESSORIES.map((a) => ({ value: a.id, name: a.name })))}
      ${thumbGroup('facialHair', 'Facial hair', FACIAL_HAIR.map((f) => ({ value: f.id, name: f.name })))}
      <label class="ce-toggle"><input type="checkbox" name="blush"><span>Rosy cheeks</span></label>
    </form></div>
    <p class="ce-feedback" role="status" aria-live="polite"></p>
    <div class="ce-actions"><button type="button" class="auth-guest" data-ce="cancel">Cancel</button><button type="button" class="auth-primary" data-ce="save">Save my chibi</button></div>`;
  document.body.appendChild(dialog);
  const preview = mountChibi(dialog.querySelector<HTMLElement>('.ce-stage')!, draft, 'Preview of your chibi');
  const form = dialog.querySelector('form')!;

  function sync() {
    for (const input of form.querySelectorAll<HTMLInputElement>('input[type="radio"]')) input.checked = String(draft[input.name as Field]) === input.value;
    form.querySelector<HTMLInputElement>('[name="blush"]')!.checked = draft.blush;
    for (const input of form.querySelectorAll<HTMLInputElement>('[data-custom]')) {
      const field = input.dataset.custom as Field; input.value = String(draft[field]);
      input.parentElement!.classList.toggle('is-active', !form.querySelector(`input[name="${field}"]:checked`));
    }
    const n = ++renders;
    for (const thumb of form.querySelectorAll<HTMLElement>('.chibi-thumb')) {
      const field = thumb.dataset.field as Field; const raw = thumb.dataset.value!;
      const value = NUMERIC.has(field) ? Number(raw) : raw;
      thumb.innerHTML = chibiSVG({ ...draft, [field]: value } as ChibiConfig, { uid: `ce${n}-${field}-${raw}` });
      thumb.querySelector('svg')!.setAttribute('viewBox', VIEW[field] ?? '0 0 200 240');
    }
    preview.update(draft);
  }
  form.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === 'blush') draft = { ...draft, blush: input.checked };
    else if (input.type === 'radio') draft = { ...draft, [input.name]: NUMERIC.has(input.name) ? Number(input.value) : input.value };
    sync();
  });
  form.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.custom) { draft = { ...draft, [input.dataset.custom]: input.value.toLowerCase() }; sync(); }
  });
  form.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const preset = PRESETS.find((p) => p.id === button.dataset.preset)!;
    draft = { ...draft, ...preset.look }; sync();
  }));
  const feedback = dialog.querySelector<HTMLElement>('.ce-feedback')!;
  dialog.querySelectorAll<HTMLButtonElement>('[data-ce]').forEach((button) => button.addEventListener('click', async () => {
    const act = button.dataset.ce;
    if (act === 'cancel') dialog.close();
    if (act === 'random') { draft = randomChibi(); sync(); preview.setMood('happy', 900); }
    if (act === 'reset') { draft = { ...DEFAULT_CHIBI }; sync(); }
    if (act === 'save') {
      button.disabled = true; feedback.textContent = 'Saving…';
      const synced = await saveChibi(draft, signedIn);
      preview.setMood('happy');
      feedback.textContent = signedIn && !synced ? 'Saved on this device. It will sync to your account next time you’re online.' : 'Saved!';
      setTimeout(() => dialog.close(), synced || !signedIn ? 450 : 1600);
    }
  }));
  dialog.addEventListener('close', () => { preview.destroy(); dialog.remove(); });
  sync();
  dialog.showModal();
}
