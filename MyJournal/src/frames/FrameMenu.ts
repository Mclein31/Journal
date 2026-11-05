/* Visual photo inspector. Original image and tear remain non-destructive. */
import { flush, getDoc } from '../state/store';
import { patchElement } from '../canvas/elements';
import { FRAMES, FRAME_COLORS, frameDef } from './frames';
import { bindAssetImage } from '../sync/assetUrls';
import { mountPicker } from '../ui/picker';
import { icon } from '../ui/icons';
import { saveCaptionDraft } from '../book/bookmark';
import { toast } from '../ui/toast';

let close: (() => void) | null = null;
export function closeFrameMenu(): void { close?.(); close = null; }

export function openFrameMenu(elId: string, anchor: HTMLElement, onTear: (id: string) => void): void {
  closeFrameMenu();
  const original = getDoc().elements.find((e) => e.id === elId)?.data.photo;
  if (!original) return;
  const current = () => getDoc().elements.find((e) => e.id === elId)?.data.photo ?? original;
  const menu = document.createElement('div');
  menu.className = 'frame-menu photo-inspector';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Photo frame');
  menu.innerHTML = `<header class="picker-head"><div><h2>Make it a memory</h2><p>Choose a frame, then make it yours.</p></div><button type="button" class="icon-btn" data-picker-close aria-label="Close photo frame">${icon('x')}</button></header>
    <div class="fm-grid" aria-label="Frame style"></div>
    <section class="fm-details"><label class="field-label">Frame color <input class="fm-custom-color" type="color" aria-label="Custom frame color" /></label><div class="fm-colors" aria-label="Frame color"></div>
    <label class="field-label fm-caption-label">Caption<input class="inspector-input" maxlength="160" placeholder="A little story for this photo…" aria-label="Photo caption" /></label>
    <button type="button" class="btn-soft fm-tear">${icon('tear')} Edit tear</button></section>`;
  const grid = menu.querySelector<HTMLElement>('.fm-grid')!;
  for (const f of FRAMES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'fm-item';
    b.dataset.frameId = f.id;
    b.setAttribute('aria-label', f.label);
    b.innerHTML = `<span class="fm-preview"><span class="frame" data-frame="${f.id}"><img class="photo-img" alt="" draggable="false" />${f.caption ? '<span class="frame-caption">a little memory</span>' : ''}</span></span><span>${f.label}</span>`;
    const preview = b.querySelector<HTMLImageElement>('img')!;
    preview.dataset.assetId = original.assetId;
    bindAssetImage(preview, original.assetId);
    b.addEventListener('click', () => {
      if (f.tear) { closeFrameMenu(); onTear(elId); return; }
      patchElement(elId, { data: { photo: { ...current(), frame: f.id } } }, 'photo:frame');
      draw();
    });
    grid.appendChild(b);
  }
  const colors = menu.querySelector<HTMLElement>('.fm-colors')!;
  FRAME_COLORS.forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fm-color';
    b.style.background = c; b.dataset.color = c;
    b.setAttribute('aria-label', `Frame color ${c}`);
    b.addEventListener('click', () => { patchElement(elId, { data: { photo: { ...current(), frameColor: c } } }, 'photo:frame-color'); draw(); });
    colors.appendChild(b);
  });
  const picker = menu.querySelector<HTMLInputElement>('.fm-custom-color')!;
  picker.addEventListener('change', () => { patchElement(elId, { data: { photo: { ...current(), frameColor: picker.value } } }, 'photo:frame-color'); draw(); });
  const caption = menu.querySelector<HTMLInputElement>('.inspector-input')!;
  caption.value = original.caption ?? '';
  const commitCaption = () => {
    const p = getDoc().elements.find((e) => e.id === elId)?.data.photo;
    const value = caption.value.trim();
    if (p && value !== (p.caption ?? '')) {
      patchElement(elId, { data: { photo: { ...p, caption: value } } }, 'photo:caption');
      void flush().catch(() => {});
    }
  };
  caption.addEventListener('change', commitCaption);
  caption.addEventListener('input', () => { void saveCaptionDraft(elId, caption.value.trim()).catch(() => toast('Could not save your caption. Check available device storage.')); });
  const onHide = () => { if (document.visibilityState === 'hidden') commitCaption(); };
  addEventListener('pagehide', commitCaption);
  addEventListener('visibilitychange', onHide);
  menu.querySelector('.fm-tear')!.addEventListener('click', () => { closeFrameMenu(); onTear(elId); });
  function draw() {
    const p = current();
    menu.querySelectorAll<HTMLButtonElement>('[data-frame-id]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.frameId === p.frame)));
    colors.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === (p.frameColor ?? '#ffffff'))));
    menu.querySelectorAll<HTMLElement>('.frame').forEach((f) => f.style.setProperty('--frame-color', p.frameColor ?? '#ffffff'));
    const colorable = ['polaroid', 'instant', 'instant-wide', 'photocard', 'tape', 'stamp', 'scallop', 'circle'].includes(p.frame);
    colors.hidden = !colorable;
    picker.closest<HTMLElement>('label')!.hidden = !colorable;
    menu.querySelector<HTMLElement>('.fm-caption-label')!.hidden = !frameDef(p.frame).caption;
    menu.querySelector<HTMLElement>('.fm-tear')!.hidden = p.frame !== 'torn';
    picker.value = p.frameColor ?? '#ffffff';
  }
  draw();
  close = mountPicker(menu, anchor, () => {
    close = null;
    removeEventListener('pagehide', commitCaption);
    removeEventListener('visibilitychange', onHide);
    commitCaption();
  });
}
