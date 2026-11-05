/* The 3D book: static left/right pages + temporary turning leaves (see flip.ts). */
import '../styles/book.css';
import '../styles/textures.css';
import '../styles/desks.css';
import '../styles/canvas.css';
import '../styles/frames.css';
import '../styles/stickers.css';
import '../styles/polish.css';
import { icon } from '../ui/icons';
import { openStickerTray } from '../stickers/StickerTray';
import { applyDesk } from '../customize/backgrounds';
import { openCustomizePanel } from '../customize/CustomizePanel';
import type { BookDoc, Section } from '../state/schema';
import { canRedo, canUndo, getDoc, redo, subscribe, undo } from '../state/store';
import { attachCanvas, type CanvasApi } from '../canvas/Canvas';
import { openTearTool } from '../frames/TearTool';
import { clearBookmark, getBookmark, setBookmark } from './bookmark';
import { toast } from '../ui/toast';
import { showSaveConflict } from '../ui/saveConflict';
import type { Bookmark } from '../state/schema';
import { getMeta, setMeta } from '../sync/local';
import { buildLayout, type Layout, type Mode } from './layout';
import { blankPage, renderPage, renderSpreadCanvas } from './PageView';
import { renderTabs } from './Tabs';
import { clearLeaves, dragLeaf, turnLeaves, type DragLeaf, type LeafFaces } from './flip';
import { dragProgress } from './pageCurl';
import { addPages, openSectionManager } from './SectionManager';
import { isMuted, playCover, playFlip, playTab, setMuted } from '../audio/paper';

const MAX_RIFFLE = 5;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
// A resize signal only: the user explicitly chooses one page or a two-page spread.
const narrow = matchMedia('(max-aspect-ratio: 1/1), (max-width: 719px) and (min-height: 521px)');

const TEMPLATE = `
<div class="desk">
  <div class="desk-identity"><span class="brand-mark" aria-hidden="true">✿</span><div><span class="brand-name">Dear Days</span><span class="save-status" role="status">Saved on this device</span></div></div>
  <div class="desk-tools">
    <button type="button" class="tool-btn install-btn" data-act="install" aria-label="Install app" hidden>⬇<span class="tool-label"> Install</span></button>
    <button type="button" class="tool-btn sound-btn" data-act="sound" aria-label="Page sounds">🔊</button>
    <button type="button" class="tool-btn style-btn" data-act="style" aria-label="Customize book">${icon('style')}<span class="tool-label"> Style</span></button>
    <button type="button" class="tool-btn layout-btn" data-act="layout" aria-label="Two-page spread" aria-pressed="true">${icon('spread')}<span class="tool-label"> Two pages</span></button>
    <button type="button" class="tool-btn bookmark-btn" data-act="bookmark" aria-label="Bookmark this page" aria-pressed="false">${icon('bookmark')}<span class="tool-label"> Bookmark</span></button>
    <button type="button" class="tool-btn" data-act="close" aria-label="Close book">${icon('close')}<span class="tool-label"> Close</span></button>
    <button type="button" class="tool-btn" data-act="add-page" aria-label="Add pages">${icon('plus')}<span class="tool-label"> Pages</span></button>
    <button type="button" class="tool-btn" data-act="sections" aria-label="Edit sections">${icon('sections')}<span class="tool-label"> Sections</span></button>
  </div>
  <div class="book-wrap">
    <div class="book">
      <div class="cover-board" aria-hidden="true"></div>
      <div class="edge edge-left" aria-hidden="true"></div>
      <div class="edge edge-right" aria-hidden="true"></div>
      <div class="tabs tabs-left"></div>
      <div class="tabs tabs-right"></div>
      <div class="stage">
        <div class="slot slot-left"></div>
        <div class="slot slot-right"></div>
      </div>
      <button type="button" class="ribbon" aria-label="Go to bookmark" hidden></button>
      <button type="button" class="closed-cover" aria-label="Open the book">
        <span class="cover-title"></span>
        <span class="cover-hint">tap to open</span>
      </button>
    </div>
  </div>
  <nav class="book-nav" aria-label="Pages">
    <button type="button" class="nav-btn" data-act="prev" aria-label="Previous page">‹</button>
    <span class="nav-label" aria-live="polite"></span>
    <div class="page-tools">
      <button type="button" class="pt-btn" data-act="add-photo" aria-label="Add photo">${icon('photo')}<span class="tool-label"> Photo</span></button>
      <button type="button" class="pt-btn" data-act="add-text" aria-label="Add text">Aa<span class="tool-label"> Text</span></button>
      <button type="button" class="pt-btn" data-act="add-sticker" aria-label="Add sticker">${icon('sticker')}<span class="tool-label"> Sticker</span></button>
      <button type="button" class="pt-btn" data-act="undo" aria-label="Undo">${icon('undo')}</button>
      <button type="button" class="pt-btn" data-act="redo" aria-label="Redo">${icon('redo')}</button>
      <input type="file" accept="image/*" multiple hidden data-photo-input />
    </div>
    <button type="button" class="nav-btn" data-act="next" aria-label="Next page">›</button>
  </nav>
</div>`;

