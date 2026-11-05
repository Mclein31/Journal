/* Page canvas interactions (Phase 4): select, move, scale+rotate (corner knob or pinch),
   edit text, double-tap paper for new text, drop/paste photos, keyboard shortcuts.
   Live gestures move the DOM directly; the store gets ONE update on release (one undo step). */
import { flush, getDoc, redo, undo } from '../state/store';
import { addPhoto, addSticker, addText, deleteElement, duplicateElement, moveElement, patchElement, reorder } from './elements';
import { buildLayout } from '../book/layout';
import { closeFrameMenu, openFrameMenu } from '../frames/FrameMenu';
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

  // an item running past the spine has a carried-over copy on the facing page ([data-ghost])
  const elNode = (id: string | null) =>
    id ? stage.querySelector<HTMLElement>(`.el[data-el-id="${id}"]:not([data-ghost])`) ?? stage.querySelector<HTMLElement>(`.el[data-el-id="${id}"]`) : null;
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

  function select(id: string | null) {
    if (id !== selectedId) { closeFrameMenu(); closeFontMenu(); }
    if (editingId && editingId !== id) stopEditing();
    selectedId = id;
    decorate();
  }

  function decorate() {
    stage.querySelectorAll('.el.is-selected').forEach((n) => n.classList.remove('is-selected'));
    stage.querySelectorAll('.el-ui').forEach((n) => n.remove());
    const node = elNode(selectedId);
    if (!node) {
      if (selectedId && !model(selectedId)) selectedId = null; // deleted / undone away
      return;
    }
    node.classList.add('is-selected');
    const knob = document.createElement('button');
    knob.type = 'button';
    knob.className = 'el-ui el-knob';
    knob.setAttribute('aria-label', 'Resize and rotate');
    const bar = document.createElement('div');
    bar.className = 'el-ui el-bar';
    const isPhoto = model(selectedId!)?.type === 'photo';
    const isSticker = model(selectedId!)?.type === 'sticker';
    const isText = model(selectedId!)?.type === 'text';
    const isTorn = isPhoto && model(selectedId!)?.data.photo?.frame === 'torn';
    bar.innerHTML = `${isText ? '<button type="button" data-cmd="font" aria-label="Font and ink" title="Font">Aa</button>' : ''}${isPhoto ? '<button type="button" data-cmd="frame" aria-label="Frame" title="Frame">🖼</button>' : ''}${isTorn ? '<button type="button" data-cmd="tear" aria-label="Tear more" title="Tear">✂</button>' : ''}${isSticker ? '<button type="button" data-cmd="effect" aria-label="Sticker effect" title="Effect">✨</button>' : ''}
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

  const clampW = (w: number, _id: string) => Math.max(.08, Math.min(stage.closest<HTMLElement>('.book')?.dataset.mode === 'spread' ? 2 : 1.4, w));
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
    const hf = node.getBoundingClientRect().height / sheet.height;
    const room = spineRoom(node.dataset.elId!);
    return { x: Math.min(1 + room.right - 0.2 * w, Math.max(-room.left - 0.8 * w, x)), y: Math.min(1 - 0.2 * hf, Math.max(-0.8 * hf, y)) };
  }

  stage.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    const page = t.closest<HTMLElement>('.page[data-page-id]');
    const owner = t.closest<HTMLElement>('.el')?.dataset.ownerPage;
    if (owner || page) activePage = owner ?? page?.dataset.pageId;
    if (isBusy() || t.closest('.el-bar')) return;
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
      pinch.size = pinch.size0 * (pinch.w / pinch.w0);
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
      g.size = g.size0 * (g.w / g.w0);
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
      return;
    }
    if (cmd === 'tear') { dispatchEvent(new CustomEvent('mlw:tear', { detail: id })); return; }
    if (cmd === 'frame') { openFrameMenu(id, anchor, (tid) => dispatchEvent(new CustomEvent('mlw:tear', { detail: tid }))); return; }
    if (cmd === 'front' || cmd === 'back') reorder(id, cmd);
    else if (cmd === 'dup') select(duplicateElement(id) ?? null);
    else if (cmd === 'del') { selectedId = null; deleteElement(id); }
  });
  stage.addEventListener('dblclick', (e) => {
    const cap = (e.target as HTMLElement).closest<HTMLElement>('.frame-caption');
    const capEl = cap?.closest<HTMLElement>('.el');
    if (cap && capEl) { if (!capEl.classList.contains('is-editing')) editCaption(cap, capEl); return; }
    const node = (e.target as HTMLElement).closest<HTMLElement>('.el-text');
    if (node && !node.classList.contains('is-editing')) startEditing(node.dataset.elId!);
  });

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || isBusy() || document.querySelector('.tear-tool, dialog[open]:not(.sticker-sheet), .frame-menu')) return; // other tools/sheets own the keyboard
    if (captionEditing) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); } return; }
    if (editingId) { if (e.key === 'Escape') (document.activeElement as HTMLElement | null)?.blur(); return; }
    const t = e.target as HTMLElement;
    if (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (document.querySelector('.sticker-sheet[open]')) {
      const history = mod && (k === 'z' || k === 'y');
      const removeSticker = selectedId && model(selectedId)?.type === 'sticker' && (k === 'delete' || k === 'backspace');
      if (!history && !removeSticker) return;
    }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (!selectedId) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); const id = selectedId; selectedId = null; deleteElement(id); }
    else if (mod && k === 'd') { e.preventDefault(); select(duplicateElement(selectedId) ?? null); }
    else if (k === 'escape') select(null);
    else if (k === 'enter' && model(selectedId)?.type === 'text') { e.preventDefault(); startEditing(selectedId); }
  });

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
