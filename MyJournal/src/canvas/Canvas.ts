/* Page canvas interactions (Phase 4): select, move, scale+rotate (corner knob or pinch),
   edit text, double-tap paper for new text, drop/paste photos, keyboard shortcuts.
   Live gestures move the DOM directly; the store gets ONE update on release (one undo step). */
import { canRedo, canUndo, flush, getDoc, redo, undo } from '../state/store';
import { addPhoto, addSticker, addText, deleteElement, duplicateElement, moveElement, patchElement, reorder } from './elements';
import { buildLayout } from '../book/layout';
import { elementLabel } from '../book/PageView';
import { closeFrameMenu, openFrameMenu } from '../frames/FrameMenu';
import { frameDef } from '../frames/frames';
import { closeFontMenu, openFontMenu } from '../fonts/FontMenu';
import { clearDraft, saveCaptionDraft, saveDraft } from '../book/bookmark';
import { toast } from '../ui/toast';
import { icon } from '../ui/icons';

export interface CanvasApi {
  /** call after every book render: re-attaches selection UI */
  decorate(): void;
  commitEditing(): void;
  activePageId(): string | undefined;
  addPhotos(files: Iterable<File>, pageId?: string, at?: { x: number; y: number }): Promise<void>;
  addTextHere(): void;
  addStickerHere(stickerId: string, aspect: number): void;
  deselect(): void;
}

