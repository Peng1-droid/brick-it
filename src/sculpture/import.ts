import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { MeshData, ShapePlan } from '../core/sculpture';

export async function importModel(file: File): Promise<THREE.Group> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Use a model smaller than 25 MB.');
  const group = new THREE.Group(), extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'glb') {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => { if (/^(blob:|data:)/.test(url)) return url; throw new Error('Use a self-contained GLB with embedded textures. External files are not loaded.'); });
    const gltf = await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(), '');
    group.add(gltf.scene);
  } else if (extension === 'obj') group.add(new OBJLoader().parse(await file.text()));
  else if (extension === 'stl') {
    const geometry = new STLLoader().parse(await file.arrayBuffer());
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#36AEBF', vertexColors: geometry.hasAttribute('color') })));
  } else throw new Error('Choose a GLB, OBJ or STL model.');
  let triangles = 0;
  group.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) throw new Error('Export a static, non-instanced mesh before importing.');
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
  });
  if (!triangles || triangles > 100_000) { disposeObject(group); throw new Error('Use a static model with 1–100,000 triangles.'); }
  return group;
}

/** Sample embedded texture and vertex colours at triangle centroids. */
export function meshData(group: THREE.Object3D): MeshData {
  group.updateMatrixWorld(true);
  const positions: number[] = [], colors: string[] = [];
  const images = new Map<THREE.Texture, ImageData>();
  group.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const geometry = mesh.geometry, pos = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), vertexColor = geometry.getAttribute('color');
    if (!pos) return;
    const count = geometry.index?.count ?? pos.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map(j => geometry.index ? geometry.index.getX(i + j) : i + j);
      for (const id of ids) { const v = new THREE.Vector3().fromBufferAttribute(pos, id).applyMatrix4(mesh.matrixWorld); positions.push(v.x, v.y, -v.z); }
      const materialIndex = geometry.groups.find(g => i >= g.start && i < g.start + g.count)?.materialIndex ?? 0;
      const material = (Array.isArray(mesh.material) ? mesh.material[materialIndex] : mesh.material) as THREE.MeshStandardMaterial;
      const color = material?.color?.clone() ?? new THREE.Color('#36AEBF');
      if (material?.vertexColors && vertexColor) {
        const rgb = [0, 1, 2].map(a => ids.reduce((sum, id) => sum + vertexColor.getComponent(id, a), 0) / 3);
        color.multiply(new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]));
      }
      const texture = material?.map;
      if (texture?.image && uv) {
        if (!images.has(texture)) {
          const source = texture.image as CanvasImageSource & { width: number; height: number };
          if (!source.width || !source.height) throw new Error('Unsupported texture. Export an uncompressed GLB with embedded PNG/JPEG textures.');
          const canvas = document.createElement('canvas'); canvas.width = Math.min(2048, source.width); canvas.height = Math.min(2048, source.height);
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(source, 0, 0, canvas.width, canvas.height); images.set(texture, ctx.getImageData(0, 0, canvas.width, canvas.height));
        }
        const image = images.get(texture)!, coord = new THREE.Vector2(ids.reduce((s, id) => s + uv.getX(id), 0) / 3, ids.reduce((s, id) => s + uv.getY(id), 0) / 3);
        texture.updateMatrix(); texture.transformUv(coord);
        const offset = (Math.min(image.height - 1, Math.max(0, Math.floor(coord.y * image.height))) * image.width + Math.min(image.width - 1, Math.max(0, Math.floor(coord.x * image.width)))) * 4;
        color.multiply(new THREE.Color().setRGB(image.data[offset] / 255, image.data[offset + 1] / 255, image.data[offset + 2] / 255, THREE.SRGBColorSpace));
      }
      colors.push('#' + color.getHexString());
    }
  });
  return { positions: new Float32Array(positions), colors };
}

export function planObject(plan: ShapePlan): THREE.Group {
  const group = new THREE.Group();
  for (const s of plan.shapes) {
    const geometry = s.type === 'box' ? new THREE.BoxGeometry(1, 1, 1) : s.type === 'ellipsoid' ? new THREE.SphereGeometry(0.5, 20, 12) : new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: s.color }));
    mesh.position.set(s.center[0], s.center[1], -s.center[2]); mesh.scale.set(s.size[0], s.size[1], s.size[2]); group.add(mesh);
  }
  return group;
}

export function disposeObject(object: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  object.traverse(o => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
      mat.dispose();
    }
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose();
  });
  textures.forEach(t => { t.dispose(); if (t.image instanceof ImageBitmap) t.image.close(); });
}
