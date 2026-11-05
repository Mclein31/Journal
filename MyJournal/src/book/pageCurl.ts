/* Paper surface math, independent of DOM/layout. The spine stays fixed while the
   bend concentrates around the original grab point, then relaxes onto the stack. */
export interface Point3 { x: number; y: number; z: number }
export interface PaperPose {
  progress: number;
  dir: 1 | -1;
  width: number;
  height: number;
  grab: { x: number; y: number };
  pullY?: number;
}

export const unit = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function paperPoint(x: number, y: number, pose: PaperPose): Point3 {
  const p = unit(pose.progress);
  const forward = pose.dir === 1;
  if (p === 0 || p === 1) return { x: x * pose.width * ((forward ? p === 0 : p === 1) ? 1 : -1), y: y * pose.height, z: 0 };
  const angle = Math.PI * (forward ? p : 1 - p);
  const flex = Math.sin(Math.PI * p);
  const nearGrabY = Math.exp(-Math.pow((y - unit(pose.grab.y)) / .38, 2));
  let px = 0, pz = 0;
  const steps = 20;
  const dx = x / steps;
  for (let i = 0; i < steps; i++) {
    const at = (i + .5) * dx;
    const nearGrabX = Math.exp(-Math.pow((at - unit(pose.grab.x)) / .44, 2));
    const tangent = angle + pose.dir * .72 * flex * nearGrabY * nearGrabX;
    px += Math.cos(tangent) * dx * pose.width;
    pz += Math.sin(tangent) * dx * pose.width;
  }
  const nearGrabX = Math.exp(-Math.pow((x - unit(pose.grab.x)) / .44, 2));
  const pull = Math.max(-.35, Math.min(.35, pose.pullY ?? 0));
  return {
    x: px,
    y: y * pose.height + pull * pose.height * flex * Math.pow(x, 1.4) * nearGrabY,
    z: pz + .07 * pose.width * flex * x * nearGrabX * nearGrabY,
  };
}

/** The visible mesh must obey the pointer constraint, not just its flat reference plane. */
export function paperGrid(pose: PaperPose, cols = 6, rows = 3, perspective = 2400): Point3[][] {
  const grid = Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: cols + 1 }, (_, col) => paperPoint(col / cols, row / rows, pose)));
  const gx = unit(pose.grab.x), gy = unit(pose.grab.y);
  if (gx < .001) return grid; // The spine itself remains pinned.
  const col = Math.min(cols - 1, Math.floor(gx * cols)), row = Math.min(rows - 1, Math.floor(gy * rows));
  const u = gx * cols - col, v = gy * rows - row;
  const [a, b, c, d] = [grid[row][col], grid[row][col + 1], grid[row + 1][col], grid[row + 1][col + 1]];
  const point = { x: 0, y: 0, z: 0 };
  const weights = u + v <= 1 ? [[a, 1 - u - v], [b, u], [c, v]] as const : [[b, 1 - v], [c, 1 - u], [d, u + v - 1]] as const;
  for (const [vertex, weight] of weights) for (const axis of ['x', 'y', 'z'] as const) point[axis] += vertex[axis] * weight;
  const p = unit(pose.progress), projection = 1 - point.z / perspective;
  const targetX = pose.dir * gx * pose.width * Math.cos(Math.PI * p);
  const targetY = gy * pose.height + Math.max(-.35, Math.min(.35, pose.pullY ?? 0)) * pose.height * Math.sin(Math.PI * p);
  const dx = targetX * projection - point.x;
  const dy = pose.height / 2 + (targetY - pose.height / 2) * projection - point.y;
  // This weight is affine within every facet: its value at the grab is exactly one.
  return grid.map((line) => line.map((vertex, col) => ({ x: vertex.x + dx * (col / cols) / gx, y: vertex.y + dy * (col / cols) / gx, z: vertex.z })));
}

/** Two affine triangles share the same four vertices, so adjacent patches meet exactly. */
export function facetMatrix(corners: [Point3, Point3, Point3, Point3], second: boolean, width: number, height: number): number[] {
  const [a, b, c, d] = corners;
  const origin = second ? { x: b.x + c.x - d.x, y: b.y + c.y - d.y, z: b.z + c.z - d.z } : a;
  const u = second ? { x: (d.x - c.x) / width, y: (d.y - c.y) / width, z: (d.z - c.z) / width } : { x: (b.x - a.x) / width, y: (b.y - a.y) / width, z: (b.z - a.z) / width };
  const v = second ? { x: (d.x - b.x) / height, y: (d.y - b.y) / height, z: (d.z - b.z) / height } : { x: (c.x - a.x) / height, y: (c.y - a.y) / height, z: (c.z - a.z) / height };
  const normal = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  return [u.x, u.y, u.z, 0, v.x, v.y, v.z, 0, normal.x / length, normal.y / length, normal.z / length, 0, origin.x, origin.y, origin.z, 1];
}

/** Convert the grabbed point's horizontal travel into a rotation, without snapping to an edge. */
export function dragProgress(distance: number, width: number, grabX: number, startProgress = 0): number {
  const cosine = Math.cos(Math.PI * unit(startProgress)) - distance / (Math.max(1, width) * Math.max(.12, unit(grabX)));
  return Math.acos(Math.max(-1, Math.min(1, cosine))) / Math.PI;
}

/** Critically damped release: continuous position/velocity, with no rubbery page bounce. */
export function springState(start: number, target: number, velocity: number, elapsedSeconds: number, response = .45): { value: number; velocity: number } {
  const omega = 2 * Math.PI / Math.max(.08, response);
  const t = Math.max(0, elapsedSeconds);
  const delta = start - target;
  const carry = velocity + omega * delta;
  const decay = Math.exp(-omega * t);
  return { value: target + (delta + carry * t) * decay, velocity: (velocity - omega * carry * t) * decay };
}
