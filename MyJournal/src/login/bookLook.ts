/* A small copy of how the user's journal looks, kept on this device so the login screen (shown
   before sign-in) can draw the same cover, title, paper, tabs and desk. Not account-scoped, like
   the chibi: it reflects the last journal opened in this browser. */
import type { Background, BookDoc, Book } from '../state/schema';
import { assetUrl } from '../sync/assetUrls';

export interface BookLook {
  title: string;
  coverColor: string;
  coverTexture: Book['coverTexture'];
  paperType: Book['paperType'];
  paperTint: Book['paperTint'];
  background: Background;
  sections: { name: string; color: string }[];
}
export interface DeskImage { ref: string; url: string; dark: boolean }

const KEY = 'dd:book-look';
const IMAGE_KEY = 'dd:book-look-desk';
const DARK_PRESETS = new Set(['walnut', 'night', 'cozy']);

export const DEFAULT_LOOK: BookLook = {
  title: 'Dear Days', coverColor: '#3e5568', coverTexture: 'linen', paperType: 'lined', paperTint: 'cream',
  background: { kind: 'preset', ref: 'wood', fit: 'cover' },
  sections: [{ name: 'Journal', color: '#e8a87c' }, { name: 'Schedule', color: '#8ec5e8' }, { name: 'Memories', color: '#f6c26b' }, { name: 'Notes', color: '#9fd3b4' }],
};

const read = <T,>(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; } };
const write = (key: string, value: unknown): void => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full or private storage: login keeps the default look */ } };

export function lookOf(doc: BookDoc): BookLook {
  const { title, coverColor, coverTexture, paperType, paperTint, background } = doc.book;
  const sections = [...doc.sections].sort((a, b) => a.position - b.position).slice(0, 8).map((s) => ({ name: s.name, color: s.color }));
  return { title, coverColor, coverTexture, paperType, paperTint, background: { ...background }, sections };
}

export function loadBookLook(): BookLook {
  const saved = read<Partial<BookLook>>(KEY);
  if (!saved || typeof saved !== 'object') return DEFAULT_LOOK;
  const hex = (v: unknown, d: string) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  return {
    title: typeof saved.title === 'string' && saved.title.trim() ? saved.title.slice(0, 120) : DEFAULT_LOOK.title,
    coverColor: hex(saved.coverColor, DEFAULT_LOOK.coverColor),
    coverTexture: saved.coverTexture ?? DEFAULT_LOOK.coverTexture,
    paperType: saved.paperType ?? DEFAULT_LOOK.paperType,
    paperTint: saved.paperTint ?? DEFAULT_LOOK.paperTint,
    background: saved.background?.kind && saved.background.ref ? saved.background : DEFAULT_LOOK.background,
    sections: Array.isArray(saved.sections) ? saved.sections.filter((s) => s && typeof s.name === 'string').slice(0, 8).map((s) => ({ name: s.name, color: hex(s.color, '#c9b79c') })) : DEFAULT_LOOK.sections,
  };
}

/** Uploaded desk photos are stored as a small JPEG copy so the login screen can show them before sign-in. */
export function loadDeskImage(ref: string): DeskImage | null {
  const image = read<DeskImage>(IMAGE_KEY);
  return image?.ref === ref && typeof image.url === 'string' && image.url.startsWith('data:image/') ? image : null;
}
export const isDarkPreset = (ref: string): boolean => DARK_PRESETS.has(ref);

let last = '';
let pendingImage = '';
export function rememberBookLook(doc: BookDoc): void {
  const look = lookOf(doc);
  const json = JSON.stringify(look);
  if (json !== last) { last = json; write(KEY, look); }
  const bg = look.background;
  if (bg.kind === 'upload' && !loadDeskImage(bg.ref) && pendingImage !== bg.ref) { pendingImage = bg.ref; void captureDesk(bg.ref).finally(() => { pendingImage = ''; }); }
}

async function captureDesk(ref: string): Promise<void> {
  try {
    const source = await assetUrl(ref);
    if (!source || typeof createImageBitmap !== 'function') return;
    const bitmap = await createImageBitmap(await (await fetch(source)).blob());
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0; let n = 0;
    for (let i = 0; i < px.length; i += 4 * 97) { sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; n++; }
    const url = canvas.toDataURL('image/jpeg', 0.72);
    if (url.length < 900_000) write(IMAGE_KEY, { ref, url, dark: n > 0 && sum / n < 110 });
  } catch { /* the login screen falls back to the default desk */ }
}
