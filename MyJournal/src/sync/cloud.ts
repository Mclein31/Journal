import type { Asset, BookDoc, Bookmark } from '../state/schema';
import { allAssets, getAssetBlob, getMeta, loadBook, putAsset, putAssetMetadata, readGuestJournal, replaceSnapshot, setMeta, storageOwner } from './local';
import { api, ApiError, post } from '../account/api';

export interface CloudState { version: number; hash: string; mutation?: { id: string; hash: string } }
interface Remote { doc: BookDoc; bookmark: Bookmark | null; version: number; mutation_id?: string }
interface RemoteAsset { meta: Asset; state: 'pending' | 'ready' }
export interface CloudBook { id: string; title: string; version: number }
export type CloudStatus = 'saved' | 'syncing' | 'offline' | 'conflict' | 'remote' | 'error';
export const status = (state: CloudStatus, message: string): void => { window.dispatchEvent(new CustomEvent('dd:cloud-status', { detail: { state, message } })); };
const cloudKey = (id: string) => `cloud:${id}`;

/** Stable snapshot identity excludes the local IndexedDB CAS counter. */
export function snapshot(doc: BookDoc, bookmark: Bookmark | null) {
  const copy = structuredClone(doc);
  delete copy.book.revision;
  copy.sections.sort((a,b) => a.id.localeCompare(b.id));
  copy.pages.sort((a,b) => a.id.localeCompare(b.id));
  copy.elements.sort((a,b) => a.id.localeCompare(b.id));
  return { doc: copy, bookmark };
}
export function stableJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
export async function snapshotHash(doc: BookDoc, bookmark: Bookmark | null): Promise<string> {
  const value = new TextEncoder().encode(stableJSON(snapshot(doc, bookmark)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export async function cloudBooks(): Promise<CloudBook[]> { return (await api<{ books: CloudBook[] }>('/books')).books; }

async function downloadAssets(): Promise<void> {
  const remote = (await api<{ assets: RemoteAsset[] }>('/assets')).assets;
  const local = new Map((await allAssets()).map((meta) => [meta.id, meta]));
  for (const { meta, state } of remote) {
    if (state !== 'ready') continue;
    const old = local.get(meta.id);
    const ack = await getMeta<string>(`cloud:asset:${meta.id}`);
    if (!old || (ack && stableJSON(old) === ack)) {
      await putAssetMetadata(meta); await setMeta(`cloud:asset:${meta.id}`, stableJSON(meta));
    }
    // Dirty local archive changes are pushed, not silently overwritten by polling.
  }
}

/** Bootstrap is the only automatic remote replacement; the editor isn't mounted yet. */
export async function prepareCloud(): Promise<void> {
  if (!storageOwner()) return;
  const active = await getMeta<string>('activeBookId');
  try {
    const list = await cloudBooks();
    await downloadAssets();
    const selected = list.find((book) => book.id === active) ?? (!active ? list[0] : undefined);
    if (selected) {
      const remote = await api<Remote>(`/books/${selected.id}`);
      const local = await loadBook(selected.id);
      const state = await getMeta<CloudState>(cloudKey(selected.id));
      const bookmark = await getMeta<Bookmark | null>(`bookmark:${selected.id}`) ?? null;
      const hash = local ? await snapshotHash(local, bookmark) : '';
      // Only refresh a clean cache; dirty/offline journals remain intact for CAS sync.
      if (!local || (state && hash === state.hash)) {
        const remoteHash = await snapshotHash(remote.doc, remote.bookmark);
        await replaceSnapshot(remote.doc, remote.bookmark, { version: remote.version, hash: remoteHash }, local?.book.revision);
      }
    }
  } catch (error) {
    if (error instanceof ApiError && [401,403].includes(error.status)) throw error;
    if (!active || !await loadBook(active)) throw error;
    status('offline', 'Offline · changes stay on this device until you reconnect');
  }
}

let running: Promise<void> | null = null;
let timer: number | undefined;
let paused = false;
let stopped = false;
export function stopSync(): void { stopped = true; window.clearTimeout(timer); }

async function uploadAssets(): Promise<void> {
  const remote = new Map((await api<{ assets: RemoteAsset[] }>('/assets')).assets.map((row) => [row.meta.id, row]));
  const localIds = new Set((await allAssets()).map((meta) => meta.id));
  for (const { meta, state } of remote.values()) {
    if (state === 'ready' && !localIds.has(meta.id)) {
      await putAssetMetadata(meta); await setMeta(`cloud:asset:${meta.id}`, stableJSON(meta));
    }
  }
  for (const meta of await allAssets()) {
    const current = remote.get(meta.id);
    const localJSON = stableJSON(meta);
    const acknowledged = await getMeta<string>(`cloud:asset:${meta.id}`);
    if (current?.state === 'ready' && stableJSON(current.meta) === localJSON) { await setMeta(`cloud:asset:${meta.id}`, localJSON); continue; }
    if (current?.state === 'ready' && acknowledged === localJSON) {
      await putAssetMetadata(current.meta);
      await setMeta(`cloud:asset:${meta.id}`, stableJSON(current.meta));
      continue;
    }
    const reserved = await post<{ state: string }>('/assets', meta);
    if (reserved.state !== 'ready') {
      const blob = await getAssetBlob(meta.id);
      if (!blob) throw new Error('An image is missing from local storage');
      await api(`/assets/${meta.id}/content`, { method: 'PUT', body: blob, headers: { 'Content-Type': meta.mime } });
    }
    await setMeta(`cloud:asset:${meta.id}`, localJSON);
  }
}

export function syncNow(): Promise<void> {
  if (running) return running;
  if (paused || stopped || !storageOwner()) return Promise.resolve();
  running = (async () => {
    const id = await getMeta<string>('activeBookId');
    const doc = id ? await loadBook(id) : null;
    if (!doc) return;
    status('syncing', 'Saving to your account…');
    await uploadAssets();
    const bookmark = await getMeta<Bookmark | null>(`bookmark:${id}`) ?? null;
    const hash = await snapshotHash(doc, bookmark);
    let state = await getMeta<CloudState>(cloudKey(doc.book.id)) ?? { version: 0, hash: '' };
    if (state.mutation && state.mutation.hash !== hash) {
      const remote = await api<Remote>(`/books/${doc.book.id}`).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      });
      if (remote?.mutation_id === state.mutation.id) {
        state = { version: remote.version, hash: state.mutation.hash };
        await setMeta(cloudKey(doc.book.id), state);
      }
    }
    if (hash === state.hash) {
      const remote = await api<Remote>(`/books/${doc.book.id}`);
      if (remote.version !== state.version) { paused = true; status('remote', 'A newer cloud copy is ready. Reload when you finish editing.'); return; }
      status('saved', 'Saved to your account'); return;
    }
    // Persist the operation ID BEFORE sending, so a lost response is safe to retry.
    const mutation = state.mutation?.hash === hash ? state.mutation : { id: crypto.randomUUID(), hash };
    await setMeta(cloudKey(doc.book.id), { ...state, mutation });
    const result = await post<{ version: number }>('/sync', { baseVersion: state.version, mutationId: mutation.id, ...snapshot(doc, bookmark) });
    await setMeta(cloudKey(doc.book.id), { version: result.version, hash });
    status('saved', 'Saved to your account');
    // Changes during the upload remain dirty and are sent in the next ordered pass.
  })().catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 409) { paused = true; status('conflict', 'Another device saved a different copy. Your changes are safe on this device.'); }
    else if (error instanceof ApiError && error.status === 401) { paused = true; status('error', 'Your session changed or expired. Sign in again to sync.'); }
    else if (error instanceof ApiError) status('error', error.message);
    else status('offline', 'Offline · changes are saved on this device and will retry');
  }).finally(() => { running = null; });
  return running;
}

