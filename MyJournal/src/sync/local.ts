/* Local-first persistence (IndexedDB). Every edit lands here first; sync.ts pushes to the API later. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Asset, Book, BookDoc, ID, Page, PageElement, Section } from '../state/schema';
import { mediaBlob } from '../account/api';

interface MLWDB extends DBSchema {
  books: { key: ID; value: Book };
  sections: { key: ID; value: Section; indexes: { byBook: ID } };
  pages: { key: ID; value: Page; indexes: { bySection: ID } };
  elements: { key: ID; value: PageElement; indexes: { byPage: ID } };
  assets: { key: ID; value: { meta: Asset; blob?: Blob } };
  meta: { key: string; value: unknown };
}

// v1 used 'mlw_db'; v2 gets its own database so the v1 data stays intact for the importer.
let owner: string | undefined;
let dbp: Promise<IDBPDatabase<MLWDB>> | null = null;

export function setStorageOwner(id?: string): void {
  if (dbp && id !== owner) throw new Error('Reload before switching accounts');
  owner = id;
}
export const storageKey = (key: string): string => owner ? `${key}:user:${owner}` : key;
export const storageOwner = (): string | undefined => owner;

function openStorage(name: string) {
  return openDB<MLWDB>(name, 1, {
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('sections', { keyPath: 'id' }).createIndex('byBook', 'bookId');
      d.createObjectStore('pages', { keyPath: 'id' }).createIndex('bySection', 'sectionId');
      d.createObjectStore('elements', { keyPath: 'id' }).createIndex('byPage', 'pageId');
      d.createObjectStore('assets', { keyPath: 'meta.id' });
      d.createObjectStore('meta');
    },
  });
}
function db() { return dbp ??= openStorage(owner ? `mlw_v2_user_${owner}` : 'mlw_v2'); }

export async function loadBook(bookId: ID): Promise<BookDoc | null> {
  const d = await db();
  return loadFrom(d, bookId);
}
async function loadFrom(d: IDBPDatabase<MLWDB>, bookId: ID): Promise<BookDoc | null> {
  const tx = d.transaction(['books', 'sections', 'pages', 'elements'], 'readonly');
  const book = await tx.objectStore('books').get(bookId);
  if (!book) return null;
  const sections = (await tx.objectStore('sections').index('byBook').getAll(bookId)).sort((a, b) => a.position - b.position);
  const pages: Page[] = [];
  for (const s of sections) pages.push(...(await tx.objectStore('pages').index('bySection').getAll(s.id)));
  const elements: PageElement[] = [];
  for (const p of pages) elements.push(...(await tx.objectStore('elements').index('byPage').getAll(p.id)));
  await tx.done;
  return { book, sections, pages, elements };
}

export interface RemovedRecords { sections?: ID[]; pages?: ID[]; elements?: ID[] }

/** Deletions and their replacement snapshot commit together, so a failed save cannot leave half a book. */
export class SaveConflictError extends Error {
  constructor() {
    super('This journal changed in another window. Save a copy of your changes and reload the latest version.');
    this.name = 'SaveConflictError';
  }
}

export async function saveDoc(doc: BookDoc, removed: RemovedRecords = {}, expectedRevision = doc.book.revision ?? 0): Promise<number> {
  const d = await db();
  const tx = d.transaction(['books', 'sections', 'pages', 'elements'], 'readwrite');
  const current = await tx.objectStore('books').get(doc.book.id);
  if ((current?.revision ?? 0) !== expectedRevision) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new SaveConflictError();
  }
  const revision = expectedRevision + 1;
  await Promise.all([
    ...(removed.sections ?? []).map((id) => tx.objectStore('sections').delete(id)),
    ...(removed.pages ?? []).map((id) => tx.objectStore('pages').delete(id)),
    ...(removed.elements ?? []).map((id) => tx.objectStore('elements').delete(id)),
    tx.objectStore('books').put({ ...doc.book, revision }),
    ...doc.sections.map((s) => tx.objectStore('sections').put(s)),
    ...doc.pages.map((p) => tx.objectStore('pages').put(p)),
    ...doc.elements.map((e) => tx.objectStore('elements').put(e)),
  ]);
  await tx.done;
  return revision;
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
  window.dispatchEvent(new CustomEvent('mlw:assets-changed'));
}

