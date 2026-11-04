import { STUDIO_STICKERS } from './studioPacks';
import { EXTRA_STICKERS } from './extraPacks';

/* Original SVG catalog for the local-first journal editor. */

interface StickerBase {
  id: string;
  cat: 'cute' | 'food' | 'nature' | 'words' | 'doodles' | 'tape' | 'animals' | 'cozy' | 'moods' | 'travel' | 'journal' | 'studio' | 'flowers';
  label: string;
  /** width / height */
  aspect?: number;
}

export type StickerDef = StickerBase & (
  | { src: string; svg?: never }
  | { svg: string; src?: never }
);

const svg = (body: string, vb = '0 0 100 100') => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}'>${body}</svg>`;
const word = (text: string, fill: string, stroke: string) =>
  svg(`<rect x='4' y='14' width='152' height='52' rx='26' fill='${fill}' stroke='${stroke}' stroke-width='4'/><text x='80' y='50' font-family='Gaegu,Caveat,cursive' font-size='34' font-weight='700' text-anchor='middle' fill='${stroke}'>${text}</text>`, '0 0 160 80');
const tape = (bg: string, pattern: string) =>
  svg(`<defs><pattern id='p' width='16' height='16' patternUnits='userSpaceOnUse'>${pattern}</pattern></defs><path d='M4 6 L196 2 L192 12 L198 22 L194 34 L198 46 L4 50 L8 38 L2 28 L8 18 Z' fill='${bg}' opacity='.9'/><path d='M4 6 L196 2 L192 12 L198 22 L194 34 L198 46 L4 50 L8 38 L2 28 L8 18 Z' fill='url(#p)'/>`, '0 0 200 52');

