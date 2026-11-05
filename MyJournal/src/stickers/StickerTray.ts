/* Stickers can be removed from the upload tray and restored without breaking placed copies. */
import { uid } from '../state/schema';
import { listAssets, putAsset, setAssetArchived } from '../sync/local';
import { assetUrl } from '../sync/assetUrls';
import { compressImage } from '../util/image';
import { icon } from '../ui/icons';
import { toast } from '../ui/toast';
import { CATEGORIES, STICKERS, stickerDef, stickerUri, type StickerDef } from './packs';

const RECENT_KEY = 'mlw:recent-stickers';
const recent = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 8) : [];
  } catch { return []; }
};
const pushRecent = (id: string) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent().filter((r) => r !== id)].slice(0, 8))); } catch { /* Recents are optional. */ }
};

export function openStickerTray(onPick: (stickerId: string, aspect: number) => void): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'panel sheet sticker-sheet';
  dlg.setAttribute('aria-label', 'Stickers');
  dlg.innerHTML = `
    <form method="dialog" class="panel-inner">
      <header class="panel-head"><div><h2>Sticker box</h2><p class="st-library-count">${STICKERS.length} illustrated details for your pages.</p></div><button class="icon-btn" value="close" aria-label="Close">${icon('x')}</button></header>
      <label class="field-label st-search">Find a little detail<input class="inspector-input" type="search" aria-label="Find stickers" placeholder="Try coffee, camera, flowers…" /></label>
      <p class="st-results" role="status" hidden></p>
      <section class="cz-sec st-recent-sec"><h3>Recently used</h3><div class="st-grid" data-g="recent"></div></section>
      <div class="st-cats" role="group" aria-label="Sticker categories"></div>
      <div class="st-upload-tools" hidden><p class="field-help">Remove uploads here. Stickers already on your pages stay safe.</p><button type="button" class="btn-soft" data-st-act="removed">Removed stickers</button></div>
      <div class="st-grid" data-g="grid"></div>
    </form>`;
  document.body.appendChild(dlg);
  const g = (n: string) => dlg.querySelector<HTMLElement>(`[data-g="${n}"]`)!;
  let cat: StickerDef['cat'] | 'mine' = 'studio';
  let removed = false;
  const search = dlg.querySelector<HTMLInputElement>('[aria-label="Find stickers"]')!;
  let mine: { id: string; url: string; aspect: number; archived: boolean }[] = [];

  const item = (label: string, src: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'st-item'; b.title = label;
    b.setAttribute('aria-label', `Add ${label} sticker`);
    const img = document.createElement('img'); img.alt = ''; img.src = src; b.appendChild(img);
    b.addEventListener('click', onClick);
    return b;
  };
  const pick = (id: string, aspect: number) => { pushRecent(id); onPick(id, aspect); drawRecent(); };
  const builtIn = (d: StickerDef) => { const button = item(d.label, stickerUri(d), () => pick(d.id, d.aspect ?? 1)); button.classList.toggle('st-studio', !!d.src); return button; };

  function drawRecent() {
    const ids = recent().filter((id) => id.startsWith('asset:') ? mine.some((m) => `asset:${m.id}` === id && !m.archived) : stickerDef(id));
    dlg.querySelector<HTMLElement>('.st-recent-sec')!.hidden = !ids.length;
    g('recent').replaceChildren(...ids.map((id) => {
      if (!id.startsWith('asset:')) return builtIn(stickerDef(id)!);
      const m = mine.find((x) => `asset:${x.id}` === id)!;
      return item('Your sticker', m.url, () => pick(id, m.aspect));
    }));
  }

  function uploaded(m: typeof mine[number]) {
    const wrap = document.createElement('div'); wrap.className = 'st-upload';
    const thumb = item('Your sticker', m.url, () => { if (!m.archived) pick(`asset:${m.id}`, m.aspect); });
    thumb.disabled = m.archived;
    const action = document.createElement('button'); action.type = 'button'; action.className = 'st-remove';
    action.setAttribute('aria-label', m.archived ? 'Restore uploaded sticker' : 'Remove uploaded sticker');
    action.title = m.archived ? 'Restore sticker' : 'Remove sticker';
    action.innerHTML = icon(m.archived ? 'undo' : 'del');
    action.addEventListener('click', async () => {
      action.disabled = true;
      try { await setAssetArchived(m.id, !m.archived); await loadMine(); toast(m.archived ? 'Sticker restored' : 'Sticker removed. You can restore it from Removed stickers.'); }
      catch { action.disabled = false; toast('Could not update this sticker. Please try again.'); }
    });
    wrap.append(thumb, action);
    return wrap;
  }

  function draw() {
    const cats = dlg.querySelector<HTMLElement>('.st-cats')!;
    cats.replaceChildren(...[...CATEGORIES, { id: 'mine' as const, label: 'Your stickers' }].map((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'st-cat'; b.textContent = c.label;
      b.setAttribute('aria-pressed', String(c.id === cat));
      b.addEventListener('click', () => { cat = c.id; removed = false; search.value = ''; draw(); dlg.querySelector<HTMLElement>('.st-cat[aria-pressed="true"]')?.focus({ preventScroll: true }); });
      return b;
    }));
    dlg.querySelector<HTMLElement>('.st-upload-tools')!.hidden = cat !== 'mine';
    dlg.querySelector<HTMLElement>('[data-st-act="removed"]')!.textContent = removed ? 'Back to your stickers' : 'Removed stickers';
    const query = search.value.trim().toLowerCase();
    const results = dlg.querySelector<HTMLElement>('.st-results')!;
    results.hidden = !query;
    if (cat !== 'mine') {
      const matches = STICKERS.filter((s) => query ? `${s.label} ${s.cat} ${s.id}`.toLowerCase().includes(query) : cat === 'studio' ? true : s.cat === cat);
      g('grid').classList.add('st-studio-grid');
      g('grid').replaceChildren(...matches.map(builtIn));
      results.textContent = matches.length ? `${matches.length} sticker${matches.length === 1 ? '' : 's'} found` : 'No stickers found. Try another word.';
    } else {
      g('grid').classList.remove('st-studio-grid');
      results.hidden = true;
      const tiles: HTMLElement[] = mine.filter((m) => m.archived === removed).map(uploaded);
      if (!removed) {
        const add = document.createElement('button'); add.type = 'button'; add.className = 'cz-add';
        add.innerHTML = '<span aria-hidden="true">＋</span><span class="cz-cap">Upload</span>';
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
        add.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
          add.disabled = true;
          let failed = 0;
          for (const f of [...(input.files ?? [])]) {
            if (!f.type.startsWith('image/')) continue;
            try {
              const { blob, w, h } = await compressImage(f, 800, 0.9, true);
              await putAsset({ id: uid(), kind: 'sticker', mime: blob.type, w, h, bytes: blob.size, createdAt: Date.now() }, blob);
            } catch { failed++; }
          }
          input.value = ''; add.disabled = false;
          await loadMine().catch(() => toast('Could not refresh your stickers. Please reopen the tray.'));
          if (failed) toast(`${failed} sticker${failed === 1 ? '' : 's'} could not be uploaded. Try a PNG or WebP image.`);
        });
        tiles.push(add, input);
      }
      if (!tiles.length) { const empty = document.createElement('p'); empty.className = 'field-help'; empty.textContent = 'No removed stickers.'; tiles.push(empty); }
      g('grid').replaceChildren(...tiles);
    }
    drawRecent();
  }

  async function loadMine() {
    const list = await listAssets('sticker', true);
    mine = (await Promise.all(list.map(async (a) => ({ id: a.id, url: (await assetUrl(a.id)) ?? '', aspect: a.w / a.h, archived: !!a.archived })))).filter((m) => m.url);
    if (dlg.isConnected) draw();
  }

  search.addEventListener('input', () => { if (cat === 'mine') cat = 'studio'; draw(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  dlg.querySelector('[data-st-act="removed"]')!.addEventListener('click', () => { removed = !removed; draw(); });
  dlg.addEventListener('close', () => { document.body.classList.remove('customizing'); dlg.remove(); });
  draw();
  void loadMine().catch(() => toast('Your stickers could not be loaded. Please reopen the tray.'));
  dlg.showModal();
  document.body.classList.add('customizing');
}
