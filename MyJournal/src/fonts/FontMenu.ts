/* Font, ink, highlight and decoration controls for the selected text box. */
import { getDoc } from '../state/store';
import { patchElement } from '../canvas/elements';
import { FONTS, FONT_CATS, INK_COLORS, fontDef, fontStack, loadAllFonts, rememberFont, type FontCat } from './fonts';

import { mountPicker } from '../ui/picker';
import { icon } from '../ui/icons';
let close: (() => void) | null = null;
const HIGHLIGHTS = [
  { color: '#fff0a8', label: 'Yellow' },
  { color: '#ffd6e2', label: 'Pink' },
  { color: '#d9eecb', label: 'Green' },
  { color: '#d9e9ff', label: 'Blue' },
  { color: '#e5d8f5', label: 'Lavender' },
  { color: '#ffd8b8', label: 'Peach' },
];

export function closeFontMenu(): void {
  close?.();
  close = null;
}

export function openFontMenu(elId: string, anchor: HTMLElement): void {
  closeFontMenu();
  const text = getDoc().elements.find((e) => e.id === elId)?.data.text;
  if (!text) return;
  loadAllFonts(); // previews need every family; files still download only as each preview renders

  const menu = document.createElement('div');
  menu.className = 'frame-menu font-menu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Font');
  menu.innerHTML = `<header class="picker-head"><div><h2>Text style</h2><p>Applies to the whole selected text box.</p></div><button type="button" class="icon-btn" data-picker-close aria-label="Close font picker">${icon('x')}</button></header>
    <div class="fo-format" role="group" aria-label="Text decoration">
      <button type="button" data-format="underline" aria-label="Underline text" aria-pressed="false"><span aria-hidden="true" class="fo-u">U</span> Underline</button>
      <button type="button" data-format="strikethrough" aria-label="Strikethrough text" aria-pressed="false"><span aria-hidden="true" class="fo-s">S</span> Strikethrough</button>
    </div>
    <section class="fo-color-section"><label class="fo-field-heading">Text color<input type="color" class="fo-custom-ink" aria-label="Custom text color" /></label><div class="fm-colors fo-inks" role="group" aria-label="Text color presets"></div></section>
    <section class="fo-color-section"><label class="fo-field-heading">Highlight<input type="color" class="fo-custom-highlight" aria-label="Custom highlight color" /></label><div class="fm-colors fo-highlights" role="group" aria-label="Highlight presets"></div></section>
    <p class="fo-field-heading fo-font-heading">Font</p><div class="st-cats fo-cats"></div><div class="fo-list" role="listbox" aria-label="Font family"></div>`;
  let cat: FontCat = fontDef(text.font).cat;

  const pickedByCategory = new Map<FontCat, string>([[fontDef(text.font).cat, fontDef(text.font).id]]);
  const current = () => getDoc().elements.find((e) => e.id === elId)?.data.text ?? text;
  const inkPicker = menu.querySelector<HTMLInputElement>('.fo-custom-ink')!;
  const highlightPicker = menu.querySelector<HTMLInputElement>('.fo-custom-highlight')!;
  const applyStyle = (patch: Partial<typeof text>, reason: string) => {
    patchElement(elId, { data: { text: { ...current(), ...patch } } }, reason);
    draw();
  };
  inkPicker.addEventListener('change', () => applyStyle({ color: inkPicker.value }, 'text:color'));
  highlightPicker.addEventListener('change', () => applyStyle({ highlight: highlightPicker.value }, 'text:highlight'));
  menu.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((b) => {
    const key = b.dataset.format as 'underline' | 'strikethrough';
    b.addEventListener('click', () => applyStyle({ [key]: !current()[key] }, `text:${key}`));
  });

  function applyFont(id: string) {
    rememberFont(id);
    pickedByCategory.set(fontDef(id).cat, id);
    if (fontDef(current().font).id !== id) patchElement(elId, { data: { text: { ...current(), font: id } } }, 'text:font');
  }

  function draw() {
    const style = current();
    inkPicker.value = style.color ?? INK_COLORS[0];
    highlightPicker.value = style.highlight ?? HIGHLIGHTS[0].color;
    menu.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((b) => b.setAttribute('aria-pressed', String(!!style[b.dataset.format as 'underline' | 'strikethrough'])));
    menu.querySelector('.fo-cats')!.replaceChildren(...FONT_CATS.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-cat';
      b.textContent = c.label;
      b.setAttribute('aria-pressed', String(c.id === cat));
      b.addEventListener('click', () => {
        cat = c.id;
        const chosen = pickedByCategory.get(cat) ?? FONTS.find((f) => f.cat === cat)!.id;
        applyFont(chosen);
        draw();
        menu.querySelector<HTMLElement>('.fo-cats [aria-pressed="true"]')?.focus({ preventScroll: true });
      });
      return b;
    }));
    menu.querySelector('.fo-list')!.replaceChildren(...FONTS.filter((f) => f.cat === cat).map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fo-item';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(fontDef(current().font).id === f.id));
      b.style.fontFamily = fontStack(f.id);
      b.style.setProperty('--fs', String(f.scale ?? 1));
      b.innerHTML = `<span class="fo-sample"></span><span class="fo-name"></span>`;
      b.querySelector('.fo-sample')!.textContent = f.cat === 'korean' ? '오늘 하루 고마워 ♡' : 'Dear diary, today ♡';
      b.querySelector('.fo-name')!.textContent = f.label;
      b.addEventListener('click', () => {
        applyFont(f.id);
        draw();
        menu.querySelector<HTMLElement>('.fo-item[aria-selected="true"]')?.focus({ preventScroll: true });
      });
      return b;
    }));
    menu.querySelector('.fo-inks')!.replaceChildren(...INK_COLORS.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fm-color';
      b.style.background = c;
      b.setAttribute('aria-label', `Ink ${c}`);
      b.setAttribute('aria-pressed', String((current().color ?? INK_COLORS[0]) === c));
      b.addEventListener('click', () => { patchElement(elId, { data: { text: { ...current(), color: c } } }, 'text:color'); draw(); [...menu.querySelectorAll<HTMLButtonElement>('.fo-inks button')].find((b) => b.getAttribute('aria-label') === `Ink ${c}`)?.focus({ preventScroll: true }); });
      return b;
    }));
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'fm-color fo-no-highlight';
    clear.setAttribute('aria-label', 'Remove highlight');
    clear.title = 'No highlight';
    clear.setAttribute('aria-pressed', String(!style.highlight));
    clear.innerHTML = icon('x');
    clear.addEventListener('click', () => {
      applyStyle({ highlight: undefined }, 'text:highlight');
      menu.querySelector<HTMLElement>('.fo-no-highlight')?.focus({ preventScroll: true });
    });
    menu.querySelector('.fo-highlights')!.replaceChildren(clear, ...HIGHLIGHTS.map((h) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fm-color';
      b.style.background = h.color;
      b.setAttribute('aria-label', `${h.label} highlight`);
      b.title = `${h.label} highlight`;
      b.setAttribute('aria-pressed', String(style.highlight?.toLowerCase() === h.color));
      b.addEventListener('click', () => {
        applyStyle({ highlight: h.color }, 'text:highlight');
        menu.querySelector<HTMLElement>(`[aria-label="${h.label} highlight"]`)?.focus({ preventScroll: true });
      });
      return b;
    }));
  }
  draw();

  close = mountPicker(menu, anchor, () => { close = null; });
}
