/* The book a new user gets on first open. */
import { uid, type BookDoc, type Page, type PageElement, type Section } from './schema';

export const DEFAULT_SECTIONS = [
  { name: 'Journal', color: '#e8a87c', icon: '✒️' },
  { name: 'Schedule', color: '#8ec5e8', icon: '📅' },
  { name: 'Memories', color: '#f6c26b', icon: '📷' },
  { name: 'Notes', color: '#9fd3b4', icon: '🌿' },
] as const;

const PAGES_PER_SECTION = 2;

export function createSeedBook(): BookDoc {
  const now = Date.now();
  const bookId = uid();
  const sections: Section[] = DEFAULT_SECTIONS.map((s, i) => ({ id: uid(), bookId, position: i, ...s }));
  const pages: Page[] = sections.flatMap((s) =>
    Array.from({ length: PAGES_PER_SECTION }, (_, i) => ({ id: uid(), sectionId: s.id, position: i, updatedAt: now })),
  );
  const welcome: PageElement = {
    id: uid(),
    pageId: pages[0].id,
    type: 'text',
    x: 0.1,
    y: 0.12,
    w: 0.8,
    rot: 0,
    z: 1,
    data: { text: { content: 'Welcome to Dear Days.\nPull a tab to visit a section, or flip the page.' } },
    updatedAt: now,
  };
  return {
    book: {
      id: bookId,
      title: 'Dear Days',
      coverColor: '#3e5568',
      coverTexture: 'linen',
      paperType: 'lined',
      paperTint: 'cream',
      background: { kind: 'preset', ref: 'wood', fit: 'cover' },
      updatedAt: now,
    },
    sections,
    pages,
    elements: [welcome],
  };
}
