/* Freehand tear tool (Phase 6). Drag across the photo → ragged tear → tap the piece to keep.
   Repeat for more tears. Non-destructive: only the kept polygon (photo units) is saved. */
import { getDoc } from '../state/store';
import { patchElement } from '../canvas/elements';
import { bindAssetImage } from '../sync/assetUrls';
import { playFlip } from '../audio/paper';
import { FULL, roughen, simplify, split, type Pt } from './tear';

const poly = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(',')})`;
const svgPts = (pts: Pt[]) => pts.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ');

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
    <p class="tt-hint" aria-live="polite">Drag across the photo to tear it</p>
    <div class="tt-stage">
      <img class="tt-img" alt="" draggable="false" />
      <svg class="tt-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <polygon class="tt-piece tt-a" data-piece="0"></polygon>
        <polygon class="tt-piece tt-b" data-piece="1"></polygon>
        <polyline class="tt-line"></polyline>
      </svg>
    </div>
    <div class="tt-controls">
      <label class="tt-rough">Roughness <input type="range" min="0" max="1" step="0.05" value="0.55" /></label>
      <div class="tt-buttons">
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
  const rough = $<HTMLInputElement>('.tt-rough input');
  img.dataset.assetId = photo.assetId;
  bindAssetImage(img, photo.assetId);
  stageEl.style.aspectRatio = String(photo.aspect || 1);
  stageEl.style.setProperty('--a', String(photo.aspect || 1));

  let shape: Pt[] = photo.clip ?? FULL;
  const history: Pt[][] = [];
  let stroke: Pt[] = [];
  let pending: { smooth: Pt[]; seed: number; pieces: [Pt[], Pt[]] } | null = null;

  function draw() {
    img.style.clipPath = poly(shape);
    line.setAttribute('points', svgPts(stroke));
    pieceEls.forEach((p, i) => {
      p.setAttribute('points', pending ? svgPts(pending.pieces[i]) : '');
      p.style.display = pending ? '' : 'none';
    });
    ui.classList.toggle('is-picking', !!pending);
    hint.textContent = pending ? 'Tap the piece you want to keep' : history.length ? 'Tear again, or press Done' : 'Drag across the photo to tear it';
    $<HTMLButtonElement>('[data-tt="undo"]').disabled = !history.length && !pending;
    $<HTMLButtonElement>('[data-tt="done"]').disabled = !!pending;
  }

  function recut() {
    if (!pending) return;
    const pieces = split(shape, roughen(pending.smooth, Number(rough.value), pending.seed));
    if (pieces) pending.pieces = pieces;
    draw();
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const close = () => { ui.remove(); removeEventListener('keydown', onKey); (previousFocus?.isConnected ? previousFocus : document.querySelector<HTMLElement>('.el-bar [data-cmd="frame"]'))?.focus({ preventScroll: true }); };
  const toUnits = (e: PointerEvent): Pt => {
    const r = stageEl.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  stageEl.addEventListener('pointerdown', (e) => {
    const piece = (e.target as Element).closest('.tt-piece');
    if (pending && piece) {
      // keep the tapped piece
      history.push(shape);
      shape = pending.pieces[Number(piece.getAttribute('data-piece'))];
      pending = null;
      stroke = [];
      playFlip(0, 320, 0.8);
      draw();
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

  ui.querySelector('.tt-controls')!.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tt]')?.dataset.tt;
    if (act === 'undo') {
      if (pending) pending = null;
      else if (history.length) shape = history.pop()!;
      draw();
    } else if (act === 'reset') {
      pending = null;
      if (shape !== FULL) { history.push(shape); shape = FULL; }
      draw();
    } else if (act === 'cancel') {
      close();
    } else if (act === 'done' && !pending) {
      const current = getDoc().elements.find((x) => x.id === elId)?.data.photo ?? photo;
      patchElement(elId, { data: { photo: { ...current, frame: 'torn', clip: shape === FULL ? undefined : shape } } }, 'photo:tear');
      close();
    }
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      const controls = [...ui.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
      if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0]?.focus(); }
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (pending) { pending = null; draw(); } else close();
  }
  addEventListener('keydown', onKey);
  draw();
  rough.focus({ preventScroll: true });
}
