import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

// Exercise actual production geometry without DOM, projection, or animation stubs.
const geometry = new vm.SourceTextModule(stripTypeScriptTypes(
  await readFile(new URL('../src/book/pageCurl.ts', import.meta.url), 'utf8'),
));
await geometry.link(() => { throw new Error('Paper geometry must stay independent of browser modules'); });
await geometry.evaluate();
const { paperPoint, paperGrid, facetMatrix, dragProgress, springState } = geometry.namespace;

const close = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) <= 1e-6,
  `${label}: expected ${expected}, received ${actual}`);
const pointClose = (actual, expected, label = '') => {
  for (const axis of ['x', 'y', 'z']) close(actual[axis], expected[axis], `${label}.${axis}`);
};
const pose = (progress, dir = 1, grab = { x: .85, y: .25 }, pullY = .13) => ({
  progress, dir, width: 360, height: 520, grab, pullY,
});
const transform = (m, x, y) => ({
  x: m[0] * x + m[4] * y + m[12],
  y: m[1] * x + m[5] * y + m[13],
  z: m[2] * x + m[6] * y + m[14],
});
const corners = (p, col, row, cols = 6, rows = 3) => [
  paperPoint(col / cols, row / rows, p),
  paperPoint((col + 1) / cols, row / rows, p),
  paperPoint(col / cols, (row + 1) / rows, p),
  paperPoint((col + 1) / cols, (row + 1) / rows, p),
];

test('paper endpoints are flat and reverse direction lands on the opposite page', () => {
  for (const dir of [1, -1]) for (const progress of [0, 1]) {
    const p = pose(progress, dir);
    const sign = dir === 1 ? 1 - 2 * progress : 2 * progress - 1;
    for (const x of [0, .2, .65, 1]) for (const y of [0, .4, 1]) {
      pointClose(paperPoint(x, y, p), { x: x * p.width * sign, y: y * p.height, z: 0 });
    }
  }
});

test('the complete spine stays fixed throughout forward and backward bends', () => {
  for (const dir of [1, -1]) for (const progress of [0, .15, .499, .5, .501, .85, 1]) {
    const p = pose(progress, dir);
    for (let row = 0; row <= 12; row++) {
      const y = row / 12;
      pointClose(paperPoint(0, y, p), { x: 0, y: y * p.height, z: 0 });
    }
  }
});

test('paper bends like a developable sheet: full-height strips stay flat, and grab height and pull mirror cleanly', () => {
  const flat = (a, b, c, d, label) => {
    // A full-height strip is a parallelogram (d = b + c - a), so it renders as one unclipped rectangle.
    pointClose(d, { x: b.x + c.x - a.x, y: b.y + c.y - a.y, z: b.z + c.z - a.z }, label);
  };
  for (const dir of [1, -1]) for (const progress of [.08, .3, .5, .71, .93]) {
    const p = pose(progress, dir, { x: .8, y: .2 }, .17);
    for (let col = 0; col < 24; col++) {
      const [x0, x1] = [col / 24, (col + 1) / 24];
      flat(paperPoint(x0, 0, p), paperPoint(x1, 0, p), paperPoint(x0, 1, p), paperPoint(x1, 1, p), `strip ${col}`);
    }
    const grid = paperGrid(p, 24, 1);
    for (let col = 0; col < 24; col++) flat(grid[0][col], grid[0][col + 1], grid[1][col], grid[1][col + 1], `constrained strip ${col}`);
  }
  for (const dir of [1, -1]) {
    const top = pose(.42, dir, { x: .8, y: .15 }, -.2);
    const bottom = pose(.42, dir, { x: .8, y: .85 }, .2);
    assert.ok(Math.abs(paperPoint(.9, .15, top).y - paperPoint(.9, .15, bottom).y) > 1,
      'changing the grab height and pull must visibly move the free edge');
    for (const x of [.1, .5, 1]) for (const y of [0, .2, .5, .8, 1]) {
      const a = paperPoint(x, y, top);
      const b = paperPoint(x, 1 - y, bottom);
      pointClose(a, { x: b.x, y: top.height - b.y, z: b.z });
    }
  }
});

