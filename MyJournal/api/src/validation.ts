import { z } from 'zod';

export const idSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const color = z.string().max(100);
const number = z.number().finite();
const timestamp = number.nonnegative();
export const assetSchema = z.object({
  id: idSchema, kind: z.enum(['photo', 'sticker', 'background']),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  w: number.positive().max(30_000), h: number.positive().max(30_000),
  bytes: z.number().int().positive().max(10 * 1024 * 1024),
  createdAt: timestamp, archived: z.boolean().optional(),
});
const point = z.tuple([number.min(-1).max(2), number.min(-1).max(2)]);
export const documentSchema = z.object({
  book: z.object({
    id: idSchema, title: z.string().max(500), coverColor: color,
    coverTexture: z.enum(['matte', 'leather', 'linen', 'kraft', 'velvet', 'corduroy', 'holographic']),
    paperType: z.enum(['lined', 'dotted', 'grid', 'plain']),
    paperTint: z.enum(['white', 'cream', 'kraft', 'pink', 'mint', 'lavender']),
    background: z.object({ kind: z.enum(['preset', 'upload']), ref: z.string().min(1).max(120), fit: z.enum(['cover', 'tile']) }),
    updatedAt: timestamp,
  }),
  sections: z.array(z.object({ id: idSchema, bookId: idSchema, name: z.string().max(200), color, icon: z.string().max(100), position: number })).min(1).max(100),
  pages: z.array(z.object({ id: idSchema, sectionId: idSchema, position: number, paperOverride: z.enum(['lined', 'dotted', 'grid', 'plain']).optional(), updatedAt: timestamp })).min(1).max(2000),
  elements: z.array(z.object({
    id: idSchema, pageId: idSchema, type: z.enum(['text', 'photo', 'sticker', 'tape']),
    x: number.min(-100).max(100), y: number.min(-100).max(100), w: number.positive().max(100), h: number.positive().max(100).optional(),
    rot: number.min(-1e6).max(1e6), z: number.min(-1e9).max(1e9), updatedAt: timestamp,
    data: z.object({
      text: z.object({ content: z.string().max(100_000), font: z.string().max(200).optional(), size: number.positive().max(100).optional(), color: color.optional(), highlight: color.optional(), underline: z.boolean().optional(), strikethrough: z.boolean().optional() }).optional(),
      photo: z.object({ assetId: idSchema, aspect: number.positive().max(30_000), frame: z.string().max(100), caption: z.string().max(10_000).optional(), frameColor: color.optional(), tears: z.array(z.object({ points: z.array(point).max(5000), kept: z.enum(['a', 'b']) })).max(100).optional(), clip: z.array(point).max(5000).optional() }).optional(),
      sticker: z.object({ stickerId: z.string().min(1).max(150), aspect: number.positive().max(30_000).optional(), effect: z.enum(['none', 'glossy', 'glitter', 'outline']).optional() }).optional(),
    }),
  })).max(10_000),
}).superRefine((doc, ctx) => {
  const ids = new Set<string>();
  for (const item of [doc.book, ...doc.sections, ...doc.pages, ...doc.elements]) {
    if (ids.has(item.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate document ID' });
    ids.add(item.id);
  }
  const sections = new Set(doc.sections.map((s) => s.id));
  const pages = new Set(doc.pages.map((p) => p.id));
  if (doc.sections.some((s) => s.bookId !== doc.book.id) || doc.pages.some((p) => !sections.has(p.sectionId)) || doc.elements.some((e) => !pages.has(e.pageId))) ctx.addIssue({ code: 'custom', message: 'Invalid document relationship' });
});
export const bookmarkSchema = z.object({ bookId: idSchema, pageId: idSchema, updatedAt: timestamp }).nullable();
export const syncSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  mutationId: z.string().uuid(),
  doc: documentSchema,
  bookmark: bookmarkSchema,
}).superRefine(({ doc, bookmark }, ctx) => {
  if (bookmark && (bookmark.bookId !== doc.book.id || !doc.pages.some((p) => p.id === bookmark.pageId))) ctx.addIssue({ code: 'custom', message: 'Invalid bookmark' });
});

export function referencedAssets(doc: z.infer<typeof documentSchema>): string[] {
  const ids = new Set<string>();
  if (doc.book.background.kind === 'upload') ids.add(doc.book.background.ref);
  for (const el of doc.elements) {
    if (el.data.photo) ids.add(el.data.photo.assetId);
    if (el.data.sticker?.stickerId.startsWith('asset:')) ids.add(el.data.sticker.stickerId.slice(6));
  }
  return [...ids];
}

export function matchesImage(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/png') return [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n);
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/webp') return new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  return mime === 'image/gif' && /GIF8[79]a/.test(new TextDecoder().decode(bytes.slice(0,6)));
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Mirrors src/login/chibiOptions.ts. Indexes are bounded so any saved combination renders. */
export const chibiSchema = z.object({
  hairStyle: z.number().int().min(0).max(5),
  hairColor: hex,
  eyeColor: hex,
  eyeShape: z.number().int().min(0).max(2),
  skinTone: hex,
  outfit: z.number().int().min(0).max(5),
  accessory: z.enum(['none', 'bow', 'clips', 'cat-ears', 'glasses', 'beret']),
  blush: z.boolean(),
  updatedAt: timestamp,
}).strict();
