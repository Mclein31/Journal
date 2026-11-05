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

interface Tile { face: HTMLElement; content: HTMLElement; light: HTMLElement; col: number; row: number; back: boolean; second: boolean }
function sizeTile(tile: Tile, width: number, height: number, cols: number, rows: number) {
  const b = TILE_BLEED, w = width / cols, h = height / rows, fw = w + 2 * b, fh = h + 2 * b;
  Object.assign(tile.face.style, { inset: 'auto', left: `${-b}px`, top: `${-b}px`, width: `${fw}px`, height: `${fh}px` });
  const points = tile.second ? [[fw, -2 * b * h / w], [fw, fh], [-2 * b * w / h, fh]] : [[0, 0], [fw + 2 * b * w / h, 0], [0, fh + 2 * b * h / w]];
  tile.face.style.clipPath = `polygon(${points.map(([x, y]) => `${tile.back ? fw - x : x}px ${y}px`).join(',')})`;
  const sourceCol = tile.back ? cols - 1 - tile.col : tile.col;
  for (const node of [tile.content, tile.light]) Object.assign(node.style, {
    inset: 'auto', left: `${b - sourceCol * w}px`, top: `${b - tile.row * h}px`, width: `${width}px`, height: `${height}px`,
  });
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
  const cols = options.riffle ? 4 : 6, rows = options.riffle ? 2 : 3;
  const facets: { node: HTMLElement; col: number; row: number; second: boolean }[] = [];
  const lights: HTMLElement[] = [];
  const faceEls: HTMLElement[] = [];
  const tiles: Tile[] = [];
  let shadow: HTMLElement | undefined;
  if (!reduced) {
    leaf.style.transform = PERSPECTIVE;
    leaf.style.setProperty('--grab-y', `${grab.y * 100}%`);
    shadow = document.createElement('div');
    shadow.className = 'leaf-floor-shadow'; shadow.setAttribute('aria-hidden', 'true');
    shadow.style.transformOrigin = dir === 1 ? 'left center' : 'right center';
    shadow.style.left = stage.closest<HTMLElement>('.book')?.dataset.mode === 'single' ? '0' : dir === 1 ? '50%' : '0';
    stage.insertBefore(shadow, leaf);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) for (const second of [false, true]) {
      const facet = document.createElement('div');
      facet.className = 'leaf-facet';
      facet.style.width = `${width / cols}px`; facet.style.height = `${height / rows}px`;
      for (const back of [false, true]) {
        const face = document.createElement('div');
        face.className = `leaf-face leaf-facet-face ${back ? 'leaf-back' : 'leaf-front'}`;
        face.style.transform = back ? 'rotateY(180deg) translateZ(.025px)' : 'translateZ(.025px)';
        const content = copyPage(back ? faces.back : faces.front);
        const light = shade();
        light.style.setProperty('--grab-x', `${(back ? 1 - grab.x : grab.x) * 100}%`);
        const tile = { face, content, light, col, row, back, second };
        sizeTile(tile, width, height, cols, rows); tiles.push(tile);
        face.append(content, light); facet.appendChild(face);
        faceEls.push(face); lights.push(light);
      }
      leaf.appendChild(facet); facets.push({ node: facet, col, row, second });
    }
  } else {
    faceEls.push(...leaf.querySelectorAll<HTMLElement>('.leaf-face'));
    leaf.querySelector<HTMLElement>('.leaf-back')!.style.display = 'none';
  }
  let lastProgress = 0, lastPull = 0;
  const paint = (progress: number, pullY: number) => {
    lastProgress = progress; lastPull = pullY;
    const p = unit(progress), flex = Math.sin(p * Math.PI);
    const stack = options.stackIndex ?? 0;
    leaf.dataset.progress = String(p);
    leaf.style.zIndex = String(p < .5 ? 50 - stack : 100 + stack);
    if (reduced) {
      leaf.style.transform = 'none';
      leaf.querySelector<HTMLElement>('.leaf-front')!.style.opacity = String(dir === 1 ? 1 - p : p);
      return;
    }
    const pose: PaperPose = { progress: p, dir, width, height, grab, pullY };
    const grid = paperGrid(pose, cols, rows);
    for (const facet of facets) {
      const { col, row } = facet;
      const matrix = facetMatrix([grid[row][col], grid[row][col + 1], grid[row + 1][col], grid[row + 1][col + 1]], facet.second, width / cols, height / rows);
      facet.node.style.transform = `matrix3d(${matrix.map((n) => n.toFixed(7)).join(',')})`;
    }
    for (const light of lights) light.style.opacity = String(.38 * flex);
    if (shadow) { shadow.style.opacity = String(.24 * flex); shadow.style.transform = `scaleX(${.3 + .7 * flex})`; }
    const opacity = fade === 'out' ? 1 - unit((p - .75) / .25) : fade === 'in' ? unit(p / .2) : 1;
    for (const face of faceEls) face.style.opacity = String(opacity);
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
  const hold = () => {
    if (settling) { cancelAnimationFrame(settling.frame); settling.resolve(false); settling = null; }
    return { progress: p, pullY: pull };
  };
  const paint = (progress: number, pullY: number) => { p = unit(progress); pull = Math.max(-.35, Math.min(.35, pullY)); renderer.paint(p, pull); };
  paint(0, 0);
  const controller: DragLeaf = {
    grab: renderer.grab,
    resize: renderer.resize,
    destroy() { hold(); renderer.destroy(); },
    hold,
    set(progress, pullY = 0) { hold(); paint(progress, pullY); },
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
