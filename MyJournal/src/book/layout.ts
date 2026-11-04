/* Page order + spread math.
   Spread mode: spread k shows LEFT = pages[2k], RIGHT = pages[2k+1].
   Single mode (phones): "spread" k is just pages[k]. */
import type { BookDoc, Page, Section } from '../state/schema';

export type Mode = 'spread' | 'single';

export interface Layout {
  pages: Page[];
  sections: Section[];
  /** index of each section's first page in `pages` */
  firstPage: Map<string, number>;
  sectionOf: (pageIndex: number) => Section | undefined;
  spreadCount: (mode: Mode) => number;
  /** page indices visible on spread k */
  spreadPages: (k: number, mode: Mode) => { left?: number; right?: number };
  spreadOfPage: (pageIndex: number, mode: Mode) => number;
}

export function buildLayout(doc: BookDoc): Layout {
  const sections = [...doc.sections].sort((a, b) => a.position - b.position);
  const pages: Page[] = [];
  const firstPage = new Map<string, number>();
  const owner: Section[] = [];
  for (const s of sections) {
    const own = doc.pages.filter((p) => p.sectionId === s.id).sort((a, b) => a.position - b.position);
    firstPage.set(s.id, pages.length);
    for (const p of own) {
      pages.push(p);
      owner.push(s);
    }
  }
  return {
    pages,
    sections,
    firstPage,
    sectionOf: (i) => owner[i],
    spreadCount: (mode) => (mode === 'single' ? pages.length : Math.ceil(pages.length / 2)),
    spreadPages: (k, mode) => {
      if (mode === 'single') return { right: k < pages.length ? k : undefined };
      const l = 2 * k, r = 2 * k + 1;
      return { left: l < pages.length ? l : undefined, right: r < pages.length ? r : undefined };
    },
    spreadOfPage: (i, mode) => (mode === 'single' ? i : Math.floor(i / 2)),
  };
}

/** A tab hangs off its section's first page. Once that page has been turned past (it's on
    the left or behind), the tab shows on the left edge; otherwise it's ahead, on the right. */
export function tabSide(layout: Layout, sectionId: string, spread: number, mode: Mode): 'left' | 'right' {
  if (mode === 'single') return 'right';
  const first = layout.firstPage.get(sectionId) ?? 0;
  return first <= 2 * spread ? 'left' : 'right';
}
