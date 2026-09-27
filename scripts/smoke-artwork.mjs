import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#build-mode').selectOption('artwork');
  const png = new PNG({ width: 120, height: 80 });
  for (let y = 0; y < 80; y++) for (let x = 0; x < 120; x++) {
    const o = (y * 120 + x) * 4;
    png.data.set([x * 2, y * 3, (x + y) % 256, 255], o);
  }
  await page.locator('#file').setInputFiles({ name: 'nft-landscape.png', mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await page.locator('#pill').filter({ hasText: 'Checked: solid' }).waitFor();
  await page.locator('#skip').click();
  if (!(await page.locator('#read-text').textContent()).includes('24 × 16')) throw new Error('Aspect ratio lost');
  await page.locator('#resolution').selectOption('32');
  await page.waitForFunction(() => document.querySelector('#read-text').textContent.includes('32 × 21') && document.querySelector('#busy').hidden);
  await page.locator('#skip').click();
  await page.locator('#depth').selectOption('1');
  await page.waitForFunction(() => document.querySelector('#busy').hidden);
  await page.locator('#skip').click();
  const download = page.waitForEvent('download');
  await page.locator('#dl-pdf').click();
  const pdf = await download;
  await mkdir('out', { recursive: true });
  await pdf.saveAs('out/artwork-instructions.pdf');
  await page.locator('#sec-bust').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'out/artwork-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'out/artwork-mobile.png' });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile overflow');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Upload, aspect ratio, resolution/depth rebuilds, solid checks, PDF download, and mobile layout passed.');
} finally { await browser.close(); }
