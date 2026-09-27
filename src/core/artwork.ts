import type { PunkGrid, RGBAImage } from './detect';
import { rgbToLab, deltaE, hexToRgb, type RGB } from './color';
import { BRICK_COLORS, COLOR_BY_ID, BASE_GRAY } from './palette';
import { type Model, type SizeId, type BomLine } from './build';
import { tileLayer, key, type Layer } from './tile';
import { SIZES, partName, type Piece } from './parts';
import { checkModel } from './check';
import { availableAtLego } from './lego';

const palette = BRICK_COLORS.filter(c => !c.trans).map(c => ({ ...c, rgb: hexToRgb(c.hex), lab: rgbToLab(hexToRgb(c.hex)) }));

/** Area-average the entire image, preserving aspect ratio and alpha on a white backing. */
export function voxelizeArtwork(img: RGBAImage, resolution = 24, depth = 4): PunkGrid {
  if (![16, 24, 32].includes(resolution) || !Number.isInteger(depth) || depth < 1 || depth > 8) throw new Error('Invalid artwork settings.');
  const { width: w, height: h, data } = img;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || data.length !== w * h * 4) throw new Error('Invalid image.');
  const scale = resolution / Math.max(w, h), W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale));
  const colors: PunkGrid['colors'] = [], ids = new Map<number, number>();
  let visible = false;
  const cells = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
    const sum = [0, 0, 0]; let weight = 0;
    const x0 = x * w / W, x1 = (x + 1) * w / W, y0 = y * h / H, y1 = (y + 1) * h / H;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const a = (Math.min(sx + 1, x1) - Math.max(sx, x0)) * (Math.min(sy + 1, y1) - Math.max(sy, y0));
      const o = (sy * w + sx) * 4, alpha = data[o + 3] / 255;
      if (alpha > 0) visible = true;
      for (let i = 0; i < 3; i++) sum[i] += a * (data[o + i] * alpha + 255 * (1 - alpha));
      weight += a;
    }
    const lab = rgbToLab(sum.map(v => Math.round(v / weight)) as RGB);
    const best = palette.reduce((a, b) => deltaE(lab, a.lab) <= deltaE(lab, b.lab) ? a : b);
    let id = ids.get(best.id);
    if (id === undefined) { id = colors.length; ids.set(best.id, id); colors.push({ rgb: best.rgb, count: 0 }); }
    colors[id].count++;
    return id;
  }));
  if (!visible) throw new Error('This image is fully transparent. Choose artwork with visible pixels.');
  return { cells, colors, background: null, box: { x: 0, y: 0, size: Math.max(w, h) }, artwork: { depth } };
}

/** A flat backing supports every voxel column; light colours rise higher. */
export function buildArtwork(grid: PunkGrid, size: SizeId, preferLego = false): Model {
  const sx = size === 'xl' ? 2 : 1, H = grid.cells.length, W = grid.cells[0].length;
  const depth = grid.artwork!.depth;
  const mapped = grid.colors.map(c => palette.reduce((a, b) => deltaE(rgbToLab(c.rgb), a.lab) <= deltaE(rgbToLab(c.rgb), b.lab) ? a : b));
  const heights = mapped.map(c => 1 + Math.round((0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2]) / 255 * (depth - 1)));
  const pieces: Piece[] = [], steps: number[][] = [];
  let below: Set<number> | undefined;
  for (let y = 0; y < depth + 2; y++) {
    const cells: Layer = new Map();
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const index = grid.cells[r][c];
      if (y >= 2 + heights[index]) continue;
      for (let dx = 0; dx < sx; dx++) for (let dz = 0; dz < sx; dz++) cells.set(key(c * sx + dx, r * sx + dz), { c: y < 2 ? BASE_GRAY : mapped[index].id, vis: true });
    }
    const layer = tileLayer(cells, { kind: 'plate', y, h: 1, prefX: y % 2 === 0, sizes: SIZES, below, group: y < 2 ? 'base' : 'body', allow: preferLego ? availableAtLego : undefined });
    if (layer.length) steps.push(layer.map((_, i) => pieces.length + i));
    pieces.push(...layer); below = new Set(cells.keys());
  }
  const bomMap = new Map<string, BomLine>(), colors: Record<number, string> = {};
  for (const p of pieces) {
    const c = COLOR_BY_ID.get(p.c)!, k = `${p.part}|${p.c}`;
    const line = bomMap.get(k) ?? { part: p.part, kind: p.kind, name: partName(p.kind, p.w, p.d), color: p.c, colorName: c.name, hex: c.hex, w: Math.min(p.w, p.d), d: Math.max(p.w, p.d), qty: 0 };
    line.qty++; bomMap.set(k, line); colors[p.c] = c.hex;
  }
  return { layout: 'relief', size, pieces, steps, bom: [...bomMap.values()], colors, checks: checkModel(pieces), dims: [W * sx * 0.8, H * sx * 0.8, (Math.max(...pieces.map(p => p.y)) + 1) * 0.32].map(v => Math.round(v * 10) / 10) as [number, number, number], notes: ['Artwork relief: brighter colours form taller voxel columns on a solid backing.', 'Depth is stylized from brightness, not inferred 3D geometry. Transparent pixels are composited on white.'] };
}
