/* Object URLs for stored images (photos, backgrounds, stickers), cached per asset id. */
import { getAssetBlob } from './local';

const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();

export function assetUrl(id: string): Promise<string | undefined> {
  const cached = urls.get(id);
  if (cached) return Promise.resolve(cached);
  let p = pending.get(id);
  if (!p) {
    p = getAssetBlob(id).then((blob) => {
      if (!blob) return undefined;
      const url = URL.createObjectURL(blob);
      urls.set(id, url);
      return url;
    }).finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

/** Sync-friendly: sets img.src now if cached, otherwise as soon as the blob loads. */
export function bindAssetImage(img: HTMLImageElement, id: string): void {
  const cached = urls.get(id);
  if (cached) {
    img.src = cached;
    return;
  }
  void assetUrl(id).then((url) => {
    if (url && img.dataset.assetId === id) img.src = url;
  }).catch(() => { if (img.dataset.assetId === id && !img.alt) img.alt = 'Image unavailable'; });
}

export function forgetAssetUrl(id: string): void {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}
