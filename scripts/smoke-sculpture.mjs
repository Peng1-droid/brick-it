import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { mkdir } from 'node:fs/promises';
import { BoxGeometry } from 'three';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  const png = new PNG({ width: 32, height: 32 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const body = x >= 7 && x < 25 && y >= 3 && y < 29;
    const eye = y >= 10 && y < 13 && ((x >= 10 && x < 13) || (x >= 19 && x < 22));
    const mouth = y >= 20 && y < 22 && x >= 12 && x < 20;
    png.data.set(body ? (eye || mouth ? [25, 25, 25, 255] : [245, 190, 30, 255]) : [255, 255, 255, 0], (y * 32 + x) * 4);
  }
  await page.locator('#file').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await page.locator('#make-bricks:enabled').waitFor({ timeout: 30000 });
  const first = await page.locator('#sculpture-status').textContent();
  if (!first.includes('voxels')) throw new Error('No voxel preview');
  await page.locator('#sculpture-thickness').selectOption('12');
  if (!(await page.locator('#make-bricks').isDisabled())) throw new Error('Stale build was not invalidated');
  await page.locator('#voxelize').click();
  await page.locator('#make-bricks:enabled').waitFor();
  await page.locator('#sculpture-canvas').scrollIntoViewIfNeeded();
  await mkdir('out', { recursive: true });
  await page.screenshot({ path: 'out/sculpture-voxels.png' });
  await page.locator('#make-bricks').click();
  await page.locator('#pill').filter({ hasText: 'Checked: solid' }).waitFor({ timeout: 60000 });
  await page.locator('#skip').click();
  await page.locator('#view').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'out/sculpture-build.png' });
  const download = page.waitForEvent('download'); await page.locator('#dl-pdf').click(); await (await download).saveAs('out/sculpture-instructions.pdf');
  await page.locator('.sculpture-import summary').click();
  await page.locator('#sculpture-demo').click();
  await page.locator('#sculpture-detail').selectOption('16');
  await page.locator('#rotate-y').selectOption('90');
  await page.locator('#voxelize').click();
  await page.locator('#make-bricks:enabled').waitFor({ timeout: 30000 });
  await page.locator('#show-source').click(); await page.locator('#show-voxels').click();
  await page.locator('#make-bricks').click();
  await page.waitForFunction(() => document.querySelector('#sculpture-status').textContent.includes('Brick build created'), { timeout: 60000 });
  await page.locator('#skip').click();
  // Exercise actual binary GLB, OBJ and STL file loaders, not just the demo geometry.
  const geometry = new BoxGeometry(1, 2, 1).toNonIndexed();
  const vertices = geometry.getAttribute('position').array;
  const binary = Buffer.from(vertices.buffer, vertices.byteOffset, vertices.byteLength);
  const gltf = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.7, 0.9, 1] } }], buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length }], accessors: [{ bufferView: 0, componentType: 5126, count: vertices.length / 3, type: 'VEC3', min: [-0.5, -1, -0.5], max: [0.5, 1, 0.5] }] };
  const json = Buffer.from(JSON.stringify(gltf)); const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + padded.length + 8 + binary.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(padded.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binary.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  let obj = '', stl = 'solid cube\n';
  for (let i = 0; i < vertices.length; i += 3) obj += `v ${vertices[i]} ${vertices[i + 1]} ${vertices[i + 2]}\n`;
  for (let i = 0; i < vertices.length; i += 9) {
    obj += `f ${i / 3 + 1} ${i / 3 + 2} ${i / 3 + 3}\n`;
    stl += 'facet normal 0 0 1\nouter loop\n';
    for (let j = 0; j < 9; j += 3) stl += `vertex ${vertices[i + j]} ${vertices[i + j + 1]} ${vertices[i + j + 2]}\n`;
    stl += 'endloop\nendfacet\n';
  }
  stl += 'endsolid cube';
  for (const [name, buffer] of [['cube.glb', Buffer.concat([header, jh, padded, bh, binary])], ['cube.obj', Buffer.from(obj)], ['cube.stl', Buffer.from(stl)]]) {
    await page.locator('#model-file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
    await page.waitForFunction(name => document.querySelector('#sculpture-status').textContent.includes(`${name} loaded`), name);
    await page.locator('#voxelize').click(); await page.locator('#make-bricks:enabled').waitFor();
  }
  geometry.dispose();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#sculpture-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'out/sculpture-mobile.png' });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile overflow');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Upright cutout, depth edits, LEGO build, PDF, rotated demo, GLB/OBJ/STL imports, mobile and error checks passed.');
} finally { await browser.close(); }
