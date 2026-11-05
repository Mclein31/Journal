/* Paper turns use a deforming DOM mesh and an interruptible release spring.
   Each leaf shares one projection and stacks independently of the next leaf.
   Rigid covers retain their original WAAPI midpoint, synchronized with the board opening. */
import { bindAssetImage } from '../sync/assetUrls';
import { facetMatrix, paperGrid, springState, unit, type PaperPose } from './pageCurl';

export interface LeafFaces {
  front: HTMLElement;
  back: HTMLElement;
}

export interface FlipRequest {
  stage: HTMLElement;
  dir: 1 | -1;
  /** in turn order: index 0 turns first */
  leaves: LeafFaces[];
  durationMs: number;
  staggerMs: number;
  /** fade the leaf in at the start / out at the end (single-page cover swinging past the book edge) */
  fade?: 'in' | 'out';
  /** A single paper turn can be caught again while it is settling. */
  onLeaf?: (controller: DragLeaf) => void;
}

const PERSPECTIVE = 'perspective(2400px)';

function makeLeaf(faces: LeafFaces): HTMLElement {
  const leaf = document.createElement('div');
  leaf.className = 'leaf';
  leaf.setAttribute('aria-hidden', 'true');
  const front = document.createElement('div');
  front.className = 'leaf-face leaf-front';
  front.append(faces.front, shade());
  const back = document.createElement('div');
  back.className = 'leaf-face leaf-back';
  back.append(faces.back, shade());
  leaf.append(front, back);
  return leaf;
}

function shade(): HTMLElement {
  const s = document.createElement('div');
  s.className = 'leaf-shade';
  return s;
}

async function turnRigidLeaves(req: FlipRequest): Promise<void> {
  const { stage, dir, leaves, durationMs, staggerMs, fade } = req;
  const from = dir === 1 ? 0 : -180;
  const to = dir === 1 ? -180 : 0;
  const nodes = leaves.map((faces, i) => {
    const leaf = makeLeaf(faces);
    // the first leaf to turn starts on top of its stack (right stack forward, left stack back)
    leaf.style.zIndex = String(50 - i);
    leaf.style.transform = `${PERSPECTIVE} rotateY(${from}deg)`;
    stage.appendChild(leaf);
    return leaf;
  });

  const runs = nodes.map((leaf, i) => {
    const delay = i * staggerMs;
    const anim = leaf.animate(
      [
        { transform: `${PERSPECTIVE} rotateY(${from}deg)`, easing: 'cubic-bezier(.45,0,.75,.4)' },
        { transform: `${PERSPECTIVE} rotateY(-90deg) scaleY(1.015)`, offset: 0.5, easing: 'cubic-bezier(.25,.6,.35,1)' },
        { transform: `${PERSPECTIVE} rotateY(${to}deg)` },
      ],
      { duration: durationMs, delay, fill: 'forwards' },
    );
    if (fade) {
      const frames = fade === 'in' ? [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }];
      // fade the faces, not the leaf: opacity < 1 on the preserve-3d leaf would flatten it and
      // break backface-visibility (the turned-away side would show through)
      for (const face of leaf.querySelectorAll<HTMLElement>('.leaf-face')) face.animate(frames, { duration: durationMs, delay, fill: 'forwards' });
    }
    for (const s of leaf.querySelectorAll<HTMLElement>('.leaf-shade')) {
      s.animate([{ opacity: 0 }, { opacity: 0.32, offset: 0.5 }, { opacity: 0 }], { duration: durationMs, delay, fill: 'forwards' });
    }
    // crossing the spine (exactly 50%): raise above every leaf that landed before it.
    // On the animation timeline, not a timer, so it can't drift from the rotation.
    leaf.animate(
      [{ zIndex: 50 - i }, { zIndex: 50 - i, offset: 0.5 }, { zIndex: 100 + i, offset: 0.5 }, { zIndex: 100 + i }],
      { duration: durationMs, delay, fill: 'both' },
    );
    return anim.finished;
  });

  // caller swaps the static pages, then calls clearLeaves()
  await Promise.all(runs);
}

export function clearLeaves(stage: HTMLElement): void {
  stage.querySelectorAll<HTMLElement>('.leaf').forEach((leaf) => { const controller = controllers.get(leaf); if (controller) controller.destroy(); else leaf.remove(); });
  stage.querySelectorAll('.leaf-floor-shadow').forEach((shadow) => shadow.remove());
}

/** A leaf turned by hand. set(p) follows the pointer (p: 0 = not turned, 1 = fully turned);
    finish() animates the rest of the way (or back) from wherever the finger let go. */
