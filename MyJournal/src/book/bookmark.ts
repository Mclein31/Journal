/* Bookmark + unsaved-text drafts (Phase 8). Stored in IndexedDB meta (synced in Phase 10). */
import type { Bookmark, BookDoc } from '../state/schema';
import { getMeta, setMeta } from '../sync/local';
import { getDoc } from '../state/store';

const key = (bookId: string) => `bookmark:${bookId}`;
export const getBookmark = (bookId: string) => getMeta<Bookmark>(key(bookId));
export const setBookmark = (bookId: string, pageId: string) => setMeta(key(bookId), { bookId, pageId, updatedAt: Date.now() } satisfies Bookmark);
export const clearBookmark = (bookId: string) => setMeta(key(bookId), null);

/* Active text is outside the committed document until blur. Keep an immediate recovery
   copy as well as IndexedDB; mobile browsers need not finish async work on pagehide. */
const DRAFTS = 'drafts';
const RECOVERY = 'mlw:text-drafts';
let drafts: Record<string, string> = {};
let loading: Promise<void> | null = null;
let writes: Promise<void> = Promise.resolve();
let persisted: BookDoc | null = null;

function readRecovery(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(RECOVERY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string'));
  } catch { return null; }
}

function writeRecovery() {
  try { localStorage.setItem(RECOVERY, JSON.stringify(drafts)); } catch { /* IndexedDB still saves when localStorage is unavailable/full. */ }
}

function loadDrafts(): Promise<void> {
  if (!loading) {
    const recovery = readRecovery();
    loading = getMeta<Record<string, string>>(DRAFTS).then((saved) => {
      drafts = { ...(recovery ?? saved ?? {}), ...drafts };
      writeRecovery();
    });
  }
  return loading;
}

function persistDrafts(): Promise<void> {
  writeRecovery();
  const snapshot = { ...drafts };
  writes = writes.catch(() => {}).then(() => setMeta(DRAFTS, snapshot));
  return writes;
}

export async function saveDraft(elId: string, text: string): Promise<void> {
  drafts[elId] = text;
  writeRecovery(); // synchronous: the last keystroke survives an immediate close
  await loadDrafts();
  await persistDrafts();
}

/** Only acknowledge text present in an already committed snapshot. */
export async function clearDraft(elId: string): Promise<void> {
  await loadDrafts();
  if (!(elId in drafts) || !persisted) return;
  const saved = persisted.elements.find((el) => el.id === elId);
  const removed = !saved && !getDoc().elements.some((el) => el.id === elId);
  if (!removed && saved?.data.text?.content !== drafts[elId]) return;
  delete drafts[elId];
  await persistDrafts();
}

/** Boot restores drafts without consuming them; a successful book save acknowledges them. */
export async function applyDrafts(doc: BookDoc): Promise<boolean> {
  await loadDrafts();
  let restored = false;
  for (const [id, text] of Object.entries(drafts)) {
    const el = doc.elements.find((e) => e.id === id);
    if (el?.data.text && el.data.text.content !== text) {
      el.data.text.content = text;
      el.updatedAt = Date.now();
      restored = true;
    }
  }
  return restored;
}

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
  writeRecovery();
  void loadDrafts().then(persistDrafts).catch(reportDraftError);
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraftsOnLeave(); });
addEventListener('pagehide', saveDraftsOnLeave);