test('each affine triangle maps its actual three vertices, including the second triangle', () => {
  for (const dir of [1, -1]) for (const progress of [0, .499, .5, .501, 1]) {
    const p = pose(progress, dir), w = p.width / 6, h = p.height / 3;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      const c = corners(p, col, row);
      const a = facetMatrix(c, false, w, h), b = facetMatrix(c, true, w, h);
      for (const matrix of [a, b]) {
        assert.equal(matrix.length, 16);
        assert.ok(matrix.every(Number.isFinite), 'matrix must stay finite as the page crosses the spine');
      }
      pointClose(transform(a, 0, 0), c[0]);
      pointClose(transform(a, w, 0), c[1]);
      pointClose(transform(a, 0, h), c[2]);
      pointClose(transform(b, w, 0), c[1]);
      pointClose(transform(b, 0, h), c[2]);
      pointClose(transform(b, w, h), c[3]);
      for (const t of [0, .2, .5, .8, 1]) {
        pointClose(transform(a, w * (1 - t), h * t), transform(b, w * (1 - t), h * t), 'shared diagonal');
      }
    }
  }
});

test('neighboring mesh cells meet along their complete common boundary', () => {
  for (const dir of [1, -1]) for (const progress of [0, .499, .5, .501, 1]) {
    const p = pose(progress, dir), w = p.width / 6, h = p.height / 3;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      const here = corners(p, col, row);
      const second = facetMatrix(here, true, w, h);
      if (col < 5) {
        const next = facetMatrix(corners(p, col + 1, row), false, w, h);
        for (const t of [0, .25, .5, .75, 1]) pointClose(transform(second, w, t * h), transform(next, 0, t * h), 'vertical seam');
      }
      if (row < 2) {
        const next = facetMatrix(corners(p, col, row + 1), false, w, h);
        for (const t of [0, .25, .5, .75, 1]) pointClose(transform(second, t * w, h), transform(next, t * w, 0), 'horizontal seam');
      }
    }
  }
});

test('drag progress follows grabbed-point travel and reverses continuously from an existing angle', () => {
  const width = 360;
  for (const grabX of [.2, .5, 1]) {
    close(dragProgress(0, width, grabX), 0);
    close(dragProgress(2 * width * grabX, width, grabX), 1);
    close(dragProgress(width * grabX, width, grabX), .5);
    for (const start of [.1, .35, .7, .9]) {
      close(dragProgress(0, width, grabX, start), start);
      const delta = .02 * width * grabX; // Stay inside the endpoints; clamping loses travel information.
      const pulled = dragProgress(delta, width, grabX, start);
      assert.ok(pulled > start);
      close(dragProgress(-delta, width, grabX, pulled), start);
    }
    close(dragProgress(-10 * width, width, grabX), 0);
    close(dragProgress(10 * width, width, grabX), 1);
  }
  assert.ok(Number.isFinite(dragProgress(20, 0, 0)), 'near-spine or temporarily unmeasured drags stay finite');
});

test('release spring inherits exact position and velocity and settles in either direction', () => {
  for (const [start, target, velocity] of [[.2, 1, 1.7], [.8, 0, -1.7], [.4, 0, .6], [.6, 1, -.6]]) {
    const initial = springState(start, target, velocity, 0);
    close(initial.value, start);
    close(initial.velocity, velocity);
    const dt = 1e-6;
    const derivative = (step) => (springState(start, target, velocity, step).value - initial.value) / step;
    close(2 * derivative(dt / 2) - derivative(dt), velocity, 'initial derivative');
    for (const elapsed of [.016, .1, .3, .8, 2]) {
      const state = springState(start, target, velocity, elapsed);
      assert.ok(Number.isFinite(state.value) && Number.isFinite(state.velocity));
    }
    const settled = springState(start, target, velocity, 2);
    close(settled.value, target);
    close(settled.velocity, 0);
  }
});