export interface DragLeaf {
  readonly grab: { x: number; y: number };
  resize(): void;
  destroy(): void;
  set(progress: number, pullY?: number): void;
  /** live finger tracking: at most one paint per frame, eased toward the pointer (paper has a little weight) */
  follow(progress: number, pullY?: number): void;
  hold(): { progress: number; pullY: number };
  finish(complete: boolean, fullDurationMs?: number, velocity?: number, delayMs?: number): Promise<boolean>;
}

interface PaperOptions { grab?: { x: number; y: number }; riffle?: boolean; stackIndex?: number }
const controllers = new WeakMap<HTMLElement, DragLeaf>();
const TILE_BLEED = .45; // Subpixel overlap avoids antialiasing cracks between independently painted faces.

function copyPage(source: HTMLElement): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement;
  // cloneNode does not copy image-load listeners or promises attached to the original page.
  copy.querySelectorAll<HTMLImageElement>('img[data-asset-id]').forEach((img) => {
    img.addEventListener('load', () => {
      const paper = img.closest<HTMLElement>('.sticker-paper');
      if (paper && img.src) { paper.style.setProperty('--sticker-mask', `url("${img.src}")`); paper.classList.add('has-texture'); }
    });
    if (!img.getAttribute('src')) bindAssetImage(img, img.dataset.assetId!);
  });
  return copy;
}

interface Tile { face: HTMLElement; content: HTMLElement; col: number; row: number; back: boolean }
function sizeTile(tile: Tile, width: number, height: number, cols: number, rows: number) {
  const b = TILE_BLEED, w = width / cols, h = height / rows, fw = w + 2 * b, fh = h + 2 * b;
  // A plain rectangle: the paper model keeps every strip flat, so no clip-path (a GPU mask per face).
  Object.assign(tile.face.style, { inset: 'auto', left: `${-b}px`, top: `${-b}px`, width: `${fw}px`, height: `${fh}px` });
  const sourceCol = tile.back ? cols - 1 - tile.col : tile.col;
  for (const node of [tile.content]) Object.assign(node.style, {
    inset: 'auto', left: `${b - sourceCol * w}px`, top: `${b - tile.row * h}px`, width: `${width}px`, height: `${height}px`,
  });
}

/** Lambert-style brightness for a strip normal; flat (facing the viewer) = exactly 1. */
const LIGHT = (() => { const l = Math.hypot(-.35, -.25, 1); return { x: -.35 / l, y: -.25 / l, z: 1 / l }; })();
function lightFor(nx: number, ny: number, nz: number): string {
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // the back face is the side being seen
  const dot = nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z;
  // Half-Lambert: paper scatters light, so a turning sheet dims softly instead of going grey, and
  // neighbouring strips differ by a percent or two (no visible bands between them).
  const b = Math.max(.8, Math.min(1.04, .78 + .24 * (dot / LIGHT.z)));
  return b > .9985 && b < 1.0015 ? '' : `brightness(${b.toFixed(3)})`;
}

