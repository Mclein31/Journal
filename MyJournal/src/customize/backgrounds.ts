/* Desk backgrounds (Phase 3): CSS presets + the user's own uploaded set (IndexedDB now, R2 in Phase 10). */
import { uid, type Asset, type Background } from '../state/schema';
import { getDoc, update } from '../state/store';
import { listAssets, putAsset, setAssetArchived } from '../sync/local';
import { assetUrl } from '../sync/assetUrls';

export { assetUrl };
import { compressImage } from '../util/image';

export const DESK_PRESETS = [
  { id: 'wood', label: 'Wood' },
  { id: 'walnut', label: 'Walnut' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'picnic', label: 'Picnic' },
  { id: 'linen', label: 'Linen' },
  { id: 'night', label: 'Starry' },
  { id: 'cozy', label: 'Cozy lights' },
  { id: 'blush', label: 'Blush' },
  { id: 'sage', label: 'Sage' },
  { id: 'empanada', label: 'Empanada' },
] as const;

let applySeq = 0;
/** Paint the desk. Uploads resolve asynchronously; a newer call always wins. */
export async function applyDesk(desk: HTMLElement, bg: Background): Promise<void> {
  const seq = ++applySeq;
  desk.dataset.fit = bg.fit;
  if (bg.kind === 'preset') {
    desk.dataset.bg = bg.ref;
    desk.style.backgroundImage = '';
    return;
  }
  const url = await assetUrl(bg.ref);
  if (seq !== applySeq) return;
  desk.dataset.bg = url ? 'upload' : 'wood'; // missing upload → fall back to the default desk
  desk.style.backgroundImage = url ? `url("${url}")` : '';
}

export function setBackground(bg: Background): void {
  update('book:desk', (d) => {
    d.book.background = bg;
    d.book.updatedAt = Date.now();
  });
}

/** Compress + store each image; returns the id of the last one so it can be selected. */
export async function uploadBackgrounds(files: Iterable<File>): Promise<string | undefined> {
  let last: string | undefined;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const { blob, w, h } = await compressImage(f, 2200, 0.85);
    const meta: Asset = { id: uid(), kind: 'background', mime: blob.type, w, h, bytes: blob.size, createdAt: Date.now() };
    await putAsset(meta, blob);
    last = meta.id;
  }
  return last;
}

export const listBackgrounds = () => listAssets('background');

export async function removeBackground(id: string): Promise<void> {
  await setAssetArchived(id, true); // Keep the image available to book undo/history.
  const bg = getDoc().book.background;
  if (bg.kind === 'upload' && bg.ref === id) setBackground({ kind: 'preset', ref: 'wood', fit: 'cover' });
}
