import { Box3, Triangle, Vector3 } from 'three';
import { BRICK_COLORS, BASE_GRAY, TRANS_CLEAR, COLOR_BY_ID } from './palette';
import { hexToRgb, rgbToLab, deltaE } from './color';
import type { PunkGrid } from './detect';
import type { Model, SizeId, BomLine } from './build';
import { key, tileLayer, type Layer } from './tile';
import { SIZES, partName, type Piece } from './parts';
import { checkModel } from './check';
import { availableAtLego } from './lego';
import { voxelizeArtwork } from './artwork';
import type { RGBAImage } from './detect';

export interface Voxel { x: number; y: number; z: number; color: number }
export interface Sculpture { voxels: Voxel[]; width: number; height: number; depth: number; source: string }
export interface MeshData { positions: Float32Array; colors: string[] }
export interface Shape { type: 'box' | 'ellipsoid' | 'cylinder'; center: number[]; size: number[]; color: string }
export interface ShapePlan { shapes: Shape[] }
const palette = BRICK_COLORS.filter(c => !c.trans).map(c => ({ ...c, lab: rgbToLab(hexToRgb(c.hex)) }));
const nearest = (hex: string) => {
  const lab = rgbToLab(hexToRgb(hex));
  return palette.reduce((a, b) => deltaE(lab, a.lab) < deltaE(lab, b.lab) ? a : b).id;
};
const validResolution = (n: number) => { if (![16, 24, 32].includes(n)) throw new Error('Choose 16, 24 or 32 voxels.'); };

/** Upright image silhouette with a flat coloured front and optional rounded back. */
export function extrudeArtwork(image: RGBAImage, resolution: number, thickness: number, rounded: boolean, removeBackground: boolean): Sculpture {
  validResolution(resolution);
  if (!Number.isInteger(thickness) || thickness < 2 || thickness > 16) throw new Error('Depth must be 2–16 voxels.');
  const grid = voxelizeArtwork(image, resolution), H = grid.cells.length, W = grid.cells[0].length;
  const mask = Array.from({ length: H }, () => Array(W).fill(true));
  const sample = (x: number, y: number) => {
    const sums = [0, 0, 0, 0]; let count = 0;
    for (let sy = Math.floor(y * image.height / H); sy < Math.ceil((y + 1) * image.height / H); sy++) for (let sx = Math.floor(x * image.width / W); sx < Math.ceil((x + 1) * image.width / W); sx++) {
      const o = (sy * image.width + sx) * 4; for (let i = 0; i < 4; i++) sums[i] += image.data[o + i]; count++;
    }
    return sums.map(v => v / count);
  };
  const samples = mask.map((row, y) => row.map((_, x) => sample(x, y)));
  samples.forEach((row, y) => row.forEach((p, x) => { if (p[3] < 96) mask[y][x] = false; }));
  if (removeBackground) {
    const bg = samples[0][0], queue: [number, number][] = [], seen = new Set<string>();
    const add = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H || seen.has(`${x},${y}`)) return;
      seen.add(`${x},${y}`);
      const p = samples[y][x];
      if (p[3] < 96 || (bg[3] >= 96 && p.slice(0, 3).every((v, i) => Math.abs(v - bg[i]) <= 35))) { mask[y][x] = false; queue.push([x, y]); }
    };
    for (let x = 0; x < W; x++) { add(x, 0); add(x, H - 1); }
    for (let y = 0; y < H; y++) { add(0, y); add(W - 1, y); }
    for (let i = 0; i < queue.length; i++) { const [x, y] = queue[i]; add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1); }
  }
  const colors = grid.colors.map(c => nearest('#' + c.rgb.map(v => v.toString(16).padStart(2, '0')).join('')));
  const voxels: Voxel[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y][x]) continue;
    let distance = Math.min(x + 1, y + 1, W - x, H - y);
    if (rounded) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (!mask[r][c]) distance = Math.min(distance, Math.hypot(x - c, y - r));
    const depth = rounded ? Math.max(2, Math.round(thickness * Math.sqrt(Math.min(1, distance / Math.max(2, thickness / 2))))) : thickness;
    for (let z = 0; z < depth; z++) voxels.push({ x, y: H - 1 - y, z, color: colors[grid.cells[y][x]] });
  }
  if (!voxels.length) throw new Error('No foreground remains. Turn off flat-background removal or use a transparent cutout.');
  return trim(voxels, 'Upright artwork with added depth');
}