function paperRenderer(stage: HTMLElement, faces: LeafFaces, dir: 1 | -1, fade: 'in' | 'out' | undefined, options: PaperOptions) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const leaf = reduced ? makeLeaf(faces) : document.createElement('div');
  leaf.className = reduced ? 'leaf leaf-reduced' : 'leaf leaf-paper';
  leaf.setAttribute('aria-hidden', 'true');
  stage.appendChild(leaf);
  let width = Math.max(1, leaf.offsetWidth), height = Math.max(1, leaf.offsetHeight);
  const grab = { x: unit(options.grab?.x ?? .92), y: unit(options.grab?.y ?? .5) };
  leaf.dataset.grabX = String(grab.x); leaf.dataset.grabY = String(grab.y);
  // Full-height flat strips (see paperPoint): one rectangle per strip, front + back face each.
  // Many narrow strips keep the curl round and the per-strip lighting steps invisible.
  const cols = options.riffle ? 10 : 24, rows = 1;
  const facets: { node: HTMLElement; col: number; row: number; faces: HTMLElement[]; lit: string }[] = [];
  const faceEls: HTMLElement[] = [];
  const tiles: Tile[] = [];
  let shadow: HTMLElement | undefined;
  if (!reduced) {
    leaf.style.transform = PERSPECTIVE;
    leaf.style.setProperty('--grab-y', `${grab.y * 100}%`);
    shadow = document.createElement('div');
    shadow.className = 'leaf-floor-shadow'; shadow.setAttribute('aria-hidden', 'true');
    if (stage.closest<HTMLElement>('.book')?.dataset.mode === 'single') shadow.dataset.single = '';
    stage.insertBefore(shadow, leaf);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const facet = document.createElement('div');
      facet.className = 'leaf-facet';
      facet.style.width = `${width / cols}px`; facet.style.height = `${height / rows}px`;
      const pair: HTMLElement[] = [];
      for (const back of [false, true]) {
        const face = document.createElement('div');
        face.className = `leaf-face leaf-facet-face ${back ? 'leaf-back' : 'leaf-front'}`;
        face.style.transform = back ? 'rotateY(180deg) translateZ(.025px)' : 'translateZ(.025px)';
        const content = copyPage(back ? faces.back : faces.front);
        const tile = { face, content, col, row, back };
        sizeTile(tile, width, height, cols, rows); tiles.push(tile);
        face.append(content); facet.appendChild(face);
        faceEls.push(face); pair.push(face);
      }
      leaf.appendChild(facet); facets.push({ node: facet, col, row, faces: pair, lit: '' });
    }
  } else {
    faceEls.push(...leaf.querySelectorAll<HTMLElement>('.leaf-face'));
    leaf.querySelector<HTMLElement>('.leaf-back')!.style.display = 'none';
  }
  let lastProgress = 0, lastPull = 0, lastZ = '', lastOpacity = '', lastSide = '';
  const paint = (progress: number, pullY: number) => {
    lastProgress = progress; lastPull = pullY;
    const p = unit(progress), flex = Math.sin(p * Math.PI);
    const stack = options.stackIndex ?? 0;
    leaf.dataset.progress = String(p);
    // only touch what changed: every style write costs a style/compositor update per frame
    const z = String(p < .5 ? 50 - stack : 100 + stack);
    if (z !== lastZ) { leaf.style.zIndex = z; lastZ = z; }
    if (reduced) {
      leaf.style.transform = 'none';
      leaf.querySelector<HTMLElement>('.leaf-front')!.style.opacity = String(dir === 1 ? 1 - p : p);
      return;
    }
    const pose: PaperPose = { progress: p, dir, width, height, grab, pullY };
    const grid = paperGrid(pose, cols, rows);
    const normals: number[][] = [];
    for (const facet of facets) {
      const { col, row } = facet;
      const matrix = facetMatrix([grid[row][col], grid[row][col + 1], grid[row + 1][col], grid[row + 1][col + 1]], false, width / cols, height / rows);
      facet.node.style.transform = `matrix3d(${matrix.map((n) => n.toFixed(5)).join(',')})`;
      normals.push([matrix[8], matrix[9], matrix[10]]);
    }
    // Paper lighting (light from upper-left). Each strip is lit from its neighbours' averaged angle,
    // so brightness ramps smoothly across the curl instead of stepping strip by strip.
    // filter on the composited face = no repaint.
    facets.forEach((facet, i) => {
      const a = normals[Math.max(0, i - 1)], b = normals[i], c = normals[Math.min(normals.length - 1, i + 1)];
      const lit = lightFor(.25 * a[0] + .5 * b[0] + .25 * c[0], .25 * a[1] + .5 * b[1] + .25 * c[1], .25 * a[2] + .5 * b[2] + .25 * c[2]);
      if (lit !== facet.lit) { facet.lit = lit; for (const f of facet.faces) f.style.filter = lit; }
    });
    if (shadow) {
      // The lifted leaf shades the page it hovers over, from the spine out to its projected edge.
      const side = (p < .5) === (dir === 1) ? 'right' : 'left';
      if (side !== lastSide) { shadow.dataset.side = side; lastSide = side; }
      shadow.style.opacity = (.5 * flex).toFixed(3);
      shadow.style.transform = `scaleX(${Math.min(1, Math.abs(Math.cos(Math.PI * p)) + .1).toFixed(4)})`;
    }
    if (fade) {
      const opacity = (fade === 'out' ? 1 - unit((p - .75) / .25) : unit(p / .2)).toFixed(3);
      if (opacity !== lastOpacity) { lastOpacity = opacity; for (const face of faceEls) face.style.opacity = opacity; }
    }
  };
  const resize = () => {
    const nextWidth = Math.max(1, leaf.offsetWidth), nextHeight = Math.max(1, leaf.offsetHeight);
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth; height = nextHeight;
    for (const { node } of facets) { node.style.width = `${width / cols}px`; node.style.height = `${height / rows}px`; }
    for (const tile of tiles) sizeTile(tile, width, height, cols, rows);
    paint(lastProgress, lastPull);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(leaf);
  return { leaf, reduced, paint, grab, resize, destroy() { observer.disconnect(); shadow?.remove(); leaf.remove(); } };
}

