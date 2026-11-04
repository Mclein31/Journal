/* Page element operations. All changes go through the store (one undo step each). */
import { uid, type ElementData, type ElementType, type PageElement } from '../state/schema';
import { getDoc, update } from '../state/store';
import { putAsset } from '../sync/local';
import { compressImage } from '../util/image';
import { buildLayout } from '../book/layout';
import { lastFont } from '../fonts/fonts';
import { stickerDef } from '../stickers/packs';

const spreadPages = (doc: ReturnType<typeof getDoc>, pageId: string) => {
  const pages = buildLayout(doc).pages;
  const i = pages.findIndex((p) => p.id === pageId);
  return new Set(i < 0 ? [pageId] : pages.slice(i - i % 2, i - i % 2 + 2).map((p) => p.id));
};
const maxZ = (pageId: string) => { const doc = getDoc(); const ids = spreadPages(doc, pageId); return Math.max(0, ...doc.elements.filter((e) => ids.has(e.pageId)).map((e) => e.z)); };

function add(pageId: string, type: ElementType, data: ElementData, at: { x: number; y: number }, w: number, rot = 0): string {
  const id = uid();
  const el: PageElement = { id, pageId, type, x: at.x - w / 2, y: at.y, w, rot, z: maxZ(pageId) + 1, data, updatedAt: Date.now() };
  update(`add:${type}`, (d) => { d.elements.push(el); });
  return id;
}

/** Store the image, then drop it on the page centered at `at` with a slight scrapbook tilt. */
export async function addPhoto(pageId: string, file: Blob, at = { x: 0.5, y: 0.3 }): Promise<string> {
  const { blob, w, h } = await compressImage(file, 1600, 0.82);
  const assetId = uid();
  await putAsset({ id: assetId, kind: 'photo', mime: blob.type, w, h, bytes: blob.size, createdAt: Date.now() }, blob);
  const rot = Math.round((Math.random() * 8 - 4) * 10) / 10;
  return add(pageId, 'photo', { photo: { assetId, aspect: w / h, frame: 'none' } }, { x: at.x, y: Math.max(0.04, at.y - 0.1) }, 0.5, rot);
}

export function addSticker(pageId: string, stickerId: string, aspect = 1, at = { x: 0.5, y: 0.3 }): string {
  const rot = Math.round((Math.random() * 16 - 8) * 10) / 10;
  const w = aspect > 1.6 ? 0.42 : 0.2;
  return add(pageId, 'sticker', { sticker: { stickerId, aspect, effect: stickerDef(stickerId)?.src || stickerId.startsWith('a-') ? 'none' : 'outline' } }, at, w, rot);
}

export function addText(pageId: string, at = { x: 0.5, y: 0.2 }, content = ''): string {
  return add(pageId, 'text', { text: { content, size: 1, font: lastFont() } }, at, 0.6);
}

/** undoable=false merges into the previous undo step (e.g. first text typed into a just-added box). */
export function patchElement(id: string, patch: Partial<Pick<PageElement, 'x' | 'y' | 'w' | 'rot' | 'z'>> & { data?: ElementData }, reason = 'el:edit', undoable = true): void {
  update(reason, (d) => {
    const el = d.elements.find((e) => e.id === id);
    if (!el) return;
    const { data, ...rest } = patch;
    Object.assign(el, rest, { updatedAt: Date.now() });
    if (data) el.data = { ...el.data, ...data };
  }, { undoable });
}

export function deleteElement(id: string): void {
  update('el:delete', (d) => { d.elements = d.elements.filter((e) => e.id !== id); });
}

export function duplicateElement(id: string): string | undefined {
  const src = getDoc().elements.find((e) => e.id === id);
  if (!src) return undefined;
  const copy: PageElement = { ...structuredClone(src), id: uid(), x: Math.min(1 - src.w * 0.2, src.x + 0.04), y: Math.min(0.85, src.y + 0.04), z: maxZ(src.pageId) + 1, updatedAt: Date.now() };
  update('el:duplicate', (d) => { d.elements.push(copy); });
  return copy.id;
}

/** Front/back by renumbering the page's layers 1..n — z never goes ≤ 0 (negative z slipped behind the paper). */
export function reorder(id: string, to: 'front' | 'back'): void {
  update('el:reorder', (d) => {
    const el = d.elements.find((e) => e.id === id);
    if (!el) return;
    const ids = spreadPages(d, el.pageId);
    const others = d.elements.filter((e) => ids.has(e.pageId) && e.id !== id).sort((a, b) => a.z - b.z);
    const stack = to === 'front' ? [...others, el] : [el, ...others];
    stack.forEach((e, i) => (e.z = i + 1));
  });
}

/** Move; if the item's center crosses the spine it now belongs to the facing page. */
export function moveElement(id: string, x: number, y: number, acrossSpine = true): void {
  update('el:move', (d) => {
    const el = d.elements.find((e) => e.id === id);
    if (!el) return;
    el.x = x;
    el.y = y;
    el.updatedAt = Date.now();
    if (!acrossSpine) return;
    const order = buildLayout(d).pages;
    const i = order.findIndex((p) => p.id === el.pageId);
    const center = x + el.w / 2;
    if (i % 2 === 0 && center > 1 && order[i + 1]) {
      el.pageId = order[i + 1].id;
      el.x -= 1;
    } else if (i % 2 === 1 && center < 0 && order[i - 1]) {
      el.pageId = order[i - 1].id;
      el.x += 1;
    }
  });
}
