import { voxelizeMesh, voxelizePlan, extrudeArtwork, type MeshData, type ShapePlan } from '../core/sculpture';
import type { RGBAImage } from '../core/detect';
self.onmessage = (e: MessageEvent<{ mesh?: MeshData; plan?: ShapePlan; image?: RGBAImage; resolution: number; thickness: number; rounded: boolean; removeBackground: boolean }>) => {
  try {
    const { mesh, plan, resolution } = e.data;
    const sculpture = e.data.image ? extrudeArtwork(e.data.image, resolution, e.data.thickness, e.data.rounded, e.data.removeBackground) : mesh ? voxelizeMesh(mesh, resolution) : voxelizePlan(plan, resolution);
    self.postMessage({ ok: true, sculpture });
  } catch (e) { self.postMessage({ ok: false, message: (e as Error).message }); }
};
