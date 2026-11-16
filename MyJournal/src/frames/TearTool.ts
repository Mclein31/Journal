/* Freehand tear tool (Phase 6). Drag across the photo → ragged tear → tap the piece to keep.
   Repeat for more tears. Non-destructive: only the kept polygon (photo units) is saved. */
import { getDoc } from '../state/store';
import { patchElement } from '../canvas/elements';
import { bindAssetImage } from '../sync/assetUrls';
import { playFlip } from '../audio/paper';
import { FULL, presetCut, roughen, simplify, split, type Pt } from './tear';

const poly = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(',')})`;
const svgPts = (pts: Pt[]) => pts.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ');

function pointInPoly([px, py]: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function edgeDist([px, py]: Pt, pts: Pt[]): number {
  let min = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-9)));
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < min) min = d;
  }
  return min;
}

function labelPoint(pts: Pt[]): Pt {
  if (!pts.length) return [0.5, 0.5];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  let best: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  let bestDist = pointInPoly(best, pts) ? edgeDist(best, pts) : -1;
  for (let gx = 1; gx <= 5; gx++) {
    for (let gy = 1; gy <= 5; gy++) {
      const candidate: Pt = [minX + ((maxX - minX) * gx) / 6, minY + ((maxY - minY) * gy) / 6];
      if (!pointInPoly(candidate, pts)) continue;
      const d = edgeDist(candidate, pts);
      if (d > bestDist) { bestDist = d; best = candidate; }
    }
  }
  return best;
}

export function openTearTool(elId: string): void {
  const el = getDoc().elements.find((e) => e.id === elId);
  const photo = el?.data.photo;
  if (!photo) return;

  const ui = document.createElement('div');
  ui.className = 'tear-tool';
  ui.setAttribute('role', 'dialog');
  ui.setAttribute('aria-label', 'Tear photo');
  ui.setAttribute('aria-modal', 'true');
  ui.innerHTML = `
    <p class="tt-hint" aria-live="polite">Drag across the photo or press Tear edge (T)</p>
    <div class="tt-stage">
      <img class="tt-img" alt="" draggable="false" />
      <svg class="tt-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <polygon class="tt-piece tt-a" data-piece="0"></polygon>
        <polygon class="tt-piece tt-b" data-piece="1"></polygon>
        <polyline class="tt-line"></polyline>
        <g class="tt-label-wrap tt-label-0" style="display:none"><text class="tt-piece-label" x="0" y="0">1</text></g>
        <g class="tt-label-wrap tt-label-1" style="display:none"><text class="tt-piece-label" x="0" y="0">2</text></g>
      </svg>
    </div>
    <div class="tt-controls">
      <label class="tt-rough">Roughness <input type="range" min="0" max="1" step="0.05" value="0.55" /></label>
      <div class="tt-buttons">
        <button type="button" data-tt="cut" aria-label="Tear edge">✂ Tear edge</button>
        <button type="button" data-tt="keep-0" hidden>Keep piece 1</button>
        <button type="button" data-tt="keep-1" hidden>Keep piece 2</button>
        <button type="button" data-tt="undo">↶ Undo tear</button>
        <button type="button" data-tt="reset">Reset</button>
        <button type="button" data-tt="cancel">Cancel</button>
        <button type="button" data-tt="done" class="tt-primary">Done</button>
      </div>
    </div>`;
  document.body.appendChild(ui);

  const $ = <T extends Element>(s: string) => ui.querySelector<T>(s)!;
  const img = $<HTMLImageElement>('.tt-img');
  const stageEl = $<HTMLElement>('.tt-stage');
  const hint = $<HTMLElement>('.tt-hint');
  const line = $<SVGPolylineElement>('.tt-line');
  const pieceEls = [$<SVGPolygonElement>('.tt-a'), $<SVGPolygonElement>('.tt-b')];
  const labelEls = [$<SVGGElement>('.tt-label-0'), $<SVGGElement>('.tt-label-1')];
  const rough = $<HTMLInputElement>('.tt-rough input');
  img.dataset.assetId = photo.assetId;
  bindAssetImage(img, photo.assetId);
  stageEl.style.aspectRatio = String(photo.aspect || 1);
  stageEl.style.setProperty('--a', String(photo.aspect || 1));

  let shape: Pt[] = photo.clip ?? FULL;
  const history: Pt[][] = [];
  let stroke: Pt[] = [];
  let pending: { smooth: Pt[]; seed: number; pieces: [Pt[], Pt[]] } | null = null;
  let cutStep = 0;

  function keepPiece(index: 0 | 1) {
    if (!pending) return;
    history.push(shape);
    shape = pending.pieces[index];
    pending = null;
    stroke = [];
    playFlip(0, 320, 0.8);
    draw(`Kept piece ${index + 1} — press Tear edge to tear again, or Done`);
  }

  function startKeyboardCut() {
    const cut = presetCut(shape, Number(rough.value), cutStep++);
    if (!cut) return;
    stroke = [];
    pending = cut;
    draw('Choose a piece (1 or 2), or press Tear edge for another angle');
  }

  function draw(status?: string) {
    img.style.clipPath = poly(shape);
    line.setAttribute('points', svgPts(stroke));
    pieceEls.forEach((p, i) => {
      p.setAttribute('points', pending ? svgPts(pending.pieces[i]) : '');
      p.style.display = pending ? '' : 'none';
      if (pending) {
        const [lx, ly] = labelPoint(pending.pieces[i]);
        labelEls[i].setAttribute('transform', `translate(${lx.toFixed(4)} ${ly.toFixed(4)}) scale(0.007)`);
        labelEls[i].style.display = '';
      } else {
        labelEls[i].style.display = 'none';
      }
    });
    if (!pending) delete ui.dataset.preview;
    ui.classList.toggle('is-picking', !!pending);
    hint.textContent = status ?? (pending ? 'Tap the piece you want to keep, or press 1 or 2' : history.length ? 'Tear again, or press Done' : 'Drag across the photo or press Tear edge (T)');
    const cutBtn = $<HTMLButtonElement>('[data-tt="cut"]');
    cutBtn.textContent = pending ? '✂ Another angle' : '✂ Tear edge';
    cutBtn.setAttribute('aria-label', pending ? 'Try another tear angle' : 'Tear edge');
    $<HTMLButtonElement>('[data-tt="keep-0"]').hidden = !pending;
    $<HTMLButtonElement>('[data-tt="keep-1"]').hidden = !pending;
    $<HTMLButtonElement>('[data-tt="undo"]').disabled = !history.length && !pending;
    $<HTMLButtonElement>('[data-tt="done"]').disabled = !!pending;
    const active = document.activeElement as HTMLElement | null;
    if (active && ui.contains(active) && (active.hasAttribute('hidden') || (active as HTMLButtonElement).disabled)) {
      (pending ? $<HTMLButtonElement>('[data-tt="keep-0"]') : cutBtn).focus({ preventScroll: true });
    }
  }

  function recut() {
    if (!pending) return;
    const pieces = split(shape, roughen(pending.smooth, Number(rough.value), pending.seed));
    if (pieces) pending.pieces = pieces;
    draw();
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const close = () => { ui.remove(); removeEventListener('keydown', onKey); (previousFocus?.isConnected ? previousFocus : document.querySelector<HTMLElement>(`.el[data-el-id="${elId}"]:not([data-ghost]), .el-bar [data-cmd="frame"]`))?.focus({ preventScroll: true }); };
  const toUnits = (e: PointerEvent): Pt => {
    const r = stageEl.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  stageEl.addEventListener('pointerdown', (e) => {
    const piece = (e.target as Element).closest('.tt-piece');
    if (pending && piece) {
      keepPiece(Number(piece.getAttribute('data-piece')) as 0 | 1);
      return;
    }
    if (pending) return;
    stageEl.setPointerCapture(e.pointerId);
    stroke = [toUnits(e)];
    draw();
  });
  stageEl.addEventListener('pointermove', (e) => {
    if (!stageEl.hasPointerCapture(e.pointerId)) return;
    stroke.push(toUnits(e));
    line.setAttribute('points', svgPts(stroke));
  });
  stageEl.addEventListener('pointerup', (e) => {
    if (!stageEl.hasPointerCapture(e.pointerId)) return;
    const len = stroke.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - stroke[i - 1][0], p[1] - stroke[i - 1][1]) : 0), 0);
    if (len < 0.12) { stroke = []; draw(); hint.textContent = 'Drag further across the photo'; return; }
    const smooth = simplify(stroke);
    const seed = Math.floor(Math.random() * 1e9);
    const pieces = split(shape, roughen(smooth, Number(rough.value), seed));
    stroke = [];
    if (!pieces) { draw(); hint.textContent = 'That missed — drag across the photo'; return; }
    pending = { smooth, seed, pieces };
    draw();
  });

  rough.addEventListener('input', recut);

  const controls = ui.querySelector('.tt-controls')!;
  for (const idx of ['0', '1'] as const) {
    const btn = $<HTMLButtonElement>(`[data-tt="keep-${idx}"]`);
    const show = () => { if (pending) ui.dataset.preview = idx; };
    const hide = () => { if (ui.dataset.preview === idx) delete ui.dataset.preview; };
    btn.addEventListener('focus', show);
    btn.addEventListener('blur', hide);
    btn.addEventListener('pointerenter', show);
    btn.addEventListener('pointerleave', hide);
  }
  controls.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tt]')?.dataset.tt;
    if (act === 'cut') {
      startKeyboardCut();
    } else if (act === 'keep-0') {
      keepPiece(0);
    } else if (act === 'keep-1') {
      keepPiece(1);
    } else if (act === 'undo') {
      if (pending) { pending = null; draw('Canceled cut preview'); }
      else if (history.length) { shape = history.pop()!; draw('Undid tear'); }
    } else if (act === 'reset') {
      pending = null;
      if (shape !== FULL) { history.push(shape); shape = FULL; }
      draw('Reset to full photo');
    } else if (act === 'cancel') {
      close();
      dispatchEvent(new CustomEvent('mlw:announce', { detail: 'Canceled tear' }));
    } else if (act === 'done' && !pending) {
      const current = getDoc().elements.find((x) => x.id === elId)?.data.photo ?? photo;
      patchElement(elId, { data: { photo: { ...current, frame: 'torn', clip: shape === FULL ? undefined : shape } } }, 'photo:tear');
      close();
      dispatchEvent(new CustomEvent('mlw:announce', { detail: 'Applied torn edge to photo' }));
    }
  });

  const handled = new WeakSet<Event>();
  function onKey(e: KeyboardEvent) {
    if (handled.has(e)) return;
    handled.add(e);
    if (e.key === 'Tab') {
      const items = [...ui.querySelectorAll<HTMLElement>('button:not(:disabled):not([hidden]), input')];
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
      return;
    }
    if (pending && (e.key === '1' || e.key === '2')) {
      e.preventDefault();
      keepPiece(e.key === '1' ? 0 : 1);
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      startKeyboardCut();
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (pending) { pending = null; draw('Canceled cut preview'); }
    else { close(); dispatchEvent(new CustomEvent('mlw:announce', { detail: 'Canceled tear' })); }
  }
  addEventListener('keydown', onKey);
  ui.addEventListener('keydown', onKey);
  draw();
  rough.focus({ preventScroll: true });
}
