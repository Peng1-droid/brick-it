import type { Kind } from '../core/parts';

// ---------- isometric part icons ----------
const KH: Record<Kind, number> = { brick: 1.2, plate: 0.4, tile: 0.4, slope: 0.8 };
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${k(n >> 16)},${k((n >> 8) & 255)},${k(n & 255)})`;
}
function isoPart(x: CanvasRenderingContext2D, X: number, Y: number, w: number, d: number, hex: string, s: number, kind: Kind) {
  const h = KH[kind], c30 = Math.cos(Math.PI / 6);
  const P = (a: number, y: number, z: number): [number, number] => [X + (a - z) * c30 * s, Y + (a + z) * 0.5 * s - y * s];
  const poly = (pts: [number, number][], fill: string) => {
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...p) : x.moveTo(...p))); x.closePath();
    x.fillStyle = fill; x.fill(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.stroke();
  };
  const dark = parseInt(hex.slice(1), 16) < 0x303030;
  const light = dark ? 2.2 : 1.12, side = dark ? 1.5 : 0.72;
  if (kind === 'slope') {
    poly([P(0, 0, d), P(w, 0, d), P(w, 0.1, d), P(0, h, d)], shade(hex, dark ? 1 : 0.9));
    poly([P(w, 0, 0), P(w, 0, d), P(w, 0.1, d), P(w, 0.1, 0)], shade(hex, side));
    poly([P(0, h, 0), P(0, h, d), P(w, 0.1, d), P(w, 0.1, 0)], shade(hex, light));
    return;
  }
  poly([P(0, h, 0), P(w, h, 0), P(w, h, d), P(0, h, d)], shade(hex, light));
  poly([P(0, 0, d), P(w, 0, d), P(w, h, d), P(0, h, d)], shade(hex, dark ? 1 : 0.9));
  poly([P(w, 0, 0), P(w, 0, d), P(w, h, d), P(w, h, 0)], shade(hex, side));
  if (kind !== 'tile') for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
    const [u, v] = P(i + 0.5, h, j + 0.5), rx = 0.3 * s * c30 * 1.41, ry = 0.3 * s * 0.5 * 1.41, sh = 0.17 * s;
    x.fillStyle = shade(hex, side); x.beginPath(); x.ellipse(u, v - sh, rx, ry, 0, 0, Math.PI * 2); x.rect(u - rx, v - sh, rx * 2, sh); x.fill();
    x.beginPath(); x.ellipse(u, v, rx, ry, 0, 0, Math.PI); x.fill();
    x.fillStyle = shade(hex, light * 1.08); x.beginPath(); x.ellipse(u, v - sh, rx, ry, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.3)'; x.stroke();
  }
}
export function icon(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, d: number, hex: string, maxW: number, kind: Kind) {
  const c30 = Math.cos(Math.PI / 6);
  const s = Math.min(13, maxW / ((w + d) * c30));
  const width = (w + d) * c30 * s, height = ((w + d) * 0.5 + KH[kind]) * s;
  isoPart(x, cx - width / 2 + d * c30 * s, cy - height / 2 + KH[kind] * s, w, d, hex, s, kind);
}