/** Only bounded declarative geometry is accepted from AI; never execute generated code. */
export function validatePlan(value: unknown): ShapePlan {
  const p = value as ShapePlan;
  if (!p || !Array.isArray(p.shapes) || !p.shapes.length || p.shapes.length > 64) throw new Error('The sculpture must contain 1–64 shapes.');
  for (const s of p.shapes) {
    if (!s || !['box', 'ellipsoid', 'cylinder'].includes(s.type) || !/^#[0-9a-f]{6}$/i.test(s.color)) throw new Error('Invalid sculpture shape or colour.');
    for (const field of ['center', 'size'] as const) if (!Array.isArray(s[field]) || s[field].length !== 3 || s[field].some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Invalid shape coordinates.');
    if (s.center.some(v => Math.abs(v) > 1) || s.size.some(v => v <= 0 || v > 2)) throw new Error('Shape coordinates exceed the allowed range.');
  }
  return p;
}

export function voxelizePlan(value: unknown, resolution: number): Sculpture {
  validResolution(resolution);
  const plan = validatePlan(value), voxels: Voxel[] = [];
  const colors = plan.shapes.map(s => nearest(s.color));
  for (let y = 0; y < resolution; y++) for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) {
    let color: number | undefined;
    plan.shapes.forEach((s, i) => {
      const q = [x, y, z].map((v, a) => ((v + 0.5) / resolution * 2 - 1 - s.center[a]) / (s.size[a] / 2));
      const hit = s.type === 'box' ? q.every(v => Math.abs(v) <= 1) : s.type === 'ellipsoid' ? q.reduce((n, v) => n + v * v, 0) <= 1 : Math.abs(q[1]) <= 1 && q[0] * q[0] + q[2] * q[2] <= 1;
      if (hit) color = colors[i];
    });
    if (color !== undefined) voxels.push({ x, y, z, color });
  }
  return trim(voxels, 'AI shape interpretation');
}

/** Conservative triangle/box intersections preserve thin surfaces. Flood fill seals closed meshes. */
export function voxelizeMesh(mesh: MeshData, resolution: number): Sculpture {
  validResolution(resolution);
  const a = mesh.positions;
  if (!a.length || a.length % 9 || a.length > 900_000 || mesh.colors.length !== a.length / 9 || a.some(v => !Number.isFinite(v))) throw new Error('Use a mesh with 1–100,000 triangles and finite coordinates.');
  const bounds = new Box3();
  for (let i = 0; i < a.length; i += 3) bounds.expandByPoint(new Vector3(a[i], a[i + 1], a[i + 2]));
  const extent = bounds.getSize(new Vector3()), span = Math.max(extent.x, extent.y, extent.z);
  if (span < 1e-9) throw new Error('This model has no measurable size.');
  const scale = (resolution - 0.02) / span, n = resolution, cells = new Int16Array(n ** 3).fill(-1);
  const index = (x: number, y: number, z: number) => (y * n + z) * n + x;
  const triangle = new Triangle(), box = new Box3(), colorCache = new Map<string, number>();
  let operations = 0;
  for (let i = 0; i < a.length; i += 9) {
    [triangle.a, triangle.b, triangle.c].forEach((v, j) => v.set(a[i + j * 3], a[i + j * 3 + 1], a[i + j * 3 + 2]).sub(bounds.min).multiplyScalar(scale).addScalar(0.01));
    const lo = new Vector3().copy(triangle.a).min(triangle.b).min(triangle.c).floor();
    const hi = new Vector3().copy(triangle.a).max(triangle.b).max(triangle.c).floor();
    const hex = mesh.colors[i / 9];
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Invalid mesh colour.');
    if (!colorCache.has(hex)) colorCache.set(hex, nearest(hex));
    for (let y = lo.y; y <= hi.y; y++) for (let z = lo.z; z <= hi.z; z++) for (let x = lo.x; x <= hi.x; x++) {
      if (++operations > 25_000_000) throw new Error('This mesh is too complex. Simplify it or choose lower detail.');
      if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) continue;
      box.min.set(x, y, z); box.max.set(x + 1, y + 1, z + 1);
      if (box.intersectsTriangle(triangle)) cells[index(x, y, z)] = colorCache.get(hex)!;
    }
  }
  const outside = new Uint8Array(cells.length), queue: number[] = [];
  const add = (x: number, y: number, z: number) => {
    const i = index(x, y, z);
    if (cells[i] < 0 && !outside[i]) { outside[i] = 1; queue.push(i); }
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { add(0, i, j); add(n - 1, i, j); add(i, 0, j); add(i, n - 1, j); add(i, j, 0); add(i, j, n - 1); }
  for (let p = 0; p < queue.length; p++) {
    const i = queue[p], x = i % n, z = Math.floor(i / n) % n, y = Math.floor(i / n / n);
    if (x) add(x - 1, y, z); if (x < n - 1) add(x + 1, y, z);
    if (y) add(x, y - 1, z); if (y < n - 1) add(x, y + 1, z);
    if (z) add(x, y, z - 1); if (z < n - 1) add(x, y, z + 1);
  }
  const voxels: Voxel[] = [];
  for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const i = index(x, y, z);
    if (cells[i] >= 0 || !outside[i]) voxels.push({ x, y, z, color: cells[i] >= 0 ? cells[i] : BASE_GRAY });
  }
  return trim(voxels, 'Imported 3D mesh');
}

