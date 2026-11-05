/* Boot: open the last book from IndexedDB (or create the seed book), then mount the 3D book. */
import './styles/tokens.css';
import { createSeedBook } from './state/seed';
import { getDoc, initStore, flush } from './state/store';
import { getMeta, loadBook, setMeta } from './sync/local';
import { mountBook } from './book/Book';
import { initPWA } from './pwa/install';
import { applyDrafts, getDraftConflicts } from './book/bookmark';
import { showSaveConflict } from './ui/saveConflict';
import { lastFont, loadFonts } from './fonts/fonts';

const ACTIVE_BOOK = 'activeBookId';

async function boot() {
  const app = document.getElementById('app')!;
  const activeId = await getMeta<string>(ACTIVE_BOOK);
  let doc = activeId ? await loadBook(activeId) : null;
  if (!doc) {
    doc = createSeedBook();
    initStore(doc);
    await flush();
    await setMeta(ACTIVE_BOOK, doc.book.id);
  } else {
    const restored = await applyDrafts(doc); // recovery remains until flush confirms a durable book snapshot
    initStore(doc, { dirty: restored });
    if (restored) await flush();
  }
  // only the fonts this book actually uses (plus the last picked) load at startup
  loadFonts([lastFont(), ...getDoc().elements.map((e) => e.data.text?.font).filter((f): f is string => !!f)]);
  mountBook(app, getDoc());
  initPWA(app.querySelector<HTMLButtonElement>('[data-act="install"]'));
  if (Object.keys(getDraftConflicts()).length) showSaveConflict(true);
}

void boot().catch(() => {
  const app = document.getElementById('app')!;
  app.innerHTML = `<div class="boot-error" role="alert"><span aria-hidden="true">✿</span><h1>Your little world needs a moment</h1><p>We couldn’t open your journal’s storage. Make sure this browser allows site storage, then try again.</p><button type="button">Try again</button></div>`;
  app.querySelector('button')!.addEventListener('click', () => location.reload());
});
