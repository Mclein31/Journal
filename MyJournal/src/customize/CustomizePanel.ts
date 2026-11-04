/* Book customization (Phase 2): cover color, cover texture, cover title, paper type, paper tint.
   Changes apply live to the real book behind the sheet. */
import { icon } from '../ui/icons';
import { toast } from '../ui/toast';
import type { CoverTexture, PaperTint, PaperType } from '../state/schema';
import { getDoc, subscribe, update } from '../state/store';
import { DESK_PRESETS, assetUrl, listBackgrounds, removeBackground, setBackground, uploadBackgrounds } from './backgrounds';

const COVER_COLORS = ['#d98a9f', '#f2879e', '#e8a87c', '#f6c26b', '#9fd3b4', '#7fb7a4', '#8ec5e8', '#7c9ed9', '#b8a1e3', '#c48bb8', '#8a6f5c', '#3d3a4a'];
const TEXTURES: { id: CoverTexture; label: string }[] = [
  { id: 'matte', label: 'Matte' },
  { id: 'linen', label: 'Linen' },
  { id: 'leather', label: 'Leather' },
  { id: 'kraft', label: 'Kraft' },
  { id: 'velvet', label: 'Velvet' },
  { id: 'corduroy', label: 'Corduroy' },
  { id: 'holographic', label: 'Holo' },
];
const PAPERS: { id: PaperType; label: string }[] = [
  { id: 'lined', label: 'Lined' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'grid', label: 'Grid' },
  { id: 'plain', label: 'Plain' },
];
const TINTS: { id: PaperTint; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'cream', label: 'Cream' },
  { id: 'kraft', label: 'Kraft' },
  { id: 'pink', label: 'Pink' },
  { id: 'mint', label: 'Mint' },
  { id: 'lavender', label: 'Lavender' },
];

type BookPatch = Partial<{ coverColor: string; coverTexture: CoverTexture; paperType: PaperType; paperTint: PaperTint; title: string }>;
const commit = (patch: BookPatch) =>
  update('book:style', (d) => Object.assign(d.book, patch, { updatedAt: Date.now() }));