interface View {
  spread: number;
  mode: Mode;
  busy: boolean;
  queued: number | null;
  target: number | null;
  dirty: boolean;
  layout: Layout;
}

export function mountBook(root: HTMLElement, initial: BookDoc): void {
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const book = $('.book');
  const stage = $('.stage');
  const slotL = $('.slot-left');
  const slotR = $('.slot-right');
  const tabsL = $('.tabs-left');
  const tabsR = $('.tabs-right');
  const label = $('.nav-label');
  const prevBtn = $<HTMLButtonElement>('[data-act="prev"]');
  const nextBtn = $<HTMLButtonElement>('[data-act="next"]');
  const viewKey = `view:${initial.book.id}`;
  let navigated = false;
  const rememberView = () => { navigated = true; const p = v.layout.pages[v.mode === 'spread' ? v.spread * 2 : v.spread]; if (p) void setMeta(viewKey, { pageId: p.id }); };

  const layoutKey = `mlw:layout:${initial.book.id}`;
  let preferred: Mode = 'spread';
  try { if (localStorage.getItem(layoutKey) === 'single') preferred = 'single'; } catch { /* Layout still works without optional preferences. */ }
  const v: View = {
    spread: 0,
    mode: preferred,
    busy: false,
    queued: null,
    target: null,
    dirty: false,
    layout: buildLayout(initial),
  };

  let canvas: CanvasApi | null = null;
  const page = (i: number | undefined, side: 'left' | 'right', withElements = true) => renderPage(getDoc(), v.layout, i, side, withElements);
  const blank = (side: 'left' | 'right') => blankPage(getDoc(), side);
  const clamp = (k: number) => Math.max(0, Math.min(v.layout.spreadCount(v.mode) - 1, k));
  const navigationBase = () => v.queued ?? v.target ?? v.spread;
  function updateNavigationState() {
    prevBtn.disabled = navigationBase() <= 0;
    nextBtn.disabled = navigationBase() >= v.layout.spreadCount(v.mode) - 1;
  }

  function currentSection(): Section | undefined {
    const { left, right } = v.layout.spreadPages(v.spread, v.mode);
    return v.layout.sectionOf(left ?? right ?? 0);
  }

  function applyBookStyle(doc: BookDoc) {
    book.dataset.mode = v.mode;
    book.dataset.texture = doc.book.coverTexture;
    book.dataset.tint = doc.book.paperTint;
    book.style.setProperty('--cover', doc.book.coverColor);
    const rgb = doc.book.coverColor.match(/[a-f\d]{2}/gi)?.map((n) => parseInt(n, 16));
    const light = rgb && (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 165;
    book.style.setProperty('--cover-ink', light ? '#3d2d3a' : '#fff8f6');
    void applyDesk(root.querySelector<HTMLElement>('.desk')!, doc.book.background);
  }

  function render() {
    canvas?.commitEditing();
    const doc = getDoc();
    const layout = buildLayout(doc);
    if (layout.pages.some((p, i) => p.id !== v.layout.pages[i]?.id) || layout.pages.length !== v.layout.pages.length) {
      const activeId = canvas?.activePageId() ?? v.layout.pages[v.mode === 'spread' ? v.spread * 2 : v.spread]?.id;
      const index = layout.pages.findIndex((p) => p.id === activeId);
      if (index >= 0) v.spread = layout.spreadOfPage(index, v.mode);
    }
    v.layout = layout;
    v.spread = clamp(v.spread);
    applyBookStyle(doc);
    root.querySelector('.closed-cover .cover-title')!.textContent = doc.book.title;
    const { left, right } = v.layout.spreadPages(v.spread, v.mode);
    // phones: the left slot is a thin decorative strip showing the previous page's gutter edge
    // (inside of the cover on page 1) so the single page still reads as an open book
    slotL.replaceChildren(v.mode === 'spread' ? page(left, 'left', v.busy) : page(v.spread > 0 ? v.spread - 1 : undefined, 'left'));
    slotR.replaceChildren(page(right, 'right', v.mode !== 'spread' || v.busy));
    stage.querySelector('.spread-canvas')?.remove();
    if (v.mode === 'spread') stage.appendChild(renderSpreadCanvas(doc, v.layout, left, right));
    const layoutButton = $<HTMLButtonElement>('[data-act="layout"]');
    layoutButton.setAttribute('aria-pressed', String(v.mode === 'spread'));
    layoutButton.title = v.mode === 'spread' ? 'Switch to one page' : 'Switch to two pages';
    layoutButton.querySelector('.tool-label')!.textContent = v.mode === 'spread' ? ' Two pages' : ' One page';
    const closed = root.querySelector<HTMLElement>('.desk')?.dataset.closed === 'true';
    // closed book: every tab sticks out of the right edge
    renderTabs(tabsL, tabsR, { layout: v.layout, spread: closed ? -1 : v.spread, mode: v.mode, current: closed ? undefined : currentSection(), onPick: pickSection });
    fitTabs();
    const total = v.layout.pages.length;
    const behind = closed ? 0 : v.mode === 'spread' ? 2 * v.spread : v.spread;
    book.style.setProperty('--behind', String(behind));
    book.style.setProperty('--ahead', String(closed ? total : Math.max(0, total - behind - (v.mode === 'spread' ? 2 : 1))));
    const nums = [left, right].filter((n): n is number => n !== undefined).map((n) => n + 1);
    label.textContent = `${currentSection()?.name ?? ''} · ${nums.length > 1 ? `pages ${nums[0]}–${nums[1]}` : `page ${nums[0] ?? ''}`}`;
    canvas?.decorate();
    renderRibbon();
    $<HTMLButtonElement>('[data-act="undo"]').disabled = !canUndo();
    $<HTMLButtonElement>('[data-act="redo"]').disabled = !canRedo();
    updateNavigationState();
  }

  function setBusy(busy: boolean) {
    if (busy) canvas?.commitEditing();
    v.busy = busy;
    if (!busy) v.target = null;
    updateNavigationState();
    stage.dataset.turning = String(busy);
    if (busy && v.mode === 'spread') {
      const { left, right } = v.layout.spreadPages(v.spread, v.mode);
      slotL.replaceChildren(page(left, 'left'));
      slotR.replaceChildren(page(right, 'right'));
    }
    if (!busy) render();
  }

  /** If any tab label doesn't fit (small screen / many sections), switch every tab to icon-only. */
  function fitTabs() {
    book.classList.remove('tabs-compact');
    const cut = [...book.querySelectorAll<HTMLElement>('.tab-label')].some((l) => l.scrollHeight > l.clientHeight + 1);
    book.classList.toggle('tabs-compact', cut);
  }
  let fitFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fitTabs);
  }).observe(book);

  // ── bookmark ribbon (Phase 8) ──
  let bookmark: Bookmark | null = null;
  const bookmarkIndex = () => (bookmark ? v.layout.pages.findIndex((p) => p.id === bookmark!.pageId) : -1);

  function renderRibbon() {
    const ribbon = root.querySelector<HTMLButtonElement>('.ribbon');
    const btn = root.querySelector<HTMLButtonElement>('[data-act="bookmark"]');
    if (!ribbon || !btn) return;
    const i = bookmarkIndex();
    const closed = root.querySelector<HTMLElement>('.desk')?.dataset.closed === 'true';
    const { left, right } = v.layout.spreadPages(v.spread, v.mode);
    const here = i >= 0 && (i === left || i === right);
    ribbon.hidden = i < 0;
    ribbon.className = 'ribbon';
    if (i >= 0) {
      if (closed) ribbon.classList.add('rb-closed');
      else if (here) ribbon.classList.add('rb-on', i === left && v.mode === 'spread' ? 'rb-left' : 'rb-right');
      else ribbon.classList.add('rb-tail', (left ?? right ?? 0) > i ? 'rb-left' : 'rb-right');
    }
    btn.setAttribute('aria-pressed', String(!!bookmark && bookmark.pageId === canvas?.activePageId()));
  }

  function bookmarkLabel(i: number) {
    return `${v.layout.sectionOf(i)?.name ?? ''}, page ${i + 1}`;
  }

  async function toggleBookmark() {
    const { left, right } = v.layout.spreadPages(v.spread, v.mode);
    const pageId = canvas?.activePageId() ?? v.layout.pages[right ?? left ?? 0]?.id;
    if (!pageId) return;
    if (bookmark?.pageId === pageId) {
      bookmark = null;
      await clearBookmark(getDoc().book.id);
      toast('Bookmark removed');
    } else {
      await setBookmark(getDoc().book.id, pageId);
      bookmark = (await getBookmark(getDoc().book.id)) ?? null;
      toast(`🔖 Bookmarked ${bookmarkLabel(bookmarkIndex())}`);
    }
    renderRibbon();
  }

  async function pickSection(s: Section) {
    playTab();
    if (desk.dataset.closed === 'true') await openBook();
    void goTo(v.layout.spreadOfPage(v.layout.firstPage.get(s.id) ?? 0, v.mode));
  }

  /** Faces for the leaves that turn between the current and target spread. */
  function buildLeaves(target: number, dir: 1 | -1, n: number): LeafFaces[] {
    const cur = v.layout.spreadPages(v.spread, v.mode);
    const dst = v.layout.spreadPages(target, v.mode);
    const leaves: LeafFaces[] = [];
    for (let i = 0; i < n; i++) {
      const first = i === 0, last = i === n - 1;
      if (v.mode === 'single') {
        // forward: current page flips away; back: target page flips in
        const front = dir === 1 ? (first ? page(cur.right, 'right') : blank('right')) : (last ? page(dst.right, 'right') : blank('right'));
        leaves.push({ front, back: blank('left') });
      } else if (dir === 1) {
        leaves.push({ front: first ? page(cur.right, 'right') : blank('right'), back: last ? page(dst.left, 'left') : blank('left') });
      } else {
        leaves.push({ front: last ? page(dst.right, 'right') : blank('right'), back: first ? page(cur.left, 'left') : blank('left') });
      }
    }
    return leaves;
  }

  interface Turn { ctl: DragLeaf; dir: 1 | -1; target: number; width: number; height: number; grabX: number }
  let settlingTurn: Turn | null = null;

  async function goTo(target: number) {
    if (desk.dataset.closed === 'true') return;
    canvas?.deselect();
    target = clamp(target);
    if (v.busy) { v.queued = target; updateNavigationState(); return; }
    navigated = true;
    if (target === v.spread) return;
    v.target = target;
    setBusy(true);
    root.querySelector<HTMLElement>('.ribbon')!.hidden = true; // back after the turn's render()
    const dir: 1 | -1 = target > v.spread ? 1 : -1;
    if (reduced.matches) {
      playFlip(0, 260, 0.7);
      await stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: 'forwards' }).finished;
      v.spread = target;
      render();
      await stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 110, fill: 'forwards' }).finished;
    } else {
      const n = Math.min(Math.abs(target - v.spread), MAX_RIFFLE);
      const leaves = buildLeaves(target, dir, n);
      const dst = v.layout.spreadPages(target, v.mode);
      // reveal what's underneath the turning leaves before they move
      // forward: target right page waits under the leaves; backward (spread): target left does
      if (dir === 1) slotR.replaceChildren(page(dst.right, 'right'));
      else if (v.mode === 'spread') slotL.replaceChildren(page(dst.left, 'left'));
      const dur = n === 1 ? 650 : 480;
      for (let i = 0; i < n; i++) playFlip(i * 70, dur, i === 0 || i === n - 1 ? 1 : 0.55);
      // phones: the turned page swings past the book's edge, so fade it instead of letting it vanish
      const fade = v.mode === 'single' ? (dir === 1 ? 'out' : 'in') : undefined;
      const finished = await turnLeaves({ stage, dir, leaves, durationMs: dur, staggerMs: 70, fade,
        onLeaf: (ctl) => { settlingTurn = { ctl, dir, target, width: slotR.getBoundingClientRect().width, height: stage.getBoundingClientRect().height, grabX: ctl.grab.x }; },
      });
      if (!finished) return; // A fresh drag now owns the same visible page and its eventual landing.
      settlingTurn = null;
      v.spread = target;
      render();
      clearLeaves(stage);
    }
    setBusy(false);
    rememberView();
    if (v.dirty) { v.dirty = false; render(); }
    if (v.queued !== null) { const q = v.queued; v.queued = null; void goTo(q); }
  }

  // ── input ──
  canvas = attachCanvas(stage, () => v.busy || desk.dataset.closed === 'true');
  stage.addEventListener('pointerdown', renderRibbon);
  addEventListener('mlw:tear', (e) => openTearTool((e as CustomEvent<string>).detail));
  const photoInput = $<HTMLInputElement>('[data-photo-input]');
  $('[data-act="add-photo"]').addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    const files = [...(photoInput.files ?? [])];
    photoInput.value = '';
    void canvas?.addPhotos(files);
  });
  $('[data-act="add-text"]').addEventListener('click', () => canvas?.addTextHere());
  $('[data-act="add-sticker"]').addEventListener('click', () => { if (!v.busy && desk.dataset.closed !== 'true') openStickerTray((id, aspect) => canvas?.addStickerHere(id, aspect)); });
  $('[data-act="undo"]').addEventListener('click', () => { canvas?.commitEditing(); undo(); });
  $('[data-act="redo"]').addEventListener('click', () => { canvas?.commitEditing(); redo(); });
  $('[data-act="layout"]').addEventListener('click', () => {
    if (v.busy) return;
    const activeIndex = v.layout.pages.findIndex((p) => p.id === canvas?.activePageId());
    canvas?.deselect();
    const first = activeIndex >= 0 ? activeIndex : v.mode === 'spread' ? v.spread * 2 : v.spread;
    v.mode = v.mode === 'spread' ? 'single' : 'spread';
    v.spread = v.layout.spreadOfPage(first, v.mode);
    try { localStorage.setItem(layoutKey, v.mode); } catch { /* Optional preference. */ }
    render(); rememberView();
  });
  $('[data-act="sections"]').addEventListener('click', openSectionManager);
  $('[data-act="style"]').addEventListener('click', () => openCustomizePanel(desk.dataset.closed === 'true' ? undefined : canvas?.activePageId()));
  $('[data-act="add-page"]').addEventListener('click', () => {
    const s = currentSection();
    if (s) { canvas?.deselect(); addPages(s.id); const pages = v.layout.pages.filter((p) => p.sectionId === s.id); const index = v.layout.pages.findIndex((p) => p.id === pages.at(-2)?.id); if (index >= 0) void goTo(v.layout.spreadOfPage(index, v.mode)); toast('Two fresh pages added'); }
  });
  prevBtn.addEventListener('click', () => void goTo(navigationBase() - 1));
  nextBtn.addEventListener('click', () => void goTo(navigationBase() + 1));
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || document.querySelector('dialog[open], .tear-tool, .frame-menu') || stage.querySelector('.el.is-selected')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); void goTo(navigationBase() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); void goTo(navigationBase() - 1); }
  });
  // drag a page to turn it by hand (never when grabbing an element on the page)
  interface Drag { x: number; y: number; id: number; lastX: number; lastY: number; lastT: number; vx: number; startProgress: number; pullOrigin: number; turn?: Turn }
  let drag: Drag | null = null;
  const progressOf = (d: Drag, x: number) => d.turn ? dragProgress(-d.turn.dir * (x - d.x), d.turn.width, d.turn.grabX, d.startProgress) : 0;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (settlingTurn && v.busy) {
      const turn = settlingTurn;
      const held = turn.ctl.hold();
      settlingTurn = null;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, vx: 0, startProgress: held.progress, pullOrigin: held.pullY, turn };
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (v.busy || (e.target as HTMLElement).closest('.el, .el-ui')) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, vx: 0, startProgress: 0, pullOrigin: 0 };
  });

  stage.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    const dt = Math.max(1, e.timeStamp - drag.lastT);
    drag.vx = 0.8 * ((e.clientX - drag.lastX) / dt) + 0.2 * drag.vx; // smoothed px/ms
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    if (!drag.turn) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return; // not a horizontal drag (yet)
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      const target = v.spread + dir;
      if (v.busy || target < 0 || target > v.layout.spreadCount(v.mode) - 1) { drag = null; return; }
      const sourceSlot = dir === 1 || v.mode === 'single' ? slotR : slotL;
      const bounds = sourceSlot.getBoundingClientRect();
      const grab = {
        x: Math.max(.12, Math.min(1, dir === 1 || v.mode === 'single' ? (drag.x - bounds.left) / bounds.width : (bounds.right - drag.x) / bounds.width)),
        y: Math.max(0, Math.min(1, (drag.y - bounds.top) / bounds.height)),
      };
      v.target = target;
      setBusy(true);
      canvas?.deselect();
      root.querySelector<HTMLElement>('.ribbon')!.hidden = true;
      stage.setPointerCapture(e.pointerId);
      const dst = v.layout.spreadPages(target, v.mode);
      const [faces] = buildLeaves(target, dir, 1);
      if (dir === 1) slotR.replaceChildren(page(dst.right, 'right'));
      else if (v.mode === 'spread') slotL.replaceChildren(page(dst.left, 'left'));
      const fade = v.mode === 'single' ? (dir === 1 ? 'out' : 'in') : undefined;
      drag.turn = { ctl: dragLeaf(stage, faces, dir, fade, { grab }), dir, target, width: bounds.width, height: bounds.height, grabX: grab.x };
    }
    drag.turn.ctl.follow(progressOf(drag, e.clientX), drag.pullOrigin + (e.clientY - drag.y) / Math.max(1, drag.turn.height));
  });

  async function endDrag(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (!d.turn) return;
    const { ctl, dir, target } = d.turn;
    const progress = progressOf(d, e.clientX);
    // A flick must still be moving at release: a stationary hold sheds its old momentum.
    const idle = Math.max(0, e.timeStamp - d.lastT);
    const vx = idle > 100 ? 0 : d.vx * Math.exp(-idle / 80);
    const velocity = -dir * vx * 1000 / (Math.PI * d.turn.width * Math.max(.12, d.turn.grabX) * Math.max(.18, Math.sin(progress * Math.PI)));
    const complete = e.type !== 'pointercancel' && progress + velocity * .12 > .5;
    v.target = complete ? target : v.spread;
    updateNavigationState();
    if (complete) playFlip(0, Math.max(220, (1 - progress) * 650), 0.9);
    settlingTurn = d.turn;
    const finished = await ctl.finish(complete, 700, e.type === 'pointercancel' ? 0 : velocity);
    if (!finished) return;
    if (settlingTurn === d.turn) settlingTurn = null;
    if (complete) v.spread = target;
    render();
    clearLeaves(stage);
    setBusy(false);
    if (complete) rememberView();
    if (v.dirty) { v.dirty = false; render(); }
    if (v.queued !== null) { const q = v.queued; v.queued = null; void goTo(q); }
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  const resizeTurn = () => {
    const turn = drag?.turn ?? settlingTurn;
    if (!turn) return;
    turn.ctl.resize();
    turn.width = Math.max(1, slotR.getBoundingClientRect().width);
    turn.height = Math.max(1, stage.getBoundingClientRect().height);
    if (drag?.turn) {
      const pose = turn.ctl.hold();
      drag.startProgress = pose.progress; drag.pullOrigin = pose.pullY;
      drag.x = drag.lastX; drag.y = drag.lastY; drag.vx = 0;
    }
  };
  addEventListener('resize', resizeTurn);
  narrow.addEventListener('change', () => {
    resizeTurn();
    canvas?.deselect();
    if (v.busy) { v.dirty = true; return; }
    render();
    rememberView();
  });

  subscribe(() => (v.busy ? (v.dirty = true) : render()));

  const closedCover = $<HTMLButtonElement>('.closed-cover');
  const edgeL = $('.edge-left');
  const desk = $('.desk');

  const OPEN_MS = 1000; // must match --open-ms in book.css (book slide + board unfold run alongside)

  /** Cover leaf. In spread mode its back is the real left page, so when it lands it's identical
      to the static page underneath — no swap, no pop. */
  function coverFaces(): LeafFaces {
    const front = document.createElement('div');
    front.className = 'cover-face';
    const title = document.createElement('span');
    title.className = 'cover-title';
    title.textContent = getDoc().book.title;
    front.appendChild(title);
    let back: HTMLElement;
    if (v.mode === 'spread') {
      back = page(v.layout.spreadPages(v.spread, v.mode).left, 'left');
    } else {
      back = document.createElement('div');
      back.className = 'cover-face cover-inside';
    }
    return { front, back };
  }

  function setClosed(closed: boolean) {
    desk.dataset.closed = String(closed);
    render();
    closedCover.querySelector('.cover-title')!.textContent = getDoc().book.title;
    closedCover.tabIndex = closed ? 0 : -1;
  }

  /** Cover swings open while the book slides from centered-closed to open (one shared timing). */
  async function openBook() {
    if (v.busy || desk.dataset.closed !== 'true') return;
    navigated = true;
    setBusy(true);
    const bi = bookmarkIndex();
    if (bi >= 0) v.spread = v.layout.spreadOfPage(bi, v.mode); // open straight onto the bookmark
    if (bi >= 0 && !sessionStorage.getItem('mlw:welcomed')) {
      sessionStorage.setItem('mlw:welcomed', '1');
      window.setTimeout(() => toast(`Welcome back ♡ continuing from ${bookmarkLabel(bi)}`), OPEN_MS * 0.6);
    }
    playCover(OPEN_MS);
    if (reduced.matches) {
      setClosed(false);
    } else {
      desk.dataset.opening = 'true';
      const faces = coverFaces();
      setClosed(false);
      root.querySelector<HTMLElement>('.ribbon')!.hidden = true; // would sit on top of the swinging cover
      // the left page sits under the cover once it passes 90° — reveal it exactly then, on the
      // same animation timeline as the cover (a timer could drift a frame and flash the page)
      const reveal = (at: number): Keyframe[] => [{ visibility: 'hidden' }, { visibility: 'hidden', offset: at }, { visibility: 'visible', offset: at }];
      slotL.animate(reveal(0.5), { duration: OPEN_MS });
      // the edge strip sits at the board's outer edge, which the unfolding board only reaches near the end
      edgeL.animate(reveal(0.85), { duration: OPEN_MS });
      await turnLeaves({ stage, dir: 1, leaves: [faces], durationMs: OPEN_MS, staggerMs: 0, fade: v.mode === 'single' ? 'out' : undefined });
      clearLeaves(stage);
      delete desk.dataset.opening;
      renderRibbon();
    }
    setBusy(false);
    if (v.dirty) { v.dirty = false; render(); }
    const focusTarget = nextBtn.disabled ? prevBtn.disabled ? $<HTMLButtonElement>('[data-act="add-text"]') : prevBtn : nextBtn;
    focusTarget.focus({ preventScroll: true });
  }

  /** Reverse of openBook: cover swings shut while the book slides back to center. */
  async function closeBook() {
    if (v.busy || desk.dataset.closed === 'true') return;
    canvas?.deselect();
    setBusy(true);
    playCover(OPEN_MS, true);
    root.querySelector<HTMLElement>('.ribbon')!.hidden = true;
    if (!reduced.matches) {
      const faces = coverFaces();
      desk.dataset.closing = 'true'; // CSS: slide to center + fold the board, same duration
      slotL.style.visibility = 'hidden'; // the cover's back face shows this exact page
      // page-edge strip goes as soon as the board starts folding away from under it (mirror of openBook)
      edgeL.animate([{ visibility: 'visible' }, { visibility: 'visible', offset: 0.15 }, { visibility: 'hidden', offset: 0.15 }, { visibility: 'hidden' }], { duration: OPEN_MS, fill: 'forwards' });
      await turnLeaves({ stage, dir: -1, leaves: [faces], durationMs: OPEN_MS, staggerMs: 0, fade: v.mode === 'single' ? 'in' : undefined });
    }
    setClosed(true);
    clearLeaves(stage);
    edgeL.getAnimations().forEach((a) => a.cancel());
    slotL.style.visibility = '';
    delete desk.dataset.closing;
    setBusy(false);
    closedCover.focus({ preventScroll: true });
  }

  closedCover.addEventListener('click', () => void openBook());
  root.querySelector('.ribbon')!.addEventListener('click', () => {
    const i = bookmarkIndex();
    if (i < 0) return;
    if (desk.dataset.closed === 'true') void openBook();
    else void goTo(v.layout.spreadOfPage(i, v.mode));
  });
  $('[data-act="bookmark"]').addEventListener('click', () => void toggleBookmark());
  void getBookmark(initial.book.id).then((b) => { bookmark = b ?? null; renderRibbon(); });
  $('[data-act="close"]').addEventListener('click', () => void closeBook());
  const soundBtn = $<HTMLButtonElement>('[data-act="sound"]');
  const drawSound = () => {
    soundBtn.innerHTML = icon(isMuted() ? 'mute' : 'sound');
    soundBtn.title = isMuted() ? 'Turn page sounds on' : 'Mute page sounds';
    soundBtn.setAttribute('aria-pressed', String(!isMuted()));
  };
  soundBtn.addEventListener('click', () => { setMuted(!isMuted()); drawSound(); if (!isMuted()) playTab(); });
  drawSound();
  root.querySelectorAll<HTMLButtonElement>('button[aria-label]').forEach((b) => { if (!b.title) b.title = b.getAttribute('aria-label')!; });
  const status = root.querySelector<HTMLElement>('.save-status')!;
  addEventListener('mlw:saving', () => { status.textContent = 'Saving…'; status.dataset.state = 'saving'; });
  addEventListener('mlw:saved', () => { status.textContent = 'Saved on this device'; status.dataset.state = 'saved'; });
  addEventListener('mlw:save-error', () => { status.textContent = 'Could not save · check storage'; status.dataset.state = 'error'; });
  addEventListener('mlw:save-conflict', () => {
    status.textContent = 'Unsaved · changed in another window';
    status.dataset.state = 'error';
    showSaveConflict();
  });
  setClosed(true);

  render();
  void getMeta<number | { pageId: string }>(viewKey).then((saved) => {
    if (navigated || v.busy || desk.dataset.closed !== 'true') return;
    const index = typeof saved === 'object' && saved ? v.layout.pages.findIndex((p) => p.id === saved.pageId) : -1;
    if (index >= 0) v.spread = v.layout.spreadOfPage(index, v.mode);
    else if (typeof saved === 'number') v.spread = clamp(saved);
    render();
  });
}
