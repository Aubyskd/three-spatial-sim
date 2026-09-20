import * as THREE from 'three';
import type { SemanticRegionData } from '../map/MapTypes';
import type { DetectedTerrainMesh, TerrainData } from './TerrainTypes';
import { TerrainError } from './TerrainTypes';

export interface TerrainSamplingInput {
  terrainId: string;
  landMeshes: THREE.Object3D[];
  waterMeshes: THREE.Object3D[];
  bounds: THREE.Box3;
  resolution: number;
  sourceUrl: string;
  detectedMeshes: DetectedTerrainMesh[];
  inferWater: boolean;
}

export class TerrainSampler {
  sample(input: TerrainSamplingInput): TerrainData {
    const size = input.bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.x) || !Number.isFinite(size.z) || size.x <= 0.01 || size.z <= 0.01) throw new TerrainError('INVALID_BOUNDS', `Invalid terrain bounds: ${size.x} × ${size.z}`);
    const rows = Math.max(8, input.resolution);
    const cols = Math.max(8, input.resolution);
    const heights = new Float32Array(rows * cols);
    const sampleCoverage = new Uint8Array(rows * cols);
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    let misses = 0;
    for (let row = 0; row < rows; row += 1) {
      const z = input.bounds.min.z + (row / (rows - 1)) * size.z;
      for (let col = 0; col < cols; col += 1) {
        const x = input.bounds.min.x + (col / (cols - 1)) * size.x;
        raycaster.set(new THREE.Vector3(x, input.bounds.max.y + Math.max(10, size.y), z), down);
        const hit = raycaster.intersectObjects(input.landMeshes, true)[0];
        const height = hit?.point.y ?? input.bounds.min.y;
        if (!hit) misses += 1;
        else sampleCoverage[row * cols + col] = 1;
        heights[row * cols + col] = height;
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
      }
    }
    if (misses === rows * cols) throw new TerrainError('SAMPLING_FAILED', 'All terrain sampling rays missed.');
    const waterGrid = input.waterMeshes.length ? this.sampleWaterGrid(input, size) : undefined;
    const waterRegions: SemanticRegionData[] = waterGrid ? input.waterMeshes.map((mesh, index) => {
      const bounds = new THREE.Box3().setFromObject(mesh);
      const waterSize = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      return { id: `water-${index + 1}`, type: 'water', walkable: false, movementCost: 1000, shape: { kind: 'rectangle', center: { x: center.x, z: center.z }, width: waterSize.x, depth: waterSize.z } };
    }) : [];
    const baseRegion: SemanticRegionData = { id: 'terrain-land', type: 'grass', walkable: true, movementCost: 1.3, shape: { kind: 'rectangle', center: { x: 0, z: 0 }, width: size.x, depth: size.z } };
    const supportedHeights = Array.from(heights).filter((_, index) => sampleCoverage[index] === 1).sort((a, b) => a - b);
    const inferredLevel = supportedHeights[Math.floor(supportedHeights.length * 0.1)] ?? minHeight;
    const waterMode = waterGrid ? 'explicit' : input.inferWater ? 'inferred' : 'none';
    return { terrainId: input.terrainId, width: size.x, depth: size.z, rows, cols, origin: { x: -size.x / 2, y: 0, z: -size.z / 2 }, heights, sampleCoverage, waterGrid, minHeight, maxHeight, source: { type: 'glb', url: input.sourceUrl, waterMode, waterLevel: waterMode === 'inferred' ? inferredLevel + Math.min(0.08, (maxHeight - minHeight) * 0.006) : undefined }, waterRegions, semanticRegions: [baseRegion, ...waterRegions], detectedMeshes: input.detectedMeshes, revision: 0 };
  }

  private sampleWaterGrid(input: TerrainSamplingInput, size: THREE.Vector3): TerrainData['waterGrid'] {
    const rows = Math.min(256, Math.max(32, (Math.max(8, input.resolution) - 1) * 2));
    const cols = rows;
    const mask = new Uint8Array(rows * cols);
    const heights = new Float32Array(rows * cols);
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const waterBounds = new THREE.Box3();
    for (const mesh of input.waterMeshes) waterBounds.expandByObject(mesh);
    const rayHeight = Math.max(input.bounds.max.y, waterBounds.max.y) + Math.max(10, size.y);
    // A double-sided ray is necessary for water planes exported with reversed winding.
    for (const object of input.waterMeshes) object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.side = THREE.DoubleSide;
    });
    for (let row = 0; row < rows; row += 1) {
      const z = input.bounds.min.z + ((row + 0.5) / rows) * size.z;
      for (let col = 0; col < cols; col += 1) {
        const x = input.bounds.min.x + ((col + 0.5) / cols) * size.x;
        raycaster.set(new THREE.Vector3(x, rayHeight, z), down);
        const hit = raycaster.intersectObjects(input.waterMeshes, true)[0];
        if (!hit) continue;
        const index = row * cols + col;
        mask[index] = 1;
        heights[index] = hit.point.y;
      }
    }
    return mask.some((value) => value === 1) ? { rows, cols, mask, heights } : undefined;
  }
}
