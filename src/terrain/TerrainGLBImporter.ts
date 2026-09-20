import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { TerrainCatalog } from './TerrainCatalog';
import { TerrainSampler } from './TerrainSampler';
import type { DetectedTerrainMesh, TerrainData, TerrainDescriptor } from './TerrainTypes';
import { TerrainError } from './TerrainTypes';

const LAND_NAMES = /terrain|ground|land|landscape|island|mountain|hill/i;
const WATER_NAMES = /water|river|lake|ocean|sea/i;

export class TerrainGLBImporter {
  private readonly loader = new GLTFLoader();
  private readonly sampler = new TerrainSampler();
  constructor(private readonly catalog: TerrainCatalog) {}

  async import(descriptor: TerrainDescriptor, stage?: (message: string) => void, roleOverrides: Record<string, DetectedTerrainMesh['role']> = {}): Promise<TerrainData> {
    const sourceUrl = this.catalog.resolve(descriptor.source);
    stage?.('Loading GLB...');
    let scene: THREE.Group;
    try { scene = (await this.loader.loadAsync(sourceUrl)).scene; }
    catch (error) { throw new TerrainError('GLB_LOAD_FAILED', `Failed to load ${descriptor.name}`, { cause: error }); }
    scene.scale.setScalar(descriptor.scale ?? 1);
    if (descriptor.upAxis === 'z') scene.rotation.x = -Math.PI / 2;
    scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => { if (object instanceof THREE.Mesh && object.geometry.attributes.position) meshes.push(object); });
    if (meshes.length === 0) throw new TerrainError('NO_LAND_MESH', `${descriptor.name} contains no meshes.`);
    const hasWaterName = (mesh: THREE.Mesh): boolean => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return WATER_NAMES.test(mesh.name) || materials.some((material) => WATER_NAMES.test(material.name));
    };
    const roleOf = (mesh: THREE.Mesh): DetectedTerrainMesh['role'] => roleOverrides[mesh.name]
      ?? (hasWaterName(mesh) ? 'water' : LAND_NAMES.test(mesh.name) ? 'land' : 'ignore');
    let land = meshes.filter((mesh) => roleOf(mesh) === 'land');
    let water = meshes.filter((mesh) => roleOf(mesh) === 'water');
    const waterHint = meshes.some(hasWaterName);
    if (land.length === 0) {
      const candidates = meshes.filter((mesh) => !water.includes(mesh) && roleOverrides[mesh.name] !== 'ignore');
      const fallback = candidates.length ? candidates : water;
      land = fallback.length ? [fallback.reduce((largest, mesh) => {
        const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
        const largestSize = new THREE.Box3().setFromObject(largest).getSize(new THREE.Vector3());
        return size.x * size.z > largestSize.x * largestSize.z ? mesh : largest;
      })] : [];
      water = water.filter((mesh) => !land.includes(mesh));
      console.warn(`[${descriptor.id}] No named land mesh; using the largest X-Z mesh as land.`);
    }
    if (land.length === 0) throw new TerrainError('NO_LAND_MESH', `${descriptor.name} contains no usable land mesh.`);
    const rawBounds = new THREE.Box3();
    land.forEach((mesh) => rawBounds.expandByObject(mesh));
    const rawSize = rawBounds.getSize(new THREE.Vector3());
    if (Math.max(rawSize.x, rawSize.z) < 0.1 || Math.max(rawSize.x, rawSize.z) > 10000) console.warn(`[${descriptor.id}] Suspicious GLB bounds ${rawSize.x.toFixed(3)} × ${rawSize.z.toFixed(3)}m; configure descriptor.scale.`);
    const center = rawBounds.getCenter(new THREE.Vector3());
    scene.position.set(-center.x, -rawBounds.min.y, -center.z);
    scene.updateMatrixWorld(true);
    const normalizedBounds = new THREE.Box3();
    land.forEach((mesh) => normalizedBounds.expandByObject(mesh));
    const detectedMeshes: DetectedTerrainMesh[] = meshes.map((mesh) => ({ name: mesh.name || '(unnamed)', role: water.includes(mesh) ? 'water' : land.includes(mesh) ? 'land' : 'ignore', vertices: mesh.geometry.attributes.position.count }));
    stage?.('Sampling terrain...');
    try { return this.sampler.sample({ terrainId: descriptor.id, landMeshes: land, waterMeshes: water, bounds: normalizedBounds, resolution: descriptor.samplingResolution, sourceUrl, detectedMeshes, inferWater: descriptor.waterMode === 'infer' || (descriptor.waterMode !== 'none' && waterHint && water.length === 0) }); }
    catch (error) { if (error instanceof TerrainError) throw error; throw new TerrainError('SAMPLING_FAILED', `Sampling failed for ${descriptor.name}`, { cause: error }); }
  }
}
