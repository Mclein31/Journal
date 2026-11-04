/* Local-first persistence (IndexedDB). Every edit lands here first; sync.ts pushes to the API later. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Asset, Book, BookDoc, ID, Page, PageElement, Section } from '../state/schema';

interface MLWDB extends DBSchema {
  books: { key: ID; value: Book };
  sections: { key: ID; value: Section; indexes: { byBook: ID } };
  pages: { key: ID; value: Page; indexes: { bySection: ID } };
  elements: { key: ID; value: PageElement; indexes: { byPage: ID } };
  assets: { key: ID; value: { meta: Asset; blob: Blob } };
  meta: { key: string; value: unknown };
}

// v1 used 'mlw_db'; v2 gets its own database so the v1 data stays intact for the importer.
const DB_NAME = 'mlw_v2';
let dbp: Promise<IDBPDatabase<MLWDB>> | null = null;

function db() {
  dbp ??= openDB<MLWDB>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('sections', { keyPath: 'id' }).createIndex('byBook', 'bookId');
      d.createObjectStore('pages', { keyPath: 'id' }).createIndex('bySection', 'sectionId');
      d.createObjectStore('elements', { keyPath: 'id' }).createIndex('byPage', 'pageId');
      d.createObjectStore('assets', { keyPath: 'meta.id' });
      d.createObjectStore('meta');
    },
  });
  return dbp;
}

export async function loadBook(bookId: ID): Promise<BookDoc | null> {
  const d = await db();
  const book = await d.get('books', bookId);
  if (!book) return null;
  const sections = (await d.getAllFromIndex('sections', 'byBook', bookId)).sort((a, b) => a.position - b.position);
  const pages: Page[] = [];
  for (const s of sections) pages.push(...(await d.getAllFromIndex('pages', 'bySection', s.id)));
  const elements: PageElement[] = [];
  for (const p of pages) elements.push(...(await d.getAllFromIndex('elements', 'byPage', p.id)));
  return { book, sections, pages, elements };
}

export interface RemovedRecords { sections?: ID[]; pages?: ID[]; elements?: ID[] }

/** Deletions and their replacement snapshot commit together, so a failed save cannot leave half a book. */
export async function saveDoc(doc: BookDoc, removed: RemovedRecords = {}): Promise<void> {
  const d = await db();
  const tx = d.transaction(['books', 'sections', 'pages', 'elements'], 'readwrite');
  await Promise.all([
    ...(removed.sections ?? []).map((id) => tx.objectStore('sections').delete(id)),
    ...(removed.pages ?? []).map((id) => tx.objectStore('pages').delete(id)),
    ...(removed.elements ?? []).map((id) => tx.objectStore('elements').delete(id)),
    tx.objectStore('books').put(doc.book),
    ...doc.sections.map((s) => tx.objectStore('sections').put(s)),
    ...doc.pages.map((p) => tx.objectStore('pages').put(p)),
    ...doc.elements.map((e) => tx.objectStore('elements').put(e)),
  ]);
  await tx.done;
}

export async function deleteRecords(ids: { sections?: ID[]; pages?: ID[]; elements?: ID[] }): Promise<void> {
  const d = await db();
  const tx = d.transaction(['sections', 'pages', 'elements'], 'readwrite');
  await Promise.all([
    ...(ids.sections ?? []).map((id) => tx.objectStore('sections').delete(id)),
    ...(ids.pages ?? []).map((id) => tx.objectStore('pages').delete(id)),
    ...(ids.elements ?? []).map((id) => tx.objectStore('elements').delete(id)),
  ]);
  await tx.done;
}

export async function putAsset(meta: Asset, blob: Blob): Promise<void> {
  await (await db()).put('assets', { meta, blob });
}

export async function getAssetBlob(id: ID): Promise<Blob | undefined> {
  return (await (await db()).get('assets', id))?.blob;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

export async function listAssets(kind: Asset['kind'], includeArchived = false): Promise<Asset[]> {
  const all = await (await db()).getAll('assets');
  return all.map((a) => a.meta).filter((m) => m.kind === kind && (includeArchived || !m.archived)).sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteAsset(id: ID): Promise<void> {
  await (await db()).delete('assets', id);
}

/** Reversible removal from an upload tray; never breaks pages or undo history. */
export async function setAssetArchived(id: ID, archived: boolean): Promise<void> {
  const d = await db();
  const tx = d.transaction('assets', 'readwrite');
  const asset = await tx.store.get(id);
  if (!asset) throw new Error('Upload not found');
  asset.meta.archived = archived;
  await tx.store.put(asset);
  await tx.done;
}
