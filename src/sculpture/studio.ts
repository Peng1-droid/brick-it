import * as THREE from 'three';
import { importModel, meshData, planObject } from './import';
import { SculpturePreview, voxelObject, disposeObject } from './preview';
import { sculptureGrid, validatePlan, type Sculpture } from '../core/sculpture';
import type { PunkGrid, RGBAImage } from '../core/detect';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export function setupSculpture(onBuild: (grid: PunkGrid) => Promise<void>) {
  let preview: SculpturePreview | undefined, source: THREE.Group | undefined, cubes: THREE.Group | undefined, sculpture: Sculpture | undefined;
  let generation = 0, worker: Worker | undefined, working = false;
  let imageSource: RGBAImage | undefined;
  let voxelTimeout: ReturnType<typeof setTimeout> | undefined;
  const status = (text: string) => { $('sculpture-status').textContent = text; };
  const show = (object: THREE.Object3D) => { preview ??= new SculpturePreview($('sculpture-canvas')); preview.show(object); };
  const busy = (value: boolean) => {
    working = value;
    document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('#sculpture-panel input, #sculpture-panel button, #sculpture-panel select').forEach(e => { e.disabled = value; });
    $('sculpture-panel').setAttribute('aria-busy', String(value));
    $<HTMLButtonElement>('make-bricks').disabled = value || !sculpture;
    $<HTMLButtonElement>('voxelize').disabled = value || (!source && !imageSource);
    $<HTMLButtonElement>('show-source').disabled = value || !source;
    $<HTMLButtonElement>('show-voxels').disabled = value || !cubes;
  };
  const invalidate = () => {
    generation++; worker?.terminate(); clearTimeout(voxelTimeout); sculpture = undefined;
    if (cubes) { if (source) show(source); else preview?.clear(); disposeObject(cubes); cubes = undefined; }
    busy(false);
  };
  const load = (object: THREE.Group, label: string) => {
    invalidate(); imageSource = undefined; if (source) disposeObject(source); source = object;
    for (const id of ['rotate-x', 'rotate-y', 'rotate-z']) $<HTMLSelectElement>(id).value = '0';
    show(source); busy(false); status(`${label} loaded. Orient the model, then preview voxels.`);
  };
  $('model-file').addEventListener('change', async () => {
    const input = $<HTMLInputElement>('model-file'), file = input.files?.[0]; if (!file) return;
    invalidate(); busy(true); status('Reading 3D model…');
    try { load(await importModel(file), file.name); }
    catch (e) { status((e as Error).message); }
    finally { input.value = ''; busy(false); }
  });
  for (const id of ['rotate-x', 'rotate-y', 'rotate-z']) $(id).addEventListener('change', () => {
    if (!source) return; invalidate();
    source.rotation.set(...(['rotate-x', 'rotate-y', 'rotate-z'].map(id => +$<HTMLSelectElement>(id).value * Math.PI / 180) as [number, number, number]));
    show(source); status('Orientation changed. Preview voxels to update the build.');
  });
  for (const id of ['sculpture-detail', 'sculpture-thickness', 'rounded-back', 'remove-background']) $(id).addEventListener('change', () => { invalidate(); status('Settings changed. Preview voxels again.'); });
  $('show-source').addEventListener('click', () => { if (source) show(source); });
  $('show-voxels').addEventListener('click', () => { if (cubes) show(cubes); });
  $('voxelize').addEventListener('click', () => {
    if ((!source && !imageSource) || working) return;
    invalidate(); busy(true); const run = generation; status('Filling the model with voxels…');
    try {
      const data = source ? meshData(source) : undefined;
      worker = new Worker(new URL('../worker/sculpture.worker.ts', import.meta.url), { type: 'module' });
      voxelTimeout = setTimeout(() => { if (run !== generation) return; worker?.terminate(); busy(false); status('Voxelization took too long. Use a simpler model or lower detail.'); }, 60_000);
      worker.onerror = () => { if (run !== generation) return; clearTimeout(voxelTimeout); worker?.terminate(); busy(false); status('Voxelization failed. Use a simpler model.'); };
      worker.onmessage = e => {
        if (run !== generation) return; clearTimeout(voxelTimeout); worker?.terminate();
        if (!e.data.ok) { busy(false); status(e.data.message); return; }
        sculpture = e.data.sculpture; cubes = voxelObject(sculpture!); show(cubes); busy(false);
        status(`${sculpture!.width} × ${sculpture!.height} × ${sculpture!.depth} · ${sculpture!.voxels.length.toLocaleString()} voxels. Review the shape, then create bricks. Clear supports will be added under overhangs.`);
      };
      worker.postMessage({ mesh: data, image: imageSource, resolution: +$<HTMLSelectElement>('sculpture-detail').value, thickness: +$<HTMLSelectElement>('sculpture-thickness').value, rounded: $<HTMLInputElement>('rounded-back').checked, removeBackground: $<HTMLInputElement>('remove-background').checked }, data ? [data.positions.buffer] : []);
    } catch (e) { busy(false); status((e as Error).message); }
  });
  $('make-bricks').addEventListener('click', async () => {
    if (!sculpture || working) return; busy(true); status('Fitting LEGO parts and checking connections…');
    try { await onBuild(sculptureGrid(sculpture)); status('Brick build created below. Review its structural checks and supports before ordering.'); }
    catch (e) { status((e as Error).message); }
    finally { busy(false); }
  });
  $('sculpture-demo').addEventListener('click', () => load(planObject({ shapes: [
    { type: 'box', center: [0, -0.3, 0], size: [0.65, 0.7, 0.45], color: '#36AEBF' },
    { type: 'box', center: [0, 0.35, 0], size: [0.9, 0.65, 0.65], color: '#F2CD37' },
    { type: 'box', center: [-0.22, 0.4, -0.34], size: [0.16, 0.16, 0.1], color: '#1B1B1B' },
    { type: 'box', center: [0.22, 0.4, -0.34], size: [0.16, 0.16, 0.1], color: '#1B1B1B' },
    { type: 'box', center: [-0.52, -0.1, 0], size: [0.4, 0.24, 0.3], color: '#36AEBF' },
    { type: 'box', center: [0.52, -0.1, 0], size: [0.4, 0.24, 0.3], color: '#36AEBF' },
  ] }), 'Demo robot'));
  $('generate-sculpture').addEventListener('click', async () => {
    const file = $<HTMLInputElement>('ai-image').files?.[0];
    if (!file) { status('Choose an NFT artwork image first.'); return; }
    invalidate(); const run = generation;
    busy(true); status('Sending your artwork to OpenRouter and generating a stylized sculpture…');
    try {
      const bmp = await createImageBitmap(file), scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
      const res = await fetch('/api/sculpture/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: c.toDataURL('image/png') }) });
      if (!res.headers.get('content-type')?.includes('application/json')) throw new Error('AI generation requires the local Brick It server with OpenRouter configured.');
      const result = await res.json(); if (!res.ok) throw new Error(result.error ?? 'Generation failed.');
      if (run !== generation) return;
      load(planObject(validatePlan(result.plan)), 'AI interpretation');
    } catch (e) { if (run === generation) status((e as Error).message); }
    finally { if (run === generation) busy(false); }
  });
  fetch('/api/sculpture/status').then(r => r.headers.get('content-type')?.includes('application/json') ? r.json() : { ready: false }).then(r => {
    $('ai-setup').textContent = r.ready ? 'OpenRouter is connected. Generating sends this image to your chosen model and uses your OpenRouter credits.' : 'To enable: set OPENROUTER_API_KEY and OPENROUTER_MODEL in .env.local, then restart the local app. Choose a model with image input and structured outputs. Static hosting supports local builds but not AI generation.';
  }).catch(() => { $('ai-setup').textContent = 'AI generation requires the local Brick It server. Model uploads work without it.'; });
  busy(false);
  return { setImage(image: RGBAImage) {
    invalidate(); if (source) { disposeObject(source); source = undefined; }
    imageSource = image; busy(false);
    status('Image ready. Preview your upright voxel bust; adjust its depth and background removal as needed.');
    $('sculpture-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('voxelize').click();
  } };
}