const LEGACY_STICKERS: StickerDef[] = [
  // ── cute ──
  { id: 'heart', cat: 'cute', label: 'Heart', svg: svg(`<path d='M50 88C22 68 6 52 6 32 6 18 17 8 30 8c9 0 16 5 20 12 4-7 11-12 20-12 13 0 24 10 24 24 0 20-16 36-44 56z' fill='#f47f9a' stroke='#c94f6d' stroke-width='3'/><ellipse cx='30' cy='30' rx='8' ry='5' fill='#fff' opacity='.6' transform='rotate(-30 30 30)'/>`) },
  { id: 'star', cat: 'cute', label: 'Star', svg: svg(`<path d='M50 6l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 37l30-3z' fill='#ffd45e' stroke='#d9a21b' stroke-width='3' stroke-linejoin='round'/><circle cx='42' cy='52' r='3' fill='#6b4b2a'/><circle cx='58' cy='52' r='3' fill='#6b4b2a'/><path d='M44 61q6 5 12 0' stroke='#6b4b2a' stroke-width='2.5' fill='none' stroke-linecap='round'/>`) },
  { id: 'bow', cat: 'cute', label: 'Bow', svg: svg(`<path d='M50 50L12 26c-6 10-6 38 0 48zM50 50l38-24c6 10 6 38 0 48z' fill='#f7a3be' stroke='#cc6d8f' stroke-width='3' stroke-linejoin='round'/><path d='M44 54l-10 34 10-6 6 8 4-36' fill='#f7a3be' stroke='#cc6d8f' stroke-width='3' stroke-linejoin='round'/><rect x='42' y='40' width='16' height='20' rx='6' fill='#ee8aab' stroke='#cc6d8f' stroke-width='3'/>`) },
  { id: 'sparkle', cat: 'cute', label: 'Sparkles', svg: svg(`<path d='M40 10q4 26 30 30-26 4-30 30-4-26-30-30 26-4 30-30z' fill='#ffe58a' stroke='#e0b43a' stroke-width='2.5'/><path d='M76 52q2 14 16 16-14 2-16 16-2-14-16-16 14-2 16-16z' fill='#bfe3ff' stroke='#7fb3dd' stroke-width='2.5'/>`) },
  { id: 'cloud', cat: 'cute', label: 'Cloud', svg: svg(`<path d='M26 76a18 18 0 0 1-2-36 24 24 0 0 1 46-6 18 18 0 0 1 8 42z' fill='#fff' stroke='#9ec4e6' stroke-width='3.5'/><circle cx='40' cy='56' r='3' fill='#5a6b80'/><circle cx='60' cy='56' r='3' fill='#5a6b80'/><ellipse cx='34' cy='63' rx='5' ry='3' fill='#f7b6c6'/><ellipse cx='66' cy='63' rx='5' ry='3' fill='#f7b6c6'/>`) },
  { id: 'flower', cat: 'cute', label: 'Flower', svg: svg(`<g fill='#c9b3f2' stroke='#9a7fd1' stroke-width='3'><circle cx='50' cy='24' r='16'/><circle cx='76' cy='44' r='16'/><circle cx='66' cy='74' r='16'/><circle cx='34' cy='74' r='16'/><circle cx='24' cy='44' r='16'/></g><circle cx='50' cy='52' r='13' fill='#ffd45e' stroke='#d9a21b' stroke-width='3'/>`) },
  // ── food ──
  { id: 'empanada', cat: 'food', label: 'Empanada', svg: svg(`<path d='M10 64A40 40 0 0 1 90 64Z' fill='#e9a94f' stroke='#b9732a' stroke-width='3.5' stroke-linejoin='round'/><path d='M17 60A33 33 0 0 1 83 60' fill='none' stroke='#c98436' stroke-width='6' stroke-dasharray='2 6' stroke-linecap='round'/><path d='M34 38q16-10 32 0' fill='none' stroke='#f7d08a' stroke-width='4' stroke-linecap='round'/>`) },
  { id: 'strawberry', cat: 'food', label: 'Strawberry', svg: svg(`<path d='M50 92C24 76 14 54 20 38c5-12 20-14 30-8 10-6 25-4 30 8 6 16-4 38-30 54z' fill='#f2546d' stroke='#b82f47' stroke-width='3'/><path d='M34 22l16 10 16-10-6 14H40z' fill='#6cc07a' stroke='#3f8a4d' stroke-width='3' stroke-linejoin='round'/><g fill='#ffe9a8'><circle cx='38' cy='50' r='2.5'/><circle cx='56' cy='46' r='2.5'/><circle cx='48' cy='64' r='2.5'/><circle cx='64' cy='60' r='2.5'/><circle cx='42' cy='74' r='2.5'/></g>`) },
  { id: 'boba', cat: 'food', label: 'Boba', svg: svg(`<path d='M24 30h52l-7 60H31z' fill='#e8cfb0' stroke='#9c7a55' stroke-width='3' stroke-linejoin='round'/><rect x='20' y='22' width='60' height='10' rx='4' fill='#f7b6c6' stroke='#c47d92' stroke-width='3'/><path d='M56 4l-6 26' stroke='#7fb3dd' stroke-width='6' stroke-linecap='round'/><g fill='#5a3c2a'><circle cx='40' cy='80' r='4'/><circle cx='50' cy='82' r='4'/><circle cx='60' cy='79' r='4'/><circle cx='45' cy='73' r='4'/><circle cx='56' cy='72' r='4'/></g>`) },
  { id: 'cupcake', cat: 'food', label: 'Cupcake', svg: svg(`<path d='M24 54h52l-8 36H32z' fill='#bfe3ff' stroke='#6f9fc9' stroke-width='3' stroke-linejoin='round'/><path d='M20 56c-6-22 18-30 30-22 12-8 36 0 30 22z' fill='#fbd3e0' stroke='#cc7c99' stroke-width='3'/><circle cx='50' cy='22' r='8' fill='#f2546d' stroke='#b82f47' stroke-width='3'/>`) },
  // ── nature ──
  { id: 'sun', cat: 'nature', label: 'Sun', svg: svg(`<g stroke='#e9a53a' stroke-width='5' stroke-linecap='round'><path d='M50 4v12M50 84v12M4 50h12M84 50h12M17 17l9 9M74 74l9 9M17 83l9-9M74 26l9-9'/></g><circle cx='50' cy='50' r='24' fill='#ffd45e' stroke='#e9a53a' stroke-width='3'/><path d='M42 52q8 7 16 0' stroke='#8a5a2a' stroke-width='3' fill='none' stroke-linecap='round'/>`) },
  { id: 'moon', cat: 'nature', label: 'Moon', svg: svg(`<path d='M62 8a40 40 0 1 0 30 58A32 32 0 0 1 62 8z' fill='#fff1b8' stroke='#d9b64a' stroke-width='3'/><circle cx='26' cy='22' r='3' fill='#ffd45e'/><circle cx='84' cy='20' r='2.5' fill='#ffd45e'/>`) },
  { id: 'leaf', cat: 'nature', label: 'Leaf', svg: svg(`<path d='M16 84C16 40 44 14 88 12 86 56 60 84 16 84z' fill='#9fd3a4' stroke='#4f9a5c' stroke-width='3'/><path d='M18 82Q48 52 78 22' stroke='#4f9a5c' stroke-width='3' fill='none'/>`) },
  { id: 'rainbow', cat: 'nature', label: 'Rainbow', svg: svg(`<g fill='none' stroke-width='9' stroke-linecap='round'><path d='M10 72a40 40 0 0 1 80 0' stroke='#f7a3be'/><path d='M21 72a29 29 0 0 1 58 0' stroke='#ffd45e'/><path d='M32 72a18 18 0 0 1 36 0' stroke='#9fd3e8'/></g><ellipse cx='14' cy='76' rx='12' ry='8' fill='#fff' stroke='#c8d6e6' stroke-width='2.5'/><ellipse cx='86' cy='76' rx='12' ry='8' fill='#fff' stroke='#c8d6e6' stroke-width='2.5'/>`) },
  // ── words ──
  { id: 'w-today', cat: 'words', label: 'today', aspect: 2, svg: word('today', '#fff4f6', '#d9667f') },
  { id: 'w-love', cat: 'words', label: 'love', aspect: 2, svg: word('♡ love', '#fde2ea', '#c94f6d') },
  { id: 'w-yay', cat: 'words', label: 'yay!', aspect: 2, svg: word('yay!', '#fff6d6', '#c98a1b') },
  { id: 'w-cozy', cat: 'words', label: 'cozy', aspect: 2, svg: word('cozy', '#eaf6ee', '#4f9a5c') },
  { id: 'w-salamat', cat: 'words', label: 'salamat', aspect: 2, svg: word('salamat', '#eef3ff', '#5b78c2') },
  // ── doodles ──
  { id: 'arrow', cat: 'doodles', label: 'Arrow', svg: svg(`<path d='M12 70C30 30 60 24 84 36' fill='none' stroke='#3d2d3a' stroke-width='4' stroke-linecap='round'/><path d='M70 26l16 10-14 12' fill='none' stroke='#3d2d3a' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/>`) },
  { id: 'swirl', cat: 'doodles', label: 'Swirl', svg: svg(`<path d='M50 50m0-6a6 6 0 1 1-6 6 12 12 0 1 1 12 12 18 18 0 1 1-18-18 24 24 0 1 1 24 24' fill='none' stroke='#b87fc4' stroke-width='4' stroke-linecap='round'/>`) },
  { id: 'smiley', cat: 'doodles', label: 'Smiley', svg: svg(`<circle cx='50' cy='50' r='38' fill='none' stroke='#3d2d3a' stroke-width='4'/><circle cx='38' cy='42' r='4' fill='#3d2d3a'/><circle cx='62' cy='42' r='4' fill='#3d2d3a'/><path d='M34 60q16 14 32 0' fill='none' stroke='#3d2d3a' stroke-width='4' stroke-linecap='round'/>`) },
  { id: 'underline', cat: 'doodles', label: 'Squiggle', aspect: 3, svg: svg(`<path d='M6 20q12-14 24 0t24 0 24 0 24 0 24 0 24 0 24 0 24 0' fill='none' stroke='#f2879e' stroke-width='5' stroke-linecap='round'/>`, '0 0 200 40') },
  // ── washi tape ──
  { id: 't-pink', cat: 'tape', label: 'Pink stripes', aspect: 200 / 52, svg: tape('#f7c6d0', `<path d='M0 16L16 0' stroke='#fff' stroke-width='5' opacity='.7'/>`) },
  { id: 't-mint', cat: 'tape', label: 'Mint dots', aspect: 200 / 52, svg: tape('#cfe9d8', `<circle cx='8' cy='8' r='3' fill='#fff' opacity='.85'/>`) },
  { id: 't-lav', cat: 'tape', label: 'Lavender grid', aspect: 200 / 52, svg: tape('#d9d0f4', `<path d='M0 8h16M8 0v16' stroke='#fff' stroke-width='1.5' opacity='.8'/>`) },
  { id: 't-sun', cat: 'tape', label: 'Butter hearts', aspect: 200 / 52, svg: tape('#ffe6a3', `<path d='M8 12C4 9 3 7 3 5.5 3 4 4 3 5.3 3c1.2 0 2 .7 2.7 1.6C8.7 3.7 9.5 3 10.7 3 12 3 13 4 13 5.5 13 7 12 9 8 12z' fill='#fff' opacity='.85'/>`) },
];

LEGACY_STICKERS.push(...EXTRA_STICKERS, ...STUDIO_STICKERS);

export const STICKERS: StickerDef[] = LEGACY_STICKERS;

export const CATEGORIES: { id: StickerDef['cat']; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'flowers', label: 'Flowers' },
  { id: 'nature', label: 'Nature' },
  { id: 'cozy', label: 'Everyday' },
  { id: 'travel', label: 'Adventure' },
  { id: 'journal', label: 'Details' },
];

const uris = new Map<string, string>();
export function stickerUri(def: StickerDef): string {
  if (def.src) return def.src;
  let u = uris.get(def.id);
  if (!u) {
    u = `data:image/svg+xml,${encodeURIComponent(def.svg ?? '')}`;
    uris.set(def.id, u);
  }
  return u;
}

export const stickerDef = (id: string): StickerDef | undefined =>
  STICKERS.find((s) => s.id === id) ?? LEGACY_STICKERS.find((s) => s.id === id);
