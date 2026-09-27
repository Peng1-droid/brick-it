import { describe, it, expect } from 'vitest';
import { voxelizeArtwork, buildArtwork } from '../src/core/artwork';
import { partsCSV, brickLinkXML } from '../src/export/parts';

const image = (w: number, h: number, alpha = 255) => ({ width: w, height: h, data: Uint8ClampedArray.from(Array.from({ length: w * h }, (_, i) => [i % 256, (i * 19) % 256, (i * 37) % 256, alpha]).flat()) });

describe('general NFT artwork', () => {
  it('preserves landscape and portrait aspect ratios without requiring a Punk', () => {
    expect(voxelizeArtwork(image(100, 50)).cells).toHaveLength(12);
    expect(voxelizeArtwork(image(50, 100)).cells[0]).toHaveLength(12);
    expect(voxelizeArtwork(image(3, 1), 32).cells[0]).toHaveLength(32);
  });
  it('rejects empty images and invalid settings', () => {
    expect(() => voxelizeArtwork(image(20, 20, 0))).toThrow('transparent');
    expect(() => voxelizeArtwork(image(20, 20), 100)).toThrow('settings');
  });
  for (const size of ['mini', 'xl'] as const) for (const depth of [1, 4, 8]) {
    it(`builds connected ${size} relief at depth ${depth} with exact inventory`, () => {
      const m = buildArtwork(voxelizeArtwork(image(61, 37), 16, depth), size);
      expect(m.checks).toMatchObject({ floating: 0, collisions: 0, com: { inside: true } });
      expect(m.bom.reduce((n, p) => n + p.qty, 0)).toBe(m.pieces.length);
      expect(m.steps.flat().sort((a, b) => a - b)).toEqual(m.pieces.map((_, i) => i));
      expect(partsCSV(m)).toContain(String(m.bom[0].part));
      expect(brickLinkXML(m)).toContain('<INVENTORY>');
      expect(Math.max(...m.pieces.map(p => p.y + p.h))).toBeLessThanOrEqual(depth + 2);
    });
  }
  it('supports the LEGO availability option', () => {
    const m = buildArtwork(voxelizeArtwork(image(24, 24)), 'mini', true);
    expect(m.checks.floating).toBe(0);
    expect(m.checks.collisions).toBe(0);
  });
});
