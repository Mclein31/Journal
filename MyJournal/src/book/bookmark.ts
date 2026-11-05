/* Bookmark + unsaved-text drafts (Phase 8). Stored in IndexedDB meta (synced in Phase 10). */
import type { Bookmark, BookDoc } from '../state/schema';
import { getMeta, setMeta, storageKey } from '../sync/local';
import { getDoc, subscribe } from '../state/store';

const key = (bookId: string) => `bookmark:${bookId}`;
export const getBookmark = (bookId: string) => getMeta<Bookmark>(key(bookId));
export const setBookmark = async (bookId: string, pageId: string) => { await setMeta(key(bookId), { bookId, pageId, updatedAt: Date.now() } satisfies Bookmark); window.dispatchEvent(new CustomEvent('mlw:bookmark-changed')); };
export const clearBookmark = async (bookId: string) => { await setMeta(key(bookId), null); window.dispatchEvent(new CustomEvent('mlw:bookmark-changed')); };

/* Active text is outside the committed document until blur. Keep an immediate recovery
   copy as well as IndexedDB; mobile browsers need not finish async work on pagehide. */
const DRAFTS = 'drafts';
const RECOVERY = 'mlw:text-drafts';
const CAPTION = 'caption:';
let drafts: Record<string, string> = {};
let bases: Record<string, string> = {};
let conflicts: Record<string, string> = {};
let loading: Promise<void> | null = null;
let loaded = false;
let writes: Promise<void> = Promise.resolve();
let persisted: BookDoc | null = null;

const strings = (value: unknown): Record<string, string> => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string')) : {};

function decodeRecovery(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return { drafts: strings(record), bases: strings(record.__draftBases), conflicts: strings(record.__draftConflicts) };
}

function readRecovery() {
  try {
    const raw = localStorage.getItem(storageKey(RECOVERY));
    if (raw === null) return null;
    return decodeRecovery(JSON.parse(raw));
  } catch { return null; }
}

function snapshotDrafts() {
  return { ...drafts,
    ...(Object.keys(bases).length ? { __draftBases: { ...bases } } : {}),
    ...(Object.keys(conflicts).length ? { __draftConflicts: { ...conflicts } } : {}),
  };
}

function writeRecovery() {
  try { localStorage.setItem(storageKey(RECOVERY), JSON.stringify(snapshotDrafts())); } catch { /* IndexedDB still saves when localStorage is unavailable/full. */ }
}

function loadDrafts(): Promise<void> {
  if (!loading) {
    const recovery = readRecovery();
    loading = getMeta<unknown>(DRAFTS).then((saved) => {
      const source = recovery ?? decodeRecovery(saved);
      drafts = { ...source?.drafts, ...drafts };
      bases = { ...source?.bases, ...bases };
      conflicts = { ...source?.conflicts, ...conflicts };
      loaded = true;
      writeRecovery();
    });
  }
  return loading;
}

function persistDrafts(): Promise<void> {
  writeRecovery();
  const snapshot = snapshotDrafts();
  writes = writes.catch(() => {}).then(() => setMeta(DRAFTS, snapshot));
  return writes;
}

export async function saveDraft(elId: string, text: string): Promise<void> {
  const loaded = loadDrafts();
  if (!(elId in bases)) {
    const caption = elId.startsWith(CAPTION);
    const el = getDoc().elements.find((e) => e.id === (caption ? elId.slice(CAPTION.length) : elId));
    const value = caption ? el?.data.photo?.caption ?? '' : el?.data.text?.content;
    if (value !== undefined) bases[elId] = value;
  }
  drafts[elId] = text;
  writeRecovery(); // synchronous: the last keystroke survives an immediate close
  await loaded;
  await persistDrafts();
}

export const saveCaptionDraft = (elId: string, text: string): Promise<void> => saveDraft(`${CAPTION}${elId}`, text);

/** Only acknowledge text present in an already committed snapshot. */
export async function clearDraft(elId: string): Promise<void> {
  await loadDrafts();
  if (!(elId in drafts) || !persisted) return;
  const caption = elId.startsWith(CAPTION);
  const id = caption ? elId.slice(CAPTION.length) : elId;
  const saved = persisted.elements.find((el) => el.id === id);
  const removed = !saved && !getDoc().elements.some((el) => el.id === id);
  const value = caption ? saved?.data.photo?.caption ?? '' : saved?.data.text?.content;
  if (!removed && value !== drafts[elId]) {
    // A save from this window can acknowledge an earlier part of the active edit.
    if (value !== undefined && bases[elId] !== value) { bases[elId] = value; await persistDrafts(); }
    return;
  }
  delete drafts[elId];
  delete bases[elId];
  await persistDrafts();
}

/** Boot restores drafts without consuming them; a successful book save acknowledges them. */
export async function applyDrafts(doc: BookDoc): Promise<boolean> {
  await loadDrafts();
  let restored = false;
  let acknowledged = false;
  for (const [id, text] of Object.entries(drafts)) {
    const caption = id.startsWith(CAPTION);
    const el = doc.elements.find((e) => e.id === (caption ? id.slice(CAPTION.length) : id));
    const value = caption ? el?.data.photo?.caption ?? '' : el?.data.text?.content;
    if (value === text) {
      delete drafts[id];
      delete bases[id];
      acknowledged = true;
      continue;
    }
    if (id in bases && value !== bases[id] && value !== text) {
      // Keep the older words for export, but never replay them over another window's save.
      conflicts[id] = text;
      delete drafts[id];
      delete bases[id];
      continue;
    }
    if (el && (caption ? el.data.photo : el.data.text) && value !== text) {
      if (caption) el.data.photo!.caption = text;
      else el.data.text!.content = text;
      el.updatedAt = Date.now();
      restored = true;
    }
  }
  if (acknowledged || Object.keys(conflicts).length) await persistDrafts();
  return restored;
}

export const getDraftConflicts = (): Record<string, string> => ({ ...conflicts });
export const getPendingDrafts = (): Record<string, string> => ({ ...drafts });
export async function discardDraftConflicts(): Promise<void> { conflicts = {}; await persistDrafts(); }

subscribe((doc, reason) => {
  if ((reason !== 'undo' && reason !== 'redo') || !Object.keys(drafts).length) return;
  // Recovery must follow explicit history choices, including when the preceding save failed.
  for (const key of Object.keys(drafts)) {
    const caption = key.startsWith(CAPTION);
    const el = doc.elements.find((e) => e.id === (caption ? key.slice(CAPTION.length) : key));
    const value = caption ? el?.data.photo?.caption ?? (el?.data.photo ? '' : undefined) : el?.data.text?.content;
    if (value === undefined) { delete drafts[key]; delete bases[key]; }
    else drafts[key] = value;
  }
  void persistDrafts().catch(reportDraftError);
});

addEventListener('mlw:saved', (event) => {
  persisted = (event as CustomEvent<BookDoc>).detail;
  if (!persisted) return;
  // Compare each draft with the exact saved snapshot, never a newer unsaved edit.
  for (const id of Object.keys(drafts)) void clearDraft(id).catch(reportDraftError);
});

function reportDraftError(error: unknown) {
  window.dispatchEvent(new CustomEvent('mlw:save-error', { detail: error }));
}

function saveDraftsOnLeave() {
  // Auth-only screens have not selected an owner or opened a journal. Never
  // initialize guest storage or overwrite its recovery while session lookup runs.
  if (!loading) return;
  if (loaded || Object.keys(drafts).length) writeRecovery();
  void loadDrafts().then(persistDrafts).catch(reportDraftError);
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraftsOnLeave(); });
addEventListener('pagehide', saveDraftsOnLeave);
