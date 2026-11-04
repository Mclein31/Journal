/* Text fonts. Each text box stores a font id, so one page can mix many fonts.
   Families load lazily from Google Fonts: only fonts in use at boot, the rest when the picker opens.
   `scale` evens out very different x-heights so every font sits nicely on the lines. */

export type FontCat = 'hand' | 'cursive' | 'korean' | 'clean';

export interface FontDef {
  id: string;
  family: string;
  label: string;
  cat: FontCat;
  scale?: number;
  /** Google Fonts axis spec, if the default 400 isn't right */
  spec?: string;
}

export const FONT_CATS: { id: FontCat; label: string }[] = [
  { id: 'hand', label: 'Handwriting' },
  { id: 'cursive', label: 'Cursive' },
  { id: 'korean', label: '한글 Korean' },
  { id: 'clean', label: 'Clean' },
];

export const FONTS: FontDef[] = [
  // natural handwriting
  { id: 'caveat', family: 'Caveat', label: 'Caveat', cat: 'hand' },
  { id: 'patrick', family: 'Patrick Hand', label: 'Patrick Hand', cat: 'hand', scale: 0.92 },
  { id: 'indie', family: 'Indie Flower', label: 'Indie Flower', cat: 'hand', scale: 0.92 },
  { id: 'shadows', family: 'Shadows Into Light', label: 'Shadows Into Light', cat: 'hand' },
  { id: 'kalam', family: 'Kalam', label: 'Kalam', cat: 'hand', scale: 0.88 },
  { id: 'gloria', family: 'Gloria Hallelujah', label: 'Gloria', cat: 'hand', scale: 0.82 },
  { id: 'reenie', family: 'Reenie Beanie', label: 'Reenie Beanie', cat: 'hand', scale: 1.3 },
  { id: 'nothing', family: 'Nothing You Could Do', label: 'Nothing You Could Do', cat: 'hand', scale: 0.86 },
  { id: 'comingsoon', family: 'Coming Soon', label: 'Coming Soon', cat: 'hand', scale: 0.86 },
  { id: 'architects', family: 'Architects Daughter', label: 'Architects Daughter', cat: 'hand', scale: 0.84 },
  // cursive
  { id: 'dancing', family: 'Dancing Script', label: 'Dancing Script', cat: 'cursive' },
  { id: 'greatvibes', family: 'Great Vibes', label: 'Great Vibes', cat: 'cursive', scale: 1.15 },
  { id: 'pacifico', family: 'Pacifico', label: 'Pacifico', cat: 'cursive', scale: 0.82 },
  { id: 'sacramento', family: 'Sacramento', label: 'Sacramento', cat: 'cursive', scale: 1.3 },
  { id: 'satisfy', family: 'Satisfy', label: 'Satisfy', cat: 'cursive', scale: 0.96 },
  { id: 'allura', family: 'Allura', label: 'Allura', cat: 'cursive', scale: 1.2 },
  { id: 'homemade', family: 'Homemade Apple', label: 'Homemade Apple', cat: 'cursive', scale: 0.8 },
  // Korean handwriting (all include Latin too)
  { id: 'gaegu', family: 'Gaegu', label: '개구 Gaegu', cat: 'korean' },
  { id: 'nanumpen', family: 'Nanum Pen Script', label: '나눔손글씨 펜', cat: 'korean', scale: 1.28 },
  { id: 'nanumbrush', family: 'Nanum Brush Script', label: '나눔손글씨 붓', cat: 'korean', scale: 1.25 },
  { id: 'himelody', family: 'Hi Melody', label: '하이멜로디', cat: 'korean', scale: 1.12 },
  { id: 'gamja', family: 'Gamja Flower', label: '감자꽃', cat: 'korean' },
  { id: 'poorstory', family: 'Poor Story', label: '푸어스토리', cat: 'korean' },
  { id: 'eastsea', family: 'East Sea Dokdo', label: '동해 독도', cat: 'korean', scale: 1.32 },
  { id: 'yeonsung', family: 'Yeon Sung', label: '연성', cat: 'korean', scale: 0.95 },
  { id: 'singleday', family: 'Single Day', label: '싱글데이', cat: 'korean' },
  { id: 'cutefont', family: 'Cute Font', label: '귀여운 글씨', cat: 'korean', scale: 1.32 },
  { id: 'dongle', family: 'Dongle', label: '동글', cat: 'korean', scale: 1.45 },
  // clean
  { id: 'nunito', family: 'Nunito', label: 'Nunito', cat: 'clean', scale: 0.82 },
  { id: 'lora', family: 'Lora', label: 'Lora', cat: 'clean', scale: 0.82, spec: 'ital,wght@0,400;1,400' },
  { id: 'playfair', family: 'Playfair Display', label: 'Playfair', cat: 'clean', scale: 0.82, spec: 'ital,wght@0,400;1,400' },
  { id: 'courier', family: 'Courier Prime', label: 'Courier Prime', cat: 'clean', scale: 0.82 },
  { id: 'typewriter', family: 'Special Elite', label: 'Typewriter', cat: 'clean', scale: 0.84 },
];

export const INK_COLORS = ['#3d2d3a', '#1f2a44', '#7a2e3a', '#c94f6d', '#3f7a52', '#5b78c2', '#9a6a2f', '#7d5fb0'];

export const DEFAULT_FONT = 'caveat';
const LAST_KEY = 'mlw:last-font';

export const fontDef = (id?: string): FontDef => FONTS.find((f) => f.id === id) ?? FONTS[0];

export function fontStack(id?: string): string {
  const f = fontDef(id);
  const fallback = f.cat === 'korean' ? "'Noto Sans KR', sans-serif" : f.cat === 'clean' ? 'serif' : 'cursive';
  return `'${f.family}', ${fallback}`;
}

export const lastFont = (): string => { try { return localStorage.getItem(LAST_KEY) ?? DEFAULT_FONT; } catch { return DEFAULT_FONT; } };
export const rememberFont = (id: string): void => { try { localStorage.setItem(LAST_KEY, id); } catch { /* The font is still saved on its text element. */ } };

const loaded = new Set<string>(['Caveat', 'Gaegu', 'Nunito']); // already in index.html

/** Inject one Google Fonts stylesheet for any families not loaded yet. Files download only when used. */
export function loadFonts(ids: Iterable<string>): void {
  const need = [...new Set([...ids].map((id) => fontDef(id)))].filter((f) => !loaded.has(f.family));
  if (!need.length) return;
  need.forEach((f) => loaded.add(f.family));
  const families = need.map((f) => `family=${f.family.replace(/ /g, '+')}${f.spec ? `:${f.spec}` : ''}`).join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

export const loadAllFonts = () => loadFonts(FONTS.map((f) => f.id));