export async function getAssetBlob(id: ID): Promise<Blob | undefined> {
  const asset = await (await db()).get('assets', id);
  if (asset?.blob) return asset.blob;
  if (!asset || !owner) return undefined;
  const blob = await mediaBlob(id);
  await (await db()).put('assets', { meta: asset.meta, blob });
  return blob;
}

/** Metadata is cheap to hydrate; image bytes download only when a page/tray needs them. */
export async function putAssetMetadata(meta: Asset): Promise<void> {
  const d = await db();
  const tx = d.transaction('assets', 'readwrite');
  const current = await tx.store.get(meta.id);
  await tx.store.put({ meta, ...(current?.blob ? { blob: current.blob } : {}) });
  await tx.done;
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
  window.dispatchEvent(new CustomEvent('mlw:assets-changed'));
}

export async function allAssets(): Promise<Asset[]> {
  return (await (await db()).getAll('assets')).map((a) => a.meta);
}

/** A remote snapshot replaces all records atomically and retains a separate LOCAL CAS revision. */
export async function replaceSnapshot(doc: BookDoc, bookmark: unknown, cloud: unknown, expectedRevision?: number): Promise<void> {
  const d = await db();
  const tx = d.transaction(['books', 'sections', 'pages', 'elements', 'meta'], 'readwrite');
  const current = await tx.objectStore('books').get(doc.book.id);
  if (expectedRevision !== undefined && (current?.revision ?? 0) !== expectedRevision) {
    tx.abort(); await tx.done.catch(() => {}); throw new SaveConflictError();
  }
  const oldSections = await tx.objectStore('sections').index('byBook').getAll(doc.book.id);
  for (const section of oldSections) {
    for (const page of await tx.objectStore('pages').index('bySection').getAll(section.id)) {
      for (const el of await tx.objectStore('elements').index('byPage').getAll(page.id)) await tx.objectStore('elements').delete(el.id);
      await tx.objectStore('pages').delete(page.id);
    }
    await tx.objectStore('sections').delete(section.id);
  }
  await tx.objectStore('books').put({ ...doc.book, revision: (current?.revision ?? 0) + 1 });
  for (const row of doc.sections) await tx.objectStore('sections').put(row);
  for (const row of doc.pages) await tx.objectStore('pages').put(row);
  for (const row of doc.elements) await tx.objectStore('elements').put(row);
  await tx.objectStore('meta').put(bookmark, `bookmark:${doc.book.id}`);
  await tx.objectStore('meta').put(cloud, `cloud:${doc.book.id}`);
  await tx.objectStore('meta').put(doc.book.id, 'activeBookId');
  await tx.done;
}

/** Guest data is read explicitly for import; it is never silently attached to a login. */
export async function readGuestJournal(): Promise<{ doc: BookDoc; bookmark: unknown; assets: { meta: Asset; blob: Blob }[]; recovery: unknown } | null> {
  const guest = await openStorage('mlw_v2');
  try {
    const active = await guest.get('meta', 'activeBookId') as string | undefined;
    const doc = active ? await loadFrom(guest, active) : null;
    if (!doc) return null;
    let recovery: unknown = await guest.get('meta', 'drafts');
    try { const raw = localStorage.getItem('mlw:text-drafts'); if (raw) recovery = JSON.parse(raw); } catch { /* Keep the IndexedDB recovery. */ }
    if (recovery && typeof recovery === 'object') {
      const record = recovery as Record<string, unknown>;
      const bases = record.__draftBases && typeof record.__draftBases === 'object' ? record.__draftBases as Record<string, unknown> : {};
      for (const [key, text] of Object.entries(record)) {
        if (typeof text !== 'string' || key.startsWith('__')) continue;
        const caption = key.startsWith('caption:');
        const el = doc.elements.find((e) => e.id === (caption ? key.slice(8) : key));
        const current = caption ? el?.data.photo?.caption ?? (el?.data.photo ? '' : undefined) : el?.data.text?.content;
        if (!el || current === undefined || (key in bases && current !== bases[key] && current !== text)) continue;
        if (caption) el.data.photo!.caption = text; else el.data.text!.content = text;
      }
    }
    const assets = (await guest.getAll('assets')).flatMap((asset) => asset.blob ? [{ meta: asset.meta, blob: asset.blob }] : []);
    return { doc, bookmark: (await guest.get('meta', `bookmark:${active}`)) ?? null, assets, recovery };
  } finally { guest.close(); }
}