export function openCustomizePanel(pageId?: string): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'panel sheet';
  dlg.setAttribute('aria-label', 'Customize book');
  dlg.innerHTML = `
    <form method="dialog" class="panel-inner">
      <header class="panel-head"><div><span class="eyebrow">A LITTLE MORE YOU</span><h2>Make it yours</h2></div><button class="icon-btn" value="close" aria-label="Close">${icon('x')}</button></header>
      <p class="panel-intro">Your own little world, down to the paper.</p>
      <div class="cz-tabs" role="tablist" aria-label="Customization category">
        <button type="button" role="tab" id="cz-tab-cover" aria-controls="cz-cover" aria-selected="true" data-category="cover">Cover</button>
        <button type="button" role="tab" id="cz-tab-paper" aria-controls="cz-paper" aria-selected="false" tabindex="-1" data-category="paper">Paper</button>
        <button type="button" role="tab" id="cz-tab-desk" aria-controls="cz-desk" aria-selected="false" tabindex="-1" data-category="desk">Desk</button>
      </div>
      <div class="cz-content" id="cz-cover" role="tabpanel" aria-labelledby="cz-tab-cover">
      <section class="cz-sec"><h3>Cover color</h3><div class="cz-row" data-group="color"></div></section>
      <section class="cz-sec"><h3>Cover texture</h3><div class="cz-row" data-group="texture"></div></section>
      <section class="cz-sec"><h3>Cover title</h3><input class="cz-title" maxlength="32" aria-label="Cover title" /></section>
      </div><div class="cz-content" id="cz-paper" role="tabpanel" aria-labelledby="cz-tab-paper" hidden><section class="cz-sec"><h3>Paper</h3><div class="cz-row" data-group="paper"></div></section>
      <section class="cz-sec"><h3>Paper color</h3><div class="cz-row" data-group="tint"></div></section>
      <section class="cz-sec cz-page-override"><label class="field-label">This page only<select class="inspector-input" aria-label="Paper for this page"><option value="">Follow book style</option>${PAPERS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select></label><p class="field-help">Give one page a different paper pattern.</p></section>
      </div><div class="cz-content" id="cz-desk" role="tabpanel" aria-labelledby="cz-tab-desk" hidden><section class="cz-sec"><h3>Desk</h3>
        <div class="cz-row" data-group="desk"></div>
        <h3 class="cz-sub">Your backgrounds</h3>
        <div class="cz-row" data-group="uploads"></div>
        <div class="cz-row cz-fit" data-group="fit"></div>
      </section></div>
      <footer class="cz-footer"><span>Changes save automatically on this device</span><button class="btn-primary" value="done">Done</button></footer>
    </form>`;
  document.body.appendChild(dlg);
  const selectCategory = (category: string) => {
    dlg.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((b) => { const active = b.dataset.category === category; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; });
    dlg.querySelectorAll<HTMLElement>('.cz-content').forEach((panel) => panel.hidden = panel.id !== `cz-${category}`);
  };
  dlg.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button, i, all) => {
    button.addEventListener('click', () => selectCategory(button.dataset.category!));
    button.addEventListener('keydown', (e) => {
      let next = i;
      if (e.key === 'ArrowRight') next = (i + 1) % all.length;
      else if (e.key === 'ArrowLeft') next = (i + all.length - 1) % all.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = all.length - 1;
      else return;
      e.preventDefault(); selectCategory(all[next].dataset.category!); all[next].focus();
    });
  });
  const override = dlg.querySelector<HTMLSelectElement>('.cz-page-override select')!;
  dlg.querySelector<HTMLElement>('.cz-page-override')!.hidden = !pageId;
  override.addEventListener('change', () => update('page:paper', (d) => {
    const page = d.pages.find((p) => p.id === pageId);
    if (page) { page.paperOverride = (override.value || undefined) as PaperType | undefined; page.updatedAt = Date.now(); }
  }));
  const group = (g: string) => dlg.querySelector<HTMLElement>(`[data-group="${g}"]`)!;

  const swatch = (label: string, pressed: boolean, onPick: () => void, cls: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cz-swatch ${cls}`;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(pressed));
    b.title = label;
    b.addEventListener('click', onPick);
    return b;
  };

  function draw() {
    const focused = dlg.contains(document.activeElement) ? document.activeElement?.getAttribute('aria-label') : null;
    const book = getDoc().book;
    override.value = getDoc().pages.find((p) => p.id === pageId)?.paperOverride ?? '';
    // cover colors + custom picker
    const colors = COVER_COLORS.map((c) => {
      const b = swatch(c, c.toLowerCase() === book.coverColor.toLowerCase(), () => commit({ coverColor: c }), 'cz-color');
      b.style.background = c;
      return b;
    });
    const picker = document.createElement('label');
    picker.className = 'cz-swatch cz-picker';
    picker.title = 'Custom color';
    picker.innerHTML = `<input type="color" aria-label="Custom cover color" />`;
    const input = picker.querySelector('input')!;
    input.value = book.coverColor;
    // live preview while dragging the picker; one undo step when it's released
    input.addEventListener('input', () => document.querySelector<HTMLElement>('.book')?.style.setProperty('--cover', input.value));
    input.addEventListener('change', () => commit({ coverColor: input.value }));
    group('color').replaceChildren(...colors, picker);

    group('texture').replaceChildren(...TEXTURES.map((t) => {
      const b = swatch(t.label, t.id === book.coverTexture, () => commit({ coverTexture: t.id }), 'cz-tex');
      b.innerHTML = `<span class="tex-swatch" data-texture="${t.id}"></span><span class="cz-cap">${t.label}</span>`;
      b.querySelector<HTMLElement>('.tex-swatch')!.style.backgroundColor = book.coverColor;
      return b;
    }));

    group('paper').replaceChildren(...PAPERS.map((p) => {
      const b = swatch(p.label, p.id === book.paperType, () => commit({ paperType: p.id }), 'cz-paper');
      b.innerHTML = `<span class="page paper-swatch" data-paper="${p.id}"><span class="page-sheet"></span></span><span class="cz-cap">${p.label}</span>`;
      b.querySelector<HTMLElement>('.paper-swatch')!.style.backgroundColor = `var(--paper-${book.paperTint})`;
      return b;
    }));

    group('tint').replaceChildren(...TINTS.map((t) => {
      const b = swatch(t.label, t.id === book.paperTint, () => commit({ paperTint: t.id }), 'cz-tint');
      b.style.background = `var(--paper-${t.id})`;
      return b;
    }));

    drawDesk(book.background);

    const title = dlg.querySelector<HTMLInputElement>('.cz-title')!;
    if (document.activeElement !== title) title.value = book.title;
    if (focused && (!document.activeElement || !dlg.contains(document.activeElement))) {
      [...dlg.querySelectorAll<HTMLElement>('[aria-label]')].find((el) => el.getAttribute('aria-label') === focused)?.focus({ preventScroll: true });
    }
  }

  let uploads: { id: string; url: string }[] = [];
  async function refreshUploads() {
    const list = await listBackgrounds();
    uploads = (await Promise.all(list.map(async (a) => ({ id: a.id, url: (await assetUrl(a.id)) ?? '' })))).filter((u) => u.url);
    draw();
  }

  function drawDesk(bg: ReturnType<typeof getDoc>['book']['background']) {
    group('desk').replaceChildren(...DESK_PRESETS.map((p) => {
      const b = swatch(p.label, bg.kind === 'preset' && bg.ref === p.id, () => setBackground({ kind: 'preset', ref: p.id, fit: bg.fit }), 'cz-desk');
      b.innerHTML = `<span class="desk-swatch" data-bg="${p.id}"></span><span class="cz-cap">${p.label}</span>`;
      return b;
    }));

    const mine = uploads.map((u) => {
      const wrap = document.createElement('div');
      wrap.className = 'cz-up';
      const b = swatch('Your background', bg.kind === 'upload' && bg.ref === u.id, () => setBackground({ kind: 'upload', ref: u.id, fit: bg.fit }), 'cz-desk');
      const thumb = document.createElement('span');
      thumb.className = 'desk-swatch';
      thumb.style.backgroundImage = `url("${u.url}")`;
      b.appendChild(thumb);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'cz-del';
      del.setAttribute('aria-label', 'Delete this background');
      del.textContent = '✕';
      del.addEventListener('click', async () => { try { await removeBackground(u.id); await refreshUploads(); } catch { toast('Could not remove this background. Please try again.'); } });
      wrap.append(b, del);
      return wrap;
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'cz-add';
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true; fileInput.hidden = true;
    add.innerHTML = `<span aria-hidden="true">＋</span><span class="cz-cap">Upload</span>`;
    add.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const files = [...(input.files ?? [])];
      input.value = '';
      add.disabled = true;
      try {
        const id = await uploadBackgrounds(files);
        if (id) setBackground({ kind: 'upload', ref: id, fit: bg.fit });
        await refreshUploads();
      } catch { toast('Could not add this background. Try a JPG or PNG, or free up device storage.'); }
      finally { add.disabled = false; }
    });
    group('uploads').replaceChildren(...mine, add, fileInput);

    // fill vs tile only matters for photos
    const fit = group('fit');
    fit.hidden = bg.kind !== 'upload';
    fit.replaceChildren(...(['cover', 'tile'] as const).map((f) => {
      const b = swatch(f === 'cover' ? 'Fill screen' : 'Tile', bg.fit === f, () => setBackground({ ...bg, fit: f }), 'cz-pill');
      b.textContent = f === 'cover' ? 'Fill screen' : 'Tile';
      return b;
    }));
  }

  dlg.querySelector<HTMLInputElement>('.cz-title')!.addEventListener('change', (e) => {
    commit({ title: (e.target as HTMLInputElement).value.trim() || 'My Little World' });
  });

  dlg.querySelector('.panel-inner')!.addEventListener('keydown', (e) => { const key = e as KeyboardEvent; if (key.key === 'Enter' && key.target instanceof HTMLInputElement) { key.preventDefault(); key.target.blur(); } });
  const unsubscribe = subscribe(draw);
  dlg.addEventListener('close', () => {
    unsubscribe();
    document.querySelector<HTMLElement>('.book')?.style.setProperty('--cover', getDoc().book.coverColor);
    document.body.classList.remove('customizing'); // book slides back to center
    dlg.remove();
  });
  draw();
  void refreshUploads().catch(() => toast('Your backgrounds could not be loaded. Please reopen Customize.'));
  dlg.showModal();
  document.body.classList.add('customizing'); // book makes room so the whole preview stays visible
}
