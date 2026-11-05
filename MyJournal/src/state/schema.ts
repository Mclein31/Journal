/* Data model for the v2 3D journal. Mirrors the Neon schema in .brain/ARCHITECTURE.md.
   All positions are in PAGE UNITS: 0..1 of the page width/height, so pages scale to any screen. */

export type ID = string;

export type PaperType = 'lined' | 'dotted' | 'grid' | 'plain';
export type PaperTint = 'white' | 'cream' | 'kraft' | 'pink' | 'mint' | 'lavender';
export type CoverTexture = 'matte' | 'leather' | 'linen' | 'kraft' | 'velvet' | 'corduroy' | 'holographic';

export interface Background {
  kind: 'preset' | 'upload';
  /** preset id, or asset id when kind = 'upload' */
  ref: string;
  fit: 'cover' | 'tile';
}

export interface Book {
  id: ID;
  title: string;
  coverColor: string;
  coverTexture: CoverTexture;
  paperType: PaperType;
  paperTint: PaperTint;
  background: Background;
  updatedAt: number;
  /** Local save revision; absent on books created before conflict protection. */
  revision?: number;
}

export interface Section {
  id: ID;
  bookId: ID;
  name: string;
  color: string;
  icon: string;
  position: number;
}

export interface Page {
  id: ID;
  sectionId: ID;
  position: number;
  paperOverride?: PaperType;
  updatedAt: number;
}

export type ElementType = 'text' | 'photo' | 'sticker' | 'tape';

export interface Tear {
  /** polygon in photo units (0..1) */
  points: [number, number][];
  kept: 'a' | 'b';
}

export interface ElementData {
  text?: { content: string; font?: string; size?: number; color?: string; highlight?: string; underline?: boolean; strikethrough?: boolean };
  /** aspect = image width / height, so photos keep their shape on any page size */
  /** clip = kept shape after tearing, polygon in photo units (0..1); the original image is never modified */
  photo?: { assetId: ID; aspect: number; frame: string; caption?: string; frameColor?: string; tears?: Tear[]; clip?: [number, number][] };
  /** stickerId: built-in id, or "asset:<assetId>" for uploads; aspect = width / height */
  sticker?: { stickerId: string; aspect?: number; effect?: 'none' | 'glossy' | 'glitter' | 'outline' };
}

export interface PageElement {
  id: ID;
  pageId: ID;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  /** height in page units; derived from aspect ratio when omitted */
  h?: number;
  rot: number;
  z: number;
  data: ElementData;
  updatedAt: number;
}

export interface Asset {
  id: ID;
  /** Removed from the upload tray; kept so placed copies and restore keep working. */
  archived?: boolean;
  kind: 'photo' | 'sticker' | 'background';
  mime: string;
  w: number;
  h: number;
  bytes: number;
  createdAt: number;
}

export interface Bookmark {
  bookId: ID;
  pageId: ID;
  updatedAt: number;
}

export interface ChibiConfig {
  hairStyle: number;
  hairColor: string;
  eyeColor: string;
  eyeShape: number;
  skinTone: string;
  outfit: number;
  accessory: 'none' | 'bow' | 'clips' | 'cat-ears' | 'glasses' | 'beret' | 'cap' | 'headphones' | 'bandana' | 'beanie' | 'backwards-cap' | 'sunglasses';
  facialHair: 'none' | 'stubble' | 'mustache';
  blush: boolean;
  /** ms epoch of the last customization; newer wins between device and account. */
  updatedAt: number;
}

/** Everything needed to render one book. */
export interface BookDoc {
  book: Book;
  sections: Section[];
  pages: Page[];
  elements: PageElement[];
}

export const uid = (): ID =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