function gridCorners(grid, col, row) {
  return [grid[row][col], grid[row][col + 1], grid[row + 1][col], grid[row + 1][col + 1]];
}
function materialPoint(grid, grab, width, height, cols, rows) {
  const col = Math.min(cols - 1, Math.floor(grab.x * cols));
  const row = Math.min(rows - 1, Math.floor(grab.y * rows));
  const x = grab.x * cols - col, y = grab.y * rows - row;
  const w = width / cols, h = height / rows;
  const matrix = facetMatrix(gridCorners(grid, col, row), x + y > 1, w, h);
  return transform(matrix, x * w, y * h);
}
function projected(point, height, perspective = 2400) {
  const divisor = 1 - point.z / perspective;
  return { x: point.x / divisor, y: height / 2 + (point.y - height / 2) / divisor };
}

test('rendered grid keeps the actual faceted grab on the pointer through bending and perspective', () => {
  assert.equal(typeof paperGrid, 'function');
  for (const dir of [1, -1]) for (const progress of [.15, .5, .85]) {
    for (const grab of [{ x: .94, y: .13 }, { x: .73, y: .88 }, { x: .4, y: .5 }]) {
      for (const pullY of [-.2, 0, .2]) for (const [cols, rows] of [[6, 3], [4, 2]]) {
        const p = pose(progress, dir, grab, pullY);
        const grid = paperGrid(p, cols, rows, 2400);
        const actual = projected(materialPoint(grid, grab, p.width, p.height, cols, rows), p.height);
        close(actual.x, dir * grab.x * p.width * Math.cos(Math.PI * progress), 'projected grab x');
        close(actual.y, grab.y * p.height + pullY * p.height * Math.sin(Math.PI * progress), 'projected grab y');
      }
    }
  }
});

test('grab-constrained grids preserve every spine vertex and both flat endpoints', () => {
  assert.equal(typeof paperGrid, 'function');
  for (const dir of [1, -1]) for (const progress of [0, .15, .499, .5, .501, .85, 1]) {
    const p = pose(progress, dir, { x: .73, y: .13 }, .2);
    const grid = paperGrid(p, 6, 3, 2400);
    assert.equal(grid.length, 4);
    for (let row = 0; row <= 3; row++) {
      assert.equal(grid[row].length, 7);
      pointClose(grid[row][0], { x: 0, y: row / 3 * p.height, z: 0 }, 'anchored spine');
      for (let col = 0; col <= 6; col++) {
        assert.ok(Object.values(grid[row][col]).every(Number.isFinite));
        if (progress === 0 || progress === 1) {
          const sign = dir === 1 ? 1 - 2 * progress : 2 * progress - 1;
          pointClose(grid[row][col], { x: col / 6 * p.width * sign, y: row / 3 * p.height, z: 0 });
        }
      }
    }
  }
});

test('grab correction keeps shared diagonals and neighboring facet edges continuous', () => {
  assert.equal(typeof paperGrid, 'function');
  for (const dir of [1, -1]) for (const progress of [0, .15, .499, .5, .501, .85, 1]) {
    const p = pose(progress, dir, { x: .73, y: .88 }, -.2), cols = 6, rows = 3;
    const grid = paperGrid(p, cols, rows, 2400), w = p.width / cols, h = p.height / rows;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const c = gridCorners(grid, col, row);
      const first = facetMatrix(c, false, w, h), second = facetMatrix(c, true, w, h);
      assert.ok(first.every(Number.isFinite) && second.every(Number.isFinite));
      for (const t of [0, .25, .5, .75, 1]) {
        pointClose(transform(first, w * (1 - t), h * t), transform(second, w * (1 - t), h * t));
        if (col < cols - 1) {
          const next = facetMatrix(gridCorners(grid, col + 1, row), false, w, h);
          pointClose(transform(second, w, t * h), transform(next, 0, t * h), 'corrected vertical seam');
        }
        if (row < rows - 1) {
          const next = facetMatrix(gridCorners(grid, col, row + 1), false, w, h);
          pointClose(transform(second, t * w, h), transform(next, t * w, 0), 'corrected horizontal seam');
        }
      }
    }
  }
});