export function dragLeaf(stage: HTMLElement, faces: LeafFaces, dir: 1 | -1, fade?: 'in' | 'out', options: PaperOptions = {}): DragLeaf {
  const renderer = paperRenderer(stage, faces, dir, fade, options);
  let p = 0, pull = 0;
  let settling: { frame: number; resolve: (finished: boolean) => void } | null = null;
  // follow(): pointer events can arrive several times per frame (120Hz trackpads, 1000Hz mice).
  // They only move the target; one rAF loop eases the drawn page toward it.
  const FOLLOW_TAU = .045; // seconds: smooths jitter, still feels attached to the finger
  let target = { p: 0, pull: 0 };
  let followFrame = 0, followLast = 0;
  const stopFollow = () => { if (followFrame) cancelAnimationFrame(followFrame); followFrame = 0; followLast = 0; };
  const stopSettle = () => { if (settling) { cancelAnimationFrame(settling.frame); settling.resolve(false); settling = null; } };
  const hold = () => {
    stopSettle();
    stopFollow();
    return { progress: p, pullY: pull };
  };
  const followStep = (now: number) => {
    const dt = followLast ? Math.min(.05, (now - followLast) / 1000) : 1 / 60;
    followLast = now;
    const k = 1 - Math.exp(-dt / FOLLOW_TAU);
    const np = p + (target.p - p) * k, npull = pull + (target.pull - pull) * k;
    const done = Math.abs(target.p - np) < .0004 && Math.abs(target.pull - npull) < .0004;
    paint(done ? target.p : np, done ? target.pull : npull);
    followFrame = done ? 0 : requestAnimationFrame(followStep);
    if (done) followLast = 0;
  };
  const paint = (progress: number, pullY: number) => { p = unit(progress); pull = Math.max(-.35, Math.min(.35, pullY)); renderer.paint(p, pull); };
  paint(0, 0);
  const controller: DragLeaf = {
    grab: renderer.grab,
    resize: renderer.resize,
    destroy() { hold(); renderer.destroy(); },
    hold,
    set(progress, pullY = 0) { hold(); paint(progress, pullY); },
    follow(progress, pullY = 0) {
      stopSettle();
      target = { p: unit(progress), pull: Math.max(-.35, Math.min(.35, pullY)) };
      if (!followFrame) followFrame = requestAnimationFrame(followStep);
    },
    finish(complete, fullDurationMs = 700, velocity = 0, delayMs = 0) {
      hold();
      const start = p, startPull = pull, end = complete ? 1 : 0;
      const duration = renderer.reduced ? 140 : fullDurationMs;
      const response = Math.max(.16, duration / 1000 * .55);
      const initialVelocity = renderer.reduced ? 0 : Math.max(-6, Math.min(6, velocity));
      const t0 = performance.now() + delayMs;
      return new Promise<boolean>((resolve) => {
        const job = { frame: 0, resolve };
        settling = job;
        const step = (now: number) => {
          if (settling !== job) return;
          const t = (now - t0) / 1000;
          if (t < 0) { job.frame = requestAnimationFrame(step); return; }
          const state = springState(start, end, initialVelocity, t, response);
          paint(state.value, springState(startPull, 0, 0, t, response).value);
          if ((Math.abs(state.value - end) < .0005 && Math.abs(state.velocity) < .008) || t > duration / 1000 * 1.6 || (complete ? state.value >= 1 : state.value <= 0)) {
            paint(end, 0); settling = null; resolve(true);
          } else job.frame = requestAnimationFrame(step);
        };
        job.frame = requestAnimationFrame(step);
      });
    },
  };
  controllers.set(renderer.leaf, controller);
  return controller;
}

export async function turnLeaves(req: FlipRequest): Promise<boolean> {
  if (req.leaves.some((faces) => faces.front.classList.contains('cover-face') || faces.back.classList.contains('cover-face'))) {
    await turnRigidLeaves(req);
    return true;
  }
  const leaves = req.leaves.map((faces, i) => dragLeaf(req.stage, faces, req.dir, req.fade, {
    grab: { x: .94, y: i % 2 ? .3 : .7 }, riffle: req.leaves.length > 1, stackIndex: i,
  }));
  if (leaves.length === 1) req.onLeaf?.(leaves[0]);
  return (await Promise.all(leaves.map((leaf, i) => leaf.finish(true, req.durationMs, 0, i * req.staggerMs)))).every(Boolean);
}
