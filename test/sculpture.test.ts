import { describe, it, expect } from 'vitest';
import { BoxGeometry } from 'three';
import { buildSculpture, extrudeArtwork, voxelizeMesh, voxelizePlan, validatePlan, sculptureGrid } from '../src/core/sculpture';
import { BASE_GRAY, TRANS_CLEAR } from '../src/core/palette';
import type { RGBAImage } from '../src/core/detect';

const portrait = (transparent = false): RGBAImage => {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const foreground = x >= 4 && x < 12 && y >= 2 && y < 14;
    data.set(foreground ? [200, 30, 10, 255] : [255, 255, 255, transparent ? 0 : 255], (y * 16 + x) * 4);
  }
  return { width: 16, height: 16, data };
};
describe('upright artwork sculpture', () => {
  it('stands the silhouette upright and gives it true depth', () => {
    const s = extrudeArtwork(portrait(), 16, 8, false, true);
    expect([s.width, s.height, s.depth]).toEqual([8, 12, 8]);
    expect(s.voxels).toHaveLength(8 * 12 * 8);
    expect(sculptureGrid(s).cells).toHaveLength(12);
  });
  it('uses alpha without requiring background removal', () => {
    const s = extrudeArtwork(portrait(true), 16, 4, false, false);
    expect([s.width, s.height, s.depth]).toEqual([8, 12, 4]);
    expect(extrudeArtwork(portrait(), 16, 4, false, false).width).toBe(16);
  });
  it('rounds back edges while preserving every front pixel', () => {
    const s = extrudeArtwork(portrait(), 16, 8, true, true);
    expect(s.voxels.filter(v => v.z === 0)).toHaveLength(8 * 12);
    expect(s.voxels.length).toBeLessThan(8 * 12 * 8);
    expect(s.depth).toBe(8);
  });
  for (const size of ['mini', 'xl'] as const) it(`produces connected ${size} bricks and exact step/inventory counts`, () => {
    const m = buildSculpture(extrudeArtwork(portrait(), 16, 4, true, true), size);
    expect(m.checks).toMatchObject({ floating: 0, collisions: 0, com: { inside: true } });
    expect(m.bom.reduce((n, line) => n + line.qty, 0)).toBe(m.pieces.length);
    expect(m.steps.flat()).toEqual(m.pieces.map((_, i) => i));
    expect(m.layout).toBe('sculpture');
  });
  it('adds supports beneath disconnected details', () => {
    const m = buildSculpture({ width: 4, height: 4, depth: 2, source: 'test', voxels: [{ x: 0, y: 0, z: 0, color: BASE_GRAY }, { x: 3, y: 3, z: 1, color: 5 }] }, 'mini');
    expect(m.pieces.some(p => p.c === TRANS_CLEAR)).toBe(true);
    expect(m.checks).toMatchObject({ floating: 0, collisions: 0, com: { inside: true } });
  });
});

describe('mesh and AI sculpture input', () => {
  it('fills a closed cube, not just its surface', () => {
    const geometry = new BoxGeometry(2, 2, 2).toNonIndexed();
    const s = voxelizeMesh({ positions: geometry.getAttribute('position').array as Float32Array, colors: Array(12).fill('#ff0000') }, 16);
    expect([s.width, s.height, s.depth]).toEqual([16, 16, 16]);
    expect(s.voxels).toHaveLength(4096);
    expect(s.voxels.find(v => v.x === 8 && v.y === 8 && v.z === 8)?.color).toBe(BASE_GRAY);
    geometry.dispose();
  });
  it('rejects invalid or oversized mesh data', () => {
    expect(() => voxelizeMesh({ positions: new Float32Array([NaN, 0, 0]), colors: [] }, 16)).toThrow();
    expect(() => voxelizeMesh({ positions: new Float32Array(900009), colors: [] }, 16)).toThrow();
  });
  it('validates AI shapes without executing code', () => {
    expect(() => validatePlan({ shapes: [{ type: 'script', center: [0, 0, 0], size: [1, 1, 1], color: '#ffffff' }] })).toThrow();
    expect(() => validatePlan({ shapes: [{ type: 'box', center: [0, 0, 0], size: [-1, 1, 1], color: '#ffffff' }] })).toThrow();
    const s = voxelizePlan({ shapes: [{ type: 'ellipsoid', center: [0, 0, 0], size: [1, 1, 1], color: '#ff0000' }] }, 16);
    expect(s.width).toBe(8);
    expect(s.voxels.length).toBeLessThan(8 ** 3);
  });
});
