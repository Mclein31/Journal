/* Page-turn animation.
   Each turning leaf carries its own perspective() so leaves are flattened into the stage
   and stacked by z-index (not 3D depth sorting) — avoids iOS Safari z-fighting.
   The 90° point is pinned to the middle of the timeline so we know exactly when a leaf
   crosses the spine and must be raised above leaves that landed before it. */

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
}

const PERSPECTIVE = 'perspective(2400px)';

function makeLeaf(faces: LeafFaces): HTMLElement {
  const leaf = document.createElement('div');
  leaf.className = 'leaf';
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

export async function turnLeaves(req: FlipRequest): Promise<void> {
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
  stage.querySelectorAll('.leaf').forEach((l) => l.remove());
}

/** A leaf turned by hand. set(p) follows the pointer (p: 0 = not turned, 1 = fully turned);
    finish() animates the rest of the way (or back) from wherever the finger let go. */
export interface DragLeaf {
  set(progress: number): void;
  finish(complete: boolean, fullDurationMs?: number): Promise<void>;
}

export function dragLeaf(stage: HTMLElement, faces: LeafFaces, dir: 1 | -1, fade?: 'in' | 'out'): DragLeaf {
  const leaf = makeLeaf(faces);
  const from = dir === 1 ? 0 : -180;
  const to = dir === 1 ? -180 : 0;
  const shades = [...leaf.querySelectorAll<HTMLElement>('.leaf-shade')];
  const faceEls = [...leaf.querySelectorAll<HTMLElement>('.leaf-face')];
  let p = 0;

  const paint = (progress: number) => {
    p = Math.max(0, Math.min(1, progress));
    leaf.style.transform = `${PERSPECTIVE} rotateY(${from + (to - from) * p}deg)`;
    leaf.style.zIndex = p < 0.5 ? '50' : '100'; // crossing the spine
    const shade = String(0.32 * Math.sin(p * Math.PI));
    for (const s of shades) s.style.opacity = shade;
    if (fade) {
      const o = fade === 'out' ? (p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3) : p > 0.25 ? 1 : p / 0.25;
      for (const f of faceEls) f.style.opacity = String(o);
    }
  };
  paint(0);
  stage.appendChild(leaf);

  return {
    set: paint,
    finish(complete, fullDurationMs = 650) {
      const start = p;
      const end = complete ? 1 : 0;
      const ms = Math.max(160, Math.abs(end - start) * fullDurationMs);
      const t0 = performance.now();
      // rAF-driven so the leaf continues smoothly from the exact angle the finger left it at
      return new Promise((resolve) => {
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out: it was already moving
          paint(start + (end - start) * eased);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
  };
}