function trim(voxels: Voxel[], source: string): Sculpture {
  if (!voxels.length) throw new Error('No voxels were found. Increase detail or use a thicker model.');
  const min = ['x', 'y', 'z'].map(a => Math.min(...voxels.map(v => v[a as 'x'])));
  const max = ['x', 'y', 'z'].map(a => Math.max(...voxels.map(v => v[a as 'x'])));
  return { voxels: voxels.map(v => ({ ...v, x: v.x - min[0], y: v.y - min[1], z: v.z - min[2] })), width: max[0] - min[0] + 1, height: max[1] - min[1] + 1, depth: max[2] - min[2] + 1, source };
}

export function sculptureGrid(sculpture: Sculpture): PunkGrid {
  const cells = Array.from({ length: sculpture.height }, () => Array(sculpture.width).fill(-1));
  const colors: PunkGrid['colors'] = [], ids = new Map<number, number>();
  // The build viewer negates z, so the front view uses the smallest model z.
  [...sculpture.voxels].sort((a, b) => b.z - a.z).forEach(v => {
    if (!ids.has(v.color)) { ids.set(v.color, colors.length); colors.push({ rgb: hexToRgb(COLOR_BY_ID.get(v.color)!.hex), count: 0 }); }
    const id = ids.get(v.color)!; colors[id].count++; cells[sculpture.height - 1 - v.y][v.x] = id;
  });
  return { sculpture, cells, colors, background: null, box: { x: 0, y: 0, size: sculpture.width } };
}

export function buildSculpture(s: Sculpture, size: SizeId, preferLego = false): Model {
  const sx = size === 'xl' ? 2 : 1, W = s.width * sx, D = s.depth * sx;
  const rows = Array.from({ length: s.height }, () => new Map<number, number>());
  for (const v of s.voxels) rows[v.y].set(key(v.x, v.z), v.color);
  let supports = 0;
  // Every occupied column is supported down to the base, including disconnected mesh islands.
  for (let y = rows.length - 1; y > 0; y--) for (const k of rows[y].keys()) if (!rows[y - 1].has(k)) { rows[y - 1].set(k, TRANS_CLEAR); supports++; }
  const pieces: Piece[] = [], steps: number[][] = [];
  let yPlate = 0, below: Set<number> | undefined;
  const add = (cells: Layer, kind: 'brick' | 'plate', group: 'base' | 'body') => {
    const h = kind === 'brick' ? 3 : 1;
    const layer = tileLayer(cells, { kind, y: yPlate, h, prefX: steps.length % 2 === 0, sizes: SIZES, below, group, allow: preferLego ? availableAtLego : undefined });
    steps.push(layer.map((_, i) => pieces.length + i)); pieces.push(...layer); yPlate += h; below = new Set(cells.keys());
    if (pieces.length > 30_000) throw new Error('This build exceeds 30,000 pieces. Choose Mini or lower detail.');
  };
  const base: Layer = new Map();
  for (let z = -1; z <= D; z++) for (let x = -1; x <= W; x++) base.set(key(x, z), { c: BASE_GRAY, vis: true });
  add(base, 'plate', 'base'); add(base, 'plate', 'base');
  rows.forEach((row, y) => {
    const cells: Layer = new Map();
    for (let z = 0; z < s.depth; z++) for (let x = 0; x < s.width; x++) {
      const c = row.get(key(x, z)); if (c === undefined) continue;
      for (let dx = 0; dx < sx; dx++) for (let dz = 0; dz < sx; dz++) cells.set(key(x * sx + dx, z * sx + dz), { c, vis: true });
    }
    // A voxel is 2.5 plates per stud on average, preserving physical proportions.
    if (sx === 2 || y % 2 === 0) add(cells, 'brick', 'body');
    if (sx === 2 || y % 2 === 1) { add(cells, 'plate', 'body'); add(cells, 'plate', 'body'); }
  });
  const bom = new Map<string, BomLine>(), colors: Record<number, string> = {};
  for (const p of pieces) {
    const c = COLOR_BY_ID.get(p.c)!, k = `${p.part}|${p.c}`;
    const line = bom.get(k) ?? { part: p.part, kind: p.kind, name: partName(p.kind, p.w, p.d), color: p.c, colorName: c.name, hex: c.hex, w: Math.min(p.w, p.d), d: Math.max(p.w, p.d), qty: 0 };
    line.qty++; bom.set(k, line); colors[p.c] = c.hex;
  }
  return { layout: 'sculpture', size, pieces, steps, bom: [...bom.values()], colors, checks: checkModel(pieces), dims: [(W + 2) * 0.8, (D + 2) * 0.8, yPlate * 0.32].map(v => Math.round(v * 10) / 10) as [number, number, number], notes: [`${s.source}: ${s.voxels.length.toLocaleString()} voxels.`, `${supports} clear support voxels added underneath overhangs and separate parts.`, 'Check the preview and support placement before ordering. Computer-checked, not physically build-tested.'] };
}