export function attachCanvas(stage: HTMLElement, isBusy: () => boolean): CanvasApi {
  let selectedId: string | null = null;
  let editingId: string | null = null;
  let pendingEdit: string | null = null;
  let freshText: string | null = null; // just added: its first text joins the add's undo step
  let activePage: string | undefined;

  const isSingle = () => stage.closest<HTMLElement>('.book')?.dataset.mode === 'single';
  // an item running past the spine has a carried-over copy on the facing page ([data-ghost])
  const elNode = (id: string | null) => {
    if (!id) return null;
    return [...stage.querySelectorAll<HTMLElement>(`.el[data-el-id="${id}"]`)]
      .find((n) => !n.dataset.ghost && !(isSingle() && n.closest('.slot-left'))) ?? null;
  };
  const copies = (id: string) => [...stage.querySelectorAll<HTMLElement>(`.el[data-el-id="${id}"]`)];
  const ghostOffset = (n: HTMLElement) => Number(n.dataset.canvasOffset ?? n.dataset.ghost ?? 0);
  const canvasScale = (n: HTMLElement) => Number(n.dataset.canvasScale ?? 1);
  const model = (id: string) => getDoc().elements.find((e) => e.id === id);
  const onPage = (pageId: string) => getDoc().elements.filter((e) => e.pageId === pageId).length;
  const sheetOf = (node: HTMLElement) => node.closest<HTMLElement>('.page-sheet') ?? stage.querySelector<HTMLElement>(`.slot .page[data-page-id="${node.dataset.ownerPage}"] .page-sheet`)!;

  function visiblePageIds(): string[] {
    return [...stage.querySelectorAll<HTMLElement>('.slot .page[data-page-id]')]
      .filter((p) => stage.closest<HTMLElement>('.book')?.dataset.mode !== 'single' || !p.closest('.slot-left'))
      .map((p) => p.dataset.pageId!);
  }

  function activePageId(): string | undefined {
    const visible = visiblePageIds();
    if (activePage && visible.includes(activePage)) return activePage;
    const right = stage.querySelector<HTMLElement>('.slot-right .page[data-page-id]');
    return right?.dataset.pageId ?? visible[0];
  }

  let captionEditing = false;
  let commitCaption: (() => void) | null = null;
  let keyboardFocus = false;
  let pointerMode = false;
  let suppressFocusSelect = false;

  addEventListener('keydown', () => { pointerMode = false; }, true);
  stage.addEventListener('pointerdown', () => { pointerMode = true; }, true);

  function ensureLive(): HTMLElement {
    let live = stage.querySelector<HTMLElement>('.canvas-live');
    if (!live) {
      live = document.createElement('div');
      live.className = 'canvas-live';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      stage.appendChild(live);
    }
    return live;
  }
  function announce(msg: string) {
    const live = ensureLive();
    // Append a zero-width space when repeating the same announcement so screen readers re-read it.
    live.textContent = live.textContent === msg ? `${msg}\u200B` : msg;
  }
  addEventListener('mlw:announce', (e) => {
    const msg = (e as CustomEvent<string>).detail;
    if (msg) announce(msg);
  });

  function visibleElements() {
    const pages = visiblePageIds();
    const pageRank = new Map(pages.map((id, i) => [id, i]));
    return getDoc().elements
      .filter((e) => pageRank.has(e.pageId) && elNode(e.id))
      .sort((a, b) => (pageRank.get(a.pageId)! - pageRank.get(b.pageId)!) || (a.y - b.y) || (a.x - b.x) || (a.z - b.z));
  }

  function focusEl(id: string | null) {
    const node = elNode(id);
    if (!node) return;
    suppressFocusSelect = true;
    node.focus({ preventScroll: true });
    suppressFocusSelect = false;
  }

  function selectByKeyboard(id: string, msg?: string) {
    const m = model(id);
    if (!m) return;
    activePage = m.pageId;
    keyboardFocus = true;
    select(id);
    focusEl(id);
    announce(msg ?? `Selected ${elementLabel(m)}`);
  }

  function select(id: string | null) {
    if (id !== selectedId) { closeFrameMenu(); closeFontMenu(); }
    if (editingId && editingId !== id) stopEditing();
    if (!id) keyboardFocus = false;
    selectedId = id;
    decorate();
  }

  function removeSelected(restoreStage: boolean) {
    if (!selectedId) return;
    const id = selectedId;
    const m = model(id);
    const label = m ? elementLabel(m) : 'element';
    selectedId = null;
    keyboardFocus = false;
    deleteElement(id);
    announce(`Deleted ${label}`);
    if (restoreStage) { stage.tabIndex = -1; stage.focus({ preventScroll: true }); }
  }

  function focusToolbar(): boolean {
    const firstBtn = stage.querySelector<HTMLButtonElement>('.el-bar button:not(:disabled)');
    if (!firstBtn) return false;
    firstBtn.focus({ preventScroll: true });
    announce('Element actions toolbar');
    return true;
  }

  function decorate() {
    ensureLive();
    const prevActive = document.activeElement as HTMLElement | null;
    const prevBarCmd = prevActive && stage.contains(prevActive) ? prevActive.closest<HTMLButtonElement>('.el-bar [data-cmd]')?.dataset.cmd : undefined;
    const visible = new Set(visiblePageIds());
    const busy = isBusy();
    stage.querySelectorAll<HTMLElement>('.el').forEach((n) => {
      n.classList.remove('is-selected');
      const id = n.dataset.elId ?? '';
      const m = model(id);
      const isGhost = !!n.dataset.ghost || (isSingle() && !!n.closest('.slot-left'));
      if (isGhost || busy || !m || !visible.has(m.pageId)) {
        n.tabIndex = -1;
        n.setAttribute('aria-hidden', 'true');
        return;
      }
      n.removeAttribute('aria-hidden');
      n.tabIndex = 0;
      n.setAttribute('role', 'group');
      n.setAttribute('aria-label', elementLabel(m));
      n.setAttribute('aria-selected', String(id === selectedId));
      const origFocus = HTMLElement.prototype.focus;
      n.focus = function (options?: FocusOptions) {
        origFocus.call(this, options);
        if (!suppressFocusSelect && !isBusy() && !editingId && !captionEditing && this.dataset.elId) {
          if (isSingle() && this.closest('.slot-left')) return;
          activePage = this.dataset.ownerPage;
          keyboardFocus = true;
          if (selectedId !== this.dataset.elId) {
            const targetId = this.dataset.elId;
            select(targetId);
            const item = model(targetId);
            if (item) announce(`Selected ${elementLabel(item)}`);
          }
        }
      };
    });
    stage.querySelectorAll('.el-ui').forEach((n) => n.remove());
    const node = elNode(selectedId);
    if (!node) {
      if (selectedId && !model(selectedId)) {
        selectedId = null; // deleted / undone away
        if (keyboardFocus) {
          keyboardFocus = false;
          if (!document.activeElement?.isConnected || document.activeElement === document.body) {
            stage.tabIndex = -1;
            stage.focus({ preventScroll: true });
          }
        }
      }
      return;
    }
    node.classList.add('is-selected');
    node.setAttribute('aria-selected', 'true');
    const knob = document.createElement('button');
    knob.type = 'button';
    knob.className = 'el-ui el-knob';
    knob.tabIndex = -1;
    knob.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('div');
    bar.className = 'el-ui el-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Element actions');
    const isPhoto = model(selectedId!)?.type === 'photo';
    const isSticker = model(selectedId!)?.type === 'sticker';
    const isText = model(selectedId!)?.type === 'text';
    const isTorn = isPhoto && model(selectedId!)?.data.photo?.frame === 'torn';
    bar.innerHTML = `${isText ? '<button type="button" data-cmd="font" aria-label="Font and ink" title="Font">Aa</button>' : ''}${isPhoto ? `<button type="button" data-cmd="frame" aria-label="Frame" title="Frame">🖼</button>${isTorn ? '<button type="button" data-cmd="tear" aria-label="Tear more" title="Tear">✂</button>' : ''}` : ''}${isSticker ? '<button type="button" data-cmd="effect" aria-label="Sticker effect" title="Effect">✨</button>' : ''}
      <button type="button" data-cmd="front" aria-label="Bring to front" title="Bring to front">⬆</button>
      <button type="button" data-cmd="back" aria-label="Send to back" title="Send to back">⬇</button>
      <button type="button" data-cmd="dup" aria-label="Duplicate" title="Duplicate">⧉</button>
      <button type="button" data-cmd="del" aria-label="Delete" title="Delete">🗑</button>`;
    bar.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const cmd = button.dataset.cmd!;
      if (cmd !== 'font' && cmd !== 'effect') button.innerHTML = icon(cmd);
    });
    // handles live on the stage, above every element and outside the page's clipping
    stage.append(knob, bar);
    positionUI();
    if (pendingEdit === selectedId) {
      pendingEdit = null;
      startEditing(selectedId!);
      return;
    }
    if (prevBarCmd && !document.querySelector('dialog[open], .tear-tool, .frame-menu')) {
      bar.querySelector<HTMLButtonElement>(`[data-cmd="${prevBarCmd}"]`)?.focus({ preventScroll: true });
      return;
    }
    const curActive = document.activeElement as HTMLElement | null;
    const focusInOrLost = !curActive || !curActive.isConnected || curActive === document.body || stage.contains(curActive);
    if (keyboardFocus && !editingId && !captionEditing && curActive !== node && !bar.contains(curActive) && focusInOrLost && !document.querySelector('dialog[open], .tear-tool, .frame-menu')) {
      focusEl(selectedId);
    }
  }

  /** Place knob (rotated bottom-right corner) and bar (above the element) over the stage. */
  function positionUI() {
    const node = elNode(selectedId);
    const knob = stage.querySelector<HTMLElement>('.el-knob');
    const bar = stage.querySelector<HTMLElement>('.el-bar');
    if (!node || !knob || !bar) return;
    const sr = stage.getBoundingClientRect();
    const k = sr.width / stage.offsetWidth || 1; // the book may be scaled (Style sheet open)
    const r = node.getBoundingClientRect();
    const cx = (r.left + r.width / 2 - sr.left) / k, cy = (r.top + r.height / 2 - sr.top) / k;
    const rot = ((model(selectedId!)?.rot ?? 0) * Math.PI) / 180;
    const live = /rotate\((-?[\d.]+)deg\)/.exec(node.style.transform);
    const a = live ? (Number(live[1]) * Math.PI) / 180 : rot;
    const hw = node.offsetWidth / 2, hh = node.offsetHeight / 2;
    knob.style.left = `${cx + hw * Math.cos(a) - hh * Math.sin(a)}px`;
    knob.style.top = `${cy + hw * Math.sin(a) + hh * Math.cos(a)}px`;
    const top = (r.top - sr.top) / k;
    const below = top < 56;
    bar.classList.toggle('below', below);
    const half = Math.min(bar.offsetWidth / 2, (innerWidth - 16) / (2 * k));
    const minX = (8 - sr.left) / k + half;
    const maxX = (innerWidth - 8 - sr.left) / k - half;
    bar.style.left = `${Math.max(minX, Math.min(maxX, cx))}px`;
    const desiredY = below ? (r.bottom - sr.top) / k + 22 : top - bar.offsetHeight - 14;
    const y = Math.max((8 - sr.top) / k, Math.min((innerHeight - 8 - sr.top) / k - bar.offsetHeight, desiredY));
    bar.style.top = `${y}px`;
    bar.style.transform = 'translateX(-50%)';
  }
  addEventListener('resize', () => positionUI());
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.el-bar')) e.preventDefault();
  }, true);

  function startEditing(id: string) {
    const node = elNode(id);
    const body = node?.querySelector<HTMLElement>('.el-text-body');
    if (!node || !body) return;
    editingId = id;
    node.classList.add('is-editing');
    try { body.contentEditable = 'plaintext-only'; } catch { body.contentEditable = 'true'; }
    if (body.contentEditable !== 'plaintext-only') body.contentEditable = 'true';
    body.focus();
    const range = document.createRange();
    range.selectNodeContents(body);
    range.collapse(false);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    body.addEventListener('blur', () => stopEditing(), { once: true });
    body.oninput = () => { void saveDraft(id, body.innerText).catch(() => toast('Could not save your text. Check available device storage.')); }; // survives the tab closing mid-sentence
  }

  function stopEditing(keepEmpty = false) {
    const id = editingId;
    if (!id) return;
    editingId = null;
    const node = elNode(id);
    const body = node?.querySelector<HTMLElement>('.el-text-body');
    node?.classList.remove('is-editing');
    if (body) { body.contentEditable = 'false'; body.oninput = null; }
    if (!body || !model(id)?.data.text) return;
    const text = body.innerText.replace(/\n+$/, '');
    if (!text.trim() && !keepEmpty) { deleteElement(id); void flush().then(() => clearDraft(id)).catch(() => {}); return; }
    const fresh = freshText === id;
    freshText = null;
    if (text !== model(id)?.data.text?.content) patchElement(id, { data: { text: { ...model(id)!.data.text!, content: text } } }, 'text:edit', !fresh);
    void flush().then(() => clearDraft(id)).catch(() => {});
  }

  // ── gestures ──
  interface Move { kind: 'move'; id: string; node: HTMLElement; sheet: DOMRect; x0: number; y0: number; px: number; py: number; nx: number; ny: number; moved: boolean; wasSelected: boolean }
  interface Xform { kind: 'xform'; id: string; node: HTMLElement; cx: number; cy: number; a0: number; d0: number; rot0: number; w0: number; size0: number; rot: number; w: number; size: number; changed: boolean }
  const pointers = new Map<number, { x: number; y: number }>();
  let g: Move | Xform | null = null;
  let pinch: Omit<Xform, 'kind' | 'cx' | 'cy' | 'changed'> | null = null;
  let tapStart: { x: number; y: number; t: number } | null = null;
  let lastTap: { x: number; y: number; t: number } | null = null;

  const clampW = (w: number, id: string) => model(id)?.type === 'text' ? 1 : Math.max(.08, Math.min(stage.closest<HTMLElement>('.book')?.dataset.mode === 'spread' ? 2 : 1.4, w));
  const deg = (r: number) => (r * 180) / Math.PI;
  const sizeOf = (id: string) => model(id)?.data.text?.size ?? 1;
  function applyXform(node: HTMLElement, rot: number, w: number, size: number) {
    for (const n of copies(node.dataset.elId!)) {
      n.style.transform = `rotate(${rot}deg)`;
      n.style.width = `${w * 100 * canvasScale(n)}%`;
      n.style.setProperty('--size', String(size));
    }
  }
  function placeCopies(id: string, x: number, y: number) {
    for (const n of copies(id)) {
      n.style.left = `${(x + ghostOffset(n)) * 100 * canvasScale(n)}%`;
      n.style.top = `${y * 100}%`;
    }
  }
  /** may run onto the facing page if there is one (both pages of a spread share the spine) */
  function spineRoom(id: string) {
    if (stage.closest<HTMLElement>('.book')?.dataset.mode === 'single') return { left: 0, right: 0 };
    const doc = getDoc();
    const pages = buildLayout(doc).pages;
    const i = pages.findIndex((p) => p.id === model(id)?.pageId);
    return { left: i % 2 === 1 ? 1 : 0, right: i % 2 === 0 && pages[i + 1] ? 1 : 0 };
  }
  // keep at least 20% of the element on the page
  function clampPos(node: HTMLElement, sheet: DOMRect, x: number, y: number, w: number) {
    const hf = node.getBoundingClientRect().height / (sheet.height || 1);
    const room = spineRoom(node.dataset.elId!);
    return { x: Math.min(1 + room.right - 0.2 * w, Math.max(-room.left - 0.8 * w, x)), y: Math.min(1 - 0.2 * hf, Math.max(-0.8 * hf, y)) };
  }

  stage.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    const page = t.closest<HTMLElement>('.page[data-page-id]');
    const owner = t.closest<HTMLElement>('.el')?.dataset.ownerPage;
    if (owner || page) activePage = owner ?? page?.dataset.pageId;
    if (isBusy() || t.closest('.el-bar')) return;
    keyboardFocus = false;
    const handle = t.closest('.el-knob');
    if (handle) stopEditing(true);
    const hit = handle ? elNode(selectedId) : t.closest<HTMLElement>('.el');
    const node = hit?.dataset.ghost ? elNode(hit.dataset.elId!) ?? hit : hit;
    if (!node) { tapStart = { x: e.clientX, y: e.clientY, t: e.timeStamp }; return; }
    if (node.classList.contains('is-editing')) return; // let the caret/selection work
    const id = node.dataset.elId!;
    const m = model(id);
    if (!m) return;
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (t.closest('.el-knob')) {
      stage.setPointerCapture(e.pointerId);
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      g = { kind: 'xform', id, node, cx, cy, a0: deg(Math.atan2(e.clientY - cy, e.clientX - cx)), d0: Math.hypot(e.clientX - cx, e.clientY - cy), rot0: m.rot, w0: m.w, size0: sizeOf(id), rot: m.rot, w: m.w, size: sizeOf(id), changed: false };
      return;
    }
    if (pointers.size === 2 && g?.kind === 'move' && g.id === id) {
      for (const pointerId of pointers.keys()) stage.setPointerCapture(pointerId);
      const [a, b] = [...pointers.values()];
      pinch = { id, node, a0: deg(Math.atan2(b.y - a.y, b.x - a.x)), d0: Math.hypot(b.x - a.x, b.y - a.y), rot0: m.rot, w0: m.w, size0: sizeOf(id), rot: m.rot, w: m.w, size: sizeOf(id) };
      if (g.moved) moveElement(id, g.nx, g.ny, stage.closest<HTMLElement>('.book')?.dataset.mode === 'spread');
      pinch.node = elNode(id) ?? node;
      g = null;
      return;
    }
    const wasSelected = selectedId === id;
    if (!wasSelected) select(id);
    g = { kind: 'move', id, node, sheet: sheetOf(node).getBoundingClientRect(), x0: m.x, y0: m.y, px: e.clientX, py: e.clientY, nx: m.x, ny: m.y, moved: false, wasSelected };
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      pinch.rot = pinch.rot0 + deg(Math.atan2(b.y - a.y, b.x - a.x)) - pinch.a0;
      const factor = Math.hypot(b.x - a.x, b.y - a.y) / pinch.d0;
      pinch.w = clampW(pinch.w0 * factor, pinch.id);
      pinch.size = pinch.size0 * (model(pinch.id)?.type === 'text' ? Math.max(.05, factor) : pinch.w / pinch.w0);
      applyXform(pinch.node, pinch.rot, pinch.w, pinch.size);
      positionUI();
      return;
    }
    if (!g) return;
    if (g.kind === 'move') {
      if (!g.moved && Math.hypot(e.clientX - g.px, e.clientY - g.py) < 4) return; // tap, not drag
      stage.setPointerCapture(e.pointerId);
      g.moved = true;
      const p = clampPos(g.node, g.sheet, g.x0 + (e.clientX - g.px) / g.sheet.width, g.y0 + (e.clientY - g.py) / g.sheet.height, model(g.id)!.w);
      g.nx = p.x;
      g.ny = p.y;
      placeCopies(g.id, p.x, p.y);
      positionUI();
    } else {
      let rot = g.rot0 + deg(Math.atan2(e.clientY - g.cy, e.clientX - g.cx)) - g.a0;
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      g.rot = rot;
      const factor = Math.hypot(e.clientX - g.cx, e.clientY - g.cy) / g.d0;
      g.w = clampW(g.w0 * factor, g.id);
      g.size = g.size0 * (model(g.id)?.type === 'text' ? Math.max(.05, factor) : g.w / g.w0);
      g.changed = true;
      applyXform(g.node, g.rot, g.w, g.size);
      positionUI();
    }
  });

  /** handwritten caption on polaroid / instant frames */
  function editCaption(cap: HTMLElement, node: HTMLElement) {
    const id = node.dataset.elId!;
    commitCaption?.();
    node = elNode(id) ?? node;
    cap = node.querySelector<HTMLElement>('.frame-caption') ?? cap;
    if (!node.isConnected || !cap.isConnected) return;
    captionEditing = true;
    node.classList.add('is-editing');
    cap.contentEditable = 'plaintext-only';
    cap.focus();
    getSelection()?.selectAllChildren(cap);
    getSelection()?.collapseToEnd();
    const value = () => cap.innerText.replace(/\s+/g, ' ').trim();
    cap.oninput = () => { void saveCaptionDraft(id, value()).catch(() => toast('Could not save your caption. Check available device storage.')); };
    const finish = () => {
      if (commitCaption !== finish) return;
      commitCaption = null;
      captionEditing = false;
      node.classList.remove('is-editing');
      cap.contentEditable = 'false';
      cap.oninput = null;
      const caption = value();
      const photo = model(id)?.data.photo;
      if (photo && caption !== (photo.caption ?? '')) {
        patchElement(id, { data: { photo: { ...photo, caption } } }, 'photo:caption');
        void flush().catch(() => {});
      }
    };
    commitCaption = finish;
    cap.addEventListener('blur', finish, { once: true });
  }

  function commitXform(id: string, rot: number, w: number, size: number) {
    const m = model(id);
    if (!m) return;
    patchElement(id, { rot: Math.round(rot * 10) / 10, w, ...(m.type === 'text' ? { data: { text: { ...m.data.text!, size } } } : {}) }, 'el:transform');
  }

  /** tap on empty paper: deselect; double-tap: new text right there */
  function paperTap(e: PointerEvent) {
    const start = tapStart;
    tapStart = null;
    if (!start || isBusy() || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8 || e.timeStamp - start.t > 400) return;
    const dbl = lastTap && e.timeStamp - lastTap.t < 340 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
    lastTap = dbl ? null : { x: e.clientX, y: e.clientY, t: e.timeStamp };
    if (selectedId || editingId) select(null);
    if (!dbl) return;
    const page = (e.target as HTMLElement).closest<HTMLElement>('.page[data-page-id]');
    const sheet = page?.querySelector('.page-sheet')?.getBoundingClientRect();
    if (!page || !sheet) return;
    pendingEdit = freshText = selectedId = addText(page.dataset.pageId!, { x: (e.clientX - sheet.left) / sheet.width, y: (e.clientY - sheet.top) / sheet.height - 0.02 });
    decorate();
  }

  function release(e: PointerEvent) {
    if (!pointers.delete(e.pointerId)) { if (e.type === 'pointerup') paperTap(e); return; }
    if (pinch) {
      if (pointers.size < 2) { const p = pinch; pinch = null; pointers.clear(); commitXform(p.id, p.rot, p.w, p.size); }
      return;
    }
    const cur = g;
    g = null;
    if (!cur) return;
    if (cur.kind === 'xform') { if (cur.changed) commitXform(cur.id, cur.rot, cur.w, cur.size); return; }
    if (cur.moved) moveElement(cur.id, cur.nx, cur.ny, stage.closest<HTMLElement>('.book')?.dataset.mode === 'spread');
    else if (cur.wasSelected && e.type === 'pointerup' && model(cur.id)?.type === 'text') startEditing(cur.id); // tap selected text to edit
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  stage.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.el-bar [data-cmd]');
    if (!btn || !selectedId) return;
    const id = selectedId;
    const m = model(id);
    const label = m ? elementLabel(m) : 'element';
    const cmd = btn.dataset.cmd;
    stopEditing(cmd === 'font');
    const anchor = stage.querySelector<HTMLElement>(`.el-bar [data-cmd="${cmd}"]`) ?? btn;
    // A commit may replace the toolbar; keep inspectors anchored to its current control.
    if (cmd === 'font') { openFontMenu(id, anchor); return; }
    if (cmd === 'effect') {
      const st = model(id)?.data.sticker;
      if (!st) return;
      const order = ['outline', 'glossy', 'glitter', 'none'] as const;
      const next = order[(order.indexOf(st.effect ?? 'outline') + 1) % order.length];
      patchElement(id, { data: { sticker: { ...st, effect: next } } }, 'sticker:effect');
      announce(`Sticker effect: ${next}`);
      return;
    }
    if (cmd === 'tear') { dispatchEvent(new CustomEvent('mlw:tear', { detail: id })); return; }
    if (cmd === 'frame') { openFrameMenu(id, anchor, (tid) => dispatchEvent(new CustomEvent('mlw:tear', { detail: tid }))); return; }
    if (cmd === 'front' || cmd === 'back') {
      reorder(id, cmd);
      announce(cmd === 'front' ? `Brought ${label} to front` : `Sent ${label} to back`);
    } else if (cmd === 'dup') {
      const copyId = duplicateElement(id);
      select(copyId ?? null);
      if (copyId) {
        const copy = model(copyId);
        if (copy) announce(`Duplicated ${elementLabel(copy)}`);
        if (keyboardFocus) focusEl(copyId);
      }
    } else if (cmd === 'del') {
      removeSelected(keyboardFocus || stage.contains(document.activeElement));
    }
  });
  stage.addEventListener('dblclick', (e) => {
    const cap = (e.target as HTMLElement).closest<HTMLElement>('.frame-caption');
    const capEl = cap?.closest<HTMLElement>('.el');
    if (cap && capEl) { if (!capEl.classList.contains('is-editing')) editCaption(cap, capEl); return; }
    const node = (e.target as HTMLElement).closest<HTMLElement>('.el-text');
    if (node && !node.classList.contains('is-editing')) startEditing(node.dataset.elId!);
  });

  stage.addEventListener('focusin', (e) => {
    if (suppressFocusSelect || isBusy() || editingId || captionEditing) return;
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.el:not([data-ghost])');
    if (!el?.dataset.elId || !visiblePageIds().includes(el.dataset.ownerPage ?? '')) return;
    if (isSingle() && el.closest('.slot-left')) return;
    activePage = el.dataset.ownerPage;
    keyboardFocus = !pointerMode;
    if (selectedId !== el.dataset.elId) {
      select(el.dataset.elId);
      const m = model(el.dataset.elId);
      if (m) announce(`Selected ${elementLabel(m)}`);
    }
  });

  const handledKeys = new WeakSet<Event>();
  function onKeyDown(e: KeyboardEvent) {
    if (handledKeys.has(e) || e.defaultPrevented || isBusy() || document.querySelector('.tear-tool, dialog[open]:not(.sticker-sheet), .frame-menu')) return; // other tools/sheets own the keyboard
    handledKeys.add(e);
    if (captionEditing) {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        const id = selectedId;
        (document.activeElement as HTMLElement | null)?.blur();
        const m = id ? model(id) : undefined;
        if (id && m) {
          keyboardFocus = true;
          focusEl(id);
          announce(`Saved caption for ${elementLabel(m)}`);
        }
      }
      return;
    }
    if (editingId) {
      if (e.key === 'Escape') {
        e.preventDefault();
        const id = editingId;
        (document.activeElement as HTMLElement | null)?.blur();
        const m = model(id);
        if (m) {
          keyboardFocus = true;
          focusEl(id);
          announce(`Finished editing ${elementLabel(m)}`);
        } else {
          stage.tabIndex = -1;
          stage.focus({ preventScroll: true });
          announce('Removed empty text box');
        }
      }
      return;
    }
    const t = (e.target instanceof HTMLElement ? e.target : document.activeElement) as HTMLElement | null;
    if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName ?? ''))) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (document.querySelector('.sticker-sheet[open]')) {
      const history = mod && (k === 'z' || k === 'y');
      const removeSticker = selectedId && model(selectedId)?.type === 'sticker' && (k === 'delete' || k === 'backspace');
      if (!history && !removeSticker) return;
    }
    if (mod && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) { if (canRedo()) { redo(); announce('Redid change'); } else announce('Nothing to redo'); }
      else { if (canUndo()) { undo(); announce('Undid last change'); } else announce('Nothing to undo'); }
      return;
    }
    if (mod && k === 'y') {
      e.preventDefault();
      if (canRedo()) { redo(); announce('Redid change'); } else announce('Nothing to redo');
      return;
    }

    const inBar = !!t?.closest?.('.el-bar');
    if (inBar) {
      const buttons = [...stage.querySelectorAll<HTMLButtonElement>('.el-bar button:not(:disabled)')];
      if (e.key === 'Tab' && e.shiftKey && t === buttons[0] && selectedId) {
        e.preventDefault();
        keyboardFocus = true;
        focusEl(selectedId);
        return;
      }
      if (!mod && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const i = buttons.indexOf(t as HTMLButtonElement);
        const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
        next?.focus({ preventScroll: true });
        return;
      }
      if (e.key === 'Escape' && selectedId) {
        e.preventDefault();
        const m = model(selectedId);
        keyboardFocus = true;
        focusEl(selectedId);
        if (m) announce(`Returned to ${elementLabel(m)}`);
        return;
      }
    }

    const fromStage = !(e.target instanceof HTMLElement) || stage.contains(t);
    if (e.key === 'Tab' && !mod && !e.altKey && !inBar && fromStage) {
      const els = visibleElements();
      if (els.length) {
        const curId = selectedId ?? t?.closest?.<HTMLElement>('.el')?.dataset.elId ?? null;
        const idx = els.findIndex((item) => item.id === curId);
        if (idx < 0) {
          e.preventDefault();
          const nextIdx = e.shiftKey ? els.length - 1 : 0;
          const next = els[nextIdx];
          selectByKeyboard(next.id, `Selected ${elementLabel(next)} (${nextIdx + 1} of ${els.length})`);
          return;
        }
        if (!e.shiftKey && idx === els.length - 1) {
          if (selectedId) {
            const firstBtn = stage.querySelector<HTMLButtonElement>('.el-bar button:not(:disabled)');
            if (firstBtn) { e.preventDefault(); firstBtn.focus({ preventScroll: true }); return; }
          }
        } else if (!(e.shiftKey && idx === 0)) {
          e.preventDefault();
          const nextIdx = idx + (e.shiftKey ? -1 : 1);
          const next = els[nextIdx];
          selectByKeyboard(next.id, `Selected ${elementLabel(next)} (${nextIdx + 1} of ${els.length})`);
          return;
        }
      }
    }

    if (!selectedId) {
      const focusedEl = t?.closest?.<HTMLElement>('.el:not([data-ghost])');
      if (focusedEl?.dataset.elId && (k === 'enter' || e.key === ' ')) {
        e.preventDefault();
        selectByKeyboard(focusedEl.dataset.elId);
        return;
      }
      if (!mod && !e.altKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || (t && stage.contains(t)))) {
        const els = visibleElements();
        if (els.length) {
          e.preventDefault();
          const idx = els.findIndex((item) => item.id === (focusedEl?.dataset.elId ?? null));
          const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
          const nextIdx = idx < 0 ? (forward ? 0 : els.length - 1) : (idx + (forward ? 1 : els.length - 1)) % els.length;
          const next = els[nextIdx];
          selectByKeyboard(next.id, `Selected ${elementLabel(next)} (${nextIdx + 1} of ${els.length})`);
        }
      }
      return;
    }

    if (!inBar && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      const m = model(selectedId);
      const node = elNode(selectedId);
      if (!m || !node) return;
      e.preventDefault();
      keyboardFocus = true;
      if (e.altKey || mod) {
        const sign = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
        if (m.type === 'text') {
          const prevSize = sizeOf(selectedId);
          const step = e.shiftKey ? 0.25 : 0.1;
          const size = Math.round(Math.max(0.25, Math.min(6, prevSize + sign * step)) * 100) / 100;
          if (Math.abs(size - prevSize) < 1e-6) {
            announce(`At ${sign > 0 ? 'maximum' : 'minimum'} text size (${Math.round(size * 100)}%)`);
          } else {
            commitXform(selectedId, m.rot, 1, size);
            announce(`Resized ${elementLabel(model(selectedId) ?? m)} to ${Math.round(size * 100)}% text size`);
          }
        } else {
          const step = e.shiftKey ? 0.12 : 0.04;
          const w = Math.round(clampW(m.w + sign * step, selectedId) * 1000) / 1000;
          if (Math.abs(w - m.w) < 1e-6) {
            announce(`At ${sign > 0 ? 'maximum' : 'minimum'} width (${Math.round(w * 100)}%)`);
          } else {
            commitXform(selectedId, m.rot, w, sizeOf(selectedId));
            announce(`Resized ${elementLabel(model(selectedId) ?? m)} to ${Math.round(w * 100)}% width`);
          }
        }
      } else {
        const step = e.shiftKey ? 0.08 : 0.02;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const p = clampPos(node, sheetOf(node).getBoundingClientRect(), m.x + dx, m.y + dy, m.w);
        if (Math.abs(p.x - m.x) < 1e-6 && Math.abs(p.y - m.y) < 1e-6) {
          announce(`At page edge (${Math.round(m.x * 100)}%, ${Math.round(m.y * 100)}%)`);
        } else {
          moveElement(selectedId, p.x, p.y, !isSingle());
          const updated = model(selectedId) ?? m;
          activePage = updated.pageId;
          announce(`Moved ${elementLabel(updated)} to ${Math.round(updated.x * 100)}%, ${Math.round(updated.y * 100)}%`);
        }
      }
      return;
    }

    if (!inBar && !mod && !e.altKey && (e.key === '[' || e.key === ']')) {
      const m = model(selectedId);
      if (!m) return;
      e.preventDefault();
      keyboardFocus = true;
      const rot = m.rot + (e.key === ']' ? 1 : -1) * (e.shiftKey ? 15 : 5);
      commitXform(selectedId, rot, m.w, sizeOf(selectedId));
      announce(`Rotated ${elementLabel(model(selectedId) ?? m)} to ${Math.round(rot)} degrees`);
      return;
    }

    if (!inBar && !mod && !e.altKey && k === 't' && model(selectedId)?.type === 'photo') {
      const m = model(selectedId)!;
      e.preventDefault();
      keyboardFocus = true;
      dispatchEvent(new CustomEvent('mlw:tear', { detail: selectedId }));
      announce(`Opened tear tool for ${elementLabel(m)}`);
      return;
    }

    if (!inBar && !mod && !e.altKey && e.key === 'F10') {
      if (focusToolbar()) e.preventDefault();
      return;
    }

    if (k === 'delete' || k === 'backspace') {
      e.preventDefault();
      removeSelected(!document.querySelector('.sticker-sheet[open]') && (stage.contains(document.activeElement) || !document.activeElement?.isConnected));
    } else if (mod && k === 'd') {
      e.preventDefault();
      keyboardFocus = true;
      const copyId = duplicateElement(selectedId);
      select(copyId ?? null);
      const copy = copyId ? model(copyId) : undefined;
      if (copy) {
        focusEl(copyId!);
        announce(`Duplicated ${elementLabel(copy)}`);
      }
    } else if (k === 'escape') {
      e.preventDefault();
      const m = model(selectedId);
      const label = m ? elementLabel(m) : 'element';
      const id = selectedId;
      keyboardFocus = false;
      select(null);
      announce(`Deselected ${label}`);
      focusEl(id);
    } else if (k === 'enter' && !inBar) {
      const m = model(selectedId);
      if (m?.type === 'text') {
        e.preventDefault();
        startEditing(selectedId);
        announce('Editing text');
      } else if (m?.type === 'photo' && m.data.photo && frameDef(m.data.photo.frame).caption) {
        const node = elNode(selectedId);
        const cap = node?.querySelector<HTMLElement>('.frame-caption');
        if (node && cap) { e.preventDefault(); editCaption(cap, node); announce('Editing caption'); }
      } else if (focusToolbar()) {
        e.preventDefault();
      }
    }
  }
  addEventListener('keydown', onKeyDown);
  stage.addEventListener('keydown', onKeyDown);

  // drop photos where they land; paste goes to the active page
  stage.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  stage.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length && !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    const hit = (e.target as HTMLElement).closest<HTMLElement>('.el');
    const pageAtPoint = visiblePageIds().map((id) => stage.querySelector<HTMLElement>(`.slot .page[data-page-id="${id}"]`)!).find((p) => {
      const r = p.querySelector('.page-sheet')!.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    const page = pageAtPoint ?? (e.target as HTMLElement).closest<HTMLElement>('.page[data-page-id]') ?? (hit?.dataset.ownerPage ? stage.querySelector<HTMLElement>(`.slot .page[data-page-id="${hit.dataset.ownerPage}"]`) : null);
    const sheet = page?.querySelector('.page-sheet')?.getBoundingClientRect();
    const at = sheet ? { x: (e.clientX - sheet.left) / sheet.width, y: (e.clientY - sheet.top) / sheet.height } : undefined;
    void api.addPhotos(files, page?.dataset.pageId, at);
  });
  addEventListener('paste', (e) => {
    const t = e.target as HTMLElement;
    if (isBusy() || document.querySelector('dialog[open], .tear-tool, .frame-menu') || t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName)) return;
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); void api.addPhotos(files); }
  });

  const api: CanvasApi = {
    decorate,
    commitEditing() {
      if (captionEditing) (document.activeElement as HTMLElement | null)?.blur();
      commitCaption?.();
      stopEditing();
    },
    activePageId,
    async addPhotos(files, pageId = activePageId(), at) {
      if (!pageId || isBusy()) return;
      stopEditing();
      let i = 0;
      let failed = 0;
      let unsupported = 0;
      const base = onPage(pageId); // cascade so new photos don't land exactly on older ones
      for (const f of files) {
        if (!f.type.startsWith('image/')) { unsupported++; continue; }
        const spot = at ? { x: at.x + i * 0.04, y: at.y + i * 0.04 } : { x: 0.5 + ((base + i) % 5) * 0.05 - 0.1, y: 0.22 + ((base + i) % 5) * 0.06 };
        try { selectedId = await addPhoto(pageId, f, spot); i++; }
        catch { failed++; }
      }
      decorate();
      const messages = [];
      if (failed) messages.push(`${failed} image${failed === 1 ? '' : 's'} could not be added. Try a JPG or PNG, or free up device storage.`);
      if (unsupported) messages.push(`${unsupported} unsupported file${unsupported === 1 ? '' : 's'} skipped. Only images can be added.`);
      if (messages.length) toast(messages.join(' '));
    },
    addTextHere() {
      const pageId = activePageId();
      if (!pageId || isBusy()) return;
      stopEditing();
      const n = onPage(pageId);
      pendingEdit = freshText = selectedId = addText(pageId, { x: 0.5, y: 0.12 + (n % 10) * 0.08 });
      decorate();
    },
    addStickerHere(stickerId, aspect) {
      const pageId = activePageId();
      if (!pageId || isBusy()) return;
      stopEditing();
      const n = onPage(pageId);
      selectedId = addSticker(pageId, stickerId, aspect, { x: 0.3 + (n % 4) * 0.13, y: 0.18 + (n % 5) * 0.12 });
      decorate();
    },
    deselect: () => select(null),
  };
  addEventListener('pagehide', () => api.commitEditing());
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') api.commitEditing(); });
  return api;
}
