/* Tear geometry (Phase 6): turn a freehand drag into a ragged paper tear and split the photo shape.
   All coordinates are photo units (0..1 = the photo's width/height). */
import polygonClipping, { type Polygon, type Ring } from 'polygon-clipping';

export type Pt = [number, number];
export const FULL: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Ramer–Douglas–Peucker: drop jitter from the raw pointer path. */
export function simplify(pts: Pt[], eps = 0.012): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSeg(pts[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  if (max < eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Seeded PRNG so moving the roughness slider reshapes the same tear instead of re-randomizing. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/** Midpoint displacement: paper fibers, not a vector line. roughness ≈ 0..1 */
export function roughen(pts: Pt[], roughness: number, seed: number): Pt[] {
  const rand = rng(seed);
  let out = pts;
  for (let depth = 0; depth < 5; depth++) {
    const next: Pt[] = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const [a, b] = [out[i - 1], out[i]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const amp = len * 0.28 * roughness * (depth < 2 ? 1 : 0.7);
      const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
      const r = rand() * amp;
      next.push([(a[0] + b[0]) / 2 + nx * r, (a[1] + b[1]) / 2 + ny * r], b);
    }
    out = next;
  }
  return out;
}

/** Push both ends far outside the photo along their end directions so the cut fully crosses it. */
function extend(pts: Pt[]): Pt[] {
  const far = (p: Pt, q: Pt): Pt => {
    const dx = p[0] - q[0], dy = p[1] - q[1];
    const l = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / l) * 4, p[1] + (dy / l) * 4];
  };
  return [far(pts[0], pts[1]), ...pts, far(pts[pts.length - 1], pts[pts.length - 2])];
}

/** One side of the cut: the cut line closed around a big box (clockwise from its end back to its start). */
function sideOf(cut: Pt[]): Ring {
  const B = 8;
  const low = 0.5 - B, high = 0.5 + B;
  const corners: Pt[] = [[low, low], [high, low], [high, high], [low, high]];
  const toBox = (p: Pt): Pt => {
    const s = B / Math.max(Math.abs(p[0] - 0.5), Math.abs(p[1] - 0.5), 1e-9);
    return [0.5 + (p[0] - 0.5) * s, 0.5 + (p[1] - 0.5) * s];
  };
  const perim = ([x, y]: Pt) => (Math.abs(y - low) < 1e-6 ? (x - low) / (2 * B) : Math.abs(x - high) < 1e-6 ? 1 + (y - low) / (2 * B) : Math.abs(y - high) < 1e-6 ? 2 + (high - x) / (2 * B) : 3 + (high - y) / (2 * B));
  const s = toBox(cut[0]), e = toBox(cut[cut.length - 1]);
  const ts = perim(s), te = perim(e);
  const walk: Pt[] = [];
  for (let k = 1; k <= 4; k++) {
    const t = (Math.floor(te) + k) % 4; // corner k steps after e, clockwise
    const dist = (t - te + 4) % 4, total = (ts - te + 4) % 4;
    if (dist > 1e-9 && dist < total - 1e-9) walk.push(corners[t]);
  }
  return [s, ...cut, e, ...walk, s] as Ring;
}

const biggest = (mp: Polygon[]): Pt[] | null => {
  let best: Pt[] | null = null, area = 0;
  for (const poly of mp) {
    const ring = poly[0] as Pt[];
    const a = Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    if (a > area) { area = a; best = ring; }
  }
  return best && area > 0.002 ? best : null;
};

/** Split `shape` along the (already roughened) cut. Returns the two pieces, or null if it didn't cross. */
export function split(shape: Pt[], cut: Pt[]): [Pt[], Pt[]] | null {
  if (cut.length < 2) return null;
  // the stroke must actually touch the photo (its extension alone shouldn't tear anything)
  if (!cut.some(([x, y]) => x > -0.02 && x < 1.02 && y > -0.02 && y < 1.02)) return null;
  const side = sideOf(extend(cut));
  const poly: Polygon = [[...shape, shape[0]] as Ring];
  const a = biggest(polygonClipping.intersection(poly, [side]));
  const b = biggest(polygonClipping.difference(poly, [side]));
  return a && b ? [a, b] : null;
}

const PRESET_CUTS: [Pt, Pt][] = [
  [[0.62, 0], [1, 0.38]],
  [[0, 0.64], [0.36, 1]],
  [[0, 0.34], [0.34, 0]],
  [[0.64, 1], [1, 0.64]],
  [[0, 0.16], [1, 0.12]],
  [[0, 0.86], [1, 0.82]],
];

const ringArea = (ring: Pt[]) =>
  Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/** Deterministic keyboard-friendly cut across `shape`'s bounding box. */
export function presetCut(shape: Pt[] = FULL, roughness = 0.55, step = 0): { smooth: Pt[]; seed: number; pieces: [Pt[], Pt[]] } | null {
  const baseArea = ringArea(shape);
  const xs = shape.map((p) => p[0]);
  const ys = shape.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);
  const mapPt = ([x, y]: Pt): Pt => [minX + x * spanX, minY + y * spanY];
  const minPiece = Math.max(0.002, baseArea * 0.04);

  for (let i = 0; i < PRESET_CUTS.length; i++) {
    const idx = (step + i) % PRESET_CUTS.length;
    const smooth = PRESET_CUTS[idx].map(mapPt);
    const seed = (101 + idx * 97) >>> 0;
    const pieces = split(shape, roughen(smooth, roughness, seed));
    if (pieces) {
      const a0 = ringArea(pieces[0]), a1 = ringArea(pieces[1]);
      if (Math.min(a0, a1) > minPiece && Math.max(a0, a1) < baseArea - 0.002) return { smooth, seed, pieces };
    }
  }

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (const [k, smooth] of ([
    [[minX, cy], [maxX, cy]],
    [[cx, minY], [cx, maxY]],
  ] as [Pt, Pt][]).entries()) {
    const seed = (701 + ((step + k) % 6) * 97) >>> 0;
    const pieces = split(shape, roughen(smooth, roughness, seed));
    if (pieces) return { smooth, seed, pieces };
  }
  return null;
}

/** Apply a non-destructive ragged tear to `shape` and keep the larger piece. */
export function presetTear(shape: Pt[] = FULL, roughness = 0.55, step = 0): Pt[] {
  const cut = presetCut(shape, roughness, step);
  if (!cut) return shape;
  const [a, b] = cut.pieces;
  return ringArea(a) >= ringArea(b) ? a : b;
}
