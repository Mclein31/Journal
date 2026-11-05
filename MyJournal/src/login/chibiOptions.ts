/* Customization choices for the login chibi. Mirrors api/src/validation.ts chibiSchema. */
import type { ChibiConfig } from '../state/schema';

export type Accessory = ChibiConfig['accessory'];
export interface Swatch { name: string; value: string }

// Indexes are stored in saved looks: only append new choices.
export const HAIR_STYLES = ['Bob', 'Long', 'Twin tails', 'Space buns', 'Ponytail', 'Wavy', 'Short', 'Spiky', 'Side part'] as const;
export const EYE_SHAPES = ['Round', 'Sparkle', 'Gentle'] as const;
export const OUTFITS = ['Sailor', 'Hoodie', 'Overalls', 'Sweater', 'Pinafore', 'Cardigan', 'Tee & jeans', 'Button shirt', 'Jacket'] as const;
export const ACCESSORIES: { id: Accessory; name: string }[] = [
  { id: 'none', name: 'None' }, { id: 'bow', name: 'Bow' }, { id: 'clips', name: 'Clips' },
  { id: 'cat-ears', name: 'Cat ears' }, { id: 'glasses', name: 'Glasses' }, { id: 'beret', name: 'Beret' },
  { id: 'cap', name: 'Cap' }, { id: 'headphones', name: 'Headphones' },
];
export const HAIR_COLORS: Swatch[] = [
  { name: 'Cocoa', value: '#5a3a2e' }, { name: 'Ink', value: '#2c2430' }, { name: 'Chestnut', value: '#8a4b2f' },
  { name: 'Honey', value: '#d9a45b' }, { name: 'Rose', value: '#e59bb0' }, { name: 'Lilac', value: '#a98bd0' },
  { name: 'Mint', value: '#82c3ad' }, { name: 'Cloud', value: '#ece6e1' },
];
export const EYE_COLORS: Swatch[] = [
  { name: 'Brown', value: '#6b4532' }, { name: 'Night', value: '#2f2a3d' }, { name: 'Amber', value: '#c9832f' },
  { name: 'Sea', value: '#3f86a8' }, { name: 'Leaf', value: '#4f9467' }, { name: 'Violet', value: '#8a5bc2' },
  { name: 'Rose', value: '#cf5f86' }, { name: 'Gray', value: '#6f7a86' },
];
export const SKIN_TONES: Swatch[] = [
  { name: 'Porcelain', value: '#fde7dc' }, { name: 'Peach', value: '#f7d2bd' }, { name: 'Sand', value: '#e8b994' },
  { name: 'Honey', value: '#cf9a6c' }, { name: 'Caramel', value: '#a8714a' }, { name: 'Cocoa', value: '#6f4630' },
];

/** Starting points; every piece stays individually customizable. Default is the neutral look. */
export const PRESETS = [
  { id: 'neutral', name: 'Neutral', look: { hairStyle: 6, outfit: 1, accessory: 'headphones', eyeShape: 0, blush: false } },
  { id: 'masculine', name: 'Masculine', look: { hairStyle: 8, outfit: 7, accessory: 'none', eyeShape: 0, blush: false } },
  { id: 'feminine', name: 'Feminine', look: { hairStyle: 1, outfit: 5, accessory: 'clips', eyeShape: 1, blush: true } },
] as const satisfies readonly { id: string; name: string; look: Partial<ChibiConfig> }[];

export const DEFAULT_CHIBI: ChibiConfig = {
  hairColor: HAIR_COLORS[0].value, eyeColor: EYE_COLORS[0].value, skinTone: SKIN_TONES[1].value,
  ...PRESETS[0].look, updatedAt: 0,
};

const HEX = /^#[0-9a-f]{6}$/i;
const ACCESSORY_IDS = new Set<string>(ACCESSORIES.map((a) => a.id));
const index = (value: unknown, count: number, fallback: number): number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < count ? value as number : fallback;

/** Repairs anything malformed (old storage, hand-edited JSON) so every combination renders. */
export function normalizeChibi(input: unknown): ChibiConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof ChibiConfig, unknown>>;
  const color = (value: unknown, fallback: string) => typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback;
  return {
    hairStyle: index(raw.hairStyle, HAIR_STYLES.length, DEFAULT_CHIBI.hairStyle),
    hairColor: color(raw.hairColor, DEFAULT_CHIBI.hairColor),
    eyeColor: color(raw.eyeColor, DEFAULT_CHIBI.eyeColor),
    eyeShape: index(raw.eyeShape, EYE_SHAPES.length, DEFAULT_CHIBI.eyeShape),
    skinTone: color(raw.skinTone, DEFAULT_CHIBI.skinTone),
    outfit: index(raw.outfit, OUTFITS.length, DEFAULT_CHIBI.outfit),
    accessory: typeof raw.accessory === 'string' && ACCESSORY_IDS.has(raw.accessory) ? raw.accessory as Accessory : DEFAULT_CHIBI.accessory,
    blush: typeof raw.blush === 'boolean' ? raw.blush : DEFAULT_CHIBI.blush,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0 ? raw.updatedAt : 0,
  };
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
export function randomChibi(): ChibiConfig {
  return {
    hairStyle: Math.floor(Math.random() * HAIR_STYLES.length), hairColor: pick(HAIR_COLORS).value,
    eyeColor: pick(EYE_COLORS).value, eyeShape: Math.floor(Math.random() * EYE_SHAPES.length),
    skinTone: pick(SKIN_TONES).value, outfit: Math.floor(Math.random() * OUTFITS.length),
    accessory: pick(ACCESSORIES).id, blush: Math.random() > 0.3, updatedAt: Date.now(),
  };
}

/** Lighten (amount > 0) or darken (< 0) a hex color for shading. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
