import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLOR_BY_ID } from '../core/palette';
import type { Sculpture } from '../core/sculpture';
import { disposeObject } from './import';

export class SculpturePreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private current: THREE.Object3D | null = null;
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color('#e8f1f6');
    this.scene.add(this.root, new THREE.HemisphereLight(0xffffff, 0x6b7a88, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(5, 10, 8); this.scene.add(sun);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.renderer.setAnimationLoop(() => { if (canvas.getClientRects().length) { this.controls.update(); this.renderer.render(this.scene, this.camera); } });
  }
  private resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  show(object: THREE.Object3D) {
    this.root.clear(); this.current = object;
    this.root.position.set(0, 0, 0); this.root.scale.setScalar(1); this.root.add(object);
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object), center = box.getCenter(new THREE.Vector3());
    const span = Math.max(...box.getSize(new THREE.Vector3()).toArray()) || 1;
    this.root.position.copy(center).multiplyScalar(-1 / span); this.root.scale.setScalar(1 / span);
    this.root.updateMatrixWorld(true);
    this.camera.position.set(1.4, 1, 2.4); this.controls.target.set(0, 0, 0); this.controls.minDistance = 0.7; this.controls.maxDistance = 8;
    this.resize(); this.controls.update();
  }
  refresh() { if (this.current) this.show(this.current); }
  clear() { this.root.clear(); this.current = null; }
}

export function voxelObject(s: Sculpture): THREE.Group {
  const group = new THREE.Group(), byColor = new Map<number, typeof s.voxels>();
  for (const v of s.voxels) { if (!byColor.has(v.color)) byColor.set(v.color, []); byColor.get(v.color)!.push(v); }
  for (const [color, voxels] of byColor) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.96, 0.96), new THREE.MeshStandardMaterial({ color: COLOR_BY_ID.get(color)!.hex }), voxels.length);
    voxels.forEach((v, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(v.x, v.y, -v.z)));
    group.add(mesh);
  }
  return group;
}
export { disposeObject };
