/* Single store for the open book: subscribe, update (with undo/redo), debounced autosave.
   Drags/rotations should move the DOM directly and call update() ONCE on pointerup —
   every update clones the doc for undo. */
import type { BookDoc, ID } from './schema';
import { saveDoc } from '../sync/local';

type Listener = (doc: BookDoc, reason: string) => void;

const UNDO_LIMIT = 50;
const SAVE_DELAY_MS = 400;

let doc: BookDoc | null = null;
let lastSaved: BookDoc | null = null;
const listeners = new Set<Listener>();
const undoStack: BookDoc[] = [];
const redoStack: BookDoc[] = [];
let saveTimer: number | undefined;
let saving: Promise<void> | null = null;

export function initStore(initial: BookDoc): void {
  doc = initial;
  lastSaved = initial;
  undoStack.length = redoStack.length = 0;
  emit('init');
}

export function getDoc(): BookDoc {
  if (!doc) throw new Error('store not initialised');
  return doc;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(reason: string, mutate: (draft: BookDoc) => void, opts: { undoable?: boolean } = {}): void {
  const current = getDoc();
  if (opts.undoable !== false) {
    undoStack.push(structuredClone(current));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }
  redoStack.length = 0;
  const draft = structuredClone(current);
  mutate(draft);
  doc = draft;
  scheduleSave();
  emit(reason);
}

export const canUndo = (): boolean => undoStack.length > 0;
export const canRedo = (): boolean => redoStack.length > 0;

export function undo(): boolean {
  const prev = undoStack.pop();
  if (!prev || !doc) return false;
  redoStack.push(doc);
  doc = prev;
  scheduleSave();
  emit('undo');
  return true;
}

export function redo(): boolean {
  const next = redoStack.pop();
  if (!next || !doc) return false;
  undoStack.push(doc);
  doc = next;
  scheduleSave();
  emit('redo');
  return true;
}

function emit(reason: string) {
  if (doc) for (const fn of listeners) fn(doc, reason);
}

function scheduleSave() {
  window.dispatchEvent(new CustomEvent('mlw:saving'));
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void flush().catch(() => {}); }, SAVE_DELAY_MS);
}

const missing = (before: { id: ID }[], after: { id: ID }[]) => {
  const keep = new Set(after.map((r) => r.id));
  return before.filter((r) => !keep.has(r.id)).map((r) => r.id);
};

/** Write pending changes to IndexedDB now. Concurrent callers share one ordered save loop. */
export function flush(): Promise<void> {
  window.clearTimeout(saveTimer);
  if (saving) return saving;
  if (!doc || !lastSaved) return Promise.resolve();
  saving = (async () => {
    do {
      const snapshot = getDoc();
      const previous = lastSaved!;
      window.dispatchEvent(new CustomEvent('mlw:saving'));
      await saveDoc(snapshot, {
        sections: missing(previous.sections, snapshot.sections),
        pages: missing(previous.pages, snapshot.pages),
        elements: missing(previous.elements, snapshot.elements),
      });
      lastSaved = snapshot;
      window.dispatchEvent(new CustomEvent('mlw:saved', { detail: snapshot }));
      // Edits made during the transaction must be saved against the snapshot just committed.
    } while (doc !== lastSaved);
  })().catch((error: unknown) => {
    window.dispatchEvent(new CustomEvent('mlw:save-error', { detail: error }));
    throw error;
  }).finally(() => { saving = null; });
  return saving;
}

// Text still being edited has its own immediate recovery record (bookmark.ts).
const saveOnLeave = () => { void flush().catch(() => {}); };
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveOnLeave(); });
addEventListener('pagehide', saveOnLeave);
