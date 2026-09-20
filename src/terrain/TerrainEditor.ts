import * as THREE from 'three';
import { recomputeHeightRange, sampleTerrainHeight } from './TerrainDataUtils';
import type { TerrainData, TerrainEditTool } from './TerrainTypes';

export class TerrainEditor {
  tool: TerrainEditTool = 'raise';
  radius = 3;
  strength = 0.45;
  readonly cursor: THREE.Mesh;
  private flattenHeight = 0;

  constructor(private readonly data: TerrainData) {
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ color: 0x83b9a7, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
    this.cursor.rotation.x = -Math.PI / 2; this.cursor.visible = false; this.updateCursorScale();
  }
  beginStroke(x: number, z: number): void { this.flattenHeight = sampleTerrainHeight(this.data, x, z); }
  setRadius(value: number): void { this.radius = Math.max(0.5, value); this.updateCursorScale(); }
  moveCursor(x: number, z: number): void { const y = sampleTerrainHeight(this.data, x, z); this.cursor.visible = Number.isFinite(y); this.cursor.position.set(x, y + 0.08, z); }
  apply(x: number, z: number): boolean {
    let changed = false;
    for (let row = 0; row < this.data.rows; row += 1) for (let col = 0; col < this.data.cols; col += 1) {
      const px = this.data.origin.x + (col / (this.data.cols - 1)) * this.data.width;
      const pz = this.data.origin.z + (row / (this.data.rows - 1)) * this.data.depth;
      const distance = Math.hypot(px - x, pz - z); if (distance >= this.radius) continue;
      const falloff = Math.pow(1 - distance / this.radius, 2); const index = row * this.data.cols + col;
      const before = this.data.heights[index];
      if (this.tool === 'raise') this.data.heights[index] += this.strength * falloff;
      else if (this.tool === 'lower') this.data.heights[index] -= this.strength * falloff;
      else this.data.heights[index] += (this.flattenHeight - this.data.heights[index]) * Math.min(1, this.strength) * falloff;
      // Painting previously unsampled GLB padding creates real user-authored terrain.
      const newlySupported = Boolean(this.data.sampleCoverage && this.data.sampleCoverage[index] === 0 && falloff > 0.02);
      if (Math.abs(this.data.heights[index] - before) < 0.00001 && !newlySupported) continue;
      if (newlySupported) this.data.sampleCoverage![index] = 1;
      changed = true;
    }
    if (changed) { this.data.revision += 1; recomputeHeightRange(this.data); }
    return changed;
  }
  dispose(): void { this.cursor.geometry.dispose(); (this.cursor.material as THREE.Material).dispose(); this.cursor.removeFromParent(); }
  private updateCursorScale(): void { this.cursor.scale.setScalar(this.radius); }
}