export function startSync(): void {
  if (!storageOwner()) return;
  const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void syncNow(), 1200); };
  addEventListener('mlw:saved', schedule);
  addEventListener('mlw:assets-changed', schedule);
  addEventListener('mlw:bookmark-changed', schedule);
  addEventListener('online', schedule);
  addEventListener('focus', schedule);
  window.setInterval(() => { if (!document.hidden) void syncNow(); }, 20_000);
  schedule();
}

export async function importDeviceJournal(): Promise<boolean> {
  const guest = await readGuestJournal();
  if (!guest) return false;
  const existing = await cloudBooks();
  if (existing.some((book) => book.id === guest.doc.book.id)) throw new Error('This device journal is already in your account. Choose it from Your journals.');
  for (const asset of guest.assets) await putAsset(asset.meta, asset.blob);
  const { copy, pages } = forkJournal(guest.doc);
  const mark = guest.bookmark as Bookmark | null;
  const bookmark = mark ? { ...mark, bookId: copy.book.id, pageId: pages.get(mark.pageId)! } : null;
  await replaceSnapshot(copy, bookmark, { version: 0, hash: '' });
  if (guest.recovery) await setMeta('importedGuestRecovery', guest.recovery);
  return true;
}

/** Switching journals is permitted only after the active journal is durably acknowledged. */
export async function requireSyncedJournal(): Promise<void> {
  await syncNow();
  const id = await getMeta<string>('activeBookId');
  if (!id) return;
  const doc = await loadBook(id);
  if (!doc) return;
  const mark = await getMeta<Bookmark | null>(`bookmark:${id}`) ?? null;
  const state = await getMeta<CloudState>(cloudKey(id));
  if (!state || state.hash !== await snapshotHash(doc, mark)) throw new Error('This journal still has device-only changes. Finish syncing or keep a separate copy before switching journals.');
}

/** Preserve the conflicted journal as a new cloud book; no other device's copy is overwritten. */
export async function keepAsSeparateJournal(doc: BookDoc): Promise<void> {
  const { copy, pages } = forkJournal(doc);
  const oldId = copy.book.id;
  const sourceId = doc.book.id;
  copy.book.title = `${copy.book.title} · device copy`;
  const mark = await getMeta<Bookmark | null>(`bookmark:${sourceId}`);
  const bookmark = mark ? { ...mark, bookId: oldId, pageId: pages.get(mark.pageId)! } : null;
  await replaceSnapshot(copy, bookmark, { version: 0, hash: '' });
}

export function forkJournal(doc: BookDoc): { copy: BookDoc; pages: Map<string, string> } {
  const copy = structuredClone(doc);
  copy.book.id = crypto.randomUUID();
  const sections = new Map(copy.sections.map((s) => [s.id, crypto.randomUUID()]));
  const pages = new Map(copy.pages.map((p) => [p.id, crypto.randomUUID()]));
  copy.sections.forEach((s) => { s.id = sections.get(s.id)!; s.bookId = copy.book.id; });
  copy.pages.forEach((p) => { p.id = pages.get(p.id)!; p.sectionId = sections.get(p.sectionId)!; });
  copy.elements.forEach((e) => { e.id = crypto.randomUUID(); e.pageId = pages.get(e.pageId)!; });
  return { copy, pages };
}
